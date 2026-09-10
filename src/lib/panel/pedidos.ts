import type { SupabaseClient } from "@supabase/supabase-js";
import type { TonoEtiqueta } from "@/components/panel/ui";
import { rangoDelDiaArgentina } from "./formatos";

// Lectura de pedidos para el panel.
//
// Todas las consultas usan el cliente con la sesión del carnicero, o sea con
// Row Level Security puesto: la base solo devuelve las filas de su carnicería
// aunque la consulta no filtre por `carniceria_id`.

export type EstadoPedido =
  | "borrador"
  | "pendiente_aclaracion"
  | "pendiente_confirmacion_cliente"
  | "pendiente_aprobacion"
  | "modificacion_pendiente"
  | "aprobado"
  | "en_espera"
  | "rechazado"
  | "cancelado"
  | "vencido"
  | "retirado"
  | "no_show";

export type ItemPedido = {
  producto_id: string;
  producto_codigo: string;
  nombre_display: string;
  cantidad: number;
  unidad: string;
  disponible: boolean;
  sustituye_a_producto_id?: string | null;
  precio_unitario?: number | null;
};

export type PedidoDelPanel = {
  id: string;
  estado: EstadoPedido;
  /** Sube en cada cambio. Se manda al aprobar para no aprobar una versión vieja (sección 51). */
  version: number;
  /** Pregunta con opciones numeradas que el bot le hizo al carnicero (secciones 36 y 50). */
  consultaCarnicero: { paso: string; opciones: { numero: number; etiqueta: string; valor: string }[] } | null;
  telefono: string;
  clienteId: string | null;
  clienteNombre: string | null;
  clienteAusencias: number;
  items: ItemPedido[];
  horaRetiro: string | null;
  totalEstimado: number | null;
  origen: string;
  creadoAt: string;
  aprobadoAt: string | null;
  rechazadoAt: string | null;
  listoAt: string | null;
  retiradoAt: string | null;
  conversacionId: string | null;
};

const CAMPOS =
  "id, estado, version, consulta_carnicero, telefono, cliente_id, items, hora_retiro, total_estimado, origen, created_at, aprobado_at, rechazado_at, listo_at, retirado_at, clientes(nombre, no_shows)";

type FilaPedido = {
  id: string;
  estado: string;
  telefono: string;
  cliente_id: string | null;
  items: unknown;
  hora_retiro: string | null;
  total_estimado: number | string | null;
  origen: string | null;
  created_at: string;
  aprobado_at: string | null;
  rechazado_at: string | null;
  listo_at: string | null;
  retirado_at: string | null;
  clientes: { nombre: string | null; no_shows: number } | { nombre: string | null; no_shows: number }[] | null;
};

function mapear(fila: FilaPedido): PedidoDelPanel {
  // Supabase devuelve la relación como objeto o como array de uno según cómo
  // infiera la cardinalidad. Se normaliza acá para que las pantallas no tengan
  // que preocuparse.
  const cliente = Array.isArray(fila.clientes) ? fila.clientes[0] : fila.clientes;

  return {
    id: fila.id,
    estado: fila.estado as EstadoPedido,
    version: Number((fila as unknown as { version?: number }).version ?? 1),
    consultaCarnicero:
      ((fila as unknown as { consulta_carnicero?: PedidoDelPanel["consultaCarnicero"] }).consulta_carnicero) ?? null,
    telefono: fila.telefono,
    clienteId: fila.cliente_id,
    clienteNombre: cliente?.nombre ?? null,
    clienteAusencias: Number(cliente?.no_shows ?? 0),
    items: Array.isArray(fila.items) ? (fila.items as ItemPedido[]) : [],
    horaRetiro: fila.hora_retiro,
    totalEstimado: fila.total_estimado === null ? null : Number(fila.total_estimado),
    origen: fila.origen ?? "bot",
    creadoAt: fila.created_at,
    aprobadoAt: fila.aprobado_at,
    rechazadoAt: fila.rechazado_at,
    listoAt: fila.listo_at,
    retiradoAt: fila.retirado_at,
    conversacionId: null,
  };
}

/** Pedidos esperando la aprobación del carnicero. Lo más urgente del panel. */
export async function pedidosEsperandoAprobacion(
  supabase: SupabaseClient
): Promise<PedidoDelPanel[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(CAMPOS)
    .eq("estado", "pendiente_aprobacion")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaPedido[]).map(mapear);
}

/**
 * Pedidos con hora de retiro dentro del día de hoy (hora Argentina), ordenados
 * por hora. Incluye los aprobados, los ya retirados y las ausencias: el
 * carnicero necesita ver el día completo, no solo lo que queda por hacer.
 */
export async function pedidosDeHoy(supabase: SupabaseClient): Promise<PedidoDelPanel[]> {
  const { desde, hasta } = rangoDelDiaArgentina();

  const { data, error } = await supabase
    .from("pedidos")
    .select(CAMPOS)
    .in("estado", ["aprobado", "retirado", "no_show"])
    .gte("hora_retiro", desde.toISOString())
    .lt("hora_retiro", hasta.toISOString())
    .order("hora_retiro", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaPedido[]).map(mapear);
}

export type FiltrosPedidos = {
  estado?: EstadoPedido | "todos";
  desde?: string;
  hasta?: string;
  clienteId?: string;
  limite?: number;
};

