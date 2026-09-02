import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { aFormatoCanonico } from "./telefonos";
import type { EstadoEnvio, OrigenMensaje, TipoMensaje } from "./tipos";

// Conversaciones — el agrupador que le da sentido al log plano de
// `mensajes_whatsapp`. Es lo que hace posible el módulo de mensajería del panel
// y, sobre todo, saber si la ventana de 24 horas de Meta sigue abierta.

const HORAS_VENTANA = 24;

export type Conversacion = {
  id: string;
  carniceriaId: string;
  telefono: string;
  clienteId: string | null;
  esCarnicero: boolean;
  ultimoMensajeAt: string | null;
  ventana24hVenceAt: string | null;
  noLeidos: number;
};

/**
 * ¿Se le puede escribir texto libre a este número ahora mismo?
 *
 * Regla de Meta: el cliente escribe → se abre una ventana de 24 horas → dentro
 * de ella el negocio puede responder con texto libre. Fuera de ella, SOLO
 * plantillas aprobadas. Si el panel deja escribir sin chequear esto, el envío
 * falla y el carnicero se queda creyendo que el mensaje salió.
 */
export function ventanaAbierta(ventana24hVenceAt: string | null | undefined): boolean {
  if (!ventana24hVenceAt) return false;
  return new Date(ventana24hVenceAt).getTime() > Date.now();
}

/** Minutos que faltan para que se cierre la ventana. Null si ya está cerrada. */
export function minutosRestantesDeVentana(ventana24hVenceAt: string | null | undefined): number | null {
  if (!ventanaAbierta(ventana24hVenceAt)) return null;
  const restante = new Date(ventana24hVenceAt as string).getTime() - Date.now();
  return Math.max(0, Math.round(restante / 60000));
}

/**
 * Busca la conversación con un interlocutor, o la crea si es la primera vez.
 * `telefono` puede venir en cualquier formato: se normaliza al canónico.
 */
export async function obtenerOCrearConversacion(params: {
  carniceriaId: string;
  telefono: string;
  clienteId?: string | null;
  esCarnicero?: boolean;
}): Promise<Conversacion> {
  const supabaseAdmin = getSupabaseAdmin();
  const telefono = aFormatoCanonico(params.telefono);

  const { data: existente } = await supabaseAdmin
    .from("conversaciones")
    .select("id, carniceria_id, telefono, cliente_id, es_carnicero, ultimo_mensaje_at, ventana_24h_vence_at, no_leidos")
    .eq("carniceria_id", params.carniceriaId)
    .eq("telefono", telefono)
    .maybeSingle();

  if (existente) {
    // Si la conversación se creó antes de que existiera la ficha del cliente
    // (pasa con el historial migrado), se completa ahora.
    if (!existente.cliente_id && params.clienteId) {
      await supabaseAdmin
        .from("conversaciones")
        .update({ cliente_id: params.clienteId })
        .eq("id", existente.id);
      existente.cliente_id = params.clienteId;
    }
    return mapear(existente);
  }

  const { data: creada, error } = await supabaseAdmin
    .from("conversaciones")
    .insert({
      carniceria_id: params.carniceriaId,
      telefono,
      cliente_id: params.clienteId ?? null,
      es_carnicero: params.esCarnicero ?? false,
    })
    .select("id, carniceria_id, telefono, cliente_id, es_carnicero, ultimo_mensaje_at, ventana_24h_vence_at, no_leidos")
    .single();

  if (error || !creada) {
    // Carrera: dos mensajes del mismo número entrando a la vez. El unique de la
    // tabla lo evita; acá simplemente releemos el que ganó.
    const { data: reintento } = await supabaseAdmin
      .from("conversaciones")
      .select("id, carniceria_id, telefono, cliente_id, es_carnicero, ultimo_mensaje_at, ventana_24h_vence_at, no_leidos")
      .eq("carniceria_id", params.carniceriaId)
      .eq("telefono", telefono)
      .maybeSingle();

    if (reintento) return mapear(reintento);
    throw new Error(`Error creando la conversación: ${error?.message}`);
  }

  return mapear(creada);
}

type FilaConversacion = {
  id: string;
  carniceria_id: string;
  telefono: string;
  cliente_id: string | null;
  es_carnicero: boolean;
  ultimo_mensaje_at: string | null;
  ventana_24h_vence_at: string | null;
  no_leidos: number;
};

function mapear(fila: FilaConversacion): Conversacion {
  return {
    id: fila.id,
    carniceriaId: fila.carniceria_id,
    telefono: fila.telefono,
    clienteId: fila.cliente_id,
    esCarnicero: fila.es_carnicero,
    ultimoMensajeAt: fila.ultimo_mensaje_at,
    ventana24hVenceAt: fila.ventana_24h_vence_at,
    noLeidos: fila.no_leidos,
  };
}

