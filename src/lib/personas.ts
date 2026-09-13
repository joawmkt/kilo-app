import { normalizarTexto } from "./texto";
import type { InfoPersonas } from "./interpretarPedido";

// ============================================================
// "¿cuántos hombres y cuántas mujeres?" — leído SIN IA
// ============================================================
//
// Por qué existe este archivo (bug del 13/09/2026):
//
//   Bot:     "¿más o menos cuántos de esos 2 son hombres y cuántas mujeres?"
//   Cliente: "1 y 1"
//   Bot:     "¿más o menos cuántos de esos 2 son hombres y cuántas mujeres?"
//
// El intérprete general tenía que sacar hombres=1 y mujeres=1 de un mensaje
// de tres caracteres sin ningún sustantivo, y no lo hizo. Y como la pregunta
// se volvía a armar igual, el cliente veía el mismo texto dos veces.
//
// Es exactamente el Patrón 3 del manual de arreglos: se le estaba pidiendo al
// modelo una decisión que no necesita modelo. Cuando la pregunta que acabamos
// de hacer ES la del desglose por género, la respuesta es un puñado de formas
// contadas ("1 y 1", "2 varones y 1 mujer", "todos hombres", "mitad y mitad")
// y se leen con texto plano, sin dudar y sin costo.
//
// **Esto NO reemplaza al intérprete: lo respalda.** El mensaje sigue yendo a
// la IA igual (para no perder datos extra que el cliente meta en la misma
// frase, tipo "1 y 1, y paso a las 8"). Si la IA trae el desglose, gana la
// IA. Si no lo trae, se usa esto. Nunca al revés.

const NUMEROS_ESCRITOS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, veinte: 20,
};

const PALABRAS_HOMBRE = [
  "hombre", "hombres", "varon", "varones", "chico", "chicos", "pibe", "pibes",
  "muchacho", "muchachos", "masculino", "masculinos", "tipo", "tipos", "h", "v",
];

const PALABRAS_MUJER = [
  "mujer", "mujeres", "chica", "chicas", "piba", "pibas", "señora", "senora",
  "senoras", "dama", "damas", "femenino", "femeninas", "femeninos", "mina",
  "minas", "m",
];

/** Convierte "3" o "tres" en 3. Devuelve null si no es un número. */
function aNumero(palabra: string): number | null {
  if (/^\d+$/.test(palabra)) {
    const n = Number(palabra);
    return Number.isFinite(n) && n >= 0 && n <= 200 ? n : null;
  }
  const escrito = NUMEROS_ESCRITOS[palabra];
  return escrito === undefined ? null : escrito;
}

function palabras(texto: string): string[] {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Lee el desglose por género de la respuesta del cliente.
 *
 * `totalConocido` es el total que el cliente ya había dado sin desglosar
 * ("somos 2"). Sirve para dos cosas: completar por resta cuando solo nombra
 * un género ("2 son mujeres" con total 5 → 3 hombres) y resolver
 * "todos hombres" / "mitad y mitad".
 *
 * Devuelve null si no se puede leer con certeza — y ahí no se inventa nada:
 * el flujo repregunta (distinto) o pasa al promedio.
 */
export function leerDesglosePersonas(texto: string, totalConocido?: number): InfoPersonas | null {
  const tokens = palabras(texto);
  if (tokens.length === 0) return null;

  // ------------------------------------------------------------
  // 1. "todos hombres" / "todas mujeres" / "somos todos varones"
  // ------------------------------------------------------------
  const dice = (lista: string[]) => tokens.some((t) => lista.includes(t));
  const hayTodos = tokens.some((t) => ["todos", "todas", "puros", "puras", "solo", "solamente"].includes(t));
  if (hayTodos && totalConocido != null) {
    if (dice(PALABRAS_HOMBRE) && !dice(PALABRAS_MUJER)) return { hombres: totalConocido, mujeres: 0 };
    if (dice(PALABRAS_MUJER) && !dice(PALABRAS_HOMBRE)) return { hombres: 0, mujeres: totalConocido };
  }

  // ------------------------------------------------------------
  // 2. "mitad y mitad"
  // ------------------------------------------------------------
  const mitades = tokens.filter((t) => t === "mitad").length;
  if (mitades >= 2 && totalConocido != null && totalConocido % 2 === 0) {
    return { hombres: totalConocido / 2, mujeres: totalConocido / 2 };
  }

  // ------------------------------------------------------------
  // 3. Números pegados a una palabra de género: "2 varones y 1 mujer",
  //    "1 mujer y 2 hombres" (el orden lo pone el cliente, no nosotros)
  // ------------------------------------------------------------
  let hombres: number | undefined;
  let mujeres: number | undefined;
  const numerosSueltos: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const n = aNumero(tokens[i]);
    if (n === null) continue;

    // Se mira la palabra siguiente y, si es de relleno ("y", "son"), la que
    // sigue: "2 son hombres" tiene que leerse igual que "2 hombres".
    let etiqueta: string | undefined;
    for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
      const t = tokens[j];
      if (["y", "son", "somos", "de", "personas", "gente"].includes(t)) continue;
      etiqueta = t;
      break;
    }

    if (etiqueta && PALABRAS_HOMBRE.includes(etiqueta)) {
      hombres = (hombres ?? 0) + n;
    } else if (etiqueta && PALABRAS_MUJER.includes(etiqueta)) {
      mujeres = (mujeres ?? 0) + n;
    } else {
      numerosSueltos.push(n);
    }
  }

  if (hombres != null && mujeres != null) return { hombres, mujeres };

  // Nombró un solo género y sabemos el total: el resto es del otro.
  if (hombres != null && mujeres == null && totalConocido != null && totalConocido >= hombres) {
    return { hombres, mujeres: totalConocido - hombres };
  }
  if (mujeres != null && hombres == null && totalConocido != null && totalConocido >= mujeres) {
    return { hombres: totalConocido - mujeres, mujeres };
  }

  // ------------------------------------------------------------
  // 4. Dos números pelados: "1 y 1", "2 y 2", "3 1"
  // ------------------------------------------------------------
  //
  // El orden sale de cómo preguntamos SIEMPRE ("cuántos son hombres y cuántas
  // mujeres"): el primero es hombres. Si algún día se cambia la redacción de
  // `armarPreguntaPersonas`, hay que cambiar esto también — están atados.
  if (hombres == null && mujeres == null && numerosSueltos.length === 2) {
    const [a, b] = numerosSueltos;
    // Si sabemos el total, se usa como control: "1 y 1" contra un total de 2
    // cierra. Si no cierra, mejor no adivinar.
    if (totalConocido == null || a + b === totalConocido) return { hombres: a, mujeres: b };
    return null;
  }

  // ------------------------------------------------------------
  // 5. Un solo número pelado contra un total conocido: "1" sobre 2 personas
  //    -> 1 hombre y 1 mujer.
  // ------------------------------------------------------------
  if (
    hombres == null &&
    mujeres == null &&
    numerosSueltos.length === 1 &&
    totalConocido != null &&
    numerosSueltos[0] <= totalConocido
  ) {
    return { hombres: numerosSueltos[0], mujeres: totalConocido - numerosSueltos[0] };
  }

  return null;
}
