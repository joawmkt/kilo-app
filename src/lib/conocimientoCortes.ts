import type { OcasionConcreta } from "./recomendaciones";

// ============================================================
// Lo que sabe un carnicero de cada corte (01/10/2026)
// ============================================================
//
// Pedido del fundador: "si alguien pregunta si X corte es bueno para X cosa,
// la respuesta debe ser dada con fundamentos. Insertale conocimiento de carne
// y de por qué cada corte es bueno para cada preparación".
//
// Caso real: "¿la aguja es buena para estofado?" → el bot tiró la lista entera
// de la olla. Un carnicero contesta: "Sí, es ideal: tiene tejido conectivo que
// con la cocción lenta se deshace, y queda tierna y jugosa."
//
// Esto es conocimiento de oficio, no datos de una carnicería: por eso vive
// acá, escrito a mano, y NO lo inventa la IA. Cada corte tiene:
//   - `que_es`: de dónde sale y cómo es, en una línea;
//   - `bien`: para qué va bien y POR QUÉ;
//   - `mal`:  para qué no conviene y por qué (para poder decir que no, con
//     fundamento, y ofrecer otra cosa).
// Lo que no está acá, no se afirma: el bot usa la tabla de recomendaciones de
// la carnicería ("en mi lista está para la olla") sin inventar un porqué.
//
// Si un carnicero corrige algo de esto, se corrige ACÁ, una vez, para todos.

export type FichaCorte = {
  que_es: string;
  bien: Partial<Record<OcasionConcreta, string>>;
  mal?: Partial<Record<OcasionConcreta, string>>;
};

// Los porqués que se repiten, escritos una sola vez.
const COLAGENO_LENTO =
  "tiene tejido conectivo (colágeno) que con la cocción lenta se deshace: queda tierna, jugosa y le da cuerpo a la salsa";
const DURA_RAPIDO = "tiene mucho nervio: hecha rápido queda dura, necesita cocción larga";
const MAGRO_SE_SECA = "es muy magro: en una cocción larga se seca y se pone fibroso";
const TIERNO_RAPIDO = "es tierno y magro, se hace en pocos minutos y queda jugoso";
const MARMOLEADO = "tiene grasa entreverada en la carne (marmoleado) que se derrite en la brasa y la mantiene jugosa";

