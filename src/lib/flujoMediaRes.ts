// ============================================================
// `flujoMediaRes.ts` — envoltorio fino sobre `flujoLotes.ts`
// ============================================================
//
// El flujo se generalizó a las tres especies cuando entraron pollo y cerdo.
// Este archivo queda solo para que lo que importaba de acá siga funcionando.
// Para código nuevo, importar de `flujoLotes.ts`.

export { probarComoLote as probarComoMediaRes, responderSobreLote as responderSobreMediaRes } from "./flujoLotes";
export { probarComoLote, responderSobreLote } from "./flujoLotes";
