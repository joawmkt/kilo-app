import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Webhook de WhatsApp (Twilio) — Etapa 1.
//
// Objetivo de esta etapa: que un mensaje de WhatsApp de prueba llegue
// a la base de datos. La interpretación de audio (Whisper) y la
// estructuración con Claude se agregan en la Etapa 2 — a propósito
// esta ruta todavía no hace nada de eso.

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

  const { error } = await supabaseAdmin.from("mensajes_whatsapp").insert({
    carniceria_id: carniceria?.id ?? null,
    telefono_origen: telefonoOrigen,
    telefono_destino: telefonoDestino,
    direccion: "entrante",
    tipo,
    cuerpo,
    media_url: mediaUrl,
    raw_payload: params,
  });

  if (error) {
    console.error("Error guardando el mensaje en Supabase", error);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  // TwiML vacío: por ahora no respondemos nada automático al cliente.
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

export async function GET() {
  // Para chequear rápido desde el navegador que la ruta está viva.
  return NextResponse.json({ ok: true, service: "carnicom whatsapp webhook" });
}
