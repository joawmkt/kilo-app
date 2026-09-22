// ============================================================
// "tipo 19", "a las 7", "19:30", "mañana a las 10" — leído SIN IA
// ============================================================
//
// Bug del 21/09/2026:
//
//   Bot:     ¿A qué hora pasás a retirarlo?
//   Cliente: tipo 19
//   Bot:     ¿A qué hora pasás a retirarlo?
//   Cliente: 19
//   Bot:     Perdón, sigo sin agarrar el horario...
//
// Dos causas, y las dos se cierran:
//
// 1. Si la respuesta del modelo venía "rara" (un tipo que no correspondía, un
//    item mal armado), el validador la tiraba ENTERA — y con ella una hora que
//    estaba perfecta. Eso se arregló en interpretarPedido.ts: una hora válida
//    nunca se descarta.
// 2. Cuando la pregunta pendiente ES la hora, la respuesta casi siempre es una
//    de un puñado de formas contadas. Es el Patrón 3 del manual: eso se lee con
//    texto plano, sin dudar y sin costo. Este archivo hace eso.
//
// Igual que con las personas: NO reemplaza al modelo, lo respalda. Si el
// modelo trajo la hora, gana el modelo. Si no, se lee acá. Y si el mensaje trae
// cualquier otra cosa además de la hora ("19, y sumale 2 de chorizo"), esto no
// lo toca: devuelve null y decide el modelo, que ve el mensaje entero.

const OFFSET_ARGENTINA_HORAS = -3;

const HORAS_ESCRITAS: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23,
};

// Palabras que acompañan a una hora sin cambiarla.
const RELLENO = new Set([
  "tipo", "a", "las", "la", "el", "los", "como", "eso", "de", "para", "paso", "pasaria", "pasare",
  "voy", "onda", "mas", "o", "menos", "aprox", "aproximadamente", "hs", "h", "hrs", "horas", "hora",
  "tipo", "tipin", "pongale", "ponele", "calculo", "creo", "que", "por", "ahi", "y", "hoy", "dale",
  "si", "ok", "bueno", "entre", "tarde", "noche", "manana", "mediodia", "cuarto", "media", "en",
  "punto", "pm", "am", "te", "lo", "retiro", "busco", "buscarlo", "retirarlo", "paso",
]);

export type HoraLeida = { iso: string; yaPaso: boolean };

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*(hs|h|hrs)\b/g, "$1 hs")
    .replace(/[^a-z0-9:.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fecha y hora de "ahora" en Argentina, como campos sueltos. */
function ahoraEnArgentina(ahora: Date): { y: number; m: number; d: number; minutos: number } {
  const ar = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  return {
    y: ar.getUTCFullYear(),
    m: ar.getUTCMonth() + 1,
    d: ar.getUTCDate(),
    minutos: ar.getUTCHours() * 60 + ar.getUTCMinutes(),
  };
}

function isoArgentina(base: { y: number; m: number; d: number }, diasMas: number, h: number, min: number): string {
  // Se arma con Date.UTC para que sumar un día cruce bien fin de mes.
  const utc = new Date(Date.UTC(base.y, base.m - 1, base.d + diasMas, h - OFFSET_ARGENTINA_HORAS, min));
  return utc.toISOString();
}

/**
 * La hora de retiro que dijo el cliente, o null si el mensaje no es solo una
 * hora (y entonces decide el modelo).
 */
export function leerHoraSuelta(texto: string, ahora: Date = new Date()): HoraLeida | null {
  const t = normalizar(texto);
  if (!t) return null;

  const tokens = t.split(" ");

  // Todo lo que no sea relleno ni número tiene que no estar: si hay un
  // producto o cualquier otra cosa, no es una hora suelta.
  let hora: number | null = null;
  let minutos = 0;

  for (const token of tokens) {
    const conMinutos = token.match(/^(\d{1,2})[:.](\d{2})$/);
    if (conMinutos) {
      if (hora !== null) return null;
      hora = Number(conMinutos[1]);
      minutos = Number(conMinutos[2]);
      continue;
    }
    if (/^\d{1,2}$/.test(token)) {
      if (hora !== null) return null; // dos números: ambiguo, que decida el modelo
      hora = Number(token);
      continue;
    }
    if (token in HORAS_ESCRITAS) {
      if (hora !== null) return null;
      hora = HORAS_ESCRITAS[token];
      continue;
    }
    if (!RELLENO.has(token)) return null;
  }

  const dice = (palabra: string) => tokens.includes(palabra);

  if (hora === null) {
    if (dice("mediodia")) hora = 12;
    else return null;
  }

  if (dice("media") && minutos === 0) minutos = 30;
  if (dice("cuarto") && minutos === 0) minutos = dice("menos") ? -15 : 15;
  if (minutos < 0) {
    hora = hora - 1;
    minutos = 60 + minutos;
  }

  if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) return null;

  // "mañana" puede ser el día ("mañana a las 10") o la franja ("10 de la
  // mañana"). Es la franja solo si viene pegada a "de la".
  const deLaManana = /\bde la manana\b/.test(t);
  const esParaManana = dice("manana") && !deLaManana;
  const esTarde = dice("tarde") || dice("noche") || dice("pm");

  if (esTarde && hora < 12) hora += 12;

  const base = ahoraEnArgentina(ahora);

  if (esParaManana) {
    // Para mañana, un número de 1 a 7 sin aclarar es casi seguro de la tarde
    // (nadie retira carne a las 3 de la madrugada).
    if (!esTarde && !deLaManana && hora >= 1 && hora <= 7) hora += 12;
    return { iso: isoArgentina(base, 1, hora, minutos), yaPaso: false };
  }

  const pedidoEnMinutos = (h: number) => h * 60 + minutos;

  // 13 a 23, o con franja aclarada: la hora es esa y no hay que adivinar.
  if (hora >= 13 || esTarde || deLaManana) {
    const yaPaso = pedidoEnMinutos(hora) < base.minutos - 5;
    return { iso: isoArgentina(base, 0, hora, minutos), yaPaso };
  }

  // 1 a 12 sin aclarar: la próxima vez que esa hora pase HOY (8 -> 8:00 si
  // todavía es de mañana, si no 20:00). Es el mismo criterio que se le pide
  // al modelo en el prompt.
  if (pedidoEnMinutos(hora) >= base.minutos - 5) {
    return { iso: isoArgentina(base, 0, hora, minutos), yaPaso: false };
  }
  if (hora < 12 && pedidoEnMinutos(hora + 12) >= base.minutos - 5) {
    return { iso: isoArgentina(base, 0, hora + 12, minutos), yaPaso: false };
  }
  // Ya pasó en las dos versiones: se devuelve igual, marcada, para que el
  // flujo le pregunte si es para mañana en vez de repetir la pregunta.
  return { iso: isoArgentina(base, 0, hora, minutos), yaPaso: true };
}

/**
 * Normaliza un ISO que devolvió el modelo: si vino sin zona horaria
 * ("2026-09-21T19:00:00"), se lo toma como hora ARGENTINA.
 *
 * Sin esto, `new Date()` lo interpreta en la zona del servidor: en Vercel es
 * UTC (las 19 pasan a ser las 16 de Argentina) y en la compu del fundador es
 * la de su Windows. La misma respuesta del modelo daba horas distintas según
 * dónde corriera el código.
 */
export function conZonaArgentina(iso: string): string {
  const t = iso.trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) return `${t}-03:00`;
  return t;
}
