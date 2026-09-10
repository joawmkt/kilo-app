import { getSupabaseAdmin } from "./supabaseAdmin";

// Los números autorizados de la carnicería. Ver
// supabase/migrations/0007_numeros_carnicero.sql.
//
// OJO: acá NO se pregunta "¿este número es el carnicero?". Esa pregunta se
// contesta en `quienEs.ts` y en ningún otro lado. Había una función acá que
// también la contestaba, y tener dos formas de preguntar lo mismo fue
// exactamente lo que permitió el bug del 10/09/2026 (un cliente enrutado al
// flujo de stock). Si necesitás saber el rol de un número: `esCarniceroAutorizado`.

// Devuelve TODOS los números activos del carnicero de una carnicería —
// se usa para mandarle el mensaje de aprobación de un pedido nuevo a
// cualquiera de los empleados autorizados, no a uno fijo.
export async function obtenerNumerosCarnicero(carniceriaId: string): Promise<string[]> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("numeros_carnicero")
    .select("telefono")
    .eq("carniceria_id", carniceriaId)
    .eq("activo", true);

  if (error) {
    console.error("Error obteniendo numeros_carnicero", error);
    return [];
  }

  return (data ?? []).map((fila) => fila.telefono as string);
}
