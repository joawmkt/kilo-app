import { getSupabaseAdmin } from "./supabaseAdmin";
import { cargarCatalogo, CatalogoCarniceria, Producto } from "./catalogo";
import { descargarAudioTwilio } from "./twilioMedia";
import { transcribirAudio } from "./whisper";
import {
  interpretarMensajePedido,
  ItemPedido,
  ItemParcialPedido,
  ResultadoInterpretacionPedido,
} from "./interpretarPedido";
import { clasificarRespuesta } from "./confirmacion";
import { clasificarDecisionCarnicero } from "./confirmacionPedido";
import { buscarAlternativa } from "./alternativas";
import { obtenerOCrearCliente } from "./clientes";
import { obtenerNumerosCarnicero } from "./numerosCarnicero";
import { enviarWhatsapp } from "./twilioEnviar";
import { ahoraArgentinaIso, finDeHoyArgentina, formatearHoraArgentina } from "./tiempo";
import { normalizarTexto } from "./texto";

// Etapa 3 — flujo de pedidos asistido. Mismo espíritu que flujoStock.ts
// (Etapa 2): guarda todo en `pedidos`, nunca toca `productos.stock_actual`
// hasta que el carnicero aprueba.
//
// ============================================================
// TEXTOS AL CLIENTE Y AL CARNICERO — TODOS PROVISORIOS.
// Bloque A de claude/etapa3_roadmap_detallado.md (tono/redacción definitiva)
// todavía no está cerrado con la otra IA. Los mensajes de acá son
// funcionales pero NO el texto final — reemplazar cuando esté listo, sin
// tocar la lógica de estados.
// ============================================================

type ItemGuardadoPedido = {
  producto_id: string;
  producto_codigo: string;
  nombre_display: string;
  cantidad: number; // en la unidad REAL del producto (producto.unidad)
  unidad: string;
  disponible: boolean;
  sustituye_a_producto_id?: string;
};

type Sustitucion = {
  producto_faltante_id: string;
  producto_faltante_nombre: string;
  alternativa_id: string;
  alternativa_codigo: string;
  alternativa_nombre: string;
  cantidad: number;
  unidad: string;
};

type FaseInterna =
  | { fase: "esperando_dato_item" }
  | { fase: "esperando_hora_retiro" }
  | { fase: "esperando_confirmacion_sustitucion"; sustituciones: Sustitucion[] };

type PedidoPendiente = {
  id: string;
  estado: "pendiente_aclaracion" | "pendiente_aprobacion";
  items: ItemGuardadoPedido[];
  pregunta_pendiente: string | null;
  item_parcial?: ItemParcialPedido;
  hora_retiro: string | null;
  fase: FaseInterna | null;
  vencido: boolean;
};

async function obtenerPedidoPendienteCliente(
  carniceriaId: string,
  telefono: string
): Promise<PedidoPendiente | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, estado, items, pregunta_pendiente, item_parcial, hora_retiro, interpretacion, expires_at")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .in("estado", ["pendiente_aclaracion", "pendiente_aprobacion"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando pedido pendiente", error);
    return null;
  }
  if (!data) return null;

  const estaVencido =
    data.estado === "pendiente_aclaracion" &&
    Boolean(data.expires_at) &&
    new Date(data.expires_at as string) < new Date();

  if (estaVencido) {
    await supabaseAdmin
      .from("pedidos")
      .update({ estado: "vencido" })
      .eq("id", data.id);
  }

  const interpretacion = data.interpretacion as FaseInterna | null;

  return {
    id: data.id as string,
    estado: data.estado as PedidoPendiente["estado"],
    items: (data.items ?? []) as ItemGuardadoPedido[],
    pregunta_pendiente: (data.pregunta_pendiente as string | null) ?? null,
    item_parcial: (data.item_parcial as ItemParcialPedido | undefined) ?? undefined,
    hora_retiro: (data.hora_retiro as string | null) ?? null,
    fase: interpretacion ?? null,
    vencido: estaVencido,
  };
}

function convertirACantidadReal(producto: Producto, cantidad: number, unidadCliente: string): number | null {
  const u = normalizarTexto(unidadCliente);
  const esPorPieza =
    u.includes("unidad") || ["u", "pieza", "piezas", "milanesa", "milanesas"].includes(u);

  if (producto.unidad === "kg" && esPorPieza) {
    if (producto.peso_aproximado_unidad_kg == null) return null;
    return Number((cantidad * producto.peso_aproximado_unidad_kg).toFixed(3));
  }
  return cantidad;
}

