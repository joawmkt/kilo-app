import { normalizarTexto } from "./texto";

// ============================================================
// ¿El mensaje es un "sí", un "no" o un "cambiá algo"? — SIN IA
// ============================================================
//
// Por qué sin IA: son las palabras que están o no están en el mensaje. La IA
// sirve para SACAR datos de una frase ("ciento cuatro kilos seiscientos"), no
// para decidir si "dale" es un sí. Un modelo puede dudar; una lista no.
// (Patrón 3 del manual de arreglos: detectar con texto, extraer con el modelo.)
//
// ------------------------------------------------------------
// El problema que tenía la versión anterior, y cómo se cerró
// ------------------------------------------------------------
//
// Antes esto comparaba el MENSAJE ENTERO contra una lista de frases. Era
// seguro pero frágil: "dale" andaba y "dale no hay problema" no, porque la
// frase completa no estaba en la lista. Y no se podía arreglar agregando
// frases: las combinaciones de un "sí" argentino son infinitas.
//
// Ahora el mensaje se parte en palabras (y en emojis sueltos) y cada palabra
// tiene que ser una de estas cuatro cosas:
//
//   1. una frase de confirmación   ("dale", "de una", "no hay problema")
//   2. una frase de cancelación    ("no", "ni ahí", "olvidate")
//   3. una frase de modificación   ("cambialo", "está mal")
//   4. relleno sin contenido       ("che", "gracias", "porfa", 🙌)
//
// **Si sobra UNA sola palabra que no sea ninguna de esas cuatro cosas,
// devolvemos null y el mensaje se manda a la IA con el contexto.** Esa regla
// es la que hace que esto sea seguro, y es la que hay que respetar si algún
// día se agrega vocabulario nuevo:
//
//   "no"              -> no + nada más                     -> CANCELAR
//   "no gracias"      -> no + relleno                      -> CANCELAR
//   "no, eran 12 kg"  -> "eran", "12", "kg" no son nada    -> null -> la IA
//                        (y así "no, eran 12 kilos" sigue siendo una
//                         CORRECCIÓN de stock y no una cancelación, que es
//                         justo lo que pide el punto 12 de la especificación)
//
// Las frases se prueban de la más larga a la más corta. Eso es lo que hace que
// "no hay problema" gane contra "no": la frase de tres palabras matchea antes
// que la de una. Sin ese orden, todos los "sí" que empiezan con "no" (que en
// Argentina son un montón: "no hay drama", "no hay problema", "no pasa nada")
// se leerían al revés.
//
// Si el mensaje tiene señales de las dos clases a la vez ("dale, pero no"),
// tampoco adivinamos: null y que pregunte la IA.
//
// `normalizarTexto` ya saca acentos y pasa a minúsculas, así que estas listas
// van sin tildes ("si" cubre también "sí", "ni ahi" cubre "ni ahí").

const FRASES_CONFIRMACION = [
  // el núcleo de la especificación (punto 12)
  "si", "sisi", "si si", "si si si", "sip", "sipi", "seh", "sep", "dale", "confirmo",
  "confirmar", "confirmado", "confirmalo", "lo confirmo", "esta bien", "ta bien",
  // acuerdo
  "ok", "oka", "okey", "okay", "oki", "okis", "de acuerdo", "acepto", "aceptado",
  "correcto", "exacto", "exactamente", "afirmativo", "tal cual", "asi es", "eso es",
  "eso mismo", "eso", "obvio", "obviamente", "claro", "claro que si", "por supuesto",
  "de una", "de una piola", "va", "vamos", "vale", "sale", "andale", "hecho", "ya esta",
  "listo", "dale listo", "dale va", "si dale", "dale si", "si claro", "claro si",
  "si por favor", "si porfa", "porfa si",
  // "está bien así" y familia
  "esta bien asi", "asi esta bien", "asi va", "asi si", "asi nomas", "asi nomas es",
  "esta perfecto", "perfecto", "barbaro", "buenisimo", "genial", "excelente",
  "esta joya", "joya", "todo bien", "todo ok", "todo okay", "todo piola", "piola",
  "esta piola", "bien", "me gusta",
  // "me sirve" y familia
  "me sirve", "sirve", "me viene bien", "me va bien", "va bien", "me parece bien",
  "esta bueno", "buenisimo dale",
  // ⚠️ los "sí" que empiezan con "no" — por eso las frases se prueban de la más
  // larga a la más corta (si no, el "no" suelto se los comería a todos)
  "no hay problema", "no hay problemas", "no hay ningun problema", "no hay drama",
  "no hay lio", "no hay ningun drama", "ningun problema", "ningun drama",
  "sin problema", "sin problemas", "sin drama", "no pasa nada", "no hay tema",
  "no hay ningun tema", "sin ningun problema",
  // emojis
  "👍", "👌", "✅", "✔", "☑", "🆗", "💯", "🤙", "👏", "🫡", "🤝",
];

