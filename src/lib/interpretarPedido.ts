import Anthropic from "@anthropic-ai/sdk";

// Intérprete de mensajes del CLIENTE (Etapa 3) — mismo patrón que
// src/lib/interpretarStock.ts (herramienta con schema fijo + Claude Haiku),
// pero para armar un pedido en vez de actualizar stock.

const MODELO = process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno.");
  }
  client = new Anthropic({ apiKey });
  return client;
}

// Cálculo de cuánto asado recomendar cuando el cliente dice "para X
// personas" en vez de decir cuánto de cada corte quiere (23/08/2026, a
// pedido del fundador). PROVISORIO — igual que los pesos de milanesa
// (ver migración 0009): el fundador puede ajustar estos dos números en
// cualquier momento, no son una decisión de negocio cerrada para siempre.
export const KG_POR_HOMBRE = 0.5;
export const KG_POR_MUJER = 0.35;

export type ItemPedido = {
  producto_codigo: string;
  cantidad: number;
  unidad: string;
  confidence: number;
};

// Un producto que el cliente ya mencionó pero todavía no está completo
// (normalmente falta la cantidad). A diferencia de ItemPedido, todos los
// campos son opcionales — eso es justo lo que define este estado.
// `usarResto`: el cliente pidió completar este producto con lo que sobre
// de un total ya calculado (ej. "el resto", "completá con costilla") en
// vez de dar un número — el sistema hace la resta, la IA nunca inventa
// el número (ver calcularKgAsadoObjetivo / resolverUsoDeResto en
// flujoPedidos.ts).
export type ItemParcialPedido = {
  producto_codigo?: string;
  cantidad?: number;
  unidad?: string;
  usarResto?: boolean;
};

// Cuántas personas mencionó el cliente para este pedido — con desglose de
// género si lo dio (necesario porque la estimación es distinta para
// hombres y mujeres, ver KG_POR_HOMBRE/KG_POR_MUJER), o solo un total si
// no lo desglosó.
export type InfoPersonas = {
  hombres?: number;
  mujeres?: number;
  sinGenero?: number;
};

export type ResultadoInterpretacionPedido =
  | { tipo: "saludo" }
  | { tipo: "pedido"; items: ItemPedido[]; horaRetiroIso?: string; personas?: InfoPersonas }
  | { tipo: "aclaracion"; pregunta: string; itemsParciales?: ItemParcialPedido[]; horaRetiroIso?: string; personas?: InfoPersonas }
  | { tipo: "info_faltante"; pregunta: string; itemsParciales?: ItemParcialPedido[]; horaRetiroIso?: string; personas?: InfoPersonas }
  | { tipo: "no_entendido"; personas?: InfoPersonas };

// Contexto de un pedido que se está armando de a poco entre varios mensajes
// del cliente. `itemsParciales` es la lista COMPLETA de productos
// mencionados hasta ahora en este pedido (completos o no) — mientras el
// pedido se está armando, TODO vive acá (no solo lo incompleto), para que
// no se pierda ningún producto si el cliente completa uno y menciona otro
// más en el mismo mensaje (ver bug real del 23/08/2026 en el comentario
// de construirSystemPrompt más abajo).
export type ContextoPedidoPendiente = {
  itemsActuales: ItemPedido[];
  preguntaPendiente?: string;
  itemsParciales?: ItemParcialPedido[];
  yaTieneHoraRetiro: boolean;
  // Si ya calculamos y le mostramos al cliente un total estimado de asado
  // (ver flujoPedidos.ts), se lo pasamos acá para que la IA pueda reconocer
  // "el resto"/"lo que sobra" como referido a ESE total (y marcar
  // usarResto en vez de inventar un número) — la IA nunca hace la resta,
  // solo reconoce la intención.
  asadoKgObjetivo?: number;
};

const NOMBRE_HERRAMIENTA = "registrar_pedido";