function mensajeBienvenida(nombre: string | null): string {
  const saludo = nombre ? `¡Hola ${nombre}!` : "¡Hola!";
  return `${saludo} 👋 Bienvenido/a, acá podés hacer tu pedido para retirar después por el local. Contame qué necesitás (por texto o audio).`;
}

function mensajeResumenPedidoParaCarnicero(params: {
  clienteNombre: string | null;
  clienteTelefono: string;
  items: ItemGuardadoPedido[];
  horaRetiro: Date;
}): string {
  const { clienteNombre, clienteTelefono, items, horaRetiro } = params;
  const quien = clienteNombre ? `${clienteNombre} (${clienteTelefono})` : clienteTelefono;
  const lineas = items.map((item) => `- ${item.nombre_display}: ${item.cantidad}${item.unidad}`);
  return [
    `🧾 Pedido nuevo de ${quien}`,
    ...lineas,
    `Retira: ${formatearHoraArgentina(horaRetiro)}hs`,
    "",
    "¿Lo aprobás? Respondé *aprobar* o *rechazar*.",
  ].join("\n");
}

async function armarYGuardarPedido(params: {
  carniceriaId: string;
  telefono: string;
  clienteId: string;
  clienteNombre: string | null;
  mensajeWhatsappId?: string;
  pedidoId?: string;
  catalogo: CatalogoCarniceria;
  itemsPedidos: ItemPedido[];
  horaRetiroIso?: string;
  texto: string;
}): Promise<string> {
  const {
    carniceriaId,
    telefono,
    clienteId,
    clienteNombre,
    mensajeWhatsappId,
    pedidoId,
    catalogo,
    itemsPedidos,
    horaRetiroIso,
    texto,
  } = params;

  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  async function guardar(cambios: Record<string, unknown>): Promise<string> {
    if (pedidoId) {
      await supabaseAdmin.from("pedidos").update(cambios).eq("id", pedidoId);
      return pedidoId;
    }
    const { data, error } = await supabaseAdmin
      .from("pedidos")
      .insert({
        carniceria_id: carniceriaId,
        cliente_id: clienteId,
        telefono,
        mensaje_whatsapp_id: mensajeWhatsappId,
        estado: "pendiente_aclaracion",
        items: [],
        ...cambios,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Error creando pedido", error);
      throw new Error("No se pudo guardar el pedido");
    }
    return data.id as string;
  }

  // Resolvemos cada item contra el catálogo real y el stock actual.
  //
  // LIMITACIÓN CONOCIDA (aceptable para el volumen de un piloto de una
  // sola carnicería, documentada igual que las de flujoStock.ts): acá solo
  // se CONSULTA el stock, no se reserva. El descuento real recién pasa en
  // procesarDecisionCarnicero al aprobar. Si dos pedidos piden lo último
  // que queda de un producto casi al mismo tiempo, ambos pueden pasar esta
  // verificación y el carnicero podría llegar a aprobar los dos — el
  // filtro humano de la aprobación cubre la mayoría de los casos reales
  // (el carnicero ve el pedido antes de confirmar), pero no es una traba
  // atómica. Pasar a reservar stock al armar el pedido (en vez de al
  // aprobar) sería la forma de cerrar esto del todo si en la práctica
  // llega a pasar.
  const itemsResueltos: ItemGuardadoPedido[] = [];
  const sustituciones: Sustitucion[] = [];
  const descartadosSinAlternativa: string[] = [];
  const idsYaUsados = new Set<string>();

  for (const item of itemsPedidos) {
    const producto = catalogo.porCodigo.get(item.producto_codigo);
    if (!producto) {
      await guardar({ transcripcion: texto, updated_at: ahora });
      return `Perdón, no reconocí uno de los productos que pediste ("${item.producto_codigo}"). ¿Podés decirlo de otra forma?`;
    }

    const cantidadReal = convertirACantidadReal(producto, item.cantidad, item.unidad);
    if (cantidadReal === null) {
      await guardar({ transcripcion: texto, updated_at: ahora });
      return `¿Podés decirme "${producto.nombre_display}" en kilos en vez de unidades? Todavía no tengo el equivalente para ese producto.`;
    }

    idsYaUsados.add(producto.id);

    if (producto.stock_actual >= cantidadReal) {
      itemsResueltos.push({
        producto_id: producto.id,
        producto_codigo: producto.codigo,
        nombre_display: producto.nombre_display,
        cantidad: cantidadReal,
        unidad: producto.unidad,
        disponible: true,
      });
      continue;
    }

    const alternativa = buscarAlternativa(catalogo, producto, cantidadReal, idsYaUsados);
    if (alternativa) {
      idsYaUsados.add(alternativa.id);
      sustituciones.push({
        producto_faltante_id: producto.id,
        producto_faltante_nombre: producto.nombre_display,
        alternativa_id: alternativa.id,
        alternativa_codigo: alternativa.codigo,
        alternativa_nombre: alternativa.nombre_display,
        cantidad: cantidadReal,
        unidad: producto.unidad,
      });
    } else {
      descartadosSinAlternativa.push(producto.nombre_display);
    }
  }

  // Si hay sustituciones por confirmar, se lo preguntamos al cliente antes
  // de seguir — no se ofrece automáticamente sin que él la acepte.
  if (sustituciones.length > 0) {
    const lineasSustitucion = sustituciones
      .map((s) => `- No tengo "${s.producto_faltante_nombre}", pero sí "${s.alternativa_nombre}" (${s.cantidad}${s.unidad}). ¿Te sirve?`)
      .join("\n");
    const lineasDescartados =
      descartadosSinAlternativa.length > 0
        ? `\nPor ahora no tengo disponible: ${descartadosSinAlternativa.join(", ")} (ni un sustituto parecido) — lo saqué del pedido.`
        : "";
    const pregunta = `${lineasSustitucion}${lineasDescartados}\n\nRespondé *sí* para aceptar los cambios, o *no* para sacarlos del pedido.`;

    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      items: itemsResueltos, // los ya confirmados; las sustituciones se aplican al confirmar
      pregunta_pendiente: pregunta,
      item_parcial: null,
      interpretacion: { fase: "esperando_confirmacion_sustitucion", sustituciones },
      updated_at: ahora,
    });
    return pregunta;
  }

  if (itemsResueltos.length === 0) {
    await guardar({
      estado: "cancelado",
      transcripcion: texto,
      items: [],
      updated_at: ahora,
    });
    return `Lo siento, no tengo stock de nada de lo que pediste en este momento (${descartadosSinAlternativa.join(", ")}). Probá más tarde o pedí otra cosa.`;
  }

  const avisoDescartados =
    descartadosSinAlternativa.length > 0
      ? `Por ahora no tengo disponible: ${descartadosSinAlternativa.join(", ")} — lo saqué del pedido.\n\n`
      : "";

  // Items resueltos y sin nada pendiente de confirmar — falta la hora de
  // retiro, o ya la tenemos.
  if (!horaRetiroIso) {
    const pregunta = `${avisoDescartados}¿A qué hora pasás a retirarlo?`;
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      items: itemsResueltos,
      pregunta_pendiente: pregunta,
      item_parcial: null,
      interpretacion: { fase: "esperando_hora_retiro" },
      updated_at: ahora,
    });
    return pregunta;
  }

  return await pasarAPendienteAprobacion({
    guardar,
    carniceriaId,
    telefono,
    clienteNombre,
    items: itemsResueltos,
    horaRetiroIso,
    avisoDescartados,
  });
}

