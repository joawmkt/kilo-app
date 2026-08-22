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
