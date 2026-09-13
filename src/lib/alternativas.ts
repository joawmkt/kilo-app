import { getSupabaseAdmin } from "./supabaseAdmin";
import { CatalogoCarniceria, Producto } from "./catalogo";

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
