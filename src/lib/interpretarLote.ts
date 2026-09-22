import Anthropic from "@anthropic-ai/sdk";
import { modeloMediaRes } from "./modelos";
import { descriptor, type Especie } from "./especies";

// ============================================================
// "Llegó una media res de ciento cuatro kilos seiscientos"
// "Llegó una media res de cerdo de cuarenta y dos"
// "Llegó un cajón de pollo de diez"
// ============================================================
//
// UN SOLO DETECTOR QUE DEVUELVE LA ESPECIE. No tres.
//
// Esto no es prolijidad: es el bug que se venía venir. Si hubiera un regex para
// media res y otro para cerdo, los dos compiten por la misma frase y "media res
// de cerdo" puede entrar como vacuno y explotarse con la tabla de novillo. Es
// el Patrón 1 del manual de arreglos: dos lugares decidiendo lo mismo y uno
// decidiendo mal. Acá el orden de evaluación es explícito y está testeado por
// construcción: cerdo se pregunta ANTES que vacuno, porque toda media res de
// cerdo también dice "media res".
//
// EL REPARTO DEL TRABAJO, que es el mismo de siempre:
//   - DETECTAR de qué se habla -> texto, determinístico, infalible y gratis.
//   - EXTRAER el dato de "ciento cuatro kilos seiscientos" -> el modelo.
//
// Y OJO CON QUÉ SE PREGUNTA EN CADA ESPECIE, que es lo que más sorprende:
//   - Media res (vacuno y cerdo): el dato es el PESO.
//   - Cajón de pollo: el peso ya se sabe (20 kg, formato cerrado). El dato son
//     las CABEZAS, que es lo que define cuánto pesa cada ave.

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno.");
  client = new Anthropic({ apiKey });
  return client;
}

export type ResultadoLoteVoz =
  | {
      tipo: "lote";
      especie: Especie;
      pesoKg: number;
      /**
       * Un peso por pieza cuando entraron varias de DISTINTO peso ("una de 51
       * y la otra de 46"). Si viene, manda sobre pesoKg × cantidad.
       */
      pesosKg: number[] | null;
      /** Algo que el sistema decidió y el carnicero tiene que ver antes de confirmar. */
      nota?: string;
      /** Cabezas del cajón. null en las especies que entran por peso. */
      unidades: number | null;
      categoria: string | null;
      proveedor: string | null;
      cantidad: number;
    }
  | { tipo: "falta_dato"; especie: Especie; falta: "peso" | "cabezas"; pregunta: string; cantidad: number }
  | { tipo: "no_es_lote" };

// ============================================================
// La compuerta
// ============================================================
//
// Corre ANTES del modelo y es lo que hace confiable al resto. Un mensaje
// perfectamente claro no puede perderse porque el modelo dude: las palabras
// están ahí o no están. De paso ahorra una llamada al modelo en CADA mensaje
// del carnicero que no tenga nada que ver, que es la enorme mayoría.

export { detectarEspecieDeLote, mencionaLote, especieExplicita } from "./deteccionLote";
import { detectarEspecieDeLote } from "./deteccionLote";

// ============================================================
// El modelo: saca el número
// ============================================================

const NOMBRE_HERRAMIENTA = "registrar_lote";