const TOOL_SCHEMA: Anthropic.Tool = {
  name: NOMBRE_HERRAMIENTA,
  description: "Registra la interpretación estructurada del mensaje de un cliente que quiere hacer un pedido.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["saludo", "pedido", "aclaracion", "info_faltante", "no_entendido"],
        description:
          "'saludo' si el mensaje es solo un saludo/apertura sin mencionar ningún producto (ej. 'hola', 'buenas'). " +
          "'pedido' SOLO si TODOS los productos mencionados hasta ahora en la conversación tienen producto y " +
          "cantidad claros, sin ambigüedad ni nada pendiente. 'aclaracion' si un término es ambiguo. " +
          "'info_faltante' si a uno o más productos ya identificados les falta un dato puntual (típicamente la " +
          "cantidad). 'no_entendido' si el mensaje no tiene relación con hacer un pedido.",
      },
      items: {
        type: "array",
        description:
          "Solo si tipo=pedido — la lista COMPLETA y final de items del pedido (todos los productos " +
          "mencionados en la conversación, ya completos, uno por producto). Nunca dejes afuera uno que ya " +
          "estaba resuelto en items_parciales de turnos anteriores.",
        items: {
          type: "object",
          properties: {
            producto_codigo: { type: "string", description: "EXACTAMENTE uno de los códigos de PRODUCTOS ACTIVOS." },
            cantidad: { type: "number" },
            unidad: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["producto_codigo", "cantidad", "unidad"],
        },
      },
      hora_retiro_iso: {
        type: "string",
        description:
          "Solo si el cliente mencionó CUÁNDO pasa a retirar (en este mensaje o en uno anterior de esta misma " +
          "conversación) — un timestamp ISO 8601 completo (con offset -03:00 de Argentina), calculado a partir de " +
          "AHORA (te paso la fecha/hora actual de Argentina en el prompt). Ej: si son las 14:00 y dice 'a las 6' " +
          "o 'a las 18hs', interpretalo como hoy a las 18:00 (o mañana si esa hora ya pasó y tiene sentido que sea " +
          "para el día siguiente). Si dice 'en 20 minutos', sumale 20 minutos a la hora actual. Dejalo vacío si no " +
          "se mencionó ninguna hora de retiro en la conversación hasta ahora.",
      },
      pregunta: {
        type: "string",
        description:
          "Solo si tipo=aclaracion o tipo=info_faltante. La pregunta a mandarle al cliente. Si falta más de un " +
          "dato (ej. la cantidad de dos productos distintos), JUNTALOS en una sola pregunta en vez de preguntar " +
          "de a uno (ej. '¿Cuántos kilos de vacío querés? ¿Y cuántos de costilla?').",
      },
      items_parciales: {
        type: "array",
        description:
          "Solo si tipo=aclaracion o tipo=info_faltante. TODOS los productos mencionados hasta ahora en este " +
          "pedido, completos o no — un objeto por producto. Para los que ya tenés cantidad y unidad, IGUAL " +
          "incluilos acá (no los pases a 'items' todavía) hasta que el pedido entero esté completo y puedas " +
          "responder tipo='pedido'. Esto es lo único que le permite al sistema no perder ningún producto " +
          "mientras se termina de armar el pedido entre varios mensajes.",
        items: {
          type: "object",
          properties: {
            producto_codigo: { type: "string" },
            cantidad: { type: "number" },
            unidad: { type: "string" },
            usar_resto: {
              type: "boolean",
              description:
                "true si el cliente pidió completar ESTE producto con lo que sobre de un total ya mencionado " +
                "en el contexto (ej. 'el resto', 'lo que sobra', 'completá con costilla'), en vez de dar un " +
                "número. Solo tiene sentido si el contexto menciona un total ya calculado — si no, tratalo " +
                "como dato faltante normal (sin usar_resto) y preguntá la cantidad. Nunca inventes vos el " +
                "número — el sistema hace la resta.",
            },
          },
        },
      },
      personas: {
        type: "object",
        description:
          "Solo si el cliente mencionó, EN ESTE MENSAJE, para cuánta gente es el pedido (ej. 'somos 4', 'para 4 " +
          "personas', '3 hombres y 2 mujeres'). Si desglosó por género, completá hombres y mujeres (hacé la " +
          "resta si dijo el total y solo un género, ej. 'somos 5, 2 mujeres' → hombres=3, mujeres=2). Si solo " +
          "dio un número total sin género, completá cantidad_sin_genero. No repitas acá info de mensajes " +
          "anteriores — es solo lo que se menciona en ESTE mensaje.",
        properties: {
          hombres: { type: "number" },
          mujeres: { type: "number" },
          cantidad_sin_genero: { type: "number" },
        },
      },
    },
    required: ["tipo"],
  },
};

