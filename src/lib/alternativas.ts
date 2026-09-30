import { getSupabaseAdmin } from "./supabaseAdmin";
import { CatalogoCarniceria, Producto } from "./catalogo";
import { cargarTablaOcasiones } from "./recomendacionesCarniceria";
import { OCASIONES_CONCRETAS, tituloDeOcasion, type OcasionConcreta } from "./recomendaciones";

// ============================================================
// Sustitutos cuando falta un corte — especificación, sección 5
// ============================================================
//
// Antes de la Tanda 6, acá había una regla simple: cualquier producto de la
// misma familia con stock. Era una v1 explícita, puesta para no bloquear el
// desarrollo mientras la regla real estaba sin definir.
//
// La sección 5.5 la definió, y es bastante más restrictiva. Dos ejemplos que
// están escritos en la especificación palabra por palabra:
//
//   - NO ofrecer lomo en lugar de vacío "solo porque ambos son carne vacuna".
//   - NO ofrecer roast beef como reemplazo de nalga para milanesas.
//
// Por eso los sustitutos salen de una tabla de pares AUTORIZADOS
// (`sustitutos_autorizados`) y no de una heurística. Si un producto no tiene
// sustitutos cargados, no se ofrece ninguno — y eso es correcto: la sección 1.3
// prohíbe expresamente inventar "sustitutos fuera de los autorizados".
//
// ------------------------------------------------------------
// ⚠️ La regla del stock (13/09/2026)
// ------------------------------------------------------------
//
// **Un sustituto sin stock no es un sustituto.** Ofrecerlo es prometer algo
// que no hay, que es la peor falla posible del bot (sección 1.3).
//
// Por eso el filtro por stock vive en UNA sola función —
// `buscarSustitutosConStock`— y todo el resto del sistema pasa por ahí. No
// hay ningún camino que devuelva un sustituto sin haberle mirado el stock, y
// no hay que acordarse de chequearlo en cada lugar que los use: es imposible
// obtener uno sin filtrar (Patrón 1 del manual: una sola función contesta
// cada pregunta importante).
//
// Si mañana hace falta ofrecer sustitutos en otra pantalla o en otro flujo,
// el camino es llamar acá, NUNCA leer `sustitutos_autorizados` por su cuenta.

export type SustitutoPropuesto = {
  producto: Producto;
  /**
   * El reemplazo depende de para qué lo va a usar el cliente (sección 5.4):
   * hay que preguntarle el uso antes de proponerlo.
   */
  requierePreguntarUso: boolean;
};

/**
 * Todos los sustitutos autorizados de un producto QUE TIENEN STOCK, en orden
 * de prioridad.
 *
 * `cantidadNecesaria` es el mínimo de stock que tiene que haber. Cuando solo
 * interesa saber si hay "algo parecido" (una consulta del cliente, sin
 * cantidad todavía), se pasa 0 y alcanza con que quede stock.
 */
export async function buscarSustitutosConStock(params: {
  carniceriaId: string;
  catalogo: CatalogoCarniceria;
  productoFaltante: Producto;
  cantidadNecesaria?: number;
  yaExcluidos?: Set<string>;
  /** Solo exigir la misma unidad (kg vs unidad). Por defecto sí. */
  exigirMismaUnidad?: boolean;
}): Promise<SustitutoPropuesto[]> {
  const {
    carniceriaId,
    catalogo,
    productoFaltante,
    cantidadNecesaria = 0,
    yaExcluidos = new Set(),
    exigirMismaUnidad = true,
  } = params;

  const { data, error } = await getSupabaseAdmin()
    .from("sustitutos_autorizados")
    .select("sustituto_id, prioridad, requiere_preguntar_uso")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoFaltante.id)
    .order("prioridad", { ascending: true });

  if (error) {
    console.error("Error leyendo sustitutos autorizados", error);
    // Ante un error de base NO se devuelve nada: es preferible no ofrecer
    // sustituto a ofrecer uno sin haber podido verificar el stock.
    return [];
  }

  const porId = new Map(catalogo.productos.map((p) => [p.id, p]));
  const encontrados: SustitutoPropuesto[] = [];

  for (const fila of data ?? []) {
    const candidato = porId.get(fila.sustituto_id as string);
    if (!candidato) continue;
    if (yaExcluidos.has(candidato.id)) continue;
    if (exigirMismaUnidad && candidato.unidad !== productoFaltante.unidad) continue;

    // ⚠️ EL CHEQUEO DE STOCK. No sacar de acá ni hacerlo opcional: es lo que
    // garantiza que el bot nunca ofrezca un reemplazo que no puede entregar.
    if (candidato.stock_actual <= 0) continue;
    if (candidato.stock_actual < cantidadNecesaria) continue;

    encontrados.push({
      producto: candidato,
      requierePreguntarUso: Boolean(fila.requiere_preguntar_uso),
    });
  }

  return encontrados;
}

