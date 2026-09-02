import { getSupabaseAdmin } from "./supabaseAdmin";
import { cargarCatalogo, CatalogoCarniceria, Producto } from "./catalogo";
import { descargarAudio, enviarWhatsapp, type ReferenciaMedia } from "./whatsapp";
import { avisarPedidoPendiente, revisarStockDeProducto } from "./notificaciones";
import { transcribirAudio } from "./whisper";
import {
  interpretarMensajePedido,
  ItemPedido,
  ItemParcialPedido,
  ResultadoInterpretacionPedido,
  InfoPersonas,
  KG_POR_HOMBRE,
  KG_POR_MUJER,
} from "./interpretarPedido";
import { clasificarRespuesta } from "./confirmacion";
import { clasificarDecisionCarnicero } from "./confirmacionPedido";
import { buscarAlternativa } from "./alternativas";
import { obtenerOCrearCliente } from "./clientes";
import { obtenerNumerosCarnicero } from "./numerosCarnicero";
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

export type ItemGuardadoPedido = {
  producto_id: string;
  producto_codigo: string;
  nombre_display: string;
  cantidad: number; // en la unidad REAL del producto (producto.unidad)
  unidad: string;
  disponible: boolean;
  sustituye_a_producto_id?: string;
  // Precio de lista congelado al aprobar. Se guarda acá y no se recalcula
  // después: si mañana sube el precio del asado, el pedido de ayer no cambia
  // de valor retroactivamente. ESTIMATIVO — el total real se define al pesar.
  precio_unitario?: number | null;
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
  | {
      fase: "esperando_dato_item";
      // Cálculo de "asado para X personas" (23/08/2026, a pedido del
      // fundador) — ver KG_POR_HOMBRE/KG_POR_MUJER y calcularKgAsadoObjetivo
      // más abajo. `recomendacionMostrada` evita repetirle al cliente el
      // total calculado en cada turno una vez que ya se lo dijimos una vez.
      // Antes existía una fase separada "esperando_personas" con su propio
      // intérprete chico — se sacó (23/08/2026, a pedido del fundador: "que
      // el bot agarre todos los datos al mismo tiempo") porque hacía que un
      // mensaje que contestaba la pregunta de personas Y agregaba otro dato
      // a la vez (hora de retiro, otro producto) perdiera ese dato extra.
      // Ahora todo pasa siempre por el mismo intérprete general
      // (interpretarMensajePedido), que ya extrae items + hora + personas
      // juntos del mismo mensaje.
      personas?: InfoPersonas;
      asadoKgObjetivo?: number;
      recomendacionMostrada?: boolean;
    }
  | { fase: "esperando_hora_retiro" }
  | { fase: "esperando_confirmacion_sustitucion"; sustituciones: Sustitucion[] };

type PedidoPendiente = {
  id: string;
  estado: "pendiente_aclaracion" | "pendiente_aprobacion";
  items: ItemGuardadoPedido[];
  pregunta_pendiente: string | null;
  itemsParciales?: ItemParcialPedido[];
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
    itemsParciales: (data.item_parcial as ItemParcialPedido[] | undefined) ?? undefined,
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

// ============================================================
// Recomendación de cantidad de asado "para X personas" (23/08/2026, a
// pedido del fundador: "de arranque él debería recomendarme cuánto de
// cada uno"). Alcance decidido con el fundador: solo aplica a la
// categoría de asado/parrilla (familia "vacuno_parrilla" en el catálogo
// — asado, vacío, costilla, matambre, etc.), no a pollo/cerdo/embutidos.
// Reparto decidido: NO se reparte solo automáticamente entre cortes — se
// le muestra al cliente el total estimado y se le pregunta cuánto quiere
// de cada corte (o si prefiere más de uno que de otro).
// ============================================================

const FAMILIA_ASADO = "vacuno_parrilla";

function esCategoriaAsado(catalogo: CatalogoCarniceria, codigo: string | undefined): boolean {
  if (!codigo) return false;
  return catalogo.porCodigo.get(codigo)?.familia === FAMILIA_ASADO;
}

function combinarPersonas(previas: InfoPersonas | undefined, nuevas: InfoPersonas | undefined): InfoPersonas {
  if (!nuevas) return previas ?? {};
  return {
    hombres: nuevas.hombres ?? previas?.hombres,
    mujeres: nuevas.mujeres ?? previas?.mujeres,
    sinGenero: nuevas.sinGenero ?? previas?.sinGenero,
  };
}

function calcularKgAsadoObjetivo(personas: InfoPersonas): number | null {
  if (personas.hombres == null || personas.mujeres == null) return null;
  const total = personas.hombres * KG_POR_HOMBRE + personas.mujeres * KG_POR_MUJER;
  return Math.round(total * 100) / 100;
}

function armarPreguntaPersonas(personas: InfoPersonas): string {
  if (personas.sinGenero != null) {
    return `Para calcular mejor la cantidad de asado, ¿más o menos cuántos de esos ${personas.sinGenero} son hombres y cuántas mujeres? (tomamos ${Math.round(KG_POR_HOMBRE * 1000)}g por hombre y ${Math.round(KG_POR_MUJER * 1000)}g por mujer)`;
  }
  return "¿Para cuántas personas es? Así te tiro una cantidad aproximada de asado 🙂 (más o menos, ¿cuántos hombres y cuántas mujeres son?)";
}

function armarPreguntaRecomendacion(
  catalogo: CatalogoCarniceria,
  items: ItemParcialPedido[],
  kgObjetivo: number
): string {
  const nombres = items
    .filter((i) => esCategoriaAsado(catalogo, i.producto_codigo))
    .map((i) => catalogo.porCodigo.get(i.producto_codigo!)?.nombre_display ?? i.producto_codigo)
    .join(" y ");
  return `Para eso calculamos un total de ${kgObjetivo}kg de asado. ¿Cuánto querés de ${nombres || "cada corte"}, o preferís más de uno que de otro?`;
}

// Resuelve como máximo UNA marca "usarResto" por vez (ambigüedad entre dos
// "el resto" simultáneos no se intenta adivinar — se deja para el próximo
// mensaje). Si lo ya pedido llega o pasa el total estimado, no inventa un
// número negativo/cero: devuelve una advertencia para preguntarle al
// cliente en vez de asignar algo raro en silencio.
function resolverUsoDeResto(
  items: ItemParcialPedido[],
  catalogo: CatalogoCarniceria,
  kgObjetivo: number
): { items: ItemParcialPedido[]; advertencia?: string } {
  const enCategoria = items.filter((i) => esCategoriaAsado(catalogo, i.producto_codigo));
  const pendientesResto = enCategoria.filter((i) => i.usarResto && i.cantidad == null);
  if (pendientesResto.length !== 1) return { items };

  const objetivo = pendientesResto[0];
  const sumaConocida = enCategoria
    .filter((i) => i !== objetivo && i.cantidad != null)
    .reduce((acc, i) => acc + (i.cantidad ?? 0), 0);
  const resto = Math.round((kgObjetivo - sumaConocida) * 100) / 100;

  if (resto <= 0) {
    const nombre = catalogo.porCodigo.get(objetivo.producto_codigo!)?.nombre_display ?? objetivo.producto_codigo;
    return {
      items,
      advertencia: `Con lo que ya pediste (${sumaConocida}kg) llegás o pasás el cálculo total (${kgObjetivo}kg de asado). ¿Cuánto de ${nombre} querés igual?`,
    };
  }

  const items2 = items.map((i): ItemParcialPedido => {
    if (i !== objetivo) return i;
    return {
      producto_codigo: i.producto_codigo,
      cantidad: resto,
      unidad: catalogo.porCodigo.get(i.producto_codigo!)?.unidad ?? "kg",
    };
  });
  return { items: items2 };
}

function personasDeFase(fase: FaseInterna | null | undefined): InfoPersonas | undefined {
  return fase?.fase === "esperando_dato_item" ? fase.personas : undefined;
}

function asadoKgObjetivoDeFase(fase: FaseInterna | null | undefined): number | undefined {
  if (fase?.fase === "esperando_dato_item") return fase.asadoKgObjetivo;
  return undefined;
}

function recomendacionMostradaDeFase(fase: FaseInterna | null | undefined): boolean {
  return fase?.fase === "esperando_dato_item" ? Boolean(fase.recomendacionMostrada) : false;
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

  // Además del WhatsApp al carnicero, el pedido aparece en la campanita del
  // panel: puede estar mirando el panel en la tablet y no el celular.
  const idPedido = await idDelPedidoPendiente(carniceriaId, telefono);
  if (idPedido) {
    await avisarPedidoPendiente({
      carniceriaId,
      pedidoId: idPedido,
      clienteNombre,
      cantidadItems: items.length,
    });
  }

  return `${avisoDescartados}¡Listo! Tu pedido quedó a confirmar por la carnicería, te aviso apenas lo revisen 🙌`;
}

/** Id del pedido de esa conversación que quedó esperando aprobación. */
async function idDelPedidoPendiente(carniceriaId: string, telefono: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("pedidos")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .eq("estado", "pendiente_aprobacion")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
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
        hacia: numero,
        cuerpo: mensaje,
        origen: "bot",
        esCarnicero: true,
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
  itemsParcialesPrevios?: ItemParcialPedido[];
  // Productos que el pedido activo YA tenía resueltos del todo (guardados
  // en `pedido.items`, no en `item_parcial`) — típicamente porque solo
  // faltaba la hora de retiro. Ver el comentario más abajo, junto a donde
  // se fusionan con items_parciales, para el bug real que motivó esto.
  itemsActualesPrevios?: ItemGuardadoPedido[];
  horaRetiroPrevia?: string;
  personasPrevias?: InfoPersonas;
  asadoKgObjetivoPrevio?: number;
  recomendacionMostrada?: boolean;
}): Promise<string> {
  const {
    carniceriaId,
    telefono,
    clienteId,
    clienteNombre,
    mensajeWhatsappId,
    pedidoId,
    catalogo,
    resultado,
    texto,
    itemsParcialesPrevios,
    itemsActualesPrevios,
    horaRetiroPrevia,
    personasPrevias,
    asadoKgObjetivoPrevio,
    recomendacionMostrada,
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

  if (resultado.tipo === "saludo") {
    if (!pedidoId) return mensajeBienvenida(clienteNombre);
    return "Te escucho, contame qué necesitás.";
  }

  // A partir de acá tratamos TODOS los tipos de forma unificada. El
  // cliente puede mandar varios datos juntos en un solo mensaje (un
  // producto con su cantidad, la hora de retiro, cuántas personas son) y
  // no querés perder ninguno solo porque la IA haya clasificado el "tipo"
  // de una forma u otra — por eso itemsParciales/horaRetiroIso/personas se
  // combinan SIEMPRE con lo que ya sabíamos de turnos anteriores, en vez
  // de descartarlo cuando el tipo no es exactamente el esperado
  // (23/08/2026, a pedido del fundador).
  const personas = combinarPersonas(personasPrevias, "personas" in resultado ? resultado.personas : undefined);
  const horaRetiroIso = ("horaRetiroIso" in resultado ? resultado.horaRetiroIso : undefined) ?? horaRetiroPrevia;
  let itemsParciales =
    (resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante" ? resultado.itemsParciales : undefined) ??
    itemsParcialesPrevios ??
    [];

  // Bug real del 23/08/2026: un pedido ya tenía TODOS sus productos
  // resueltos (guardados en `pedido.items`, esperando solo la hora de
  // retiro) y el cliente contestó con una hora en un formato raro ("15
  // pm") que la IA no supo interpretar — como esos productos ya
  // resueltos no viven en `items_parciales` (son un concepto aparte), el
  // sistema se quedó sin ningún rastro de ellos y terminó preguntando
  // "¿qué productos querés pedir?" de cero, perdiendo el pedido entero.
  // Fix: NUNCA confiar en que la IA se acuerde de repetirlos — acá se
  // fusionan siempre a items_parciales (si no estaban ya) para que el
  // resto de esta función (y `armarYGuardarPedido` más abajo, que ya sabe
  // volver a preguntar la hora si todavía falta) los tenga en cuenta pase
  // lo que pase con la interpretación de este mensaje puntual.
  if (itemsActualesPrevios && itemsActualesPrevios.length > 0) {
    const codigosEnParciales = new Set(itemsParciales.map((i) => i.producto_codigo).filter(Boolean));
    for (const item of itemsActualesPrevios) {
      if (!codigosEnParciales.has(item.producto_codigo)) {
        itemsParciales = [...itemsParciales, { producto_codigo: item.producto_codigo, cantidad: item.cantidad, unidad: item.unidad }];
      }
    }
  }

  if (resultado.tipo === "pedido") {
    const codigosCubiertos = new Set(resultado.items.map((i) => i.producto_codigo));
    const itemsFaltantes: ItemPedido[] = (itemsActualesPrevios ?? [])
      .filter((i) => !codigosCubiertos.has(i.producto_codigo))
      .map((i) => ({ producto_codigo: i.producto_codigo, cantidad: i.cantidad, unidad: i.unidad, confidence: 1 }));

    return await armarYGuardarPedido({
      carniceriaId,
      telefono,
      clienteId,
      clienteNombre,
      mensajeWhatsappId,
      pedidoId,
      catalogo,
      itemsPedidos: [...resultado.items, ...itemsFaltantes],
      horaRetiroIso,
      texto,
    });
  }

  // tipo "aclaracion" | "info_faltante" | "no_entendido" — intentamos
  // avanzar con lo que tengamos (resto, personas, recomendación, o
  // directamente el pedido si ya quedó completo) antes de caer en un
  // "no te entendí" genérico.

  // Si ya sabíamos el total estimado de asado, primero intentamos resolver
  // cualquier "el resto" que el cliente haya marcado.
  let advertenciaResto: string | undefined;
  if (asadoKgObjetivoPrevio != null) {
    const resuelto = resolverUsoDeResto(itemsParciales, catalogo, asadoKgObjetivoPrevio);
    itemsParciales = resuelto.items;
    advertenciaResto = resuelto.advertencia;
  }

  if (advertenciaResto) {
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      pregunta_pendiente: advertenciaResto,
      item_parcial: itemsParciales,
      ...(horaRetiroIso ? { hora_retiro: horaRetiroIso } : {}),
      interpretacion: { fase: "esperando_dato_item", personas, asadoKgObjetivo: asadoKgObjetivoPrevio, recomendacionMostrada: true },
      expires_at: finDeHoyArgentina().toISOString(),
      updated_at: ahora,
    });
    return advertenciaResto;
  }

  // ¿Hay algún corte de asado sin cantidad, y todavía no sabemos para
  // cuánta gente es? Antes de preguntar la cantidad corte por corte, le
  // preguntamos al cliente cuántos son, para poder recomendarle un total.
  const hayAsadoIncompleto = itemsParciales.some(
    (i) => esCategoriaAsado(catalogo, i.producto_codigo) && i.cantidad == null
  );
  const sabemosPersonas = personas.hombres != null && personas.mujeres != null;

  if (hayAsadoIncompleto && !sabemosPersonas && asadoKgObjetivoPrevio == null) {
    const pregunta = armarPreguntaPersonas(personas);
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      pregunta_pendiente: pregunta,
      item_parcial: itemsParciales,
      ...(horaRetiroIso ? { hora_retiro: horaRetiroIso } : {}),
      interpretacion: { fase: "esperando_dato_item", personas },
      expires_at: finDeHoyArgentina().toISOString(),
      updated_at: ahora,
    });
    return pregunta;
  }

  // Ya sabemos (o acabamos de calcular) el total de asado — si hay cortes
  // sin cantidad y todavía no le mostramos la recomendación, mostrársela
  // ahora en vez de preguntar corte por corte.
  const kgObjetivoActual = asadoKgObjetivoPrevio ?? (sabemosPersonas ? calcularKgAsadoObjetivo(personas) : null);

  if (hayAsadoIncompleto && kgObjetivoActual != null && !recomendacionMostrada) {
    const pregunta = armarPreguntaRecomendacion(catalogo, itemsParciales, kgObjetivoActual);
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      pregunta_pendiente: pregunta,
      item_parcial: itemsParciales,
      ...(horaRetiroIso ? { hora_retiro: horaRetiroIso } : {}),
      interpretacion: { fase: "esperando_dato_item", personas, asadoKgObjetivo: kgObjetivoActual, recomendacionMostrada: true },
      expires_at: finDeHoyArgentina().toISOString(),
      updated_at: ahora,
    });
    return pregunta;
  }

  // ¿Quedó todo completo (productos Y hora de retiro, retenida de este
  // mensaje o de uno anterior)? Escalamos a "pedido" y seguimos el camino
  // normal (stock, sustituciones, etc.) en vez de repetir esa lógica acá.
  if (itemsParciales.length > 0 && itemsParciales.every((i) => i.producto_codigo && i.cantidad != null)) {
    const itemsCompletos: ItemPedido[] = itemsParciales.map((i) => ({
      producto_codigo: i.producto_codigo!,
      cantidad: i.cantidad!,
      unidad: i.unidad ?? catalogo.porCodigo.get(i.producto_codigo!)?.unidad ?? "kg",
      confidence: 1,
    }));
    return await armarYGuardarPedido({
      carniceriaId,
      telefono,
      clienteId,
      clienteNombre,
      mensajeWhatsappId,
      pedidoId,
      catalogo,
      itemsPedidos: itemsCompletos,
      horaRetiroIso,
      texto,
    });
  }

  // No hay nada más que resolver automáticamente. Si además no logramos
  // entender nada Y no hay ningún pedido en curso, mensaje genérico; si
  // no, seguimos la pregunta puntual que armó la IA (o repetimos la
  // pregunta pendiente si tampoco entendió esta vez).
  if (resultado.tipo === "no_entendido" && itemsParciales.length === 0 && !pedidoId) {
    return `No relacioné "${texto}" con un pedido. Contame qué necesitás llevarte 🙂`;
  }

  const pregunta =
    resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante"
      ? resultado.pregunta
      : "No te entendí. ¿Podés contarme de nuevo qué necesitás, o responder la pregunta de arriba?";

  await guardar({
    estado: "pendiente_aclaracion",
    transcripcion: texto,
    pregunta_pendiente: pregunta,
    item_parcial: itemsParciales,
    ...(horaRetiroIso ? { hora_retiro: horaRetiroIso } : {}),
    interpretacion: {
      fase: "esperando_dato_item",
      personas,
      asadoKgObjetivo: kgObjetivoActual ?? undefined,
      recomendacionMostrada,
    },
    expires_at: finDeHoyArgentina().toISOString(),
    updated_at: ahora,
  });
  return pregunta;
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
  media: ReferenciaMedia;
  nombreWhatsapp?: string | null;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, media, nombreWhatsapp } = params;

  let transcripcion: string;
  try {
    const audio = await descargarAudio(media);
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

  const asadoKgObjetivoPrevio = asadoKgObjetivoDeFase(pedidoActivo?.fase);

  const contexto = pedidoActivo
    ? {
        itemsActuales: pedidoActivo.items.map((i) => ({
          producto_codigo: i.producto_codigo,
          cantidad: i.cantidad,
          unidad: i.unidad,
          confidence: 1,
        })),
        preguntaPendiente: pedidoActivo.pregunta_pendiente ?? undefined,
        itemsParciales: pedidoActivo.itemsParciales,
        yaTieneHoraRetiro: Boolean(pedidoActivo.hora_retiro),
        asadoKgObjetivo: asadoKgObjetivoPrevio,
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
    personasPrevias: personasDeFase(pedidoActivo?.fase),
    asadoKgObjetivoPrevio,
    recomendacionMostrada: recomendacionMostradaDeFase(pedidoActivo?.fase),
    itemsParcialesPrevios: pedidoActivo?.itemsParciales,
    itemsActualesPrevios: pedidoActivo?.items,
    horaRetiroPrevia: pedidoActivo?.hora_retiro ?? undefined,
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
    .select("id")
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

  const resultado =
    decision === "aprobar"
      ? await aprobarPedido({ carniceriaId, pedidoId: pedido.id as string, carniceroTelefono })
      : await rechazarPedido({ carniceriaId, pedidoId: pedido.id as string, carniceroTelefono });

  return resultado.mensaje;
}

// ============================================================
// Aprobar / rechazar — una sola implementación para el bot y para el panel
// ============================================================
//
// El carnicero puede decidir desde WhatsApp (contestando "aprobar") o desde el
// panel (tocando el botón). Las dos vías tienen que hacer exactamente lo mismo:
// cambiar el estado, descontar el stock, congelar el total y avisarle al
// cliente. Por eso viven acá y no duplicadas en la pantalla del panel.
//
// El `.eq("estado", "pendiente_aprobacion")` en el UPDATE no es decorativo: es
// lo que evita que un pedido se apruebe dos veces si el carnicero toca el botón
// del panel justo cuando ya contestó por WhatsApp. El que llega segundo no
// encuentra la fila y recibe "ya fue procesado" en vez de descontar el stock
// por duplicado.

export type ResultadoDecision = { ok: boolean; mensaje: string };

export async function aprobarPedido(params: {
  carniceriaId: string;
  pedidoId: string;
  /** Si vino por WhatsApp: el número que decidió. */
  carniceroTelefono?: string | null;
  /** Si vino por el panel: el usuario que decidió. */
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const { carniceriaId, pedidoId, carniceroTelefono, decididoPor } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data: actualizado, error } = await supabaseAdmin
    .from("pedidos")
    .update({
      estado: "aprobado",
      aprobado_at: ahora,
      updated_at: ahora,
      carnicero_telefono: carniceroTelefono ?? null,
      decidido_por: decididoPor ?? null,
    })
    .eq("id", pedidoId)
    .eq("carniceria_id", carniceriaId)
    .eq("estado", "pendiente_aprobacion")
    .select("id, telefono, items, hora_retiro")
    .maybeSingle();

  if (error) {
    console.error("Error aprobando pedido", error);
    return { ok: false, mensaje: "Tuve un problema técnico aprobando el pedido." };
  }
  if (!actualizado) return { ok: false, mensaje: "Ese pedido ya fue procesado." };

  const items = (actualizado.items ?? []) as ItemGuardadoPedido[];
  const itemsConPrecio: ItemGuardadoPedido[] = [];
  let total = 0;
  let faltaAlgunPrecio = false;

  for (const item of items) {
    const { data: producto } = await supabaseAdmin
      .from("productos")
      .select("stock_actual, precio")
      .eq("id", item.producto_id)
      .single();

    if (!producto) {
      itemsConPrecio.push(item);
      faltaAlgunPrecio = true;
      continue;
    }

    const nuevoStock = Math.max(0, Number(producto.stock_actual) - item.cantidad);
    await supabaseAdmin
      .from("productos")
      .update({ stock_actual: nuevoStock, stock_actualizado_at: ahora, stock_origen: "pedido" })
      .eq("id", item.producto_id);

    const precio = producto.precio === null || producto.precio === undefined ? null : Number(producto.precio);
    if (precio === null) faltaAlgunPrecio = true;
    else total += precio * item.cantidad;

    itemsConPrecio.push({ ...item, precio_unitario: precio });

    // Descontar puede haber dejado el producto en cero: es justo el momento de
    // avisarlo, porque a partir de ahora el bot ya no lo va a poder ofrecer.
    await revisarStockDeProducto({ carniceriaId, productoId: item.producto_id });
  }

  await supabaseAdmin
    .from("pedidos")
    .update({
      confirmado_at: ahora,
      items: itemsConPrecio,
      // Si a algún producto le falta el precio, el total sería mentira: mejor
      // dejarlo vacío y que la caja lo cuente como "sin precio cargado".
      total_estimado: faltaAlgunPrecio ? null : Number(total.toFixed(2)),
    })
    .eq("id", pedidoId);

  await avisarClienteDecision({
    carniceriaId,
    clienteTelefono: actualizado.telefono as string,
    aprobado: true,
    horaRetiro: actualizado.hora_retiro ? new Date(actualizado.hora_retiro as string) : undefined,
    pedidoId,
  });

  return { ok: true, mensaje: "Aprobado. Ya le avisé al cliente." };
}

export async function rechazarPedido(params: {
  carniceriaId: string;
  pedidoId: string;
  carniceroTelefono?: string | null;
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const { carniceriaId, pedidoId, carniceroTelefono, decididoPor } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data: actualizado } = await supabaseAdmin
    .from("pedidos")
    .update({
      estado: "rechazado",
      rechazado_at: ahora,
      updated_at: ahora,
      carnicero_telefono: carniceroTelefono ?? null,
      decidido_por: decididoPor ?? null,
    })
    .eq("id", pedidoId)
    .eq("carniceria_id", carniceriaId)
    .eq("estado", "pendiente_aprobacion")
    .select("id, telefono")
    .maybeSingle();

  if (!actualizado) return { ok: false, mensaje: "Ese pedido ya fue procesado." };

  await avisarClienteDecision({
    carniceriaId,
    clienteTelefono: actualizado.telefono as string,
    aprobado: false,
    pedidoId,
  });

  return { ok: true, mensaje: "Rechazado. Ya le avisé al cliente." };
}

/**
 * Marca un pedido como retirado. Solo desde el panel: no hay forma de detectar
 * automáticamente que alguien pasó a buscar su pedido (no hay integración con
 * la caja), así que alguien lo tiene que marcar a mano.
 */
export async function marcarPedidoRetirado(params: {
  carniceriaId: string;
  pedidoId: string;
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data } = await supabaseAdmin
    .from("pedidos")
    .update({ estado: "retirado", retirado_at: ahora, updated_at: ahora, decidido_por: params.decididoPor ?? null })
    .eq("id", params.pedidoId)
    .eq("carniceria_id", params.carniceriaId)
    .in("estado", ["aprobado", "no_show"])
    .select("id, cliente_id, estado")
    .maybeSingle();

  if (!data) return { ok: false, mensaje: "Ese pedido no se puede marcar como retirado." };

  return { ok: true, mensaje: "Marcado como retirado." };
}

/**
 * Marca un pedido como no retirado y suma una ausencia al cliente.
 *
 * El cron ya marca ausencias solas pasado el margen de gracia, pero es una
 * aproximación: si el cliente retiró y nadie lo marcó, queda contado como
 * ausente. Esta acción es la corrección manual, en los dos sentidos.
 */
export async function marcarPedidoNoRetirado(params: {
  carniceriaId: string;
  pedidoId: string;
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data } = await supabaseAdmin
    .from("pedidos")
    .update({ estado: "no_show", retirado_at: null, updated_at: ahora, decidido_por: params.decididoPor ?? null })
    .eq("id", params.pedidoId)
    .eq("carniceria_id", params.carniceriaId)
    .in("estado", ["aprobado", "retirado"])
    .select("id, cliente_id")
    .maybeSingle();

  if (!data) return { ok: false, mensaje: "Ese pedido no se puede marcar como no retirado." };

  const { data: cliente } = await supabaseAdmin
    .from("clientes")
    .select("no_shows")
    .eq("id", data.cliente_id as string)
    .single();

  if (cliente) {
    await supabaseAdmin
      .from("clientes")
      .update({ no_shows: Number(cliente.no_shows) + 1 })
      .eq("id", data.cliente_id as string);
  }

  return { ok: true, mensaje: "Marcado como no retirado." };
}

async function avisarClienteDecision(params: {
  carniceriaId: string;
  clienteTelefono: string;
  aprobado: boolean;
  horaRetiro?: Date;
  pedidoId?: string;
}): Promise<void> {
  const { carniceriaId, clienteTelefono, aprobado, horaRetiro, pedidoId } = params;
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
    await enviarWhatsapp({ carniceriaId, hacia: clienteTelefono, cuerpo, origen: "bot", pedidoId });
  } catch (err) {
    console.error("Error avisando al cliente de la decisión del carnicero", err);
  }
}