function construirSystemPrompt(
  promptCatalogo: string,
  ahoraArgentinaIso: string,
  contexto?: ContextoPedidoPendiente
): string {
  // Bug real del 23/08/2026: el cliente escribió "quiero vacío y costilla"
  // (dos productos, ninguno con cantidad) y el bot solo preguntó por uno
  // (vacío) — cuando el cliente contestó "medio kilo y el resto de
  // costilla", el sistema ya no se acordaba de qué producto era el
  // "medio kilo", ni de que costilla seguía pendiente. Causa: el diseño
  // anterior solo guardaba UN item "en construcción" a la vez, así que un
  // segundo producto mencionado sin cantidad se perdía por completo. Ahora
  // `items_parciales` es un ARRAY: guarda TODOS los productos del pedido
  // mientras se arma (completos o no), así ninguno se pierde entre
  // mensajes, y se puede preguntar por varios datos faltantes juntos.
  const bloqueContexto = contexto
    ? `\n\nCONTEXTO DE LA CONVERSACIÓN EN CURSO — el mensaje del cliente es una respuesta a algo que ya se venía hablando, no un pedido nuevo aislado:
- Items ya completos y cerrados de turnos anteriores (esto solo tiene algo si el pedido entero ya estaba completo y el cliente está agregando más): ${JSON.stringify(contexto.itemsActuales)}
- Productos del pedido en construcción hasta ahora, completos o no (esto es lo importante — nunca dejes ninguno afuera): ${JSON.stringify(contexto.itemsParciales ?? [])}
- Pregunta que se le había hecho al cliente: ${contexto.preguntaPendiente ?? "(ninguna)"}
- ¿Ya se sabe la hora de retiro? ${contexto.yaTieneHoraRetiro ? "sí, no hace falta volver a preguntar" : "no"}
${contexto.asadoKgObjetivo != null ? `- Ya le dijimos al cliente que el total estimado de asado es ${contexto.asadoKgObjetivo}kg. Si en su respuesta usa una expresión relativa ("el resto", "lo que sobra", "completá con X") referida a ESE total para uno de los cortes de asado, marcá "usar_resto": true en el item_parcial de ESE corte en vez de inventar un número — el sistema hace la resta solo.` : ""}

Interpretá el mensaje nuevo COMO RESPUESTA a ese contexto, nunca como un mensaje nuevo aislado:
- Si el mensaje responde un dato puntual que faltaba (ej. la pregunta era "¿Cuántos kilos de vacío querés?" y
  contesta "medio kilo" o "0.5"), ESE número es del producto correspondiente en "productos del pedido en
  construcción" — nunca vuelvas a preguntar de qué producto es, ni trates el número como si fuera de otro
  producto. Completá ESE objeto con el dato nuevo, sin tocar los demás.
- OJO: un mismo mensaje puede completar un producto pendiente Y AL MISMO TIEMPO mencionar un producto nuevo
  (ej. "medio kilo y el resto de costilla" respondiendo a "¿cuántos kilos de vacío?" → "medio kilo" completa
  el vacío, "el resto de costilla" es información sobre OTRO producto, costilla). Separá cada parte del mensaje
  y procesala contra el producto que corresponda.
- Si esa parte nueva trae producto Y cantidad numérica clara, agregala como un producto ya completo dentro de
  "items_parciales" (nunca la pierdas, aunque en este turno todavía no puedas responder tipo="pedido" porque
  falta otro dato). Si trae producto pero la cantidad es una referencia relativa al total ya calculado (ver
  arriba), marcá "usar_resto": true para ese producto en vez de inventar un número.
- El cliente puede contestar VARIOS datos juntos en un solo mensaje (ej. "medio kilo de vacío, el resto de
  costilla, paso a las 8 y somos 4") — extraé TODOS los que reconozcas en ese mismo mensaje (items, hora de
  retiro, personas), no solo el primero. Nunca hace falta que el cliente los repita en mensajes separados.
- Si la "Pregunta que se le había hecho al cliente" fue sobre CUÁNTAS PERSONAS son (algo como "¿Para cuántas
  personas es?" o "¿cuántos hombres y cuántas mujeres?"), y el mensaje la contesta — aunque sea con un número
  suelto tipo "4" o "somos 4" o "2 y 2", sin mencionar ningún producto — completá "personas" igual. En ese caso
  como no hay productos nuevos que agregar, repetí "items_parciales" EXACTAMENTE igual a como está arriba en
  "Productos del pedido en construcción" (no lo vacíes) y respondé tipo "info_faltante" (la pregunta puede
  seguir pidiendo la cantidad de esos productos, o dejarla igual — el sistema la va a reemplazar si corresponde).
- Devolvé tipo "pedido" (con "items" = TODOS los productos ya completos, incluyendo los de turnos anteriores)
  recién cuando TODOS los productos mencionados en la conversación tengan producto, cantidad y unidad, y ya se
  sepa la hora de retiro. Si todavía falta algún dato de algún producto, respondé "info_faltante" (o
  "aclaracion" si hay ambigüedad) con "items_parciales" = TODOS los productos hasta ahora (los completos
  también, no los saques) y una pregunta que junte todo lo que falte.`
    : "";

  return `Sos el asistente de pedidos de Carnicom, una app de WhatsApp para carnicerías de barrio. Un cliente te
escribe (texto o audio transcripto) para pedir algo con anticipación y después pasar a retirarlo por el local
(no hay delivery). Tu trabajo es convertir su mensaje en un pedido estructurado, usando SIEMPRE la herramienta
${NOMBRE_HERRAMIENTA}.

Fecha y hora actual en Argentina: ${ahoraArgentinaIso}

Reglas:
- Un mensaje puede pedir varios productos a la vez — un item por cada uno.
- "producto_codigo" tiene que ser EXACTAMENTE uno de los códigos de PRODUCTOS ACTIVOS. Nunca inventes uno que
  no esté en la lista.
- Si el texto es ambiguo (ver TERMINOS AMBIGUOS), respondé tipo "aclaracion" con la pregunta indicada.
- Si identificaste uno o más productos pero falta la cantidad de alguno, respondé tipo "info_faltante"
  pidiéndola (todas juntas si falta más de una). No inventes una cantidad.
- Un producto puede tener nota "[también se puede pedir por unidad, ~Xkg c/u]" — si el cliente lo pide por
  unidad (ej. "4 milanesas"), cantidad=4 y unidad="unidad" tal cual lo dijo (la conversión a kg la hace el
  sistema después, vos NO conviertas el número).
- Extraé la hora de retiro (hora_retiro_iso) si el cliente la mencionó, en esta conversación o en un mensaje
  anterior (ver contexto). Nunca inventes una hora que no fue mencionada.
- Extraé "personas" si el cliente mencionó para cuánta gente es el pedido (ver descripción del campo) — esto
  puede venir junto con productos ("asado para 4, quiero vacío y costilla") o solo. Nunca inventes un número
  de personas que no se mencionó.
- Si el mensaje es solo un saludo sin pedir nada todavía, respondé tipo "saludo".
- Si no tiene nada que ver con hacer un pedido, respondé tipo "no_entendido".
${bloqueContexto}

${promptCatalogo}`;
}

