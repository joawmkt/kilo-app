// Tipos compartidos de la capa de WhatsApp — lo que el resto del sistema usa
// sin tener que saber si atrás hay Twilio o la API de Meta.

/** Proveedor de WhatsApp de una carnicería. */
export type ProveedorWhatsapp = "twilio" | "meta";

/**
 * Referencia a un archivo de media recibido. Twilio manda una URL descargable
 * directo; Meta manda un ID con el que hay que pedir la URL primero (y esa URL
 * vence enseguida, así que no sirve guardarla).
 */
export type ReferenciaMedia = {
  proveedor: ProveedorWhatsapp;
  /** URL completa (Twilio) o media ID (Meta). */
  referencia: string;
  mimeType?: string | null;
};

/** De dónde salió un mensaje saliente. */
export type OrigenMensaje = "cliente" | "bot" | "panel" | "app_whatsapp";

export type TipoMensaje =
  | "texto"
  | "audio"
  | "imagen"
  | "documento"
  | "video"
  | "sticker"
  | "ubicacion"
  | "plantilla"
  | "otro";

export type EstadoEnvio = "pendiente" | "enviado" | "entregado" | "leido" | "fallido";

/** Configuración de WhatsApp de una carnicería, resuelta desde la base. */
export type ConfigWhatsapp = {
  carniceriaId: string;
  proveedor: ProveedorWhatsapp;
  /** Número en formato canónico interno ("whatsapp:+549..."). */
  telefonoWhatsapp: string | null;
  /** Solo Meta: identificador interno del número en la Cloud API. */
  phoneNumberId: string | null;
  wabaId: string | null;
};

/** Un mensaje entrante, ya normalizado, venga de donde venga. */
export type MensajeEntranteNormalizado = {
  /** Teléfono del interlocutor, en formato canónico interno. */
  telefono: string;
  /** Nombre de perfil de WhatsApp, cuando el proveedor lo manda. */
  nombrePerfil: string | null;
  tipo: TipoMensaje;
  texto: string | null;
  media: ReferenciaMedia | null;
  /** ID del mensaje del lado del proveedor (wamid de Meta, SID de Twilio). */
  proveedorMensajeId: string | null;
  /**
   * true si el mensaje lo mandó el propio negocio desde la app de WhatsApp del
   * celular y Meta lo espejó al webhook (coexistencia). No hay que contestarlo:
   * ya lo contestó una persona.
   */
  esEcoDelNegocio: boolean;
  recibidoAt: Date;
};

/** Resultado de mandar un mensaje. */
export type ResultadoEnvio = {
  ok: boolean;
  proveedorMensajeId: string | null;
  error: string | null;
};
