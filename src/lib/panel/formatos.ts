// Formateo de números, cantidades, plata y fechas para el panel.
//
// Todo en español rioplatense y con las convenciones argentinas: coma decimal,
// punto de miles, y la hora en 24 horas. Un carnicero que ve "1,234.50" piensa
// que son mil doscientos treinta y cuatro pesos con cincuenta, y son mil
// doscientos treinta y cuatro con cincuenta al revés.
//
// Argentina no tiene horario de verano desde 2009, así que el offset es -3 fijo
// (mismo criterio que src/lib/tiempo.ts, que usa el bot).

const LOCALE = "es-AR";
const ZONA = "America/Argentina/Buenos_Aires";

// ============================================================
// Cantidades
// ============================================================

/**
 * Cantidad con su unidad: "12,5 kg", "4 unidades".
 * Los kilos van con un decimal como máximo (nadie carga 12,347 kg de asado);
 * las unidades, entero.
 */
export function formatearCantidad(cantidad: number, unidad: string): string {
  if (unidad === "kg") {
    const valor = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(cantidad);
    return `${valor} kg`;
  }

  const entero = Math.round(cantidad);
  const valor = new Intl.NumberFormat(LOCALE).format(entero);
  if (unidad === "unidad") return `${valor} ${entero === 1 ? "unidad" : "unidades"}`;
  if (unidad === "docena") return `${valor} ${entero === 1 ? "docena" : "docenas"}`;
  if (unidad === "bolsa") return `${valor} ${entero === 1 ? "bolsa" : "bolsas"}`;
  return `${valor} ${unidad}`;
}

/** Solo el número, sin unidad — para inputs y celdas de tabla. */
export function formatearNumero(valor: number, decimalesMax = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalesMax,
  }).format(valor);
}

// ============================================================
// Plata
// ============================================================

/**
 * Pesos. Sin decimales por defecto: con la inflación argentina, los centavos
 * en un precio por kilo son ruido visual.
 *
 * ⚠️ Todo número de plata que salga del panel es ESTIMATIVO: el precio final se
 * determina al pesar en el local. Las pantallas tienen que decirlo — este
 * formateador no lo puede decir por ellas.
 */
export function formatearPesos(valor: number | null | undefined, opciones?: { decimales?: number }): string {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: opciones?.decimales ?? 0,
    maximumFractionDigits: opciones?.decimales ?? 0,
  }).format(valor);
}

/** Precio con su unidad: "$8.500 por kg". */
export function formatearPrecioPorUnidad(precio: number | null, unidad: string): string {
  if (precio === null) return "Sin precio";
  return `${formatearPesos(precio)} por ${unidad === "kg" ? "kg" : unidad}`;
}

// ============================================================
// Fechas y horas
// ============================================================

export function formatearHora(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  }).format(valor);
}

export function formatearFecha(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA,
  }).format(valor);
}

/**
 * "Sábado 13 de septiembre". Se usa como encabezado, así que vuelve con la
 * primera letra en mayúscula: en español el día de la semana va en minúscula
 * dentro de una oración, pero abriendo una no.
 *
 * La mayúscula se pone acá y no con `capitalize` en el CSS porque el CSS lo
 * resolvía en una sola pantalla y se perdía en cuanto el texto se usaba en
 * otra.
 */
export function formatearFechaLarga(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  const texto = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ZONA,
  }).format(valor);

  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearFechaYHora(fecha: Date | string): string {
  return `${formatearFecha(fecha)} ${formatearHora(fecha)}`;
}

/**
 * "hace 5 minutos", "ayer", "hace 3 días". Para el hilo de mensajes y para
 * "último cambio". Más legible que una fecha completa cuando lo que importa es
 * si fue recién o hace mucho.
 */
export function formatearRelativo(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  const segundos = Math.round((Date.now() - valor.getTime()) / 1000);

  if (segundos < 60) return "recién";
  if (segundos < 3600) {
    const minutos = Math.floor(segundos / 60);
    return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  }
  if (segundos < 86400) {
    const horas = Math.floor(segundos / 3600);
    return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }

  const dias = Math.floor(segundos / 86400);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return formatearFecha(valor);
}

// ============================================================
// Días de la semana
// ============================================================
// 0 = domingo, igual que Date.getDay() y que `horarios_atencion.dia_semana`.

export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** "08:00" a partir de un `time` de Postgres ("08:00:00"). */
export function formatearHoraSimple(hora: string | null): string {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

// ============================================================
// Rangos de fechas del día en curso, hora Argentina
// ============================================================

/**
 * Inicio y fin del día de hoy en Argentina, como instantes UTC — que es lo que
 * hay que comparar contra las columnas `timestamptz` de la base.
 *
 * Sin esto, "los pedidos de hoy" calculado con la hora del servidor devuelve el
 * día equivocado entre las 21 y las 24, porque Vercel corre en UTC.
 */
export function rangoDelDiaArgentina(referencia: Date = new Date()): { desde: Date; hasta: Date } {
  const offsetHoras = -3;
  const enArgentina = new Date(referencia.getTime() + offsetHoras * 3600 * 1000);

  const inicioUtc = Date.UTC(
    enArgentina.getUTCFullYear(),
    enArgentina.getUTCMonth(),
    enArgentina.getUTCDate(),
    0,
    0,
    0
  );

  const desde = new Date(inicioUtc - offsetHoras * 3600 * 1000);
  const hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
  return { desde, hasta };
}

/** Primer instante del mes en curso, hora Argentina, como instante UTC. */
export function inicioDelMesArgentina(referencia: Date = new Date()): Date {
  const offsetHoras = -3;
  const enArgentina = new Date(referencia.getTime() + offsetHoras * 3600 * 1000);
  const inicioUtc = Date.UTC(enArgentina.getUTCFullYear(), enArgentina.getUTCMonth(), 1, 0, 0, 0);
  return new Date(inicioUtc - offsetHoras * 3600 * 1000);
}

/** Día de la semana (0-6) de hoy en Argentina. */
export function diaSemanaArgentina(referencia: Date = new Date()): number {
  const enArgentina = new Date(referencia.getTime() - 3 * 3600 * 1000);
  return enArgentina.getUTCDay();
}
