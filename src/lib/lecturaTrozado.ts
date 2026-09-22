// ============================================================
// "Trocé 3 pollos y saqué 2,700 de pechuga" — leído SIN IA
// ============================================================
//
// Por qué sin IA (bug del 22/09/2026): el carnicero dijo "trocé un pollo que
// pesaba 2,25 kg" y el bot le preguntó "¿cuántos pollos trozaste?". Después
// "1", "no te entendí", "1", y un resumen "Pollo entero −1 → ?". Y con "trocé 3
// pollos y saqué 2,700 de pechuga" preguntó "¿cuántos kilos pesó el pollo que
// no usaste para pechuga?", que no tiene respuesta.
//
// Un trozado se dice siempre con las mismas tres piezas: cuántos pollos, (a
// veces) cuánto pesaban, y (a veces) cuánto pesó alguna presa. Es el Patrón 3
// del manual: las palabras están o no están, y un número pegado a "pechuga" es
// el peso de la pechuga. No hace falta un modelo para eso; hace falta no dudar.
//
// Este archivo no tiene dependencias de base de datos: se puede probar solo.

const NUMEROS_ESCRITOS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

export function normalizarTrozado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*(kgs?|kilos?|k|gr|grs|gramos|g)\b/g, "$1 $2")
    .replace(/[^a-z0-9.,\s]/g, " ")
    // Una coma que no está entre dígitos es puntuación ("2 pollos, la pechuga"),
    // no un decimal ("2,7"). Se la saca para que no se pegue a las palabras.
    .replace(/,(?!\d)/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Habla de trozar pollo? */
export function hablaDeTrozado(texto: string): boolean {
  const t = normalizarTrozado(texto);
  return /\btro(c|z)\w*/.test(t) && /\bpollos?\b/.test(t);
}

/** "2.700 k" -> 2,7; "2,25" -> 2,25; "2700" -> 2,7 (gramos dichos de corrido). */
export function leerKg(numero: string, unidad?: string): number | null {
  let n = Number(numero.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unidad && /^(g|gr|grs|gramos)$/.test(unidad)) n = n / 1000;
  else if (n >= 100) n = n / 1000;
  return Math.round(n * 1000) / 1000;
}

export type LecturaTrozado = {
  /** Cuántos pollos. null si no lo dijo. */
  unidades: number | null;
  /** Cuánto pesaba CADA pollo, si lo dijo. */
  kgPorUnidad: number | null;
  /** Presas pesadas: vocabulario encontrado -> kg. */
  pesadas: { codigo: string; kg: number }[];
};

export type VocabularioPresa = { codigo: string; palabras: string[] };

// Palabras donde se corta la búsqueda hacia atrás del número de una presa:
// "pesaba 2,25 kg y saqué la pechuga" — el 2,25 es del pollo, no de la pechuga.
const CORTES = new Set(["y", "que", "pesaba", "pesaban", "pesaron", "peso", "saque", "saco", "sacamos", "salio", "salieron", "trozado", "troce", "troze", "trozo"]);

/**
 * Lee un mensaje de trozado. `presas` es el vocabulario de las presas que se
 * pueden pesar (sale del catálogo: nombre, alias y sinónimos de cada una).
 */
export function leerTrozado(texto: string, presas: VocabularioPresa[]): LecturaTrozado {
  const t = normalizarTrozado(texto);
  const tokens = t.split(" ");

  // ---- Cuántos pollos ----
  let unidades: number | null = null;
  const mCuantos = t.match(/\b(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+pollos?\b/);
  if (mCuantos) {
    const crudo = mCuantos[1];
    unidades = /^\d+$/.test(crudo) ? Number(crudo) : NUMEROS_ESCRITOS[crudo] ?? null;
  } else if (/^\s*(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*$/.test(t)) {
    // Respuesta suelta a "¿cuántos pollos trozaste?"
    const crudo = t.trim();
    unidades = /^\d+$/.test(crudo) ? Number(crudo) : NUMEROS_ESCRITOS[crudo] ?? null;
  }

  // ---- Cuánto pesaba el pollo ----
  let kgPorUnidad: number | null = null;
  // Solo cuenta si el "pesaba" es del POLLO ("un pollo que pesaba 2,25"): en
  // "6 pechugas que pesaron 2,700" el peso es de las pechugas.
  const mPeso = t.match(
    /\bpollos?\s+(?:enteros?\s+)?(?:que\s+|q\s+)?pes(?:aba|aban|aron|o)\s+(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|k|gr|grs|gramos|g)?/
  );
  if (mPeso) {
    const kg = leerKg(mPeso[1], mPeso[2]);
    if (kg !== null) {
      // "pesaban 7,5" con 3 pollos es el total; "pesaba 2,25" es uno. Un pollo
      // no pesa más de 4 kg: si el número es más grande, es el total.
      kgPorUnidad = kg > 4 && unidades && unidades > 1 ? Math.round((kg / unidades) * 1000) / 1000 : kg;
    }
  }

  // ---- Presas pesadas ----
  const pesadas = new Map<string, number>();
  for (const presa of presas) {
    for (const palabra of presa.palabras) {
      const partes = palabra.split(" ");
      for (let i = 0; i <= tokens.length - partes.length; i++) {
        if (partes.some((p, j) => tokens[i + j] !== p)) continue;
        // Hacia atrás, buscando "2,700 k de" pegado a la presa.
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const tok = tokens[j];
          if (CORTES.has(tok)) break;
          if (/^\d+([.,]\d+)?$/.test(tok)) {
            const siguiente = tokens[j + 1];
            const unidad = siguiente && /^(kgs?|kilos?|k|gr|grs|gramos|g)$/.test(siguiente) ? siguiente : undefined;
            // "6 pechugas" es una CANTIDAD de presas, no un peso: un entero sin
            // unidad y sin "de" pegado a la presa se saltea, y el peso se busca
            // hacia adelante ("6 pechugas que pesaron 2,700").
            const esPeso = Boolean(unidad) || siguiente === "de" || /[.,]/.test(tok);
            if (esPeso) {
              const kg = leerKg(tok, unidad);
              if (kg !== null && !pesadas.has(presa.codigo)) pesadas.set(presa.codigo, kg);
            }
            break;
          }
        }
        // Y hacia adelante: "la pechuga pesó 2,7".
        if (!pesadas.has(presa.codigo)) {
          const resto = tokens.slice(i + partes.length, i + partes.length + 4).join(" ");
          const m = resto.match(
            /^(?:(?:que|q)\s+)?(?:pes(?:o|aron|aban)|dio|dieron|salio|salieron)?\s*(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|k|gr|grs|gramos|g)?/
          );
          if (m && m[1]) {
            const kg = leerKg(m[1], m[2]);
            if (kg !== null) pesadas.set(presa.codigo, kg);
          }
        }
      }
    }
  }

  return {
    unidades: unidades && unidades > 0 && unidades <= 30 ? unidades : null,
    kgPorUnidad: kgPorUnidad && kgPorUnidad > 0.5 && kgPorUnidad < 5 ? kgPorUnidad : null,
    pesadas: [...pesadas.entries()].map(([codigo, kg]) => ({ codigo, kg })),
  };
}
