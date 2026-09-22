"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { despostarLote, terminarDesposte, trozar, type SalidaPesada } from "@/lib/lotes";
import type { Especie } from "@/lib/especies";

// Acciones del desposte pesado y del trozado.
//
// TODAS empiezan con `requerirSesion()`. Una Server Action es un endpoint POST
// alcanzable desde afuera: si no se verifica acá, no se verifica en ningún lado.

export type ResultadoDesposte = { ok: boolean; mensaje: string };

function revalidar() {
  revalidatePath("/panel/stock/desposte");
  revalidatePath("/panel/stock");
  revalidatePath("/panel/stock/medias-reses");
  revalidatePath("/panel");
}

/**
 * Lee las filas "codigo + kg" del formulario.
 *
 * Se ignoran las vacías en silencio: el carnicero pesa lo que separó, no una
 * lista completa. Lo que no pesó no es cero, es que no lo separó.
 */
function leerSalidas(datos: FormData): SalidaPesada[] {
  const salidas: SalidaPesada[] = [];
  for (const [clave, valor] of datos.entries()) {
    if (!clave.startsWith("kg_")) continue;
    const codigo = clave.slice(3);
    const kg = Number(String(valor).trim().replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0) continue;
    salidas.push({
      codigo,
      kg,
      esSubproducto: datos.get(`sub_${codigo}`) === "true",
    });
  }
  return salidas;
}

export async function accionCargarDesposte(
  _previo: ResultadoDesposte | null,
  datos: FormData
): Promise<ResultadoDesposte> {
  const sesion = await requerirSesion();
  const loteId = String(datos.get("lote_id") ?? "");
  if (!loteId) return { ok: false, mensaje: "Elegí de qué lote es el desposte." };

  const salidas = leerSalidas(datos);
  if (salidas.length === 0) {
    return { ok: false, mensaje: "Poné al menos un peso." };
  }

  const resultado = await despostarLote({
    carniceriaId: sesion.carniceria.id,
    loteId,
    salidas,
  });

  if (resultado.ok) revalidar();
  return { ok: resultado.ok, mensaje: resultado.mensaje };
}

/** "Terminé": lo que no se pesó es hueso y merma, y la media res se cierra. */
export async function accionTerminarDesposte(loteId: string): Promise<ResultadoDesposte> {
  const sesion = await requerirSesion();
  if (!loteId) return { ok: false, mensaje: "Elegí de qué lote." };
  const resultado = await terminarDesposte({ carniceriaId: sesion.carniceria.id, loteId });
  if (resultado.ok) revalidar();
  return resultado;
}

export async function accionTrozar(
  _previo: ResultadoDesposte | null,
  datos: FormData
): Promise<ResultadoDesposte> {
  const sesion = await requerirSesion();
  const especie = String(datos.get("especie") ?? "aviar") as Especie;
  const unidades = Math.floor(Number(datos.get("unidades") ?? 0));

  if (!(unidades > 0)) return { ok: false, mensaje: "¿Cuántos trozaste?" };

  const salidas = leerSalidas(datos);
  if (salidas.length === 0) {
    return { ok: false, mensaje: "Poné los pesos de lo que te salió." };
  }

  const resultado = await trozar({
    carniceriaId: sesion.carniceria.id,
    especie,
    unidades,
    salidas,
  });

  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje };

  revalidar();

  // La merma se dice siempre, incluso cuando es chica: es el número que el
  // carnicero no ve por ningún otro lado.
  const merma =
    resultado.merma > 0
      ? ` Se perdieron ${resultado.merma} kg entre el hueso que quedó y la merma (${(
          (resultado.merma / resultado.kgEntrada) *
          100
        ).toFixed(1)} %).`
      : "";

  return { ok: true, mensaje: `${resultado.mensaje}${merma}` };
}

/** El peso promedio real de las unidades en stock, para precargar el trozado. */
export async function pesoPromedioEnStock(
  carniceriaId: string,
  codigo: string
): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("piezas_stock")
    .select("kg_iniciales, productos!inner(codigo)")
    .eq("carniceria_id", carniceriaId)
    .eq("productos.codigo", codigo)
    .eq("estado", "disponible")
    .limit(50);

  const filas = (data ?? []) as unknown as { kg_iniciales: number }[];
  if (filas.length === 0) return null;
  return filas.reduce((suma, p) => suma + Number(p.kg_iniciales), 0) / filas.length;
}
