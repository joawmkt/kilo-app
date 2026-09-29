"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { OCASIONES_CONCRETAS, tituloDeOcasion, type OcasionConcreta } from "@/lib/recomendaciones";
import { guardarOcasion, restaurarOcasion, type ItemDeOcasion } from "@/lib/recomendacionesCarniceria";

// Acciones de la tabla de recomendaciones.
//
// Como todas las del panel: primero `requerirSesion()` (que lee la carnicería
// del usuario con RLS), y recién después la service_role, siempre filtrando
// por ESA carnicería. Una Server Action es un endpoint alcanzable desde
// afuera: lo que no se verifica acá no se verifica en ningún lado.

export type ResultadoRecomendacion = { ok: boolean; mensaje: string };

const MAXIMO_ITEMS = 60;

function esOcasion(valor: string): valor is OcasionConcreta {
  return (OCASIONES_CONCRETAS as string[]).includes(valor);
}

function revalidar() {
  revalidatePath("/panel/catalogo/recomendaciones");
}

export async function accionGuardarRecomendacion(
  ocasion: string,
  items: ItemDeOcasion[]
): Promise<ResultadoRecomendacion> {
  const sesion = await requerirSesion();
  if (!esOcasion(ocasion)) return { ok: false, mensaje: "No conozco esa ocasión." };
  if (!Array.isArray(items) || items.length > MAXIMO_ITEMS) {
    return { ok: false, mensaje: "La lista es demasiado larga. Dejá lo que de verdad ofrecés." };
  }

  // Limpio: sin repetidos, con rol válido.
  const vistos = new Set<string>();
  const limpios: ItemDeOcasion[] = [];
  for (const item of items) {
    if (!item || typeof item.productoId !== "string" || vistos.has(item.productoId)) continue;
    vistos.add(item.productoId);
    limpios.push({ productoId: item.productoId, rol: item.rol === "acompana" ? "acompana" : "corte" });
  }

  // Todos los productos tienen que ser de ESTA carnicería.
  if (limpios.length > 0) {
    const { data } = await getSupabaseAdmin()
      .from("productos")
      .select("id")
      .eq("carniceria_id", sesion.carniceria.id)
      .in(
        "id",
        limpios.map((i) => i.productoId)
      );
    if ((data ?? []).length !== limpios.length) {
      return { ok: false, mensaje: "Uno de los productos no es de tu catálogo. Recargá la pantalla y probá de nuevo." };
    }
  }

  const ok = await guardarOcasion(sesion.carniceria.id, ocasion, limpios);
  revalidar();
  if (!ok) return { ok: false, mensaje: "No pude guardar los cambios. Probá de nuevo en un rato." };
  return {
    ok: true,
    mensaje: `Listo. Desde el próximo mensaje, el bot recomienda así ${tituloDeOcasion(ocasion).toLowerCase()}.`,
  };
}

export async function accionRestaurarRecomendacion(ocasion: string): Promise<ResultadoRecomendacion> {
  const sesion = await requerirSesion();
  if (!esOcasion(ocasion)) return { ok: false, mensaje: "No conozco esa ocasión." };
  const ok = await restaurarOcasion(sesion.carniceria.id, ocasion);
  revalidar();
  if (!ok) return { ok: false, mensaje: "No pude restaurarla. Probá de nuevo en un rato." };
  return { ok: true, mensaje: "Volvió a como venía de fábrica." };
}
