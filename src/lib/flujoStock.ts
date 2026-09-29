import { getSupabaseAdmin } from "./supabaseAdmin";
import { cargarCatalogo, CatalogoCarniceria } from "./catalogo";
import { descargarAudio, type ReferenciaMedia } from "./whatsapp";
import { transcribirAudio } from "./whisper";
import { interpretarMensajeStock, ItemOperacion, ItemParcial, ResultadoInterpretacion } from "./interpretarStock";
import { clasificarRespuesta } from "./confirmacion";
import { finDeHoyArgentina } from "./tiempo";
import { revisarStockDeProducto } from "./notificaciones";
import { esCarniceroAutorizado } from "./quienEs";
import { responderSobreLote, cargarPollosEnteros, probarComoLote } from "./flujoLotes";
import { mencionaLote } from "./interpretarLote";
import { especieExplicita } from "./deteccionLote";
import { responderSobreTrozado } from "./flujoTrozado";
import { hablaDeTrozado } from "./lecturaTrozado";
import { moverStock, consumirUnidadesEnteras, estimadorPorUnidad } from "./lotes";
import { descriptor } from "./especies";
import { variarSiSeRepite } from "./conversacion";
import { historialReciente } from "./historial";

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
  itemsParciales?: ItemParcial[];
  vencida: boolean;
  /** Cuántos mensajes seguidos no se entendieron sobre esta operación. */
  fallos: number;
  /**
   * El PRIMER mensaje de esta operación. La transcripción se pisa en cada
   * turno; esto no. Sirve para entender una respuesta suelta ("48 y 52") en
   * relación a cómo arrancó la charla ("entraron dos cerdos").
   */
  textoInicial: string;
  /** La interpretación sin filtrar: el flujo de media res la mira para saber si esta operación es suya. */
  interpretacionCruda: unknown;
};

function emojiParaFamilia(familia: string): string {
  if (familia.startsWith("pollo")) return "🐔";
  if (familia === "embutidos") return "🌭";
  if (familia === "complementarios") return "🧂";
  if (familia === "achuras") return "🍖";
  if (familia.includes("cerdo")) return "🐖";
  return "🥩";
}

/**
 * ¿Este item cuenta pollos (cabezas) y no kilos?
 *
 * El pollo entero vive en piezas de un pollo cada una. "Trocé 3 pollos" son
 * tres piezas, no tres kilos.
 */
function esConteoDeUnidades(item: { producto_codigo: string; unidad: string }): boolean {
  if (item.producto_codigo !== descriptor("aviar").codigoProductoUnidad) return false;
  const u = item.unidad.toLowerCase();
  return u.startsWith("unidad") || u === "u" || u.startsWith("pollo") || u.startsWith("cabeza");
}

function lineaItem(item: ItemGuardado): string {
  const signo = item.accion === "ingreso" ? "+" : item.accion === "baja" ? "−" : "=";
  const unidad = esConteoDeUnidades(item) ? (item.cantidad === 1 ? " pollo" : " pollos") : item.unidad;
  return `${item.nombre_display} ${signo}${item.cantidad}${unidad}`;
}