export async function interpretarMensajePedido(
  texto: string,
  promptCatalogo: string,
  ahoraArgentinaIso: string,
  contexto?: ContextoPedidoPendiente
): Promise<ResultadoInterpretacionPedido> {
  const respuesta = await getClient().messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: construirSystemPrompt(promptCatalogo, ahoraArgentinaIso, contexto),
    messages: [{ role: "user", content: texto }],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "tool", name: NOMBRE_HERRAMIENTA },
  });

  const bloqueHerramienta = respuesta.content.find(
    (bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use"
  );

  if (!bloqueHerramienta) {
    return { tipo: "no_entendido" };
  }

  return validarInterpretacion(bloqueHerramienta.input);
}

function validarItem(valor: unknown): ItemPedido | null {
  if (typeof valor !== "object" || valor === null) return null;
  const item = valor as Record<string, unknown>;

  if (
    typeof item.producto_codigo === "string" &&
    item.producto_codigo.trim() &&
    typeof item.cantidad === "number" &&
    Number.isFinite(item.cantidad) &&
    item.cantidad > 0 &&
    typeof item.unidad === "string" &&
    item.unidad.trim()
  ) {
    const confidence =
      typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1
        ? item.confidence
        : 1;
    return {
      producto_codigo: item.producto_codigo.trim(),
      cantidad: item.cantidad,
      unidad: item.unidad.trim(),
      confidence,
    };
  }
  return null;
}

