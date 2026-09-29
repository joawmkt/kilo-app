import type { Producto } from "./catalogo";

/** Lo mínimo de un producto que hace falta para recomendarlo (sirve también en el panel). */
export type ProductoParaRecomendar = Pick<Producto, "id" | "codigo" | "nombre_display" | "alias_display" | "stock_actual">;

// ============================================================
// Recomendar según para qué lo quiere el cliente (29/09/2026)
// ============================================================
//
// Pedido del fundador: "cuando alguien pregunta qué te queda de asado se
// refiere a cortes que se puedan ASAR. Debe aprender a dar recomendaciones...
// Hay que armar una tabla de recomendaciones para cada ocasión (horno,
// parrilla, milanesas, vitel toné...)".
//
// Antes el bot entendía "¿qué te queda de asado?" como "¿tenés el corte
// asado?" y contestaba "Sí, tenemos Asado". Y "¿qué cortes tenés?" caía en
// "eso te lo confirmo y te aviso". Un carnicero de verdad, a esas dos
// preguntas, te canta lo que tiene para la parrilla.
//
// Cómo funciona:
//   1. La TABLA dice, para cada ocasión, qué cortes sirven y en qué orden
//      conviene ofrecerlos (lo más pedido primero). La de abajo es la "de
//      fábrica": conocimiento de carnicería argentina. Cada carnicero la puede
//      cambiar desde el panel (Catálogo → Recomendaciones); la suya se guarda
//      en `recomendaciones_ocasion` (migración 0029) y manda sobre esta. Ver
//      recomendacionesCarniceria.ts.
//   2. Al contestar se cruzan con el catálogo REAL de la carnicería y solo se
//      nombra lo que tiene stock. Un corte de la tabla que la carnicería no
//      vende, o del que no le queda, simplemente no aparece. Nunca se ofrece
//      algo que no hay (regla 1).
//   3. El detector sin IA (`ocasionPedida`) reconoce la pregunta aunque la IA
//      la clasifique mal (Patrón 3 del manual).
//
// Este archivo no importa nada de la base: se puede probar solo.

export type Ocasion =
  | "parrilla"
  | "horno"
  | "milanesas"
  | "olla"
  | "plancha"
  | "vitel_tone"
  | "picada"
  | "salteado"
  | "general";

type DefinicionOcasion = {
  /** Cómo se nombra en la respuesta: "Para la parrilla", "Para el horno". */
  titulo: string;
  /** Cortes principales, de lo más pedido a lo menos. */
  cortes: string[];
  /** Lo que acompaña (achuras, embutidos, ya preparados). Se nombra aparte. */
  acompanan?: string[];
};

export type OcasionConcreta = Exclude<Ocasion, "general">;

export const OCASIONES_CONCRETAS: OcasionConcreta[] = [
  "parrilla", "horno", "milanesas", "olla", "plancha", "vitel_tone", "picada", "salteado",
];

/** Lo que tiene cada ocasión: códigos de producto, en orden. */
export type ContenidoOcasion = { cortes: string[]; acompanan: string[] };
export type TablaOcasiones = Record<OcasionConcreta, ContenidoOcasion>;

/** El título de cada ocasión, para el bot y para el panel. */
export function tituloDeOcasion(ocasion: OcasionConcreta): string {
  return TABLA_OCASIONES[ocasion].titulo;
}

/** La tabla de fábrica, como códigos (una copia: quien la reciba la puede modificar). */
export function tablaDeFabrica(): TablaOcasiones {
  const tabla = {} as TablaOcasiones;
  for (const ocasion of OCASIONES_CONCRETAS) {
    tabla[ocasion] = {
      cortes: [...TABLA_OCASIONES[ocasion].cortes],
      acompanan: [...(TABLA_OCASIONES[ocasion].acompanan ?? [])],
    };
  }
  return tabla;
}

