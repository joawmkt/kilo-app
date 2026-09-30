import { detectarEspecieDeLote, especieExplicita } from "./deteccionLote";
import { hablaDeTrozado } from "./lecturaTrozado";
import { clasificarRespuesta } from "./confirmacion";

// ============================================================
// Partir un mensaje del carnicero en instrucciones (29/09/2026)
// ============================================================
//
// Pedido del fundador: "le cuesta mucho entender cuando debe cargar varias
// cosas juntas o recibe varias instrucciones al mismo tiempo".
//
// El carnicero no manda un mensaje por cosa. Manda UN audio mientras acomoda
// la cámara: "llegó una media res de 104, un cajón de pollo de 8 y piqué 5
// kilos de nalga". Para el bot son tres trabajos DISTINTOS, cada uno con su
// propio flujo y su propia confirmación:
//   - la media res se reparte en cortes (flujoLotes),
//   - el cajón se reparte en pollos (flujoLotes, otra especie),
//   - la picada es un movimiento de stock (flujoStock).
// Antes el primer flujo que reconocía algo se quedaba con TODO el mensaje, y lo
// que no era suyo se perdía o se malinterpretaba.
//
// Acá solo se decide DÓNDE CORTAR. Cada pedazo después va por el camino de
// siempre. La regla de oro es cortar lo MENOS posible:
//
//   - Solo se corta entre cosas de distinto TIPO (media res vacuna / media res
//     de cerdo / cajón de pollo / trozado / stock). Varias cosas del mismo tipo
//     van juntas, porque ese flujo ya sabe leer varias: "entraron 20 de asado
//     y 8 de vacío" es UNA carga de stock con dos productos, y "3 medias, una
//     de 96, una de 110 y una de 104" es UN lote con tres pesos.
//   - Un pedazo que no dice qué es ("una de 96kg", "y 102") se pega al
//     anterior: es el resto de lo que se venía diciendo.
//   - Si hay una sola clase de cosa, no se corta nada.
//
// No importa la base de datos: recibe una función que dice si un pedazo nombra
// un producto del catálogo, así se puede probar sola.

type Clase = "lote:vacuno" | "lote:porcino" | "lote:aviar" | "trozado" | "stock" | "resto";

// Verbos que abren una instrucción de stock por sí solos.
const VERBO_DE_STOCK =
  /\b(entr(o|aron|a)|lleg(o|aron|ue)|baj(o|aron)|traj(o|eron)|vin(o|ieron)|recibi|pique|pico|picaron|moli|vendi|vendimos|vendio|saque|sacamos|use|usamos|sume|suma|sumale|resta|restale|agrega|agregale|agregue|carga|cargale|cargue|hay|quedan?|quedaron|tengo|pone|ponele|puse|ajusta|tire|tiramos|descarte|descartamos|se vencio|se pudrio|hice|armamos|arme|desose|desoso|filete)\b/;

// Después de un trozado, lo que viene suele ser SU resultado ("trocé 3 pollos
// y saqué 2,700 de pechuga"): eso no es otra instrucción.
const CONTINUA_TROZADO = /\b(saque|sali(o|eron)|dio|dieron|quedaron|rindi(o|eron)|pesaron|pes(o|aban))\b/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type Pedazo = { desde: number; hasta: number; clase: Clase };

/**
 * Dónde puede empezar una instrucción nueva: fin de oración, punto y coma,
 * salto de línea, coma, o " y " / "después" / "además" / "también".
 */
// La coma pegada a un número ("104,6") es un decimal, no un corte.
const CORTES = /[;!?\n]+|\.(?!\d)\s*|,(?!\d)\s*|\s+(?:y\s+(?:despues|ademas|tambien)|y|e|despues|ademas|tambien|aparte)\s+/gi;

function clasificar(texto: string, anterior: Clase | null, nombraProducto: (t: string) => boolean): Clase {
  const t = normalizar(texto);
  const especieLote = detectarEspecieDeLote(t);
  if (especieLote) return `lote:${especieLote}` as Clase;

  // "...y una de cerdo de 45" después de una media res vacuna: es otra media
  // res, de otro animal.
  // res, de otro animal. Con o sin peso: "entró una media res de cerdo y una
  // de vaca" son DOS medias (bug del 30/09: se cargó la de cerdo y la de vaca
  // se perdió).
  if (anterior?.startsWith("lote:")) {
    const nombrada = especieExplicita(t);
    if (nombrada && nombrada !== "aviar" && `lote:${nombrada}` !== anterior) return `lote:${nombrada}` as Clase;
  }

  if (hablaDeTrozado(t)) return "trozado";
  if (anterior === "trozado" && CONTINUA_TROZADO.test(t)) return "resto";
  if (VERBO_DE_STOCK.test(t)) return "stock";
  // "20 kg de asado" suelto, después de una media res: nombra un producto,
  // entonces es una carga de stock y no un peso más de la media res. SOLO
  // después de un lote: "nalga y costilla" (contestando de qué hizo la
  // picada) es UNA respuesta con dos productos, no dos instrucciones (bug
  // del 30/09: se partió y después preguntó "¿cuántos kilos de costilla?").
  if (anterior?.startsWith("lote:") && nombraProducto(t)) return "stock";
  return "resto";
}