// Las transformaciones se muestran como UNA línea con flecha ("Vacío −3kg →
// Picada especial +3kg") y no como dos sueltas. Es a propósito: el 21/09 la
// picada salió con "−" en vez de "+" y en una lista suelta no se notaba. Con la
// flecha, un signo al revés salta a la vista antes de confirmar.
function armarMensajeResumen(items: ItemGuardado[]): string {
  const lineas: string[] = [];
  const usados = new Set<number>();

  items.forEach((item, i) => {
    if (usados.has(i) || !item.transformacion) return;
    const grupo = items
      .map((otro, j) => ({ otro, j }))
      .filter(({ otro }) => otro.transformacion === item.transformacion);
    grupo.forEach(({ j }) => usados.add(j));
    const origen = grupo.filter(({ otro }) => otro.accion === "baja").map(({ otro }) => lineaItem(otro));
    const destino = grupo.filter(({ otro }) => otro.accion !== "baja").map(({ otro }) => lineaItem(otro));
    lineas.push(`🔄 ${origen.join(" + ") || "?"} → ${destino.join(" + ") || "?"}`);
  });

  items.forEach((item, i) => {
    if (usados.has(i)) return;
    lineas.push(`${emojiParaFamilia(item.familia)} ${lineaItem(item)}`);
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
    .select("id, estado, items, pregunta_pendiente, interpretacion, expires_at, transcripcion")
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
    | { tipo?: string; itemParcial?: ItemParcial; itemsParciales?: ItemParcial[]; fallos?: number; textoInicial?: string }
    | null
    | undefined;
  // `itemParcial` (uno solo) es el formato viejo: se sigue leyendo para no
  // perder una operación que haya quedado pendiente de antes del cambio.
  const itemsParciales =
    interpretacion && (interpretacion.tipo === "aclaracion" || interpretacion.tipo === "info_faltante")
      ? (interpretacion.itemsParciales ?? (interpretacion.itemParcial ? [interpretacion.itemParcial] : undefined))
      : undefined;

  return {
    id: data.id as string,
    estado: data.estado as OperacionPendiente["estado"],
    items: (data.items ?? []) as ItemGuardado[],
    pregunta_pendiente: (data.pregunta_pendiente as string | null) ?? null,
    itemsParciales,
    vencida: estaVencida,
    fallos: Number(interpretacion?.fallos ?? 0),
    textoInicial: interpretacion?.textoInicial ?? ((data as { transcripcion?: string }).transcripcion ?? ""),
    // Cruda, sin filtrar por tipo: el flujo de media res necesita mirarla para
    // reconocer si esta operación es suya.
    interpretacionCruda: data.interpretacion ?? null,
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
  /** La operación como estaba antes de este mensaje, si había una. */
  previa?: OperacionPendiente | null;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, operacionId, resultado, catalogo, texto, previa } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();
  const textoInicial = previa?.textoInicial || texto;

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
    // Antes esto pisaba la interpretación con {tipo: "no_entendido"}, y ahí se
    // borraban los items a medio armar: un solo mensaje confuso y se perdía
    // todo lo anterior. Ahora se conserva lo que había y se cuenta el fallo.
    // `procesarTextoEntrante` usa ese contador para no quedarse trabado.
    if (operacionId && previa) {
      const cruda = (previa.interpretacionCruda ?? {}) as Record<string, unknown>;
      await guardar({
        transcripcion: texto,
        interpretacion: { ...cruda, fallos: previa.fallos + 1 },
        updated_at: ahora,
      });
      const pendiente = previa.pregunta_pendiente
        ? `Lo que tengo pendiente es esto:\n${previa.pregunta_pendiente}`
        : previa.items.length > 0
          ? `Lo que tengo pendiente es esto:\n${armarMensajeResumen(previa.items)}`
          : "";
      return `Perdón, eso no lo pude relacionar 🙈 ${pendiente}\n\nSi es otra cosa, decime *cancelar* y arrancamos de nuevo.`.trim();
    }
    // Sin operación previa NO se crea una fila: antes se guardaba una operación
    // "pendiente_aclaracion" vacía por un mensaje que no se entendió, y esa fila
    // fantasma se tragaba el mensaje siguiente (Patrón 2 del manual).
    // Sin repetirle su propio mensaje entre comillas (suena a máquina) y con
    // ejemplos de las TRES cosas que puede avisar, no solo de stock suelto.
    return "Perdón, no te entendí 🙈 ¿Me lo decís de otra forma? Por ejemplo: *llegaron 2 medias reses de 100 y 104*, *entró un cajón de pollo de 8* o *piqué 3 kilos de vacío*.";
  }

  if (resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante") {
    // Red de seguridad: si el modelo "olvidó" items que ya estaban completos en
    // el turno anterior, se los vuelve a poner. Nunca confiar en que la IA se
    // acuerde de repetirlos (mismo arreglo que pedidos, 23/08).
    const itemsParciales = fusionarParciales(resultado.itemsParciales, previa?.itemsParciales);
    const pregunta = variarSiSeRepite(resultado.pregunta, previa?.pregunta_pendiente);
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: { ...resultado, pregunta, ...(itemsParciales ? { itemsParciales } : {}), fallos: 0, textoInicial },
      pregunta_pendiente: pregunta,
      updated_at: ahora,
    });
    return pregunta;
  }

  // tipo === "operacion"
  const itemsFinales = rescatarCompletos(resultado.items, previa?.itemsParciales);

  // ------------------------------------------------------------
  // Guarda de especie (22/09/2026)
  // ------------------------------------------------------------
  //
  // El carnicero habló de cerdo y la IA armó "Pollo entero +2 pollos" (y
  // después "Pollo entero +53 kg"). Un error así no se puede mandar a
  // confirmar: si el carnicero no lee con atención, carga pollo que no existe.
  // Regla sin IA: si en la charla se nombró UN animal y algún producto de la
  // operación es de OTRO animal, no se arma el resumen: se pregunta.
  const hablado = especieExplicita(`${textoInicial} ${texto} ${previa?.pregunta_pendiente ?? ""}`);
  if (hablado) {
    const choca = itemsFinales
      .map((i) => catalogo.porCodigo.get(i.producto_codigo))
      .find((p) => p?.especie && p.especie !== hablado);
    if (choca) {
      const animal = hablado === "porcino" ? "cerdo" : hablado === "aviar" ? "pollo" : "vaca";
      const pregunta = `Me estás hablando de ${animal} y entendí "${choca.nombre_display}", que es otra cosa. ¿Qué corte de ${animal} es, o es una media res entera?`;
      await guardar({
        estado: "pendiente_aclaracion",
        transcripcion: texto,
        interpretacion: { tipo: "aclaracion", pregunta, fallos: 0, textoInicial },
        pregunta_pendiente: pregunta,
        updated_at: ahora,
      });
      return pregunta;
    }
  }

  // Red de seguridad (29/09): si la IA armó un "producto" que no existe y que
  // en realidad es mercadería entera ("media_res", "cajon_de_pollo",
  // "cerdo"), esto era un LOTE que se escapó del detector. Bug del 28/09: "me
  // llegaron 3 media rre" + "100 102 y 89" terminó en "no reconocí el
  // producto media_res". Se abandona la operación y se carga como lote, con
  // todo lo que dijo junto.
  const pareceLote = itemsFinales.some(
    (i) => !catalogo.porCodigo.has(i.producto_codigo) && /media|res\b|reses|cajon|cerdo|chancho|capon/.test(i.producto_codigo)
  );
  if (pareceLote) {
    const combinado = textoInicial !== texto ? `${textoInicial} ${texto}` : texto;
    if (operacionId) {
      await supabaseAdmin
        .from("operaciones_stock")
        .update({ estado: "cancelado", updated_at: ahora, pregunta_pendiente: null })
        .eq("id", operacionId);
    }
    const comoLote = await probarComoLote({ carniceriaId, telefono, mensajeWhatsappId, texto: combinado });
    if (comoLote !== null) return comoLote;
  }

  const itemsResueltos: ItemGuardado[] = [];
  const estimar = estimadorPorUnidad(carniceriaId);
  for (const item of itemsFinales) {
    const producto = catalogo.porCodigo.get(item.producto_codigo);
    if (!producto) {
      await guardar({ transcripcion: texto, interpretacion: resultado, updated_at: ahora });
      return `Entendí algo, pero no reconocí uno de los productos ("${item.producto_codigo.replace(/_/g, " ")}"). ¿Me lo decís con otro nombre?`;
    }

    // "Entraron 10 pechugas": el producto va por kilo y lo contó en unidades.
    // Antes se tomaban como 10 kg. Ahora se pasan a kilos con el peso por
    // unidad (el mismo estimador que usa el cliente); si no hay, se pregunta.
    const u = item.unidad.toLowerCase();
    const contoUnidades = u.startsWith("unidad") || u === "u" || u.startsWith("pieza");
    if (producto.unidad === "kg" && contoUnidades && !esConteoDeUnidades(item)) {
      const peso = await estimar(producto);
      if (!peso) {
        const pregunta = `¿Cuántos kilos son las ${item.cantidad} de ${producto.nombre_display}? Todavía no tengo cargado cuánto pesa cada una.`;
        await guardar({
          estado: "pendiente_aclaracion",
          transcripcion: texto,
          interpretacion: { tipo: "info_faltante", pregunta, itemsParciales: itemsFinales.map((i) => (i === item ? { producto_codigo: i.producto_codigo, accion: i.accion } : i)), fallos: 0, textoInicial },
          pregunta_pendiente: pregunta,
          updated_at: ahora,
        });
        return pregunta;
      }
      item.cantidad = Number((item.cantidad * peso.kg).toFixed(3));
      item.unidad = "kg";
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
      // Excepción única: el pollo entero contado en cabezas ("trocé 3 pollos").
      // Ahí la unidad del catálogo (kg) sería la equivocada: 3 pollos no son
      // 3 kilos. Se ejecuta cerrando piezas enteras (ver confirmarYEjecutar).
      unidad: esConteoDeUnidades(item) ? "unidad" : producto.unidad,
      producto_id: producto.id,
      nombre_display: producto.nombre_display,
      familia: producto.familia,
    });
  }

  await guardar({
    estado: "pendiente_confirmacion",
    transcripcion: texto,
    interpretacion: { ...resultado, textoInicial },
    pregunta_pendiente: null,
    items: itemsResueltos,
    expires_at: finDeHoyArgentina().toISOString(),
    updated_at: ahora,
  });

  return armarMensajeResumen(itemsResueltos);
}

