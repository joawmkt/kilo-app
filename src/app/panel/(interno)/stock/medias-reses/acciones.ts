"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { cargarLote } from "@/lib/lotes";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

/**
 * Lo que entra, cargado a mano desde el panel (respaldo del audio al bot).
 *
 * Pedido del fundador (28/09/2026): "se deben poder cargar medias reses de
 * cerdo y cajones de pollo de forma manual también". Antes este formulario
 * solo sabía de vacuno. Los tres caminos terminan en `cargarLote`, el MISMO
 * que usa el bot, así que un cajón cargado acá y uno cargado por WhatsApp
 * quedan exactamente iguales en el stock.
 */
export async function accionCargarMediaRes(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const tipo = String(datos.get("tipo") ?? "vacuno");

  if (tipo === "cerdo_media" || tipo === "cerdo_entero") {
    return await cargarCerdo(sesion.carniceria.id, tipo === "cerdo_entero", datos);
  }
  if (tipo === "pollo") {
    return await cargarCajonDePollo(sesion.carniceria.id, datos);
  }

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

// Cerdo: el lote se abre vacío y las piezas nacen cuando se desposta y se pesa
// (igual que por el bot). Un cerdo ENTERO son dos medias: se cargan como dos
// lotes de la mitad del peso, cada uno con su propio desposte y su rinde.
async function cargarCerdo(carniceriaId: string, entero: boolean, datos: FormData): Promise<ResultadoAccion> {
  const peso = numero(datos.get("peso_recibido_kg"));
  if (peso === null || peso <= 0) {
    return { ok: false, mensaje: "Poné el peso que marcó tu balanza al descargar." };
  }
  // Una media res de cerdo anda por los 35-60 kg y un cerdo entero por el
  // doble. Más que eso casi seguro es un error de tipeo (gramos, un cero de más).
  if (!entero && peso > 150) {
    return { ok: false, mensaje: "Ese peso parece de un cerdo entero, no de una media. Si es entero, elegí \"Cerdo entero\"." };
  }
  if (entero && peso > 300) {
    return { ok: false, mensaje: "Ese peso es muy alto para un cerdo. ¿Lo revisás?" };
  }

  const partes = entero ? 2 : 1;
  const dividir = (valor: number | null) => (valor === null ? null : Math.round((valor / partes) * 1000) / 1000);
  const pesoFacturado = numero(datos.get("peso_facturado_kg"));
  const costo = numero(datos.get("costo_mercaderia"));
  const flete = numero(datos.get("costo_flete"));

  let ultimo = "";
  for (let i = 0; i < partes; i++) {
    const resultado = await cargarLote({
      carniceriaId,
      especie: "porcino",
      categoria: null,
      pesoRecibidoKg: dividir(peso)!,
      pesoFacturadoKg: dividir(pesoFacturado),
      proveedor: texto(datos.get("proveedor")),
      remito: texto(datos.get("remito")),
      costoMercaderia: dividir(costo),
      costoFlete: dividir(flete),
    });
    if (!resultado.ok) {
      revalidar();
      return { ok: false, mensaje: i === 0 ? resultado.mensaje : `Cargué una media y la otra falló: ${resultado.mensaje}` };
    }
    ultimo = resultado.mensaje;
  }

  revalidar();
  if (!entero) return { ok: true, mensaje: ultimo };
  return {
    ok: true,
    mensaje: `Anotado: cerdo entero de ${peso} kg, cargado como 2 medias reses de ${dividir(peso)} kg. Cuando las despostes, cargá los pesos desde cada una (o mandale un audio al bot).`,
  };
}

// Pollo: un cajón de N cabezas. El peso es el del cajón (el de la carnicería
// si no se escribe otro), y cada pollo nace como una pieza de peso/cabezas.
async function cargarCajonDePollo(carniceriaId: string, datos: FormData): Promise<ResultadoAccion> {
  const cabezas = numero(datos.get("unidades"));
  if (cabezas === null || !Number.isInteger(cabezas) || cabezas <= 0) {
    return { ok: false, mensaje: "Poné cuántos pollos trae el cajón (un número entero)." };
  }
  if (cabezas > 60) {
    return { ok: false, mensaje: "Son muchos pollos para un solo cajón. Si llegaron varios cajones, cargalos de a uno." };
  }

  let peso = numero(datos.get("peso_recibido_kg"));
  if (peso === null) {
    const { data } = await getSupabaseAdmin()
      .from("carnicerias")
      .select("peso_cajon_pollo_kg")
      .eq("id", carniceriaId)
      .maybeSingle();
    const delLocal = Number(data?.peso_cajon_pollo_kg ?? 0);
    peso = delLocal > 0 ? delLocal : 20;
  }
  if (peso <= 0 || peso > 60) {
    return { ok: false, mensaje: "El peso del cajón tiene que estar entre 0 y 60 kg. ¿Lo revisás?" };
  }

  const resultado = await cargarLote({
    carniceriaId,
    especie: "aviar",
    categoria: null,
    pesoRecibidoKg: peso,
    unidades: cabezas,
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
