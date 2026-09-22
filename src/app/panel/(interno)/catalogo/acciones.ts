"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import {
  buscarColision,
  codigoDesdeNombre,
  listarCatalogo,
  normalizarTermino,
  type Colision,
} from "@/lib/panel/catalogo";

// Acciones del catálogo.
//
// TODAS empiezan con `requerirSesion()`, que lee la carnicería del usuario con
// Row Level Security. Recién después se usa la service_role, y siempre
// filtrando por ese `carniceria_id`. Una Server Action es un endpoint POST
// alcanzable desde afuera: si no se verifica acá, no se verifica en ningún lado.

export type ResultadoCatalogo = {
  ok: boolean;
  mensaje: string;
  /**
   * Si vino esto, el panel tiene que preguntar antes de guardar.
   *
   * OJO CON LOS DOS IDS, que son distintos y confundirlos apaga el producto
   * equivocado: `productoId` es el que YA TENÍA la palabra (el que choca), y
   * `productoIdDestino` es al que se le quería agregar el sinónimo.
   */
  colision?: Colision & { termino: string; productoIdDestino: string };
};

function revalidar() {
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/stock");
  revalidatePath("/panel");
}

// ------------------------------------------------------------
// El tilde
// ------------------------------------------------------------

export async function accionAlternarActivo(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const productoId = String(datos.get("producto_id") ?? "");
  const activar = String(datos.get("activo") ?? "") === "true";

  const admin = getSupabaseAdmin();
  const { data: producto } = await admin
    .from("productos")
    .select("id, nombre_display")
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .maybeSingle();

  if (!producto) return { ok: false, mensaje: "No encontré ese producto." };

  const { error } = await admin
    .from("productos")
    .update({ activo: activar })
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id);

  if (error) return { ok: false, mensaje: "No pude guardar el cambio." };

  // El catálogo y la tabla de rendimiento se tocan, y esto no es obvio: si se
  // desactiva un corte que tiene porcentaje en la tabla vigente, la tabla deja
  // de sumar 100 %. Esos kilos no desaparecen de la media res, solo dejan de
  // tener dónde ir. Se avisa en vez de bloquear, porque la decisión de a dónde
  // mandarlos (al padre o a recortes) es del carnicero.
  let aviso = "";
  if (!activar) {
    const { data: enTabla } = await admin
      .from("rendimiento_cortes")
      .select("pct_central, tablas_rendimiento!inner(vigente_hasta)")
      .eq("producto_id", productoId)
      .is("tablas_rendimiento.vigente_hasta", null)
      .maybeSingle();

    if (enTabla && Number(enTabla.pct_central) > 0) {
      aviso =
        ` Ojo: ese corte tiene ${enTabla.pct_central} % en tu tabla de rendimiento. ` +
        `Mientras esté apagado, esos kilos no tienen a dónde ir cuando cargues una media res.`;
    }
  }

  revalidar();
  return {
    ok: true,
    mensaje: `${producto.nombre_display}: ${activar ? "activado" : "desactivado"}.${aviso}`,
  };
}

// ------------------------------------------------------------
// El alias: cómo lo llama él
// ------------------------------------------------------------

export async function accionGuardarAlias(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const productoId = String(datos.get("producto_id") ?? "");
  const alias = String(datos.get("alias") ?? "").trim();

  const { error } = await getSupabaseAdmin()
    .from("productos")
    .update({ alias_display: alias === "" ? null : alias })
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id);

  if (error) return { ok: false, mensaje: "No pude guardar el nombre." };

  revalidar();
  return {
    ok: true,
    mensaje: alias === "" ? "Volvió a llamarse como en el sistema." : `Ahora lo llamo "${alias}".`,
  };
}

// ------------------------------------------------------------
// Los sinónimos
// ------------------------------------------------------------

