import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================
// Alta de una carnicería con Embedded Signup
// ============================================================
//
// Es el paso D4 del plan de producción, y el punto más frágil de toda la
// integración con Meta:
//
//   El flujo de Embedded Signup devuelve al navegador un CÓDIGO DE UN SOLO USO
//   que vive unos 30 SEGUNDOS. Hay que canjearlo por el token permanente
//   inmediatamente y DEL LADO DEL SERVIDOR. Si el canje se hace tarde, o desde
//   el navegador, el alta se pierde y hay que rehacerla.
//
// Por eso el navegador solo transporta el código hasta acá y nada más: el
// secreto de la app nunca sale del servidor, y el token de la carnicería
// tampoco vuelve al cliente.
//
// El otro error clásico, que no da ningún síntoma hasta que es tarde: si no se
// suscribe la app a los webhooks de esa cuenta (paso D5), el alta figura
// exitosa pero los mensajes de esa carnicería NUNCA LLEGAN. Por eso la
// suscripción es parte de esta misma función y no un paso aparte que alguien
// se pueda olvidar.

const VERSION_GRAPH = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const BASE_GRAPH = `https://graph.facebook.com/${VERSION_GRAPH}`;

export type ResultadoAlta = {
  ok: boolean;
  mensaje: string;
  /** Detalle técnico, para el panel de administración. Nunca se muestra al carnicero. */
  detalle?: string | null;
};

/** ¿Están cargadas las variables que hacen falta para que el alta funcione? */
export function altaConfigurada(): boolean {
  return Boolean(
    process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID
  );
}

/** Lo que necesita el navegador para abrir el flujo. Nada de esto es secreto. */
export function configuracionPublicaDelAlta(): { appId: string; configId: string } | null {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  if (!appId || !configId) return null;
  return { appId, configId };
}

/**
 * Canjea el código de un solo uso por el token permanente de la carnicería,
 * guarda las credenciales y suscribe los webhooks.
 *
 * Todo pasa del lado del servidor y en el mismo request: el código no se guarda
 * en ningún lado ni se pasa a una cola, porque para cuando esa cola lo procese
 * ya habría vencido.
 */