/**
 * Guarda un mensaje en el log y actualiza la conversación.
 *
 * Es el único lugar donde se escribe en `mensajes_whatsapp`, para que la
 * conversación no pueda quedar desincronizada del log.
 */
export async function registrarMensaje(params: {
  carniceriaId: string;
  /** Teléfono del interlocutor (el cliente o el carnicero), no el de la carnicería. */
  telefonoInterlocutor: string;
  /** Número de WhatsApp de la carnicería. */
  telefonoCarniceria: string;
  direccion: "entrante" | "saliente";
  tipo: TipoMensaje;
  cuerpo: string | null;
  origen: OrigenMensaje;
  clienteId?: string | null;
  esCarnicero?: boolean;
  mediaUrl?: string | null;
  rawPayload?: unknown;
  proveedorMensajeId?: string | null;
  estadoEnvio?: EstadoEnvio | null;
  errorMensaje?: string | null;
  plantillaNombre?: string | null;
  pedidoId?: string | null;
  /** Cuenta como actividad del interlocutor: reinicia la ventana de 24 h y suma un no leído. */
  reiniciaVentana?: boolean;
}): Promise<{ mensajeId: string; conversacionId: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const interlocutor = aFormatoCanonico(params.telefonoInterlocutor);
  const carniceria = aFormatoCanonico(params.telefonoCarniceria);

  const conversacion = await obtenerOCrearConversacion({
    carniceriaId: params.carniceriaId,
    telefono: interlocutor,
    clienteId: params.clienteId,
    esCarnicero: params.esCarnicero,
  });

  const ahora = new Date();

  const { data: mensaje, error } = await supabaseAdmin
    .from("mensajes_whatsapp")
    .insert({
      carniceria_id: params.carniceriaId,
      conversacion_id: conversacion.id,
      telefono_origen: params.direccion === "entrante" ? interlocutor : carniceria,
      telefono_destino: params.direccion === "entrante" ? carniceria : interlocutor,
      direccion: params.direccion,
      tipo: params.tipo,
      cuerpo: params.cuerpo,
      media_url: params.mediaUrl ?? null,
      raw_payload: params.rawPayload ?? null,
      origen: params.origen,
      estado_envio: params.estadoEnvio ?? null,
      error_mensaje: params.errorMensaje ?? null,
      proveedor_mensaje_id: params.proveedorMensajeId ?? null,
      plantilla_nombre: params.plantillaNombre ?? null,
      pedido_id: params.pedidoId ?? null,
    })
    .select("id")
    .single();

  if (error || !mensaje) {
    throw new Error(`Error guardando el mensaje: ${error?.message}`);
  }

  const cambios: Record<string, unknown> = {
    ultimo_mensaje_at: ahora.toISOString(),
    ultimo_mensaje_direccion: params.direccion,
    ultimo_mensaje_preview: (params.cuerpo ?? etiquetaSinTexto(params.tipo)).slice(0, 120),
    updated_at: ahora.toISOString(),
  };

  if (params.reiniciaVentana) {
    cambios.ventana_24h_vence_at = new Date(ahora.getTime() + HORAS_VENTANA * 3600 * 1000).toISOString();
    cambios.no_leidos = conversacion.noLeidos + 1;
  }

  await supabaseAdmin.from("conversaciones").update(cambios).eq("id", conversacion.id);

  return { mensajeId: mensaje.id as string, conversacionId: conversacion.id };
}

function etiquetaSinTexto(tipo: TipoMensaje): string {
  switch (tipo) {
    case "audio":
      return "🎤 Audio";
    case "imagen":
      return "📷 Imagen";
    case "video":
      return "🎬 Video";
    case "documento":
      return "📎 Documento";
    case "sticker":
      return "Sticker";
    case "ubicacion":
      return "📍 Ubicación";
    default:
      return "Mensaje";
  }
}

/**
 * Marca la conversación como leída desde el panel.
 *
 * ⚠️ Con coexistencia esto es una aproximación, no la verdad: el carnicero
 * sigue usando su app de WhatsApp en el celular, y un mensaje que ya leyó ahí
 * no se marca solo acá. El panel tiene que presentar el contador como una ayuda,
 * no como un dato exacto.
 */
export async function marcarConversacionLeida(carniceriaId: string, conversacionId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from("conversaciones")
    .update({ no_leidos: 0, leido_hasta_at: new Date().toISOString() })
    .eq("id", conversacionId)
    .eq("carniceria_id", carniceriaId);
}

/** Actualiza el estado de envío de un mensaje saliente (entregado / leído / falló). */
export async function actualizarEstadoEnvio(params: {
  proveedorMensajeId: string;
  estado: EstadoEnvio;
  error?: string | null;
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from("mensajes_whatsapp")
    .update({ estado_envio: params.estado, error_mensaje: params.error ?? null })
    .eq("proveedor_mensaje_id", params.proveedorMensajeId);
}
