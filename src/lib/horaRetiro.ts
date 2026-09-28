// ============================================================
// La hora de retiro — decidida por CÓDIGO, no por la IA
// ============================================================
//
// Pedido del fundador (28/09/2026), sin vueltas: "tiene que ser lo más
// sencillo del bot". Tenía razón. Venía fallando de a una forma por vez:
//
//   - "Quiero que sea para las 10 AM" -> la hora se perdía porque en el mismo
//     mensaje había un producto que no se reconoció.
//   - "10 dije" -> no se entendía por la palabra "dije".
//   - "10." -> no se entendía por el punto.
//   - "10" a las 19:40 -> se agendaba a las 22:00, con el local cerrado.
//
// Cada arreglo anterior tapaba UNA forma. El problema de fondo era que la hora
// la decidía la IA y el código solo la "respaldaba". Ahora es al revés:
//
//   1. `extraerHora` lee la hora del texto, SIN IA, en cualquier mensaje del
//      cliente (no solo cuando se le preguntó). Tolera relleno ("tipo", "dije",
//      "más o menos"), puntuación, am/pm, "de la tarde", "mañana", días de la
//      semana, "en media hora", "mediodía".
//   2. `resolverHora` decide QUÉ día y hora es, usando el HORARIO DEL LOCAL:
//      "10" a las 19:40 con el local abierto de 8 a 13 y de 17 a 20:30 no puede
//      ser las 22 (está cerrado): es mañana a las 10. Y si lo que pidió no se
//      puede (ya pasó, está cerrado), NO se descarta: se le propone la hora
//      válida más cercana y se guarda la propuesta, así un "dale" la acepta.
//   3. Solo si el texto no trae ninguna hora se usa la que haya entendido la IA
//      (y también se valida contra el horario).
//
// Todo este archivo es puro (sin base de datos) para poder probarlo solo: el
// horario del local entra como una función.

const OFFSET_ARGENTINA_HORAS = -3;

export type FranjaDia = {
  cerrado: boolean;
  /** Turnos en minutos desde medianoche: [[480, 780], [1020, 1230]]. */
  turnos: [number, number][];
};

/** Horario del local para una fecha "YYYY-MM-DD". `null` = no lo sabemos. */
export type Agenda = (fecha: string) => FranjaDia | null;

export type LecturaHora = {
  hora: number;
  minutos: number;
  /** "am" / "pm" si lo aclaró (am, pm, de la mañana, de la tarde, de la noche). */
  franja: "am" | "pm" | null;
  /** Días desde hoy si lo dijo ("mañana" = 1, "el sábado" = los que falten). */
  dia: number | null;
  /** "en media hora": minutos desde ahora. Si viene, manda sobre todo lo demás. */
  enMinutos: number | null;
};

const NUMEROS: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23,
};

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