async function pasarAPendienteAprobacion(params: {
  guardar: (cambios: Record<string, unknown>) => Promise<string>;
  carniceriaId: string;
  telefono: string;
  clienteNombre: string | null;
  items: ItemGuardadoPedido[];
  horaRetiroIso: string;
  avisoDescartados: string;
}): Promise<string> {
  const { guardar, carniceriaId, telefono, clienteNombre, items, horaRetiroIso, avisoDescartados } = params;
  const ahora = new Date().toISOString();

  await guardar({
    estado: "pendiente_aprobacion",
    items,
    hora_retiro: horaRetiroIso,
    pregunta_pendiente: null,
    item_parcial: null,
    interpretacion: null,
    expires_at: null,
    updated_at: ahora,
  });

  await avisarCarnicero({
    carniceriaId,
    clienteTelefono: telefono,
    clienteNombre,
    items,
    horaRetiro: new Date(horaRetiroIso),
  });

  return `${avisoDescartados}¡Listo! Tu pedido quedó a confirmar por la carnicería, te aviso apenas lo revisen 🙌`;
}

async function avisarCarnicero(params: {
  carniceriaId: string;
  clienteTelefono: string;
  clienteNombre: string | null;
  items: ItemGuardadoPedido[];
  horaRetiro: Date;
}): Promise<void> {
  const { carniceriaId, clienteTelefono, clienteNombre, items, horaRetiro } = params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: carniceria } = await supabaseAdmin
    .from("carnicerias")
    .select("telefono_whatsapp")
    .eq("id", carniceriaId)
    .single();

  if (!carniceria?.telefono_whatsapp) {
    console.error("No se pudo avisar al carnicero: carnicería sin telefono_whatsapp", carniceriaId);
    return;
  }

  const numeros = await obtenerNumerosCarnicero(carniceriaId);
  if (numeros.length === 0) {
    console.error("No hay numeros_carnicero activos para avisar del pedido", carniceriaId);
    return;
  }

  const mensaje = mensajeResumenPedidoParaCarnicero({ clienteNombre, clienteTelefono, items, horaRetiro });

  for (const numero of numeros) {
    try {
      await enviarWhatsapp({
        carniceriaId,
        desde: carniceria.telefono_whatsapp as string,
        hacia: numero,
        cuerpo: mensaje,
      });
    } catch (err) {
      console.error("Error avisando al carnicero de un pedido nuevo", { numero, err });
    }
  }
}