export const FICHAS: Record<string, FichaCorte> = {
  // ---------------- Vacuno · parrilla ----------------
  costilla: {
    que_es: "es el asado de toda la vida: la costilla con su carne, hueso y grasa, en tira o entera",
    bien: {
      parrilla: "el hueso y la grasa le dan sabor y la protegen de secarse en la brasa lenta",
      horno: "al horno, lento y tapado al principio, queda muy tierna",
      olla: "el hueso y la grasa le dan mucho sabor al caldo",
    },
    mal: { plancha: "tiene hueso y grasa: necesita fuego lento, no una plancha", milanesas: "tiene hueso y grasa: no se puede fetear para milanesa" },
  },
  vacio: {
    que_es: "es el corte del costado, entre la costilla y la cadera, con una capa de grasa y fibras largas",
    bien: {
      parrilla: "a fuego lento la grasa queda crocante y adentro queda muy jugoso; es de lo más pedido",
      horno: "al horno, con papel o tapado, queda tiernísimo",
    },
    mal: { plancha: "es grueso y con fibra larga: necesita fuego lento", milanesas: "tiene fibra larga y grasa: no sirve para fetear" },
  },
  matambre: {
    que_es: "es la capa de carne fina que está entre el cuero y la costilla",
    bien: {
      parrilla: "a la parrilla o a la pizza, a fuego lento para que ablande",
      horno: "arrollado o a la pizza al horno queda bárbaro",
      olla: "a la leche, en la cacerola, queda tiernísimo",
    },
    mal: { plancha: "es fibroso: hecho rápido queda duro", milanesas: "es fibroso y fino, no da para milanesa" },
  },
  entrana: {
    que_es: "es el diafragma: fibras marcadas, un poco de grasa y muchísimo sabor",
    bien: {
      parrilla: "se hace rápido a fuego fuerte y queda jugosísima",
      plancha: "a la plancha bien caliente, vuelta y vuelta",
      salteado: "en tiras finas es ideal para fajitas o wok",
    },
    mal: { olla: "es fina y se hace en minutos: en la olla se endurece y pierde la gracia" },
  },
  tapa_de_asado: {
    que_es: "es la carne que cubre la costilla, con una capa de grasa arriba",
    bien: {
      parrilla: "lenta y con la grasa hacia la brasa, queda tierna y sabrosa",
      horno: "al horno, lento, queda muy tierna",
      olla: "a la cacerola, lenta, queda tierna y sabrosa",
    },
  },
  falda: {
    que_es: "es la parte baja de la costilla, con hueso, grasa y carne",
    bien: {
      olla: "el hueso y la grasa le dan cuerpo al caldo; es de las mejores para eso",
      parrilla: "a la parrilla, bien lenta, también se come muy bien",
    },
    mal: { plancha: "tiene hueso y grasa: necesita cocción lenta", milanesas: "tiene hueso: no se puede fetear" },
  },
  colita_de_cuadril: {
    que_es: "es una pieza chica de la parte trasera, tierna, con una capa de grasa",
    bien: {
      horno: "al horno queda tierna y jugosa; es un clásico",
      parrilla: "entera a la parrilla, a fuego medio",
      plancha: "en bifes a la plancha también va",
    },
    mal: { olla: MAGRO_SE_SECA },
  },
  tapa_de_cuadril: {
    que_es: "es la picaña: la parte de arriba del cuadril con su capa de grasa",
    bien: {
      parrilla: "con la grasa hacia la brasa queda espectacular, jugosa y con mucho sabor",
      horno: "al horno, entera, queda muy bien",
      plancha: "en bifes gruesos a la plancha",
    },
  },
  // ---------------- Vacuno · bifes y tiernos ----------------
  bife_ancho: {
    que_es: "es el ojo de bife: del lomo alto, con la grasita en el centro",
    bien: { parrilla: MARMOLEADO, plancha: "a la plancha bien caliente queda jugoso por la grasa" },
    mal: { olla: "es un corte para fuego fuerte y rápido: en la olla se desperdicia", milanesas: "tiene grasa en el centro: no es para milanesa" },
  },
  bife_angosto: {
    que_es: "es el bife de chorizo: del lomo bajo, tierno, con un borde de grasa",
    bien: { parrilla: "tierno y con su borde de grasa: el clásico de la parrilla", plancha: "a la plancha bien caliente, en pocos minutos" },
    mal: { olla: "es para fuego fuerte y rápido: en la olla se desperdicia" },
  },
  bife_de_chorizo: {
    que_es: "es del lomo bajo, tierno, con un borde de grasa",
    bien: { parrilla: "tierno y con su borde de grasa: el clásico de la parrilla", plancha: "a la plancha bien caliente, en pocos minutos" },
    mal: { olla: "es para fuego fuerte y rápido: en la olla se desperdicia" },
  },
  lomo: {
    que_es: "es el corte más tierno de todos, casi sin grasa",
    bien: {
      plancha: `en medallones: ${TIERNO_RAPIDO}`,
      horno: "entero al horno, jugoso por dentro, queda de fiesta",
      salteado: "en tiras es ideal para wok o stroganoff: no se endurece",
      parrilla: "entero a la parrilla, sin pasarlo de punto",
    },
    mal: { olla: MAGRO_SE_SECA + ", y es un desperdicio de un corte tan tierno", milanesas: "se puede, pero es un corte caro para eso: la nalga da igual de bien" },
  },
  cuadril: {
    que_es: "es de la parte trasera: magro y tierno",
    bien: { plancha: "en bifes a la plancha queda tierno", horno: "entero al horno", salteado: "en tiras para saltear no se endurece", vitel_tone: "sirve como alternativa al peceto" },
    mal: { olla: MAGRO_SE_SECA },
  },
  nalga: {
    que_es: "es un corte grande de la pierna, magro y parejo, sin nervios",
    bien: {
      milanesas: "es magra, sin nervios y se fetea parejo; es la clásica",
      plancha: "en bifes finos a la plancha",
      horno: "entera al horno o mechada",
    },
    mal: { olla: "es magra: en estofado se seca un poco; para eso va mejor la aguja o el osobuco", parrilla: "es muy magra: a la parrilla se seca" },
  },
  cuadrada: {
    que_es: "es de la pierna, magra y de fibra fina",
    bien: { milanesas: "muy usada para milanesas: magra y fácil de fetear", horno: "al horno queda bien", plancha: "en bifes a la plancha" },
    mal: { parrilla: "es muy magra: a la parrilla se seca" },
  },
  bola_de_lomo: {
    que_es: "es de la pierna: magra, tierna y sin grasa",
    bien: {
      milanesas: "muy buena para milanesas: tierna y sin nervio",
      horno: "entera al horno",
      vitel_tone: "es una buena alternativa al peceto",
      salteado: "en tiras para saltear",
    },
    mal: { parrilla: "es muy magra: a la parrilla se seca" },
  },
  peceto: {
    que_es: "es una pieza alargada de la pierna, muy magra y de fibra fina",
    bien: {
      vitel_tone: "es parejo y magro: se cocina entero y se corta en fetas finas; es el clásico",
      horno: "al horno, entero o mechado",
      milanesas: "da milanesas tiernas y parejas",
    },
    mal: { parrilla: "es muy magro: a la parrilla se seca" },
  },
  tapa_de_nalga: {
    que_es: "es la parte de afuera de la nalga, con un poco de grasa",
    bien: { horno: "al horno queda jugosa por su grasa", milanesas: "también sirve para milanesas", parrilla: "con su grasa, a la parrilla va bien" },
  },
  // ---------------- Vacuno · olla ----------------
  aguja: {
    que_es: "es del cogote y la parte alta del lomo, con grasa entreverada y bastante tejido conectivo",
    bien: {
      olla: COLAGENO_LENTO,
      horno: "al horno, lento y tapado, queda muy tierna",
      parrilla: "a la parrilla se puede, pero lenta y en tiras",
    },
    mal: { plancha: DURA_RAPIDO, milanesas: DURA_RAPIDO },
  },
  osobuco: {
    que_es: "es un corte transversal de la pierna, con el hueso y la médula en el centro",
    bien: { olla: "la médula y el colágeno le dan un caldo espeso y la carne se deshace; es de lo mejor para eso" },
    mal: { plancha: "necesita horas de cocción: a la plancha queda durísimo", parrilla: "necesita horas de cocción: a la parrilla queda duro", milanesas: "tiene hueso y mucho nervio" },
  },
  marucha: {
    que_es: "es de la paleta: con fibra marcada y algo de grasa",
    bien: { olla: COLAGENO_LENTO, parrilla: "bien lenta, a la parrilla tiene muchos fans" },
    mal: { plancha: DURA_RAPIDO },
  },
  brazuelo: {
    que_es: "es de la pata delantera, con bastante nervio",
    bien: { olla: COLAGENO_LENTO },
    mal: { plancha: DURA_RAPIDO, milanesas: DURA_RAPIDO, parrilla: DURA_RAPIDO },
  },
  paleta: {
    que_es: "es un corte grande de la pata delantera, con algo de nervio",
    bien: { olla: COLAGENO_LENTO, horno: "al horno, lento, queda tierna" },
    mal: { plancha: DURA_RAPIDO },
  },
  cogote: {
    que_es: "es el cuello: muy sabroso y fibroso",
    bien: { olla: "tiene mucho sabor y se deshace con la cocción larga" },
    mal: { plancha: DURA_RAPIDO, parrilla: DURA_RAPIDO },
  },
  pecho: {
    que_es: "es de la parte de adelante, con capas de grasa y carne",
    bien: { olla: "la grasa le da sabor y queda tierno con la cocción lenta" },
    mal: { plancha: DURA_RAPIDO },
  },
  tortuguita: {
    que_es: "es un músculo de la pierna, con nervio",
    bien: { olla: COLAGENO_LENTO },
    mal: { plancha: DURA_RAPIDO },
  },
  rabo: {
    que_es: "es la cola: hueso con carne y mucho colágeno",
    bien: { olla: "suelta mucha gelatina y la carne se deshace; guisado es un manjar" },
    mal: { plancha: DURA_RAPIDO, parrilla: DURA_RAPIDO },
  },
  // ---------------- Picada ----------------
  picada_comun: {
    que_es: "es carne picada con más grasa",
    bien: { picada: "la grasa le da jugosidad: va bien para salsa, pastel de papa o empanadas" },
  },
  picada_especial: {
    que_es: "es carne picada con menos grasa",
    bien: { picada: "es la más pareja: ideal para hamburguesas, albóndigas y empanadas" },
  },
  picada_magra: {
    que_es: "es carne picada casi sin grasa",
    bien: { picada: "para quien busca poca grasa: salsas livianas o rellenos" },
  },
  // ---------------- Cerdo ----------------
  bondiola: {
    que_es: "es del cuello del cerdo, con grasa entreverada",
    bien: {
      parrilla: MARMOLEADO,
      horno: "al horno, lenta, queda tierna; y desmechada es un golazo para sándwiches",
      plancha: "en bifes finos a la plancha",
    },
  },
  matambre_de_cerdo: {
    que_es: "es la capa de carne entre el cuero y la costilla del cerdo",
    bien: { parrilla: "a la parrilla o a la pizza queda jugosísimo y tierno", horno: "a la pizza al horno, en poco tiempo" },
  },
  pechito_de_cerdo: {
    que_es: "es el costillar del cerdo",
    bien: { parrilla: "a la parrilla, lento, con la grasa crocante", horno: "al horno, lento, queda muy tierno" },
    mal: { plancha: "tiene hueso: necesita cocción lenta" },
  },
  carre: {
    que_es: "es el lomo con hueso del cerdo, magro",
    bien: { horno: "al horno queda jugoso si no se pasa", plancha: "en costeletas a la plancha", milanesas: "da milanesas de cerdo muy tiernas", parrilla: "en costeletas a la parrilla" },
    mal: { olla: MAGRO_SE_SECA },
  },
  costeleta_de_cerdo: {
    que_es: "es el carré cortado en bifes con hueso",
    bien: { plancha: "a la plancha en pocos minutos", parrilla: "a la parrilla, rápida" },
  },
  solomillo: {
    que_es: "es el lomo del cerdo: la parte más tierna",
    bien: { plancha: TIERNO_RAPIDO, horno: "entero al horno en poco tiempo", salteado: "en tiras para saltear queda muy tierno" },
    mal: { olla: MAGRO_SE_SECA },
  },
  pernil: {
    que_es: "es la pierna del cerdo",
    bien: { horno: "al horno, lento, es el clásico para sándwiches y fiestas" },
  },
  paleta_de_cerdo: {
    que_es: "es la pata delantera del cerdo",
    bien: { horno: "al horno, lenta, queda tierna", olla: "para guisos y estofados" },
  },
  // ---------------- Pollo ----------------
  pechuga_desosada: {
    que_es: "es la pechuga del pollo sin hueso: carne blanca, magra",
    bien: { milanesas: "son las supremas: tiernas y parejas", plancha: TIERNO_RAPIDO, salteado: "en tiras es ideal para wok o fajitas" },
    mal: { olla: "es muy magra: en un guiso largo se seca; para eso va mejor pata y muslo" },
  },
  pata_y_muslo: {
    que_es: "es la pata con el muslo del pollo: carne oscura, más jugosa",
    bien: {
      horno: "al horno queda jugosa y con la piel crocante",
      parrilla: "a la parrilla va muy bien, no se seca",
      olla: "es más jugosa y sabrosa que la pechuga: no se seca en el guiso",
    },
  },
  pollo_entero: {
    que_es: "es el pollo entero",
    bien: { horno: "al horno, entero, con papas: un clásico", parrilla: "abierto a la parrilla (a la parrilla o al espiedo)", olla: "le da mucho sabor al caldo" },
  },
  alitas: {
    que_es: "son las alas del pollo",
    bien: { horno: "al horno quedan crocantes", parrilla: "a la parrilla, para picar" },
  },
};

