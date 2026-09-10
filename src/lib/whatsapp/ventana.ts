import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================
// Ventana de agrupación de mensajes — especificación, sección 34
// ============================================================
//
// El problema real: nadie escribe un pedido en un solo mensaje. Escribe
// "quiero vacío", después "2 kilos", después "y 6 chorizos", después "para hoy
// tipo 8". Si el bot contesta cada uno por separado, la conversación queda
// picada, el bot vuelve a preguntar cosas que el cliente ya estaba por decir,
// y encima —desde el 1/10— cada burbuja se factura aparte.
//
// La solución de la sección 34 es esperar unos segundos desde el ÚLTIMO
// mensaje, y recién ahí interpretar todo el bloque junto. Cada mensaje nuevo
// reinicia el contador.
//
// ============================================================
// Cómo está implementado, y por qué así
// ============================================================
//
// No hay una cola ni un servicio aparte: cada mensaje que llega abre su propia
// espera, y al despertarse se pregunta "¿soy todavía el último?".
//
//   - Si NO lo es (llegó otro mientras dormía), se va sin hacer nada: el otro
//     va a despertarse después y va a procesar el bloque entero, incluido este
//     mensaje.
//   - Si SÍ lo es, junta todos los mensajes sin procesar de la conversación,
//     los marca como consumidos y devuelve el texto de todos junto.
//
// La ventaja de esta forma es que no necesita infraestructura nueva (ni colas,
// ni un cron cada pocos segundos, que además ni Vercel ni GitHub Actions
// permiten en el plan gratuito). La condición para que funcione es que el
// marcado sea atómico, y lo es: el `update ... where procesado_at is null`
// devuelve solo las filas que ESTE proceso ganó. Si dos se despertaran a la
// vez, uno se lleva los mensajes y el otro recibe una lista vacía y se va.
//
// El precio es que el proceso queda vivo esos segundos. Por eso los dos
// webhooks contestan primero y hacen este trabajo en segundo plano (`after`):
// Meta corta a los pocos segundos y reintenta, y un reintento significaría
// procesar el mismo mensaje dos veces.

/**
 * Cuánto esperar desde el último mensaje antes de contestar.
 *
 * La especificación dice 20 segundos; el fundador eligió 6 (10/09/2026) para
 * que el bot no se sienta lento: agrupa las ráfagas reales de WhatsApp, que es
 * el caso que importa, sin dejar al cliente mirando la pantalla.
 *
 * Se puede mover sin tocar código con VENTANA_AGRUPACION_SEGUNDOS.
 */
export const VENTANA_SEGUNDOS = Number(process.env.VENTANA_AGRUPACION_SEGUNDOS ?? "6");

/**
 * Solo se agrupan mensajes recientes. Si el proceso que tenía que despertarse
 * se murió (un deploy en el medio, por ejemplo), sus mensajes quedan con
 * `procesado_at` en null para siempre — y sin este tope, el próximo mensaje
 * del cliente arrastraría esa conversación vieja como si fuera de recién.
 */
const ANTIGUEDAD_MAXIMA_MINUTOS = 10;

type MensajePendiente = {
  id: string;
  cuerpo: string | null;
  tipo: string;
};

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BloqueAgrupado = {
  /** El texto de todos los mensajes del bloque, en orden, unido por saltos de línea. */
  texto: string;
  /** Ids de los mensajes que quedaron consumidos por este bloque. */
  mensajeIds: string[];
};

/**
 * Espera la ventana y devuelve el bloque de mensajes a interpretar, o `null`
 * si otro mensaje posterior se hizo cargo (y entonces acá no hay nada que
 * hacer ni nada que contestar).
 */
export async function esperarYAgrupar(params: {
  conversacionId: string;
  mensajeId: string;
}): Promise<BloqueAgrupado | null> {
  const { conversacionId, mensajeId } = params;
  const supabaseAdmin = getSupabaseAdmin();

  if (VENTANA_SEGUNDOS > 0) {
    await dormir(VENTANA_SEGUNDOS * 1000);
  }

  const desde = new Date(Date.now() - ANTIGUEDAD_MAXIMA_MINUTOS * 60 * 1000).toISOString();

  const { data: pendientes, error } = await supabaseAdmin
    .from("mensajes_whatsapp")
    .select("id, cuerpo, tipo, created_at")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .is("procesado_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true });

  if (error) {
    // Si no podemos leer la cola, es preferible procesar solo este mensaje que
    // dejar al cliente sin respuesta.
    console.error("Error leyendo mensajes pendientes de agrupar", error);
    return null;
  }

  const lista = (pendientes ?? []) as (MensajePendiente & { created_at: string })[];
  if (lista.length === 0) return null;

  // ¿Llegó alguno después del mío? Entonces ese va a despertarse más tarde y
  // se va a llevar el bloque entero. Me voy sin contestar.
  const ultimo = lista[lista.length - 1];
  if (ultimo.id !== mensajeId) return null;

  const ids = lista.map((m) => m.id);

  // Marcado atómico: solo me llevo los que todavía nadie consumió.
  const { data: ganados } = await supabaseAdmin
    .from("mensajes_whatsapp")
    .update({ procesado_at: new Date().toISOString() })
    .in("id", ids)
    .is("procesado_at", null)
    .select("id");

  const ganadosIds = new Set((ganados ?? []).map((m) => m.id as string));
  if (ganadosIds.size === 0) return null;

  const textos = lista
    .filter((m) => ganadosIds.has(m.id))
    .map((m) => (m.cuerpo ?? "").trim())
    .filter((t) => t.length > 0);

  if (textos.length === 0) return null;

  return { texto: textos.join("\n"), mensajeIds: Array.from(ganadosIds) };
}

/**
 * Marca un mensaje como consumido sin pasar por la ventana. Se usa para todo lo
 * que NO se agrupa (los mensajes del carnicero, los audios), para que no queden
 * dando vueltas como pendientes y se cuelen en el próximo bloque de un cliente.
 */
export async function marcarProcesado(mensajeId: string): Promise<void> {
  await getSupabaseAdmin()
    .from("mensajes_whatsapp")
    .update({ procesado_at: new Date().toISOString() })
    .eq("id", mensajeId);
}
