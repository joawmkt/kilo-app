import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// El catálogo, para que lo maneje el carnicero
// ============================================================
//
// Casi todo esto ya estaba en la base desde la Etapa 2 y nadie lo podía tocar:
// `productos.activo`, `producto_sinonimos` y `terminos_ambiguos` existen desde
// la migración 0002. Lo que faltaba era la pantalla.
//
// LAS TRES REGLAS QUE NO SE NEGOCIAN
//
// 1. `codigo` ES INMUTABLE. Lo referencian la tabla de rendimiento, el árbol
//    padre/hijo y cada movimiento de stock histórico. Si el carnicero pudiera
//    editarlo, un cambio de nombre le rompería el historial hacia atrás.
// 2. `nombre_display` TAMPOCO SE EDITA. Es el nombre del sistema. Para llamarlo
//    como lo llama él está `alias_display`, que solo afecta lo que se muestra.
// 3. UN PRODUCTO DE FÁBRICA NO SE BORRA: SE DESACTIVA. Solo se puede borrar uno
//    propio que nunca tuvo movimientos.

export type SinonimoDelPanel = { id: string; texto: string };

export type ProductoDelCatalogo = {
  id: string;
  codigo: string;
  nombre: string;
  /** Cómo lo llama esta carnicería. Null = se usa el nombre del sistema. */
  alias: string | null;
  familia: string;
  especie: "vacuno" | "porcino" | "aviar" | null;
  unidad: string;
  activo: boolean;
  esPropio: boolean;
  tienePadre: boolean;
  sinonimos: SinonimoDelPanel[];
  /** % que tiene este corte en la tabla de rendimiento vigente, si tiene. */
  pctEnTabla: number | null;
  /** Cuánto pesa UNA unidad, para venderlo por unidad. Null = no cargado. */
  pesoUnidadKg: number | null;
};

type FilaCatalogo = {
  id: string;
  codigo: string;
  nombre_display: string;
  alias_display: string | null;
  familia: string;
  especie: string | null;
  unidad: string;
  activo: boolean;
  es_propio: boolean;
  producto_padre_id: string | null;
  peso_aproximado_unidad_kg: number | string | null;
  producto_sinonimos: { id: string; texto: string }[] | null;
};

export async function listarCatalogo(supabase: SupabaseClient): Promise<ProductoDelCatalogo[]> {
  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, codigo, nombre_display, alias_display, familia, especie, unidad, activo, es_propio, producto_padre_id, peso_aproximado_unidad_kg, producto_sinonimos(id, texto)"
    )
    .order("nombre_display", { ascending: true });

  if (error) throw new Error(error.message);

  // Los porcentajes de las tablas vigentes: es lo que permite avisar que
  // desactivar un corte deja la tabla sin cerrar.
  const { data: cortes } = await supabase
    .from("rendimiento_cortes")
    .select("producto_id, pct_central, tablas_rendimiento!inner(vigente_hasta)")
    .is("tablas_rendimiento.vigente_hasta", null);

  const pctPorProducto = new Map<string, number>();
  for (const fila of (cortes ?? []) as unknown as { producto_id: string; pct_central: number }[]) {
    pctPorProducto.set(fila.producto_id, Number(fila.pct_central));
  }

  return ((data ?? []) as unknown as FilaCatalogo[]).map((fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre_display,
    alias: fila.alias_display,
    familia: fila.familia,
    especie: (fila.especie as ProductoDelCatalogo["especie"]) ?? null,
    unidad: fila.unidad,
    activo: fila.activo,
    esPropio: fila.es_propio,
    tienePadre: fila.producto_padre_id !== null,
    sinonimos: (fila.producto_sinonimos ?? []).map((s) => ({ id: s.id, texto: s.texto })),
    pctEnTabla: pctPorProducto.get(fila.id) ?? null,
    pesoUnidadKg: fila.peso_aproximado_unidad_kg === null ? null : Number(fila.peso_aproximado_unidad_kg),
  }));
}

// ============================================================
// La colisión de sinónimos
// ============================================================
//
// EL EJEMPLO QUE LO MOTIVA ES REAL: "roast beef muchos carniceros lo llaman
// aguja" — pero `aguja` YA es un producto del catálogo (está en la tabla de
// rendimiento del novillo con 3,17 %). Si alguien carga "aguja" como sinónimo
// de roast beef, quedan DOS PRODUCTOS ACTIVOS reclamando la misma palabra, y el
// bot resuelve con el que encuentre primero. Es un bug silencioso: nadie se
// entera hasta que descontó stock del corte equivocado.
//
// Y el caso es más profundo de lo que parece. "Roast beef" ya era ambiguo antes
// de esto: para unos catálogos es el bloque de aguja/bife ancho del delantero
// (~7 kg) y para otros el bife angosto sin hueso del trasero (~4-5 kg). O sea
// que el carnicero que lo llama "aguja" puede NO estar poniendo un sinónimo:
// puede estar diciendo que para él son el mismo corte. Si es así, lo correcto
// no es agregar un sinónimo sino desactivar uno de los dos. Por eso esa opción
// va primera cuando se le pregunta.

/** Misma normalización que usa la compuerta de voz: sin tildes, sin mayúsculas. */
export function normalizarTermino(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export type Colision = {
  productoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  /** Si chocó contra el nombre del producto o contra uno de sus sinónimos. */
  contra: "nombre" | "sinonimo";
};

/**
 * ¿Este término ya significa otra cosa en este catálogo?
 *
 * Busca en el nombre, el alias y los sinónimos de TODOS los productos, no solo
 * los activos: un producto inactivo que choca no es un error hoy, pero sí una
 * bomba para el día que lo reactiven, y avisarlo es gratis.
 */
export function buscarColision(
  termino: string,
  catalogo: ProductoDelCatalogo[],
  productoIdPropio: string
): Colision | null {
  const objetivo = normalizarTermino(termino);
  if (!objetivo) return null;

  for (const producto of catalogo) {
    if (producto.id === productoIdPropio) continue;

    if (normalizarTermino(producto.nombre) === objetivo) {
      return {
        productoId: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        activo: producto.activo,
        contra: "nombre",
      };
    }
    if (producto.alias && normalizarTermino(producto.alias) === objetivo) {
      return {
        productoId: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        activo: producto.activo,
        contra: "nombre",
      };
    }
    for (const sinonimo of producto.sinonimos) {
      if (normalizarTermino(sinonimo.texto) === objetivo) {
        return {
          productoId: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          activo: producto.activo,
          contra: "sinonimo",
        };
      }
    }
  }
  return null;
}

/**
 * El slug de un producto nuevo. Es `codigo`, así que nace y no cambia nunca más.
 */
export function codigoDesdeNombre(nombre: string): string {
  return normalizarTermino(nombre)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);
}

export const ETIQUETA_ESPECIE: Record<"vacuno" | "porcino" | "aviar", string> = {
  vacuno: "Vacuno",
  porcino: "Cerdo",
  aviar: "Pollo",
};
