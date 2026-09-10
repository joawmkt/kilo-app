import { getSupabaseAdmin } from "./supabaseAdmin";
import { TELEFONO_CARNICERO_SIMULADO, TELEFONO_CLIENTE_SIMULADO } from "./simulador";
import { mismoTelefono } from "./whatsapp/telefonos";

// ============================================================
// Quién es el que está escribiendo
// ============================================================
//
// REGLA INNEGOCIABLE: el bot NUNCA puede confundir a un cliente con el
// carnicero. Un cliente que cae en el flujo de stock le toca la mercadería a la
// carnicería sin querer; un carnicero que cae en el flujo de pedidos se pone a
// hacerse un pedido a sí mismo. Las dos cosas son inaceptables.
//
// Por eso esta pregunta se contesta en UN SOLO LUGAR —acá— y todos los caminos
// pasan por acá: los dos webhooks, el simulador y los flujos mismos, que además
// vuelven a chequear por las suyas (ver `flujoStock.ts` y `flujoPedidos.ts`).
//
// El bug del 10/09/2026 que motivó este archivo: el simulador tenía su propio
// enrutamiento a mano y decidía el rol a partir del teléfono que mandaba el
// navegador en un campo oculto. Cuando el panel reusó la misma instancia de
// React para las dos solapas, los mensajes del cliente salieron por la acción
// del carnicero y terminaron cargando stock desde el hilo del cliente. La
// lección no es "arreglar la solapa": es que el rol no se decide con un dato que
// viene del navegador ni se decide dos veces en dos lugares distintos.

export type Rol = "carnicero" | "cliente";

/**
 * ¿Este número es el carnicero (o un empleado autorizado) de esta carnicería?
 *
 * Tres reglas, en este orden y sin excepciones:
 *
 * 1. El número del CLIENTE simulado nunca es carnicero. Va primero para que
 *    ningún alta mal hecha en `numeros_carnicero` lo pueda volver carnicero.
 * 2. El número del CARNICERO simulado es carnicero solo si la carnicería está
 *    en modo simulado. Así el simulador recorre el mismo enrutamiento que la
 *    vida real sin dejar un permiso de verdad abierto: el día que se conecta
 *    Meta, ese número deja de valer solo.
 * 3. Cualquier otro número: manda `numeros_carnicero`.
 */
export async function esCarniceroAutorizado(
  carniceriaId: string,
  telefono: string
): Promise<boolean> {
  if (mismoTelefono(telefono, TELEFONO_CLIENTE_SIMULADO)) return false;

  if (mismoTelefono(telefono, TELEFONO_CARNICERO_SIMULADO)) {
    return await estaEnModoSimulado(carniceriaId);
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("numeros_carnicero")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    // Si falla la consulta, se trata el mensaje como de un cliente (nunca al
    // revés): un cliente mal enrutado al flujo de stock podría alterar
    // `productos.stock_actual` sin querer, y eso no se deshace solo.
    console.error("Error consultando numeros_carnicero", error);
    return false;
  }

  return Boolean(data);
}

export async function rolDelTelefono(carniceriaId: string, telefono: string): Promise<Rol> {
  return (await esCarniceroAutorizado(carniceriaId, telefono)) ? "carnicero" : "cliente";
}

async function estaEnModoSimulado(carniceriaId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("carnicerias")
    .select("whatsapp_proveedor")
    .eq("id", carniceriaId)
    .maybeSingle();

  if (error) {
    console.error("Error consultando el proveedor de WhatsApp", error);
    return false;
  }

  return data?.whatsapp_proveedor === "simulado";
}
