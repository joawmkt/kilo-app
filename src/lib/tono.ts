// ============================================================
// Cómo habla el bot (30/09/2026)
// ============================================================
//
// Pedido del fundador: "Tiene que hablar como un carnicero, con confianza,
// como si estuviera hablando con amigos. NO ESTRUCTURADO, debe variar sus
// respuestas y ser más humano. Nadie dice 'Entendido' en Argentina".
//
// Dos herramientas, las dos acá para que haya UN lugar que decida el tono:
//
//   1. `elegir(variantes)`: las frases fijas del bot tienen varias versiones
//      y se elige una al azar. Un carnicero no contesta dos veces igual.
//   2. `suavizar(texto)`: las preguntas que escribe la IA pasan por un filtro
//      que saca las muletillas de call center ("Entendido", "Perfecto,
//      necesito que me digas exactamente...", "¿Te preparo algo?" al final de
//      todo). La IA ya tiene la regla en el prompt; esto es la red por si se
//      le escapa (Patrón 3: lo que se puede asegurar con texto, se asegura
//      con texto).
//
// Este archivo no importa nada: se puede probar solo.

/** Una de las variantes, al azar. `evitar` es la última que se dijo, si se sabe. */
export function elegir(variantes: readonly string[], evitar?: string | null): string {
  const candidatas = evitar ? variantes.filter((v) => v !== evitar) : variantes;
  const lista = candidatas.length > 0 ? candidatas : variantes;
  return lista[Math.floor(Math.random() * lista.length)] ?? "";
}

// Frases de call center → cómo lo diría alguien del mostrador. El orden
// importa: las más largas primero.
const REEMPLAZOS: [RegExp, string][] = [
  [/^\s*(entendido|entiendo|comprendo|de acuerdo|perfecto|excelente|muy bien)[,.!]*\s*(necesito que me (digas|indiques|confirmes)|necesitaría que me (digas|indiques))\s*(exactamente\s*)?/i, "Dale, decime "],
  [/^\s*(necesito que me (digas|indiques|confirmes)|necesitaría que me (digas|indiques)|por favor,? (indicame|decime))\s*(exactamente\s*)?/i, "Decime "],
  [/^\s*(entendido|comprendo|entiendo|de acuerdo|anotado|recibido)[,.!]+\s*/i, "Dale, "],
  [/^\s*(entendido|comprendo|de acuerdo|recibido)\s*$/i, "Dale"],
  [/^\s*perfecto[,.!]+\s*/i, "Joya, "],
  [/^\s*excelente[,.!]+\s*/i, "Buenísimo, "],
  [/\bexactamente\s+/gi, ""],
  [/\bpor favor,?\s+/gi, ""],
  [/\s*\(por ejemplo:[^)]*\)/gi, ""],
  [/\bdesea(s)?\b/gi, "querés"],
  [/\bpuede(s)? indicarme\b/gi, "me decís"],
  [/\busted\b/gi, "vos"],
];

// "¿Te preparo algo?" / "¿Te preparo algo más?" al final: el fundador lo
// marcó como insoportable. Se saca de lo que escribe la IA; las frases fijas
// del bot lo dicen solo cuando corresponde (ver `cierreDeConsulta`).
const COLA_INSISTENTE = /\s*¿\s*(te preparo|querés que te prepare|te separo|te armo|querés pedir|te puedo ayudar con) algo( más)?\s*\??\s*$/i;

/** Le saca a un texto de la IA las muletillas que no diría un carnicero. */
export function suavizar(texto: string): string {
  let t = texto;
  for (const [patron, reemplazo] of REEMPLAZOS) t = t.replace(patron, reemplazo);
  t = t.replace(COLA_INSISTENTE, "");
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([?.,!])/g, "$1").trim();
  // "Dale, decime cuántos..." — la primera letra después de lo reemplazado.
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Cómo terminar una respuesta a una consulta. La mitad de las veces no se
 * agrega nada (el cliente ya sabe que puede pedir); si hay un pedido en
 * curso, nunca: ahí lo que corresponde es seguir con lo que estaba pendiente.
 */