const FRASES_CANCELACION = [
  "no", "nop", "nope", "nel", "nah", "naa", "na", "negativo", "no no", "nono",
  "cancelar", "cancela", "cancelo", "cancelalo", "cancelala", "cancelemos",
  "anular", "anula", "anulo", "anulalo",
  "olvidalo", "olvidate", "olvidalo todo", "dejalo", "dejala", "dejalo asi",
  "dejemoslo", "dejalo ahi", "deja", "deja asi",
  "no importa", "no era nada", "no quiero", "no lo quiero", "no lo cargues",
  "no va", "no va mas", "ya no", "ya no va", "asi no", "no asi",
  "borralo", "borrar", "borra", "sacalo", "saca", "sacalo todo", "sacame todo",
  "eliminar", "elimina", "nada",
  "no gracias", "paso", "mejor no", "mejor dejalo", "ni ahi", "para nada",
  "no me sirve", "no sirve", "no me interesa", "no puedo", "no llego",
  "no me viene bien", "no me va",
  "❌", "👎", "🚫", "⛔", "🙅",
];

const FRASES_MODIFICACION = [
  "modificar", "modifico", "modificalo", "corregir", "corrijo", "corregilo",
  "cambiar", "cambio", "cambialo", "cambiala",
  "esta mal", "ta mal", "mal", "error", "hay un error", "me equivoque",
  "no es asi", "no era asi", "no esta bien", "no esta bien asi", "no es eso",
  "no era eso", "epa no", "che no", "espera que no", "pera no", "ojo", "ojo que no",
];

// Palabras que acompañan pero no deciden nada. Que estén acá es lo que permite
// que "dale gracias loco 🙌" se lea igual que "dale".
//
// ⚠️ Criterio para sumar palabras acá: solo cortesía y muletillas SIN
// contenido. Si una palabra puede cambiar el sentido del mensaje (un número,
// un producto, una hora, un verbo como "quiero" o "eran"), NO va acá — tiene
// que sobrar para que el mensaje se vaya a la IA.
const RELLENO = [
  "che", "bueno", "buen", "ah", "ahh", "eh", "ehh", "mmm", "hmm", "bue", "y",
  "pero", "entonces", "ya", "muy", "mucho", "tan", "todo", "toda", "todos",
  "gracias", "muchas gracias", "mil gracias", "gracia", "por favor", "porfa",
  "porfis", "please", "amigo", "amiga", "loco", "capo", "genio", "maestro",
  "don", "senor", "senora", "jefe", "hola", "buenas", "buen dia", "buenos dias",
  "buenas tardes", "buenas noches", "el", "la", "lo", "los", "las", "un", "una",
  "me", "te", "se",
];

// WhatsApp le pega a los emojis cosas invisibles: el "selector de variación"
// (U+FE0F/U+FE0E), el "zero-width joiner" (U+200D) y los tonos de piel. Sin
// sacarlos, un 👍 mandado desde un celular no matchea el "👍" de la lista
// (bug real del 22/08/2026).
const INVISIBLES = new Set<number>([0xfe0f, 0xfe0e, 0x200d, 0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff]);

/**
 * ¿Este carácter es un emoji/pictograma?
 *
 * Se resuelve por rangos de código y no con \p{Extended_Pictographic} porque
 * el proyecto compila a ES2017 y esa sintaxis necesita ES2018.
 */
function esPictograma(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff) || // la mayoría de los emojis modernos (👍 👌 🙌 🥩)
    (cp >= 0x2600 && cp <= 0x27bf) ||   // símbolos varios (✅ ✔ ❌ ☑ ➕)
    (cp >= 0x2b00 && cp <= 0x2bff) ||   // flechas y formas (⬆ ⭐)
    (cp >= 0x2190 && cp <= 0x21ff) ||   // flechas
    cp === 0x00a9 ||
    cp === 0x00ae ||
    cp === 0x203c ||
    cp === 0x2049 ||
    (cp >= 0x2122 && cp <= 0x2139) ||
    (cp >= 0x24c2 && cp <= 0x24c2) ||
    (cp >= 0x25aa && cp <= 0x25fe)      // ▪ ◼ ▶ ◀
  );
}

/**
 * Parte el texto en palabras, tratando cada emoji como una palabra aparte
 * (así "dale👍" y "👍👍" funcionan igual que "dale 👍").
 */
