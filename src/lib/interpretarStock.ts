import Anthropic from "@anthropic-ai/sdk";
import { modeloStock } from "./modelos";

// Modelo pineado por defecto — Claude Haiku 4.5. Se puede pisar con
// CLAUDE_MODEL_HAIKU si Anthropic publica una versión nueva; conviene
// revisar de vez en cuando en https://platform.claude.com/docs/en/about-claude/models/overview

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

// El "item en construcción" cuando falta un dato o hay que desambiguar —
// campos todos opcionales porque justamente lo que define este estado es
// que TODAVÍA no está completo. Se persiste y se re-inyecta como contexto
// en el turno siguiente para que la IA no "olvide" lo que ya se sabía del
// item apenas cambia de tipo de respuesta (bug real encontrado en la
// prueba del 22/08/2026: se preguntaba "¿cuántos kilos de costilla?", el
// carnicero respondía "2" y después "👍", y el item de costilla
// directamente desaparecía del resumen final — porque itemsActuales nunca
// se enteraba de que existía un item de costilla a medio construir).
export type ItemParcial = {
  producto_codigo?: string;
  accion?: "ingreso" | "baja" | "ajuste";
  cantidad?: number;
  unidad?: string;
};

export type ResultadoInterpretacion =
  | { tipo: "operacion"; items: ItemOperacion[] }
  | { tipo: "aclaracion"; pregunta: string; itemParcial?: ItemParcial }
  | { tipo: "info_faltante"; pregunta: string; itemParcial?: ItemParcial }
  | { tipo: "no_entendido" };

// Contexto de una operación que ya está en curso (aclaración, dato
// faltante pendiente, o una operación ya armada que el carnicero quiere
// corregir) — se le pasa a la IA junto con el mensaje nuevo para que
// pueda interpretar respuestas cortas ("15", "eran 12", "de pollo")
// en relación a lo que ya se venía hablando.
export type ContextoPendiente = {
  itemsActuales: ItemOperacion[];
  preguntaPendiente?: string;
  itemParcial?: ItemParcial;
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
      item_parcial: {
        type: "object",
        description:
          "Solo si tipo=aclaracion o tipo=info_faltante. Lo que YA se sabe del item que se está armando, aunque " +
          "esté incompleto (poné solo los campos que ya estén claros, dejá afuera los que falten). Esto es lo que " +
          "permite retomarlo en el próximo mensaje sin perderlo — SIEMPRE completalo con todo lo que ya sepas, " +
          "aunque la pregunta sea sobre un solo dato puntual.",
        properties: {
          producto_codigo: { type: "string", description: "Si ya se sabe (o no aplica porque es justo lo ambiguo)." },
          accion: { type: "string", enum: ["ingreso", "baja", "ajuste"] },
          cantidad: { type: "number" },
          unidad: { type: "string" },
        },
      },
    },
    required: ["tipo"],
  },
};

