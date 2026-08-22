import { getSupabaseAdmin } from "./supabaseAdmin";
import { cargarCatalogo, CatalogoCarniceria } from "./catalogo";
import { descargarAudioTwilio } from "./twilioMedia";
import { transcribirAudio } from "./whisper";
import { interpretarMensajeStock, ItemOperacion, ItemParcial, ResultadoInterpretacion } from "./interpretarStock";
import { clasificarRespuesta } from "./confirmacion";
import { finDeHoyArgentina } from "./tiempo";

// Máquina de estados "INTERPRETAR → VALIDAR → CONFIRMAR → EJECUTAR" de la
// especificación "Botonera de confirmación por WhatsApp" (22/08/2026).
// El sandbox de Twilio no soporta botones interactivos reales — cada
// carnicería necesitaría su propio número de WhatsApp Business verificado
// por Meta, lo que puede tardar semanas por carnicería — así que, con el
// fundador, se decidió construir la misma máquina de estados usando TEXTO
// como canal ("confirmar"/"modificar"/"cancelar") y dejar los botones
// reales como mejora opcional futura, carnicería por carnicería.
//
// Nunca se toca `productos.stock_actual` fuera de `confirmarYEjecutar`.

type ItemGuardado = ItemOperacion & { producto_id: string; nombre_display: string; familia: string };

type OperacionPendiente = {
  id: string;
  estado: "pendiente_aclaracion" | "pendiente_confirmacion" | "pendiente_modificacion";
  items: ItemGuardado[];
  pregunta_pendiente: string | null;
  itemParcial?: ItemParcial;
  vencida: boolean;
};

function emojiParaFamilia(familia: string): string {
  if (familia.startsWith("pollo")) return "🐔";
  if (familia === "embutidos") return "🌭";
  if (familia === "complementarios") return "🧂";
  if (familia === "achuras") return "🍖";
  if (familia.includes("cerdo")) return "🐖";
  return "🥩";
}

function armarMensajeResumen(items: ItemGuardado[]): string {
  const lineas = items.map((item) => {
    const signo = item.accion === "ingreso" ? "+" : item.accion === "baja" ? "-" : "=";
    return `${emojiParaFamilia(item.familia)} ${item.nombre_display} — ${signo}${item.cantidad}${item.unidad}`;
  });
  return `Entendí:\n${lineas.join("\n")}\n¿Está bien? Respondé *confirmar* o *modificar*.`;
}

async function obtenerOperacionPendienteActiva(
  carniceriaId: string,
  telefono: string
): Promise<OperacionPendiente | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("operaciones_stock")
    .select("id, estado, items, pregunta_pendiente, interpretacion, expires_at")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .in("estado", ["pendiente_aclaracion", "pendiente_confirmacion", "pendiente_modificacion"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando operación pendiente", error);
    return null;
  }
  if (!data) return null;

  const estaVencida =
    data.estado === "pendiente_confirmacion" &&
    Boolean(data.expires_at) &&
    new Date(data.expires_at as string) < new Date();

  if (estaVencida) {
    // Expiración perezosa (punto 13 de la especificación): no hay un cron
    // corriendo en background todavía, así que se chequea y se marca acá,
    // la primera vez que alguien vuelve a tocar esta operación.
    await supabaseAdmin
      .from("operaciones_stock")
      .update({ estado: "vencido", updated_at: new Date().toISOString() })
      .eq("id", data.id);
  }

  // El item en construcción vive dentro de la última interpretación
  // guardada (resultado crudo de la IA) — solo aplica si esa última
  // respuesta fue de tipo aclaracion/info_faltante; si el registro es de
  // otro tipo (ej. quedó de una operación vieja) no hay nada que rescatar.
  const interpretacion = data.interpretacion as
    | { tipo?: string; itemParcial?: ItemParcial }
    | null
    | undefined;
  const itemParcial =
    interpretacion &&
    (interpretacion.tipo === "aclaracion" || interpretacion.tipo === "info_faltante") &&
    interpretacion.itemParcial
      ? interpretacion.itemParcial
      : undefined;

  return {
    id: data.id as string,
    estado: data.estado as OperacionPendiente["estado"],
    items: (data.items ?? []) as ItemGuardado[],
    pregunta_pendiente: (data.pregunta_pendiente as string | null) ?? null,
    itemParcial,
    vencida: estaVencida,
  };
}

