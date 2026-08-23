import twilio from "twilio";
import { getSupabaseAdmin } from "./supabaseAdmin";

// Etapa 3 — hasta ahora todo lo que el sistema "contestaba" era una
// respuesta TwiML al mismo mensaje entrante (siempre al mismo número que
// escribió). A partir de acá hace falta mandar mensajes salientes a un
// número DISTINTO del que originó el evento — ej. avisarle al carnicero de
// un pedido nuevo cuando quien escribió fue el cliente, o confirmarle al
// cliente cuando quien respondió "aprobar" fue el carnicero. Para eso se
// necesita la API REST de Twilio (no alcanza con TwiML), igual que ya usa
// /api/debug/twilio-logs para LEER mensajes.

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (client) return client;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno.");
  }
  client = twilio(accountSid, authToken);
  return client;
}

// Manda un mensaje de WhatsApp saliente y lo loguea en `mensajes_whatsapp`
// (misma tabla que los entrantes, con direccion="saliente") para que quede
// el mismo rastro completo que ya usa /api/debug/twilio-logs.
export async function enviarWhatsapp(params: {
  carniceriaId: string | null;
  desde: string; // ej "whatsapp:+14155238886" — el número de la carnicería
  hacia: string; // ej "whatsapp:+549XXXXXXXXXX"
  cuerpo: string;
}): Promise<void> {
  const { carniceriaId, desde, hacia, cuerpo } = params;

  try {
    await getClient().messages.create({ from: desde, to: hacia, body: cuerpo });
  } catch (err) {
    console.error("Error mandando WhatsApp saliente", { hacia, err });
    throw err;
  }

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("mensajes_whatsapp").insert({
    carniceria_id: carniceriaId,
    telefono_origen: desde,
    telefono_destino: hacia,
    direccion: "saliente",
    tipo: "texto",
    cuerpo,
  });
}