const TOOL_SCHEMA: Anthropic.Tool = {
  name: NOMBRE_HERRAMIENTA,
  description: "Registra la mercadería que avisa el carnicero, y con qué peso o cuántas cabezas.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["lote", "falta_dato", "no_es_lote"],
        description:
          "'lote' si avisa que entró mercadería Y dice el dato que hace falta. " +
          "'falta_dato' si claramente habla de eso pero NO dice el número. " +
          "'no_es_lote' para cualquier otra cosa. Ante la duda, 'falta_dato'.",
      },
      peso_kg: {
        type: "number",
        description:
          "El peso de UNA pieza o UN cajón, en kilos. Ojo con la forma de hablar: " +
          "'ciento cuatro kilos seiscientos' son 104,6 kg (los gramos van después de " +
          "los kilos). 'cien y medio' son 100,5. Si dice dos medias reses de 104, poné 104, no 208.",
      },
      pesos_kg: {
        type: "array",
        items: { type: "number" },
        description:
          "Solo si entraron VARIAS piezas de DISTINTO peso: un peso por pieza. 'dos medias, una de 51 y la " +
          "otra de 46' -> [51, 46]. OJO: '51 y 46' son DOS pesos, nunca 51,46.",
      },
      cabezas: {
        type: "number",
        description:
          "Cuántas unidades trae el cajón de pollo (6 a 12). 'un cajón de diez' son " +
          "10 cabezas, NO 10 kilos: el cajón pesa siempre lo mismo y lo que cambia es " +
          "el tamaño del ave.",
      },
      cantidad: {
        type: "number",
        description: "Cuántas piezas o cajones del MISMO tamaño entraron. Si no lo aclara, 1.",
      },
      categoria: {
        type: "string",
        description:
          "Solo si lo dice explícitamente: novillo, novillito, vaquillona, vaca, ternera " +
          "(vacuno) o capon (cerdo). Si no lo dice, dejar afuera este campo.",
      },
      proveedor: { type: "string", description: "El frigorífico o proveedor, solo si lo nombra." },
      pregunta: { type: "string", description: "Solo si tipo=falta_dato. La pregunta corta." },
    },
    required: ["tipo"],
  },
};

function systemDe(especie: Especie): string {
  const comun = `Sos el asistente de una carnicería argentina.

CÓMO SE DICEN LOS NÚMEROS ACÁ
"ciento cuatro kilos seiscientos" = 104,6 kg (lo de después son los gramos)
"noventa y ocho y medio" = 98,5 kg
"un quintal" = 100 kg

NUNCA inventes un número. Si no lo dijo, es falta_dato.
NUNCA supongas la categoría del animal. Si no la dijo, dejá el campo afuera.`;

  if (especie === "aviar") {
    return `${comun}

Tu ÚNICO trabajo acá es sacar CUÁNTAS CABEZAS trae un cajón de pollo.

EL CAJÓN DE POLLO ES UN FORMATO CERRADO: pesa siempre 20 kg, y lo que se elige
es cuántos pollos entran en esos 20 kg (de 6 a 12). Entonces el número que dice
el carnicero casi siempre son CABEZAS, no kilos.

  "llegó un cajón de pollo de diez" -> cabezas: 10
  "bajaron dos cajones de ocho" -> cabezas: 8, cantidad: 2
  "entró un cajón de pollo" -> falta_dato, pregunta por las cabezas
  "cajón de pollo de 12 cabezas" -> cabezas: 12
  "entraron 8 pollos" / "8 pollos" -> cabezas: 8 (un cajón de 8)

Si dice explícitamente los KILOS del cajón ("un cajón de 20 kilos de diez
cabezas"), poné los dos: peso_kg 20 y cabezas 10.`;
  }

  if (especie === "porcino") {
    return `${comun}

Tu ÚNICO trabajo acá es sacar el PESO de una media res DE CERDO.

Una media res de cerdo pesa mucho menos que una vacuna: entre 20 y 70 kg
(el promedio argentino está en unos 42-47 kg). El cerdo ENTERO pesa el doble
(80 a 140 kg): poné ese peso tal cual, el sistema lo parte. Si el número es de
más de 140, es casi seguro un error de transcripción: preguntá.

  "llegó una media res de cerdo de cuarenta y dos" -> peso_kg: 42
  "bajaron dos medias de chancho de 40" -> peso_kg: 40, cantidad: 2
  "me entraron dos medias de cerdo, una de 51 y la otra de 46" -> pesos_kg: [51, 46], cantidad: 2
  "entraron dos medias de cerdo" -> falta_dato, cantidad: 2, pregunta "¿Cuánto pesó cada una?"
  "entró media res de cerdo" -> falta_dato, pregunta por el peso
  "entraron 2 cerdos, uno de 48 y otro de 52" -> pesos_kg: [48, 52] (el carnicero le dice "cerdo" a cada media)
  "entraron dos cerdos" -> falta_dato, cantidad: 2, pregunta "¿Cuánto pesó cada uno?"
  "entró un cerdo entero de 96" -> peso_kg: 96 (el sistema lo parte en dos medias)`;
  }

  return `${comun}

Tu ÚNICO trabajo acá es sacar el PESO de una media res VACUNA.
Pesa entre 40 y 250 kg.

  "llegó una media res de ciento cuatro kilos seiscientos" -> peso_kg: 104.6
  "bajaron dos medias de noventa y ocho" -> peso_kg: 98, cantidad: 2
  "entraron dos medias, una de 102 y otra de 98" -> pesos_kg: [102, 98], cantidad: 2
  "entró media res de novillo, 112 kilos, del frigorífico San Jorge"
     -> peso_kg: 112, categoria: "novillo", proveedor: "San Jorge"
  "llegó la media res" -> falta_dato, pregunta por el peso`;
}