async function procesarResultado(params: {
  carniceriaId: string;
  telefono: string;
  clienteId: string;
  clienteNombre: string | null;
  mensajeWhatsappId?: string;
  pedidoId?: string;
  catalogo: CatalogoCarniceria;
  resultado: ResultadoInterpretacionPedido;
  texto: string;
}): Promise<string> {
  const { carniceriaId, telefono, clienteId, clienteNombre, mensajeWhatsappId, pedidoId, catalogo, resultado, texto } =
    params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  async function guardar(cambios: Record<string, unknown>): Promise<string> {
    if (pedidoId) {
      await supabaseAdmin.from("pedidos").update(cambios).eq("id", pedidoId);
      return pedidoId;
    }
    const { data, error } = await supabaseAdmin
      .from("pedidos")
      .insert({
        carniceria_id: carniceriaId,
        cliente_id: clienteId,
        telefono,
        mensaje_whatsapp_id: mensajeWhatsappId,
        estado: "pendiente_aclaracion",
        items: [],
        ...cambios,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Error creando pedido", error);
      throw new Error("No se pudo guardar el pedido");
    }
    return data.id as string;
  }

  if (resultado.tipo === "saludo") {
    if (!pedidoId) return mensajeBienvenida(clienteNombre);
    return "Te escucho, contame qué necesitás.";
  }

  if (resultado.tipo === "no_entendido") {
    if (pedidoId) {
      return "No te entendí. ¿Podés contarme de nuevo qué necesitás, o responder la pregunta de arriba?";
    }
    return `No relacioné "${texto}" con un pedido. Contame qué necesitás llevarte 🙂`;
  }

  if (resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante") {
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      pregunta_pendiente: resultado.pregunta,
      item_parcial: resultado.itemParcial ?? null,
      interpretacion: { fase: "esperando_dato_item" },
      expires_at: finDeHoyArgentina().toISOString(),
      updated_at: ahora,
    });
    return resultado.pregunta;
  }

  // tipo === "pedido"
  return await armarYGuardarPedido({
    carniceriaId,
    telefono,
    clienteId,
    clienteNombre,
    mensajeWhatsappId,
    pedidoId,
    catalogo,
    itemsPedidos: resultado.items,
    horaRetiroIso: resultado.horaRetiroIso,
    texto,
  });
}

