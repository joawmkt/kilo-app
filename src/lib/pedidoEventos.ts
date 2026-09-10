import { getSupabaseAdmin } from "./supabaseAdmin";

// ============================================================
// Historial de eventos de un pedido — especificación, sección 27
// ============================================================
//
// Todo lo que le pasa a un pedido queda anotado acá. No es telemetría: es lo
// que le permite al carnicero abrir un pedido y entender por qué está como
// está sin leer la conversación entera, y lo que le da respaldo cuando un
// cliente dice "yo pedí dos kilos".
//
// Es a propósito que registrar un evento NUNCA rompa la operación: si esta
// tabla falla, el pedido tiene que seguir su curso igual. Por eso todos los
// errores se loguean y se tragan.

export type ActorEvento = "cliente" | "carnicero" | "bot" | "sistema";

/**
 * Tipos de evento. La lista sale de la sección 27; se puede ampliar sin
 * migración (la columna es texto libre), pero conviene mantenerla acá para que
 * el panel sepa cómo mostrarlos.
 */
export type TipoEvento =
  | "creado"
  | "cliente_confirmo"
  | "enviado_a_aprobacion"
  | "aprobado"
  | "rechazado"
  | "hora_cambiada"
  | "fecha_cambiada"
  | "producto_agregado"
  | "producto_quitado"
  | "cantidad_cambiada"
  | "version_invalidada"
  | "sustitucion_propuesta"
  | "sustitucion_aceptada"
  | "stock_actualizado"
  | "recordatorio_enviado"
  | "listo"
  | "retirado"
  | "en_espera"
  | "no_show"
  | "cancelado"
  | "vencido";

export async function registrarEvento(params: {
  pedidoId: string;
  carniceriaId: string;
  tipo: TipoEvento;
  actor?: ActorEvento;
  /** Una línea en castellano, tal como la va a leer el carnicero en el panel. */
  descripcion?: string;
  detalle?: Record<string, unknown>;
  version?: number;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from("pedido_eventos").insert({
      pedido_id: params.pedidoId,
      carniceria_id: params.carniceriaId,
      tipo: params.tipo,
      actor: params.actor ?? "sistema",
      descripcion: params.descripcion ?? null,
      detalle: params.detalle ?? {},
      version: params.version ?? null,
    });
  } catch (err) {
    // Nunca romper el flujo del pedido por no poder anotar su historia.
    console.error("No se pudo registrar el evento del pedido", params.tipo, err);
  }
}

/**
 * Sube la versión del pedido y anota por qué. Es el único lugar donde se
 * incrementa: tenerlo centralizado es lo que hace confiable el control de
 * "no aprobar una versión vieja" (sección 51).
 *
 * Devuelve la versión nueva, o `null` si no se pudo leer el pedido.
 */
export async function nuevaVersion(params: {
  pedidoId: string;
  carniceriaId: string;
  motivo: TipoEvento;
  descripcion?: string;
  actor?: ActorEvento;
  detalle?: Record<string, unknown>;
}): Promise<number | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: actual } = await supabaseAdmin
    .from("pedidos")
    .select("version")
    .eq("id", params.pedidoId)
    .maybeSingle();

  if (!actual) return null;

  const version = Number(actual.version ?? 1) + 1;

  await supabaseAdmin
    .from("pedidos")
    .update({ version, updated_at: new Date().toISOString() })
    .eq("id", params.pedidoId);

  await registrarEvento({
    pedidoId: params.pedidoId,
    carniceriaId: params.carniceriaId,
    tipo: params.motivo,
    actor: params.actor ?? "cliente",
    descripcion: params.descripcion,
    detalle: params.detalle,
    version,
  });

  return version;
}
