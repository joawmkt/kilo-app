import { getSupabaseAdmin } from "./supabaseAdmin";
import { cargarCatalogo, CatalogoCarniceria, Producto } from "./catalogo";
import { descargarAudio, enviarWhatsapp, type ReferenciaMedia } from "./whatsapp";
import { avisarPedidoPendiente, crearAviso, revisarStockDeProducto } from "./notificaciones";
import { nuevaVersion, registrarEvento } from "./pedidoEventos";
import { iniciarRechazo, responderConsultaCarnicero } from "./decisionCarnicero";
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
import { buscarSustitutoAutorizado } from "./alternativas";
import { responderConsulta, respuestaSinDato } from "./consultas";
import { obtenerOCrearCliente } from "./clientes";
import { obtenerNumerosCarnicero } from "./numerosCarnicero";
import { esCarniceroAutorizado } from "./quienEs";
import { consumirDeProducto } from "./mediaRes";
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
  /** El reemplazo depende del uso: hay que preguntarlo antes (sección 5.4). */
  requierePreguntarUso?: boolean;
};

/** Un producto del que había menos de lo pedido (sección 39). */
type StockParcial = { nombre: string; hay: number; faltan: number; unidad: string };

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
  // `intentos` cuenta cuántas veces seguidas preguntamos la hora sin obtenerla.
  // Sirve para no repetir la misma frase indefinidamente: a la tercera el bot
  // cambia el pedido de dato en vez de sonar como un disco rayado.
  | { fase: "esperando_hora_retiro"; intentos?: number }
  | { fase: "esperando_confirmacion_sustitucion"; sustituciones: Sustitucion[] }
  // Especificación, sección 31: el resumen completo ya se le mostró al cliente
  // y estamos esperando que diga que sí. Recién ahí el pedido sale al
  // carnicero. Es un paso más de conversación, a propósito: cuesta un mensaje
  // y evita que el carnicero prepare un pedido mal entendido.
  | { fase: "esperando_confirmacion_final" };

type PedidoPendiente = {
  id: string;
  estado:
    | "borrador"
    | "pendiente_aclaracion"
    | "pendiente_confirmacion_cliente"
    | "pendiente_aprobacion"
    | "modificacion_pendiente";
  version: number;
  items: ItemGuardadoPedido[];
  pregunta_pendiente: string | null;
  itemsParciales?: ItemParcialPedido[];
  hora_retiro: string | null;
  fase: FaseInterna | null;
  vencido: boolean;
  /** Si a este pedido ya se le ofreció un complementario (sección 40). */
  recomendacionHecha: boolean;
};

