import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { descargarMediaMeta, enviarPlantillaMeta, enviarTextoMeta } from "./meta";
import { descargarMediaTwilio, enviarTextoTwilio } from "./twilio";
import { obtenerOCrearConversacion, registrarMensaje, ventanaAbierta } from "./conversaciones";
import { aFormatoCanonico } from "./telefonos";
import type {
  ConfigWhatsapp,
  OrigenMensaje,
  ReferenciaMedia,
  ResultadoEnvio,
} from "./tipos";

// ============================================================
// Punto único de salida de WhatsApp
// ============================================================
//
// Todo el sistema manda mensajes por acá y no le importa qué hay atrás. La
// carnicería dice, en `carnicerias.whatsapp_proveedor`, si va por Twilio o por
// la API de Meta — así la migración se hace de a una y no como un corte global.
//
// Reemplaza a la vieja `src/lib/twilioEnviar.ts`, que hablaba con Twilio
// directamente y guardaba el mensaje ella misma.

export * from "./tipos";
export * from "./telefonos";
export {
  obtenerOCrearConversacion,
  registrarMensaje,
  marcarConversacionLeida,
  actualizarEstadoEnvio,
  ventanaAbierta,
  minutosRestantesDeVentana,
} from "./conversaciones";

/** Lee de la base cómo está conectada esta carnicería a WhatsApp. */
export async function resolverConfigWhatsapp(carniceriaId: string): Promise<ConfigWhatsapp> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("carnicerias")
    .select("id, whatsapp_proveedor, telefono_whatsapp, whatsapp_phone_number_id, whatsapp_waba_id")
    .eq("id", carniceriaId)
    .single();

  if (error || !data) {
    throw new Error(`No se pudo leer la configuración de WhatsApp de la carnicería: ${error?.message}`);
  }

  return {
    carniceriaId: data.id as string,
    proveedor: (data.whatsapp_proveedor as ConfigWhatsapp["proveedor"]) ?? "twilio",
    telefonoWhatsapp: (data.telefono_whatsapp as string | null) ?? null,
    phoneNumberId: (data.whatsapp_phone_number_id as string | null) ?? null,
    wabaId: (data.whatsapp_waba_id as string | null) ?? null,
  };
}

/** Busca la carnicería dueña de un Phone Number ID de Meta (enrutado del webhook). */
export async function carniceriaPorPhoneNumberId(phoneNumberId: string): Promise<{ id: string; telefono: string | null } | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data } = await supabaseAdmin
    .from("carnicerias")
    .select("id, telefono_whatsapp")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id as string, telefono: (data.telefono_whatsapp as string | null) ?? null };
}

// ============================================================
// ENVÍO
// ============================================================

export class ErrorEnvioWhatsapp extends Error {
  readonly fueraDeVentana: boolean;

  constructor(mensaje: string, fueraDeVentana = false) {
    super(mensaje);
    this.name = "ErrorEnvioWhatsapp";
    this.fueraDeVentana = fueraDeVentana;
  }
}

/**
 * Manda un mensaje de texto y lo deja registrado en el hilo de la conversación.
 *
 * Mantiene el contrato de la vieja `enviarWhatsapp` (lanza excepción si falla)
 * para no cambiar el manejo de errores del bot, pero ya no hace falta pasarle
 * `desde`: lo resuelve solo a partir de la carnicería.
 *
 * ⚠️ Sobre el costo: desde el 1/10/2026 Meta cobra por mensaje, así que cada
 * llamada a esta función es un cargo. El bot manda un solo mensaje por turno,
 * no varios cortos seguidos — cuatro burbujas son cuatro cargos por la misma
 * información.
 */
export async function enviarWhatsapp(params: {
  carniceriaId: string;
  hacia: string;
  cuerpo: string;
  origen?: OrigenMensaje;
  pedidoId?: string | null;
  clienteId?: string | null;
  esCarnicero?: boolean;
  /** Si el destinatario tiene la ventana de 24 h cerrada, mandar esta plantilla en vez del texto. */
  plantillaDeRespaldo?: { nombre: string; idioma?: string; variables?: string[] } | null;
}): Promise<ResultadoEnvio> {
  const config = await resolverConfigWhatsapp(params.carniceriaId);

  if (!config.telefonoWhatsapp) {
    throw new ErrorEnvioWhatsapp(
      "La carnicería no tiene número de WhatsApp configurado (carnicerias.telefono_whatsapp)."
    );
  }

  const hacia = aFormatoCanonico(params.hacia);
  let resultado: ResultadoEnvio;
  let tipo: "texto" | "plantilla" = "texto";
  let plantillaUsada: string | null = null;

  if (config.proveedor === "meta") {
    if (!config.phoneNumberId) {
      throw new ErrorEnvioWhatsapp(
        "La carnicería está marcada como proveedor 'meta' pero no tiene cargado whatsapp_phone_number_id."
      );
    }

    // Fuera de la ventana de 24 horas, Meta rechaza el texto libre. Si hay una
    // plantilla de respaldo, se manda esa; si no, se falla con un mensaje que
    // dice exactamente qué pasó, en vez de un error críptico de la API.
    const conversacion = await obtenerOCrearConversacion({
      carniceriaId: params.carniceriaId,
      telefono: hacia,
      clienteId: params.clienteId,
      esCarnicero: params.esCarnicero,
    });

    const abierta = ventanaAbierta(conversacion.ventana24hVenceAt);

    if (!abierta && params.plantillaDeRespaldo) {
      tipo = "plantilla";
      plantillaUsada = params.plantillaDeRespaldo.nombre;
      resultado = await enviarPlantillaMeta({
        phoneNumberId: config.phoneNumberId,
        para: hacia,
        nombrePlantilla: params.plantillaDeRespaldo.nombre,
        idioma: params.plantillaDeRespaldo.idioma,
        variables: params.plantillaDeRespaldo.variables,
      });
    } else if (!abierta) {
      const error =
        "Pasaron más de 24 horas desde el último mensaje de esta persona. Meta solo permite escribirle con una plantilla aprobada.";
      await registrarFallo({ ...params, hacia, config, error });
      throw new ErrorEnvioWhatsapp(error, true);
    } else {
      resultado = await enviarTextoMeta({
        phoneNumberId: config.phoneNumberId,
        para: hacia,
        cuerpo: params.cuerpo,
      });
    }
  } else {
    resultado = await enviarTextoTwilio({
      desde: config.telefonoWhatsapp,
      para: hacia,
      cuerpo: params.cuerpo,
    });
  }

  await registrarMensaje({
    carniceriaId: params.carniceriaId,
    telefonoInterlocutor: hacia,
    telefonoCarniceria: config.telefonoWhatsapp,
    direccion: "saliente",
    tipo,
    cuerpo: params.cuerpo,
    origen: params.origen ?? "bot",
    clienteId: params.clienteId,
    esCarnicero: params.esCarnicero,
    proveedorMensajeId: resultado.proveedorMensajeId,
    estadoEnvio: resultado.ok ? "enviado" : "fallido",
    errorMensaje: resultado.error,
    plantillaNombre: plantillaUsada,
    pedidoId: params.pedidoId,
  });

  if (!resultado.ok) {
    throw new ErrorEnvioWhatsapp(resultado.error ?? "No se pudo enviar el mensaje.");
  }

  return resultado;
}