export async function accionAgregarSinonimo(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const productoId = String(datos.get("producto_id") ?? "");
  const termino = normalizarTermino(String(datos.get("termino") ?? ""));
  const forzar = String(datos.get("forzar") ?? "") === "true";

  if (!termino) return { ok: false, mensaje: "Escribí cómo lo llaman." };

  // La pertenencia se verifica contra la carnicería de la sesión y no solo
  // por RLS: una Server Action es un endpoint POST alcanzable desde afuera.
  const admin = getSupabaseAdmin();
  const { data: propio } = await admin
    .from("productos")
    .select("id")
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .maybeSingle();

  if (!propio) return { ok: false, mensaje: "No encontré ese producto." };

  const supabase = await getSupabaseServidor();
  const catalogo = await listarCatalogo(supabase);
  const colision = buscarColision(termino, catalogo, productoId);

  // Choca con un producto ACTIVO: no se guarda a ciegas. Que dos productos
  // activos reclamen la misma palabra es un bug silencioso.
  if (colision && colision.activo && !forzar) {
    return {
      ok: false,
      mensaje: `"${termino}" hoy es tu producto ${colision.nombre}.`,
      colision: { ...colision, termino, productoIdDestino: productoId },
    };
  }

  const { error } = await admin
    .from("producto_sinonimos")
    .insert({ producto_id: productoId, texto: termino });

  if (error) {
    // El unique (producto_id, texto) ya lo tenía: no es un error para el usuario.
    if (error.code === "23505") return { ok: true, mensaje: "Ya lo tenías cargado." };
    return { ok: false, mensaje: "No pude guardar el sinónimo." };
  }

  revalidar();

  // Choca con uno INACTIVO: se guarda igual, pero se avisa. No es un problema
  // hoy; sí el día que lo reactiven.
  if (colision && !colision.activo) {
    return {
      ok: true,
      mensaje: `Listo. Ojo: si algún día reactivás ${colision.nombre}, van a chocar por "${termino}".`,
    };
  }

  return { ok: true, mensaje: `Listo, ahora entiendo "${termino}".` };
}

export async function accionQuitarSinonimo(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const sinonimoId = String(datos.get("sinonimo_id") ?? "");

  const admin = getSupabaseAdmin();
  const { data: sinonimo } = await admin
    .from("producto_sinonimos")
    .select("id, texto, productos!inner(carniceria_id)")
    .eq("id", sinonimoId)
    .maybeSingle();

  const fila = sinonimo as unknown as
    | { id: string; texto: string; productos: { carniceria_id: string } }
    | null;

  if (!fila || fila.productos.carniceria_id !== sesion.carniceria.id) {
    return { ok: false, mensaje: "No encontré ese sinónimo." };
  }

  await admin.from("producto_sinonimos").delete().eq("id", sinonimoId);
  revalidar();
  return { ok: true, mensaje: `Saqué "${fila.texto}".` };
}

// ------------------------------------------------------------
// Resolver una colisión
// ------------------------------------------------------------

export async function accionResolverColision(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const productoId = String(datos.get("producto_id") ?? "");
  const otroProductoId = String(datos.get("otro_producto_id") ?? "");
  const termino = normalizarTermino(String(datos.get("termino") ?? ""));
  const opcion = String(datos.get("opcion") ?? "");

  const admin = getSupabaseAdmin();
  const { data: productos } = await admin
    .from("productos")
    .select("id, codigo, nombre_display")
    .eq("carniceria_id", sesion.carniceria.id)
    .in("id", [productoId, otroProductoId]);

  const propio = (productos ?? []).find((p) => p.id === productoId);
  const otro = (productos ?? []).find((p) => p.id === otroProductoId);
  if (!propio || !otro) return { ok: false, mensaje: "No encontré los productos." };

  // (a) Para este carnicero son el mismo corte: se desactiva el otro y el
  // término pasa a significar éste. Es la opción correcta cuando el nombre
  // duplicado no es un sinónimo sino la misma carne con dos fichas.
  if (opcion === "reemplazar") {
    await admin
      .from("productos")
      .update({ activo: false })
      .eq("id", otroProductoId)
      .eq("carniceria_id", sesion.carniceria.id);

    await admin
      .from("producto_sinonimos")
      .insert({ producto_id: productoId, texto: termino });

    revalidar();
    return {
      ok: true,
      mensaje: `Listo: "${termino}" ahora es ${propio.nombre_display}, y apagué ${otro.nombre_display}.`,
    };
  }

  // (b) Son dos cosas distintas y el bot tiene que preguntar. Sale gratis:
  // es una fila en `terminos_ambiguos`, el mismo mecanismo que resuelve los
  // cinco nombres compartidos entre vacuno y cerdo.
  if (opcion === "ambiguo") {
    const { error } = await admin.from("terminos_ambiguos").insert({
      carniceria_id: sesion.carniceria.id,
      texto: termino,
      pregunta: `¿${propio.nombre_display} o ${otro.nombre_display}?`,
      opciones_codigos: [propio.codigo, otro.codigo],
      activo: true,
    });

    if (error && error.code !== "23505") {
      return { ok: false, mensaje: "No pude guardar la repregunta." };
    }

    await admin
      .from("producto_sinonimos")
      .insert({ producto_id: productoId, texto: termino });

    revalidar();
    return {
      ok: true,
      mensaje: `Listo: cuando digan "${termino}", el bot va a preguntar cuál de los dos es.`,
    };
  }

  return { ok: false, mensaje: "No hice nada." };
}

