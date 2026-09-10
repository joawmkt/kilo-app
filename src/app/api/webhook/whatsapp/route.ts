import { NextRequest, NextResponse, after } from "next/server";
import twilio from "twilio";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import { aFormatoCanonico, enviarWhatsapp } from "@/lib/whatsapp";
import { escapeXml } from "@/lib/texto";
import type { MensajeEntranteNormalizado, TipoMensaje } from "@/lib/whatsapp/tipos";

// La ventana de agrupación (especificación, sección 34) hace que el trabajo en
// `after` dure unos segundos más de lo que duraba antes. El default de Vercel
// es corto; sin esto, un bloque con audio + interpretación puede cortarse por
// la mitad y el cliente se queda sin respuesta.
export const maxDuration = 60;

// Webhook de WhatsApp por Twilio — el proveedor con el que arrancó el proyecto.
//
// Sigue funcionando igual que antes para las carnicerías que todavía no
// migraron a la API de Meta (ver /api/webhook/meta). Lo que cambió: la decisión
// de qué hacer con cada mensaje ya no vive acá, vive en
// src/lib/whatsapp/entrante.ts, compartida con el webhook de Meta. Así los dos
// caminos no se van separando con el tiempo.
//
// Desde la Tanda 3 los dos webhooks se comportan igual: contestan enseguida y
// mandan la respuesta del bot como un mensaje aparte por la API. Antes acá se
// usaba TwiML (la respuesta viajaba en el mismo HTTP); ver el comentario largo
// más abajo para por qué la ventana de agrupación lo hizo inviable.

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

  // ------------------------------------------------------------
  // Se contesta primero y se trabaja después (igual que el webhook de Meta)
  // ------------------------------------------------------------
  //
  // Hasta la Tanda 3 este webhook contestaba con TwiML: la respuesta del bot
  // viajaba en el cuerpo de la misma respuesta HTTP. Eso dejó de servir cuando
  // entró la ventana de agrupación (especificación, sección 34): el bot ahora
  // espera unos segundos antes de contestar, y hay mensajes que directamente NO
  // se contestan porque se los lleva un bloque posterior. Con TwiML habría que
  // mantener abierta la conexión todo ese tiempo, y Twilio corta a los 15
  // segundos.
  //
  // Así que se hace lo mismo que con Meta: se responde el TwiML vacío en el
  // acto y el trabajo pesado va en `after`, mandando la respuesta como un
  // mensaje aparte por la API. `enviarWhatsapp` ya sabe hacerlo con Twilio, y
  // de yapa la respuesta queda registrada sola en el hilo del panel (con TwiML
  // había que registrarla a mano).
  after(async () => {
    try {
      const resultado = await procesarMensajeEntrante({
        carniceriaId: carniceria.id as string,
        telefonoCarniceria: carniceria.telefono_whatsapp as string,
        mensaje,
        rawPayload: params,
      });

      if (!resultado?.respuesta) return;

      await enviarWhatsapp({
        carniceriaId: carniceria.id as string,
        hacia: mensaje.telefono,
        cuerpo: resultado.respuesta,
        origen: "bot",
      });
    } catch (err) {
      // Cualquier falla en la interpretación (Whisper/Claude caídos, etc.) no
      // debe tirar abajo el webhook — el mensaje ya quedó guardado arriba.
      console.error("Error procesando el mensaje entrante", err);
      try {
        await enviarWhatsapp({
          carniceriaId: carniceria.id as string,
          hacia: mensaje.telefono,
          cuerpo: "Tuve un problema técnico procesando tu mensaje. Probá de nuevo en un rato.",
          origen: "bot",
        });
      } catch (err2) {
        console.error("Tampoco se pudo avisar del error al cliente", err2);
      }
    }
  });

  return twimlResponse();
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
  return NextResponse.json({ ok: true, service: "kilo whatsapp webhook (twilio)", etapa: 4 });
}
