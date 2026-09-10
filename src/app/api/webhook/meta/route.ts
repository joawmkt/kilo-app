import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  estadoEnvioDesdeMeta,
  marcarLeidoMeta,
  normalizarWebhookMeta,
  resolverDesafioVerificacion,
  verificarFirmaMeta,
} from "@/lib/whatsapp/meta";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import {
  actualizarEstadoEnvio,
  carniceriaPorPhoneNumberId,
  enviarWhatsapp,
  resolverConfigWhatsapp,
} from "@/lib/whatsapp";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// La ventana de agrupación (especificación, sección 34) hace que el trabajo en
// `after` dure unos segundos más de lo que duraba antes. El default de Vercel
// es corto; sin esto, un bloque con audio + interpretación puede cortarse por
// la mitad y el cliente se queda sin respuesta.
export const maxDuration = 60;

// ============================================================
// Webhook de la WhatsApp Cloud API de Meta
// ============================================================
//
// Convive con /api/webhook/whatsapp (Twilio) durante la migración: cada
// carnicería apunta a uno u otro según `carnicerias.whatsapp_proveedor`.
//
// Tres diferencias con el webhook de Twilio que cambian la forma del código:
//
//   1. Meta valida el alta con un GET (`hub.challenge`), no solo con un POST.
//   2. La firma es HMAC-SHA256 del cuerpo CRUDO con el app secret. Si se parsea
//      el JSON y se vuelve a serializar, la firma no coincide nunca.
//   3. No existe TwiML: la respuesta al cliente NO se devuelve en el cuerpo de
//      este request, se manda con una llamada aparte a la API. Meta espera un
//      200 rápido y reintenta si no lo recibe — por eso se contesta 200 primero
//      y el trabajo pesado (transcribir, interpretar, responder) va en `after`.

/** Alta del webhook: Meta pega un GET y espera que le devolvamos su desafío. */
export async function GET(request: NextRequest) {
  const challenge = resolverDesafioVerificacion(request.nextUrl.searchParams);

  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Si no es una verificación, sirve para chequear a ojo que la ruta está viva.
  if (!request.nextUrl.searchParams.has("hub.mode")) {
    return NextResponse.json({ ok: true, service: "carnicom whatsapp webhook (meta)" });
  }

  return NextResponse.json({ error: "verify token inválido" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const cuerpoCrudo = await request.text();

  if (!verificarFirmaMeta(cuerpoCrudo, request.headers.get("x-hub-signature-256"))) {
    console.warn("Firma de Meta inválida — mensaje descartado");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpoCrudo);
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const cambios = normalizarWebhookMeta(payload);

  // Se contesta 200 ya mismo y se procesa después. Meta reintenta el envío si
  // no recibe respuesta rápido, y un reintento sobre un mensaje que ya se está
  // procesando termina en pedidos duplicados.
  after(async () => {
    for (const cambio of cambios) {
      try {
        await procesarCambio(cambio);
      } catch (err) {
        console.error("Error procesando un cambio del webhook de Meta", err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}

async function procesarCambio(cambio: ReturnType<typeof normalizarWebhookMeta>[number]) {
  // Los avisos de estado (enviado / entregado / leído / falló) no dependen de
  // ninguna carnicería: se enganchan por el ID del mensaje.
  for (const estado of cambio.estados) {
    const normalizado = estadoEnvioDesdeMeta(estado.estado);
    if (!normalizado) continue;
    await actualizarEstadoEnvio({
      proveedorMensajeId: estado.proveedorMensajeId,
      estado: normalizado,
      error: estado.error,
    });
  }

  if (cambio.mensajes.length === 0) return;

  if (!cambio.phoneNumberId) {
    console.error("Webhook de Meta sin phone_number_id — no se puede saber de qué carnicería es");
    return;
  }

  const carniceria = await carniceriaPorPhoneNumberId(cambio.phoneNumberId);

  if (!carniceria) {
    // Pasa mientras se da de alta un número nuevo: Meta ya manda eventos pero
    // todavía no se cargó el Phone Number ID en `carnicerias`. Se avisa fuerte
    // porque, si no, el síntoma es "el bot no contesta" sin ninguna pista.
    console.error(
      `Llegó un mensaje para el phone_number_id ${cambio.phoneNumberId} pero ninguna carnicería lo tiene cargado en whatsapp_phone_number_id.`
    );
    return;
  }

  const config = await resolverConfigWhatsapp(carniceria.id);
  const telefonoCarniceria = config.telefonoWhatsapp ?? cambio.phoneNumberId;

  // La coexistencia se corta si nadie abre la app de WhatsApp en el celular al
  // menos una vez cada 14 días. Cada evento del webhook es prueba de que el
  // número sigue vivo, así que se aprovecha para dejar la marca de actividad.
  await marcarActividadWhatsapp(carniceria.id);

  for (const mensaje of cambio.mensajes) {
    try {
      // Los dos tildes azules del lado del cliente. Es cortesía; si falla no
      // afecta al resto.
      if (!mensaje.esEcoDelNegocio && mensaje.proveedorMensajeId) {
        await marcarLeidoMeta({
          phoneNumberId: cambio.phoneNumberId,
          mensajeId: mensaje.proveedorMensajeId,
        });
      }

      const resultado = await procesarMensajeEntrante({
        carniceriaId: carniceria.id,
        telefonoCarniceria,
        mensaje,
        rawPayload: mensaje,
      });

      if (!resultado?.respuesta) continue;

      await enviarWhatsapp({
        carniceriaId: carniceria.id,
        hacia: mensaje.telefono,
        cuerpo: resultado.respuesta,
        origen: "bot",
      });
    } catch (err) {
      // Una falla interpretando (Whisper o Claude caídos, por ejemplo) no debe
      // dejar al cliente hablando solo: el mensaje ya quedó guardado y se le
      // avisa que hubo un problema técnico.
      console.error("Error procesando un mensaje entrante de Meta", err);
      try {
        await enviarWhatsapp({
          carniceriaId: carniceria.id,
          hacia: mensaje.telefono,
          cuerpo: "Tuve un problema técnico procesando tu mensaje. Probá de nuevo en un rato.",
          origen: "bot",
        });
      } catch (errAviso) {
        console.error("Tampoco se pudo avisar del problema técnico", errAviso);
      }
    }
  }
}

async function marcarActividadWhatsapp(carniceriaId: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("carnicerias")
      .update({ whatsapp_ultima_actividad_at: new Date().toISOString() })
      .eq("id", carniceriaId);
  } catch (err) {
    console.error("No se pudo actualizar la última actividad de WhatsApp", err);
  }
}