/**
 * El mejor sustituto autorizado con stock suficiente, o null.
 *
 * `yaExcluidos` evita proponer dos veces el mismo producto en un pedido que
 * tiene varios faltantes.
 */
export async function buscarSustitutoAutorizado(params: {
  carniceriaId: string;
  catalogo: CatalogoCarniceria;
  productoFaltante: Producto;
  cantidadNecesaria: number;
  yaExcluidos?: Set<string>;
}): Promise<SustitutoPropuesto | null> {
  const opciones = await buscarSustitutosConStock(params);
  return opciones[0] ?? null;
}

// ============================================================
// Qué ofrecer cuando algo se terminó (30/09/2026)
// ============================================================
//
// Bug del 30/09: el carnicero avisó que no había vacío, el bot le preguntó al
// cliente "¿querés que lo reemplace por otra cosa parecida?", el cliente dijo
// "sí, ¿qué otra cosa puede ser?" y el bot contestó DOS veces "para
// reemplazar vacío no tengo nada parecido". Había matambre, entraña, tapa de
// asado... todo para la parrilla y con stock. El fundador: "el bot debe
// poder RESOLVER situaciones como esta".
//
// En orden:
//   1. Los sustitutos AUTORIZADOS con stock (la tabla de sustitutos, como
//      siempre — esos son "lo mismo" para esta carnicería).
//   2. Si no hay ninguno: los otros cortes de la MISMA OCASIÓN que la
//      carnicería armó en el panel (Catálogo → Recomendaciones), con stock.
//      No se dice que son "lo mismo": se ofrecen como lo que son, otros cortes
//      que también van a la parrilla (o al horno...). Esa tabla la decide el
//      carnicero, así que no es un reemplazo inventado (regla 1).
// Nunca algo sin stock, nunca el mismo producto.

export type OpcionesDeReemplazo = {
  productos: Producto[];
  /** "sustitutos" = la tabla de sustitutos; "ocasion" = otros cortes de la misma ocasión. */
  fuente: "sustitutos" | "ocasion" | "ninguna";
  ocasion?: OcasionConcreta;
  /** "para la parrilla", "para el horno"... si la fuente es la ocasión. */
  paraQue?: string;
};

export async function opcionesDeReemplazo(params: {
  carniceriaId: string;
  catalogo: CatalogoCarniceria;
  productoFaltante: Producto;
  cantidadNecesaria?: number;
  excluidos?: Set<string>;
  maximo?: number;
}): Promise<OpcionesDeReemplazo> {
  const { carniceriaId, catalogo, productoFaltante, cantidadNecesaria = 0, maximo = 3 } = params;
  const excluidos = new Set(params.excluidos ?? []);
  excluidos.add(productoFaltante.id);

  const autorizados = await buscarSustitutosConStock({
    carniceriaId,
    catalogo,
    productoFaltante,
    cantidadNecesaria,
    yaExcluidos: excluidos,
  });
  if (autorizados.length > 0) {
    return { productos: autorizados.slice(0, maximo).map((o) => o.producto), fuente: "sustitutos" };
  }

  const tabla = await cargarTablaOcasiones(carniceriaId);
  for (const ocasion of OCASIONES_CONCRETAS) {
    const lista = tabla[ocasion].cortes;
    if (!lista.includes(productoFaltante.codigo)) continue;
    const productos = lista
      .map((codigo) => catalogo.porCodigo.get(codigo))
      .filter(
        (p): p is Producto =>
          p != null &&
          !excluidos.has(p.id) &&
          p.unidad === productoFaltante.unidad &&
          p.stock_actual > 0 &&
          p.stock_actual >= cantidadNecesaria
      )
      .slice(0, maximo);
    if (productos.length > 0) {
      return {
        productos,
        fuente: "ocasion",
        ocasion,
        paraQue: tituloDeOcasion(ocasion).replace(/^Para /, "para ").replace(/\s*\(.*\)$/, ""),
      };
    }
  }
  return { productos: [], fuente: "ninguna" };
}

