import Anthropic from "@anthropic-ai/sdk";

// Modelo pineado por defecto — Claude Haiku 4.5. Se puede pisar con
// CLAUDE_MODEL_HAIKU si Anthropic publica una versión nueva; conviene
// revisar de vez en cuando en https://platform.claude.com/docs/en/about-claude/models/overview
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

export type ItemOperacion = {
  producto_codigo: string;
  accion: "ingreso" | "baja" | "ajuste";
  cantidad: number;
  unidad: string;
  confidence: number;
};

export type ResultadoInterpretacion =
  | { tipo: "operacion"; items: ItemOperacion[] }
  | { tipo: "aclaracion"; pregunta: string }
  | { tipo: "info_faltante"; pregunta: string }
  | { tipo: "no_entendido" };

// Contexto de una operación que ya está en curso (aclaración, dato
// faltante pendiente, o una operación ya armada que el carnicero quiere
// corregir) — se le pasa a la IA junto con el mensaje nuevo para que
// pueda interpretar respuestas cortas ("15", "eran 12", "de pollo")
// en relación a lo que ya se venía hablando.
export type ContextoPendiente = {
  itemsActuales: ItemOperacion[];
  preguntaPendiente?: string;
};

const NOMBRE_HERRAMIENTA = "registrar_interpretacion";

const TOOL_SCHEMA: Anthropic.Tool = {
  name: NOMBRE_HERRAMIENTA,
  description:
    "Registra la interpretación estructurada de un mensaje del carnicero sobre una o más actualizaciones de stock.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["operacion", "aclaracion", "info_faltante", "no_entendido"],
        description:
          "'operacion' si se pudo armar la lista completa de items sin ambigüedad y sin datos faltantes. " +
          "'aclaracion' si un término es ambiguo (ver TERMINOS AMBIGUOS). 'info_faltante' si falta un dato " +
          "puntual (ej. cantidad) para poder completar un item que sí se identificó. 'no_entendido' si el " +
          "mensaje no tiene relación con stock o no se entiende nada.",
      },
      items: {
        type: "array",
        description: "Solo si tipo=operacion. Un item por cada producto mencionado en el mensaje.",
        items: {
          type: "object",
          properties: {
            producto_codigo: {
              type: "string",
              description: "EXACTAMENTE uno de los códigos listados en PRODUCTOS ACTIVOS.",
            },
            accion: { type: "string", enum: ["ingreso", "baja", "ajuste"] },
            cantidad: { type: "number" },
            unidad: { type: "string" },
            confidence: {
              type: "number",
              description: "Qué tan segura está la interpretación de este item, entre 0 y 1.",
            },
          },
          required: ["producto_codigo", "accion", "cantidad", "unidad"],
        },
      },
      pregunta: {
        type: "string",
        description: "Solo si tipo=aclaracion o tipo=info_faltante. La pregunta a mandarle al carnicero.",
      },
    },
    required: ["tipo"],
  },
};

