import { getSupabaseAdmin } from "./supabaseAdmin";

// ============================================================
// Horarios de atención — especificación, secciones 18, 22, 23, 24 y 42
// ============================================================
//
// Los horarios ya se cargaban en el panel, pero nadie fuera del panel los
// miraba. A partir de la Tanda 5 los necesitan tres cosas distintas:
//
//   - el resumen diario, que sale a la hora de apertura (sección 23);
//   - el cierre del día, cuando el bot le pregunta al carnicero qué pasó con
//     los pedidos que quedaron sin marcar (sección 7.4);
//   - la validación de una hora de retiro, para no aceptar un retiro cuando
//     el local está cerrado (secciones 22 y 42).
//
// Argentina no tiene horario de verano desde 2009, así que alcanza con un
// offset fijo — igual que en tiempo.ts.

const OFFSET_ARGENTINA_HORAS = -3;

export type FranjaHoraria = {
  cerrado: boolean;
  turno1Desde: string | null;
  turno1Hasta: string | null;
  turno2Desde: string | null;
  turno2Hasta: string | null;
};

/** Fecha (YYYY-MM-DD) y día de la semana en Argentina para un instante dado. */
export function diaEnArgentina(ahora: Date = new Date()): { fecha: string; diaSemana: number; minutos: number } {
  const enArgentina = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${enArgentina.getUTCFullYear()}-${pad(enArgentina.getUTCMonth() + 1)}-${pad(enArgentina.getUTCDate())}`,
    diaSemana: enArgentina.getUTCDay(),
    minutos: enArgentina.getUTCHours() * 60 + enArgentina.getUTCMinutes(),
  };
}

function aMinutos(hora: string | null): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(":");
  const total = Number(h) * 60 + Number(m ?? 0);
  return Number.isFinite(total) ? total : null;
}

/**
 * La franja de atención de una carnicería para una fecha concreta.
 *
 * Un día especial (feriado, cierre puntual) PISA al horario de la semana — es
 * exactamente para eso que existe esa tabla (sección 18).
 *
 * Devuelve `null` si la carnicería todavía no cargó horarios. Ese null es
 * importante: significa "no sé", y quien llama no debe inventar uno.
 */
export async function franjaDelDia(carniceriaId: string, fecha: string): Promise<FranjaHoraria | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: especial } = await supabaseAdmin
    .from("dias_especiales")
    .select("cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
    .eq("carniceria_id", carniceriaId)
    .eq("fecha", fecha)
    .maybeSingle();

  if (especial) {
    return {
      cerrado: Boolean(especial.cerrado),
      turno1Desde: (especial.turno1_desde as string | null) ?? null,
      turno1Hasta: (especial.turno1_hasta as string | null) ?? null,
      turno2Desde: (especial.turno2_desde as string | null) ?? null,
      turno2Hasta: (especial.turno2_hasta as string | null) ?? null,
    };
  }

  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();

  const { data: semanal } = await supabaseAdmin
    .from("horarios_atencion")
    .select("cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
    .eq("carniceria_id", carniceriaId)
    .eq("dia_semana", diaSemana)
    .maybeSingle();

  if (!semanal) return null;

  return {
    cerrado: Boolean(semanal.cerrado),
    turno1Desde: (semanal.turno1_desde as string | null) ?? null,
    turno1Hasta: (semanal.turno1_hasta as string | null) ?? null,
    turno2Desde: (semanal.turno2_desde as string | null) ?? null,
    turno2Hasta: (semanal.turno2_hasta as string | null) ?? null,
  };
}

/** Minutos desde medianoche en que abre ese día, o null si no abre / no se sabe. */
export function minutoDeApertura(franja: FranjaHoraria | null): number | null {
  if (!franja || franja.cerrado) return null;
  return aMinutos(franja.turno1Desde);
}

/** Minutos desde medianoche en que cierra ese día (el último turno). */
export function minutoDeCierre(franja: FranjaHoraria | null): number | null {
  if (!franja || franja.cerrado) return null;
  return aMinutos(franja.turno2Hasta) ?? aMinutos(franja.turno1Hasta);
}

/**
 * ¿Estamos dentro de la ventana en que corresponde disparar algo "a la
 * apertura" o "al cierre"?
 *
 * El cron corre cada 10 minutos, así que no puede exigir el minuto exacto: se
 * acepta cualquier pasada dentro de los `toleranciaMinutos` posteriores. La
 * marca de "ya lo hice hoy" es la que evita repetirlo.
 */
export function estaEnLaVentana(minutoActual: number, minutoObjetivo: number | null, toleranciaMinutos = 20): boolean {
  if (minutoObjetivo == null) return false;
  return minutoActual >= minutoObjetivo && minutoActual < minutoObjetivo + toleranciaMinutos;
}
