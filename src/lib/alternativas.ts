import { CatalogoCarniceria, Producto } from "./catalogo";
import { cargarTablaOcasiones } from "./recomendacionesCarniceria";
import { OCASIONES_CONCRETAS, grupoDeEspecie, tituloDeOcasion, type OcasionConcreta } from "./recomendaciones";

// ============================================================
// Qué ofrecer cuando algo no hay — SOLO desde las recomendaciones
// ============================================================
//
// Hasta el 01/10/2026 había dos fuentes: la tabla de "sustitutos
// autorizados" (pares cargados a mano: "si no hay vacío, matambre") y, si no
// había ninguno, la tabla de recomendaciones por ocasión. El fundador: "con la
// implementación de las recomendaciones, los sustitutos quedan inutilizados.
// Deberíamos sacar ese apartado ya que no cumple ninguna función. El bot debe
// manejarse pura y exclusivamente por las recomendaciones".
//
// La regla, en orden:
//   1. Las ocasiones de la tabla de ESTA carnicería (Catálogo →
//      Recomendaciones) en las que está el producto que falta. Si se sabe para
//      qué lo quería el cliente ("para la parrilla"), esa ocasión va primero.
//   2. De esas listas, primero los de la MISMA especie (si falta un corte de
//      vaca, otro de vaca), en el orden que puso el carnicero.
//   3. Solo si de la misma especie no hay nada, los de otra especie de la
//      misma ocasión (para la parrilla: pechito de cerdo, pollo...).
//
// Y lo que no se negocia (13/09/2026): **nunca algo sin stock**, nunca el
// mismo producto, nunca uno de otra unidad (kilos por unidades). El filtro
// vive en UNA sola función — `opcionesDeReemplazo` — y todo el sistema pasa
// por acá (Patrón 1 del manual). Nada lo elige la IA: la tabla la armó el
// carnicero, así que no es un reemplazo inventado (regla 1 del bot).

export type OpcionesDeReemplazo = {
  productos: Producto[];
  /** "ocasion" = otros cortes de la misma ocasión; "ninguna" = no hay nada con stock. */
  fuente: "ocasion" | "ninguna";
  ocasion?: OcasionConcreta;
  /** "para la parrilla", "para el horno"... */
  paraQue?: string;
};

function paraQueDe(ocasion: OcasionConcreta): string {
  return tituloDeOcasion(ocasion).replace(/^Para /, "para ").replace(/\s*\(.*\)$/, "");
}

export async function opcionesDeReemplazo(params: {
  carniceriaId: string;
  catalogo: CatalogoCarniceria;
  productoFaltante: Producto;
  cantidadNecesaria?: number;
  excluidos?: Set<string>;
  maximo?: number;
  /** Para qué lo quería el cliente, si se sabe: esa ocasión se mira primero. */
  ocasionPreferida?: OcasionConcreta | null;
}): Promise<OpcionesDeReemplazo> {
  const { carniceriaId, catalogo, productoFaltante, cantidadNecesaria = 0, maximo = 3, ocasionPreferida } = params;
  const excluidos = new Set(params.excluidos ?? []);
  excluidos.add(productoFaltante.id);

  const tabla = await cargarTablaOcasiones(carniceriaId);
  const ocasiones = [
    ...(ocasionPreferida ? [ocasionPreferida] : []),
    ...OCASIONES_CONCRETAS.filter((o) => o !== ocasionPreferida),
  ].filter((o) => [...tabla[o].cortes, ...tabla[o].acompanan].includes(productoFaltante.codigo));

  const especie = grupoDeEspecie(productoFaltante);
  const sirve = (p: Producto | undefined): p is Producto =>
    p != null &&
    !excluidos.has(p.id) &&
    p.unidad === productoFaltante.unidad &&
    p.stock_actual > 0 &&
    p.stock_actual >= cantidadNecesaria;

  // Dos pasadas: primero la misma especie en TODAS sus ocasiones; recién
  // después, otras especies. Un vacío que falta se reemplaza por otro corte
  // de vaca para la parrilla antes que por un pechito de cerdo.
  for (const mismaEspecie of [true, false]) {
    for (const ocasion of ocasiones) {
      // Si el faltante es un corte, se ofrecen cortes; si es "para acompañar"
      // (un chorizo), se ofrece de lo que acompaña.
      const esCorte = tabla[ocasion].cortes.includes(productoFaltante.codigo);
      const lista = esCorte ? tabla[ocasion].cortes : tabla[ocasion].acompanan;
      const productos = lista
        .map((codigo) => catalogo.porCodigo.get(codigo))
        .filter(sirve)
        .filter((p) => (grupoDeEspecie(p) === especie) === mismaEspecie)
        .slice(0, maximo);
      if (productos.length > 0) {
        return { productos, fuente: "ocasion", ocasion, paraQue: paraQueDe(ocasion) };
      }
    }
  }
  return { productos: [], fuente: "ninguna" };
}

/** El mejor reemplazo con stock suficiente (el primero de la lista), o null. */
export async function mejorReemplazo(params: {
  carniceriaId: string;
  catalogo: CatalogoCarniceria;
  productoFaltante: Producto;
  cantidadNecesaria: number;
  yaExcluidos?: Set<string>;
}): Promise<{ producto: Producto; paraQue?: string } | null> {
  const opciones = await opcionesDeReemplazo({
    carniceriaId: params.carniceriaId,
    catalogo: params.catalogo,
    productoFaltante: params.productoFaltante,
    cantidadNecesaria: params.cantidadNecesaria,
    excluidos: params.yaExcluidos,
    maximo: 1,
  });
  const producto = opciones.productos[0];
  return producto ? { producto, paraQue: opciones.paraQue } : null;
}
