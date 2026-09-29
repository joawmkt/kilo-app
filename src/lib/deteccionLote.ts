// ============================================================
// La compuerta de texto: ¿de qué especie habla este mensaje?
// ============================================================
//
// Está en un archivo aparte, SIN NINGÚN IMPORT DE CÓDIGO, por dos motivos:
//
// 1. Es la única pieza del detector que no necesita al modelo — las palabras
//    están ahí o no están — y separarla deja a la vista que hay UN SOLO lugar
//    en todo el código donde se decide la especie.
// 2. Sin dependencias se puede probar sola, que es justo lo que hace falta:
//    el orden de evaluación de acá es lo que impide que una media res de cerdo
//    entre como vacuna.
//
// ------------------------------------------------------------
// Qué cambió el 21/09/2026, y por qué
// ------------------------------------------------------------
//
// Antes la especie salía de patrones RÍGIDOS: "media res de cerdo" era cerdo,
// pero "dos medias res MÁS de cerdo" no, porque la palabra "más" rompía el
// patrón — y entraba como vacuna, explotada con la tabla de novillo. Una
// palabra de relleno no puede cambiar la especie.
//
// Ahora se separan las dos preguntas:
//   1. ¿Esto es un lote? (media res, cajón, "8 pollos")
//   2. ¿De qué especie? -> la palabra de especie que aparezca CERCA (cerdo,
//      chancho, pollo, vaca, novillo...), en cualquier orden.
// Y si no aparece ninguna, `especieExplicita` devuelve null: el flujo sabe
// que el vacuno es una SUPOSICIÓN y puede preguntar en vez de adivinar.

import type { Especie } from "./especies";

// "media docena de huevos" y "media hora" NO son medias reses.
const EXCLUSIONES = /\bmedias?\s+(docena|hora|horas|tarde|manana|kilo|kilos|pila|mano|horma|bolsa)\b/;

// ¿Habla de una media res? (sin decir todavía de qué animal)
const PATRONES_MEDIA_RES = [
  /\bmedias?\s+(res|rez|reses|reces)\b/,
  /\bmedias?\s+(de\s+)?(vaca|novillo|novillito|vaquillona|ternera|ternero|cerdo|chancho|capon)\b/,
  /\b(\d{1,2}|una|la|otra|dos|tres|cuatro|cinco|seis|unas|las)\s+medias?\b(?!\s+(docena|hora|horas|tarde|manana|kilo|kilos|pila|mano|horma|bolsa))/,
];

// El pollo: por cajón, o contado por cabezas ("entraron 8 pollos").
const NUMERO = "(\\d{1,2}|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis)";
const PATRONES_AVIAR = [
  /\bcaj(on|ones|a|as)\b[^.]{0,30}\bpollos?\b/,
  /\bpollos?\b[^.]{0,30}\bcaj(on|ones|a|as)\b/,
  /\bcaj(on|ones|a|as)\s+de\s+\w+\s+cabezas\b/,
  // "8 pollos", "ocho pollos enteros". Bug del 21/09: el carnicero dijo "8
  // pollos" y el bot le preguntó "¿cuántos kilos de pollo entero entraron?".
  // Ocho pollos es un cajón de ocho cabezas, no una carga de kilos.
  new RegExp(`\\b${NUMERO}\\s+pollos\\b`),
];