async function obtenerPedidoPendienteCliente(
  carniceriaId: string,
  telefono: string
): Promise<PedidoPendiente | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, estado, version, items, pregunta_pendiente, item_parcial, hora_retiro, interpretacion, expires_at, recomendacion_hecha"
    )
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .in("estado", [
      "borrador",
      "pendiente_aclaracion",
      "pendiente_confirmacion_cliente",
      "pendiente_aprobacion",
      "modificacion_pendiente",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando pedido pendiente", error);
    return null;
  }
  if (!data) return null;

  const estaVencido =
    data.estado !== "pendiente_aprobacion" &&
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
    version: Number(data.version ?? 1),
    items: (data.items ?? []) as ItemGuardadoPedido[],
    pregunta_pendiente: (data.pregunta_pendiente as string | null) ?? null,
    itemsParciales: (data.item_parcial as ItemParcialPedido[] | undefined) ?? undefined,
    hora_retiro: (data.hora_retiro as string | null) ?? null,
    fase: interpretacion ?? null,
    vencido: estaVencido,
    recomendacionHecha: Boolean(data.recomendacion_hecha),
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

/** Especificación, sección 3.2 — un pedido esperando aprobación vence a las 4 horas. */
export const HORAS_VENCIMIENTO_APROBACION = 4;

/** Especificación, sección 3.1 — a los 30 minutos sin aprobación se le avisa al cliente. */
export const MINUTOS_AVISO_DEMORA = 30;

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

function intentosHoraDeFase(fase: FaseInterna | null | undefined): number {
  return fase?.fase === "esperando_hora_retiro" ? (fase.intentos ?? 0) : 0;
}

// Saludo inicial — especificación, secciones 2.1 a 2.3 y 4.3.
//
// Tres decisiones que vienen de ahí y conviene no "corregir" sin leerlas:
//   - No se usa "bienvenido/a" (2.3): suena robótico.
//   - En el primer contacto NO se usa el nombre (2.2), porque puede no estar.
//     Recién cuando ya lo tenemos guardado se saluda por nombre (4.3), y ahí
//     se alterna entre variantes para que no suene a plantilla repetida.
//
// ⚠️ La sección 2.1 propone además una segunda línea enumerando de qué se
// puede consultar ("stock, horarios, productos..."). Está deliberadamente
// recortada hasta que esas consultas existan de verdad (Tanda 2 del estado de
// implementación): la propia especificación aplica ese criterio con los
// precios — no prometer una función que hoy está desactivada.
const SALUDOS_CLIENTE_CONOCIDO = [
  "¡Hola, {nombre}! 👋 Qué bueno tenerte de nuevo. ¿En qué te podemos ayudar hoy?",
  "¡Buenas, {nombre}! 👋 ¿Cómo andás? Contame qué necesitás.",
  "¡Hola, {nombre}! ¿Todo bien? 👋 Decime qué necesitás y te doy una mano.",
];

function mensajeBienvenida(nombre: string | null): string {
  const complemento = "Contame qué necesitás y te lo dejo preparado para que pases a retirarlo. También podés mandarme un audio.";

  if (nombre) {
    const variante = SALUDOS_CLIENTE_CONOCIDO[Math.floor(Math.random() * SALUDOS_CLIENTE_CONOCIDO.length)];
    return `${variante.replace("{nombre}", nombre)}\n\n${complemento}`;
  }

  return `¡Hola! 👋 ¿Cómo andás? ¿En qué te podemos ayudar?\n\n${complemento}`;
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
  horaRetiroYaPasoIso?: string;
  intentosHoraPrevios?: number;
  texto: string;
  /** Si a este pedido ya se le ofreció un complementario (sección 40). */
  recomendacionYaHecha?: boolean;
}): Promise<string> {
  const {
    carniceriaId,
    telefono,
    clienteId,
    mensajeWhatsappId,
    pedidoId,
    catalogo,
    itemsPedidos,
    recomendacionYaHecha,
    horaRetiroIso,
    horaRetiroYaPasoIso,
    intentosHoraPrevios = 0,
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
  const parciales: StockParcial[] = [];
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

    // ------------------------------------------------------------
    // Stock parcial (especificación, sección 39)
    // ------------------------------------------------------------
    //
    // "De vacío me quedan 1,8 kg" es muchísimo mejor que "no tengo vacío". El
    // objetivo de esa sección es resolver la necesidad del cliente, no
    // limitarse a decir que no hay. Se le ofrece lo que hay, y si además existe
    // un sustituto autorizado, se le ofrece completar con eso.
    const hayAlgo = producto.stock_actual > 0;

    const faltante = hayAlgo ? Number((cantidadReal - producto.stock_actual).toFixed(3)) : cantidadReal;

    const sustituto = await buscarSustitutoAutorizado({
      carniceriaId,
      catalogo,
      productoFaltante: producto,
      cantidadNecesaria: faltante,
      yaExcluidos: idsYaUsados,
    });

    if (hayAlgo) {
      // Lo que sí hay entra al pedido; por el resto se pregunta.
      itemsResueltos.push({
        producto_id: producto.id,
        producto_codigo: producto.codigo,
        nombre_display: producto.nombre_display,
        cantidad: producto.stock_actual,
        unidad: producto.unidad,
        disponible: true,
      });
      parciales.push({
        nombre: producto.nombre_display,
        hay: producto.stock_actual,
        faltan: faltante,
        unidad: producto.unidad,
      });
    }

    if (sustituto) {
      idsYaUsados.add(sustituto.producto.id);
      sustituciones.push({
        producto_faltante_id: producto.id,
        producto_faltante_nombre: producto.nombre_display,
        alternativa_id: sustituto.producto.id,
        alternativa_codigo: sustituto.producto.codigo,
        alternativa_nombre: sustituto.producto.nombre_display,
        cantidad: faltante,
        unidad: producto.unidad,
        requierePreguntarUso: sustituto.requierePreguntarUso,
      });
    } else if (!hayAlgo) {
      descartadosSinAlternativa.push(producto.nombre_display);
    }
  }

  // Si hay sustituciones por confirmar, se lo preguntamos al cliente antes
  // de seguir — no se ofrece automáticamente sin que él la acepte.
  if (sustituciones.length > 0) {
    // Sección 39: primero se cuenta qué hay, y recién después se ofrece
    // completar. El orden importa: el cliente quiere saber si se lleva algo.
    const lineasSustitucion = sustituciones
      .map((s) => {
        const parcial = parciales.find((p) => p.nombre === s.producto_faltante_nombre);
        if (parcial) {
          return `- De ${s.producto_faltante_nombre} me quedan ${parcial.hay}${parcial.unidad}. Si querés, completamos los ${s.cantidad}${s.unidad} que faltan con ${s.alternativa_nombre}. ¿Te sirve?`;
        }
        return `- No tengo "${s.producto_faltante_nombre}", pero sí "${s.alternativa_nombre}" (${s.cantidad}${s.unidad}). ¿Te sirve?`;
      })
      .join("\n");

    // Sección 5.4: cuando el reemplazo depende de para qué lo va a usar, se
    // pregunta antes en vez de asumir.
    const preguntaUso = sustituciones.some((s) => s.requierePreguntarUso)
      ? "\n(Contame para qué lo ibas a usar y te digo si te sirve el cambio.)"
      : "";
    const lineasDescartados =
      descartadosSinAlternativa.length > 0
        ? `\nPor ahora no tengo disponible: ${descartadosSinAlternativa.join(", ")} (ni un sustituto parecido) — lo saqué del pedido.`
        : "";
    const pregunta = `${lineasSustitucion}${lineasDescartados}${preguntaUso}\n\nRespondé *sí* para aceptar los cambios, o *no* para sacarlos del pedido.`;

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
    const intentos = intentosHoraPrevios + 1;
    const pregunta = `${avisoDescartados}${preguntaPorLaHora({ intentos, horaRetiroYaPasoIso })}`;
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      items: itemsResueltos,
      pregunta_pendiente: pregunta,
      item_parcial: null,
      interpretacion: { fase: "esperando_hora_retiro", intentos },
      updated_at: ahora,
    });
    return pregunta;
  }

  // Especificación, sección 31: NUNCA se manda directo al carnicero. Primero
  // el cliente ve el resumen completo y confirma.
  return await pedirConfirmacionFinal({
    guardar,
    items: itemsResueltos,
    horaRetiroIso,
    avisoDescartados,
    texto,
    catalogo,
    recomendacionYaHecha,
  });
}

/**
 * Qué preguntar cuando todavía no tenemos la hora de retiro.
 *
 * Antes esto era una constante y ahí estaba el bug: si el cliente contestaba
 * una hora que ya había pasado hoy ("11am" a las 12:32), el sistema la
 * descartaba en silencio y volvía a mandar la misma pregunta, palabra por
 * palabra, para siempre. El cliente no tenía forma de saber qué estaba mal.
 *
 * Ahora hay tres respuestas distintas:
 *  - Entendimos la hora pero ya pasó -> se lo decimos y le ofrecemos mañana.
 *  - Primera vez que preguntamos -> la pregunta normal.
 *  - Ya preguntamos varias veces sin éxito -> pedimos el dato de otra forma,
 *    con un ejemplo concreto del formato.
 */
function preguntaPorLaHora(params: { intentos: number; horaRetiroYaPasoIso?: string }): string {
  const { intentos, horaRetiroYaPasoIso } = params;

  if (horaRetiroYaPasoIso) {
    const hora = formatearHoraArgentina(new Date(horaRetiroYaPasoIso));
    return `Las ${hora} de hoy ya pasaron. ¿Te lo dejo para mañana a las ${hora}, o preferís otra hora de hoy?`;
  }

  if (intentos >= 3) {
    return "Perdón, sigo sin agarrar el horario. Mandame solo la hora, así: *18:30*. Si es para mañana, escribime *mañana 11:00*.";
  }

  return "¿A qué hora pasás a retirarlo?";
}

