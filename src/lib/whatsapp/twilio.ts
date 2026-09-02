import twilio from "twilio";
import { aFormatoCanonico } from "./telefonos";
import type { ResultadoEnvio } from "./tipos";

// Proveedor Twilio — el BSP con el que arrancó el proyecto en la Etapa 1.
//
// Se mantiene funcionando en paralelo a Meta durante la migración: la carnicería
// piloto puede seguir andando sobre Twilio mientras se completan los trámites de
// Meta (verificación de negocio, revisión de la app, Tech Provider), y el corte
// se hace carnicería por carnicería cambiando `carnicerias.whatsapp_proveedor`.
//
// Este archivo ya no guarda nada en la base: el registro de mensajes es
// responsabilidad de src/lib/whatsapp/conversaciones.ts, igual para los dos
// proveedores.

let cliente: ReturnType<typeof twilio> | null = null;

function getCliente() {
  if (cliente) return cliente;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno.");
  }
  cliente = twilio(accountSid, authToken);
  return cliente;
}

export async function enviarTextoTwilio(params: {
  desde: string;
  para: string;
  cuerpo: string;
}): Promise<ResultadoEnvio> {
  try {
    const mensaje = await getCliente().messages.create({
      from: aFormatoCanonico(params.desde),
      to: aFormatoCanonico(params.para),
      body: params.cuerpo,
    });
    return { ok: true, proveedorMensajeId: mensaje.sid, error: null };
  } catch (err) {
    return { ok: false, proveedorMensajeId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Twilio aloja el archivo en su propia infraestructura y hace falta
 * autenticarse con Account SID + Auth Token para bajarlo — el mismo Auth Token
 * que valida la firma del webhook.
 */
export async function descargarMediaTwilio(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Faltan TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN en las variables de entorno.");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const respuesta = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar el audio de Twilio (status ${respuesta.status}).`);
  }

  const arrayBuffer = await respuesta.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: respuesta.headers.get("content-type") ?? "audio/ogg",
  };
}
