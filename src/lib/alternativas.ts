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
// Por eso ahora los sustitutos salen de una tabla de pares AUTORIZADOS
// (`sustitutos_autorizados`) y no de una heurística. Si un producto no tiene
// sustitutos cargados, no se ofrece ninguno — y eso es correcto: la sección 1.3
// prohíbe expresamente inventar "sustitutos fuera de los autorizados".

export type SustitutoPropuesto = {
  producto: Producto;
  /**
   * El reemplazo depende de para qué lo va a usar el cliente (sección 5.4):
   * hay que preguntarle el uso antes de proponerlo.
   */
  requierePreguntarUso: boolean;
};

/**
 * Busca un sustituto autorizado con stock suficiente.
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
  const { carniceriaId, catalogo, productoFaltante, cantidadNecesaria, yaExcluidos = new Set() } = params;

  const { data, error } = await getSupabaseAdmin()
    .from("sustitutos_autorizados")
    .select("sustituto_id, prioridad, requiere_preguntar_uso")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoFaltante.id)
    .order("prioridad", { ascending: true });

  if (error) {
    console.error("Error leyendo sustitutos autorizados", error);
    return null;
  }

  const porId = new Map(catalogo.productos.map((p) => [p.id, p]));

  for (const fila of data ?? []) {
    const candidato = porId.get(fila.sustituto_id as string);
    if (!candidato) continue;
    if (yaExcluidos.has(candidato.id)) continue;
    if (candidato.unidad !== productoFaltante.unidad) continue;
    if (candidato.stock_actual < cantidadNecesaria) continue;

    return {
      producto: candidato,
      requierePreguntarUso: Boolean(fila.requiere_preguntar_uso),
    };
  }

  return null;
}
