import { getSupabaseAdmin } from "./supabaseAdmin";
import type { InfoPersonas } from "./interpretarPedido";
import type { Ocasion } from "./recomendaciones";
import { normalizarTexto } from "./texto";

// ============================================================
// La memoria de la charla con un cliente (30/09/2026)
// ============================================================
//
// "NO QUIERO QUE NUNCA MÁS SE OLVIDE UN DATO" (el fundador, 30/09).
//
// Lo que el cliente dice vivía solo en el pedido que se estaba armando, y el
// pedido se "resetea" cada vez que cambia de manos (sale al carnicero, vuelve
// porque faltó algo). En cada reseteo el bot se olvidaba de para cuántos era
// y volvía a preguntar. Acá se guarda lo que vale para TODA la charla del día
// (columna `conversaciones.memoria`, migración 0030):
//
//   - personas: "asado para 15", "somos 10 hombres y 5 mujeres";
//   - faltantes: lo que el carnicero dijo que no había, CON la cantidad que
//     el cliente había pedido — así "cambialo por matambre" sabe que eran 4 kg;
//   - ocasion: para qué estaba comprando (parrilla, horno...).
//
// La regla para usarla es simple: lo que diga el pedido en curso manda; lo que
// el pedido no sepa, se completa con esto. Y vale por el día: si el cliente
// vuelve mañana, es otra charla.

export type FaltanteDeLaCharla = {
  producto_id: string;
  producto_codigo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  unidades_cliente?: number | null;
};

export type MemoriaCharla = {
  dia?: string;
  personas?: InfoPersonas;
  faltantes?: FaltanteDeLaCharla[];
  ocasion?: Ocasion;
};

const OFFSET_ARGENTINA_HORAS = -3;