function construirSystemPrompt(promptCatalogo: string, contexto?: ContextoPendiente): string {
  const bloqueContexto = contexto
    ? `\n\nCONTEXTO DE LA CONVERSACIÓN EN CURSO — el mensaje del usuario es una respuesta a algo que ya se venía hablando, no un mensaje nuevo aislado:
- Items ya identificados hasta ahora: ${JSON.stringify(contexto.itemsActuales)}
- Pregunta que se le había hecho al carnicero: ${contexto.preguntaPendiente ?? "(ninguna — el carnicero está corrigiendo una operación ya armada)"}
Interpretá el mensaje nuevo COMO RESPUESTA a ese contexto: si responde el dato que faltaba (ej. "15" o "15 kilos" respondiendo cuánto entró), completá el item correspondiente. Si corrige una cantidad o producto ya puesto (ej. "no, eran 12", "en realidad era vacío"), devolvé la lista COMPLETA de items actualizada (los que no cambian, igual; el que corrige, con el valor nuevo). Si agrega un producto más al mismo pedido, sumalo a la lista sin borrar los anteriores.`
    : "";

  return `Sos el intérprete de mensajes del carnicero de Carnicom, una app para carnicerías de barrio.
El carnicero reporta cambios de stock por WhatsApp (por audio transcripto, o por texto), por ejemplo:
"llegaron 15 kilos de asado", "se terminó el matambre", "dejá el vacío en 8 kilos", "15 de asado y 10 de vacío".
Tu trabajo es convertir eso en una lista de actualizaciones de stock estructuradas, usando SIEMPRE la
herramienta ${NOMBRE_HERRAMIENTA}.

Reglas:
- Un mensaje puede mencionar VARIOS productos a la vez — devolvé un item por cada uno en la misma respuesta
  tipo "operacion". No hace falta pedirle que los separe en mensajes distintos.
- No inventes ni "adivines" un producto si el texto es ambiguo (ver TERMINOS AMBIGUOS) — respondé tipo
  "aclaracion" con la pregunta indicada, sin modificar su redacción. Si el mensaje tiene varios productos y
  solo uno es ambiguo, igual respondé "aclaracion" (no se arma una operación parcial).
- Si identificaste el producto pero falta un dato puntual para completarlo (típicamente la cantidad — ej.
  "entró asado" sin decir cuánto), respondé tipo "info_faltante" con una pregunta puntual sobre ese dato.
  No inventes una cantidad.
- "producto_codigo" tiene que ser EXACTAMENTE uno de los códigos listados en PRODUCTOS ACTIVOS. Nunca
  inventes un código que no esté en esa lista.
- accion "ingreso" = llegó/entró mercadería (sumar al stock actual). "baja" = se vendió, se terminó, se
  rompió, se tiró (restar, o directamente a 0 si dice que se terminó). "ajuste" = te da un número final ya
  corregido ("dejalo en 8 kilos", "quedan 3").
- Si el mensaje no tiene relación con actualizar stock, o no se entiende nada de nada, respondé tipo
  "no_entendido".
- Tolerá errores razonables de transcripción de Whisper (nombres de proveedores, ruido de fondo, cortes de
  palabra), pero no inventes sinónimos nuevos que no estén en la lista del catálogo.
- "confidence" (0 a 1) es qué tan segura está tu interpretación de ESE item puntual — no afecta si se pide
  o no confirmación (eso siempre se le pide al carnicero de todos modos), es solo para que quede registrado.
${bloqueContexto}

${promptCatalogo}`;
}

export async function interpretarMensajeStock(
  texto: string,
  promptCatalogo: string,
  contexto?: ContextoPendiente
): Promise<ResultadoInterpretacion> {
  const respuesta = await getClient().messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: construirSystemPrompt(promptCatalogo, contexto),
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

function validarItem(valor: unknown): ItemOperacion | null {
  if (typeof valor !== "object" || valor === null) return null;
  const item = valor as Record<string, unknown>;

  if (
    (item.accion === "ingreso" || item.accion === "baja" || item.accion === "ajuste") &&
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
      accion: item.accion,
      cantidad: item.cantidad,
      unidad: item.unidad.trim(),
      confidence,
    };
  }
  return null;
}

function validarInterpretacion(input: unknown): ResultadoInterpretacion {
  if (typeof input !== "object" || input === null) {
    return { tipo: "no_entendido" };
  }

  const datos = input as Record<string, unknown>;

  if ((datos.tipo === "aclaracion" || datos.tipo === "info_faltante") && typeof datos.pregunta === "string" && datos.pregunta.trim()) {
    return { tipo: datos.tipo, pregunta: datos.pregunta.trim() };
  }

  if (datos.tipo === "operacion" && Array.isArray(datos.items) && datos.items.length > 0) {
    const items = datos.items.map(validarItem).filter((item): item is ItemOperacion => item !== null);
    if (items.length === datos.items.length && items.length > 0) {
      return { tipo: "operacion", items };
    }
  }

  return { tipo: "no_entendido" };
}