export async function listarPedidos(
  supabase: SupabaseClient,
  filtros: FiltrosPedidos = {}
): Promise<PedidoDelPanel[]> {
  let consulta = supabase.from("pedidos").select(CAMPOS).order("created_at", { ascending: false });

  if (filtros.estado && filtros.estado !== "todos") {
    consulta = consulta.eq("estado", filtros.estado);
  } else {
    // Sin filtro explícito no se muestran los pedidos que quedaron a medio
    // armar: son ruido de conversaciones que no llegaron a ser un pedido.
    consulta = consulta.not(
      "estado",
      "in",
      "(borrador,pendiente_aclaracion,pendiente_confirmacion_cliente,vencido)"
    );
  }

  if (filtros.desde) consulta = consulta.gte("created_at", filtros.desde);
  if (filtros.hasta) consulta = consulta.lt("created_at", filtros.hasta);
  if (filtros.clienteId) consulta = consulta.eq("cliente_id", filtros.clienteId);

  consulta = consulta.limit(filtros.limite ?? 100);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaPedido[]).map(mapear);
}

export async function obtenerPedido(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<PedidoDelPanel | null> {
  const { data, error } = await supabase.from("pedidos").select(CAMPOS).eq("id", pedidoId).maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapear(data as unknown as FilaPedido);
}

// ============================================================
// Presentación de estados — en el idioma del carnicero, sin jerga
// ============================================================

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  borrador: "Empezado, sin terminar",
  pendiente_aclaracion: "Armando el pedido",
  pendiente_confirmacion_cliente: "Esperando que el cliente confirme",
  pendiente_aprobacion: "Esperando que lo apruebes",
  modificacion_pendiente: "El cliente lo está cambiando",
  en_espera: "En espera para mañana",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado por el cliente",
  vencido: "Quedó sin terminar",
  retirado: "Retirado",
  no_show: "No lo retiró",
};

export const TONO_ESTADO: Record<EstadoPedido, TonoEtiqueta> = {
  borrador: "neutro",
  pendiente_aclaracion: "neutro",
  pendiente_confirmacion_cliente: "neutro",
  pendiente_aprobacion: "atencion",
  modificacion_pendiente: "atencion",
  en_espera: "atencion",
  aprobado: "exito",
  rechazado: "problema",
  cancelado: "neutro",
  vencido: "neutro",
  retirado: "exito",
  no_show: "problema",
};

/**
 * La etiqueta que ve el carnicero, que no siempre es la del estado.
 *
 * "Listo para retirar" no es un estado en la base: es un `listo_at` cargado
 * sobre un pedido que sigue estando aprobado (ver la migración 0021 para el
 * porqué). Pero para el carnicero sí es un estado —le dice qué le falta hacer
 * con ese pedido— así que la pantalla lo muestra como tal.
 *
 * Esta es la razón de que exista esta función en vez de leer `ETIQUETA_ESTADO`
 * directo: hay UN solo lugar donde se traduce un pedido a lo que se ve, y no
 * cinco pantallas cada una con su criterio.
 */
export function etiquetaDePedido(pedido: PedidoDelPanel): {
  texto: string;
  tono: TonoEtiqueta;
} {
  if (pedido.listoAt && (pedido.estado === "aprobado" || pedido.estado === "en_espera")) {
    return { texto: "Listo para retirar", tono: "exito" };
  }

  return { texto: ETIQUETA_ESTADO[pedido.estado], tono: TONO_ESTADO[pedido.estado] };
}

/** Total estimado de un pedido a partir de los precios congelados en sus items. */
export function totalDePedido(pedido: PedidoDelPanel): number | null {
  if (pedido.totalEstimado !== null) return pedido.totalEstimado;

  let total = 0;
  for (const item of pedido.items) {
    if (item.precio_unitario === null || item.precio_unitario === undefined) return null;
    total += item.precio_unitario * item.cantidad;
  }
  return pedido.items.length > 0 ? total : null;
}

/** Resumen corto de los productos, para listas: "2 kg de asado + 2 más". */
export function resumenItems(items: ItemPedido[]): string {
  if (items.length === 0) return "Sin productos";
  const primero = items[0];
  const cantidad =
    primero.unidad === "kg"
      ? `${primero.cantidad} kg de ${primero.nombre_display.toLowerCase()}`
      : `${primero.cantidad} × ${primero.nombre_display.toLowerCase()}`;

  if (items.length === 1) return cantidad;
  return `${cantidad} + ${items.length - 1} ${items.length - 1 === 1 ? "más" : "más"}`;
}


// ============================================================
// Historial de un pedido — especificación, sección 27
// ============================================================
//
// Lo que le permite al carnicero abrir un pedido y entender por qué está como
// está, sin tener que leer la conversación entera.

export type EventoDelPedido = {
  id: string;
  tipo: string;
  actor: string;
  descripcion: string | null;
  version: number | null;
  creadoAt: string;
};

export async function obtenerHistorialDePedido(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<EventoDelPedido[]> {
  const { data, error } = await supabase
    .from("pedido_eventos")
    .select("id, tipo, actor, descripcion, version, created_at")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error leyendo el historial del pedido", error);
    return [];
  }

  return ((data ?? []) as unknown[]).map((fila) => {
    const f = fila as Record<string, unknown>;
    return {
      id: f.id as string,
      tipo: f.tipo as string,
      actor: f.actor as string,
      descripcion: (f.descripcion as string | null) ?? null,
      version: f.version == null ? null : Number(f.version),
      creadoAt: f.created_at as string,
    };
  });
}

/** Cómo se nombra cada actor en el panel, sin jerga. */
export const NOMBRE_ACTOR: Record<string, string> = {
  cliente: "El cliente",
  carnicero: "Vos",
  bot: "KILO",
  sistema: "Automático",
};