function hoyArgentina(): string {
  return new Date(Date.now() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function idConversacion(carniceriaId: string, telefono: string): Promise<{ id: string; memoria: unknown } | null> {
  const { data } = await getSupabaseAdmin()
    .from("conversaciones")
    .select("id, memoria")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .maybeSingle();
  return data ? { id: data.id as string, memoria: data.memoria } : null;
}

/** Lo que se sabe de la charla de HOY con este cliente (vacío si es de otro día). */
export async function leerMemoria(carniceriaId: string, telefono: string): Promise<MemoriaCharla> {
  try {
    const conversacion = await idConversacion(carniceriaId, telefono);
    const memoria = (conversacion?.memoria ?? {}) as MemoriaCharla;
    return memoria.dia === hoyArgentina() ? memoria : {};
  } catch (err) {
    // La memoria ayuda, nunca traba: si falla, se sigue sin ella.
    console.error("No se pudo leer la memoria de la charla", err);
    return {};
  }
}

/** Suma cambios a la memoria de hoy. `undefined` no borra; `null` sí. */
export async function recordar(
  carniceriaId: string,
  telefono: string,
  cambios: { personas?: InfoPersonas | null; faltantes?: FaltanteDeLaCharla[] | null; ocasion?: Ocasion | null }
): Promise<void> {
  try {
    const conversacion = await idConversacion(carniceriaId, telefono);
    if (!conversacion) return;
    const previa = (conversacion.memoria ?? {}) as MemoriaCharla;
    const base: MemoriaCharla = previa.dia === hoyArgentina() ? previa : {};
    const nueva: MemoriaCharla = { ...base, dia: hoyArgentina() };
    for (const [clave, valor] of Object.entries(cambios) as [keyof typeof cambios, unknown][]) {
      if (valor === undefined) continue;
      if (valor === null) delete (nueva as Record<string, unknown>)[clave];
      else (nueva as Record<string, unknown>)[clave] = valor;
    }
    await getSupabaseAdmin().from("conversaciones").update({ memoria: nueva }).eq("id", conversacion.id);
  } catch (err) {
    console.error("No se pudo guardar la memoria de la charla", err);
  }
}

// ------------------------------------------------------------
// Para cuántos es — leído SIN IA de cualquier mensaje
// ------------------------------------------------------------
//
// Bug del 30/09: "Quiero asado para 15 personas, ¿qué me recomendás?" era una
// CONSULTA, y las consultas no guardaban nada. Las 15 personas se perdieron y
// en el mensaje siguiente el bot preguntó "¿para cuántas personas es?". El
// número de personas se lee acá, en CUALQUIER mensaje, sea del tipo que sea.

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, veinte: 20, treinta: 30, cuarenta: 40,
};

function aNumero(palabra: string): number | null {
  if (/^\d{1,3}$/.test(palabra)) return Number(palabra);
  return NUMEROS[palabra] ?? null;
}

const NUM = "(\\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|veinte|treinta|cuarenta)";
const PERSONAS_NOMBRADAS = new RegExp(`\\b${NUM}\\s+(personas?|pers|invitados?|comensales|adultos|amigos|pibes)\\b`);
const SOMOS = new RegExp(`\\b(somos|seremos|vamos a ser|comen|vienen|seriamos|son|para)\\s+(unos\\s+|unas\\s+|como\\s+)?${NUM}\\b(?!\\s*(hs|h|horas?|:|am|pm|kg|kilos?|k|de la|y media|bolsas?|unidades?))`);
const HOMBRES = new RegExp(`\\b${NUM}\\s+(hombres?|varones?|chicos|pibes|tipos)\\b`);
const MUJERES = new RegExp(`\\b${NUM}\\s+(mujeres?|chicas|pibas|minas|damas|senoras)\\b`);

/**
 * "para 15 personas", "somos 8", "10 hombres y 5 mujeres", "asado para 6"
 * → cuántos son. null si el mensaje no dice nada de eso.
 *
 * Ojo con la hora: "para las 7" no son 7 personas ("las" lo delata), y
 * "para 15 hs" tampoco.
 */
export function leerPersonas(texto: string): InfoPersonas | null {
  const t = normalizarTexto(texto).replace(/[^a-z0-9ñ:\s]/g, " ").replace(/\s+/g, " ");
  const hombres = HOMBRES.exec(t);
  const mujeres = MUJERES.exec(t);
  if (hombres || mujeres) {
    const h = hombres ? aNumero(hombres[1]) : null;
    const m = mujeres ? aNumero(mujeres[1]) : null;
    const resultado: InfoPersonas = {};
    if (h !== null) resultado.hombres = h;
    if (m !== null) resultado.mujeres = m;
    // "10 hombres" solo, sin mujeres: son 10 hombres y 0 mujeres.
    if (h !== null && m === null && !/\bmujer/.test(t)) resultado.mujeres = 0;
    if (m !== null && h === null && !/\b(hombre|varon)/.test(t)) resultado.hombres = 0;
    return resultado;
  }
  const nombradas = PERSONAS_NOMBRADAS.exec(t);
  if (nombradas) {
    const n = aNumero(nombradas[1]);
    return n && n <= 200 ? { sinGenero: n } : null;
  }
  const somos = SOMOS.exec(t);
  if (somos) {
    // "para N" a secas solo si se está hablando de comer: "para 15" en "asado
    // para 15" son personas; en "dejámelo para 15" puede ser la hora.
    if (somos[1] === "para" && !/\b(asado|parrilla|comer|comida|gente|personas?|picada|juntada|cumple|cumpleanos|familia)\b/.test(t)) {
      return null;
    }
    const n = aNumero(somos[3]);
    return n && n <= 200 ? { sinGenero: n } : null;
  }
  return null;
}

/** Cuántos son en total, si se sabe. */
export function totalDePersonas(personas: InfoPersonas | undefined | null): number | null {
  if (!personas) return null;
  if (personas.hombres != null || personas.mujeres != null) {
    const total = (personas.hombres ?? 0) + (personas.mujeres ?? 0);
    return total > 0 ? total : personas.sinGenero ?? null;
  }
  return personas.sinGenero ?? null;
}
