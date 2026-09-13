import Anthropic from "@anthropic-ai/sdk";
import { modeloMediaRes } from "./modelos";
import type { CategoriaAnimal } from "./mediaRes";

// ============================================================
// "Llegó una media res de ciento cuatro kilos seiscientos"
// ============================================================
//
// Este intérprete tiene UN solo trabajo: decidir si el carnicero está avisando
// que entró una media res, y con qué peso. Nada más.
//
// POR QUÉ ES UN INTÉRPRETE APARTE Y NO UNA RAMA DEL DE STOCK
//
// Son dos operaciones distintas de verdad. Una carga de stock común SUMA kilos a
// un producto ("entraron 20 kilos de asado"). Una media res TRANSFORMA: entra
// una pieza grande de peso conocido y salen 28 cortes, hueso, grasa y merma.
// Meterlas en el mismo prompt obligaría al modelo a elegir entre dos formas
// incompatibles de responder, y ahí es donde se equivoca.
//
// Separarlas también hace que el error sea barato: si este intérprete dice "no
// es una media res", el mensaje sigue de largo al flujo de stock de siempre y no
// se pierde nada.
//
// LA ARITMÉTICA NO LA HACE EL MODELO
//
// El modelo devuelve el peso que escuchó; los kilos por corte los reparte
// `mediaRes.ts` en TypeScript, con la tabla de rendimiento. Es la misma regla
// que en todo el proyecto: el modelo entiende, el código calcula.


let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno.");
  client = new Anthropic({ apiKey });
  return client;
}

export type ResultadoMediaResVoz =
  | {
      tipo: "media_res";
      pesoKg: number;
      categoria: CategoriaAnimal | null;
      proveedor: string | null;
      cantidad: number;
    }
  | { tipo: "falta_peso"; pregunta: string }
  | { tipo: "no_es_media_res" };

const NOMBRE_HERRAMIENTA = "registrar_media_res";

const TOOL_SCHEMA: Anthropic.Tool = {
  name: NOMBRE_HERRAMIENTA,
  description: "Registra si el mensaje del carnicero avisa que entró una media res, y con qué peso.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["media_res", "falta_peso", "no_es_media_res"],
        description:
          "'media_res' si avisa que entró una media res Y dice el peso. " +
          "'falta_peso' si claramente habla de una media res pero NO dice cuánto pesa. " +
          "'no_es_media_res' para CUALQUIER otra cosa, incluida una carga de stock normal " +
          "de cortes sueltos. Ante la duda, 'no_es_media_res'.",
      },
      peso_kg: {
        type: "number",
        description:
          "El peso de UNA media res en kilos. Ojo con la forma de hablar: 'ciento cuatro kilos " +
          "seiscientos' son 104,6 kg (los gramos van después de los kilos). 'cien y medio' son 100,5. " +
          "Si dice dos medias reses de 104, poné 104, no 208.",
      },
      cantidad: {
        type: "number",
        description: "Cuántas medias reses del MISMO peso entraron. Si no lo aclara, 1.",
      },
      categoria: {
        type: "string",
        enum: ["novillo", "novillito", "vaquillona", "vaca", "ternera"],
        description: "Solo si lo dice explícitamente. Si no lo dice, dejar afuera este campo.",
      },
      proveedor: {
        type: "string",
        description: "El frigorífico o proveedor, solo si lo nombra.",
      },
      pregunta: {
        type: "string",
        description: "Solo si tipo=falta_peso. La pregunta corta para pedirle el peso.",
      },
    },
    required: ["tipo"],
  },
};

const SYSTEM = `Sos el asistente de una carnicería argentina. Tu ÚNICO trabajo acá es decidir si el
mensaje del carnicero avisa que ENTRÓ UNA MEDIA RES, y con qué peso.

QUÉ ES UNA MEDIA RES
La mitad de una vaca, que llega colgada del frigorífico y pesa entre 60 y 180 kilos.
El carnicero la puede nombrar de muchas formas: "media res", "media", "una media vaca",
"bajaron una media", "llegó la media de novillo", "entró media res".

CUÁNDO ES tipo="media_res"
Avisa que entró una media res Y dice el peso.
  "llegó una media res de ciento cuatro kilos seiscientos" -> peso_kg: 104.6
  "bajaron dos medias de noventa y ocho" -> peso_kg: 98, cantidad: 2
  "entró media res de novillo, 112 kilos, del frigorífico San Jorge"
     -> peso_kg: 112, categoria: "novillo", proveedor: "San Jorge"

CUÁNDO ES tipo="falta_peso"
Habla claramente de una media res pero no dice cuánto pesa.
  "llegó la media res" -> falta_peso
  "bajaron una media de novillo" -> falta_peso

CUÁNDO ES tipo="no_es_media_res"
TODO lo demás. En particular, una carga de stock normal de cortes sueltos NO es una media res:
  "entraron 20 kilos de asado y 8 de vacío" -> no_es_media_res
  "me quedé sin peceto" -> no_es_media_res
  "cargá 10 kilos de nalga" -> no_es_media_res
  "confirmar" -> no_es_media_res

ANTE LA DUDA, tipo="no_es_media_res". Equivocarse para este lado no cuesta nada: el mensaje
sigue al flujo de stock de siempre. Equivocarse para el otro lado le carga a la carnicería
28 cortes que no existen.

CÓMO SE DICEN LOS PESOS EN ARGENTINA
"ciento cuatro kilos seiscientos" = 104,6 kg (lo de después son los gramos)
"noventa y ocho y medio" = 98,5 kg
"ciento diez" = 110 kg
"un quintal" = 100 kg

NUNCA inventes un peso. Si no lo dijo, es falta_peso.
NUNCA supongas la categoría. Si no dijo novillo, vaca ni nada, dejá el campo afuera:
el sistema va a usar la que corresponda por defecto y se la va a confirmar.`;


