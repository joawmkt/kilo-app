import { CatalogoCarniceria, Producto } from "./catalogo";

// Etapa 3 — regla de "alternativa más parecida" cuando falta stock de un
// producto pedido. Pregunta 5 del Bloque A ("¿alcanza con mismo
// tipo/familia, o hay reglas más finas que usaría un carnicero de
// verdad?") todavía está sin responder — esta es una PRIMERA versión
// simple y explícita para no bloquear el desarrollo: mismo `familia`,
// no complementario, con stock disponible, priorizando el que tenga más
// stock. Fácil de reemplazar por una regla más fina (ej. tabla de
// sustitutos explícitos por producto) sin tocar el resto del flujo.
export function buscarAlternativa(
  catalogo: CatalogoCarniceria,
  productoFaltante: Producto,
  cantidadNecesaria: number,
  yaExcluidos: Set<string> = new Set()
): Producto | null {
  const candidatos = catalogo.productos.filter(
    (p) =>
      p.id !== productoFaltante.id &&
      !yaExcluidos.has(p.id) &&
      p.familia === productoFaltante.familia &&
      !p.es_complementario &&
      p.unidad === productoFaltante.unidad &&
      p.stock_actual >= cantidadNecesaria
  );

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => b.stock_actual - a.stock_actual);
  return candidatos[0];
}
