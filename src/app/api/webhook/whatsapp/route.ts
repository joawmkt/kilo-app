import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarAudioDeStock, procesarTextoEntrante } from "@/lib/flujoStock";
import { escapeXml } from "@/lib/texto";

// Webhook de WhatsApp (Twilio) — Etapa 2.
//
// Etapa 1: solo guardaba el mensaje crudo en `mensajes_whatsapp`.
// Etapa 2: si el mensaje entrante de la carnicería es un audio, se
// transcribe (Whisper), se interpreta (Claude Haiku) contra el catálogo
// real de esa carnicería, y se le pide confirmación antes de tocar
// `productos.stock_actual`. Si es texto y hay una actualización de stock
// pendiente de confirmación/aclaración, se procesa esa respuesta.

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

  const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);

  if (!isValid) {
    console.warn("Firma de Twilio inválida — mensaje descartado", { url });
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const telefonoOrigen = params.From ?? "desconocido";
  const telefonoDestino = params.To ?? "desconocido";
  const cuerpo = params.Body ?? null;
  const numMedia = Number(params.NumMedia ?? "0");
  const tipo = numMedia > 0 ? "audio" : "texto";
  const mediaUrl = numMedia > 0 ? params.MediaUrl0 ?? null : null;

  const supabaseAdmin = getSupabaseAdmin();

  // Si el número de destino ya está dado de alta como carnicería, lo linkeamos.
  const { data: carniceria } = await supabaseAdmin
    .from("carnicerias")
    .select("id")
    .eq("telefono_whatsapp", telefonoDestino)
    .maybeSingle();

  const { data: mensajeGuardado, error } = await supabaseAdmin
    .from("mensajes_whatsapp")
    .insert({
      carniceria_id: carniceria?.id ?? null,
      telefono_origen: telefonoOrigen,
      telefono_destino: telefonoDestino,
      direccion: "entrante",
      tipo,
      cuerpo,
      media_url: mediaUrl,
      raw_payload: params,
    })
    .select("id")
    .single();

  if (error || !mensajeGuardado) {
    console.error("Error guardando el mensaje en Supabase", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  // Si el número no está asociado a ninguna carnicería, el mensaje queda
  // logueado (arriba) pero no hay contra qué catálogo interpretarlo.
  if (!carniceria) {
    return twimlResponse();
  }

  try {
    if (tipo === "audio" && mediaUrl) {
      const respuesta = await procesarAudioDeStock({
        carniceriaId: carniceria.id,
        telefono: telefonoOrigen,
        mensajeWhatsappId: mensajeGuardado.id,
        mediaUrl,
      });
      return twimlResponse(respuesta);
    }

    if (tipo === "texto" && cuerpo) {
      const respuesta = await procesarTextoEntrante({
        carniceriaId: carniceria.id,
        telefono: telefonoOrigen,
        mensajeWhatsappId: mensajeGuardado.id,
        texto: cuerpo,
      });
      return twimlResponse(respuesta ?? undefined);
    }
  } catch (err) {
    // Cualquier falla en la interpretación (Whisper/Claude caídos, etc.) no
    // debe tirar abajo el webhook — el mensaje ya quedó guardado arriba.
    console.error("Error procesando el mensaje entrante", err);
    return twimlResponse("Tuve un problema técnico procesando tu mensaje. Probá de nuevo en un rato.");
  }

  return twimlResponse();
}

export async function GET() {
  // Para chequear rápido desde el navegador que la ruta está viva.
  return NextResponse.json({ ok: true, service: "carnicom whatsapp webhook", etapa: 2 });
}
