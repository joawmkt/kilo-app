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
      "id, codigo, nombre_display, familia, unidad, stock_actual, es_complementario, peso_aproximado_unidad_kg, alias_display, producto_sinonimos(texto)"
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
    lineasProductos.push(`- ${fila.codigo} (${fila.unidad}): ${vocabulario}${nota}`);
  }

  // Un término ambiguo solo importa si quedan 2+ productos candidatos activos.
  // Si la carnicería no tiene activa más que una de las opciones, no hay nada
  // que preguntar — se resuelve directo por sinónimo normal.
  const ambiguosRows = (ambiguosData ?? []) as unknown as TerminoAmbiguoRow[];
  const terminosAmbiguos: TerminoAmbiguo[] = [];
  const lineasAmbiguos: string[] = [];

  for (const fila of ambiguosRows) {
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
  const porDefecto = producto.alias_display ?? producto.nombre_display;
  const texto = normalizar(textoDelCliente);
  if (!texto) return porDefecto;

  const candidatos = [producto.alias_display, producto.nombre_display, ...producto.sinonimos].filter(
    (valor): valor is string => typeof valor === "string" && valor.trim().length > 0
  );

  let elegido: string | null = null;
  for (const candidato of candidatos) {
    const normalizado = normalizar(candidato);
    if (!normalizado || !texto.includes(normalizado)) continue;
    if (elegido === null || normalizado.length > normalizar(elegido).length) elegido = candidato;
  }

  if (elegido === null) return porDefecto;
  return elegido.charAt(0).toUpperCase() + elegido.slice(1);
}
