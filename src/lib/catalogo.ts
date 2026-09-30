import { getSupabaseAdmin } from "./supabaseAdmin";

// Catálogo real de una carnicería (Etapa 2), ya cargado de Supabase y
// aplanado en un bloque de texto compacto listo para pasarle a la IA
// de interpretación (ver src/lib/interpretarStock.ts).

export type Producto = {
  id: string;
  codigo: string;
  nombre_display: string;
  familia: string;
  unidad: string;
  stock_actual: number;
  es_complementario: boolean;
  // Solo para productos con unidad="kg" que el cliente puede llegar a pedir
  // por unidad (ej. milanesas) — ver supabase/migrations/0009_conversion_kg_unidad.sql.
  peso_aproximado_unidad_kg: number | null;
  /** Cómo lo llama ESTA carnicería. Null = se usa `nombre_display`. */
  alias_display: string | null;
  /** Todo el vocabulario que mapea a este producto, para poder devolverlo. */
  sinonimos: string[];
  /** vacuno | porcino | aviar, o null si no aplica (carbón, huevos). */
  especie: string | null;
};

export type TerminoAmbiguo = {
  texto: string;
  pregunta: string;
  opciones_codigos: string[];
};

export type CatalogoCarniceria = {
  productos: Producto[];
  porCodigo: Map<string, Producto>;
  terminosAmbiguos: TerminoAmbiguo[];
  promptCatalogo: string;
};

type ProductoRow = {
  id: string;
  codigo: string;
  nombre_display: string;
  familia: string;
  unidad: string;
  stock_actual: number;
  es_complementario: boolean;
  peso_aproximado_unidad_kg: number | null;
  alias_display: string | null;
  especie: string | null;
  producto_sinonimos: { texto: string }[] | null;
};

type TerminoAmbiguoRow = {
  texto: string;
  pregunta: string;
  opciones_codigos: string[];
};