// ------------------------------------------------------------
// Cómo nombrar la ocasión con la palabra del cliente
// ------------------------------------------------------------

const PALABRA_DE_OCASION: [OcasionConcreta, RegExp, string][] = [
  ["olla", /\bestofado\b/, "estofado"],
  ["olla", /\bpuchero\b/, "puchero"],
  ["olla", /\bguis(o|ito)\b/, "guiso"],
  ["olla", /\blocro\b/, "locro"],
  ["olla", /\bdisco\b/, "el disco"],
  ["olla", /\bcacerola\b/, "la cacerola"],
  ["olla", /\btuco\b/, "el tuco"],
  ["milanesas", /\bmilanga/, "milanesas"],
  ["picada", /\bhamburguesa/, "hamburguesas"],
  ["picada", /\bempanada/, "empanadas"],
  ["picada", /\balbondiga/, "albóndigas"],
  ["salteado", /\bwok\b/, "el wok"],
  ["salteado", /\bstrogonof|stroganof/, "stroganoff"],
  ["salteado", /\bfajita/, "fajitas"],
];

const NOMBRE_OCASION: Record<OcasionConcreta, string> = {
  parrilla: "la parrilla",
  horno: "el horno",
  milanesas: "milanesas",
  olla: "la olla",
  plancha: "la plancha",
  vitel_tone: "vitel toné",
  picada: "carne picada",
  salteado: "saltear",
};

