import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import { registrarMensaje, aFormatoCanonico } from "@/lib/whatsapp";
import { escapeXml } from "@/lib/texto";
import type { MensajeEntranteNormalizado, TipoMensaje } from "@/lib/whatsapp/tipos";

// Webhook de WhatsApp por Twilio — el proveedor con el que arrancó el proyecto.
//
// Sigue funcionando igual que antes para las carnicerías que todavía no
// migraron a la API de Meta (ver /api/webhook/meta). Lo que cambió: la decisión
// de qué hacer con cada mensaje ya no vive acá, vive en
// src/lib/whatsapp/entrante.ts, compartida con el webhook de Meta. Así los dos
// caminos no se van separando con el tiempo.
//
// Diferencia que se mantiene: Twilio permite contestar con TwiML en el cuerpo
// de la misma respuesta HTTP, que es más simple y más barato que una segunda
// llamada a la API. Se conserva, y el texto de esa respuesta se registra en el
// hilo de la conversación para que el panel muestre el diálogo completo (antes
// las respuestas por TwiML no quedaban en ningún lado).

function twimlResponse(mensaje?: string): NextResponse {
  const cuerpo = mensaje ? `<Message>${escapeXml(mensaje)}</Message>` : "";
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${cuerpo}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    console.error("Falta TWILIO_AUTH_TOKEN en las variables de entorno");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // Twilio manda el mensaje como application/x-www-form-urlencoded.
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Reconstruimos la URL exacta que Twilio usó para poder validar la firma
  // (request.url puede no coincidir 1:1 detrás del proxy de Vercel).
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host");
  const url = `${proto}://${host}${request.nextUrl.pathname}`;

  const twilioSignature = request.headers.get("x-twilio-signature") ?? "";

  if (!twilio.validateRequest(authToken, twilioSignature, url, params)) {
    console.warn("Firma de Twilio inválida — mensaje descartado", { url });
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const telefonoOrigen = params.From ?? "desconocido";
  const telefonoDestino = params.To ?? "desconocido";
  const cuerpo = params.Body ?? null;
  const numMedia = Number(params.NumMedia ?? "0");
  const mediaUrl = numMedia > 0 ? params.MediaUrl0 ?? null : null;
  const mediaTipo = numMedia > 0 ? params.MediaContentType0 ?? null : null;
  const tipo: TipoMensaje = mediaUrl ? tipoDesdeMime(mediaTipo) : "texto";

  const supabaseAdmin = getSupabaseAdmin();

  // Si el número de destino ya está dado de alta como carnicería, lo linkeamos.
  const { data: carniceria } = await supabaseAdmin
    .from("carnicerias")
    .select("id, telefono_whatsapp")
    .eq("telefono_whatsapp", telefonoDestino)
    .maybeSingle();

  // Si el número no está asociado a ninguna carnicería, el mensaje se guarda
  // igual (queda el rastro) pero no hay catálogo contra el cual interpretarlo.
  if (!carniceria) {
    await supabaseAdmin.from("mensajes_whatsapp").insert({
      carniceria_id: null,
      telefono_origen: telefonoOrigen,
      telefono_destino: telefonoDestino,
      direccion: "entrante",
      tipo,
      cuerpo,
      media_url: mediaUrl,
      raw_payload: params,
    });
    return twimlResponse();
  }

  const mensaje: MensajeEntranteNormalizado = {
    telefono: aFormatoCanonico(telefonoOrigen),
    // Nombre de perfil de WhatsApp del remitente, cuando Twilio lo manda.
    nombrePerfil: params.ProfileName ?? null,
    tipo,
    texto: cuerpo,
    media: mediaUrl ? { proveedor: "twilio", referencia: mediaUrl, mimeType: mediaTipo } : null,
    proveedorMensajeId: params.MessageSid ?? null,
    esEcoDelNegocio: false,
    recibidoAt: new Date(),
  };

  try {
    const resultado = await procesarMensajeEntrante({
      carniceriaId: carniceria.id as string,
      telefonoCarniceria: carniceria.telefono_whatsapp as string,
      mensaje,
      rawPayload: params,
    });

    if (!resultado?.respuesta) return twimlResponse();

    // La respuesta sale por TwiML, así que no pasa por `enviarWhatsapp` y hay
    // que registrarla a mano para que el hilo del panel quede completo.
    await registrarRespuestaTwiml({
      carniceriaId: carniceria.id as string,
      telefonoCarniceria: carniceria.telefono_whatsapp as string,
      telefonoInterlocutor: mensaje.telefono,
      cuerpo: resultado.respuesta,
    });

    return twimlResponse(resultado.respuesta);
  } catch (err) {
    // Cualquier falla en la interpretación (Whisper/Claude caídos, etc.) no
    // debe tirar abajo el webhook — el mensaje ya quedó guardado arriba.
    console.error("Error procesando el mensaje entrante", err);
    return twimlResponse("Tuve un problema técnico procesando tu mensaje. Probá de nuevo en un rato.");
  }
}

async function registrarRespuestaTwiml(params: {
  carniceriaId: string;
  telefonoCarniceria: string;
  telefonoInterlocutor: string;
  cuerpo: string;
}): Promise<void> {
  try {
    await registrarMensaje({
      carniceriaId: params.carniceriaId,
      telefonoInterlocutor: params.telefonoInterlocutor,
      telefonoCarniceria: params.telefonoCarniceria,
      direccion: "saliente",
      tipo: "texto",
      cuerpo: params.cuerpo,
      origen: "bot",
      estadoEnvio: "enviado",
    });
  } catch (err) {
    console.error("No se pudo registrar la respuesta TwiML en el hilo", err);
  }
}

function tipoDesdeMime(mime: string | null): TipoMensaje {
  if (!mime) return "otro";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("application/")) return "documento";
  return "otro";
}

export async function GET() {
  // Para chequear rápido desde el navegador que la ruta está viva.
  return NextResponse.json({ ok: true, service: "carnicom whatsapp webhook (twilio)", etapa: 4 });
}