export async function cargarCatalogo(carniceriaId: string): Promise<CatalogoCarniceria> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: productosData, error: errProductos } = await supabaseAdmin
    .from("productos")
    .select(
      "id, codigo, nombre_display, familia, unidad, stock_actual, es_complementario, peso_aproximado_unidad_kg, alias_display, especie, producto_sinonimos(texto)"
    )
    .eq("carniceria_id", carniceriaId)
    .eq("activo", true);

  if (errProductos) {
    throw new Error(`Error cargando productos: ${errProductos.message}`);
  }

  const { data: ambiguosData, error: errAmbiguos } = await supabaseAdmin
    .from("terminos_ambiguos")
    .select("texto, pregunta, opciones_codigos")
    .eq("carniceria_id", carniceriaId)
    .eq("activo", true);

  if (errAmbiguos) {
    throw new Error(`Error cargando términos ambiguos: ${errAmbiguos.message}`);
  }

  const filas = (productosData ?? []) as unknown as ProductoRow[];
  const porCodigo = new Map<string, Producto>();
  const lineasProductos: string[] = [];

  for (const fila of filas) {
    const sinonimos = (fila.producto_sinonimos ?? []).map((s) => s.texto);
    const producto: Producto = {
      id: fila.id,
      codigo: fila.codigo,
      nombre_display: fila.nombre_display,
      familia: fila.familia,
      unidad: fila.unidad,
      stock_actual: Number(fila.stock_actual),
      es_complementario: fila.es_complementario,
      peso_aproximado_unidad_kg:
        fila.peso_aproximado_unidad_kg === null ? null : Number(fila.peso_aproximado_unidad_kg),
      alias_display: fila.alias_display,
      sinonimos,
      especie: fila.especie ?? null,
    };
    porCodigo.set(producto.codigo, producto);

    // El alias va PRIMERO en el vocabulario: es el nombre con el que esta
    // carnicería llama al corte, así que es el que conviene que el modelo use
    // si el cliente no dijo ninguno.
    const vocabulario = [fila.alias_display ?? fila.nombre_display, ...sinonimos].join(", ");
    const nota =
      producto.peso_aproximado_unidad_kg !== null
        ? ` [también se puede pedir por unidad, ~${producto.peso_aproximado_unidad_kg}kg c/u]`
        : "";
    // Lo que no tiene stock se marca: la IA no lo puede ofrecer como opción
    // (01/10/2026). Igual se lista, porque el cliente lo puede nombrar y hay
    // que entenderlo para decirle que no hay y ofrecerle otra cosa.
    const sinStock = producto.stock_actual > 0 ? "" : " [SIN STOCK HOY]";
    lineasProductos.push(`- ${fila.codigo} (${fila.unidad}): ${vocabulario}${nota}${sinStock}`);
  }

  // Un término ambiguo solo importa si quedan 2+ productos candidatos activos.
  // Si la carnicería no tiene activa más que una de las opciones, no hay nada
  // que preguntar — se resuelve directo por sinónimo normal.
  const ambiguosRows = (ambiguosData ?? []) as unknown as TerminoAmbiguoRow[];
  const terminosAmbiguos: TerminoAmbiguo[] = [];
  const lineasAmbiguos: string[] = [];

  for (const fila of ambiguosRows) {
    // "Asado" nunca es un término ambiguo entre cortes (el fundador, 01/10:
    // "ASADO proviene de ASAR... NO ES UN CORTE ESPECÍFICO"). "¿Asado tenés?"
    // es una pregunta por la parrilla y la contesta el detector de ocasión
    // (`ocasionPedida`), no una pregunta "¿qué tipo de asado?". Se corta acá,
    // en código, para que valga aunque la tabla de una carnicería todavía
    // tenga la fila vieja.
    if (fila.texto.trim().toLowerCase() === "asado") continue;
    const opcionesActivas = fila.opciones_codigos.filter((c) => porCodigo.has(c));
    if (opcionesActivas.length >= 2) {
      terminosAmbiguos.push({
        texto: fila.texto,
        pregunta: fila.pregunta,
        opciones_codigos: opcionesActivas,
      });
      lineasAmbiguos.push(`- "${fila.texto}" -> preguntar: "${fila.pregunta}"`);
    }
  }

  const promptCatalogo = [
    "PRODUCTOS ACTIVOS (codigo (unidad): nombre y sinónimos reconocidos):",
    ...lineasProductos,
    "",
    "POR UNIDAD — cualquier producto se puede pedir contando unidades (\"3 pata muslo\", \"2 pechugas\",",
    '"un pollo", "4 milanesas"). En ese caso poné cantidad = cuántas unidades y unidad = "unidad", tal',
    "cual lo dijo: el sistema calcula los kilos. NUNCA conviertas vos a kilos ni le pidas al cliente que",
    "te lo diga en kilos.",
    "",
    "CÓMO NOMBRAR LOS PRODUCTOS AL CONTESTAR — devolvéle al cliente LA MISMA",
    "palabra que usó él, si es una de las de la lista de arriba. Si pidió",
    '"aguja", contestá "aguja", no el primer nombre de la lista: que le',
    "contesten con otro nombre lo hace dudar de si le entendieron. Solo si no",
    "usó ninguna de esas palabras, usá la primera de la línea.",
    "",
    'TERMINOS AMBIGUOS — si el carnicero usa SOLO esta palabra o expresión, sin ningún',
    "calificador adicional que coincida con un sinónimo específico de la lista de arriba,",
    "no adivines el producto: respondé tipo \"aclaracion\" con la pregunta indicada.",
    ...lineasAmbiguos,
  ].join("\n");

  return {
    productos: Array.from(porCodigo.values()),
    porCodigo,
    terminosAmbiguos,
    promptCatalogo,
  };
}

