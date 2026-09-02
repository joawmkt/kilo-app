import crypto from "crypto";
import { aWaId } from "./telefonos";
import type {
  MensajeEntranteNormalizado,
  ReferenciaMedia,
  ResultadoEnvio,
  TipoMensaje,
} from "./tipos";

// ============================================================
// Cliente de la WhatsApp Cloud API de Meta
// ============================================================
//
// Reemplaza a Twilio como intermediario (decisión del fundador, 30/08/2026:
// "vamos a hacernos tech provider nosotros"). Ver el análisis completo en
// claude/meta_whatsapp_api_referencia.md — en particular:
//
//   - En las llamadas se usa el PHONE NUMBER ID, no el número telefónico. Un ID
//     viejo apuntado en la configuración es la causa más común de "dejó de
//     andar sin que nadie lo tocara".
//   - Los audios llegan como un media ID, no como archivo: hay que pedir la URL
//     y recién ahí bajar el archivo. Son 3 pasos, no 1, y la URL vence — no
//     sirve guardarla para bajarla más tarde.
//   - Fuera de la ventana de 24 horas solo se puede mandar una plantilla
//     aprobada. Un texto libre fuera de ventana falla en el envío.
//   - Desde el 1/10/2026 se cobra por mensaje: cada burbuja es un cargo. Por eso
//     el bot manda un solo mensaje por turno en vez de varios cortos seguidos.

const VERSION_GRAPH = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const BASE_GRAPH = `https://graph.facebook.com/${VERSION_GRAPH}`;

function tokenDeAcceso(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Falta META_ACCESS_TOKEN en las variables de entorno. Tiene que ser un token permanente de System User, no uno temporal de la consola (los temporales vencen en horas y el bot deja de andar sin aviso)."
    );
  }
  return token;
}