async function guardarResultado(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  operacionId?: string;
  resultado: ResultadoInterpretacion;
  catalogo: CatalogoCarniceria;
  texto: string;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, operacionId, resultado, catalogo, texto } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  async function guardar(cambios: Record<string, unknown>) {
    if (operacionId) {
      await supabaseAdmin.from("operaciones_stock").update(cambios).eq("id", operacionId);
    } else {
      await supabaseAdmin.from("operaciones_stock").insert({
        carniceria_id: carniceriaId,
        telefono,
        mensaje_whatsapp_id: mensajeWhatsappId,
        estado: "pendiente_aclaracion",
        items: [],
        ...cambios,
      });
    }
  }

  if (resultado.tipo === "no_entendido") {
    await guardar({ transcripcion: texto, interpretacion: resultado, updated_at: ahora });
    return operacionId
      ? "No entendí tu respuesta. Podés responder *confirmar*, *modificar*, o contarme de nuevo qué cambió."
      : `No relacioné "${texto}" con una actualización de stock. ¿Podés decirlo de otra forma?`;
  }

  if (resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante") {
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: resultado,
      pregunta_pendiente: resultado.pregunta,
      updated_at: ahora,
    });
    return resultado.pregunta;
  }

  // tipo === "operacion"
  const itemsResueltos: ItemGuardado[] = [];
  for (const item of resultado.items) {
    const producto = catalogo.porCodigo.get(item.producto_codigo);
    if (!producto) {
      await guardar({ transcripcion: texto, interpretacion: resultado, updated_at: ahora });
      return `Entendí algo, pero no reconocí uno de los productos ("${item.producto_codigo}"). ¿Podés decirlo de otra forma?`;
    }
    itemsResueltos.push({
      ...item,
      // La unidad SIEMPRE es la que tiene registrada el producto en el
      // catálogo, nunca la que "cree" la IA a partir del mensaje — la
      // matemática de stock (confirmarYEjecutar) suma/resta "cantidad" tal
      // cual, asumiendo que está expresada en la unidad real del producto.
      // Si dejáramos que la IA eligiera la unidad libremente y el producto
      // tuviera mal cargada su unidad real, el número quedaría mal
      // aplicado sin importar qué tan bien se haya entendido el mensaje
      // (bug real detectado 22/08/2026: "chorizo" estaba en kg cuando se
      // cuenta por unidad).
      unidad: producto.unidad,
      producto_id: producto.id,
      nombre_display: producto.nombre_display,
      familia: producto.familia,
    });
  }

  await guardar({
    estado: "pendiente_confirmacion",
    transcripcion: texto,
    interpretacion: resultado,
    pregunta_pendiente: null,
    items: itemsResueltos,
    expires_at: finDeHoyArgentina().toISOString(),
    updated_at: ahora,
  });

  return armarMensajeResumen(itemsResueltos);
}

async function confirmarYEjecutar(operacionId: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  // CAS atómico sobre `estado`: solo la primera confirmación afecta una
  // fila. Un evento de confirmación duplicado (punto 8 de la
  // especificación: idempotencia) encuentra 0 filas acá y no vuelve a
  // tocar stock.
  const { data, error } = await supabaseAdmin
    .from("operaciones_stock")
    .update({ estado: "ejecutado", confirmed_at: ahora, executed_at: ahora, updated_at: ahora })
    .eq("id", operacionId)
    .eq("estado", "pendiente_confirmacion")
    .select("items")
    .maybeSingle();

  if (error) {
    console.error("Error confirmando operación de stock", error);
    return "Tuve un problema técnico confirmando. Probá de nuevo en un rato.";
  }

  if (!data) {
    return "Esa operación ya fue procesada (o ya no está disponible). Si querés cargar algo, mandá un audio nuevo.";
  }

  const items = (data.items ?? []) as ItemGuardado[];
  const resumen: string[] = [];

  // Nota: cada item se aplica con una lectura + escritura separada (no en
  // una única transacción atómica de Postgres) — aceptable para el volumen
  // de un piloto de una sola carnicería dictando por voz de a un mensaje
  // por vez; si en el futuro hay updates realmente concurrentes sobre el
  // mismo producto, esto podría perder una escritura y habría que pasar a
  // un UPDATE con expresión relativa (ej. una función de Postgres).
  for (const item of items) {
    const { data: producto, error: errProducto } = await supabaseAdmin
      .from("productos")
      .select("stock_actual, unidad")
      .eq("id", item.producto_id)
      .single();

    if (errProducto || !producto) {
      resumen.push(`${item.nombre_display}: no se pudo actualizar (producto no encontrado).`);
      continue;
    }

    const stockActual = Number(producto.stock_actual);
    let nuevoStock = stockActual;
    if (item.accion === "ingreso") nuevoStock = stockActual + item.cantidad;
    else if (item.accion === "baja") nuevoStock = Math.max(0, stockActual - item.cantidad);
    else if (item.accion === "ajuste") nuevoStock = item.cantidad;

    await supabaseAdmin
      .from("productos")
      .update({ stock_actual: nuevoStock, stock_actualizado_at: ahora })
      .eq("id", item.producto_id);

    resumen.push(`${item.nombre_display} = ${nuevoStock}${producto.unidad}`);
  }

  return `Listo, quedó actualizado:\n${resumen.join("\n")}`;
}