// ============================================================
// Contestarle al cliente con SU palabra
// ============================================================
//
// Pedido del fundador (20/09): "que el bot conteste con el mismo nombre con el
// que se le pidió. Es mejor para el cliente."
//
// Tiene razón y es más profundo de lo que parece: si el cliente escribe "aguja"
// y el bot le contesta "Roast beef: 2 kg", el cliente no sabe si le entendieron
// o le están ofreciendo otra cosa. Y en una carnicería, donde el mismo corte
// cambia de nombre a tres cuadras de distancia, eso pasa todo el tiempo.
//
// Se resuelve sin tocar el intérprete ni el esquema del pedido: se busca cuál
// de las palabras que conoce este producto aparece en el texto del cliente. La
// MÁS LARGA gana, porque "pollo" está adentro de "pollo entero" y el que pidió
// "pollo entero" no quiere que le contesten "pollo".

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Cómo nombrar este producto al contestarle a quien escribió `textoDelCliente`.
 *
 * Si no usó ninguna palabra conocida, cae en el alias de la carnicería y, si
 * tampoco hay, en el nombre del sistema. Nunca devuelve vacío.
 */
export function nombreComoLoPidio(producto: Producto, textoDelCliente: string): string {
  return nombreDichoPor(producto, textoDelCliente) ?? producto.alias_display ?? producto.nombre_display;
}

/** Las palabras que conoce este producto, sin vacíos. */
function vocabularioDe(producto: Producto): string[] {
  return [producto.alias_display, producto.nombre_display, ...producto.sinonimos].filter(
    (valor): valor is string => typeof valor === "string" && valor.trim().length > 0
  );
}

/** Los nombres PROPIOS del producto (no sus sinónimos). */
function nombresPropiosDe(producto: Producto): string[] {
  return [producto.alias_display, producto.nombre_display].filter(
    (valor): valor is string => typeof valor === "string" && valor.trim().length > 0
  );
}

/**
 * ¿`frase` aparece en `texto` como palabra(s) entera(s)? Así "roast" no se
 * encuentra adentro de "roaster", pero "pollo" sí dentro de "pollos" (plural).
 */
function aparece(texto: string, frase: string): boolean {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const f = normalizar(frase).replace(/[^a-z0-9ñ]+/g, " ").trim();
  if (!f) return false;
  return t.includes(` ${f} `) || t.includes(` ${f}s `) || t.includes(` ${f}es `);
}

/**
 * La palabra con la que el cliente nombró este producto en `texto`, o null si
 * en ese texto no lo nombró. Gana la MÁS LARGA ("pollo entero" antes que "pollo").
 *
 * La diferencia con `nombreComoLoPidio` es el null: permite buscar la palabra
 * en otro lado (mensajes anteriores) cuando el mensaje de ahora no la tiene,
 * que es justo lo que pasa cuando el cliente contesta solo "10".
 */
export function nombreDichoPor(producto: Producto, texto: string): string | null {
  if (!texto || !texto.trim()) return null;
  let elegido: string | null = null;
  for (const candidato of vocabularioDe(producto)) {
    if (!aparece(texto, candidato)) continue;
    if (elegido === null || normalizar(candidato).length > normalizar(elegido).length) elegido = candidato;
  }
  if (elegido === null) return null;
  return elegido.charAt(0).toUpperCase() + elegido.slice(1);
}

/**
 * Cómo nombrarle un producto al cliente mirando TODA la charla, no solo el
 * último mensaje.
 *
 * Bug del 28/09: el cliente pidió "roast beef" (en esta carnicería es un
 * sinónimo de aguja), el bot le preguntó cuántos kilos, él contestó "10" y el
 * resumen dijo "Aguja: 10 kg". El nombre se buscaba solo en "10", que no nombra
 * nada, y caía en el nombre del sistema. Regla del fundador: si el cliente
 * dijo roast beef, se le dice roast beef, sea lo que sea por dentro.
 *
 * Orden: 1) lo que dijo en ESTE mensaje; 2) lo que dijo en sus mensajes
 * anteriores, del más nuevo al más viejo; 3) cómo figuraba ya en su pedido;
 * 4) el nombre de la carnicería.
 */
