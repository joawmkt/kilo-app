import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Endpoint TEMPORAL de diagnóstico (22/08/2026) — para ver, sin pelear con la
// consola de Twilio, qué pasó realmente con los últimos mensajes (entrantes
// y salientes) usando la propia API de Twilio con las credenciales que ya
// están cargadas en Vercel. Se puede borrar una vez resuelto el problema del
// audio de prueba que no recibió respuesta.
//
// Protegido con un secreto simple en la URL para que no quede abierto a
// cualquiera en internet (no es autenticación real, solo para no dejarlo
// totalmente público mientras esté en el repo).

const SECRETO_DEBUG = "carnicom-diag-2608";

export async function GET(request: NextRequest) {
  const secreto = request.nextUrl.searchParams.get("secreto");
  if (secreto !== SECRETO_DEBUG) {
    return NextResponse.json({ error: "falta o es incorrecto el parámetro ?secreto=" }, { status: 403 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return NextResponse.json(
      { error: "Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno de Vercel." },
      { status: 500 }
    );
  }

  try {
    const client = twilio(accountSid, authToken);

    // Primero confirmamos A QUÉ CUENTA pertenecen estas credenciales — así
    // podemos comparar directo contra lo que se ve en la consola del
    // navegador (nombre de la cuenta, si sigue en trial o no) sin tener que
    // comparar el Account SID letra por letra a mano.
    const cuenta = await client.api.v2010.accounts(accountSid).fetch();

    const mensajes = await client.messages.list({ limit: 20 });

    const resumen = mensajes.map((m) => ({
      fecha: m.dateCreated,
      direccion: m.direction, // "inbound" | "outbound-api" | "outbound-reply" | etc.
      de: m.from,
      para: m.to,
      cuerpo: m.body,
      status: m.status, // "received" | "sent" | "delivered" | "failed" | "undelivered" | etc.
      error_code: m.errorCode,
      error_message: m.errorMessage,
      num_media: m.numMedia,
    }));

    return NextResponse.json({
      ok: true,
      cuenta: {
        account_sid: cuenta.sid,
        nombre: cuenta.friendlyName,
        status: cuenta.status, // "active" | "suspended" | "closed"
        type: cuenta.type, // "Trial" | "Full"
      },
      cantidad: resumen.length,
      mensajes: resumen,
    });
  } catch (err) {
    return NextResponse.json({ error: `Error consultando la API de Twilio: ${String(err)}` }, { status: 500 });
  }
}
