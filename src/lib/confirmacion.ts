import { normalizarTexto } from "./texto";

// Palabras "gatillo" que se reconocen SIN pasar por la IA de interpretación
// (respuesta instantánea, más barato y más predecible). Cualquier otra cosa
// que el carnicero responda a una operación pendiente se manda a la IA con
// el contexto de la operación (ver ContextoPendiente en interpretarStock.ts)
// — así "no, eran 12 kilos" se interpreta como corrección y no como
// cancelación, tal como pide la especificación de la botonera (22/08/2026).
//
// `normalizarTexto` ya saca acentos y pasa a minúsculas, así que estas
// listas van sin tildes (ej. "si" cubre también "sí").
//
// Las de CONFIRMACION son las que trajo el fundador en la especificación
// (punto 12): "Sí", "Si", "Confirmo", "Está bien", "Dale". El resto de las
// tres listas (variantes rioplatenses, cancelación, modificación) se
// ampliaron a pedido del fundador (22/08/2026: "agregar todas las
// variantes que pueda decir el carnicero, positivo, negativo o que
// busque modificar") — no es una lista cerrada, se puede seguir sumando.
//
// Regla de diseño para el "no" pelado: un "no" solo, sin nada más en el
// mensaje, se toma como CANCELAR (es la lectura más natural de un mensaje
// de una sola palabra). "no" seguido de cualquier otra cosa ("no, eran 12
// kilos", "no así no") NO matchea ninguna lista de acá => cae al flujo de
// corrección con la IA, tal como pide el punto 12 de la especificación.

const PALABRAS_CONFIRMACION = [
  // de la especificación original
  "si",
  "confirmo",
  "esta bien",
  "dale",
  // variantes rioplatenses / coloquiales de uso muy común
  "sisi",
  "si si",
  "si dale",
  "dale si",
  "de una",
  "de una piola",
  "confirmar",
  "confirmado",
  "confirmalo",
  "ok",
  "oka",
  "okay",
  "okey",
  "listo",
  "correcto",
  "exacto",
  "exactamente",
  "asi es",
  "eso es",
  "eso mismo",
  "afirmativo",
  "todo bien",
  "todo ok",
  "todo okay",
  "esta joya",
  "joya",
  "perfecto",
  "barbaro",
  "buenisimo",
  "va",
  "vamos",
  "dale va",
  "andale",
  "asi nomas",
  "asi nomas es",
  "👍",
  "👌",
  "✅",
];

const PALABRAS_CANCELACION = [
  "no",
  "nop",
  "nel",
  "no no",
  "nono",
  "cancelar",
  "cancela",
  "cancelo",
  "cancelalo",
  "anular",
  "anula",
  "anulalo",
  "olvidalo",
  "olvidate",
  "dejalo",
  "dejalo asi",
  "no importa",
  "no era nada",
  "no quiero",
  "no lo cargues",
  "no va",
  "borralo",
  "borrar",
  "sacalo",
  "eliminar",
  "❌",
  "👎",
];

const PALABRAS_MODIFICACION = [
  "modificar",
  "modifico",
  "corregir",
  "corrijo",
  "cambiar",
  "cambio",
  "esta mal",
  "mal",
  "error",
  "hay un error",
  "no es asi",
  "no esta bien",
  "no esta bien asi",
  "no es eso",
  "epa no",
  "che no",
  "esperá que no",
  "espera que no",
];

const SELECTORES_INVISIBLES = new RegExp(
  "[" + String.fromCharCode(0xfe0f) + String.fromCharCode(0x200d) + "]",
  "g"
);

function limpiar(texto: string): string {
  return normalizarTexto(texto)
    // WhatsApp le agrega a los emojis un "selector de variación" invisible
    // (U+FE0F) y a veces un "zero-width joiner" (U+200D) — sin sacarlos, un
    // 👍 que llega del celular no matchea el "👍" pelado de nuestras listas
    // (bug real, encontrado en la prueba del 22/08/2026: el 👍 del carnicero
    // no se reconoció como confirmación).
    .replace(SELECTORES_INVISIBLES, "")
    .replace(/[.,!¡¿?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coincideExacto(texto: string, palabras: string[]): boolean {
  return palabras.includes(limpiar(texto));
}

export type IntencionExplicita = "confirmar" | "cancelar" | "modificar" | null;

/**
 * Clasifica una respuesta como una de las tres intenciones "gatillo"
 * reconocidas por palabra/frase exacta, o null si no matchea ninguna — en
 * ese caso el llamador debe mandar el texto a interpretarMensajeStock con
 * el contexto de la operación pendiente (puede ser una corrección, una
 * respuesta a una aclaración, un dato faltante, etc.). El match es por
 * mensaje completo (no por substring) para no confundir una frase larga
 * que solo MENCIONA una de estas palabras con una respuesta corta real.
 */
export function clasificarRespuesta(texto: string): IntencionExplicita {
  if (coincideExacto(texto, PALABRAS_CONFIRMACION)) return "confirmar";
  if (coincideExacto(texto, PALABRAS_CANCELACION)) return "cancelar";
  if (coincideExacto(texto, PALABRAS_MODIFICACION)) return "modificar";
  return null;
}