export function nombreParaCliente(
  producto: Producto,
  fuentes: { textoActual: string; mensajesAnteriores?: string[]; nombrePrevio?: string | null }
): string {
  const ahora = nombreDichoPor(producto, fuentes.textoActual);
  if (ahora) return ahora;
  const anteriores = fuentes.mensajesAnteriores ?? [];
  for (let i = anteriores.length - 1; i >= 0; i--) {
    const antes = nombreDichoPor(producto, anteriores[i]);
    if (antes) return antes;
  }
  if (fuentes.nombrePrevio && fuentes.nombrePrevio.trim()) return fuentes.nombrePrevio;
  return producto.alias_display ?? producto.nombre_display;
}

/**
 * "Nombre propio gana a sinónimo".
 *
 * Si la IA eligió el producto P porque el cliente usó una palabra que P tiene
 * como SINÓNIMO, pero en el catálogo activo hay otro producto Q que se LLAMA
 * exactamente así, el cliente quiso decir Q. Ejemplo real de la base: palomita
 * tiene "chingolo" como sinónimo y además existe el producto Chingolo; quien
 * pide "chingolo" quiere chingolo.
 *
 * Solo cambia cuando el mensaje no nombra a P por su nombre propio (si dice
 * "palomita y chingolo" son dos cosas y no se toca nada).
 */
export function corregirPorNombrePropio(
  catalogo: CatalogoCarniceria,
  producto: Producto,
  texto: string
): Producto {
  if (!texto || !texto.trim()) return producto;
  if (nombresPropiosDe(producto).some((n) => aparece(texto, n))) return producto;
  const dicho = nombreDichoPor(producto, texto);
  if (!dicho) return producto;
  const clave = normalizar(dicho).trim();
  for (const otro of catalogo.productos) {
    if (otro.id === producto.id) continue;
    if (nombresPropiosDe(otro).some((n) => normalizar(n).trim() === clave)) return otro;
  }
  return producto;
}

/**
 * Qué productos del catálogo nombra el texto, y DÓNDE (para saber el orden:
 * en "cambiá el vacío por el matambre" importa cuál viene primero).
 *
 * Si dos nombres se pisan ("matambre" adentro de "matambre de cerdo"), queda
 * el más largo: el que dijo "matambre de cerdo" no pidió matambre vacuno.
 */
