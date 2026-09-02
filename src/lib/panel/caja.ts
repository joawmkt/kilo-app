import type { SupabaseClient } from "@supabase/supabase-js";
import { inicioDelMesArgentina, rangoDelDiaArgentina } from "./formatos";

// ============================================================
// Caja — gestión interna de ingresos
// ============================================================
//
// ⚠️ ESTE MÓDULO NO EMITE COMPROBANTES DE NINGÚN TIPO. El producto no se integra
// con controladores fiscales ni con facturación electrónica de ARCA. Es gestión
// interna: sirve para que el carnicero sepa cómo viene el día, nada más. Por eso
// en ningún lado se usan las palabras "factura" ni "facturación".
//
// ⚠️ Y LO MÁS IMPORTANTE: estos números cuentan SOLO los pedidos que entraron por
// WhatsApp. Las ventas del mostrador no están registradas en ningún lado
// todavía (decisión de producto abierta: ver claude/ronda_iteraciones_260823.md,
// punto 4). Un carnicero que ve un total que sabe que es falso deja de confiar
// en el resto del panel — por eso cada número dice exactamente qué incluye, y
// nunca se lo llama "ventas totales".
//
// SOBRE LA SEGUNDA FUENTE DE INGRESOS: los totales se derivan de `pedidos` en
// vez de mantener una tabla de movimientos, porque derivar es más simple y no se
// puede desincronizar. Cuando se decida cómo registrar el mostrador, el único
// lugar a tocar es `obtenerIngresos`: sumar la otra fuente ahí y devolverla
// desglosada, sin rehacer las pantallas.

export type IngresosDelPeriodo = {
  /** Pedidos que entraron por WhatsApp y llegaron a cobrarse (aprobados o retirados). */
  cantidadPedidos: number;
  /** Suma de los totales estimados. Estimativo: el precio final se define al pesar. */
  totalEstimado: number;
  /** Cuántos pedidos no tienen total porque falta cargar algún precio. */
  pedidosSinPrecio: number;
  /** Detalle por pedido, para el desglose. */
  detalle: {
    id: string;
    clienteNombre: string | null;
    telefono: string;
    horaRetiro: string | null;
    estado: string;
    total: number | null;
    cantidadItems: number;
  }[];
};

const ESTADOS_QUE_CUENTAN = ["aprobado", "retirado"];

/**
 * Ingresos de un período.
 *
 * Punto único de extensión: el día que se registren las ventas del mostrador,
 * se suman acá y se devuelven como una segunda línea del desglose.
 */
export async function obtenerIngresos(
  supabase: SupabaseClient,
  desde: Date,
  hasta: Date
): Promise<IngresosDelPeriodo> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, telefono, hora_retiro, estado, total_estimado, items, clientes(nombre)")
    .in("estado", ESTADOS_QUE_CUENTAN)
    .gte("created_at", desde.toISOString())
    .lt("created_at", hasta.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as FilaIngreso[];

  let totalEstimado = 0;
  let pedidosSinPrecio = 0;

  const detalle = filas.map((fila) => {
    const cliente = Array.isArray(fila.clientes) ? fila.clientes[0] : fila.clientes;
    const total = fila.total_estimado === null ? null : Number(fila.total_estimado);

    if (total === null) pedidosSinPrecio += 1;
    else totalEstimado += total;

    return {
      id: fila.id,
      clienteNombre: cliente?.nombre ?? null,
      telefono: fila.telefono,
      horaRetiro: fila.hora_retiro,
      estado: fila.estado,
      total,
      cantidadItems: Array.isArray(fila.items) ? fila.items.length : 0,
    };
  });

  return {
    cantidadPedidos: filas.length,
    totalEstimado,
    pedidosSinPrecio,
    detalle,
  };
}

export async function ingresosDeHoy(supabase: SupabaseClient): Promise<IngresosDelPeriodo> {
  const { desde, hasta } = rangoDelDiaArgentina();
  return obtenerIngresos(supabase, desde, hasta);
}

export async function ingresosDelMes(supabase: SupabaseClient): Promise<IngresosDelPeriodo> {
  const desde = inicioDelMesArgentina();
  const hasta = new Date();
  return obtenerIngresos(supabase, desde, hasta);
}

/** Totales de los últimos N días, para la comparación con días anteriores. */
export async function ingresosPorDia(
  supabase: SupabaseClient,
  dias: number
): Promise<{ fecha: Date; total: number; cantidad: number }[]> {
  const hoy = rangoDelDiaArgentina();
  const desde = new Date(hoy.desde.getTime() - (dias - 1) * 86400000);

  const { data, error } = await supabase
    .from("pedidos")
    .select("created_at, total_estimado")
    .in("estado", ESTADOS_QUE_CUENTAN)
    .gte("created_at", desde.toISOString())
    .lt("created_at", hoy.hasta.toISOString());

  if (error) throw new Error(error.message);

  const porDia = new Map<number, { total: number; cantidad: number }>();
  for (let indice = 0; indice < dias; indice += 1) {
    porDia.set(desde.getTime() + indice * 86400000, { total: 0, cantidad: 0 });
  }

  for (const fila of (data ?? []) as { created_at: string; total_estimado: number | string | null }[]) {
    const inicioDelDia = rangoDelDiaArgentina(new Date(fila.created_at)).desde.getTime();
    const acumulado = porDia.get(inicioDelDia);
    if (!acumulado) continue;
    acumulado.cantidad += 1;
    if (fila.total_estimado !== null) acumulado.total += Number(fila.total_estimado);
  }

  return [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tiempo, valores]) => ({ fecha: new Date(tiempo), ...valores }));
}

type FilaIngreso = {
  id: string;
  telefono: string;
  hora_retiro: string | null;
  estado: string;
  total_estimado: number | string | null;
  items: unknown;
  clientes: { nombre: string | null } | { nombre: string | null }[] | null;
};
