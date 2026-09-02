"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  aprobarPedido,
  marcarPedidoNoRetirado,
  marcarPedidoRetirado,
  rechazarPedido,
} from "@/lib/flujoPedidos";
import { enviarWhatsapp, marcarConversacionLeida } from "@/lib/whatsapp";

// Acciones del panel.
//
// TODAS empiezan con `requerirSesion()`, que lee la carnicería del usuario con
// Row Level Security. Recién después se usa la service_role, y siempre
// filtrando por ese `carniceria_id`. Una Server Action es un endpoint POST
// alcanzable desde afuera: si no se verifica acá, no se verifica en ningún lado.

export type ResultadoAccion = { ok: boolean; mensaje: string };

// ============================================================
// Pedidos — la acción más frecuente y más urgente del panel
// ============================================================

export async function accionAprobarPedido(pedidoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const resultado = await aprobarPedido({
    carniceriaId: sesion.carniceria.id,
    pedidoId,
    decididoPor: sesion.usuarioId,
  });

  await marcarAvisoResuelto(sesion.carniceria.id, `pedido_pendiente:${pedidoId}`);
  revalidarPedidos();
  return resultado;
}

export async function accionRechazarPedido(pedidoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  const resultado = await rechazarPedido({
    carniceriaId: sesion.carniceria.id,
    pedidoId,
    decididoPor: sesion.usuarioId,
  });

  await marcarAvisoResuelto(sesion.carniceria.id, `pedido_pendiente:${pedidoId}`);
  revalidarPedidos();
  return resultado;
}

export async function accionMarcarRetirado(pedidoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const resultado = await marcarPedidoRetirado({
    carniceriaId: sesion.carniceria.id,
    pedidoId,
    decididoPor: sesion.usuarioId,
  });
  revalidarPedidos();
  return resultado;
}

export async function accionMarcarNoRetirado(pedidoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const resultado = await marcarPedidoNoRetirado({
    carniceriaId: sesion.carniceria.id,
    pedidoId,
    decididoPor: sesion.usuarioId,
  });
  revalidarPedidos();
  return resultado;
}

function revalidarPedidos() {
  revalidatePath("/panel");
  revalidatePath("/panel/pedidos");
  revalidatePath("/panel/caja");
}

// ============================================================
// Stock y precios — edición rápida in situ
// ============================================================

export async function accionActualizarStock(
  productoId: string,
  nuevoStock: number
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
    return { ok: false, mensaje: "El stock no puede ser un número negativo." };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("productos")
    .update({
      stock_actual: nuevoStock,
      stock_actualizado_at: ahora,
      // Queda registrado que este cambio vino del panel y no de un audio.
      stock_origen: "panel",
    })
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .select("id, nombre_display, stock_actual")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, mensaje: "No se pudo guardar el stock. Probá de nuevo." };
  }

  await revisarAvisoDeStock(sesion.carniceria.id, productoId);
  revalidatePath("/panel/stock");
  revalidatePath("/panel");

  return { ok: true, mensaje: `Stock de ${data.nombre_display} actualizado.` };
}

export async function accionActualizarPrecio(
  productoId: string,
  nuevoPrecio: number | null
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  if (nuevoPrecio !== null && (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0)) {
    return { ok: false, mensaje: "El precio no puede ser un número negativo." };
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("productos")
    .update({
      precio: nuevoPrecio,
      precio_actualizado_at: new Date().toISOString(),
    })
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .select("id, nombre_display")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, mensaje: "No se pudo guardar el precio. Probá de nuevo." };
  }

  revalidatePath("/panel/stock");
  return { ok: true, mensaje: `Precio de ${data.nombre_display} actualizado.` };
}

// ============================================================
// Mensajería
// ============================================================