export function productosEnTexto(catalogo: CatalogoCarniceria, texto: string): { codigo: string; posicion: number }[] {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9ñ]+/g, " ")} `;
  const encontrados: { codigo: string; posicion: number; largo: number }[] = [];
  for (const producto of catalogo.productos) {
    let mejor: { posicion: number; largo: number } | null = null;
    for (const palabra of vocabularioDe(producto)) {
      const f = normalizar(palabra).replace(/[^a-z0-9ñ]+/g, " ").trim();
      if (!f) continue;
      for (const variante of [f, `${f}s`, `${f}es`]) {
        const i = t.indexOf(` ${variante} `);
        if (i >= 0 && (!mejor || variante.length > mejor.largo)) mejor = { posicion: i, largo: variante.length };
      }
    }
    if (mejor) encontrados.push({ codigo: producto.codigo, ...mejor });
  }
  // Fuera los que quedan adentro de otro más largo.
  return encontrados
    .filter(
      (e) =>
        !encontrados.some(
          (o) => o !== e && o.largo > e.largo && o.posicion <= e.posicion && o.posicion + o.largo >= e.posicion + e.largo
        )
    )
    .map(({ codigo, posicion }) => ({ codigo, posicion }));
}


// ============================================================
// Nunca ofrecer lo que no hay, tampoco en una pregunta (01/10/2026)
// ============================================================
//
// Bug: el cliente dijo "cerdo" y el bot preguntó "¿Cuál de cerdo: asado,
// costilla, matambre, bondiola, pechito, medallón, milanesa, hamburguesa o
// chorizo?". Eligió milanesa, el bot le preguntó cuántos kilos, y recién
// ahí le dijo que no había. El fundador: "¿por qué me ofrece cosas que no
// tiene en stock?".
//
// Las preguntas con opciones las escribe la IA (o salen de la tabla de
// términos ambiguos). La IA ya recibe qué está sin stock, pero no se confía
// en eso (Patrón 3): acá se leen las opciones de la pregunta y se sacan las
// que son productos sin stock. Una opción que no se reconoce como producto
// se deja (no se puede saber si falta).

function productoPorNombreExacto(catalogo: CatalogoCarniceria, frase: string): Producto | null {
  const f = normalizar(frase).replace(/[^a-z0-9ñ]+/g, " ").trim();
  if (!f) return null;
  for (const producto of catalogo.productos) {
    for (const palabra of vocabularioDe(producto)) {
      const v = normalizar(palabra).replace(/[^a-z0-9ñ]+/g, " ").trim();
      if (v && (f === v || f === `${v}s` || f === `${v}es` || `${f}s` === v)) return producto;
    }
  }
  return null;
}

function enumerarConO(opciones: string[]): string {
  if (opciones.length <= 1) return opciones[0] ?? "";
  return `${opciones.slice(0, -1).join(", ")} o ${opciones[opciones.length - 1]}`;
}

/**
 * La pregunta sin las opciones que no tienen stock. Devuelve la misma
 * pregunta si no había nada que sacar, y `null` si TODAS las opciones eran
 * productos sin stock (quien llama dice que no hay, en vez de preguntar).
 *
 *   "¿Cuál de cerdo: bondiola, milanesa o chorizo?" (sin milanesa de cerdo)
 *     → "¿Cuál de cerdo: bondiola o chorizo?"
 *   "¿Milanesa de carne, de pollo o de cerdo?" (sin la de carne)
 *     → "¿Milanesa de pollo o de cerdo?"
 */
export function sinOpcionesAgotadas(pregunta: string, catalogo: CatalogoCarniceria): string | null {
  const m = /¿([^¿?]+)\?/.exec(pregunta);
  if (!m) return pregunta;
  const cuerpo = m[1];
  const dosPuntos = cuerpo.indexOf(":");
  const cabeza = dosPuntos >= 0 ? cuerpo.slice(0, dosPuntos + 1) : "";
  const lista = (dosPuntos >= 0 ? cuerpo.slice(dosPuntos + 1) : cuerpo).trim();
  const opciones = lista.split(/\s*,\s*|\s+o\s+/).map((o) => o.trim()).filter(Boolean);
  if (opciones.length < 2) return pregunta;

  // El contexto que completa cada opción: "¿Cuál de cerdo: milanesa...?" →
  // "milanesa de cerdo"; "¿Milanesa de carne, de pollo...?" → "milanesa de pollo".
  const sufijo = /\bde\s+(cerdo|pollo|vaca|carne|ternera)\b/i.exec(cabeza)?.[0] ?? "";
  const sustantivo = dosPuntos < 0 ? (/^([a-záéíóúñ ]+?)\s+de\s+/i.exec(opciones[0])?.[1] ?? "") : "";

  const agotada = (opcion: string): boolean => {
    const candidatos = [
      sufijo ? `${opcion} ${sufijo}` : "",
      sustantivo && /^de\s/i.test(opcion) ? `${sustantivo} ${opcion}` : "",
      opcion,
    ].filter(Boolean);
    for (const c of candidatos) {
      const producto = productoPorNombreExacto(catalogo, c);
      if (producto) return !(producto.stock_actual > 0);
    }
    return false;
  };

  const quedan = opciones.filter((o) => !agotada(o));
  if (quedan.length === opciones.length) return pregunta;
  if (quedan.length === 0) return null;

  // Si se fue la primera ("Milanesa de carne"), el sustantivo pasa a la nueva primera.
  if (sustantivo && !quedan[0].toLowerCase().startsWith(sustantivo.toLowerCase()) && /^de\s/i.test(quedan[0])) {
    quedan[0] = `${sustantivo} ${quedan[0]}`;
  }
  let nuevaLista = enumerarConO(quedan);
  if (!cabeza) nuevaLista = nuevaLista.charAt(0).toUpperCase() + nuevaLista.slice(1);
  const nuevoCuerpo = cabeza ? `${cabeza} ${nuevaLista}` : nuevaLista;
  return pregunta.replace(m[0], `¿${nuevoCuerpo}?`);
}
