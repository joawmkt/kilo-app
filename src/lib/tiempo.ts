// Argentina usa UTC-3 fijo desde 2009 (no tiene horario de verano), así
// que no hace falta una librería de zonas horarias para este cálculo.
const OFFSET_ARGENTINA_HORAS = -3;

/**
 * Medianoche (00:00) del día siguiente, hora Argentina, expresada como
 * timestamp UTC. Se usa como `expires_at` por defecto de una operación
 * de stock pendiente (definición: 22/08/2026, "vence a medianoche hora
 * Argentina del mismo día en que se creó").
 */
export function finDeHoyArgentina(ahora: Date = new Date()): Date {
  const ahoraEnArgentina = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const medianocheSiguienteEnArgentina = Date.UTC(
    ahoraEnArgentina.getUTCFullYear(),
    ahoraEnArgentina.getUTCMonth(),
    ahoraEnArgentina.getUTCDate() + 1,
    0,
    0,
    0
  );
  return new Date(medianocheSiguienteEnArgentina - OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
}

/**
 * Fecha/hora actual en Argentina como ISO 8601 con offset -03:00 — se le
 * pasa a la IA de interpretación de pedidos (Etapa 3) para que pueda
 * calcular horas de retiro relativas ("en 20 minutos", "a las 6") sin
 * tener que adivinar qué día/hora es "ahora".
 */
export function ahoraArgentinaIso(ahora: Date = new Date()): string {
  const ahoraEnArgentina = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${ahoraEnArgentina.getUTCFullYear()}-${pad(ahoraEnArgentina.getUTCMonth() + 1)}-${pad(ahoraEnArgentina.getUTCDate())}` +
    `T${pad(ahoraEnArgentina.getUTCHours())}:${pad(ahoraEnArgentina.getUTCMinutes())}:00-03:00`
  );
}

/** Formatea un timestamp como "HH:MM" en hora Argentina, para mensajes de WhatsApp. */
export function formatearHoraArgentina(fecha: Date): string {
  const enArgentina = new Date(fecha.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(enArgentina.getUTCHours())}:${pad(enArgentina.getUTCMinutes())}`;
}