function validarItemParcial(valor: unknown): ItemParcialPedido | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const item = valor as Record<string, unknown>;
  const parcial: ItemParcialPedido = {};

  if (typeof item.producto_codigo === "string" && item.producto_codigo.trim()) {
    parcial.producto_codigo = item.producto_codigo.trim();
  }
  if (typeof item.cantidad === "number" && Number.isFinite(item.cantidad) && item.cantidad > 0) {
    parcial.cantidad = item.cantidad;
  }
  if (typeof item.unidad === "string" && item.unidad.trim()) {
    parcial.unidad = item.unidad.trim();
  }
  if (typeof item.usar_resto === "boolean" && item.usar_resto) {
    parcial.usarResto = true;
  }

  return Object.keys(parcial).length > 0 ? parcial : undefined;
}

function validarItemsParciales(valor: unknown): ItemParcialPedido[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const parciales = valor.map(validarItemParcial).filter((item): item is ItemParcialPedido => item !== undefined);
  return parciales.length > 0 ? parciales : undefined;
}

function validarHoraRetiroIso(valor: unknown): string | undefined {
  if (typeof valor !== "string" || !valor.trim()) return undefined;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return undefined;
  // Un margen chico hacia atrás (5 min) tolera pequeños desfasajes de reloj;
  // cualquier cosa más vieja que eso no tiene sentido como hora de retiro.
  if (fecha.getTime() < Date.now() - 5 * 60 * 1000) return undefined;
  return fecha.toISOString();
}

function validarPersonas(valor: unknown): InfoPersonas | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const datos = valor as Record<string, unknown>;
  const personas: InfoPersonas = {};

  if (typeof datos.hombres === "number" && Number.isFinite(datos.hombres) && datos.hombres >= 0) {
    personas.hombres = datos.hombres;
  }
  if (typeof datos.mujeres === "number" && Number.isFinite(datos.mujeres) && datos.mujeres >= 0) {
    personas.mujeres = datos.mujeres;
  }
  if (
    typeof datos.cantidad_sin_genero === "number" &&
    Number.isFinite(datos.cantidad_sin_genero) &&
    datos.cantidad_sin_genero >= 0
  ) {
    personas.sinGenero = datos.cantidad_sin_genero;
  }

  return Object.keys(personas).length > 0 ? personas : undefined;
}

function validarInterpretacion(input: unknown): ResultadoInterpretacionPedido {
  if (typeof input !== "object" || input === null) {
    return { tipo: "no_entendido" };
  }

  const datos = input as Record<string, unknown>;
  const personas = validarPersonas(datos.personas);

  if (datos.tipo === "saludo") {
    return { tipo: "saludo" };
  }

  if (
    (datos.tipo === "aclaracion" || datos.tipo === "info_faltante") &&
    typeof datos.pregunta === "string" &&
    datos.pregunta.trim()
  ) {
    const itemsParciales = validarItemsParciales(datos.items_parciales);
    const horaRetiroIso = validarHoraRetiroIso(datos.hora_retiro_iso);
    return {
      tipo: datos.tipo,
      pregunta: datos.pregunta.trim(),
      ...(itemsParciales ? { itemsParciales } : {}),
      ...(horaRetiroIso ? { horaRetiroIso } : {}),
      ...(personas ? { personas } : {}),
    };
  }

  if (datos.tipo === "pedido" && Array.isArray(datos.items) && datos.items.length > 0) {
    const items = datos.items.map(validarItem).filter((item): item is ItemPedido => item !== null);
    if (items.length === datos.items.length && items.length > 0) {
      const horaRetiroIso = validarHoraRetiroIso(datos.hora_retiro_iso);
      return { tipo: "pedido", items, ...(horaRetiroIso ? { horaRetiroIso } : {}), ...(personas ? { personas } : {}) };
    }
  }

  if (personas) {
    return { tipo: "no_entendido", personas };
  }

  return { tipo: "no_entendido" };
}
