// ============================================================
// `mediaRes.ts` — envoltorio fino sobre `lotes.ts`
// ============================================================
//
// El motor se generalizó a `lotes.ts` cuando entraron pollo y cerdo. No se
// clonó el archivo: un `flujoPollo.ts` copia de `flujoMediaRes.ts` es
// exactamente la duplicación que ya produjo un bug feo (dos lugares decidiendo
// lo mismo y uno decidiendo mal — ver `docs/bot-manual-de-arreglos.md`).
//
// Este archivo queda por una sola razón: que lo que ya importaba de acá siga
// funcionando sin tocarse. Para código nuevo, importar de `lotes.ts`.

import { cargarLote, type CategoriaAnimal, type ResultadoLote } from "./lotes";

export type { CategoriaAnimal };
export type {
  BalanceLote,
  CostoLote,
  MargenCorte,
  Especie,
  SalidaPesada,
  PiezaPorVencer,
  PrecargaTrozado,
} from "./lotes";

export {
  cargarLote,
  despostarLote,
  trozar,
  precargaDeTrozado,
  piezasPorVencer,
  consumirDeProducto,
  marcarCorteAgotado,
  pesarPieza,
  recalcularStock,
  balanceDeLote,
  cerrarLote,
  costoDeLote,
  margenPorCorte,
} from "./lotes";

export type ResultadoMediaRes = ResultadoLote;

/** Carga una media res vacuna. Atajo de `cargarLote` con especie 'vacuno'. */
export async function cargarMediaRes(params: {
  carniceriaId: string;
  categoria: CategoriaAnimal;
  pesoRecibidoKg: number;
  pesoFacturadoKg?: number | null;
  proveedor?: string | null;
  remito?: string | null;
  costoMercaderia?: number | null;
  costoFlete?: number | null;
}): Promise<ResultadoMediaRes> {
  return await cargarLote({ ...params, especie: "vacuno" });
}