export const TABLA_OCASIONES: Record<OcasionConcreta, DefinicionOcasion> = {
  parrilla: {
    titulo: "Para la parrilla",
    cortes: [
      "asado", "vacio", "matambre", "entrana", "costilla", "tapa_de_asado", "colita_de_cuadril",
      "bife_ancho", "bife_angosto", "bife_de_chorizo", "falda", "tapa_de_cuadril", "lomo",
      "pechito_de_cerdo", "matambre_de_cerdo", "bondiola", "costeleta_de_cerdo", "vacio_de_cerdo", "carre",
      "pollo_entero", "pata_y_muslo", "brochette_de_carne", "brochette_de_pollo", "brochette_mixta",
    ],
    acompanan: [
      "chorizo", "chorizo_de_cerdo", "morcilla", "morcilla_vasca", "morcilla_bombon", "salchicha_parrillera",
      "chinchulines", "mollejas", "rinon", "tripa_gorda", "choto", "provoleta", "carbon",
    ],
  },
  horno: {
    titulo: "Para el horno",
    cortes: [
      "peceto", "colita_de_cuadril", "vacio", "matambre", "cuadril", "bola_de_lomo", "tapa_de_asado",
      "pollo_entero", "pata_y_muslo", "cuarto_trasero", "pechito_de_cerdo", "bondiola", "carre", "pernil",
      "paleta_de_cerdo", "matambre_de_cerdo", "lomo", "costilla",
    ],
    acompanan: ["matambre_arrollado", "pollo_relleno"],
  },
  milanesas: {
    titulo: "Para milanesas",
    cortes: [
      "nalga", "cuadrada", "bola_de_lomo", "peceto", "tapa_de_nalga", "pechuga_desosada",
      "nalga_de_cerdo", "carre", "bola_de_lomo_de_cerdo",
    ],
    acompanan: [
      "milanesa_de_carne", "milanesa_de_nalga", "milanesa_de_cuadrada", "milanesa_de_bola",
      "milanesa_de_pollo", "milanesa_de_cerdo", "pan_rallado", "huevos",
    ],
  },
  olla: {
    titulo: "Para la olla (guiso, puchero, estofado)",
    cortes: [
      "osobuco", "aguja", "roast_beef", "marucha", "brazuelo", "paleta", "cogote", "falda", "pecho",
      "tortuguita", "carnaza_de_paleta", "chingolo", "palomita", "rabo", "espinazo",
      "pata_y_muslo", "cuarto_trasero", "paleta_de_cerdo", "pata_de_cerdo", "patitas_de_cerdo",
    ],
    acompanan: ["panceta", "chorizo", "mondongo", "lengua"],
  },
  plancha: {
    titulo: "Para la plancha o la sartén",
    cortes: [
      "bife_angosto", "bife_ancho", "bife_de_chorizo", "lomo", "cuadril", "bola_de_lomo", "nalga",
      "tapa_de_cuadril", "entrana", "pechuga_desosada", "costeleta_de_cerdo", "solomillo", "bondiola",
    ],
    acompanan: ["hamburguesa_de_carne", "medallon_de_carne", "medallon_de_pollo"],
  },
  vitel_tone: {
    titulo: "Para vitel toné",
    cortes: ["peceto", "bola_de_lomo", "cuadril", "tapa_de_nalga", "peceto_de_cerdo"],
  },
  picada: {
    titulo: "Carne picada (hamburguesas, empanadas, albóndigas, salsa)",
    cortes: ["picada_especial", "picada_magra", "picada_comun"],
    acompanan: ["hamburguesa_de_carne", "albondigas", "medallon_de_carne"],
  },
  salteado: {
    titulo: "Para saltear (wok, fajitas, stroganoff)",
    cortes: ["lomo", "cuadril", "bola_de_lomo", "peceto", "entrana", "pechuga_desosada", "solomillo", "bondiola"],
  },
};

