import { getSupabaseAdmin } from "./supabaseAdmin";

// Etapa 3, Paso 0 — quién es "el carnicero" (o uno de sus empleados
// autorizados) vs un cliente cualquiera que le escribe al mismo número de
// WhatsApp de la carnicería. Ver supabase/migrations/0007_numeros_carnicero.sql.

export async function esNumeroDeCarnicero(carniceriaId: string, telefono: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("numeros_carnicero")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    // Si falla la consulta, preferimos tratar el mensaje como de un cliente
    // (nunca al revés) — un cliente mal enrutado al flujo de stock podría
    // llegar a alterar `productos.stock_actual` sin querer.
    console.error("Error consultando numeros_carnicero", error);
    return false;
  }

  return Boolean(data);
}

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
