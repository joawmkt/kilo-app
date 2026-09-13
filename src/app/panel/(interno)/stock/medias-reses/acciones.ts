"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import {
  cargarMediaRes,
  cerrarLote,
  marcarCorteAgotado,
  pesarPieza,
  type CategoriaAnimal,
} from "@/lib/mediaRes";

// Acciones de medias reses.
//
// TODAS empiezan con `requerirSesion()`, que lee la carnicería del usuario con
// Row Level Security. Recién después se usa la service_role, y siempre filtrando
// por ese `carniceria_id`. Una Server Action es un endpoint POST alcanzable
// desde afuera: si no se verifica acá, no se verifica en ningún lado.

export type ResultadoAccion = { ok: boolean; mensaje: string };

const CATEGORIAS: CategoriaAnimal[] = ["novillo", "novillito", "vaquillona", "vaca", "ternera"];

function revalidar() {
  revalidatePath("/panel/stock/medias-reses");
  revalidatePath("/panel/stock");
  revalidatePath("/panel");
}

export async function accionCargarMediaRes(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const categoriaCruda = String(datos.get("categoria") ?? "");
  if (!CATEGORIAS.includes(categoriaCruda as CategoriaAnimal)) {
    return { ok: false, mensaje: "Elegí qué categoría de animal es." };
  }

  const peso = numero(datos.get("peso_recibido_kg"));
  if (peso === null || peso <= 0) {
    return { ok: false, mensaje: "Poné el peso que marcó tu balanza al descargar." };
  }
  if (peso > 400) {
    // Una media res no pesa 400 kg ni en el mejor de los casos: casi seguro
    // alguien escribió los gramos o cargó la res entera.
    return { ok: false, mensaje: "Ese peso parece de una res entera, no de una media. ¿Lo revisás?" };
  }

  const resultado = await cargarMediaRes({
    carniceriaId: sesion.carniceria.id,
    categoria: categoriaCruda as CategoriaAnimal,
    pesoRecibidoKg: peso,
    pesoFacturadoKg: numero(datos.get("peso_facturado_kg")),
    proveedor: texto(datos.get("proveedor")),
    remito: texto(datos.get("remito")),
    costoMercaderia: numero(datos.get("costo_mercaderia")),
    costoFlete: numero(datos.get("costo_flete")),
  });

  revalidar();
  return { ok: resultado.ok, mensaje: resultado.mensaje };
}

export async function accionMarcarAgotado(productoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const resultado = await marcarCorteAgotado({
    carniceriaId: sesion.carniceria.id,
    productoId,
  });

  revalidar();

  // El desvío es información valiosa: es la tabla de rendimiento corrigiéndose
  // sola, sin que nadie haya pesado nada de más.
  if (resultado.ok && resultado.desvioPct !== undefined && Math.abs(resultado.desvioPct) >= 5) {
    const signo = resultado.desvioPct > 0 ? "más" : "menos";
    return {
      ok: true,
      mensaje: `${resultado.mensaje} Rindió ${Math.abs(resultado.desvioPct)} % ${signo} que lo estimado — lo anoto para afinar la tabla.`,
    };
  }

  return { ok: resultado.ok, mensaje: resultado.mensaje };
}

export async function accionPesarPieza(piezaId: string, kg: number): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  if (!(kg > 0)) return { ok: false, mensaje: "El peso tiene que ser mayor que cero." };

  const resultado = await pesarPieza({
    carniceriaId: sesion.carniceria.id,
    piezaId,
    kgReales: kg,
  });

  revalidar();
  return resultado;
}

export async function accionCerrarLote(loteId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const resultado = await cerrarLote({ carniceriaId: sesion.carniceria.id, loteId });
  revalidar();
  revalidatePath(`/panel/stock/medias-reses/${loteId}`);
  return { ok: resultado.ok, mensaje: resultado.mensaje };
}

function numero(valor: FormDataEntryValue | null): number | null {
  const crudo = String(valor ?? "").trim().replace(",", ".");
  if (!crudo) return null;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
}

function texto(valor: FormDataEntryValue | null): string | null {
  const crudo = String(valor ?? "").trim();
  return crudo || null;
}
