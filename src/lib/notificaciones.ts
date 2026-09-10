import { getSupabaseAdmin } from "./supabaseAdmin";

// Generación de avisos (la campanita del panel).
//
// La regla que ordena todo esto: **no saturar**. Un centro de notificaciones con
// cincuenta avisos irrelevantes se vuelve invisible en una semana, y entonces el
// carnicero se pierde el único que importaba.
//
// Dos mecanismos para eso:
//   1. `clave_unicidad` — un índice único parcial en la base impide que exista
//      dos veces el mismo aviso SIN LEER. Si un producto se queda sin stock, el
//      aviso se crea una sola vez, no cada vez que el bot lo consulta.
//   2. Los avisos se cierran solos cuando el problema se resuelve (se aprueba el
//      pedido, vuelve el stock), en vez de quedar acumulándose.
//
// Nada de esto debe romper el flujo que lo llamó: si falla la creación de un
// aviso, se registra en el log y la vida sigue. Un pedido que no se toma porque
// no se pudo crear una notificación sería un intercambio pésimo.

export type TipoAviso =
  | "pedido_pendiente"
  // Tanda 4-5 (especificación, sección 53: "todo cambio de un pedido debe
  // notificarse al carnicero"). No todos requieren que vuelva a aprobar, pero
  // todos tienen que ser visibles.
  | "pedido_modificado"
  | "pedido_reprogramado"
  | "pedido_cancelado"
  | "pedidos_del_dia"
  | "pedidos_sin_cerrar"
  | "cierre_con_pedidos"
  | "decision_requerida"
  | "stock_agotado"
  | "stock_bajo"
  | "cliente_no_retiro"
  | "whatsapp_desconectado"
  | "whatsapp_por_vencer"
  | "plantilla_aprobada"
  | "plantilla_rechazada";

export async function crearAviso(params: {
  carniceriaId: string;
  tipo: TipoAviso;
  titulo: string;
  cuerpo?: string | null;
  /** Ruta del panel donde se resuelve. Todo aviso debería tener una. */
  enlace?: string | null;
  entidadTipo?: string | null;
  entidadId?: string | null;
  /** Evita duplicados del mismo aviso sin leer. Ej: "stock_agotado:<producto_id>". */
  claveUnicidad?: string | null;
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("notificaciones").insert({
      carniceria_id: params.carniceriaId,
      tipo: params.tipo,
      titulo: params.titulo,
      cuerpo: params.cuerpo ?? null,
      enlace: params.enlace ?? null,
      entidad_tipo: params.entidadTipo ?? null,
      entidad_id: params.entidadId ?? null,
      clave_unicidad: params.claveUnicidad ?? null,
    });

    // 23505 = violación de unicidad: ya existe ese mismo aviso sin leer. Es el
    // caso esperado, no un problema.
    if (error && error.code !== "23505") {
      console.error("No se pudo crear el aviso", error);
    }
  } catch (err) {
    console.error("No se pudo crear el aviso", err);
  }
}

/** Da por leídos los avisos de una clave — el problema ya se resolvió. */
export async function cerrarAvisos(carniceriaId: string, claves: string[]): Promise<void> {
  if (claves.length === 0) return;
  try {
    await getSupabaseAdmin()
      .from("notificaciones")
      .update({ leida_at: new Date().toISOString() })
      .eq("carniceria_id", carniceriaId)
      .in("clave_unicidad", claves)
      .is("leida_at", null);
  } catch (err) {
    console.error("No se pudieron cerrar los avisos", err);
  }
}

// ============================================================
// Avisos concretos
// ============================================================

export async function avisarPedidoPendiente(params: {
  carniceriaId: string;
  pedidoId: string;
  clienteNombre: string | null;
  cantidadItems: number;
}): Promise<void> {
  await crearAviso({
    carniceriaId: params.carniceriaId,
    tipo: "pedido_pendiente",
    titulo: `Pedido nuevo de ${params.clienteNombre ?? "un cliente"}`,
    cuerpo: `${params.cantidadItems} ${params.cantidadItems === 1 ? "producto" : "productos"}, esperando que lo apruebes.`,
    enlace: `/panel/pedidos/${params.pedidoId}`,
    entidadTipo: "pedido",
    entidadId: params.pedidoId,
    claveUnicidad: `pedido_pendiente:${params.pedidoId}`,
  });
}

export async function avisarClienteNoRetiro(params: {
  carniceriaId: string;
  pedidoId: string;
  clienteNombre: string | null;
}): Promise<void> {
  await crearAviso({
    carniceriaId: params.carniceriaId,
    tipo: "cliente_no_retiro",
    titulo: `${params.clienteNombre ?? "Un cliente"} no retiró su pedido`,
    cuerpo: "Se marcó solo porque pasó la hora de retiro. Si en realidad lo retiró, corregilo desde el pedido.",
    enlace: `/panel/pedidos/${params.pedidoId}`,
    entidadTipo: "pedido",
    entidadId: params.pedidoId,
    claveUnicidad: `cliente_no_retiro:${params.pedidoId}`,
  });
}

/**
 * Revisa un producto después de que le cambió el stock y avisa si se quedó sin
 * existencia o quedó por debajo del umbral. Si volvió a estar bien, cierra los
 * avisos viejos.
 */
export async function revisarStockDeProducto(params: {
  carniceriaId: string;
  productoId: string;
}): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: producto } = await supabaseAdmin
      .from("productos")
      .select("id, nombre_display, stock_actual, umbral_stock_bajo, unidad")
      .eq("id", params.productoId)
      .maybeSingle();

    if (!producto) return;

    const { data: carniceria } = await supabaseAdmin
      .from("carnicerias")
      .select("umbral_stock_bajo_default")
      .eq("id", params.carniceriaId)
      .maybeSingle();

    const umbral =
      producto.umbral_stock_bajo === null
        ? Number(carniceria?.umbral_stock_bajo_default ?? 3)
        : Number(producto.umbral_stock_bajo);

    const stock = Number(producto.stock_actual);
    const nombre = producto.nombre_display as string;

    const claveAgotado = `stock_agotado:${params.productoId}`;
    const claveBajo = `stock_bajo:${params.productoId}`;

    if (stock <= 0) {
      await cerrarAvisos(params.carniceriaId, [claveBajo]);
      await crearAviso({
        carniceriaId: params.carniceriaId,
        tipo: "stock_agotado",
        titulo: `Te quedaste sin ${nombre.toLowerCase()}`,
        cuerpo: "El bot ya no lo va a ofrecer hasta que cargues stock.",
        enlace: "/panel/stock?estado=sin_stock",
        entidadTipo: "producto",
        entidadId: params.productoId,
        claveUnicidad: claveAgotado,
      });
      return;
    }

    if (stock <= umbral) {
      await cerrarAvisos(params.carniceriaId, [claveAgotado]);
      await crearAviso({
        carniceriaId: params.carniceriaId,
        tipo: "stock_bajo",
        titulo: `Queda poco ${nombre.toLowerCase()}`,
        cuerpo: `Quedan ${stock} ${producto.unidad === "kg" ? "kg" : "u."}.`,
        enlace: "/panel/stock?estado=poco",
        entidadTipo: "producto",
        entidadId: params.productoId,
        claveUnicidad: claveBajo,
      });
      return;
    }

    // Volvió a estar bien: los avisos viejos ya no tienen sentido.
    await cerrarAvisos(params.carniceriaId, [claveAgotado, claveBajo]);
  } catch (err) {
    console.error("No se pudo revisar el stock para avisos", err);
  }
}