export async function completarAlta(params: {
  carniceriaId: string;
  /** Código de un solo uso que devuelve el flujo de Meta. Vence en ~30 segundos. */
  codigo: string;
  wabaId: string;
  phoneNumberId: string;
  /** Número en formato legible, si el flujo lo devolvió. */
  telefonoMostrado?: string | null;
}): Promise<ResultadoAlta> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return {
      ok: false,
      mensaje: "Falta configurar la aplicación de Meta.",
      detalle: "META_APP_ID o META_APP_SECRET no están en las variables de entorno.",
    };
  }

  const supabaseAdmin = getSupabaseAdmin();

  await supabaseAdmin
    .from("carnicerias")
    .update({ alta_estado: "conectando" })
    .eq("id", params.carniceriaId);

  // ------------------------------------------------------------
  // 1. Canjear el código por el token. Contrarreloj.
  // ------------------------------------------------------------
  let token: string;
  try {
    const url = new URL(`${BASE_GRAPH}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("code", params.codigo);

    const respuesta = await fetch(url, { method: "GET" });
    const cuerpo = (await respuesta.json()) as {
      access_token?: string;
      error?: { message?: string };
    };

    if (!respuesta.ok || !cuerpo.access_token) {
      const detalle = cuerpo.error?.message ?? `status ${respuesta.status}`;
      await marcarError(params.carniceriaId, detalle);
      return {
        ok: false,
        mensaje:
          "No se pudo completar la conexión. Si tardaste más de medio minuto en la pantalla de Meta, el código venció: probá de nuevo desde el principio.",
        detalle,
      };
    }

    token = cuerpo.access_token;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await marcarError(params.carniceriaId, detalle);
    return { ok: false, mensaje: "No se pudo hablar con Meta. Probá de nuevo.", detalle };
  }

  // ------------------------------------------------------------
  // 2. Guardar las credenciales ANTES de suscribir los webhooks.
  // ------------------------------------------------------------
  // Si la suscripción falla, al menos el token no se perdió y se puede
  // reintentar solo ese paso desde el panel de administración, sin volver a
  // pasar por el flujo de Meta con el carnicero delante.
  const ahora = new Date().toISOString();
  const { error: errorGuardar } = await supabaseAdmin
    .from("carnicerias")
    .update({
      whatsapp_proveedor: "meta",
      whatsapp_token: token,
      whatsapp_token_actualizado_at: ahora,
      whatsapp_waba_id: params.wabaId,
      whatsapp_phone_number_id: params.phoneNumberId,
      whatsapp_conectado_at: ahora,
      whatsapp_ultima_actividad_at: ahora,
      alta_estado: "conectando",
      ...(params.telefonoMostrado ? { telefono_whatsapp: `whatsapp:+${params.telefonoMostrado.replace(/\D/g, "")}` } : {}),
    })
    .eq("id", params.carniceriaId);

  if (errorGuardar) {
    return {
      ok: false,
      mensaje: "Se conectó con Meta pero no se pudo guardar. Avisanos antes de reintentar.",
      detalle: errorGuardar.message,
    };
  }

  // ------------------------------------------------------------
  // 3. Suscribir la app a los webhooks de ESA cuenta.
  // ------------------------------------------------------------
  const suscripcion = await suscribirWebhooks({ wabaId: params.wabaId, token });

  if (!suscripcion.ok) {
    return {
      ok: false,
      mensaje:
        "El número quedó conectado pero falta un último paso técnico. No lo uses todavía: avisanos y lo terminamos.",
      detalle: suscripcion.detalle,
    };
  }

  await supabaseAdmin
    .from("carnicerias")
    .update({
      alta_estado: "conectada",
      alta_completada_at: ahora,
      webhooks_suscritos_at: new Date().toISOString(),
    })
    .eq("id", params.carniceriaId);

  return { ok: true, mensaje: "Listo, el WhatsApp quedó conectado." };
}

/**
 * Paso D5. Sin esto los mensajes de la carnicería nunca llegan al webhook,
 * aunque todo lo demás figure correcto. Es el fallo más silencioso del proceso.
 *
 * Se expone aparte para poder reintentarlo desde el panel de administración sin
 * rehacer el alta entera.
 */
export async function suscribirWebhooks(params: {
  wabaId: string;
  token: string;
}): Promise<{ ok: boolean; detalle: string | null }> {
  try {
    const respuesta = await fetch(`${BASE_GRAPH}/${params.wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.token}` },
    });

    const cuerpo = (await respuesta.json()) as { success?: boolean; error?: { message?: string } };

    if (!respuesta.ok || cuerpo.success === false) {
      return { ok: false, detalle: cuerpo.error?.message ?? `status ${respuesta.status}` };
    }

    return { ok: true, detalle: null };
  } catch (err) {
    return { ok: false, detalle: err instanceof Error ? err.message : String(err) };
  }
}

/** Reintenta solo la suscripción de webhooks de una carnicería ya conectada. */
export async function reintentarSuscripcion(carniceriaId: string): Promise<ResultadoAlta> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data } = await supabaseAdmin
    .from("carnicerias")
    .select("whatsapp_waba_id, whatsapp_token")
    .eq("id", carniceriaId)
    .maybeSingle();

  if (!data?.whatsapp_waba_id || !data?.whatsapp_token) {
    return {
      ok: false,
      mensaje: "Esa carnicería todavía no tiene credenciales de Meta guardadas.",
    };
  }

  const resultado = await suscribirWebhooks({
    wabaId: data.whatsapp_waba_id as string,
    token: data.whatsapp_token as string,
  });

  if (!resultado.ok) {
    return { ok: false, mensaje: "No se pudo suscribir.", detalle: resultado.detalle };
  }

  await supabaseAdmin
    .from("carnicerias")
    .update({
      webhooks_suscritos_at: new Date().toISOString(),
      alta_estado: "conectada",
      alta_completada_at: new Date().toISOString(),
    })
    .eq("id", carniceriaId);

  return { ok: true, mensaje: "Webhooks suscritos." };
}

async function marcarError(carniceriaId: string, detalle: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("carnicerias")
      .update({ alta_estado: "error", notas_internas: detalle.slice(0, 500) })
      .eq("id", carniceriaId);
  } catch (err) {
    console.error("No se pudo registrar el error del alta", err);
  }
}