async function cancelarOperacion(operacionId: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from("operaciones_stock")
    .update({ estado: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", operacionId)
    .eq("estado", "pendiente_confirmacion");
  return "Bien, no cargué nada. Podés mandar el audio de nuevo cuando quieras.";
}

async function pasarAModificar(operacionId: string): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const pregunta = "Dale, ¿qué querés modificar?";
  await supabaseAdmin
    .from("operaciones_stock")
    .update({ estado: "pendiente_modificacion", pregunta_pendiente: pregunta, updated_at: new Date().toISOString() })
    .eq("id", operacionId)
    .eq("estado", "pendiente_confirmacion");
  return pregunta;
}

export async function procesarAudioDeStock(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  mediaUrl: string;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, mediaUrl } = params;

  let transcripcion: string;
  try {
    const audio = await descargarAudioTwilio(mediaUrl);
    transcripcion = await transcribirAudio(audio);
  } catch (err) {
    console.error("Error descargando/transcribiendo audio", err);
    return "No pude escuchar bien ese audio. ¿Podés grabarlo de nuevo?";
  }

  if (!transcripcion) {
    return "El audio me llegó vacío o no se entendió nada. ¿Podés repetirlo?";
  }

  let catalogo: CatalogoCarniceria;
  try {
    catalogo = await cargarCatalogo(carniceriaId);
  } catch (err) {
    console.error("Error cargando el catálogo", err);
    return "Tuve un problema técnico cargando el catálogo. Probá de nuevo en un rato.";
  }

  // Si ya hay una operación en curso para este número, un audio nuevo se
  // trata como información adicional de ESA misma operación (no se abre
  // una segunda operación en paralelo ni se pisa silenciosamente).
  const opExistente = await obtenerOperacionPendienteActiva(carniceriaId, telefono);
  const opActiva = opExistente && !opExistente.vencida ? opExistente : null;

  const resultado = await interpretarMensajeStock(
    transcripcion,
    catalogo.promptCatalogo,
    opActiva
      ? {
          itemsActuales: opActiva.items,
          preguntaPendiente: opActiva.pregunta_pendiente ?? undefined,
          itemParcial: opActiva.itemParcial,
        }
      : undefined
  );

  return await guardarResultado({
    carniceriaId,
    telefono,
    mensajeWhatsappId,
    operacionId: opActiva?.id,
    resultado,
    catalogo,
    texto: transcripcion,
  });
}

export async function procesarTextoEntrante(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto } = params;

  const op = await obtenerOperacionPendienteActiva(carniceriaId, telefono);
  if (!op) return null; // nada pendiente de stock — Etapa 3 se ocupa de mensajes sueltos

  if (op.vencida) {
    const intento = clasificarRespuesta(texto);
    if (intento === "confirmar") {
      return "Esa operación ya venció. Si querés, mandá el audio de nuevo.";
    }
    return null;
  }

  if (op.estado === "pendiente_confirmacion") {
    const intento = clasificarRespuesta(texto);
    if (intento === "confirmar") return await confirmarYEjecutar(op.id);
    if (intento === "cancelar") return await cancelarOperacion(op.id);
    if (intento === "modificar") return await pasarAModificar(op.id);
    // cualquier otra cosa (ej. "no, eran 12 kilos") se trata como
    // corrección — cae al bloque de abajo.
  }

  // pendiente_modificacion, pendiente_aclaracion, o una corrección en
  // texto libre sobre una pendiente_confirmacion: se interpreta en el
  // contexto de la operación en curso (nunca como mensaje nuevo aislado).
  let catalogo: CatalogoCarniceria;
  try {
    catalogo = await cargarCatalogo(carniceriaId);
  } catch (err) {
    console.error("Error cargando el catálogo", err);
    return "Tuve un problema técnico cargando el catálogo. Probá de nuevo en un rato.";
  }

  const resultado = await interpretarMensajeStock(texto, catalogo.promptCatalogo, {
    itemsActuales: op.items,
    preguntaPendiente: op.pregunta_pendiente ?? undefined,
    itemParcial: op.itemParcial,
  });

  return await guardarResultado({
    carniceriaId,
    telefono,
    mensajeWhatsappId,
    operacionId: op.id,
    resultado,
    catalogo,
    texto,
  });
}