export function cierreDeConsulta(hayPedidoEnCurso: boolean): string {
  if (hayPedidoEnCurso || Math.random() < 0.5) return "";
  return ` ${elegir(["Si querés te lo separo.", "Decime y te lo aparto.", "Si te sirve, te lo dejo listo.", "Cualquier cosa me decís."])}`;
}

// Frases fijas que se repiten mucho, con sus variantes.
export const FRASES = {
  encabezadoResumen: ["Te dejo armado esto:", "Va quedando así:", "Esto es lo que te separo:", "Te preparo esto:"],
  preguntaResumen: ["¿Va así?", "¿Así está bien?", "¿Te lo dejo así?", "¿Lo cerramos así?"],
  preguntaHora: ["¿A qué hora pasás a buscarlo?", "¿A qué hora te viene bien pasar?", "¿Para qué hora te lo dejo listo?"],
  cierre: [
    "¡De nada! Cualquier cosa me escribís 🙌",
    "¡Gracias a vos! Acá estoy para lo que necesites 👋",
    "¡Un placer! Nos vemos 🙌",
    "¡De nada, un gusto! Cualquier cosa, acá ando.",
  ],
  cargarUno: ["¿La cargo?", "¿Te la cargo?", "¿La cargo así?"],
  cargarVarias: ["¿Las cargo?", "¿Te las cargo?", "¿Las cargo así?"],
  cargarCajon: ["¿Lo cargo?", "¿Te lo cargo?", "¿Lo cargo así?"],
  cargarCajones: ["¿Los cargo?", "¿Te los cargo?", "¿Los cargo así?"],
  listoCarnicero: ["Listo 👍", "Hecho 👍", "Joya, listo 👍", "Ya está 👍"],
} as const;

// ------------------------------------------------------------
// "Gracias", "te agradezco", "chau": saber cerrar la charla
// ------------------------------------------------------------

const PALABRAS_DE_CIERRE = new Set([
  "gracias", "gracia", "grax", "graciass", "agradezco", "agradecido", "agradecida", "chau", "chao", "saludos",
  "abrazo", "abrazos", "bendiciones", "genio", "genia", "crack", "idolo", "capo", "capa", "maestro",
]);
const FRASES_DE_CIERRE = [/\bnos vemos\b/, /\bhasta (luego|mañana|manana|pronto|la proxima)\b/, /\bque (andes|estes) bien\b/, /\bbuen (dia|finde|fin de semana)\b/];

// Palabras que pueden acompañar un "gracias" sin cambiar nada.
const ACOMPANAN_CIERRE = new Set([
  "muchas", "mil", "muchisimas", "te", "le", "lo", "la", "por", "todo", "toda", "un", "una", "gran", "genial",
  "buenisimo", "joya", "listo", "perfecto", "dale", "ok", "oka", "okey", "bueno", "bien", "barbaro", "excelente",
  "igualmente", "vos", "tambien", "che", "amigo", "amiga", "hermano", "hermana", "loco", "querido", "querida",
  "y", "que", "a", "de", "nada", "super", "re", "muy", "atencion", "ayuda", "onda", "buena", "tanto", "nos",
  "vemos", "hasta", "luego", "manana", "pronto", "andes", "estes", "buen", "dia", "finde",
]);

/**
 * ¿El mensaje es solo un agradecimiento o una despedida? ("gracias por todo",
 * "genial, te agradezco", "dale, gracias crack", "chau, nos vemos").
 *
 * Bug del 30/09: "gracias por todo" se contestó "No relacioné 'gracias por
 * todo' con un pedido". Un "gracias" se contesta con un "de nada".
 */
export function esCierre(texto: string): boolean {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;
  const palabras = t.split(" ");
  const tieneCierre = palabras.some((p) => PALABRAS_DE_CIERRE.has(p)) || FRASES_DE_CIERRE.some((f) => f.test(t));
  if (!tieneCierre) return false;
  return palabras.every((p) => PALABRAS_DE_CIERRE.has(p) || ACOMPANAN_CIERRE.has(p));
}