export async function accionEnviarMensaje(
  conversacionId: string,
  texto: string
): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();
  const limpio = texto.trim();

  if (!limpio) return { ok: false, mensaje: "Escribí algo antes de enviar." };
  if (limpio.length > 4000) {
    return { ok: false, mensaje: "El mensaje es demasiado largo (máximo 4000 caracteres)." };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: conversacion } = await supabaseAdmin
    .from("conversaciones")
    .select("id, telefono, cliente_id, es_carnicero")
    .eq("id", conversacionId)
    .eq("carniceria_id", sesion.carniceria.id)
    .maybeSingle();

  if (!conversacion) return { ok: false, mensaje: "No encontramos esa conversación." };

  try {
    await enviarWhatsapp({
      carniceriaId: sesion.carniceria.id,
      hacia: conversacion.telefono as string,
      cuerpo: limpio,
      // `panel` distingue este mensaje de los del bot y de los que el carnicero
      // manda desde su celular. En el hilo se ve de dónde salió cada uno.
      origen: "panel",
      clienteId: (conversacion.cliente_id as string | null) ?? undefined,
      esCarnicero: Boolean(conversacion.es_carnicero),
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "No se pudo enviar el mensaje.";
    return { ok: false, mensaje };
  }

  revalidatePath(`/panel/mensajes/${conversacionId}`);
  revalidatePath("/panel/mensajes");
  return { ok: true, mensaje: "Mensaje enviado." };
}

export async function accionMarcarLeida(conversacionId: string): Promise<void> {
  const sesion = await requerirSesion();
  await marcarConversacionLeida(sesion.carniceria.id, conversacionId);
  revalidatePath("/panel/mensajes");
}

// ============================================================
// Avisos
// ============================================================

export async function accionMarcarAvisoLeido(avisoId: string): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  await getSupabaseAdmin()
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("id", avisoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .is("leida_at", null);

  revalidatePath("/panel/avisos");
  revalidatePath("/panel", "layout");
  return { ok: true, mensaje: "Aviso marcado como leído." };
}

export async function accionMarcarTodosLosAvisosLeidos(): Promise<ResultadoAccion> {
  const sesion = await requerirSesion();

  await getSupabaseAdmin()
    .from("notificaciones")
    .update({ leida_at: new Date().toISOString() })
    .eq("carniceria_id", sesion.carniceria.id)
    .is("leida_at", null);

  revalidatePath("/panel/avisos");
  revalidatePath("/panel", "layout");
  return { ok: true, mensaje: "Listo, no quedan avisos sin leer." };
}

// ------------------------------------------------------------
// Auxiliares de avisos
// ------------------------------------------------------------

/** Da por leído el aviso asociado a algo que el carnicero acaba de resolver. */
async function marcarAvisoResuelto(carniceriaId: string, clave: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("notificaciones")
      .update({ leida_at: new Date().toISOString() })
      .eq("carniceria_id", carniceriaId)
      .eq("clave_unicidad", clave)
      .is("leida_at", null);
  } catch (err) {
    console.error("No se pudo cerrar el aviso asociado", err);
  }
}

/**
 * Después de cambiar el stock a mano: si el producto volvió a tener existencia,
 * el aviso de "sin stock" ya no tiene sentido y se marca como leído. Un centro
 * de notificaciones que sigue mostrando problemas ya resueltos se vuelve
 * invisible en una semana.
 */
async function revisarAvisoDeStock(carniceriaId: string, productoId: string): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: producto } = await supabaseAdmin
      .from("productos")
      .select("stock_actual, umbral_stock_bajo")
      .eq("id", productoId)
      .maybeSingle();

    if (!producto) return;

    const { data: carniceria } = await supabaseAdmin
      .from("carnicerias")
      .select("umbral_stock_bajo_default")
      .eq("id", carniceriaId)
      .maybeSingle();

    const umbral =
      producto.umbral_stock_bajo === null
        ? Number(carniceria?.umbral_stock_bajo_default ?? 3)
        : Number(producto.umbral_stock_bajo);

    if (Number(producto.stock_actual) > umbral) {
      await supabaseAdmin
        .from("notificaciones")
        .update({ leida_at: new Date().toISOString() })
        .eq("carniceria_id", carniceriaId)
        .in("clave_unicidad", [`stock_agotado:${productoId}`, `stock_bajo:${productoId}`])
        .is("leida_at", null);
    }
  } catch (err) {
    console.error("No se pudo revisar el aviso de stock", err);
  }
}