function construirSystemPrompt(promptCatalogo: string, contexto?: ContextoPendiente): string {
  const bloqueContexto = contexto
    ? `\n\nCONTEXTO DE LA CONVERSACIÓN EN CURSO — el mensaje del usuario es una respuesta a algo que ya se venía hablando, no un mensaje nuevo aislado:
- Items ya identificados y confirmados hasta ahora: ${JSON.stringify(contexto.itemsActuales)}
- Item en construcción, todavía incompleto (puede venir vacío): ${JSON.stringify(contexto.itemParcial ?? {})}
- Pregunta que se le había hecho al carnicero: ${contexto.preguntaPendiente ?? "(ninguna — el carnicero está corrigiendo una operación ya armada)"}

Interpretá el mensaje nuevo COMO RESPUESTA a ese contexto, nunca como un mensaje nuevo aislado:
- Si responde el dato que faltaba del item en construcción (ej. "15" o "15 kilos" respondiendo cuánto entró, o
  un "sí"/"dale"/"👍"/similar confirmando un dato puntual que vos preguntaste), COMPLETÁ ese item combinando lo
  que ya tenías en "item en construcción" con el dato nuevo.
- En cuanto el item en construcción quede completo (producto, acción, cantidad y unidad, los cuatro), NO vuelvas
  a preguntar de nuevo por las dudas — devolvé tipo "operacion" con la lista completa: los items ya confirmados
  MÁS este item recién completado (nunca lo pierdas ni lo dejes afuera).
- Si en cambio el mensaje corrige un dato de un item YA CONFIRMADO (ej. "no, eran 12", "en realidad era vacío"),
  devolvé tipo "operacion" con la lista COMPLETA actualizada (los que no cambian, igual; el que corrige, con el
  valor nuevo).
- Si el mensaje agrega un producto más al mismo pedido (no relacionado con la pregunta pendiente), tratalo como
  un item en construcción nuevo (aclaracion o info_faltante con su propio item_parcial) o, si ya viene completo,
  sumalo directo a la lista de items sin borrar los anteriores.`
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
- Cada producto en PRODUCTOS ACTIVOS tiene su unidad real entre paréntesis (kg, unidad, docena, bolsa) — ESA
  es la unidad correcta, el sistema la va a usar tal cual sin importar lo que pongas en "unidad" (podés
  copiarla ahí igual, es solo de referencia). Lo importante es que "cantidad" sea el NÚMERO exacto que dijo
  el carnicero en esa unidad — nunca conviertas ni estimes un equivalente en otra unidad. Ej.: si dice "3
  chorizos" y chorizo está en "(unidad)", cantidad=3 tal cual (NO lo conviertas a un peso estimado en kg).
- accion "ingreso" = llegó/entró mercadería (sumar al stock actual). "baja" = se vendió, se terminó, se
  rompió, se tiró (restar, o directamente a 0 si dice que se terminó). "ajuste" = te da un número final ya
  corregido ("dejalo en 8 kilos", "quedan 3").
- Si el mensaje no tiene relación con actualizar stock, o no se entiende nada de nada, respondé tipo
  "no_entendido".
- Tolerá errores razonables de transcripción de Whisper (nombres de proveedores, ruido de fondo, cortes de
  palabra), pero no inventes sinónimos nuevos que no estén en la lista del catálogo.
- "confidence" (0 a 1) es qué tan segura está tu interpretación de ESE item puntual — no afecta si se pide
  o no confirmación (eso siempre se le pide al carnicero de todos modos), es solo para que quede registrado.
- Cada vez que respondas tipo "aclaracion" o "info_faltante", completá SIEMPRE "item_parcial" con todo lo que
  ya sepas de ese item (aunque sea un solo campo) — es lo único que le permite al sistema no perder ese item
  en el próximo mensaje. Nunca respondas "aclaracion"/"info_faltante" sin "item_parcial", salvo que
  literalmente no sepas nada todavía de ese item.
${bloqueContexto}

${promptCatalogo}`;
}

export async function interpretarMensajeStock(
  texto: string,
  promptCatalogo: string,
  contexto?: ContextoPendiente
): Promise<ResultadoInterpretacion> {
  const respuesta = await getClient().messages.create({
    model: modeloStock(),
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

function validarItemParcial(valor: unknown): ItemParcial | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const item = valor as Record<string, unknown>;
  const parcial: ItemParcial = {};

  if (typeof item.producto_codigo === "string" && item.producto_codigo.trim()) {
    parcial.producto_codigo = item.producto_codigo.trim();
  }
  if (item.accion === "ingreso" || item.accion === "baja" || item.accion === "ajuste") {
    parcial.accion = item.accion;
  }
  if (typeof item.cantidad === "number" && Number.isFinite(item.cantidad) && item.cantidad > 0) {
    parcial.cantidad = item.cantidad;
  }
  if (typeof item.unidad === "string" && item.unidad.trim()) {
    parcial.unidad = item.unidad.trim();
  }

  return Object.keys(parcial).length > 0 ? parcial : undefined;
}

function validarInterpretacion(input: unknown): ResultadoInterpretacion {
  if (typeof input !== "object" || input === null) {
    return { tipo: "no_entendido" };
  }

  const datos = input as Record<string, unknown>;

  if ((datos.tipo === "aclaracion" || datos.tipo === "info_faltante") && typeof datos.pregunta === "string" && datos.pregunta.trim()) {
    const itemParcial = validarItemParcial(datos.item_parcial);
    return { tipo: datos.tipo, pregunta: datos.pregunta.trim(), ...(itemParcial ? { itemParcial } : {}) };
  }

  if (datos.tipo === "operacion" && Array.isArray(datos.items) && datos.items.length > 0) {
    const items = datos.items.map(validarItem).filter((item): item is ItemOperacion => item !== null);
    if (items.length === datos.items.length && items.length > 0) {
      return { tipo: "operacion", items };
    }
  }

  return { tipo: "no_entendido" };
}