// Si un número está pegado a una de estas palabras, es una CANTIDAD, no una
// hora: "2 kilos", "4 choris", "1 bolsa".
const UNIDADES_DE_CANTIDAD =
  /^(kg|kgs|kilo|kilos|k|g|gr|grs|gramo|gramos|unidad|unidades|u|docena|docenas|bolsa|bolsas|paquete|paquetes|personas|persona|pollos?|choris?|chorizos?|milanesas?|hombres|mujeres|pibes|somos)$/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // "19hs" -> "19 hs", "10am" -> "10 am", "7pm" -> "7 pm"
    .replace(/(\d)(hs|h|hrs|am|pm|a\.m\.|p\.m\.)\b/g, "$1 $2")
    .replace(/\ba\.m\.?/g, "am")
    .replace(/\bp\.m\.?/g, "pm")
    // "19.30" -> "19:30" (solo entre dígitos: "10." es "10")
    .replace(/(\d{1,2})\.(\d{2})\b/g, "$1:$2")
    .replace(/[^a-z0-9:\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aNumero(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) return Number(token);
  return token in NUMEROS ? NUMEROS[token] : null;
}

/**
 * Lee la hora que dijo el cliente, o `null` si no dijo ninguna.
 *
 * `esperandoHora`: si la pregunta pendiente era "¿a qué hora pasás?", un número
 * suelto ("10", "10 dije", "tipo 19") es la hora. Si no se le preguntó la hora,
 * un número suelto NO alcanza (puede ser una cantidad): hace falta una marca de
 * hora ("a las", "hs", "am", "19:30", "de la tarde").
 */
export function extraerHora(texto: string, opciones: { esperandoHora: boolean }): LecturaHora | null {
  const t = normalizar(texto);
  if (!t) return null;
  const tokens = t.split(" ");

  // ---- Relativa: "en media hora", "en 20 minutos", "en una hora" ----
  const rel = t.match(/\ben\s+(media hora|un cuarto de hora|(\d{1,3}|una|un|dos|tres)\s+(minutos?|min|horas?|hs))\b/);
  if (rel) {
    let minutos: number;
    if (rel[1] === "media hora") minutos = 30;
    else if (rel[1] === "un cuarto de hora") minutos = 15;
    else {
      const n = /^\d+$/.test(rel[2]) ? Number(rel[2]) : rel[2] === "un" || rel[2] === "una" ? 1 : NUMEROS[rel[2]] ?? 1;
      minutos = /^h/.test(rel[3]) ? n * 60 : n;
    }
    if (minutos > 0 && minutos <= 12 * 60) {
      return { hora: 0, minutos: 0, franja: null, dia: null, enMinutos: minutos };
    }
  }

  // ---- El día ----
  let dia: number | null = null;
  if (/\bpasado manana\b/.test(t)) dia = 2;
  // "mañana" es el DÍA salvo que sea la franja: "de la mañana", "a la mañana",
  // "por la mañana", "10 de la mañana". "Mañana a la mañana" es las dos cosas.
  const sinFranjaManana = t.replace(/\b(de|a|por)\s+la\s+manana\b/g, " ");
  if (dia === null && /\bmanana\b/.test(sinFranjaManana)) dia = 1;
  if (dia === null && /\bhoy\b/.test(t)) dia = 0;
  const diaSemana = tokens.find((tok) => tok in DIAS_SEMANA);

  // ---- La franja ----
  let franja: "am" | "pm" | null = null;
  if (/\b(am|de la manana|a la manana|por la manana|temprano)\b/.test(t)) franja = "am";
  if (/\b(pm|de la tarde|a la tarde|por la tarde|de la noche|a la noche|por la noche)\b/.test(t)) franja = "pm";

  // ---- La hora ----
  let hora: number | null = null;
  let minutos = 0;
  let conMarca = false;

  // "19:30"
  const hhmm = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmm) {
    hora = Number(hhmm[1]);
    minutos = Number(hhmm[2]);
    conMarca = true;
  }

  // "a las 7", "para las 19", "tipo las 8", "a eso de las 10", "las siete"
  if (hora === null) {
    const m = t.match(/\b(?:a|para|tipo|como|eso de|a eso de|antes de|despues de|pasadas)?\s*las\s+(\d{1,2}|[a-z]+)\b/);
    if (m) {
      const n = aNumero(m[1]);
      if (n !== null) {
        hora = n;
        conMarca = true;
      }
    }
  }

  // "7 hs", "10 am", "8 de la tarde", "7 y media"
  if (hora === null) {
    for (let i = 0; i < tokens.length; i++) {
      const n = aNumero(tokens[i]);
      if (n === null) continue;
      const sig = tokens[i + 1] ?? "";
      const sig2 = `${sig} ${tokens[i + 2] ?? ""}`;
      if (/^(hs|h|hrs|horas|am|pm)$/.test(sig) || /^de la (manana|tarde|noche)/.test(`${sig2} ${tokens[i + 3] ?? ""}`)) {
        hora = n;
        conMarca = true;
        break;
      }
    }
  }

  if (hora === null && /\bmediodia\b/.test(t)) {
    hora = 12;
    conMarca = true;
  }

  // Número suelto: solo si se le preguntó la hora, y si hay UNO solo que no
  // sea una cantidad ("2 kilos"). "10", "10 dije", "tipo 19", "diez".
  if (hora === null && opciones.esperandoHora) {
    const candidatos: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const n = aNumero(tokens[i]);
      if (n === null) continue;
      if (UNIDADES_DE_CANTIDAD.test(tokens[i + 1] ?? "")) continue;
      // "somos 8" es gente, no una hora.
      if (/^(somos|seremos|seriamos|x|por)$/.test(tokens[i - 1] ?? "")) continue;
      // "una" suelto casi nunca es una hora ("una molleja").
      if (tokens[i] === "una" || tokens[i] === "uno") continue;
      candidatos.push(n);
    }
    if (candidatos.length === 1) hora = candidatos[0];
  }

  if (hora === null) return null;

  // "y media", "y cuarto", "menos cuarto"
  if (!hhmm) {
    if (/\by media\b/.test(t)) minutos = 30;
    else if (/\by cuarto\b/.test(t)) minutos = 15;
    else if (/\bmenos cuarto\b/.test(t)) {
      hora = hora - 1;
      minutos = 45;
    }
  }

  if (hora < 0 || hora > 23 || minutos < 0 || minutos > 59) return null;
  if (!conMarca && !opciones.esperandoHora) return null;

  if (diaSemana !== undefined && dia === null) {
    dia = -1 - DIAS_SEMANA[diaSemana]; // se resuelve contra "hoy" en resolverHora
  }

  return { hora, minutos, franja, dia, enMinutos: null };
}