// ============================================================
// Confirmación final del cliente — especificación, sección 31
// ============================================================
//
// Antes de que el pedido llegue al carnicero, el cliente ve el resumen entero
// y tiene que decir que sí. La especificación asume el costo de esta
// interacción extra a propósito: es mucho más barato corregir acá que hacer
// que el carnicero prepare mal un pedido y se entere en el mostrador.
//
// El pedido queda en `pendiente_confirmacion_cliente`. Si el cliente corrige
// algo en vez de confirmar, el mensaje sigue el camino normal de
// interpretación y se vuelve a armar el resumen (sección 31, punto 3).
function resumenParaConfirmar(params: {
  items: ItemGuardadoPedido[];
  horaRetiroIso: string;
  avisoDescartados: string;
}): string {
  const { items, horaRetiroIso, avisoDescartados } = params;
  const lineas = items.map((item) => `- ${item.nombre_display}: ${item.cantidad}${item.unidad}`);
  return [
    `${avisoDescartados}Entonces te preparo:`,
    ...lineas,
    `Retiro: ${formatearHoraArgentina(new Date(horaRetiroIso))} hs.`,
    "",
    "¿Está bien así?",
  ].join("\n");
}

// ============================================================
// Recomendación de complementario — especificación, sección 40
// ============================================================
//
// "Máximo una recomendación contextual por pedido. Debe ser útil y relacionada
// con la compra. No repetir recomendaciones. No vender por vender."
//
// Las tres reglas están implementadas literalmente: una sola vez por pedido
// (`recomendacion_hecha`), solo si el complementario TIENE stock (si no, sería
// ofrecer algo que no hay, prohibido por la sección 1.3), y solo cuando hay una
// relación real entre lo que pidió y lo que se le ofrece.
const COMPLEMENTOS_POR_CONTEXTO: { familiaPedido: string; codigosSugeridos: string[]; frase: string }[] = [
  {
    familiaPedido: FAMILIA_ASADO,
    codigosSugeridos: ["carbon"],
    frase: "¿Carbón tenés, o te sumo una bolsa?",
  },
  {
    familiaPedido: "elaborados_vacunos",
    codigosSugeridos: ["pan_rallado", "huevos"],
    frase: "¿Te sumo pan rallado o huevos para empanarlas?",
  },
];

function recomendacionComplementaria(
  catalogo: CatalogoCarniceria,
  items: ItemGuardadoPedido[]
): string | null {
  for (const regla of COMPLEMENTOS_POR_CONTEXTO) {
    const aplica = items.some((item) => catalogo.porCodigo.get(item.producto_codigo)?.familia === regla.familiaPedido);
    if (!aplica) continue;

    // Si ya lo está llevando, no se le ofrece de nuevo.
    const yaLoLleva = items.some((item) => regla.codigosSugeridos.includes(item.producto_codigo));
    if (yaLoLleva) continue;

    const hayStock = regla.codigosSugeridos.some((codigo) => {
      const producto = catalogo.porCodigo.get(codigo);
      return producto != null && producto.stock_actual > 0;
    });
    if (!hayStock) continue;

    return regla.frase;
  }

  return null;
}

async function pedirConfirmacionFinal(params: {
  guardar: (cambios: Record<string, unknown>) => Promise<string>;
  items: ItemGuardadoPedido[];
  horaRetiroIso: string;
  avisoDescartados: string;
  texto: string;
  catalogo?: CatalogoCarniceria;
  recomendacionYaHecha?: boolean;
}): Promise<string> {
  const { guardar, items, horaRetiroIso, avisoDescartados, texto, catalogo, recomendacionYaHecha } = params;
  const resumen = resumenParaConfirmar({ items, horaRetiroIso, avisoDescartados });

  // La recomendación va JUNTO con el resumen y no en un mensaje aparte: un
  // mensaje extra solo para ofrecer carbón es exactamente "vender por vender".
  const sugerencia = !recomendacionYaHecha && catalogo ? recomendacionComplementaria(catalogo, items) : null;

  await guardar({
    estado: "pendiente_confirmacion_cliente",
    transcripcion: texto,
    items,
    hora_retiro: horaRetiroIso,
    pregunta_pendiente: resumen,
    item_parcial: null,
    interpretacion: { fase: "esperando_confirmacion_final" },
    expires_at: finDeHoyArgentina().toISOString(),
    ...(sugerencia ? { recomendacion_hecha: true } : {}),
    updated_at: new Date().toISOString(),
  });

  return sugerencia ? `${resumen}\n\n${sugerencia}` : resumen;
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
    // Especificación, sección 3.2: un pedido que queda esperando al carnicero
    // sin resolución vence a las 4 horas. Antes no vencía nunca, y eso dejaba
    // al cliente trabado para siempre si el carnicero no lo miraba (pasó de
    // verdad el 23/08/2026).
    expires_at: new Date(Date.now() + HORAS_VENCIMIENTO_APROBACION * 60 * 60 * 1000).toISOString(),
    aviso_demora_enviado_at: null,
    updated_at: ahora,
  });

  const idParaEvento = await idDelPedidoPendiente(carniceriaId, telefono);
  if (idParaEvento) {
    await registrarEvento({
      pedidoId: idParaEvento,
      carniceriaId,
      tipo: "cliente_confirmo",
      actor: "cliente",
      descripcion: "El cliente confirmó el resumen del pedido.",
    });
    await registrarEvento({
      pedidoId: idParaEvento,
      carniceriaId,
      tipo: "enviado_a_aprobacion",
      actor: "bot",
      descripcion: `Se mandó a aprobación con ${items.length} producto(s).`,
      detalle: { items },
    });
  }

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

  // Especificación, sección 54: "quedó a confirmar", sin decir "por la
  // carnicería" — el bot habla EN NOMBRE de la carnicería, no como un tercero
  // que le pasa el pedido a otro.
  return `${avisoDescartados}¡Listo! Tu pedido quedó a confirmar. Apenas lo revisemos te aviso 🙌`;
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
  intentosHoraPrevios?: number;
  personasPrevias?: InfoPersonas;
  asadoKgObjetivoPrevio?: number;
  recomendacionMostrada?: boolean;
  /** La pregunta que el bot tenía pendiente, para repetirla si el cliente la interrumpe con una consulta. */
  preguntaPendientePrevia?: string | null;
  /** Si a este pedido ya se le ofreció un complementario (sección 40). */
  recomendacionYaHecha?: boolean;
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
    intentosHoraPrevios,
    preguntaPendientePrevia,
    recomendacionYaHecha,
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

  // Consulta (especificación, secciones 1.1 y 15-21).
  //
  // Se resuelve ANTES de tocar nada del pedido y **sin guardar nada**: si el
  // cliente está a mitad de un pedido y pregunta "¿a qué hora cierran?",
  // contestarle no puede costarle el pedido que venía armando. El estado queda
  // intacto y la pregunta pendiente sigue en pie.
  //
  // Cuando el dato no está cargado se contesta reconociéndolo (sección 15),
  // nunca completándolo — la sección 1.3 es explícita en que inventar un
  // horario o una promoción es de las peores cosas que puede hacer el bot.
  if (resultado.tipo === "consulta") {
    const respuesta = await responderConsulta({
      carniceriaId,
      tema: resultado.tema,
      catalogo,
      productosConsultados: resultado.productosConsultados,
    });

    const texto = respuesta ?? respuestaSinDato(resultado.tema);

    // Si había una pregunta pendiente del pedido, se la repite al final: si no,
    // el cliente contesta la consulta y ya nadie se acuerda de dónde íbamos.
    if (pedidoId && preguntaPendientePrevia) {
      return `${texto}\n\n${preguntaPendientePrevia}`;
    }
    return texto;
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
  // La hora que el cliente dijo y ya pasó: no sirve para agendar, pero sí para
  // contestarle algo que tenga sentido en vez de repetir la pregunta.
  const horaRetiroYaPasoIso = horaRetiroIso
    ? undefined
    : "horaRetiroYaPasoIso" in resultado
      ? resultado.horaRetiroYaPasoIso
      : undefined;
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
      recomendacionYaHecha,
      horaRetiroIso,
      horaRetiroYaPasoIso,
      intentosHoraPrevios,
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
      recomendacionYaHecha,
      horaRetiroIso,
      horaRetiroYaPasoIso,
      intentosHoraPrevios,
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
  texto: string;
}): Promise<string> {
  const { pedido, texto } = params;
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

  // También acá pasa por la confirmación final (sección 31): el cliente acaba
  // de aceptar un sustituto, así que con más razón conviene que vea el pedido
  // completo antes de que salga.
  return await pedirConfirmacionFinal({
    guardar,
    items,
    horaRetiroIso: pedido.hora_retiro,
    avisoDescartados: "",
    texto,
  });
}

