// Descarga de audios recibidos por WhatsApp (Twilio aloja el archivo en su
// propia infraestructura; hace falta autenticarse con Account SID + Auth
// Token para poder bajarlo — el mismo Auth Token que ya se usa para validar
// la firma del webhook).

export async function descargarAudioTwilio(mediaUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno.");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    throw new Error(`No se pudo descargar el audio de Twilio (status ${res.status}).`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