async function llamarGraph<T>(
  ruta: string,
  opciones: { metodo?: "GET" | "POST"; cuerpo?: unknown } = {}
): Promise<T> {
  const { metodo = "GET", cuerpo } = opciones;

  const respuesta = await fetch(`${BASE_GRAPH}/${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${tokenDeAcceso()}`,
      ...(cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    // Meta devuelve el detalle del problema en error.message / error.error_data.
    // Vale la pena propagarlo entero: "(#131047) Message failed to send because
    // more than 24 hours have passed" es un diagnóstico, "400 Bad Request" no.
    let detalle = texto;
    try {
      const json = JSON.parse(texto) as { error?: { message?: string; error_data?: { details?: string } } };
      detalle = json.error?.error_data?.details ?? json.error?.message ?? texto;
    } catch {
      // Si no es JSON, ya tenemos el texto crudo.
    }
    throw new Error(`Meta API ${respuesta.status}: ${detalle}`);
  }

  return JSON.parse(texto) as T;
}

// ============================================================
// ENVÍO
// ============================================================

type RespuestaEnvio = { messages?: { id: string }[] };

/** Manda un mensaje de texto libre. Solo funciona dentro de la ventana de 24 horas. */
export async function enviarTextoMeta(params: {
  phoneNumberId: string;
  para: string;
  cuerpo: string;
}): Promise<ResultadoEnvio> {
  const { phoneNumberId, para, cuerpo } = params;

  try {
    const respuesta = await llamarGraph<RespuestaEnvio>(`${phoneNumberId}/messages`, {
      metodo: "POST",
      cuerpo: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: aWaId(para),
        type: "text",
        // preview_url en false: el bot no manda links, y una vista previa
        // inesperada agranda la burbuja sin aportar nada.
        text: { preview_url: false, body: cuerpo },
      },
    });

    return { ok: true, proveedorMensajeId: respuesta.messages?.[0]?.id ?? null, error: null };
  } catch (err) {
    return { ok: false, proveedorMensajeId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Manda una plantilla aprobada. Es la ÚNICA forma de escribirle a alguien fuera
 * de la ventana de 24 horas (ej. el recordatorio de retiro de un pedido hecho
 * ayer).
 */
export async function enviarPlantillaMeta(params: {
  phoneNumberId: string;
  para: string;
  nombrePlantilla: string;
  idioma?: string;
  /** Valores de {{1}}, {{2}}... en orden. */
  variables?: string[];
}): Promise<ResultadoEnvio> {
  const { phoneNumberId, para, nombrePlantilla, idioma = "es_AR", variables = [] } = params;

  try {
    const respuesta = await llamarGraph<RespuestaEnvio>(`${phoneNumberId}/messages`, {
      metodo: "POST",
      cuerpo: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: aWaId(para),
        type: "template",
        template: {
          name: nombrePlantilla,
          language: { code: idioma },
          components: variables.length
            ? [
                {
                  type: "body",
                  parameters: variables.map((valor) => ({ type: "text", text: valor })),
                },
              ]
            : [],
        },
      },
    });

    return { ok: true, proveedorMensajeId: respuesta.messages?.[0]?.id ?? null, error: null };
  } catch (err) {
    return { ok: false, proveedorMensajeId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Marca un mensaje entrante como leído (los dos tildes azules del lado del
 * cliente). Es cortesía, no es obligatorio: si falla, no pasa nada.
 */
export async function marcarLeidoMeta(params: {
  phoneNumberId: string;
  mensajeId: string;
}): Promise<void> {
  try {
    await llamarGraph(`${params.phoneNumberId}/messages`, {
      metodo: "POST",
      cuerpo: { messaging_product: "whatsapp", status: "read", message_id: params.mensajeId },
    });
  } catch (err) {
    console.error("No se pudo marcar el mensaje como leído en Meta", err);
  }
}

// ============================================================
// MEDIA (audios) — tres pasos, no uno
// ============================================================

/**
 * Baja un archivo a partir de su media ID.
 *
 * Paso 1: pedirle a Meta la URL del archivo.
 * Paso 2: bajar el archivo de esa URL, autenticado con el mismo token.
 *
 * ⚠️ La URL del paso 1 es temporal. Guardarla en la base para bajar el archivo
 * más tarde falla — hay que bajarlo en el momento.
 */
export async function descargarMediaMeta(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const info = await llamarGraph<{ url: string; mime_type: string }>(mediaId);

  const respuesta = await fetch(info.url, {
    headers: { Authorization: `Bearer ${tokenDeAcceso()}` },
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar el media de Meta (status ${respuesta.status}).`);
  }

  const arrayBuffer = await respuesta.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: info.mime_type };
}

// ============================================================
// WEBHOOK — verificación de firma y normalización del payload
// ============================================================

/**
 * Valida que el webhook lo mandó Meta y no cualquiera que descubrió la URL.
 * Meta firma el cuerpo CRUDO con el app secret (HMAC-SHA256) y lo manda en el
 * header `x-hub-signature-256`.
 *
 * Importante: hay que firmar el cuerpo tal cual llegó, byte por byte. Si se
 * parsea el JSON y se vuelve a serializar, la firma no coincide nunca.
 */
export function verificarFirmaMeta(cuerpoCrudo: string, headerFirma: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.error("Falta META_APP_SECRET — no se puede validar la firma del webhook.");
    return false;
  }
  if (!headerFirma?.startsWith("sha256=")) return false;

  const esperada = crypto.createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest("hex");
  const recibida = headerFirma.slice("sha256=".length);

  const bufEsperada = Buffer.from(esperada, "hex");
  const bufRecibida = Buffer.from(recibida, "hex");
  if (bufEsperada.length !== bufRecibida.length) return false;

  return crypto.timingSafeEqual(bufEsperada, bufRecibida);
}

/** Responde el desafío de verificación que Meta manda al dar de alta el webhook. */
export function resolverDesafioVerificacion(parametros: URLSearchParams): string | null {
  const tokenEsperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!tokenEsperado) return null;

  if (
    parametros.get("hub.mode") === "subscribe" &&
    parametros.get("hub.verify_token") === tokenEsperado
  ) {
    return parametros.get("hub.challenge");
  }
  return null;
}

// ------------------------------------------------------------
// Forma del payload entrante
// ------------------------------------------------------------

type MensajeMeta = {
  from?: string;
  to?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

type EstadoMeta = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { title?: string; message?: string }[];
};

export type CambioMeta = {
  /** Phone Number ID del número de la carnicería que recibió el mensaje. */
  phoneNumberId: string | null;
  mensajes: MensajeEntranteNormalizado[];
  estados: { proveedorMensajeId: string; estado: string; error: string | null }[];
};

const TIPOS_CON_MEDIA = new Set(["audio", "image", "video", "document", "sticker"]);

function tipoNormalizado(tipo: string | undefined): TipoMensaje {
  switch (tipo) {
    case "text":
      return "texto";
    case "audio":
      return "audio";
    case "image":
      return "imagen";
    case "video":
      return "video";
    case "document":
      return "documento";
    case "sticker":
      return "sticker";
    case "location":
      return "ubicacion";
    case "template":
      return "plantilla";
    default:
      return "otro";
  }
}

function textoDelMensaje(mensaje: MensajeMeta): string | null {
  return (
    mensaje.text?.body ??
    mensaje.interactive?.button_reply?.title ??
    mensaje.interactive?.list_reply?.title ??
    mensaje.button?.text ??
    mensaje.image?.caption ??
    mensaje.video?.caption ??
    mensaje.document?.caption ??
    null
  );
}

function mediaDelMensaje(mensaje: MensajeMeta): ReferenciaMedia | null {
  if (!mensaje.type || !TIPOS_CON_MEDIA.has(mensaje.type)) return null;

  const adjunto =
    mensaje.audio ?? mensaje.image ?? mensaje.video ?? mensaje.document ?? mensaje.sticker;
  if (!adjunto?.id) return null;

  return { proveedor: "meta", referencia: adjunto.id, mimeType: adjunto.mime_type ?? null };
}

/**
 * Aplana el payload del webhook a algo con lo que se pueda trabajar.
 *
 * Meta anida todo en entry[].changes[].value, y en un mismo POST pueden venir
 * mensajes de más de un número (con Tech Provider, de más de una carnicería) y
 * avisos de estado mezclados con mensajes nuevos.
 *
 * El campo `message_echoes` es el de coexistencia: son los mensajes que el
 * carnicero mandó DESDE SU CELULAR, espejados acá. Hay que guardarlos para que
 * el hilo del panel esté completo, pero jamás contestarlos — ya contestó una
 * persona.
 */
export function normalizarWebhookMeta(payload: unknown): CambioMeta[] {
  const cuerpo = payload as {
    object?: string;
    entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[];
  };

  if (cuerpo?.object !== "whatsapp_business_account") return [];

  const resultado: CambioMeta[] = [];

  for (const entrada of cuerpo.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const valor = cambio.value ?? {};
      const esEco = cambio.field === "message_echoes";

      const metadata = valor.metadata as { phone_number_id?: string } | undefined;
      const contactos = (valor.contacts ?? []) as { wa_id?: string; profile?: { name?: string } }[];
      const mensajesCrudos = ((esEco ? valor.message_echoes : valor.messages) ?? []) as MensajeMeta[];
      const estadosCrudos = (valor.statuses ?? []) as EstadoMeta[];

      const nombrePorWaId = new Map<string, string>();
      for (const contacto of contactos) {
        if (contacto.wa_id && contacto.profile?.name) {
          nombrePorWaId.set(contacto.wa_id, contacto.profile.name);
        }
      }

      const mensajes: MensajeEntranteNormalizado[] = [];
      for (const mensaje of mensajesCrudos) {
        // En un eco, el interlocutor es el DESTINATARIO (el mensaje salió del
        // negocio); en un mensaje normal, es el remitente.
        const interlocutor = esEco ? mensaje.to : mensaje.from;
        if (!interlocutor) continue;

        mensajes.push({
          telefono: interlocutor,
          nombrePerfil: nombrePorWaId.get(interlocutor) ?? null,
          tipo: tipoNormalizado(mensaje.type),
          texto: textoDelMensaje(mensaje),
          media: mediaDelMensaje(mensaje),
          proveedorMensajeId: mensaje.id ?? null,
          esEcoDelNegocio: esEco,
          recibidoAt: mensaje.timestamp ? new Date(Number(mensaje.timestamp) * 1000) : new Date(),
        });
      }

      const estados = estadosCrudos
        .filter((estado): estado is EstadoMeta & { id: string } => Boolean(estado.id))
        .map((estado) => ({
          proveedorMensajeId: estado.id,
          estado: estado.status ?? "desconocido",
          error: estado.errors?.[0]?.message ?? estado.errors?.[0]?.title ?? null,
        }));

      if (mensajes.length === 0 && estados.length === 0) continue;

      resultado.push({
        phoneNumberId: metadata?.phone_number_id ?? null,
        mensajes,
        estados,
      });
    }
  }

  return resultado;
}

/** Traduce el estado que manda Meta al vocabulario interno. */
export function estadoEnvioDesdeMeta(estado: string): "enviado" | "entregado" | "leido" | "fallido" | null {
  switch (estado) {
    case "sent":
      return "enviado";
    case "delivered":
      return "entregado";
    case "read":
      return "leido";
    case "failed":
      return "fallido";
    default:
      return null;
  }
}