// Palabras que nombran cada ocasión. El orden importa: "asado al horno" es
// HORNO aunque diga asado, por eso horno se prueba antes que parrilla.
const PALABRAS_OCASION: [OcasionConcreta, RegExp][] = [
  ["vitel_tone", /\bvitel+\s*(tone|thone|tonne)?\b|\bvitelton+e\b/],
  ["milanesas", /\bmilane(s|z)as?\b|\bmilangas?\b|\bempanar\b|\brebozar\b|\bsupremas?\b/],
  ["picada", /\bhamburguesas?\b|\bempanadas?\b|\balbondigas?\b|\bpastel de papas?\b|\bbolo(n|gn)esa\b|\bcanelones\b|\blasa(gn|n|ñ)a\b|\bcarne picada\b|\bpicadillo\b/],
  ["salteado", /\bwok\b|\bsaltead[oa]s?\b|\bsaltear\b|\bfajitas?\b|\bstrogonof+\b|\bstroganof+\b|\btacos?\b/],
  ["olla", /\bguis(o|ito|os)\b|\bpuchero\b|\bestofado\b|\blocro\b|\bolla\b|\bcazuela\b|\bal disco\b|\bdisco\b|\bcacerola\b|\btuco\b|\bsopa\b|\bcaldo\b/],
  ["horno", /\bhorno\b|\bhornear\b|\bal horno\b/],
  ["plancha", /\bplancha\b|\bsarten\b|\bchurrascos?\b|\bbifes\b|\bbifecitos?\b|\bbife a la\b/],
  // "asado" como OCASIÓN: "para (un/el) asado", "de asado", "asar", "parrilla".
  ["parrilla", /\bparril+a\b|\bparrillada\b|\basar\b|\ba la brasa\b|\bfogon\b|\b(para|de|un|el|hacer)\s+(un\s+|el\s+)?asado\b/],
];

// Señales de que está pidiendo una SUGERENCIA, no un producto puntual.
const PIDE_SUGERENCIA =
  /\bque\s+(mas\s+)?(cortes?|carnes?|cosas?|hay|tenes|tienen|tendrias|te\s+queda|te\s+quedo|quedo|queda|me\s+(ofreces|ofrecen|recomendas|recomiendan|aconsejas|sugeris|das|podes\s+ofrecer|podes\s+dar|conviene))\b|\bme\s+(recomendas|recomendarias|recomiendan|aconsejas|sugeris|sugerirías|sugeririas)\b|\brecomenda(me|s|ria)?\b|\bque\s+me\s+recomendas\b|\bpara\s+ofrecerme\b|\balgo\s+(para|rico|bueno|lindo)\b|\bque\s+hay\s+de\s+bueno\b|\bque\s+llevo\b|\bque\s+puedo\s+(llevar|hacer|comprar)\b|\bcon\s+que\s+(hago|puedo)\b|\bque\s+corte\b|\bcual(es)?\s+(corte|me\s+conviene)\b/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** La ocasión que NOMBRA el texto (parrilla, horno...), o null. */
export function ocasionNombrada(texto: string): OcasionConcreta | null {
  const t = normalizar(texto);
  for (const [ocasion, patron] of PALABRAS_OCASION) {
    if (patron.test(t)) return ocasion;
  }
  return null;
}

/**
 * ¿El cliente está pidiendo que le recomienden algo? Devuelve para qué
 * ("parrilla", "horno"... o "general" si no dijo para qué), o null si no es
 * un pedido de recomendación.
 *
 *   "¿Qué te queda de asado?"                 -> parrilla
 *   "Hola! ¿Qué te quedó para hacer a la parrilla?" -> parrilla
 *   "Algo para la parrilla"                   -> parrilla
 *   "¿Qué cortes tenés?"                      -> general
 *   "¿Y qué más tenés para ofrecerme?"        -> general
 *   "Quiero 2 kg de vacío para la parrilla"   -> null (ya eligió: es un pedido)
 *   "¿Tenés vacío?"                           -> null (pregunta por UN producto)
 */
export function ocasionPedida(texto: string): Ocasion | null {
  const t = normalizar(texto);
  const ocasion = ocasionNombrada(t);
  const sugerencia = PIDE_SUGERENCIA.test(t);

  // "Quiero 2 kg de vacío para la parrilla" nombra la parrilla pero NO pide
  // una sugerencia: ya eligió. Eso es un pedido y lo maneja el flujo de siempre.
  const yaEligio = /\b\d+([.,]\d+)?\s*(kg|kilos?|k|gr|gramos|unidades?)?\b|\b(quiero|dame|mandame|preparame|separame|anotame)\b/.test(t);
  if (yaEligio && !sugerencia) return null;

  if (ocasion && (sugerencia || /\bpara\s+(la\s+|el\s+|un\s+|hacer\s+)?/.test(t) || /^(y\s+)?(algo|que)\b/.test(t))) {
    return ocasion;
  }
  if (sugerencia) return "general";
  return null;
}