async function manejarRespuestaSustitucion(params: {
  pedido: PedidoPendiente;
  carniceriaId: string;
  telefono: string;
  clienteNombre: string | null;
  texto: string;
}): Promise<string> {
  const { pedido, carniceriaId, telefono, clienteNombre, texto } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const fase = pedido.fase as Extract<FaseInterna, { fase: "esperando_confirmacion_sustitucion" }>;
  const decision = clasificarRespuesta(texto);

  if (decision === null) {
    return `No te entendí. ${pedido.pregunta_pendiente}`;
  }

  const items = [...pedido.items];

  if (decision === "confirmar") {
    for (const s of fase.sustituciones) {
      items.push({
        producto_id: s.alternativa_id,
        producto_codigo: s.alternativa_codigo,
        nombre_display: s.alternativa_nombre,
        cantidad: s.cantidad,
        unidad: s.unidad,
        disponible: true,
        sustituye_a_producto_id: s.producto_faltante_id,
      });
    }
  }
  // decision === "cancelar" (o "modificar", tratado igual acá: se sacan del
  // pedido) -> las sustituciones simplemente no se agregan.

  if (items.length === 0) {
    await supabaseAdmin
      .from("pedidos")
      .update({ estado: "cancelado", items: [], interpretacion: null, pregunta_pendiente: null })
      .eq("id", pedido.id);
    return "Bueno, entonces no queda nada del pedido — probá más tarde o pedí otra cosa 🙂";
  }

  if (!pedido.hora_retiro) {
    const pregunta = "¿A qué hora pasás a retirarlo?";
    await supabaseAdmin
      .from("pedidos")
      .update({
        items,
        pregunta_pendiente: pregunta,
        interpretacion: { fase: "esperando_hora_retiro" },
      })
      .eq("id", pedido.id);
    return pregunta;
  }

  const guardar = async (cambios: Record<string, unknown>) => {
    await supabaseAdmin.from("pedidos").update(cambios).eq("id", pedido.id);
    return pedido.id;
  };

  return await pasarAPendienteAprobacion({
    guardar,
    carniceriaId,
    telefono,
    clienteNombre,
    items,
    horaRetiroIso: pedido.hora_retiro,
    avisoDescartados: "",
  });
}

export async function procesarAudioDePedido(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  mediaUrl: string;
  nombreWhatsapp?: string | null;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, mediaUrl, nombreWhatsapp } = params;

  let transcripcion: string;
  try {
    const audio = await descargarAudioTwilio(mediaUrl);
    transcripcion = await transcribirAudio(audio);
  } catch (err) {
    console.error("Error descargando/transcribiendo audio de pedido", err);
    return "No pude escuchar bien ese audio. ¿Podés grabarlo de nuevo?";
  }

  if (!transcripcion) {
    return "El audio me llegó vacío o no se entendió nada. ¿Podés repetirlo?";
  }

  return await procesarMensajeDeCliente({ carniceriaId, telefono, mensajeWhatsappId, texto: transcripcion, nombreWhatsapp });
}

export async function procesarTextoDePedido(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  texto: string;
  nombreWhatsapp?: string | null;
}): Promise<string | null> {
  return await procesarMensajeDeCliente(params);
}

async function procesarMensajeDeCliente(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  texto: string;
  nombreWhatsapp?: string | null;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto, nombreWhatsapp } = params;

  const cliente = await obtenerOCrearCliente(carniceriaId, telefono, nombreWhatsapp);
  const pedido = await obtenerPedidoPendienteCliente(carniceriaId, telefono);

  if (pedido && !pedido.vencido && pedido.estado === "pendiente_aprobacion") {
    return "Tu pedido ya está esperando que lo revise la carnicería — te aviso apenas lo confirmen 🙏";
  }

  const pedidoActivo = pedido && !pedido.vencido ? pedido : null;

  let catalogo: CatalogoCarniceria;
  try {
    catalogo = await cargarCatalogo(carniceriaId);
  } catch (err) {
    console.error("Error cargando el catálogo para un pedido", err);
    return "Tuve un problema técnico. Probá de nuevo en un rato.";
  }

  // Sub-flujo especial: esperando sí/no sobre una sustitución propuesta.
  if (pedidoActivo?.fase?.fase === "esperando_confirmacion_sustitucion") {
    return await manejarRespuestaSustitucion({
      pedido: pedidoActivo,
      carniceriaId,
      telefono,
      clienteNombre: cliente.nombre,
      texto,
    });
  }

  const contexto = pedidoActivo
    ? {
        itemsActuales: pedidoActivo.items.map((i) => ({
          producto_codigo: i.producto_codigo,
          cantidad: i.cantidad,
          unidad: i.unidad,
          confidence: 1,
        })),
        preguntaPendiente: pedidoActivo.pregunta_pendiente ?? undefined,
        itemParcial: pedidoActivo.item_parcial,
        yaTieneHoraRetiro: Boolean(pedidoActivo.hora_retiro),
      }
    : undefined;

  const resultado = await interpretarMensajePedido(texto, catalogo.promptCatalogo, ahoraArgentinaIso(), contexto);

  return await procesarResultado({
    carniceriaId,
    telefono,
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    mensajeWhatsappId,
    pedidoId: pedidoActivo?.id,
    catalogo,
    resultado,
    texto,
  });
}