function claveParcial(i: ItemParcial): string {
  return `${i.producto_codigo ?? "?"}|${i.accion ?? "?"}|${i.transformacion ?? ""}`;
}

function estaCompleto(i: ItemParcial): i is ItemParcial & { producto_codigo: string; accion: "ingreso" | "baja" | "ajuste"; cantidad: number } {
  return Boolean(i.producto_codigo && i.accion && i.cantidad && i.cantidad > 0);
}

/** Suma a la lista nueva los items COMPLETOS de antes que el modelo no repitió. */
function fusionarParciales(nuevos: ItemParcial[] | undefined, previos: ItemParcial[] | undefined): ItemParcial[] | undefined {
  const lista = [...(nuevos ?? [])];
  const claves = new Set(lista.map(claveParcial));
  const codigos = new Set(lista.map((i) => i.producto_codigo).filter(Boolean));
  for (const previo of previos ?? []) {
    if (!estaCompleto(previo)) continue;
    if (claves.has(claveParcial(previo)) || codigos.has(previo.producto_codigo)) continue;
    lista.push(previo);
  }
  return lista.length > 0 ? lista : undefined;
}

/** Al cerrar la operación: que ningún item completo de la construcción quede afuera. */
function rescatarCompletos(items: ItemOperacion[], previos: ItemParcial[] | undefined): ItemOperacion[] {
  const codigos = new Set(items.map((i) => i.producto_codigo));
  const rescatados: ItemOperacion[] = [];
  for (const previo of previos ?? []) {
    if (!estaCompleto(previo) || codigos.has(previo.producto_codigo)) continue;
    rescatados.push({
      producto_codigo: previo.producto_codigo,
      accion: previo.accion,
      cantidad: previo.cantidad,
      unidad: previo.unidad ?? "kg",
      confidence: 1,
      ...(previo.transformacion ? { transformacion: previo.transformacion } : {}),
    });
  }
  return [...items, ...rescatados];
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
    .select("items, carniceria_id")
    .maybeSingle();

  if (error) {
    console.error("Error confirmando operación de stock", error);
    return "Tuve un problema técnico confirmando. Probá de nuevo en un rato.";
  }

  if (!data) {
    return "Esa operación ya fue procesada (o ya no está disponible). Si querés cargar algo, mandá un audio nuevo.";
  }

  const items = (data.items ?? []) as ItemGuardado[];
  const carniceriaId = data.carniceria_id as string;
  const resumen: string[] = [];

  // Nota: cada item se aplica con una lectura + escritura separada (no en
  // una única transacción atómica de Postgres) — aceptable para el volumen
  // de un piloto de una sola carnicería dictando por voz de a un mensaje
  // por vez; si en el futuro hay updates realmente concurrentes sobre el
  // mismo producto, esto podría perder una escritura y habría que pasar a
  // un UPDATE con expresión relativa (ej. una función de Postgres).
  // Todo pasa por el motor de piezas (`moverStock`). Antes esto escribía
  // `stock_actual` directo y el motor lo pisaba en el próximo recálculo: por
  // eso "piqué 3 kg de vacío" no bajaba el vacío. Ver el comentario largo de
  // `moverStock` en lotes.ts.
  for (const item of items) {
    const destino = item.transformacion
      ? items.find((otro) => otro.transformacion === item.transformacion && otro.accion !== "baja")
      : undefined;
    const causa = destino && item.accion === "baja"
      ? `Transformado en ${destino.nombre_display} (carga por voz)`
      : item.transformacion
        ? "Sale de una transformación (carga por voz)"
        : "Carga por voz del carnicero";

    try {
      if (item.accion === "ingreso" && esConteoDeUnidades(item)) {
        const hecho = await cargarPollosEnteros({ carniceriaId, unidades: item.cantidad });
        resumen.push(hecho.mensaje);
        continue;
      }

      if (item.accion === "baja" && esConteoDeUnidades(item)) {
        const hecho = await consumirUnidadesEnteras({
          carniceriaId,
          productoId: item.producto_id,
          unidades: item.cantidad,
          causa,
        });
        resumen.push(
          hecho.unidades < item.cantidad
            ? `${item.nombre_display}: tenías ${hecho.unidades}, bajé esos (${hecho.kg} kg).`
            : `${item.nombre_display}: bajé ${hecho.unidades} (${hecho.kg} kg).`
        );
        await revisarStockDeProducto({ carniceriaId, productoId: item.producto_id });
        continue;
      }

      const nuevoStock = await moverStock({
        carniceriaId,
        productoId: item.producto_id,
        accion: item.accion,
        cantidad: item.cantidad,
        causa,
        tipoBaja: destino && /picad/i.test(destino.nombre_display) ? "recorte_picada" : "ajuste",
        origen: "audio",
      });

      // Si la carga dejó el producto en cero o por debajo del umbral, se genera
      // el aviso; si volvió a estar bien, se cierran los avisos viejos.
      await revisarStockDeProducto({ carniceriaId, productoId: item.producto_id });
      resumen.push(`${item.nombre_display} = ${nuevoStock}${item.unidad}`);
    } catch (err) {
      console.error("Error aplicando un item de stock", item, err);
      resumen.push(`${item.nombre_display}: no se pudo actualizar.`);
    }
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

// ============================================================
// La puerta: acá NO entra un cliente
// ============================================================
//
// El enrutador (`whatsapp/entrante.ts`) ya decide quién es quién, así que en
// teoría esta comprobación sobra. Está igual, y a propósito: el 10/09/2026 un
// mensaje de cliente entró a este archivo porque OTRO camino —el simulador—
// decidía el rol por su cuenta y lo decidió mal. El resultado fue un cliente
// cargándole stock a la carnicería.
//
// La lección: un módulo que puede modificar `productos.stock_actual` no confía
// en que quien lo llamó haya hecho bien la pregunta. La hace él.
async function bloqueadoPorNoSerCarnicero(
  carniceriaId: string,
  telefono: string
): Promise<boolean> {
  if (await esCarniceroAutorizado(carniceriaId, telefono)) return false;

  console.error(
    "BLOQUEADO: alguien intentó entrar al flujo de stock con un número que no es del carnicero",
    { carniceriaId, telefono }
  );
  return true;
}

export async function procesarAudioDeStock(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  // Referencia al archivo, no una URL: Twilio manda una URL descargable y Meta
  // manda un ID con el que hay que pedir la URL primero. Ver src/lib/whatsapp.
  media: ReferenciaMedia;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, media } = params;

  if (await bloqueadoPorNoSerCarnicero(carniceriaId, telefono)) return null;

  let transcripcion: string;
  try {
    const audio = await descargarAudio(media);
    transcripcion = await transcribirAudio(audio);
  } catch (err) {
    console.error("Error descargando/transcribiendo audio", err);
    return "No pude escuchar bien ese audio. ¿Podés grabarlo de nuevo?";
  }

  if (!transcripcion) {
    return "El audio me llegó vacío o no se entendió nada. ¿Podés repetirlo?";
  }

  return await procesarTextoDeStock({ carniceriaId, telefono, mensajeWhatsappId, texto: transcripcion });
}

/**
 * Solo la transcripción del audio del carnicero, sin interpretarlo.
 *
 * Bug encontrado el 29/09/2026: el AUDIO del carnicero iba directo a la carga
 * de stock genérica (`procesarAudioDeStock`), salteándose todo lo demás: una
 * operación pendiente ("sí" dicho en audio), los lotes ("llegó una media res")
 * y el trozado. El texto escrito sí pasaba por esos caminos. Ahora el audio se
 * transcribe acá y el texto sigue EXACTAMENTE el mismo camino que si lo
 * hubiera escrito (ver `atenderCarniceroConCola` en whatsapp/entrante.ts).
 *
 * Devuelve null si el número no es de un carnicero autorizado.
 */
export async function transcribirAudioDeCarnicero(params: {
  carniceriaId: string;
  telefono: string;
  media: ReferenciaMedia;
}): Promise<{ ok: true; texto: string } | { ok: false; mensaje: string } | null> {
  if (await bloqueadoPorNoSerCarnicero(params.carniceriaId, params.telefono)) return null;
  try {
    const audio = await descargarAudio(params.media);
    const texto = (await transcribirAudio(audio)).trim();
    if (!texto) return { ok: false, mensaje: "El audio me llegó vacío o no se entendió nada. ¿Podés repetirlo?" };
    return { ok: true, texto };
  } catch (err) {
    console.error("Error descargando/transcribiendo audio", err);
    return { ok: false, mensaje: "No pude escuchar bien ese audio. ¿Podés grabarlo de nuevo?" };
  }
}

/**
 * Abre (o amplía) una carga de stock a partir de TEXTO ya legible.
 *
 * Es el cuerpo de `procesarAudioDeStock` de la transcripción en adelante. Se
 * separó para que el simulador del panel pueda ejercitar exactamente el mismo
 * camino sin un archivo de audio: en WhatsApp el carnicero manda un audio y
 * Whisper lo convierte en esta misma cadena de texto. De la transcripción para
 * acá no hay dos versiones del motor, hay una sola.
 *
 * Ojo con la diferencia que sí existe: en WhatsApp una carga de stock EMPIEZA
 * con un audio, y el texto suelto solo sirve para contestar sobre una operación
 * ya abierta (ver `procesarTextoEntrante`). Quien llame a esta función está
 * salteando esa regla a propósito.
 */
export async function procesarTextoDeStock(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto } = params;

  if (await bloqueadoPorNoSerCarnicero(carniceriaId, telefono)) return null;

  let catalogo: CatalogoCarniceria;
  try {
    catalogo = await cargarCatalogo(carniceriaId);
  } catch (err) {
    console.error("Error cargando el catálogo", err);
    return "Tuve un problema técnico cargando el catálogo. Probá de nuevo en un rato.";
  }

  // Si ya hay una operación en curso para este número, un mensaje nuevo se
  // trata como información adicional de ESA misma operación (no se abre
  // una segunda operación en paralelo ni se pisa silenciosamente).
  const opExistente = await obtenerOperacionPendienteActiva(carniceriaId, telefono);
  const opActiva = opExistente && !opExistente.vencida ? opExistente : null;

  const historial = await historialReciente({ carniceriaId, telefono, quien: "Carnicero" });
  const resultado = await interpretarMensajeStock(
    texto,
    catalogo.promptCatalogo,
    opActiva
      ? {
          itemsActuales: opActiva.items,
          preguntaPendiente: opActiva.pregunta_pendiente ?? undefined,
          itemsParciales: opActiva.itemsParciales,
        }
      : undefined,
    historial
  );

  return await guardarResultado({
    carniceriaId,
    telefono,
    mensajeWhatsappId,
    operacionId: opActiva?.id,
    resultado,
    catalogo,
    texto,
    previa: opActiva,
  });
}

