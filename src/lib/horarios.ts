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

// ============================================================
// La agenda para validar la hora de retiro (28/09/2026)
// ============================================================
//
// `horaRetiro.ts` es puro (sin base) para poder probarlo solo, así que recibe
// el horario como una función. Esta la arma una vez por mensaje: los siete
// días de la semana más los días especiales de las próximas dos semanas.
// Si la carnicería no cargó horarios, devuelve siempre `null` ("no sé") y la
// hora se acepta sin validar — nunca se inventa un horario.

export async function cargarAgenda(
  carniceriaId: string
): Promise<(fecha: string) => { cerrado: boolean; turnos: [number, number][] } | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const hoy = diaEnArgentina().fecha;
  const hasta = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const [{ data: semana }, { data: especiales }] = await Promise.all([
    supabaseAdmin
      .from("horarios_atencion")
      .select("dia_semana, cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
      .eq("carniceria_id", carniceriaId),
    supabaseAdmin
      .from("dias_especiales")
      .select("fecha, cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
      .eq("carniceria_id", carniceriaId)
      .gte("fecha", hoy)
      .lte("fecha", hasta),
  ]);

  type Fila = { cerrado: boolean; turno1_desde: string | null; turno1_hasta: string | null; turno2_desde: string | null; turno2_hasta: string | null };
  const aFranja = (f: Fila) => {
    const turnos: [number, number][] = [];
    const t1 = [aMinutos(f.turno1_desde), aMinutos(f.turno1_hasta)];
    const t2 = [aMinutos(f.turno2_desde), aMinutos(f.turno2_hasta)];
    if (t1[0] !== null && t1[1] !== null) turnos.push([t1[0], t1[1]]);
    if (t2[0] !== null && t2[1] !== null) turnos.push([t2[0], t2[1]]);
    return { cerrado: Boolean(f.cerrado) || turnos.length === 0, turnos };
  };

  const porDia = new Map<number, ReturnType<typeof aFranja>>();
  for (const f of (semana ?? []) as (Fila & { dia_semana: number })[]) porDia.set(Number(f.dia_semana), aFranja(f));
  const porFecha = new Map<string, ReturnType<typeof aFranja>>();
  for (const f of (especiales ?? []) as (Fila & { fecha: string })[]) porFecha.set(String(f.fecha), aFranja(f));

  if (porDia.size === 0) return () => null;

  return (fecha: string) => {
    const especial = porFecha.get(fecha);
    if (especial) return especial;
    return porDia.get(new Date(`${fecha}T12:00:00Z`).getUTCDay()) ?? null;
  };
}
