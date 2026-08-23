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
      "id, codigo, nombre_display, familia, unidad, stock_actual, es_complementario, peso_aproximado_unidad_kg, producto_sinonimos(texto)"
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
    };
    porCodigo.set(producto.codigo, producto);

    const sinonimos = (fila.producto_sinonimos ?? []).map((s) => s.texto);
    const vocabulario = [fila.nombre_display, ...sinonimos].join(", ");
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