/**
 * Parte el mensaje en instrucciones. Devuelve UN solo elemento (el texto
 * entero) si no hay nada que separar, que es lo más común.
 */
export function partirInstrucciones(texto: string, nombraProducto: (t: string) => boolean = () => false): string[] {
  const limpio = texto.trim();
  if (!limpio) return [];

  // 1. Pedazos crudos, con su posición en el texto original.
  const crudos: { desde: number; hasta: number }[] = [];
  let inicio = 0;
  CORTES.lastIndex = 0;
  let corte: RegExpExecArray | null;
  while ((corte = CORTES.exec(limpio)) !== null) {
    if (corte[0].length === 0) {
      CORTES.lastIndex++;
      continue;
    }
    const fin = corte.index;
    if (fin > inicio) crudos.push({ desde: inicio, hasta: fin });
    inicio = fin + corte[0].length;
  }
  if (inicio < limpio.length) crudos.push({ desde: inicio, hasta: limpio.length });
  if (crudos.length <= 1) return [limpio];

  // 2. Clasificar y pegar: un "resto" se pega al anterior, y dos seguidos de la
  //    misma clase también.
  const pedazos: Pedazo[] = [];
  for (const crudo of crudos) {
    const anterior = pedazos.length > 0 ? pedazos[pedazos.length - 1] : null;
    const clase = clasificar(limpio.slice(crudo.desde, crudo.hasta), anterior?.clase ?? null, nombraProducto);
    if (anterior && (clase === "resto" || clase === anterior.clase)) {
      anterior.hasta = crudo.hasta;
      continue;
    }
    // Un "resto" al principio (ej. "sí, y llegó un cajón...") queda como su
    // propia instrucción: suele ser la respuesta a lo que estaba pendiente.
    pedazos.push({ ...crudo, clase });
  }

  // 3. Solo se corta si hay DOS o más cosas de verdad distintas. Un pedazo
  //    "resto" al principio cuenta solo si es un sí/no (la respuesta a lo que
  //    estaba pendiente: "sí, y llegó un cajón de pollo de 8").
  const primeroEsRespuesta =
    pedazos[0]?.clase === "resto" && clasificarRespuesta(limpio.slice(pedazos[0].desde, pedazos[0].hasta)) !== null;
  const fuertes = new Set(pedazos.filter((p) => p.clase !== "resto").map((p) => p.clase));
  if (pedazos.length <= 1) return [limpio];
  if (fuertes.size < 2 && !(primeroEsRespuesta && fuertes.size >= 1)) return [limpio];
  // Un "resto" al principio que NO es un sí/no se pega al siguiente.
  if (pedazos[0].clase === "resto" && !primeroEsRespuesta && pedazos.length > 1) {
    pedazos[1].desde = pedazos[0].desde;
    pedazos.shift();
  }

  // 4. Cada instrucción tiene que entenderse SOLA, porque se atiende sola.
  //    "llegó una media res de 104, un cajón de pollo de 8": el cajón no tiene
  //    verbo, y "un cajón de pollo de 8" suelto es ambiguo. Si el mensaje
  //    arrancó con un verbo de llegada, se le presta a los pedazos que no
  //    tienen ninguno ("entró un cajón de pollo de 8").
  const llegada = /\b(entr(o|aron)|lleg(o|aron)|baj(o|aron)|traj(o|eron)|vin(o|ieron)|recibi)\b/.test(
    normalizar(limpio.slice(pedazos[0].desde, pedazos[0].hasta))
  );

  return pedazos
    .map((p, i) => {
      let texto = limpio
        .slice(p.desde, p.hasta)
        .replace(/^[\s,;.]+|[\s,;.]+$/g, "")
        .replace(/^(y|e|ademas|además|tambien|también|despues|después|aparte)\s+/i, "");
      // "una de cerdo de 45" (después de medias de vaca) suelto no dice que es
      // una media res: se lo decimos.
      if ((p.clase === "lote:vacuno" || p.clase === "lote:porcino") && !detectarEspecieDeLote(texto)) {
        texto = `una media res ${texto.replace(/^(una|otra|la)\s+/i, "")}`;
      }
      if (i > 0 && llegada && !VERBO_DE_STOCK.test(normalizar(texto)) && !hablaDeTrozado(texto)) {
        texto = `entró ${texto}`;
      }
      return texto;
    })
    .filter((p) => p.length > 0);
}