/**
 * Transcribe un audio de un cliente. Se separó de `procesarAudioDePedido`
 * cuando entró la ventana de agrupación (especificación, sección 34): el audio
 * tiene que convertirse en texto ANTES de entrar al bloque, para que se pueda
 * juntar con los mensajes escritos que vengan pegados ("te mando un audio" +
 * "ah, y 2 kilos de chorizo").
 *
 * Devuelve el texto, o un mensaje de error listo para mandarle al cliente.
 */
export async function transcribirAudioDeCliente(
  media: ReferenciaMedia
): Promise<{ ok: true; texto: string } | { ok: false; mensaje: string }> {
  let transcripcion: string;
  try {
    const audio = await descargarAudio(media);
    transcripcion = await transcribirAudio(audio);
  } catch (err) {
    console.error("Error descargando/transcribiendo audio de pedido", err);
    return { ok: false, mensaje: "No pude escuchar bien ese audio. ¿Podés grabarlo de nuevo?" };
  }

  if (!transcripcion) {
    return { ok: false, mensaje: "El audio me llegó vacío o no se entendió nada. ¿Podés repetirlo?" };
  }

  return { ok: true, texto: transcripcion };
}

export async function procesarAudioDePedido(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  media: ReferenciaMedia;
  nombreWhatsapp?: string | null;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, media, nombreWhatsapp } = params;

  const transcripcion = await transcribirAudioDeCliente(media);
  if (!transcripcion.ok) return transcripcion.mensaje;

  return await procesarMensajeDeCliente({
    carniceriaId,
    telefono,
    mensajeWhatsappId,
    texto: transcripcion.texto,
    nombreWhatsapp,
  });
}

export async function procesarTextoDePedido(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId: string;
  texto: string;
  nombreWhatsapp?: string | null;
}): Promise<string | null> {
  // La otra mitad de la regla: acá NO entra el carnicero.
  //
  // El espejo de la guarda de `flujoStock.ts`. Si el carnicero cayera en el
  // flujo de pedidos, el bot le armaría un pedido a él —dándole de alta como
  // cliente, reservándole stock y esperando que alguien lo apruebe— cuando lo
  // que quiso hacer fue cargar mercadería. Es el mismo error que el del
  // 10/09/2026, mirado desde el otro lado.
  if (await esCarniceroAutorizado(params.carniceriaId, params.telefono)) {
    console.error(
      "BLOQUEADO: alguien intentó entrar al flujo de pedidos con el número del carnicero",
      { carniceriaId: params.carniceriaId, telefono: params.telefono }
    );
    return null;
  }

  return await procesarMensajeDeCliente(params);
}

// ============================================================
// Pedidos que ya están confirmados — modificar, cancelar, reprogramar
// Especificación, secciones 8 a 12, 25, 26 y 35
// ============================================================

type PedidoConfirmado = {
  id: string;
  estado: string;
  version: number;
  items: ItemGuardadoPedido[];
  hora_retiro: string | null;
  hora_retiro_original: string | null;
};

/**
 * Los pedidos del cliente que ya están confirmados y todavía no se retiraron.
 *
 * La sección 9 permite tener varios a la vez para fechas distintas, así que
 * esto devuelve una lista y no uno solo: cuando hay más de uno y el cliente
 * pide un cambio sin decir a cuál, hay que preguntarle (sección 1.4).
 */