// ------------------------------------------------------------
// Armar la respuesta con el stock real
// ------------------------------------------------------------

const MAXIMO_CORTES = 8;
const MAXIMO_ACOMPANAN = 4;

function conStock<P extends ProductoParaRecomendar>(
  codigos: string[],
  porCodigo: Map<string, P>,
  nombrar: (p: P) => string
): string[] {
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const codigo of codigos) {
    const producto = porCodigo.get(codigo);
    if (!producto || !(producto.stock_actual > 0) || vistos.has(producto.id)) continue;
    vistos.add(producto.id);
    nombres.push(nombrar(producto).toLowerCase());
  }
  return nombres;
}

function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * El texto de la recomendación, SOLO con lo que tiene stock. `null` si para
 * esa ocasión no queda nada (quien llama decide qué decir, sin inventar).
 */
export function armarRecomendacion<P extends ProductoParaRecomendar>(params: {
  ocasion: Ocasion;
  porCodigo: Map<string, P>;
  nombrar?: (producto: P) => string;
  /** La tabla de ESTA carnicería. Si no viene, la de fábrica. */
  tabla?: TablaOcasiones;
}): string | null {
  const { ocasion, porCodigo } = params;
  const tabla = params.tabla ?? tablaDeFabrica();
  const nombrar = params.nombrar ?? ((p: P) => p.alias_display ?? p.nombre_display);

  if (ocasion === "general") {
    // Sin ocasión: un pantallazo de lo que hay, agrupado por para qué sirve,
    // y se le pregunta para qué lo quiere (así la próxima es precisa).
    const lineas: string[] = [];
    const yaNombrados = new Set<string>();
    for (const clave of ["parrilla", "horno", "milanesas", "olla", "plancha"] as const) {
      const nombres = conStock(tabla[clave].cortes, porCodigo, nombrar).filter((n) => !yaNombrados.has(n)).slice(0, 5);
      if (nombres.length === 0) continue;
      nombres.forEach((n) => yaNombrados.add(n));
      lineas.push(`• ${tituloDeOcasion(clave)}: ${enumerar(nombres)}`);
    }
    if (lineas.length === 0) return null;
    return `Hoy te puedo ofrecer:\n${lineas.join("\n")}\n\n¿Para qué lo querés? Así te recomiendo mejor.`;
  }

  const def = { titulo: tituloDeOcasion(ocasion), ...tabla[ocasion] };
  const cortes = conStock(def.cortes, porCodigo, nombrar).slice(0, MAXIMO_CORTES);
  const acompanan = conStock(def.acompanan, porCodigo, nombrar)
    .filter((n) => !cortes.includes(n))
    .slice(0, MAXIMO_ACOMPANAN);

  if (cortes.length === 0 && acompanan.length === 0) return null;

  const partes: string[] = [];
  if (cortes.length > 0) partes.push(`${def.titulo} hoy te puedo ofrecer ${enumerar(cortes)}.`);
  if (acompanan.length > 0) {
    partes.push(cortes.length > 0 ? `Y para acompañar, ${enumerar(acompanan)}.` : `${def.titulo} tengo ${enumerar(acompanan)}.`);
  }
  partes.push("¿Qué te preparo?");
  return partes.join(" ");
}

/** Cuando para esa ocasión no queda nada: se dice y se ofrece lo que sí hay. */
export function sinNadaParaOcasion(ocasion: Ocasion): string {
  if (ocasion === "general") return "Justo ahora no tengo nada en stock para ofrecerte 😕";
  const titulo = TABLA_OCASIONES[ocasion].titulo.replace(/^Para /, "para ").replace(/^Carne picada/, "carne picada");
  return `Justo ${titulo} no me queda nada en este momento 😕 ¿Querés que te cuente qué otra cosa tengo?`;
}