async function registrarFallo(params: {
  carniceriaId: string;
  hacia: string;
  cuerpo: string;
  origen?: OrigenMensaje;
  pedidoId?: string | null;
  clienteId?: string | null;
  esCarnicero?: boolean;
  config: ConfigWhatsapp;
  error: string;
}): Promise<void> {
  if (!params.config.telefonoWhatsapp) return;
  try {
    await registrarMensaje({
      carniceriaId: params.carniceriaId,
      telefonoInterlocutor: params.hacia,
      telefonoCarniceria: params.config.telefonoWhatsapp,
      direccion: "saliente",
      tipo: "texto",
      cuerpo: params.cuerpo,
      origen: params.origen ?? "bot",
      clienteId: params.clienteId,
      esCarnicero: params.esCarnicero,
      estadoEnvio: "fallido",
      errorMensaje: params.error,
      pedidoId: params.pedidoId,
    });
  } catch (err) {
    console.error("No se pudo registrar el mensaje fallido", err);
  }
}

/** Manda una plantilla aprobada. Es la única vía fuera de la ventana de 24 horas. */
export async function enviarPlantilla(params: {
  carniceriaId: string;
  hacia: string;
  nombrePlantilla: string;
  idioma?: string;
  variables?: string[];
  /** Texto equivalente, para que el hilo del panel se lea bien. */
  vistaPrevia: string;
  origen?: OrigenMensaje;
  pedidoId?: string | null;
  clienteId?: string | null;
}): Promise<ResultadoEnvio> {
  const config = await resolverConfigWhatsapp(params.carniceriaId);

  if (config.proveedor !== "meta" || !config.phoneNumberId) {
    throw new ErrorEnvioWhatsapp(
      "Las plantillas solo se pueden mandar por la API de Meta. Esta carnicería todavía está en Twilio."
    );
  }
  if (!config.telefonoWhatsapp) {
    throw new ErrorEnvioWhatsapp("La carnicería no tiene número de WhatsApp configurado.");
  }

  const hacia = aFormatoCanonico(params.hacia);

  const resultado = await enviarPlantillaMeta({
    phoneNumberId: config.phoneNumberId,
    para: hacia,
    nombrePlantilla: params.nombrePlantilla,
    idioma: params.idioma,
    variables: params.variables,
  });

  await registrarMensaje({
    carniceriaId: params.carniceriaId,
    telefonoInterlocutor: hacia,
    telefonoCarniceria: config.telefonoWhatsapp,
    direccion: "saliente",
    tipo: "plantilla",
    cuerpo: params.vistaPrevia,
    origen: params.origen ?? "bot",
    clienteId: params.clienteId,
    proveedorMensajeId: resultado.proveedorMensajeId,
    estadoEnvio: resultado.ok ? "enviado" : "fallido",
    errorMensaje: resultado.error,
    plantillaNombre: params.nombrePlantilla,
    pedidoId: params.pedidoId,
  });

  if (!resultado.ok) {
    throw new ErrorEnvioWhatsapp(resultado.error ?? "No se pudo enviar la plantilla.");
  }

  return resultado;
}

// ============================================================
// MEDIA
// ============================================================

/**
 * Baja un audio recibido, sin que quien llama tenga que saber de qué proveedor
 * vino. Twilio manda una URL descargable; Meta manda un ID con el que hay que
 * pedir la URL primero.
 */
export async function descargarAudio(media: ReferenciaMedia): Promise<Buffer> {
  if (media.proveedor === "meta") {
    const { buffer } = await descargarMediaMeta(media.referencia);
    return buffer;
  }
  const { buffer } = await descargarMediaTwilio(media.referencia);
  return buffer;
}