// El cerdo también se nombra "entero" o contado: "entraron 2 cerdos", "me
// llegó un chancho", "medio cerdo". Bug del 22/09: "habían entrado dos cerdos"
// no se reconocía como lote, caía al flujo de stock genérico, y la IA terminó
// cargando "Pollo entero +2". En la carnicería cada "cerdo" que llega colgado
// es una media res (o el animal entero, que son dos medias).
const PATRONES_CERDO_CONTADO = [
  /\b(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(cerdos?|chanchos?|capones?)\b/,
  /\bmedio\s+(cerdo|chancho|capon)\b/,
  /\b(cerdo|chancho|capon)\s+entero\b/,
];

// "Trocé 3 pollos" o "vendí 2 pollos" NO es un cajón que llegó: es una
// transformación o una venta. Eso lo resuelve el flujo de stock.
const NO_ES_LLEGADA_DE_POLLO = /\b(troz|troc|trozo|trocé|vend|saqu|us[eé]|pic[aoé]|cort[eé]|desos)/;

// Las palabras de especie, dichas en cualquier lado del mensaje.
const PALABRAS_PORCINO = /\b(cerdo|cerdos|chancho|chanchos|porcin[oa]s?|capon|capones|lechon)\b/;
const PALABRAS_AVIAR = /\b(pollo|pollos|aviar|gallina)\b/;
const PALABRAS_VACUNO = /\b(vaca|vacas|vacun[oa]s?|novillo|novillos|novillito|vaquillona|ternera|ternero|vacuna)\b/;

function normalizar(texto: string): string {
  return canonizarLote(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

// ------------------------------------------------------------
// Errores de tipeo y formas de decir "media res" (29/09/2026)
// ------------------------------------------------------------
//
// Bug del 28/09: "me entraron 3 mediaree", "3 mediarres" y "3 media rre" no se
// reconocieron como medias reses. El detector buscaba "media res" bien
// escrito, y el carnicero escribe apurado, con los dedos fríos y el corrector
// del celular en contra. Resultado: "No relacioné... ¿podés decirlo de otra
// forma?", que es exactamente lo que no puede pasar.
//
// En vez de agregar cada error a mano (nunca se termina), se reconoce la
// FORMA: "medi" + a/o + (s) + (espacio o nada) + r + e... con letras repetidas
// o no. Todas esas variantes se reescriben como "media res" antes de detectar
// nada, así el resto del código ve siempre la misma palabra.
//
//   mediarres, mediares, mediaree, mediarez, media rre, media rez, medias rreses,
//   1/2 res, media ress  ->  "media res" / "medias reses"
const MEDIA_RES_TORCIDA = /\b(1\/2|medi[ao](s?))\s*r+e+(?:[szc]+e*[sz]*)?\b/gi;

/**
 * Reescribe las formas torcidas de "media res" a la forma de siempre. Es
 * pública porque el intérprete de lotes también la usa antes de mandarle el
 * texto al modelo.
 */
export function canonizarLote(texto: string): string {
  return texto.replace(MEDIA_RES_TORCIDA, (_todo, _prefijo, plural) => (plural ? "medias reses" : "media res"));
}

function hablaDePollos(t: string): boolean {
  if (!PATRONES_AVIAR.some((p) => p.test(t))) return false;
  // El cajón siempre es una llegada. El "8 pollos" suelto solo si no hay un
  // verbo que lo convierta en otra cosa.
  const esCajon = /\bcaj(on|ones|a|as)\b/.test(t);
  return esCajon || !NO_ES_LLEGADA_DE_POLLO.test(t);
}

/**
 * La especie que el carnicero NOMBRÓ, o null si no nombró ninguna.
 *
 * Es distinta de `detectarEspecieDeLote`: esta no supone nada. Sirve para
 * saber si el vacuno de una "media res" a secas es un dato o una suposición,
 * y para entender una corrección suelta ("de cerdo", "es chancho").
 */
export function especieExplicita(texto: string): Especie | null {
  const t = normalizar(texto);
  const porcino = PALABRAS_PORCINO.test(t);
  const aviar = PALABRAS_AVIAR.test(t);
  const vacuno = PALABRAS_VACUNO.test(t);
  // Dos especies nombradas a la vez: no se elige ninguna. Que pregunte.
  if (Number(porcino) + Number(aviar) + Number(vacuno) !== 1) return null;
  if (porcino) return "porcino";
  if (aviar) return "aviar";
  return "vacuno";
}

/**
 * ¿De qué especie habla este mensaje? `null` si no habla de ningún lote.
 *
 * Si es una media res y no se nombró el animal, devuelve "vacuno" (es lo más
 * común), pero quien llama puede saber que fue una suposición mirando
 * `especieExplicita`.
 */
export function detectarEspecieDeLote(texto: string): Especie | null {
  const t = normalizar(texto);

  if (hablaDePollos(t)) return "aviar";
  if (PATRONES_CERDO_CONTADO.some((p) => p.test(t)) && !NO_ES_LLEGADA_DE_POLLO.test(t)) return "porcino";
  if (EXCLUSIONES.test(t) && !PATRONES_MEDIA_RES[0].test(t)) return null;
  if (!PATRONES_MEDIA_RES.some((p) => p.test(t))) return null;

  const nombrada = especieExplicita(t);
  if (nombrada === "porcino") return "porcino";
  return "vacuno";
}

/** ¿El mensaje anuncia la llegada de un lote de cualquier especie? */
export function mencionaLote(texto: string): boolean {
  return detectarEspecieDeLote(texto) !== null;
}

/** ¿El mensaje trae un verbo de llegada? ("llegó", "me entraron", "bajaron") */
export function anunciaLlegada(texto: string): boolean {
  return /\b(llego|llegaron|entro|entraron|bajaron|bajo|trajeron|trajo|vino|vinieron|recibi|me\s+dejaron)\b/.test(
    normalizar(texto)
  );
}

// ------------------------------------------------------------
// Pesos dichos como lista: "51 y 46", "51, 46", "104,6"
// ------------------------------------------------------------
//
// Patrón 3 del manual: cuando la respuesta es solo números, leerlos no
// necesita un modelo. El bug del 21/09 fue justo este: "51 y 46" (dos medias
// reses) se convirtió en UNA media res de 51,46 kg.
//
// La trampa es la coma: "104,6" es un decimal y "51, 46" son dos pesos. La
// regla: coma pegada a dígitos (sin espacio) = decimal; "y", espacio o coma
// con espacio = separador.

/**
 * Los pesos de una respuesta que es SOLO números, o null si trae cualquier
 * otra cosa (y entonces la lee el modelo).
 */
export function leerListaDePesos(texto: string): number[] | null {
  const t = normalizar(texto)
    // Palabras que acompañan a los pesos sin cambiar nada: "LAS MEDIA RES PESAN
    // 100 102 y 89 KILOS" es una lista de pesos igual que "100 102 y 89".
    .replace(
      /\b(kg|kgs|kilos?|k|y|e|la|las|una|unas|otra|de|el|primera|segunda|tercera|cada|pesaron|peso|pesan|pesa|pesaba|pesaban|son|eran|fueron|media|medias|res|reses)\b/g,
      " "
    )
    .replace(/[;/]/g, " ")
    .trim();

  if (!t || /[a-z]/.test(t)) return null;

  const numeros: number[] = [];
  for (const crudo of t.split(/\s+|,\s+/).filter(Boolean)) {
    const limpio = crudo.replace(/,$/, "");
    if (!/^\d+([.,]\d+)?$/.test(limpio)) return null;
    let n = Number(limpio.replace(",", "."));
    // "49500" son gramos dichos de corrido: 49,5 kg.
    if (n >= 1000 && Number.isInteger(n)) n = n / 1000;
    if (!Number.isFinite(n) || n <= 0) return null;
    numeros.push(Math.round(n * 1000) / 1000);
  }

  return numeros.length > 0 ? numeros : null;
}
