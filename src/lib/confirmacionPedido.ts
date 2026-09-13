import { normalizarParaComparar } from "./confirmacion";

// Palabras "gatillo" para que el CARNICERO decida sobre un pedido pendiente
// de aprobación — deliberadamente DISTINTAS de las de src/lib/confirmacion.ts
// (que se usan para el flujo de stock: "confirmar"/"modificar"/"cancelar")
// para que, si el carnicero tiene una operación de stock Y un pedido
// pendientes al mismo tiempo, cada respuesta se entienda sin ambigüedad.
//
// Por eso acá NO se usa el clasificador amplio de confirmacion.ts: un "dale"
// del carnicero podría ser la respuesta a cualquiera de las dos cosas. Lo
// único que se comparte es la limpieza del texto (`normalizarParaComparar`),
// para que haya UN solo lugar en el proyecto que sepa sacar los caracteres
// invisibles que WhatsApp le pega a los emojis y separar 👍 de las palabras.
//
// v1 no incluye "modificar" para pedidos (a diferencia de stock): si el
// carnicero quiere cambiar algo de un pedido, lo más simple para un piloto
// de bajo volumen es rechazarlo y que el bot le ofrezca las salidas numeradas
// (ver decisionCarnicero.ts).

const PALABRAS_APROBAR = [
  "aprobar",
  "aprobado",
  "apruebo",
  "apruebalo",
  "aprobalo",
  "aprobada",
  "dale aprobado",
  "dale aprobalo",
  "si aprobado",
  "ok aprobar",
  "listo aprobalo",
  "va aprobado",
  "👍",
  "👌",
  "✅",
  "✔",
];

const PALABRAS_RECHAZAR = [
  "rechazar",
  "rechazado",
  "rechazo",
  "rechazalo",
  "rechazada",
  "no aprobado",
  "no lo apruebo",
  "no puedo",
  "❌",
  "👎",
];

export type DecisionCarnicero = "aprobar" | "rechazar" | null;

export function clasificarDecisionCarnicero(texto: string): DecisionCarnicero {
  const limpio = normalizarParaComparar(texto);
  if (PALABRAS_APROBAR.includes(limpio)) return "aprobar";
  if (PALABRAS_RECHAZAR.includes(limpio)) return "rechazar";
  return null;
}