// ============================================================
// Decisión del carnicero (aprobar/rechazar) sobre un pedido.
//
// SIMPLIFICACIÓN v1 (documentada, revisar con volumen real): se actúa
// sobre el pedido `pendiente_aprobacion` MÁS RECIENTE de la carnicería,
// no sobre uno puntual — para un piloto de bajo volumen con una sola
// carnicería alcanza, pero si el carnicero llega a tener más de un pedido
// esperando aprobación al mismo tiempo, "aprobar" siempre afecta al más
// nuevo. Corregir (ej. incluyendo un código corto de pedido en el mensaje
// de aviso y pidiendo que lo repita en la respuesta) si esto genera
// confusión en la práctica.
// ============================================================
export async function procesarDecisionCarnicero(params: {
  carniceriaId: string;
  carniceroTelefono: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, carniceroTelefono, texto } = params;
  const decision = clasificarDecisionCarnicero(texto);
  if (decision === null) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: pedido, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, telefono, items, hora_retiro")
    .eq("carniceria_id", carniceriaId)
    .eq("estado", "pendiente_aprobacion")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando pedido pendiente de aprobación", error);
    return "Tuve un problema técnico. Probá de nuevo en un rato.";
  }
  if (!pedido) return "No hay ningún pedido esperando aprobación ahora mismo.";

  const ahora = new Date().toISOString();

  if (decision === "rechazar") {
    const { data: actualizado } = await supabaseAdmin
      .from("pedidos")
      .update({ estado: "rechazado", rechazado_at: ahora, carnicero_telefono: carniceroTelefono })
      .eq("id", pedido.id)
      .eq("estado", "pendiente_aprobacion")
      .select("id")
      .maybeSingle();

    if (!actualizado) return "Ese pedido ya fue procesado.";

    await avisarClienteDecision({ carniceriaId, clienteTelefono: pedido.telefono as string, aprobado: false });
    return "Rechazado. Ya le avisé al cliente.";
  }

  // decision === "aprobar"
  const { data: actualizado, error: errAprobar } = await supabaseAdmin
    .from("pedidos")
    .update({ estado: "aprobado", aprobado_at: ahora, carnicero_telefono: carniceroTelefono })
    .eq("id", pedido.id)
    .eq("estado", "pendiente_aprobacion")
    .select("items, hora_retiro")
    .maybeSingle();

  if (errAprobar) {
    console.error("Error aprobando pedido", errAprobar);
    return "Tuve un problema técnico aprobando el pedido.";
  }
  if (!actualizado) return "Ese pedido ya fue procesado.";

  const items = (actualizado.items ?? []) as ItemGuardadoPedido[];
  for (const item of items) {
    const { data: producto } = await supabaseAdmin
      .from("productos")
      .select("stock_actual")
      .eq("id", item.producto_id)
      .single();
    if (!producto) continue;
    const nuevoStock = Math.max(0, Number(producto.stock_actual) - item.cantidad);
    await supabaseAdmin
      .from("productos")
      .update({ stock_actual: nuevoStock, stock_actualizado_at: ahora })
      .eq("id", item.producto_id);
  }

  await supabaseAdmin.from("pedidos").update({ confirmado_at: ahora }).eq("id", pedido.id);

  await avisarClienteDecision({
    carniceriaId,
    clienteTelefono: pedido.telefono as string,
    aprobado: true,
    horaRetiro: actualizado.hora_retiro ? new Date(actualizado.hora_retiro as string) : undefined,
  });

  return "Aprobado. Ya le avisé al cliente.";
}

async function avisarClienteDecision(params: {
  carniceriaId: string;
  clienteTelefono: string;
  aprobado: boolean;
  horaRetiro?: Date;
}): Promise<void> {
  const { carniceriaId, clienteTelefono, aprobado, horaRetiro } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: carniceria } = await supabaseAdmin
    .from("carnicerias")
    .select("telefono_whatsapp")
    .eq("id", carniceriaId)
    .single();

  if (!carniceria?.telefono_whatsapp) {
    console.error("No se pudo avisar al cliente: carnicería sin telefono_whatsapp", carniceriaId);
    return;
  }

  const cuerpo = aprobado
    ? `¡Tu pedido está confirmado! 🥩 Te esperamos a las ${horaRetiro ? formatearHoraArgentina(horaRetiro) : "la hora acordada"}hs para que lo retires.`
    : "Uy, no pudimos tomar tu pedido en este momento. Cualquier cosa, escribinos de nuevo.";

  try {
    await enviarWhatsapp({ carniceriaId, desde: carniceria.telefono_whatsapp as string, hacia: clienteTelefono, cuerpo });
  } catch (err) {
    console.error("Error avisando al cliente de la decisión del carnicero", err);
  }
}
