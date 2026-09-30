import Anthropic from "@anthropic-ai/sdk";
import { modeloStock } from "./modelos";
import { bloqueHistorial } from "./historial";

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
  /**
   * Si este movimiento es una mitad de una TRANSFORMACIÓN ("piqué 3 kg de
   * vacío"), el mismo identificador en las dos mitades: la baja del origen y
   * el ingreso del destino. Sirve para mostrarlas juntas en el resumen
   * ("Vacío −3 kg → Picada +3 kg") y que un error de signo salte a la vista.
   */
  transformacion?: string;
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
  transformacion?: string;
};

// ⚠️ `itemsParciales` es una LISTA, no un item (21/09/2026). Antes era uno solo
// y ese era el bug de "solo retuvo una parte de la información": el carnicero
// dijo "saqué 6 pechugas que pesaron 2,700 y piqué 3 kg de vacío", el bot
// preguntó qué picada era, y como solo podía guardar UN item a medio armar, las
// pechugas y la baja del vacío se perdieron. Es exactamente el bug que el
// flujo de pedidos tuvo el 23/08 y resolvió igual: mientras algo falta, se
// guardan TODOS los items del mensaje, completos o no.
export type ResultadoInterpretacion =
  | { tipo: "operacion"; items: ItemOperacion[] }
  | { tipo: "aclaracion"; pregunta: string; itemsParciales?: ItemParcial[] }
  | { tipo: "info_faltante"; pregunta: string; itemsParciales?: ItemParcial[] }
  | { tipo: "no_entendido" };

// Contexto de una operación que ya está en curso (aclaración, dato
// faltante pendiente, o una operación ya armada que el carnicero quiere
// corregir) — se le pasa a la IA junto con el mensaje nuevo para que
// pueda interpretar respuestas cortas ("15", "eran 12", "de pollo")
// en relación a lo que ya se venía hablando.
export type ContextoPendiente = {
  itemsActuales: ItemOperacion[];
  preguntaPendiente?: string;
  itemsParciales?: ItemParcial[];
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
            transformacion: {
              type: "string",
              description:
                "Solo si este item es una mitad de una TRANSFORMACIÓN (ver TRANSFORMACIONES). Poné el MISMO " +
                "identificador corto (ej. 't1') en la baja del origen y en el ingreso del destino.",
            },
          },
          required: ["producto_codigo", "accion", "cantidad", "unidad"],
        },
      },
      pregunta: {
        type: "string",
        description: "Solo si tipo=aclaracion o tipo=info_faltante. La pregunta a mandarle al carnicero.",
      },
      items_parciales: {
        type: "array",
        description:
          "Solo si tipo=aclaracion o tipo=info_faltante. TODOS los items que aparecieron en la conversación " +
          "hasta ahora, completos o no — uno por producto (en una transformación, uno por cada mitad). Los que " +
          "ya estén completos van IGUAL acá. Es lo único que impide que se pierdan mientras se aclara el que " +
          "falta. Nunca devuelvas aclaracion/info_faltante con esta lista vacía si ya se mencionó algún producto.",
        items: {
          type: "object",
          properties: {
            producto_codigo: { type: "string", description: "Si ya se sabe (dejalo afuera si es justo lo ambiguo)." },
            accion: { type: "string", enum: ["ingreso", "baja", "ajuste"] },
            cantidad: { type: "number" },
            unidad: { type: "string" },
            transformacion: { type: "string" },
          },
        },
      },
    },
    required: ["tipo"],
  },
};