export async function procesarTextoEntrante(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto } = params;

  if (await bloqueadoPorNoSerCarnicero(carniceriaId, telefono)) return null;

  const op = await obtenerOperacionPendienteActiva(carniceriaId, telefono);
  if (!op) return null; // nada pendiente de stock — Etapa 3 se ocupa de mensajes sueltos

  // Una media res pendiente vive en ESTA misma tabla, a propósito: para el
  // carnicero hay una sola cosa pendiente a la vez, así que su "sí" nunca es
  // ambiguo. Si la operación resulta ser una media res, la maneja su flujo.
  // Un trozado de pollo pendiente también vive acá (ver flujoTrozado.ts).
  const respuestaTrozado = await responderSobreTrozado({
    carniceriaId,
    telefono,
    operacion: { id: op.id, interpretacion: op.interpretacionCruda, pregunta_pendiente: op.pregunta_pendiente },
    texto,
  });
  if (respuestaTrozado !== null) return respuestaTrozado;

  const respuestaLote = await responderSobreLote({
    carniceriaId,
    operacion: { id: op.id, estado: op.estado, interpretacion: op.interpretacionCruda },
    texto,
    telefono,
  });
  if (respuestaLote !== null) return respuestaLote;

  // ------------------------------------------------------------
  // Un aviso de media res ABANDONA la operación de stock pendiente
  // ------------------------------------------------------------
  //
  // La regla general —"si hay algo pendiente, el mensaje es sobre ESO"— es
  // correcta y hay que respetarla: es lo que hace que "no, eran 12 kilos" se
  // lea como corrección y no como mensaje nuevo.
  //
  // Pero tiene un agujero que ya nos mordió dos veces: si la operación pendiente
  // quedó vieja o mal, se traga TODO lo que venga después. El carnicero escribe
  // "llegó una media res de 102 kg" y el modelo, al que se le dijo que eso es la
  // respuesta a una pregunta sobre cortes, contesta "¿de cuál corte es la media
  // res?". El modelo hizo bien su trabajo; el contexto estaba mal.
  //
  // "Llegó una media res de 102 kg" no es la respuesta a nada: es un hecho nuevo.
  // Así que cuando el texto nombra una media res con todas las letras, la
  // operación vieja se cancela y el mensaje sigue su camino.
  //
  // La detección es un regex, no el modelo: cuesta cero y no puede dudar.
  // Y vale para las tres especies: una media res de cerdo o un cajón de pollo
  // tampoco son la respuesta a una pregunta sobre cortes.
  // ------------------------------------------------------------
  // La charla era de un lote y recién ahora se nota (22/09/2026)
  // ------------------------------------------------------------
  //
  // "Entraron dos cerdos" (sin decir media res) caía acá, la IA preguntaba
  // "¿cuántos kilos pesan?", el carnicero contestaba "48 y 52"... y ninguno de
  // los dos mensajes, SOLO, dice "lote". Juntos sí. Si la operación todavía no
  // tiene nada armado y el primer mensaje más este forman un aviso de lote, se
  // abandona la operación y se carga como lote, con el texto combinado.
  const combinado = `${op.textoInicial} ${texto}`.trim();
  if (
    !mencionaLote(texto) &&
    op.textoInicial &&
    mencionaLote(combinado) &&
    op.items.length === 0 &&
    !(op.itemsParciales ?? []).some((i) => i.producto_codigo && i.cantidad)
  ) {
    await getSupabaseAdmin()
      .from("operaciones_stock")
      .update({ estado: "cancelado", updated_at: new Date().toISOString(), pregunta_pendiente: null })
      .eq("id", op.id);
    const comoLote = await probarComoLote({ carniceriaId, telefono, mensajeWhatsappId, texto: combinado });
    if (comoLote !== null) return comoLote;
  }

  if (mencionaLote(texto) || hablaDeTrozado(texto)) {
    await getSupabaseAdmin()
      .from("operaciones_stock")
      .update({
        estado: "cancelado",
        updated_at: new Date().toISOString(),
        pregunta_pendiente: null,
      })
      .eq("id", op.id);

    return null; // sigue al flujo de media res
  }

  // ------------------------------------------------------------
  // No quedarse trabado (21/09/2026)
  // ------------------------------------------------------------
  //
  // Si el mensaje anterior ya no se entendió y este tampoco es un sí/no claro,
  // lo más probable es que el carnicero haya cambiado de tema y la operación
  // vieja se esté tragando todo (Patrón 2 del manual). Se la abandona y el
  // mensaje sigue su camino como algo nuevo, en vez de contestar por tercera
  // vez "no te entendí".
  if (op.fallos >= 1 && clasificarRespuesta(texto) === null) {
    await getSupabaseAdmin()
      .from("operaciones_stock")
      .update({ estado: "cancelado", updated_at: new Date().toISOString(), pregunta_pendiente: null })
      .eq("id", op.id);
    return null;
  }

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

  const historial = await historialReciente({ carniceriaId, telefono, quien: "Carnicero" });
  const resultado = await interpretarMensajeStock(
    texto,
    catalogo.promptCatalogo,
    {
      itemsActuales: op.items,
      preguntaPendiente: op.pregunta_pendiente ?? undefined,
      itemsParciales: op.itemsParciales,
    },
    historial
  );

  return await guardarResultado({
    carniceriaId,
    telefono,
    mensajeWhatsappId,
    operacionId: op.id,
    resultado,
    catalogo,
    texto,
    previa: op,
  });
}
