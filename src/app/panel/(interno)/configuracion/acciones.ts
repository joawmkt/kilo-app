"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { esCodigoDeMedioPago } from "@/lib/mediosPago";

// Acciones de Configuración. Igual que el resto del panel: primero
// `requerirSesion()` (que resuelve la carnicería con Row Level Security) y
// recién después la service_role, siempre filtrando por esa carnicería.

export type ResultadoAccion = { ok: boolean; mensaje: string };

// ============================================================
// Datos del negocio
// ============================================================

export async function guardarDatosDelNegocio(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const nombreVisible = String(datos.get("nombre_visible") ?? "").trim();
  if (!nombreVisible) {
    return { ok: false, mensaje: "El nombre de la carnicería no puede quedar vacío." };
  }

  const umbralCrudo = String(datos.get("umbral_stock_bajo_default") ?? "").replace(",", ".");
  const umbral = Number(umbralCrudo);
  if (!Number.isFinite(umbral) || umbral < 0) {
    return { ok: false, mensaje: "El aviso de stock bajo tiene que ser un número de 0 para arriba." };
  }

  const { error } = await getSupabaseAdmin()
    .from("carnicerias")
    .update({
      nombre_visible: nombreVisible,
      direccion: vacioANull(datos.get("direccion")),
      telefono_contacto: vacioANull(datos.get("telefono_contacto")),
      email_contacto: vacioANull(datos.get("email_contacto")),
      umbral_stock_bajo_default: umbral,
      horarios_modo: leerModoHorarios(datos.get("horarios_modo")),
    })
    .eq("id", sesion.carniceria.id);

  if (error) {
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/configuracion");
  revalidatePath("/panel", "layout");
  return { ok: true, mensaje: "Datos guardados." };
}

// ============================================================
// Horarios de atención
// ============================================================

export async function guardarHorarios(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const supabaseAdmin = getSupabaseAdmin();

  for (let dia = 0; dia < 7; dia += 1) {
    const cerrado = datos.get(`cerrado_${dia}`) === "on";

    const turno1Desde = leerHora(datos.get(`turno1_desde_${dia}`));
    const turno1Hasta = leerHora(datos.get(`turno1_hasta_${dia}`));
    const turno2Desde = leerHora(datos.get(`turno2_desde_${dia}`));
    const turno2Hasta = leerHora(datos.get(`turno2_hasta_${dia}`));

    if (!cerrado) {
      // La base ya tiene restricciones para esto, pero un error de base es
      // ilegible: mejor explicarlo con las palabras del carnicero.
      if (Boolean(turno1Desde) !== Boolean(turno1Hasta)) {
        return { ok: false, mensaje: `Faltó completar el horario de la mañana del ${NOMBRE_DIA[dia]}.` };
      }
      if (Boolean(turno2Desde) !== Boolean(turno2Hasta)) {
        return { ok: false, mensaje: `Faltó completar el horario de la tarde del ${NOMBRE_DIA[dia]}.` };
      }
      if (turno2Desde && !turno1Desde) {
        return {
          ok: false,
          mensaje: `El ${NOMBRE_DIA[dia]} tiene horario de tarde pero no de mañana. Completá el primer turno o marcá el día como cerrado.`,
        };
      }
      if (turno1Desde && turno1Hasta && turno1Desde >= turno1Hasta) {
        return { ok: false, mensaje: `El ${NOMBRE_DIA[dia]} a la mañana cierra antes de abrir.` };
      }
      if (turno2Desde && turno2Hasta && turno2Desde >= turno2Hasta) {
        return { ok: false, mensaje: `El ${NOMBRE_DIA[dia]} a la tarde cierra antes de abrir.` };
      }
      if (turno1Hasta && turno2Desde && turno2Desde < turno1Hasta) {
        return { ok: false, mensaje: `Los dos turnos del ${NOMBRE_DIA[dia]} se pisan.` };
      }
    }

    const { error } = await supabaseAdmin.from("horarios_atencion").upsert(
      {
        carniceria_id: sesion.carniceria.id,
        dia_semana: dia,
        cerrado,
        turno1_desde: cerrado ? null : turno1Desde,
        turno1_hasta: cerrado ? null : turno1Hasta,
        turno2_desde: cerrado ? null : turno2Desde,
        turno2_hasta: cerrado ? null : turno2Hasta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "carniceria_id,dia_semana" }
    );

    if (error) {
      return { ok: false, mensaje: `No se pudo guardar el ${NOMBRE_DIA[dia]}. Probá de nuevo.` };
    }
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Horarios guardados." };
}

// ============================================================
// Días especiales (feriados y cierres puntuales)
// ============================================================

export async function agregarDiaEspecial(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const fecha = String(datos.get("fecha") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, mensaje: "Elegí una fecha." };
  }

  const { error } = await getSupabaseAdmin()
    .from("dias_especiales")
    .upsert(
      {
        carniceria_id: sesion.carniceria.id,
        fecha,
        cerrado: true,
        motivo: vacioANull(datos.get("motivo")),
      },
      { onConflict: "carniceria_id,fecha" }
    );

  if (error) return { ok: false, mensaje: "No se pudo guardar ese día." };

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Día agregado." };
}

export async function borrarDiaEspecial(id: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  await getSupabaseAdmin()
    .from("dias_especiales")
    .delete()
    .eq("id", id)
    .eq("carniceria_id", sesion.carniceria.id);

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Día eliminado." };
}

// ============================================================
// Medios de pago (especificación del bot, sección 19)
// ============================================================
//
// El bot solo puede informar los que estén tildados acá. Si no hay ninguno,
// contesta que se confirma en el local — nunca inventa uno (sección 1.3).

export async function guardarMediosPago(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  // Se filtra contra la lista canónica en vez de guardar lo que venga: el
  // formulario es confiable, pero un código basura acá haría que el bot no
  // sepa cómo nombrarle el medio de pago al cliente.
  const codigos = datos.getAll("medios_pago").map(String).filter(esCodigoDeMedioPago);

  const { error } = await getSupabaseAdmin()
    .from("carnicerias")
    .update({ medios_pago: codigos })
    .eq("id", sesion.carniceria.id);

  if (error) {
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo en un momento." };
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Medios de pago guardados." };
}

// ============================================================
// Promociones (especificación del bot, sección 17)
// ============================================================
//
// Regla absoluta de esa sección: el bot NUNCA inventa una promoción. Solo
// comunica las que están acá, activas y dentro de su vigencia.

export async function crearPromocion(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const titulo = String(datos.get("titulo") ?? "").trim();
  if (!titulo) {
    return { ok: false, mensaje: "La promo necesita un título." };
  }

  const desde = leerFecha(datos.get("desde"));
  const hasta = leerFecha(datos.get("hasta"));
  if (desde && hasta && hasta < desde) {
    return { ok: false, mensaje: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  const { error } = await getSupabaseAdmin().from("promociones").insert({
    carniceria_id: sesion.carniceria.id,
    titulo,
    detalle: vacioANull(datos.get("detalle")),
    desde,
    hasta,
    activa: true,
  });

  if (error) {
    return { ok: false, mensaje: "No se pudo guardar la promo. Probá de nuevo." };
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Promo cargada. El bot ya la puede comunicar." };
}

export async function cambiarEstadoPromocion(id: string, activa: boolean): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const { error } = await getSupabaseAdmin()
    .from("promociones")
    .update({ activa, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("carniceria_id", sesion.carniceria.id);

  if (error) return { ok: false, mensaje: "No se pudo actualizar la promo." };

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: activa ? "Promo activada." : "Promo pausada." };
}

export async function borrarPromocion(id: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const { error } = await getSupabaseAdmin()
    .from("promociones")
    .delete()
    .eq("id", id)
    .eq("carniceria_id", sesion.carniceria.id);

  if (error) return { ok: false, mensaje: "No se pudo borrar la promo." };

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Promo borrada." };
}

// ============================================================
// Sustitutos autorizados (especificación del bot, sección 5)
// ============================================================
//
// El bot SOLO puede ofrecer los reemplazos que estén acá. Si un corte no tiene
// ninguno cargado, cuando falte le va a decir al cliente que no hay, en vez de
// ofrecerle cualquier otra cosa parecida — que es justo lo que la sección 5.5
// prohíbe ("no ofrecer lomo como reemplazo de vacío solo porque los dos son
// carne vacuna").

export async function agregarSustituto(
  _previo: ResultadoAccion | null,
  datos: FormData
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const productoId = String(datos.get("producto_id") ?? "");
  const sustitutoId = String(datos.get("sustituto_id") ?? "");

  if (!productoId || !sustitutoId) {
    return { ok: false, mensaje: "Elegí los dos productos." };
  }
  if (productoId === sustitutoId) {
    return { ok: false, mensaje: "Un producto no puede reemplazarse a sí mismo." };
  }

  const { error } = await getSupabaseAdmin().from("sustitutos_autorizados").insert({
    carniceria_id: sesion.carniceria.id,
    producto_id: productoId,
    sustituto_id: sustitutoId,
    prioridad: Number(datos.get("prioridad") ?? 1) || 1,
    requiere_preguntar_uso: datos.get("preguntar_uso") === "on",
  });

  if (error) {
    // 23505 = ya existía ese par.
    if (error.code === "23505") return { ok: false, mensaje: "Ese reemplazo ya estaba cargado." };
    return { ok: false, mensaje: "No se pudo guardar. Probá de nuevo." };
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Reemplazo autorizado." };
}

export async function borrarSustituto(id: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const { error } = await getSupabaseAdmin()
    .from("sustitutos_autorizados")
    .delete()
    .eq("id", id)
    .eq("carniceria_id", sesion.carniceria.id);

  if (error) return { ok: false, mensaje: "No se pudo borrar." };

  revalidatePath("/panel/configuracion");
  return { ok: true, mensaje: "Reemplazo eliminado." };
}

// ------------------------------------------------------------

function leerFecha(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function vacioANull(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : texto;
}

function leerHora(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return /^\d{2}:\d{2}$/.test(texto) ? texto : null;
}

function leerModoHorarios(valor: FormDataEntryValue | null): "hibrido" | "bloquea" | "informativo" {
  const texto = String(valor ?? "");
  if (texto === "bloquea" || texto === "informativo") return texto;
  return "hibrido";
}