// ------------------------------------------------------------
// Dar de alta un producto propio
// ------------------------------------------------------------

export async function accionCrearProducto(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const nombre = String(datos.get("nombre") ?? "").trim();
  const familia = String(datos.get("familia") ?? "").trim() || "otros";
  const unidad = String(datos.get("unidad") ?? "kg");
  const especieCruda = String(datos.get("especie") ?? "");
  const especie = ["vacuno", "porcino", "aviar"].includes(especieCruda) ? especieCruda : null;

  if (nombre.length < 2) return { ok: false, mensaje: "Poné el nombre del producto." };
  if (!["kg", "unidad", "docena", "bolsa"].includes(unidad)) {
    return { ok: false, mensaje: "Esa unidad no existe." };
  }

  const codigo = codigoDesdeNombre(nombre);
  if (!codigo) return { ok: false, mensaje: "Ese nombre no me sirve para armar un código." };

  const supabase = await getSupabaseServidor();
  const catalogo = await listarCatalogo(supabase);

  // Un producto nuevo que se llama igual que otro es el mismo problema que un
  // sinónimo repetido, y se avisa antes de crearlo.
  const colision = buscarColision(nombre, catalogo, "");
  if (colision && colision.activo) {
    return { ok: false, mensaje: `Ya tenés un producto activo que se llama "${colision.nombre}".` };
  }

  const { error } = await getSupabaseAdmin().from("productos").insert({
    carniceria_id: sesion.carniceria.id,
    codigo,
    nombre_display: nombre,
    familia,
    unidad,
    especie,
    activo: true,
    stock_actual: 0,
    es_propio: true,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, mensaje: `Ya existe un producto con el código "${codigo}".` };
    return { ok: false, mensaje: "No pude crear el producto." };
  }

  // Nace sin fila en la tabla de rendimiento a propósito: existe para vender,
  // pero no le llegan kilos desde la media res hasta que alguien le asigne un
  // porcentaje o lo cuelgue de un padre.
  revalidar();
  return { ok: true, mensaje: `Creé "${nombre}". Todavía no le llegan kilos de ninguna media res.` };
}

export async function accionBorrarProducto(
  _previo: ResultadoCatalogo | null,
  datos: FormData
): Promise<ResultadoCatalogo> {
  const sesion = await requerirSesion();
  const productoId = String(datos.get("producto_id") ?? "");
  const admin = getSupabaseAdmin();

  const { data: producto } = await admin
    .from("productos")
    .select("id, nombre_display, es_propio")
    .eq("id", productoId)
    .eq("carniceria_id", sesion.carniceria.id)
    .maybeSingle();

  if (!producto) return { ok: false, mensaje: "No encontré ese producto." };

  // Un producto de fábrica no se borra: se desactiva. Borrarlo rompería el
  // historial de cualquier movimiento viejo que lo referencie.
  if (!producto.es_propio) {
    return { ok: false, mensaje: "Ese vino en el catálogo base: se desactiva, no se borra." };
  }

  const { count } = await admin
    .from("piezas_stock")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", productoId);

  if ((count ?? 0) > 0) {
    return { ok: false, mensaje: "Ese producto ya tuvo stock. Desactivalo en vez de borrarlo." };
  }

  await admin.from("productos").delete().eq("id", productoId).eq("carniceria_id", sesion.carniceria.id);
  revalidar();
  return { ok: true, mensaje: `Borré "${producto.nombre_display}".` };
}
