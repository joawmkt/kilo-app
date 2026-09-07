"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/panel/admin";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { reintentarSuscripcion } from "@/lib/whatsapp/alta";

// Acciones del panel de administración.
//
// Todas empiezan por `requerirAdmin()`. Una Server Action es un endpoint POST
// alcanzable desde afuera: sin ese chequeo, cualquier usuario logueado podría
// cambiarle el proveedor a una carnicería que no es suya.

export type ResultadoAdmin = { ok: boolean; mensaje: string };

/**
 * Reintenta la suscripción a los webhooks de una carnicería ya conectada.
 *
 * Existe porque es el paso que más silenciosamente falla: si no se suscribe, el
 * alta figura exitosa y los mensajes no llegan nunca. Poder reintentarlo solo,
 * sin rehacer el alta entera, evita tener que volver al mostrador con el
 * carnicero y su celular.
 */
export async function accionReintentarWebhooks(carniceriaId: string): Promise<ResultadoAdmin> {
  await requerirAdmin();
  const resultado = await reintentarSuscripcion(carniceriaId);

  revalidatePath("/panel/admin");
  revalidatePath(`/panel/admin/${carniceriaId}`);

  return {
    ok: resultado.ok,
    mensaje: resultado.ok
      ? resultado.mensaje
      : `${resultado.mensaje}${resultado.detalle ? ` (${resultado.detalle})` : ""}`,
  };
}

/**
 * Cambia el proveedor de una carnicería a mano.
 *
 * El camino normal es que lo haga el alta: al conectar por Embedded Signup, la
 * carnicería pasa a `meta` sola. Esto es para el caso contrario — volver a
 * `simulado` para poder probar sin mandarle mensajes a clientes reales, o
 * quedarse en `twilio` si algo de Meta falla y hay que retroceder.
 */
export async function accionCambiarProveedor(
  carniceriaId: string,
  proveedor: "twilio" | "meta" | "simulado"
): Promise<ResultadoAdmin> {
  await requerirAdmin();

  const supabaseAdmin = getSupabaseAdmin();

  if (proveedor === "meta") {
    const { data } = await supabaseAdmin
      .from("carnicerias")
      .select("whatsapp_phone_number_id, whatsapp_token")
      .eq("id", carniceriaId)
      .maybeSingle();

    if (!data?.whatsapp_phone_number_id || !data?.whatsapp_token) {
      return {
        ok: false,
        mensaje:
          "No se puede pasar a Meta sin el Phone Number ID y el token. Hacé el alta desde /panel/conectar.",
      };
    }
  }

  const { error } = await supabaseAdmin
    .from("carnicerias")
    .update({ whatsapp_proveedor: proveedor })
    .eq("id", carniceriaId);

  if (error) return { ok: false, mensaje: "No se pudo cambiar el proveedor." };

  revalidatePath("/panel/admin");
  revalidatePath(`/panel/admin/${carniceriaId}`);
  revalidatePath("/panel", "layout");

  return { ok: true, mensaje: `Ahora anda por ${proveedor}.` };
}
