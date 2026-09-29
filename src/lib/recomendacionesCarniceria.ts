import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  OCASIONES_CONCRETAS,
  tablaDeFabrica,
  type OcasionConcreta,
  type TablaOcasiones,
} from "./recomendaciones";

// ============================================================
// La tabla de recomendaciones DE CADA CARNICERÍA (29/09/2026)
// ============================================================
//
// La de fábrica vive en recomendaciones.ts. Esta es la que el carnicero
// arma desde el panel (Catálogo → Recomendaciones), guardada en
// `recomendaciones_ocasion` (migración 0029).
//
// UNA sola regla decide cuál se usa, y está acá y en ningún otro lado
// (Patrón 1 del manual):
//   - la carnicería no guardó nunca nada  → la de fábrica;
//   - guardó algo alguna vez              → la suya, entera (una ocasión que
//     dejó vacía queda vacía: fue decisión del carnicero).
//
// Por eso la primera vez que guarda, se copia la de fábrica entera y recién
// después se aplica su cambio. Si no, al tocar "parrilla" se quedaría sin
// "horno", "milanesas" y todas las demás.

export type ItemDeOcasion = { productoId: string; rol: "corte" | "acompana" };

type Fila = {
  ocasion: OcasionConcreta;
  rol: "corte" | "acompana";
  orden: number;
  productos: { codigo: string } | null;
};

function tablaVacia(): TablaOcasiones {
  const tabla = {} as TablaOcasiones;
  for (const ocasion of OCASIONES_CONCRETAS) tabla[ocasion] = { cortes: [], acompanan: [] };
  return tabla;
}

/**
 * La tabla que usa esta carnicería, con CÓDIGOS de producto.
 *
 * Recibe el cliente de Supabase para servir a los dos lados: el panel lo lee
 * con la sesión del carnicero (RLS) y el bot con la service_role.
 */
export async function leerTablaDeCarniceria(
  cliente: SupabaseClient,
  carniceriaId: string
): Promise<{ tabla: TablaOcasiones; personalizada: boolean }> {
  const { data, error } = await cliente
    .from("recomendaciones_ocasion")
    .select("ocasion, rol, orden, productos(codigo)")
    .eq("carniceria_id", carniceriaId)
    .order("orden", { ascending: true });

  // Si la tabla todavía no existe (migración sin correr) o falla la lectura,
  // el bot sigue recomendando con la de fábrica: nunca se queda mudo por esto.
  if (error) {
    console.error("No se pudo leer la tabla de recomendaciones; se usa la de fábrica", error);
    return { tabla: tablaDeFabrica(), personalizada: false };
  }

  const filas = (data ?? []) as unknown as Fila[];
  if (filas.length === 0) return { tabla: tablaDeFabrica(), personalizada: false };

  const tabla = tablaVacia();
  for (const fila of filas) {
    if (!fila.productos || !tabla[fila.ocasion]) continue;
    const lista = fila.rol === "acompana" ? tabla[fila.ocasion].acompanan : tabla[fila.ocasion].cortes;
    lista.push(fila.productos.codigo);
  }
  return { tabla, personalizada: true };
}

/** Para el bot: la tabla vigente de la carnicería. */
export async function cargarTablaOcasiones(carniceriaId: string): Promise<TablaOcasiones> {
  return (await leerTablaDeCarniceria(getSupabaseAdmin(), carniceriaId)).tabla;
}

/** Los ids de los productos de esta carnicería, por código. */
async function idsPorCodigo(carniceriaId: string): Promise<Map<string, string>> {
  const { data } = await getSupabaseAdmin().from("productos").select("id, codigo").eq("carniceria_id", carniceriaId);
  return new Map(((data ?? []) as { id: string; codigo: string }[]).map((p) => [p.codigo, p.id]));
}

function filasDeFabrica(ocasion: OcasionConcreta, ids: Map<string, string>): ItemDeOcasion[] {
  const fabrica = tablaDeFabrica()[ocasion];
  const items: ItemDeOcasion[] = [];
  for (const codigo of fabrica.cortes) {
    const id = ids.get(codigo);
    if (id) items.push({ productoId: id, rol: "corte" });
  }
  for (const codigo of fabrica.acompanan) {
    const id = ids.get(codigo);
    if (id && !items.some((i) => i.productoId === id)) items.push({ productoId: id, rol: "acompana" });
  }
  return items;
}

async function reemplazarOcasion(carniceriaId: string, ocasion: OcasionConcreta, items: ItemDeOcasion[]): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { error: errorBorrar } = await admin
    .from("recomendaciones_ocasion")
    .delete()
    .eq("carniceria_id", carniceriaId)
    .eq("ocasion", ocasion);
  if (errorBorrar) return false;
  if (items.length === 0) return true;

  // El orden se numera por separado en cada lista (cortes y acompañan).
  const contador = { corte: 0, acompana: 0 };
  const filas = items.map((item) => ({
    carniceria_id: carniceriaId,
    ocasion,
    producto_id: item.productoId,
    rol: item.rol,
    orden: contador[item.rol]++,
  }));
  const { error } = await admin.from("recomendaciones_ocasion").insert(filas);
  return !error;
}

/**
 * Guarda la lista de UNA ocasión. Si es la primera vez que esta carnicería
 * guarda algo, antes copia la de fábrica de todas las demás ocasiones.
 */
export async function guardarOcasion(
  carniceriaId: string,
  ocasion: OcasionConcreta,
  items: ItemDeOcasion[]
): Promise<boolean> {
  const { personalizada } = await leerTablaDeCarniceria(getSupabaseAdmin(), carniceriaId);
  if (!personalizada) {
    const ids = await idsPorCodigo(carniceriaId);
    for (const otra of OCASIONES_CONCRETAS) {
      if (otra === ocasion) continue;
      if (!(await reemplazarOcasion(carniceriaId, otra, filasDeFabrica(otra, ids)))) return false;
    }
  }
  return await reemplazarOcasion(carniceriaId, ocasion, items);
}

/** Vuelve UNA ocasión a como venía de fábrica (solo con productos que esta carnicería tiene). */
export async function restaurarOcasion(carniceriaId: string, ocasion: OcasionConcreta): Promise<boolean> {
  const { personalizada } = await leerTablaDeCarniceria(getSupabaseAdmin(), carniceriaId);
  if (!personalizada) return true; // ya está la de fábrica
  const ids = await idsPorCodigo(carniceriaId);
  return await reemplazarOcasion(carniceriaId, ocasion, filasDeFabrica(ocasion, ids));
}
