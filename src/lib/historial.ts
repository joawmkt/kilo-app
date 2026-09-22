import { getSupabaseAdmin } from "./supabaseAdmin";

// ============================================================
// Lo que se habló recién — la memoria de corto plazo del bot
// ============================================================
//
// Pedido del fundador (22/09/2026), con razón y con bronca: "quiero que el bot
// tenga contexto y no se olvide de las cosas".
//
// Hasta acá, cada vez que llegaba un mensaje, a la IA se le mandaba SOLO ese
// mensaje más un resumen armado por el código ("items a medio armar", "pregunta
// pendiente"). Si ese resumen perdía algo —y lo perdía: un solo item a medio
// armar, un mensaje mal interpretado que lo pisaba—, la IA no tenía de dónde
// recuperarlo. Es como hablar con alguien que en cada frase solo lee un
// post-it: "vacuno" no significa nada si el post-it ya no dice "piqué 3 kg de
// vacío para picada especial".
//
// Ahora, además del resumen, la IA recibe los últimos mensajes de la
// conversación tal cual se dijeron (los guarda `mensajes_whatsapp`, que ya
// existía para el panel). Dos capas, y cada una cubre lo que la otra no:
//
//   - El RESUMEN estructurado manda: es el estado real (qué está pendiente de
//     confirmar, qué ya se cargó). La IA no puede "decidir" que algo ya se
//     confirmó porque lo leyó en el historial.
//   - El HISTORIAL es la red: si el resumen perdió un dato, está ahí escrito.
//
// Límites a propósito: los últimos 12 mensajes de las últimas 3 horas. Más
// atrás ya es otra conversación (lo de ayer no es contexto de lo de hoy), y un
// historial largo confunde más de lo que ayuda.

const MAXIMO_MENSAJES = 12;
const VENTANA_HORAS = 3;

type Fila = { direccion: string; origen: string | null; cuerpo: string | null; created_at: string };

/**
 * Los últimos mensajes de la conversación, listos para meter en un prompt, o
 * "" si no hay nada.
 *
 * Se sacan los mensajes entrantes del FINAL: son los que se están procesando
 * ahora (el cliente puede mandar varios pegados), y ya van aparte como "el
 * mensaje nuevo". Repetirlos confundiría a la IA sobre qué es lo nuevo.
 */
export async function historialReciente(params: {
  carniceriaId: string;
  telefono: string;
  /** Cómo llamar al interlocutor en el historial: "Carnicero" o "Cliente". */
  quien: "Carnicero" | "Cliente";
}): Promise<string> {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: conversacion } = await supabaseAdmin
      .from("conversaciones")
      .select("id")
      .eq("carniceria_id", params.carniceriaId)
      .eq("telefono", params.telefono)
      .maybeSingle();

    if (!conversacion) return "";

    const desde = new Date(Date.now() - VENTANA_HORAS * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("mensajes_whatsapp")
      .select("direccion, origen, cuerpo, created_at")
      .eq("conversacion_id", conversacion.id)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(MAXIMO_MENSAJES + 6);

    const filas = ((data ?? []) as Fila[]).reverse();

    // Fuera los entrantes del final (el mensaje que se está procesando).
    while (filas.length > 0 && filas[filas.length - 1].direccion === "entrante") filas.pop();

    const lineas = filas
      .filter((f) => f.cuerpo && f.cuerpo.trim())
      .slice(-MAXIMO_MENSAJES)
      .map((f) => {
        const quien = f.direccion === "entrante" ? params.quien : f.origen === "bot" ? "Bot" : "Carnicería";
        return `${quien}: ${f.cuerpo!.trim().replace(/\s+/g, " ").slice(0, 400)}`;
      });

    return lineas.join("\n");
  } catch (err) {
    // El historial es una red de seguridad: si falla, se sigue sin él.
    console.error("No se pudo leer el historial de la conversación", err);
    return "";
  }
}

/** El bloque de prompt con el historial, o "" si no hay. */
export function bloqueHistorial(historial: string): string {
  if (!historial.trim()) return "";
  return `

LO QUE SE HABLÓ RECIÉN EN ESTA CONVERSACIÓN (de lo más viejo a lo más nuevo, el mensaje nuevo NO está acá):
${historial}

Cómo usar esto:
- Sirve para entender a QUÉ se refiere el mensaje nuevo. Si el mensaje nuevo es corto ("vacuno", "especial",
  "8", "sí, de cerdo") casi siempre contesta la ÚLTIMA pregunta del Bot de arriba: completá con eso lo que se
  venía hablando.
- NUNCA vuelvas a preguntar algo que ya está contestado acá arriba (una cantidad, un corte, una hora, cuántas
  personas). Si el dato está, usalo.
- NUNCA pierdas un producto o una cantidad que se dijo acá arriba y que sigue sin cargarse o sin confirmarse.
- Si el historial y el CONTEXTO estructurado dicen cosas distintas sobre qué está confirmado o cargado, manda
  el contexto estructurado: el historial es solo para no olvidarte de lo que se dijo.`;
}