/**
 * Interpreta el mensaje como la llegada de un lote.
 *
 * `especieForzada` se usa cuando el carnicero ya está contestando una pregunta
 * nuestra ("¿cuántas cabezas?") y el texto suelto ya no nombra la especie.
 */
export async function interpretarLote(
  texto: string,
  especieForzada?: Especie
): Promise<ResultadoLoteVoz> {
  const especie = especieForzada ?? detectarEspecieDeLote(texto);
  if (!especie) return { tipo: "no_es_lote" };

  const desc = descriptor(especie);
  const falta = desc.datoQueSePregunta === "cabezas" ? "cabezas" : "peso";
  const preguntaPorDefecto =
    falta === "cabezas"
      ? "¿De cuántas cabezas es el cajón?"
      : `¿Cuánto pesó la ${desc.etiqueta}?`;

  let respuesta;
  try {
    respuesta = await getClient().messages.create({
      model: modeloMediaRes(),
      max_tokens: 512,
      system: systemDe(especie),
      messages: [{ role: "user", content: texto }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "tool", name: NOMBRE_HERRAMIENTA },
    });
  } catch (err) {
    // Si el modelo falla, el mensaje NO se pierde: sigue al flujo de stock.
    console.error("Error interpretando el lote", err);
    return { tipo: "no_es_lote" };
  }

  const bloque = respuesta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

  // Llegar acá significa que el texto SÍ nombra un lote. Si el modelo no
  // contestó, no se descarta el mensaje: se pregunta el dato que falta. La
  // compuerta ya demostró de qué se está hablando.
  if (!bloque) return { tipo: "falta_dato", especie, falta, pregunta: preguntaPorDefecto, cantidad: 1 };

  return validar(bloque.input, especie, preguntaPorDefecto);
}