async function obtenerPedidosConfirmados(
  carniceriaId: string,
  telefono: string
): Promise<PedidoConfirmado[]> {
  const { data } = await getSupabaseAdmin()
    .from("pedidos")
    .select("id, estado, version, items, hora_retiro, hora_retiro_original")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .in("estado", ["aprobado", "en_espera"])
    .is("retirado_at", null)
    .order("hora_retiro", { ascending: true });

  return ((data ?? []) as unknown[]).map((fila) => {
    const f = fila as Record<string, unknown>;
    return {
      id: f.id as string,
      estado: f.estado as string,
      version: Number(f.version ?? 1),
      items: (f.items ?? []) as ItemGuardadoPedido[],
      hora_retiro: (f.hora_retiro as string | null) ?? null,
      hora_retiro_original: (f.hora_retiro_original as string | null) ?? null,
    };
  });
}

/** "el de hoy a las 20:00" — para que el cliente pueda elegir entre varios. */
function describirPedidoBreve(pedido: PedidoConfirmado): string {
  const cuando = pedido.hora_retiro
    ? `${formatearFechaCortaArgentina(new Date(pedido.hora_retiro))} ${formatearHoraArgentina(new Date(pedido.hora_retiro))} hs`
    : "sin hora";
  const productos = pedido.items.map((i) => i.nombre_display).join(", ") || "sin productos";
  return `${cuando} — ${productos}`;
}