/** "estofado" si dijo estofado, "la olla" si no dijo nada más preciso. */
export function palabraDeOcasion(ocasion: OcasionConcreta, texto: string): string {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [o, patron, palabra] of PALABRA_DE_OCASION) {
    if (o === ocasion && patron.test(t)) return palabra;
  }
  return NOMBRE_OCASION[ocasion];
}

/** El porqué, si se sabe: { apto: true/false, motivo }. null = no está en las fichas. */
export function aptitud(codigo: string, ocasion: OcasionConcreta): { apto: boolean; motivo: string } | null {
  const ficha = FICHAS[codigo];
  if (!ficha) return null;
  if (ficha.bien[ocasion]) return { apto: true, motivo: ficha.bien[ocasion]! };
  if (ficha.mal?.[ocasion]) return { apto: false, motivo: ficha.mal[ocasion]! };
  return null;
}

/** Qué es un corte, en una línea, o null. */
export function queEs(codigo: string): string | null {
  return FICHAS[codigo]?.que_es ?? null;
}

// ------------------------------------------------------------
// ¿Está preguntando si un corte sirve para algo, o qué es?
// ------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "¿La aguja es buena para estofado?", "¿sirve el vacío para el horno?",
 * "¿el peceto va para milanesa?", "¿qué tal la marucha a la parrilla?",
 * "tienen algo para estofado? aguja?" → sí (quien llama ya sabe qué corte
 * y qué ocasión nombra). No se usa si ya pidió cantidad ("2 kg de aguja para
 * el estofado" es un pedido).
 */
export function preguntaSiSirve(texto: string): boolean {
  const t = normalizar(texto);
  if (/\b\d+([.,]\d+)?\s*(kg|kilos?|k|gr|gramos)\b/.test(t)) return false;
  return (
    /\b(es|son|sirve|sirven|va|van|anda|andan|queda|quedan|conviene|convienen|sale|salen|esta|estan|seria|serian|se puede|puedo)\b.*\b(buen[oa]s?|bien|ideal|apt[oa]s?|recomendable|lindo|linda|rico|rica)?\s*\b(para|pa|a la|al)\b/.test(t) ||
    /\b(buen[oa]s?|ideal|apt[oa]s?|sirve|va bien)\s+(para|pa)\b/.test(t) ||
    /\bque tal (el|la|los|las)?\b/.test(t) ||
    // "¿Tienen algo para estofado? ¿Aguja?": nombra la ocasión y un corte, con pregunta.
    (/\?/.test(texto) && /\b(algo|que)\b.*\bpara\b/.test(t))
  );
}

/** "¿Qué es la marucha?", "¿de dónde sale la entraña?", "¿qué corte es el chingolo?" */
export function preguntaQueEs(texto: string): boolean {
  const t = normalizar(texto);
  return /\b(que es|que son|que corte es|de donde (sale|es|viene)|que parte es|como es (el|la))\b/.test(t);
}