function construirSystemPrompt(promptCatalogo: string, contexto?: ContextoPendiente, historial = ""): string {
  const bloqueContexto = contexto
    ? `\n\nCONTEXTO DE LA CONVERSACIÓN EN CURSO — el mensaje del usuario es una respuesta a algo que ya se venía hablando, no un mensaje nuevo aislado:
- Items ya identificados y confirmados hasta ahora: ${JSON.stringify(contexto.itemsActuales)}
- Items del mensaje en construcción, completos o no (esto es lo importante: NUNCA pierdas ninguno): ${JSON.stringify(contexto.itemsParciales ?? [])}
- Pregunta que se le había hecho al carnicero: ${contexto.preguntaPendiente ?? "(ninguna — el carnicero está corrigiendo una operación ya armada)"}

Interpretá el mensaje nuevo COMO RESPUESTA a ese contexto, nunca como un mensaje nuevo aislado:
- Si responde el dato que faltaba (ej. "15" o "15 kilos" respondiendo cuánto entró, "especial" respondiendo qué
  picada, o un "sí"/"dale"/"👍" confirmando un dato puntual que vos preguntaste), COMPLETÁ el item que
  corresponde dentro de "items del mensaje en construcción", sin tocar los demás.
- En cuanto TODOS los items en construcción queden completos (producto, acción, cantidad y unidad), NO vuelvas
  a preguntar por las dudas — devolvé tipo "operacion" con la lista completa: los items ya confirmados MÁS
  TODOS los de la construcción (nunca pierdas ninguno, tampoco los que ya estaban completos). Si todavía falta
  algo de alguno, devolvé aclaracion/info_faltante con "items_parciales" = TODOS otra vez.
- Si en cambio el mensaje corrige un dato de un item YA CONFIRMADO (ej. "no, eran 12", "en realidad era vacío"),
  devolvé tipo "operacion" con la lista COMPLETA actualizada (los que no cambian, igual; el que corrige, con el
  valor nuevo).
- Si el mensaje agrega un producto más (no relacionado con la pregunta pendiente), sumalo a la lista sin borrar
  los anteriores.`
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
- Cada vez que respondas tipo "aclaracion" o "info_faltante", completá SIEMPRE "items_parciales" con TODOS los
  items del mensaje (los completos también) — es lo único que le permite al sistema no perder ninguno en el
  próximo mensaje. Si el mensaje trae tres cosas y una sola es ambigua, en "items_parciales" van las TRES.

TRANSFORMACIONES — cuando el carnicero convierte un producto en otro ADENTRO de la carnicería (picar, trozar,
hacer milanesas, embutir, cortar en bifes), eso NO es una sola cosa: son DOS movimientos, y los dos van, con
el mismo "transformacion":
  1. "baja" del producto de ORIGEN (lo que se usó),
  2. "ingreso" del producto de DESTINO (lo que salió).
Ejemplos:
  "piqué 3 kilos de vacío a carne picada"
     -> vacio baja 3 (t1) + la picada ingreso 3 (t1). La picada es AMBIGUA (común, especial o magra): respondé
        aclaracion con la pregunta de la picada, y en items_parciales mandá LAS DOS mitades (el vacío completo,
        la picada con accion ingreso, cantidad 3 y sin producto_codigo).
  "con 5 kilos de nalga hice milanesas" -> nalga baja 5 (t1) + milanesa ingreso 5 (t1).
  (El TROZADO DE POLLO no llega acá: lo resuelve otro módulo que calcula todas las presas. Si igual te llega,
  NUNCA preguntes "cuánto pesó el resto del pollo": eso lo calcula el sistema.)
Reglas de las transformaciones:
  - NUNCA pongas "baja" en el producto que SALIÓ: la picada, las milanesas, las pechugas SUBEN. El que baja
    es el que se usó. Un signo cambiado acá es el peor error posible: resta lo que se hizo y deja intacto lo
    que se gastó.
  - Si dijo UN solo peso ("piqué 3 kilos de vacío"), es el mismo para las dos mitades: es la misma carne
    cambiada de forma. Si dijo los dos ("usé 5 de nalga y salieron 4,5 de milanesas"), cada uno el suyo.
  - Si no dijo de qué salió ("hice 3 kilos de picada"), es un ingreso normal de picada, sin transformación:
    no inventes un origen.

VACA POR DEFECTO — un corte nombrado a secas es VACUNO: "nalga" es nalga (vacuna), "vacío" es vacío
(vacuno). El cerdo siempre se nombra ("nalga de cerdo", "bondiola"). La carne PICADA es SIEMPRE de carne
vacuna. NUNCA preguntes "¿vacuna o de cerdo?" si el carnicero no habló de cerdo en la charla.

POLLO ENTERO — se cuenta en CABEZAS, no en kilos, SIEMPRE (entre o salga). Cuando el carnicero dice cuántos
("trocé 3 pollos", "entraron 8"), poné cantidad = cantidad de pollos y unidad = "unidad". El sistema sabe cuánto
pesa cada uno. Si falta el número, preguntá "¿Cuántos pollos?", NUNCA "¿cuántos kilos de pollo entero?".
Y ojo: "entraron 8 pollos" o "un cajón de pollo" NO es una carga de stock suelta — eso lo resuelve otro módulo
antes de llegar a vos; si igual te llega, el número son cabezas, nunca kilos.

RESPUESTA A UNA PREGUNTA DE OPCIONES — si la pregunta pendiente ofrecía opciones ("¿Pollo entero, pata y muslo
o pechuga?") y el carnicero contesta con algo que coincide con UNA de ellas aunque agregue más datos ("8
pollos", "pollos enteros", "la especial"), esa es la elección. No vuelvas a hacer la misma pregunta.
${bloqueContexto}${bloqueHistorial(historial)}

${promptCatalogo}`;
}

export async function interpretarMensajeStock(
  texto: string,
  promptCatalogo: string,
  contexto?: ContextoPendiente,
  /** Los últimos mensajes de la conversación (ver historial.ts). */
  historial = ""
): Promise<ResultadoInterpretacion> {
  const respuesta = await getClient().messages.create({
    model: modeloStock(),
    max_tokens: 1024,
    system: construirSystemPrompt(promptCatalogo, contexto, historial),
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

function validarTransformacion(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 20) : undefined;
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
    const transformacion = validarTransformacion(item.transformacion);
    return {
      producto_codigo: item.producto_codigo.trim(),
      accion: item.accion,
      cantidad: item.cantidad,
      unidad: item.unidad.trim(),
      confidence,
      ...(transformacion ? { transformacion } : {}),
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
  const transformacion = validarTransformacion(item.transformacion);
  if (transformacion) parcial.transformacion = transformacion;

  return Object.keys(parcial).length > 0 ? parcial : undefined;
}

function validarItemsParciales(datos: Record<string, unknown>): ItemParcial[] | undefined {
  // Se acepta también el campo viejo `item_parcial` (uno solo) por si el modelo
  // lo usa: mejor rescatar uno que perderlo.
  const crudos = Array.isArray(datos.items_parciales)
    ? datos.items_parciales
    : datos.item_parcial
      ? [datos.item_parcial]
      : [];
  const lista = crudos.map(validarItemParcial).filter((i): i is ItemParcial => i !== undefined);
  return lista.length > 0 ? lista : undefined;
}

function validarInterpretacion(input: unknown): ResultadoInterpretacion {
  if (typeof input !== "object" || input === null) {
    return { tipo: "no_entendido" };
  }

  const datos = input as Record<string, unknown>;

  if ((datos.tipo === "aclaracion" || datos.tipo === "info_faltante") && typeof datos.pregunta === "string" && datos.pregunta.trim()) {
    const itemsParciales = validarItemsParciales(datos);
    return { tipo: datos.tipo, pregunta: datos.pregunta.trim(), ...(itemsParciales ? { itemsParciales } : {}) };
  }

  if (datos.tipo === "operacion" && Array.isArray(datos.items) && datos.items.length > 0) {
    const items = datos.items.map(validarItem).filter((item): item is ItemOperacion => item !== null);
    if (items.length === datos.items.length && items.length > 0) {
      return { tipo: "operacion", items };
    }
  }

  return { tipo: "no_entendido" };
}