function formatearFechaCortaArgentina(fecha: Date): string {
  const enArgentina = new Date(fecha.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(enArgentina.getUTCDate())}/${pad(enArgentina.getUTCMonth() + 1)}`;
}

function preguntarCualPedido(pedidos: PedidoConfirmado[], accion: string): string {
  const lineas = pedidos.map((p, i) => `${i + 1}. ${describirPedidoBreve(p)}`);
  return `Tenés más de un pedido en pie. ¿Cuál querés ${accion}?\n${lineas.join("\n")}`;
}

/**
 * Cancela un pedido (sección 10). Un pedido ya retirado no se puede cancelar
 * (10.3); uno confirmado se cancela y se le avisa al carnicero, porque él ya
 * lo tenía en la lista de lo que iba a preparar (10.2).
 */
async function cancelarPedido(params: {
  carniceriaId: string;
  pedidoId: string;
  clienteNombre: string | null;
  avisarAlCarnicero: boolean;
}): Promise<string> {
  const { carniceriaId, pedidoId, clienteNombre, avisarAlCarnicero } = params;

  const { data: actualizado } = await getSupabaseAdmin()
    .from("pedidos")
    .update({
      estado: "cancelado",
      pregunta_pendiente: null,
      item_parcial: null,
      interpretacion: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedidoId)
    .not("estado", "in", "(retirado,no_show,cancelado)")
    .select("id")
    .maybeSingle();

  if (!actualizado) {
    return "Ese pedido ya no se puede cancelar. Si necesitás algo, contame y lo vemos 🙌";
  }

  await registrarEvento({
    pedidoId,
    carniceriaId,
    tipo: "cancelado",
    actor: "cliente",
    descripcion: "El cliente canceló el pedido.",
  });

  if (avisarAlCarnicero) {
    await crearAviso({
      carniceriaId,
      tipo: "pedido_cancelado",
      titulo: "Un cliente canceló su pedido",
      cuerpo: clienteNombre ? `${clienteNombre} dio de baja un pedido que ya estaba confirmado.` : undefined,
      enlace: `/panel/pedidos/${pedidoId}`,
      entidadTipo: "pedido",
      entidadId: pedidoId,
    });
  }

  return "Listo, lo doy de baja. Cuando quieras me escribís y lo armamos de nuevo 🙌";
}

/**
 * Mueve la hora (o el día) de retiro de un pedido ya confirmado — secciones 11,
 * 25 y 26.
 *
 * Adelantar y postergar NO son lo mismo, y la especificación lo dice claro:
 * postergar se acepta (26), pero adelantar requiere que el carnicero diga que
 * llega (25) — no se le puede prometer al cliente que va a estar listo antes.
 * Por eso, si la hora nueva es ANTES de la original, se deja registrado como
 * pedido y se le avisa al carnicero para que decida, en vez de confirmarlo.
 */
async function reprogramarPedido(params: {
  carniceriaId: string;
  pedido: PedidoConfirmado;
  nuevaHoraIso: string;
  clienteNombre: string | null;
}): Promise<string> {
  const { carniceriaId, pedido, nuevaHoraIso, clienteNombre } = params;
  const supabaseAdmin = getSupabaseAdmin();

  const horaVieja = pedido.hora_retiro ? new Date(pedido.hora_retiro) : null;
  const horaNueva = new Date(nuevaHoraIso);
  const seAdelanta = horaVieja !== null && horaNueva.getTime() < horaVieja.getTime();

  await supabaseAdmin
    .from("pedidos")
    .update({
      hora_retiro: nuevaHoraIso,
      hora_retiro_original: pedido.hora_retiro_original ?? pedido.hora_retiro,
      // El recordatorio se recalcula para la hora nueva (sección 11): si no se
      // limpia, el pedido ya quedó marcado como avisado y nunca se recuerda.
      recordatorio_enviado_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedido.id);

  await nuevaVersion({
    pedidoId: pedido.id,
    carniceriaId,
    motivo: "hora_cambiada",
    actor: "cliente",
    descripcion: `Retiro movido${horaVieja ? ` de las ${formatearHoraArgentina(horaVieja)}` : ""} a las ${formatearHoraArgentina(horaNueva)} hs.`,
    detalle: { anterior: pedido.hora_retiro, nueva: nuevaHoraIso },
  });

  // Sección 11: todo cambio se notifica al carnicero, aunque no requiera que
  // vuelva a aprobar.
  await crearAviso({
    carniceriaId,
    tipo: seAdelanta ? "decision_requerida" : "pedido_reprogramado",
    titulo: seAdelanta ? "Un cliente quiere adelantar su pedido" : "Un cliente movió la hora de su pedido",
    cuerpo: `${clienteNombre ?? "Un cliente"} pasó el retiro a las ${formatearHoraArgentina(horaNueva)} hs.${
      seAdelanta ? " Confirmá si llegás; si no, escribile." : ""
    }`,
    enlace: `/panel/pedidos/${pedido.id}`,
    entidadTipo: "pedido",
    entidadId: pedido.id,
  });

  if (seAdelanta) {
    // Sección 25: no se promete que vaya a estar listo antes.
    return `Te anoto el cambio para las ${formatearHoraArgentina(horaNueva)} hs. Déjame confirmar que lleguemos con el tiempo y te aviso enseguida 🙌`;
  }

  return `Listo, te lo dejo para las ${formatearHoraArgentina(horaNueva)} hs. ¡Te esperamos!`;
}

/** La hora de retiro que trae este resultado, sea cual sea su tipo. */
function horaRetiroDelResultado(resultado: ResultadoInterpretacionPedido): string | undefined {
  return "horaRetiroIso" in resultado ? resultado.horaRetiroIso : undefined;
}

/** ¿El mensaje habla de algún producto, o es solo un dato suelto (una hora)? */
function mencionaProductos(resultado: ResultadoInterpretacionPedido): boolean {
  if (resultado.tipo === "pedido") return resultado.items.length > 0;
  if (resultado.tipo === "aclaracion" || resultado.tipo === "info_faltante") {
    return (resultado.itemsParciales ?? []).length > 0;
  }
  return false;
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

  // Hasta la Tanda 4, si el pedido ya estaba esperando al carnicero el bot
  // contestaba "tu pedido ya está esperando" y no dejaba hacer NADA más: ni
  // agregar un producto, ni cambiar la hora, ni cancelar. La sección 35 pide lo
  // contrario — que se pueda modificar, invalidando la versión anterior.
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
    return await manejarRespuestaSustitucion({ pedido: pedidoActivo, texto });
  }

  // Sub-flujo especial: el cliente ya vio el resumen completo y tiene que
  // confirmarlo (especificación, sección 31).
  //
  // Solo se atajan acá las respuestas EXPLÍCITAS de sí/no. Cualquier otra cosa
  // ("mejor 2 kilos", "agregá chorizos") sigue de largo al intérprete normal:
  // la sección 31 dice que si el cliente corrige algo hay que actualizar y
  // volver a mostrar el resumen, y eso es exactamente lo que hace el camino
  // normal, que ya sabe arrastrar los productos ya resueltos.
  if (pedidoActivo?.fase?.fase === "esperando_confirmacion_final") {
    const decision = clasificarRespuesta(texto);

    if (decision === "confirmar") {
      const guardar = async (cambios: Record<string, unknown>) => {
        await getSupabaseAdmin().from("pedidos").update(cambios).eq("id", pedidoActivo.id);
        return pedidoActivo.id;
      };

      if (!pedidoActivo.hora_retiro) {
        // No debería pasar (el resumen incluye la hora), pero si pasara,
        // mandar un pedido sin hora al carnicero sería peor que repreguntar.
        return "Me falta la hora de retiro para cerrarlo. ¿A qué hora pasás a buscarlo?";
      }

      return await pasarAPendienteAprobacion({
        guardar,
        carniceriaId,
        telefono,
        clienteNombre: cliente.nombre,
        items: pedidoActivo.items,
        horaRetiroIso: pedidoActivo.hora_retiro,
        avisoDescartados: "",
      });
    }

    if (decision === "cancelar") {
      await getSupabaseAdmin()
        .from("pedidos")
        .update({
          estado: "cancelado",
          pregunta_pendiente: null,
          interpretacion: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedidoActivo.id);
      return "Listo, lo doy de baja. Cuando quieras me escribís y lo armamos de nuevo 🙌";
    }
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

  // ------------------------------------------------------------
  // Cancelación (sección 10)
  // ------------------------------------------------------------
  //
  // La detecta la IA por intención, no por la palabra "cancelar": "sacame
  // todo" o "al final no" también son cancelaciones (10.4).
  if (resultado.tipo === "cancelacion") {
    if (pedidoActivo) {
      return await cancelarPedido({
        carniceriaId,
        pedidoId: pedidoActivo.id,
        clienteNombre: cliente.nombre,
        // Solo se molesta al carnicero si él ya lo había visto: un borrador que
        // el cliente abandona no es noticia para nadie.
        avisarAlCarnicero: pedidoActivo.estado === "pendiente_aprobacion",
      });
    }

    const confirmados = await obtenerPedidosConfirmados(carniceriaId, telefono);
    if (confirmados.length === 1) {
      return await cancelarPedido({
        carniceriaId,
        pedidoId: confirmados[0].id,
        clienteNombre: cliente.nombre,
        avisarAlCarnicero: true,
      });
    }
    if (confirmados.length > 1) {
      // Sección 1.4: con dos pedidos en pie, cancelar el equivocado es un
      // problema serio. Se pregunta, nunca se adivina.
      return preguntarCualPedido(confirmados, "cancelar");
    }

    return "No tenés ningún pedido en curso ahora mismo. Si querés armar uno, contame qué necesitás 🙌";
  }

  // ------------------------------------------------------------
  // El pedido ya estaba esperando al carnicero y el cliente cambia algo
  // (sección 35)
  // ------------------------------------------------------------
  //
  // La versión que el carnicero tenía a la vista deja de ser aprobable: sube el
  // número de versión, el pedido vuelve a armarse con el cambio incorporado, y
  // termina otra vez en el resumen + confirmación + aprobación.
  if (pedidoActivo?.estado === "pendiente_aprobacion") {
    if (resultado.tipo === "saludo") {
      return "Tu pedido ya está esperando que lo revisemos — te aviso apenas lo confirmemos 🙏";
    }

    // Una consulta no toca el pedido: se contesta y listo (se resuelve más
    // abajo, en procesarResultado, sin guardar nada).
    if (resultado.tipo !== "consulta") {
      const version = await nuevaVersion({
        pedidoId: pedidoActivo.id,
        carniceriaId,
        motivo: "version_invalidada",
        actor: "cliente",
        descripcion: "El cliente pidió un cambio mientras el pedido esperaba aprobación.",
      });

      await getSupabaseAdmin()
        .from("pedidos")
        .update({ estado: "modificacion_pendiente", updated_at: new Date().toISOString() })
        .eq("id", pedidoActivo.id);

      await crearAviso({
        carniceriaId,
        tipo: "pedido_modificado",
        titulo: "Un cliente modificó su pedido",
        cuerpo: `${cliente.nombre ?? "Un cliente"} cambió algo del pedido que estaba esperando tu aprobación. La versión anterior ya no se puede aprobar.`,
        enlace: `/panel/pedidos/${pedidoActivo.id}`,
        entidadTipo: "pedido",
        entidadId: pedidoActivo.id,
        claveUnicidad: `pedido_modificado:${pedidoActivo.id}:${version ?? ""}`,
      });
    }
  }

  // ------------------------------------------------------------
  // Reprogramar un pedido ya confirmado (secciones 11, 25 y 26)
  // ------------------------------------------------------------
  //
  // El caso es: no hay ningún pedido armándose, pero sí uno confirmado, y el
  // cliente manda SOLO una hora nueva ("mejor paso a las 9"). Si además
  // menciona productos, es un pedido nuevo — la sección 9 permite tener varios
  // para fechas distintas — y sigue el camino normal.
  if (!pedidoActivo) {
    const horaNueva = horaRetiroDelResultado(resultado);
    if (horaNueva && !mencionaProductos(resultado)) {
      const confirmados = await obtenerPedidosConfirmados(carniceriaId, telefono);
      if (confirmados.length === 1) {
        return await reprogramarPedido({
          carniceriaId,
          pedido: confirmados[0],
          nuevaHoraIso: horaNueva,
          clienteNombre: cliente.nombre,
        });
      }
      if (confirmados.length > 1) {
        return preguntarCualPedido(confirmados, "mover de horario");
      }
    }
  }

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
    intentosHoraPrevios: intentosHoraDeFase(pedidoActivo?.fase),
    preguntaPendientePrevia: pedidoActivo?.pregunta_pendiente ?? null,
    recomendacionYaHecha: pedidoActivo?.recomendacionHecha ?? false,
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

  // Primero: ¿el carnicero está contestando una pregunta que le hicimos?
  // (especificación, secciones 36 y 50). Si dejó abierta una consulta y ahora
  // escribe "2 y 3", eso es la respuesta, no un mensaje nuevo.
  const respuestaConsulta = await responderConsultaCarnicero({ carniceriaId, texto });
  if (respuestaConsulta !== null) return respuestaConsulta;

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

  // Rechazar ya no cierra el pedido de una: se le pregunta al carnicero por qué
  // y se busca una salida (sección 36, "el rechazo no significa necesariamente
  // fin del pedido").
  if (decision === "rechazar") {
    return await iniciarRechazo(pedido.id as string);
  }

  const resultado = await aprobarPedido({
    carniceriaId,
    pedidoId: pedido.id as string,
    carniceroTelefono,
  });

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
  /**
   * La versión del pedido que quien aprueba tenía a la vista (sección 51).
   *
   * Sin esto, el carnicero puede aprobar desde una pantalla vieja un pedido que
   * el cliente ya modificó, y terminar preparando lo que decía la versión
   * anterior. Es opcional para no romper a quien apruebe por WhatsApp, donde no
   * hay pantalla: ahí el estado `modificacion_pendiente` ya bloquea el caso.
   */
  version?: number;
}): Promise<ResultadoDecision> {
  const { carniceriaId, pedidoId, carniceroTelefono, decididoPor, version } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  if (version != null) {
    const { data: actual } = await supabaseAdmin
      .from("pedidos")
      .select("version")
      .eq("id", pedidoId)
      .eq("carniceria_id", carniceriaId)
      .maybeSingle();

    if (actual && Number(actual.version ?? 1) !== version) {
      return {
        ok: false,
        mensaje: "El cliente cambió el pedido mientras lo mirabas. Actualizá la página y revisá la versión nueva.",
      };
    }
  }

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
    .select("id, telefono, items, hora_retiro, version")
    .maybeSingle();

  if (error) {
    console.error("Error aprobando pedido", error);
    return { ok: false, mensaje: "Tuve un problema técnico aprobando el pedido." };
  }
  if (!actualizado) return { ok: false, mensaje: "Ese pedido ya fue procesado." };

  await registrarEvento({
    pedidoId,
    carniceriaId,
    tipo: "aprobado",
    actor: "carnicero",
    descripcion: "El carnicero aprobó el pedido.",
    version: Number((actualizado as { version?: number }).version ?? 1),
  });

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

    // ------------------------------------------------------------
    // Descontar el stock
    // ------------------------------------------------------------
    //
    // Hay dos formas, y conviven a propósito:
    //
    // 1. POR PIEZA, si ese producto tiene piezas de alguna media res. Descuenta
    //    de la pieza MÁS VIEJA primero (FEFO), deja registrado de qué lote salió
    //    y con qué causa, y recalcula `productos.stock_actual`. Es lo que hace
    //    que después se pueda saber cuánto rindió esa media res y cuánto costó
    //    de verdad el kilo que se vendió.
    //
    // 2. RESTANDO DE `stock_actual`, como siempre, si no hay piezas.
    //
    // El fallback no es transitorio: es lo correcto. Hay productos que nunca van
    // a venir de una media res (pollo, cerdo, chorizo, achuras) y otros que se
    // cargan por audio sin lote. Obligar a todo a pasar por piezas rompería la
    // mitad del catálogo el primer día.
    const consumo = await consumirDeProducto({
      carniceriaId,
      productoId: item.producto_id,
      kg: item.cantidad,
      tipo: "venta",
      causa: "Pedido aprobado",
      pedidoId,
    });

    if (consumo.kgConsumidos <= 0) {
      const nuevoStock = Math.max(0, Number(producto.stock_actual) - item.cantidad);
      await supabaseAdmin
        .from("productos")
        .update({ stock_actual: nuevoStock, stock_actualizado_at: ahora, stock_origen: "pedido" })
        .eq("id", item.producto_id);
    }

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

  await registrarEvento({
    pedidoId,
    carniceriaId,
    tipo: "rechazado",
    actor: "carnicero",
    descripcion: "El carnicero rechazó el pedido.",
  });

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
/**
 * "En espera": el pedido no se retiró hoy pero sigue en pie para mañana
 * (especificación, sección 7.5).
 *
 * Mientras está en espera el stock sigue reservado y el cliente lo puede
 * retirar al día siguiente. Si tampoco lo retira ahí, recién entonces pasa a
 * no_show (7.6) — eso lo hace el cron.
 */
export async function marcarPedidoEnEspera(params: {
  carniceriaId: string;
  pedidoId: string;
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date();

  // Un día más, contado en días de Argentina y no en horas: "mañana" para un
  // carnicero es el día siguiente, no 24 horas exactas desde el cierre.
  const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const enArgentina = new Date(manana.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hasta = `${enArgentina.getUTCFullYear()}-${pad(enArgentina.getUTCMonth() + 1)}-${pad(enArgentina.getUTCDate())}`;

  const { data } = await supabaseAdmin
    .from("pedidos")
    .update({
      estado: "en_espera",
      en_espera_hasta: hasta,
      updated_at: ahora.toISOString(),
      decidido_por: params.decididoPor ?? null,
    })
    .eq("id", params.pedidoId)
    .eq("carniceria_id", params.carniceriaId)
    .in("estado", ["aprobado", "no_show"])
    .select("id")
    .maybeSingle();

  if (!data) return { ok: false, mensaje: "Ese pedido no se puede dejar en espera." };

  await registrarEvento({
    pedidoId: params.pedidoId,
    carniceriaId: params.carniceriaId,
    tipo: "en_espera",
    actor: "carnicero",
    descripcion: "Queda en espera para el día siguiente.",
    detalle: { hasta },
  });

  return { ok: true, mensaje: "Queda en espera hasta mañana." };
}

/**
 * "Ya está listo" — el carnicero terminó de armar el pedido y le avisa al
 * cliente por si lo quiere retirar antes (pedido del fundador, 10/09/2026).
 *
 * Tres decisiones que vale la pena dejar escritas:
 *
 * 1. NO cambia el estado del pedido. Sigue siendo 'aprobado' (o 'en_espera'):
 *    el stock sigue reservado, se puede seguir marcando como retirado o como
 *    ausente, y el recordatorio sigue saliendo. "Listo" es información nueva,
 *    no un carril nuevo. Ver la migración 0021 para el razonamiento largo.
 *
 * 2. Se avisa UNA sola vez. El `.is("listo_at", null)` del update es lo que lo
 *    garantiza: si el carnicero toca el botón dos veces, el segundo update no
 *    encuentra la fila y el cliente no recibe dos WhatsApp iguales. Es la misma
 *    técnica que usa `aprobarPedido` para no descontar stock por duplicado.
 *
 * 3. El mensaje NO dice "vení ya". Dice que está listo y que puede pasar cuando
 *    quiera, y repite la hora que habían acordado. La diferencia importa: el
 *    cliente arregló una hora, y un mensaje que suene a apuro lo pone incómodo.
 *    Le estamos dando una opción, no cambiándole el plan.
 */
export async function marcarPedidoListo(params: {
  carniceriaId: string;
  pedidoId: string;
  decididoPor?: string | null;
}): Promise<ResultadoDecision> {
  const { carniceriaId, pedidoId, decididoPor } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date().toISOString();

  const { data: actualizado, error } = await supabaseAdmin
    .from("pedidos")
    .update({ listo_at: ahora, updated_at: ahora, decidido_por: decididoPor ?? null })
    .eq("id", pedidoId)
    .eq("carniceria_id", carniceriaId)
    .in("estado", ["aprobado", "en_espera"])
    .is("listo_at", null)
    .select("id, telefono, hora_retiro")
    .maybeSingle();

  if (error) {
    console.error("Error marcando el pedido como listo", error);
    return { ok: false, mensaje: "Tuve un problema técnico. Probá de nuevo en un rato." };
  }
  if (!actualizado) {
    return {
      ok: false,
      mensaje: "Ese pedido no se puede marcar como listo, o ya le avisaste al cliente.",
    };
  }

  await registrarEvento({
    pedidoId,
    carniceriaId,
    tipo: "listo",
    actor: "carnicero",
    descripcion: "El pedido quedó armado y se le avisó al cliente.",
  });

  const horaRetiro = actualizado.hora_retiro
    ? new Date(actualizado.hora_retiro as string)
    : null;

  const cuerpo = horaRetiro
    ? `¡Tu pedido ya está listo! 🥩 Si te queda cómodo podés pasar a buscarlo cuando quieras, y si no te esperamos alrededor de las ${formatearHoraArgentina(horaRetiro)} hs como habíamos quedado.`
    : "¡Tu pedido ya está listo! 🥩 Podés pasar a buscarlo cuando quieras.";

  try {
    await enviarWhatsapp({
      carniceriaId,
      hacia: actualizado.telefono as string,
      cuerpo,
      origen: "bot",
      pedidoId,
    });
  } catch (err) {
    // El pedido YA quedó marcado como listo y el evento quedó registrado. Que
    // falle el envío no se deshace: se le dice la verdad al carnicero para que
    // decida si avisa él por otro lado.
    console.error("Error avisándole al cliente que el pedido está listo", err);
    return {
      ok: true,
      mensaje: "Lo marqué como listo, pero no pude avisarle al cliente. Fijate de decirle vos.",
    };
  }

  return { ok: true, mensaje: "Listo. Ya le avisé al cliente que puede pasar a buscarlo." };
}

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
    .in("estado", ["aprobado", "en_espera", "no_show"])
    .select("id, cliente_id, estado")
    .maybeSingle();

  if (!data) return { ok: false, mensaje: "Ese pedido no se puede marcar como retirado." };

  await registrarEvento({
    pedidoId: params.pedidoId,
    carniceriaId: params.carniceriaId,
    tipo: "retirado",
    actor: "carnicero",
    descripcion: "El carnicero marcó el pedido como retirado.",
  });

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

  // Especificación, sección 54 (y paso 11 del flujo de la sección 48).
  // "Alrededor de las X hs" en vez de "a las X hs": la hora de retiro es una
  // orientación para preparar el pedido, no un turno exacto (sección 7.1).
  const cuerpo = aprobado
    ? `¡Listo! Tu pedido está confirmado 🙌 Te esperamos ${
        horaRetiro ? `alrededor de las ${formatearHoraArgentina(horaRetiro)} hs` : "en el horario que acordamos"
      } para retirarlo.`
    : "Uy, no pudimos tomar tu pedido en este momento. Cualquier cosa, escribinos de nuevo.";

  try {
    await enviarWhatsapp({ carniceriaId, hacia: clienteTelefono, cuerpo, origen: "bot", pedidoId });
  } catch (err) {
    console.error("Error avisando al cliente de la decisión del carnicero", err);
  }
}