function validar(valor: unknown, especie: Especie, preguntaPorDefecto: string): ResultadoLoteVoz {
  const desc = descriptor(especie);
  const falta = desc.datoQueSePregunta === "cabezas" ? "cabezas" : "peso";
  const dato = (typeof valor === "object" && valor !== null ? valor : {}) as Record<string, unknown>;
  const cantidadDicha = typeof dato.cantidad === "number" ? Math.floor(dato.cantidad) : 1;
  const cantidadFalta = Number.isFinite(cantidadDicha) && cantidadDicha >= 1 && cantidadDicha <= 10 ? cantidadDicha : 1;
  const fallar = (pregunta?: string): ResultadoLoteVoz => ({
    tipo: "falta_dato",
    especie,
    falta,
    cantidad: cantidadFalta,
    pregunta:
      pregunta ??
      (cantidadFalta > 1 && falta === "peso" ? "¿Cuánto pesó cada una?" : preguntaPorDefecto),
  });

  if (typeof valor !== "object" || valor === null) return fallar();

  if (dato.tipo === "falta_dato" || dato.tipo === "no_es_lote") {
    const pregunta =
      typeof dato.pregunta === "string" && dato.pregunta.trim() ? dato.pregunta.trim() : undefined;
    return fallar(pregunta);
  }

  const cantidadCruda = typeof dato.cantidad === "number" ? Math.floor(dato.cantidad) : 1;
  const cantidad =
    Number.isFinite(cantidadCruda) && cantidadCruda >= 1 && cantidadCruda <= 10 ? cantidadCruda : 1;

  const proveedor =
    typeof dato.proveedor === "string" && dato.proveedor.trim() ? dato.proveedor.trim() : null;

  const categoria =
    typeof dato.categoria === "string" && desc.categorias.includes(dato.categoria)
      ? dato.categoria
      : null;

  // ------------------------------------------------------------
  // Pollo: lo que se valida son las cabezas
  // ------------------------------------------------------------
  if (desc.unidadEntrada === "cajon") {
    const cabezas = typeof dato.cabezas === "number" ? Math.floor(dato.cabezas) : NaN;
    const [minU, maxU] = desc.rangoUnidades ?? [1, 99];

    if (!Number.isFinite(cabezas) || cabezas < minU || cabezas > maxU) {
      return fallar(
        Number.isFinite(cabezas)
          ? `Entendí ${cabezas} cabezas y no me cierra para un cajón. ¿De cuántas es?`
          : undefined
      );
    }

    // El peso solo se toma si lo dijo; si no, lo pone el formato de la
    // carnicería. Nunca se inventa acá.
    const pesoDicho = typeof dato.peso_kg === "number" ? dato.peso_kg : NaN;
    const [minP, maxP] = desc.rangoPesoKg;
    const peso =
      Number.isFinite(pesoDicho) && pesoDicho >= minP && pesoDicho <= maxP
        ? pesoDicho
        : (desc.pesoFijoKgPorDefecto ?? 0);

    return { tipo: "lote", especie, pesoKg: peso, pesosKg: null, unidades: cabezas, categoria, proveedor, cantidad };
  }

  // ------------------------------------------------------------
  // Media res: lo que se valida es el peso
  // ------------------------------------------------------------
  //
  // El rango no es decorativo: es la última barrera antes de crear piezas. Una
  // media res vacuna de 8 kg o de 400 kg no existe, y una de cerdo de 120
  // tampoco. Si el número cayó afuera es que se entendió mal el audio, y
  // preguntar es gratis comparado con cargar stock inventado.
  const [minP, maxP] = desc.rangoPesoKg;

  const crudos = Array.isArray(dato.pesos_kg)
    ? dato.pesos_kg.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : typeof dato.peso_kg === "number" && Number.isFinite(dato.peso_kg)
      ? [dato.peso_kg]
      : [];
  if (crudos.length === 0) return fallar();

  // El cerdo ENTERO (dos medias) se nombra igual que la media: "entró un cerdo
  // de 96". Una media de cerdo de 96 kg no existe, pero un cerdo entero sí: se
  // lo carga como dos medias de la mitad, y se lo dice en el resumen para que
  // el carnicero lo vea antes de confirmar.
  const pesos: number[] = [];
  let partidos = 0;
  for (const p of crudos) {
    if (especie === "porcino" && p > maxP && p <= maxP * 2) {
      const mitad = Math.round((p / 2) * 1000) / 1000;
      pesos.push(mitad, mitad);
      partidos++;
    } else {
      pesos.push(p);
    }
  }

  const fuera = pesos.find((n) => n < minP || n > maxP);
  if (fuera !== undefined) {
    return fallar(
      pesos.length > 1
        ? `Entendí ${fuera} kg y no me cierra para una ${desc.etiqueta}. ¿Cuánto pesó cada una?`
        : `Entendí ${fuera} kg y no me cierra para una ${desc.etiqueta}. ¿Cuánto pesó?`
    );
  }

  const nota =
    partidos > 0
      ? `Lo tomé como ${partidos === 1 ? "un cerdo entero" : `${partidos} cerdos enteros`}: lo cargo como medias de la mitad del peso.`
      : undefined;

  if (pesos.length >= 2) {
    return {
      tipo: "lote",
      especie,
      pesoKg: pesos[0],
      pesosKg: pesos,
      unidades: null,
      categoria,
      proveedor,
      cantidad: pesos.length,
      ...(nota ? { nota } : {}),
    };
  }

  return { tipo: "lote", especie, pesoKg: pesos[0], pesosKg: null, unidades: null, categoria, proveedor, cantidad };
}
