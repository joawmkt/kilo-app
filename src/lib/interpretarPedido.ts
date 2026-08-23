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

export type ItemPedido = {
  producto_codigo: string;
  cantidad: number;
  unidad: string;
  confidence: number;
};

export type ItemParcialPedido = {
  producto_codigo?: string;
  cantidad?: number;
  unidad?: string;
};

export type ResultadoInterpretacionPedido =
  | { tipo: "saludo" }
  | { tipo: "pedido"; items: ItemPedido[]; horaRetiroIso?: string }
  | { tipo: "aclaracion"; pregunta: string; itemParcial?: ItemParcialPedido; horaRetiroIso?: string }
  | { tipo: "info_faltante"; pregunta: string; itemParcial?: ItemParcialPedido; horaRetiroIso?: string }
  | { tipo: "no_entendido" };

export type ContextoPedidoPendiente = {
  itemsActuales: ItemPedido[];
  preguntaPendiente?: string;
  itemParcial?: ItemParcialPedido;
  yaTieneHoraRetiro: boolean;
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
          "'pedido' si se identificó al menos un producto con cantidad clara, sin ambigüedad. 'aclaracion' si un " +
          "término es ambiguo. 'info_faltante' si falta un dato puntual (típicamente la cantidad) de un producto " +
          "que sí se identificó. 'no_entendido' si el mensaje no tiene relación con hacer un pedido.",
      },
      items: {
        type: "array",
        description: "Solo si tipo=pedido. Un item por cada producto pedido.",
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
        description: "Solo si tipo=aclaracion o tipo=info_faltante. La pregunta a mandarle al cliente.",
      },
      item_parcial: {
        type: "object",
        description: "Solo si tipo=aclaracion o tipo=info_faltante. Lo que YA se sabe del item en construcción.",
        properties: {
          producto_codigo: { type: "string" },
          cantidad: { type: "number" },
          unidad: { type: "string" },
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
  const bloqueContexto = contexto
    ? `\n\nCONTEXTO DE LA CONVERSACIÓN EN CURSO — el mensaje del cliente es una respuesta a algo que ya se venía hablando, no un pedido nuevo aislado:
- Items ya identificados hasta ahora: ${JSON.stringify(contexto.itemsActuales)}
- Item en construcción, todavía incompleto (puede venir vacío): ${JSON.stringify(contexto.itemParcial ?? {})}
- Pregunta que se le había hecho al cliente: ${contexto.preguntaPendiente ?? "(ninguna)"}
- ¿Ya se sabe la hora de retiro? ${contexto.yaTieneHoraRetiro ? "sí, no hace falta volver a preguntar" : "no"}

Interpretá el mensaje nuevo COMO RESPUESTA a ese contexto. Si completa el item en construcción o la hora de
retiro pedida, devolvé tipo "pedido" con la lista COMPLETA de items (los ya identificados MÁS el que se acaba
de completar, nunca los pierdas) y hora_retiro_iso si corresponde.`
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
- Si identificaste el producto pero falta la cantidad, respondé tipo "info_faltante" pidiéndola. No inventes
  una cantidad.
- Un producto puede tener nota "[también se puede pedir por unidad, ~Xkg c/u]" — si el cliente lo pide por
  unidad (ej. "4 milanesas"), cantidad=4 y unidad="unidad" tal cual lo dijo (la conversión a kg la hace el
  sistema después, vos NO conviertas el número).
- Extraé la hora de retiro (hora_retiro_iso) si el cliente la mencionó, en esta conversación o en un mensaje
  anterior (ver contexto). Nunca inventes una hora que no fue mencionada.
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

  return Object.keys(parcial).length > 0 ? parcial : undefined;
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

function validarInterpretacion(input: unknown): ResultadoInterpretacionPedido {
  if (typeof input !== "object" || input === null) {
    return { tipo: "no_entendido" };
  }

  const datos = input as Record<string, unknown>;

  if (datos.tipo === "saludo") {
    return { tipo: "saludo" };
  }

  if (
    (datos.tipo === "aclaracion" || datos.tipo === "info_faltante") &&
    typeof datos.pregunta === "string" &&
    datos.pregunta.trim()
  ) {
    const itemParcial = validarItemParcial(datos.item_parcial);
    const horaRetiroIso = validarHoraRetiroIso(datos.hora_retiro_iso);
    return {
      tipo: datos.tipo,
      pregunta: datos.pregunta.trim(),
      ...(itemParcial ? { itemParcial } : {}),
      ...(horaRetiroIso ? { horaRetiroIso } : {}),
    };
  }

  if (datos.tipo === "pedido" && Array.isArray(datos.items) && datos.items.length > 0) {
    const items = datos.items.map(validarItem).filter((item): item is ItemPedido => item !== null);
    if (items.length === datos.items.length && items.length > 0) {
      const horaRetiroIso = validarHoraRetiroIso(datos.hora_retiro_iso);
      return { tipo: "pedido", items, ...(horaRetiroIso ? { horaRetiroIso } : {}) };
    }
  }

  return { tipo: "no_entendido" };
}