// ============================================================
// La compuerta: ¿el mensaje siquiera habla de una media res?
// ============================================================
//
// Esto corre ANTES del modelo, y es lo que hace confiable al resto.
//
// El diseño original le dejaba al modelo las dos decisiones: "¿es una media
// res?" y "¿cuánto pesa?". Pero la primera no necesita un modelo — las palabras
// están ahí o no están — y dejársela significaba que un mensaje perfectamente
// claro podía perderse si el modelo dudaba. "Recién bajamos una media res de
// patito que pesó 102 kilos" dice "media res" con todas las letras: que un
// nombre raro en el medio ("patito") lo mande al flujo equivocado es
// inaceptable.
//
// Entonces se reparte el trabajo según quién es mejor en qué:
//   - DETECTAR que se habla de una media res -> texto, determinístico, infalible.
//   - EXTRAER el peso de "ciento cuatro kilos seiscientos" -> el modelo.
//
// De paso ahorra una llamada al modelo en CADA mensaje del carnicero que no
// tenga nada que ver, que es la enorme mayoría.

const PATRONES = [
  // "media res", "medias reses", "media rez" (así lo escribe mucha gente)
  /\bmedias?\s+(res|rez|reses|reces)\b/,
  // "media vaca", "media de novillo", "media ternera"
  /\bmedias?\s+(de\s+)?(vaca|novillo|novillito|vaquillona|ternera|ternero)\b/,
  // "bajamos una media", "llegó la media", "entraron dos medias"
  /\b(una|la|otra|dos|tres|cuatro|unas|las)\s+medias?\b/,
];

// "media docena de huevos" y "media hora" NO son medias reses. La lista es
// corta a propósito: si aparece un falso positivo nuevo, se agrega acá.
const EXCLUSIONES = /\bmedias?\s+(docena|hora|horas|tarde|mañana|manana|kilo|kilos|pila|mano)\b/;

/** ¿Las palabras "media res" (o equivalentes) están en el mensaje? */
export function mencionaMediaRes(texto: string): boolean {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (EXCLUSIONES.test(t)) return false;
  return PATRONES.some((p) => p.test(t));
}

export async function interpretarMediaRes(texto: string): Promise<ResultadoMediaResVoz> {
  // La compuerta manda. Si el mensaje no nombra una media res, no se gasta una
  // llamada al modelo y el mensaje sigue al flujo de stock de siempre.
  if (!mencionaMediaRes(texto)) return { tipo: "no_es_media_res" };

  let respuesta;
  try {
    respuesta = await getClient().messages.create({
      model: modeloMediaRes(),
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: "user", content: texto }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "tool", name: NOMBRE_HERRAMIENTA },
    });
  } catch (err) {
    // Si el modelo falla, el mensaje NO se pierde: sigue al flujo de stock.
    console.error("Error interpretando si es una media res", err);
    return { tipo: "no_es_media_res" };
  }

  const bloque = respuesta.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  // Llegar acá significa que el texto SÍ nombra una media res. Si el modelo no
  // contestó o dijo que no, no se descarta el mensaje: se pregunta el peso. La
  // compuerta ya demostró de qué se está hablando; lo único que puede faltar es
  // el número.
  if (!bloque) return { tipo: "falta_peso", pregunta: "¿Cuánto pesó la media res?" };

  const resultado = validar(bloque.input);
  if (resultado.tipo === "no_es_media_res") {
    return { tipo: "falta_peso", pregunta: "¿Cuánto pesó la media res?" };
  }
  return resultado;
}

function validar(valor: unknown): ResultadoMediaResVoz {
  if (typeof valor !== "object" || valor === null) return { tipo: "no_es_media_res" };
  const dato = valor as Record<string, unknown>;

  if (dato.tipo === "falta_peso") {
    const pregunta =
      typeof dato.pregunta === "string" && dato.pregunta.trim()
        ? dato.pregunta.trim()
        : "¿Cuánto pesó la media res?";
    return { tipo: "falta_peso", pregunta };
  }

  if (dato.tipo !== "media_res") return { tipo: "no_es_media_res" };

  const peso = typeof dato.peso_kg === "number" ? dato.peso_kg : NaN;

  // El rango no es decorativo: es la última barrera antes de crear 28 piezas.
  // Una media res de 8 kg o de 400 kg no existe, así que si el número cayó
  // afuera es que se entendió mal el audio — y preguntar es gratis comparado
  // con cargarle a la carnicería un stock inventado.
  if (!Number.isFinite(peso) || peso < 40 || peso > 250) {
    return {
      tipo: "falta_peso",
      pregunta: Number.isFinite(peso)
        ? `Entendí ${peso} kg y no me cierra para una media res. ¿Cuánto pesó?`
        : "¿Cuánto pesó la media res?",
    };
  }

  const CATEGORIAS = ["novillo", "novillito", "vaquillona", "vaca", "ternera"] as const;
  const categoria =
    typeof dato.categoria === "string" &&
    (CATEGORIAS as readonly string[]).includes(dato.categoria)
      ? (dato.categoria as CategoriaAnimal)
      : null;

  const cantidadCruda = typeof dato.cantidad === "number" ? Math.floor(dato.cantidad) : 1;
  const cantidad = Number.isFinite(cantidadCruda) && cantidadCruda >= 1 && cantidadCruda <= 10
    ? cantidadCruda
    : 1;

  const proveedor =
    typeof dato.proveedor === "string" && dato.proveedor.trim() ? dato.proveedor.trim() : null;

  return { tipo: "media_res", pesoKg: peso, categoria, proveedor, cantidad };
}