// ============================================================
// Resolver: qué día y a qué hora, contra el horario del local
// ============================================================

export type HoraResuelta =
  | { tipo: "hora"; iso: string }
  /** No se puede lo que pidió: se le propone esta hora y se espera un sí. */
  | { tipo: "propuesta"; iso: string; mensaje: string };

type Base = { y: number; m: number; d: number; diaSemana: number; minutos: number };

function base(ahora: Date): Base {
  const ar = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  return {
    y: ar.getUTCFullYear(),
    m: ar.getUTCMonth() + 1,
    d: ar.getUTCDate(),
    diaSemana: ar.getUTCDay(),
    minutos: ar.getUTCHours() * 60 + ar.getUTCMinutes(),
  };
}

function fechaDe(b: Base, diasMas: number): string {
  const f = new Date(Date.UTC(b.y, b.m - 1, b.d + diasMas));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}

function iso(b: Base, diasMas: number, minutosDelDia: number): string {
  const h = Math.floor(minutosDelDia / 60);
  const min = minutosDelDia % 60;
  return new Date(Date.UTC(b.y, b.m - 1, b.d + diasMas, h - OFFSET_ARGENTINA_HORAS, min)).toISOString();
}

function hhmmTexto(minutosDelDia: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutosDelDia / 60))}:${pad(minutosDelDia % 60)}`;
}

const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function cuando(b: Base, diasMas: number): string {
  if (diasMas === 0) return "hoy";
  if (diasMas === 1) return "mañana";
  return `el ${NOMBRE_DIA[(b.diaSemana + diasMas) % 7]}`;
}

/** ¿El local está abierto ese día a esa hora? `null` = no sabemos el horario. */
function abierto(agenda: Agenda, fecha: string, minutos: number): boolean | null {
  const franja = agenda(fecha);
  if (!franja) return null;
  if (franja.cerrado) return false;
  return franja.turnos.some(([desde, hasta]) => minutos >= desde && minutos <= hasta);
}

function describirHorario(franja: FranjaDia | null): string {
  if (!franja || franja.cerrado || franja.turnos.length === 0) return "";
  return franja.turnos.map(([a, b]) => `de ${hhmmTexto(a)} a ${hhmmTexto(b)}`).join(" y ");
}

/**
 * La primera hora abierta desde (día, minuto) en adelante, dentro de 7 días.
 * En los días siguientes se intenta primero LA MISMA hora que pidió (si pidió
 * las 10 y el domingo está cerrado, se ofrece el lunes a las 10, no a las 8).
 */
function proximaAbierta(agenda: Agenda, b: Base, desdeDia: number, desdeMinuto: number): { dia: number; minuto: number } | null {
  for (let dia = desdeDia; dia < desdeDia + 7; dia++) {
    const franja = agenda(fechaDe(b, dia));
    if (!franja || franja.cerrado) continue;
    if (dia !== desdeDia && franja.turnos.some(([desde, hasta]) => desdeMinuto >= desde && desdeMinuto <= hasta)) {
      return { dia, minuto: desdeMinuto };
    }
    for (const [desde, hasta] of franja.turnos) {
      const inicio = dia === desdeDia ? Math.max(desde, desdeMinuto) : desde;
      if (inicio <= hasta) return { dia, minuto: inicio };
    }
  }
  return null;
}

/** De las horas candidatas, la que cae dentro del horario de algún día abierto. */
function candidataRazonable(agenda: Agenda, b: Base, minutos: number[]): number {
  for (let dia = 0; dia < 7; dia++) {
    const franja = agenda(fechaDe(b, dia));
    if (!franja || franja.cerrado) continue;
    const ok = minutos.find((m) => franja.turnos.some(([desde, hasta]) => m >= desde && m <= hasta));
    if (ok !== undefined) return ok;
  }
  return minutos[0];
}

/**
 * Convierte lo que dijo el cliente en una hora concreta, o en una PROPUESTA si
 * lo que pidió no se puede. Nunca descarta una hora en silencio.
 */
export function resolverHora(lectura: LecturaHora, ahora: Date, agenda: Agenda): HoraResuelta {
  const b = base(ahora);
  const margen = 5; // minutos de tolerancia hacia atrás

  // ---- Relativa ----
  if (lectura.enMinutos !== null) {
    const total = b.minutos + lectura.enMinutos;
    const dia = Math.floor(total / 1440);
    const minuto = total % 1440;
    const ok = abierto(agenda, fechaDe(b, dia), minuto);
    if (ok !== false) return { tipo: "hora", iso: iso(b, dia, minuto) };
    return proponer(agenda, b, dia, minuto, `En ${lectura.enMinutos} minutos`);
  }

  // ---- Qué horas son candidatas ----
  const h = lectura.hora;
  let horas: number[];
  if (lectura.franja === "pm") horas = [h < 12 ? h + 12 : h];
  else if (lectura.franja === "am") horas = [h === 12 ? 0 : h];
  else if (h >= 13 || h === 0) horas = [h];
  else if (h === 12) horas = [12];
  // 1 a 11 sin aclarar: puede ser de mañana o de tarde. 1 a 6 casi seguro es
  // de tarde (nadie retira carne a las 3 de la madrugada).
  else if (h <= 6) horas = [h + 12];
  else horas = [h, h + 12];
  const minutosCandidatos = horas.map((x) => x * 60 + lectura.minutos);
  const ambigua = minutosCandidatos.length > 1;

  // ---- Qué días son candidatos ----
  let dias: number[];
  let diaExplicito = false;
  if (lectura.dia !== null && lectura.dia >= 0) {
    dias = [lectura.dia];
    diaExplicito = true;
  } else if (lectura.dia !== null && lectura.dia < 0) {
    const objetivo = -1 - lectura.dia;
    let faltan = (objetivo - b.diaSemana + 7) % 7;
    // "el sábado" dicho un sábado a la noche es el que viene.
    if (faltan === 0 && Math.max(...minutosCandidatos) < b.minutos - margen) faltan = 7;
    dias = [faltan];
    diaExplicito = true;
  } else {
    dias = [0, 1];
  }

  // ---- Elegir: la primera combinación que sea futura Y con el local abierto ----
  for (const dia of dias) {
    // Sin día dicho y con hora NO ambigua (am/pm, 13-23), pasar a mañana solo
    // no se hace en silencio: se propone.
    if (!diaExplicito && dia === 1 && !ambigua) break;
    for (const minuto of minutosCandidatos) {
      if (dia === 0 && minuto < b.minutos - margen) continue;
      const ok = abierto(agenda, fechaDe(b, dia), minuto);
      if (ok === true || ok === null) return { tipo: "hora", iso: iso(b, dia, minuto) };
    }
  }

  // ---- No se pudo: proponer la más cercana válida ----
  const primerDia = dias[0];
  const minutoPedido = candidataRazonable(agenda, b, minutosCandidatos);
  const yaPaso = primerDia === 0 && minutosCandidatos.every((m) => m < b.minutos - margen);

  if (yaPaso) {
    // "Las 10 de hoy ya pasaron": se propone mañana a la misma hora (si abre).
    const mismaHora = minutosCandidatos[0];
    const okManana = abierto(agenda, fechaDe(b, 1), mismaHora);
    if (okManana !== false) {
      return {
        tipo: "propuesta",
        iso: iso(b, 1, mismaHora),
        mensaje: `Las ${hhmmTexto(mismaHora)} de hoy ya pasaron. ¿Te lo dejo para mañana a las ${hhmmTexto(mismaHora)}?`,
      };
    }
    return proponer(agenda, b, 0, b.minutos, `Las ${hhmmTexto(mismaHora)} de hoy ya pasaron`);
  }

  return proponer(agenda, b, primerDia, minutoPedido, `${capitalizar(cuando(b, primerDia))} a las ${hhmmTexto(minutoPedido)}`);
}

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function proponer(agenda: Agenda, b: Base, dia: number, minuto: number, loQuePidio: string): HoraResuelta {
  const franja = agenda(fechaDe(b, dia));
  const horario = describirHorario(franja);
  const motivo =
    franja?.cerrado || !horario
      ? `${loQuePidio} no abrimos`
      : `${loQuePidio} estamos cerrados (${cuando(b, dia)} atendemos ${horario})`;

  // Lo más cerca posible de lo que pidió: el mismo día más tarde, o si no, el
  // cierre de ese día si todavía no pasó, o si no, la próxima apertura.
  let elegida = proximaAbierta(agenda, b, dia, Math.max(minuto, dia === 0 ? b.minutos : 0));
  if (!elegida && franja && !franja.cerrado) {
    const cierre = Math.max(...franja.turnos.map(([, hasta]) => hasta));
    if (dia > 0 || cierre >= b.minutos) elegida = { dia, minuto: cierre };
  }
  if (!elegida) elegida = proximaAbierta(agenda, b, dia + 1, 0);
  if (!elegida) {
    return { tipo: "propuesta", iso: iso(b, dia, minuto), mensaje: `${motivo}. ¿A qué hora te queda bien?` };
  }

  // Si lo pedido cae después del cierre del día, lo más útil es ofrecer el
  // cierre de ese mismo día (si todavía llega) antes que mandarlo a mañana.
  if (franja && !franja.cerrado && elegida.dia !== dia) {
    const cierre = Math.max(...franja.turnos.map(([, hasta]) => hasta));
    if (minuto > cierre && (dia > 0 || cierre >= b.minutos + 15)) elegida = { dia, minuto: cierre };
  }

  return {
    tipo: "propuesta",
    iso: iso(b, elegida.dia, elegida.minuto),
    mensaje: `${motivo}. ¿Te sirve ${cuando(b, elegida.dia)} a las ${hhmmTexto(elegida.minuto)}?`,
  };
}

/**
 * Valida una hora que ya viene como ISO (la que entendió la IA, o una guardada):
 * si el local está abierto, queda; si no, se propone la más cercana.
 */
export function validarIso(isoHora: string, ahora: Date, agenda: Agenda): HoraResuelta {
  const b = base(ahora);
  const f = new Date(conZonaArgentina(isoHora));
  if (Number.isNaN(f.getTime())) return { tipo: "propuesta", iso: isoHora, mensaje: "¿A qué hora pasás a retirarlo?" };
  const ar = new Date(f.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const diasMas = Math.round(
    (Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000
  );
  const minuto = ar.getUTCHours() * 60 + ar.getUTCMinutes();
  return resolverHora(
    { hora: Math.floor(minuto / 60), minutos: minuto % 60, franja: minuto >= 720 ? "pm" : "am", dia: diasMas >= 0 ? diasMas : 0, enMinutos: null },
    ahora,
    agenda
  );
}

/**
 * Normaliza un ISO que devolvió el modelo: si vino sin zona horaria
 * ("2026-09-21T19:00:00"), se lo toma como hora ARGENTINA.
 *
 * Sin esto, `new Date()` lo interpreta en la zona del servidor: en Vercel es
 * UTC (las 19 pasan a ser las 16 de Argentina) y en la compu del fundador es
 * la de su Windows.
 */
export function conZonaArgentina(isoHora: string): string {
  const t = isoHora.trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) return `${t}-03:00`;
  return t;
}

/** "hoy 19:00", "mañana 10:00", "el sábado 03/10 10:00" — para los resúmenes. */
export function formatearRetiro(fecha: Date, ahora: Date = new Date()): string {
  const b = base(ahora);
  const ar = new Date(fecha.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const diasMas = Math.round(
    (Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000
  );
  const hora = hhmmTexto(ar.getUTCHours() * 60 + ar.getUTCMinutes());
  const pad = (n: number) => String(n).padStart(2, "0");
  if (diasMas === 0) return `hoy ${hora}`;
  if (diasMas === 1) return `mañana ${hora}`;
  return `el ${NOMBRE_DIA[ar.getUTCDay()]} ${pad(ar.getUTCDate())}/${pad(ar.getUTCMonth() + 1)} ${hora}`;
}
