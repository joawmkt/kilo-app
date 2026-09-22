// ============================================================
// `interpretarMediaRes.ts` — envoltorio fino sobre `interpretarLote.ts`
// ============================================================
//
// ACÁ NO HAY NINGÚN REGEX, Y ES A PROPÓSITO.
//
// Cuando entraron pollo y cerdo, la detección se unificó en `interpretarLote.ts`
// porque dos compuertas compitiendo por la misma frase es el bug que se venía
// venir: "media res de cerdo" dice "media res", así que un regex de vacuno la
// agarraría y la explotaría con la tabla de novillo. Dejar acá una copia del
// patrón "por las dudas" reintroduciría exactamente ese problema.
//
// Este archivo queda solo para que lo que importaba de acá siga funcionando.

import { detectarEspecieDeLote } from "./interpretarLote";

export { interpretarLote, mencionaLote, detectarEspecieDeLote } from "./interpretarLote";
export type { ResultadoLoteVoz } from "./interpretarLote";

/** ¿El mensaje habla de una media res VACUNA? Ojo: la de cerdo no cuenta acá. */
export function mencionaMediaRes(texto: string): boolean {
  return detectarEspecieDeLote(texto) === "vacuno";
}
