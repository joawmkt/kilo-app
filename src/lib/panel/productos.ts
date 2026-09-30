import type { SupabaseClient } from "@supabase/supabase-js";
import type { TonoEtiqueta } from "@/components/panel/ui";

// Lectura del catálogo para el panel (módulo Stock y precios).

export type EstadoStock = "disponible" | "poco" | "sin_stock";

export type ProductoDelPanel = {
  id: string;
  codigo: string;
  nombre: string;
  familia: string;
  unidad: string;
  stock: number;
  precio: number | null;
  umbralPropio: number | null;
  umbralEfectivo: number;
  estado: EstadoStock;
  stockActualizadoAt: string | null;
  /** De dónde vino el último cambio de stock: audio, panel o descuento por pedido. */
  stockOrigen: "audio" | "panel" | "pedido" | null;
  precioActualizadoAt: string | null;
  esComplementario: boolean;
  /**
   * Cuántas piezas ENTERAS hay (un vacío entero, un pollo): lo que se puede
   * vender como unidad (01/10/2026). Opcional: solo lo calcula el listado de
   * stock.
   */
  piezasEnteras?: number;
};

type FilaProducto = {
  id: string;
  codigo: string;
  nombre_display: string;
  familia: string;
  unidad: string;
  stock_actual: number | string;
  precio: number | string | null;
  umbral_stock_bajo: number | string | null;
  stock_actualizado_at: string | null;
  stock_origen: string | null;
  precio_actualizado_at: string | null;
  es_complementario: boolean;
};

const CAMPOS =
  "id, codigo, nombre_display, familia, unidad, stock_actual, precio, umbral_stock_bajo, stock_actualizado_at, stock_origen, precio_actualizado_at, es_complementario";

export function estadoDeStock(stock: number, umbral: number): EstadoStock {
  if (stock <= 0) return "sin_stock";
  if (stock <= umbral) return "poco";
  return "disponible";
}

function mapear(fila: FilaProducto, umbralDefault: number): ProductoDelPanel {
  const stock = Number(fila.stock_actual);
  const umbralPropio = fila.umbral_stock_bajo === null ? null : Number(fila.umbral_stock_bajo);
  const umbralEfectivo = umbralPropio ?? umbralDefault;

  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre_display,
    familia: fila.familia,
    unidad: fila.unidad,
    stock,
    precio: fila.precio === null ? null : Number(fila.precio),
    umbralPropio,
    umbralEfectivo,
    estado: estadoDeStock(stock, umbralEfectivo),
    stockActualizadoAt: fila.stock_actualizado_at,
    stockOrigen: (fila.stock_origen as ProductoDelPanel["stockOrigen"]) ?? null,
    precioActualizadoAt: fila.precio_actualizado_at,
    esComplementario: fila.es_complementario,
  };
}

export async function listarProductos(
  supabase: SupabaseClient,
  umbralDefault: number
): Promise<ProductoDelPanel[]> {
  const { data, error } = await supabase
    .from("productos")
    .select(CAMPOS)
    .eq("activo", true)
    .order("nombre_display", { ascending: true });

  if (error) throw new Error(error.message);
  const productos = ((data ?? []) as unknown as FilaProducto[]).map((fila) => mapear(fila, umbralDefault));

  // Las piezas enteras: las que entraron con un lote (media res, cajón) y
  // nadie empezó a cortar. Son las que el bot puede vender "enteras".
  const { data: piezas } = await supabase
    .from("piezas_stock")
    .select("producto_id, kg_iniciales, kg_restantes, recepcion_lote_id")
    .eq("estado", "disponible")
    .eq("es_subproducto", false)
    .gt("kg_restantes", 0)
    .not("recepcion_lote_id", "is", null);
  const enteras = new Map<string, number>();
  for (const p of (piezas ?? []) as { producto_id: string; kg_iniciales: number; kg_restantes: number }[]) {
    if (Number(p.kg_restantes) < Number(p.kg_iniciales) * 0.98) continue;
    enteras.set(p.producto_id, (enteras.get(p.producto_id) ?? 0) + 1);
  }
  return productos.map((p) => (enteras.has(p.id) ? { ...p, piezasEnteras: enteras.get(p.id) } : p));
}

/** Productos sin stock o con stock bajo — lo que afecta a lo que el bot puede ofrecer. */
export async function productosQueNecesitanAtencion(
  supabase: SupabaseClient,
  umbralDefault: number
): Promise<ProductoDelPanel[]> {
  const productos = await listarProductos(supabase, umbralDefault);
  return productos
    .filter((producto) => producto.estado !== "disponible")
    .sort((a, b) => {
      // Primero lo que está en cero: es lo que el bot ya no puede vender.
      if (a.estado !== b.estado) return a.estado === "sin_stock" ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es");
    });
}

export const ETIQUETA_ESTADO_STOCK: Record<EstadoStock, string> = {
  disponible: "Disponible",
  poco: "Queda poco",
  sin_stock: "Sin stock",
};

export const TONO_ESTADO_STOCK: Record<EstadoStock, TonoEtiqueta> = {
  disponible: "exito",
  poco: "atencion",
  sin_stock: "problema",
};

export const ETIQUETA_ORIGEN_STOCK: Record<"audio" | "panel" | "pedido", string> = {
  audio: "Por audio",
  panel: "Desde el panel",
  pedido: "Descontado por un pedido",
};

/** Nombre legible de la familia, para agrupar la lista. */
export function nombreDeFamilia(familia: string): string {
  const nombres: Record<string, string> = {
    vacuno_parrilla: "Vacuno · parrilla",
    vacuno_horno: "Vacuno · horno",
    vacuno_milanesa: "Vacuno · milanesas",
    vacuno_puchero: "Vacuno · puchero",
    vacuno: "Vacuno",
    cerdo: "Cerdo",
    pollo: "Pollo",
    embutidos: "Embutidos",
    achuras: "Achuras",
    elaborados: "Elaborados",
    complementarios: "Complementarios",
  };

  if (nombres[familia]) return nombres[familia];
  // Fallback razonable para familias que existan en el catálogo y no estén acá.
  return familia.replace(/_/g, " ").replace(/^\w/, (letra) => letra.toUpperCase());
}