function tokenizar(texto: string): string[] {
  const limpio = normalizarTexto(texto);
  const tokens: string[] = [];
  let palabra = "";

  const cerrarPalabra = () => {
    if (palabra) {
      tokens.push(palabra);
      palabra = "";
    }
  };

  for (const caracter of Array.from(limpio)) {
    const cp = caracter.codePointAt(0);
    if (cp === undefined || INVISIBLES.has(cp)) continue;

    if (esPictograma(cp)) {
      cerrarPalabra();
      tokens.push(caracter);
      continue;
    }

    // Letras y números forman palabras; cualquier otra cosa (espacios, comas,
    // signos de pregunta) las corta.
    if (/[a-z0-9]/.test(caracter)) palabra += caracter;
    else cerrarPalabra();
  }

  cerrarPalabra();
  return tokens;
}

type Clase = "confirmar" | "cancelar" | "modificar" | "relleno";

type FraseCompilada = { tokens: string[]; clase: Clase };

// Se compila una sola vez al cargar el módulo. Orden: primero las frases con
// MÁS palabras, así "no hay problema" se prueba antes que "no".
const FRASES: FraseCompilada[] = [
  ...FRASES_CONFIRMACION.map((f) => ({ tokens: tokenizar(f), clase: "confirmar" as const })),
  ...FRASES_CANCELACION.map((f) => ({ tokens: tokenizar(f), clase: "cancelar" as const })),
  ...FRASES_MODIFICACION.map((f) => ({ tokens: tokenizar(f), clase: "modificar" as const })),
  ...RELLENO.map((f) => ({ tokens: tokenizar(f), clase: "relleno" as const })),
]
  .filter((f) => f.tokens.length > 0)
  .sort((a, b) => b.tokens.length - a.tokens.length);

const LARGO_MAXIMO_FRASE = FRASES.length > 0 ? FRASES[0].tokens.length : 1;

// Un mensaje largo casi seguro trae contenido real aunque todas sus palabras
// nos suenen. Cortamos por las dudas: es más barato mandarlo a la IA.
const MAXIMO_PALABRAS = 10;

/** Busca la frase MÁS LARGA que arranque en la posición `i`. */
function fraseQueEmpiezaEn(tokens: string[], i: number): FraseCompilada | null {
  for (const frase of FRASES) {
    if (frase.tokens.length > LARGO_MAXIMO_FRASE) continue;
    if (i + frase.tokens.length > tokens.length) continue;
    let coincide = true;
    for (let j = 0; j < frase.tokens.length; j++) {
      if (tokens[i + j] !== frase.tokens[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return frase;
  }
  return null;
}

export type IntencionExplicita = "confirmar" | "cancelar" | "modificar" | null;

/**
 * Clasifica una respuesta como confirmación, cancelación o pedido de cambio,
 * o `null` si el mensaje trae algo más que eso.
 *
 * `null` NO es un fallo: significa "acá hay contenido, esto lo tiene que
 * mirar la IA con el contexto de lo que estaba pendiente". Es el caso de
 * "no, eran 12 kilos" (una corrección) o "sí, y sumale 2 de chorizo".
 */
export function clasificarRespuesta(texto: string): IntencionExplicita {
  const tokens = tokenizar(texto);
  if (tokens.length === 0 || tokens.length > MAXIMO_PALABRAS) return null;

  let confirmar = 0;
  let cancelar = 0;
  let modificar = 0;

  let i = 0;
  while (i < tokens.length) {
    const frase = fraseQueEmpiezaEn(tokens, i);

    if (!frase) {
      // Un emoji que no está en ninguna lista (🙌, 🥩, 😂) acompaña pero no
      // decide: se ignora en vez de tumbar toda la clasificación.
      const cp = tokens[i].codePointAt(0);
      if (tokens[i].length <= 2 && cp !== undefined && esPictograma(cp)) {
        i += 1;
        continue;
      }
      // Cualquier otra palabra desconocida = hay contenido real. A la IA.
      return null;
    }

    if (frase.clase === "confirmar") confirmar++;
    else if (frase.clase === "cancelar") cancelar++;
    else if (frase.clase === "modificar") modificar++;

    i += frase.tokens.length;
  }

  // Señales cruzadas ("dale pero no") — no se adivina.
  if (confirmar > 0 && (cancelar > 0 || modificar > 0)) return null;

  // Modificar le gana a cancelar ("no, cambialo"): pedir un cambio es más
  // específico que dar de baja, y equivocarse hacia "modificar" solo cuesta
  // una repregunta, mientras que equivocarse hacia "cancelar" borra el pedido.
  if (modificar > 0) return "modificar";
  if (cancelar > 0) return "cancelar";
  if (confirmar > 0) return "confirmar";
  return null;
}

/**
 * Normalización compartida para comparar respuestas cortas contra una lista
 * de palabras exactas. La usa `confirmacionPedido.ts` — vive acá para que
 * haya UN solo lugar que sepa limpiar emojis y puntuación (Patrón 1 del
 * manual: si dos lugares contestan la misma pregunta, uno la va a contestar
 * mal).
 */
export function normalizarParaComparar(texto: string): string {
  return tokenizar(texto).join(" ");
}
