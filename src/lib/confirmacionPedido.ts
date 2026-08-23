import { normalizarTexto } from "./texto";

// Palabras "gatillo" para que el CARNICERO decida sobre un pedido pendiente
// de aprobación — deliberadamente DISTINTAS de las de src/lib/confirmacion.ts
// (que se usan para el flujo de stock: "confirmar"/"modificar"/"cancelar")
// para que, si el carnicero tiene una operación de stock Y un pedido
// pendientes al mismo tiempo, cada respuesta se entienda sin ambigüedad.
// Esta es la respuesta provisoria a la pregunta 2 del Bloque A (todavía sin
// cerrar) — se puede ajustar la redacción sin tocar el resto del flujo.
//
// v1 no incluye "modificar" para pedidos (a diferencia de stock): si el
// carnicero quiere cambiar algo de un pedido, lo más simple para un piloto
// de bajo volumen es rechazarlo y que hable directo con el cliente fuera
// del bot. Se puede sumar más adelante si hace falta.

const PALABRAS_APROBAR = [
  "aprobar",
  "aprobado",
  "apruebo",
  "apruebalo",
  "aprobalo",
  "dale aprobado",
  "si aprobado",
  "👍",
  "✅",
];

const PALABRAS_RECHAZAR = ["rechazar", "rechazado", "rechazo", "rechazalo", "no aprobado", "❌", "👎"];

const SELECTORES_INVISIBLES = new RegExp(
  "[" + String.fromCharCode(0xfe0f) + String.fromCharCode(0x200d) + "]",
  "g"
);

function limpiar(texto: string): string {
  return normalizarTexto(texto)
    .replace(SELECTORES_INVISIBLES, "")
    .replace(/[.,!¡¿?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type DecisionCarnicero = "aprobar" | "rechazar" | null;

export function clasificarDecisionCarnicero(texto: string): DecisionCarnicero {
  const limpio = limpiar(texto);
  if (PALABRAS_APROBAR.includes(limpio)) return "aprobar";
  if (PALABRAS_RECHAZAR.includes(limpio)) return "rechazar";
  return null;
}
