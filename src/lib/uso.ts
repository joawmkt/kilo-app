import { getSupabaseAdmin } from "./supabaseAdmin";

// Conteo de uso por carnicería y por mes.
//
// Es el punto F3 del plan de producción: "instrumentar el conteo desde el
// primer día. Sin eso el precio del tier es una adivinanza." Los mensajes se
// podrían derivar de `mensajes_whatsapp`, pero los minutos de audio
// transcriptos y las llamadas de interpretación no quedan registrados en ningún
// lado — y son justo los otros dos costos variables del producto.
//
// La suma la hace una función de Postgres (`sumar_uso`, migración 0014) en una
// sola sentencia atómica: dos mensajes que entran a la vez no pueden pisarse el
// contador.
//
// Nada de esto puede tirar abajo el flujo que lo llamó: un pedido que no se toma
// porque falló un contador sería un pésimo intercambio.

export type CampoDeUso =
  | "mensajes_enviados"
  | "mensajes_recibidos"
  | "plantillas_enviadas"
  | "audios_transcriptos"
  | "segundos_audio"
  | "interpretaciones";

export async function sumarUso(
  carniceriaId: string,
  campo: CampoDeUso,
  cantidad = 1
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().rpc("sumar_uso", {
      p_carniceria_id: carniceriaId,
      p_campo: campo,
      p_cantidad: cantidad,
    });

    if (error) console.error("No se pudo sumar el uso", { campo, error });
  } catch (err) {
    console.error("No se pudo sumar el uso", { campo, err });
  }
}
