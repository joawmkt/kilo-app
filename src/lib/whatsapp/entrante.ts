import {
  procesarAudioDeStock,
  procesarTextoDeStock,
  procesarTextoEntrante,
} from "@/lib/flujoStock";
import {
  procesarDecisionCarnicero,
  procesarTextoDePedido,
  transcribirAudioDeCliente,
} from "@/lib/flujoPedidos";
import { esCarniceroAutorizado } from "@/lib/quienEs";
import { registrarMensaje } from "./conversaciones";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { aFormatoCanonico } from "./telefonos";
import { esperarYAgrupar, marcarProcesado } from "./ventana";
import type { MensajeEntranteNormalizado } from "./tipos";

// ============================================================
// Enrutamiento de un mensaje entrante — común a los dos proveedores
// ============================================================
//
// Twilio y Meta difieren en cómo llega el mensaje y en cómo se contesta (TwiML
// sincrónico vs una llamada aparte a la API), pero la decisión de QUÉ hacer con
// el mensaje es idéntica. Vive acá una sola vez para que los dos webhooks no se
// vayan separando con el tiempo.
//
// La regla de la Etapa 3 no cambia: un número autorizado es el carnicero (flujo
// de stock + decisiones sobre pedidos); cualquier otro número es un cliente
// (flujo de pedidos, nunca el de stock). Quién es quién lo decide `quienEs.ts`,
// y NADIE MÁS: ni los webhooks, ni el simulador, ni el panel. Ver el comentario
// de ese archivo para el bug del 10/09/2026 que costó aprender esta regla.

export type ResultadoEntrante = {
  /** Texto con el que hay que contestar, o null si no hay nada que contestar. */
  respuesta: string | null;
  mensajeId: string;
  conversacionId: string;
};

export async function procesarMensajeEntrante(params: {
  carniceriaId: string;
  telefonoCarniceria: string;
  mensaje: MensajeEntranteNormalizado;
  rawPayload?: unknown;
}): Promise<ResultadoEntrante | null> {
  const { carniceriaId, telefonoCarniceria, mensaje, rawPayload } = params;
  const telefono = aFormatoCanonico(mensaje.telefono);

  const esCarnicero = await esCarniceroAutorizado(carniceriaId, telefono);

  // ------------------------------------------------------------
  // Coexistencia: mensajes que el carnicero mandó desde su celular
  // ------------------------------------------------------------
  // Meta los espeja al webhook para que la plataforma tenga la conversación
  // completa. Se guardan (si no, el hilo del panel tendría agujeros y no se
  // entendería nada), pero NUNCA se contestan: del otro lado ya contestó una
  // persona, y responderle encima sería el bot hablando por arriba del dueño.
  if (mensaje.esEcoDelNegocio) {
    const { mensajeId, conversacionId } = await registrarMensaje({
      carniceriaId,
      telefonoInterlocutor: telefono,
      telefonoCarniceria,
      direccion: "saliente",
      tipo: mensaje.tipo,
      cuerpo: mensaje.texto,
      origen: "app_whatsapp",
      esCarnicero,
      proveedorMensajeId: mensaje.proveedorMensajeId,
      estadoEnvio: "enviado",
      rawPayload,
    });
    return { respuesta: null, mensajeId, conversacionId };
  }

  const { mensajeId, conversacionId } = await registrarMensaje({
    carniceriaId,
    telefonoInterlocutor: telefono,
    telefonoCarniceria,
    direccion: "entrante",
    tipo: mensaje.tipo,
    cuerpo: mensaje.texto,
    origen: esCarnicero ? "app_whatsapp" : "cliente",
    esCarnicero,
    mediaUrl: mensaje.media?.referencia ?? null,
    proveedorMensajeId: mensaje.proveedorMensajeId,
    rawPayload,
    // Todo mensaje entrante del interlocutor reinicia la ventana de 24 horas
    // de Meta y suma uno al contador de no leídos del panel.
    reiniciaVentana: true,
  });

  // ------------------------------------------------------------
  // ¿Esta conversación la está atendiendo una persona? (sección 43)
  // ------------------------------------------------------------
  //
  // Es la ÚNICA excepción de la especificación a "el carnicero no habla con el
  // cliente": cuando hubo un error técnico y el carnicero toma la conversación
  // para no perder al cliente. Mientras dura, el bot registra los mensajes
  // (para que el hilo del panel quede completo) pero NO contesta: hablarle por
  // encima a una persona que está atendiendo sería peor que no responder.
  if (!esCarnicero && (await botEnPausa(conversacionId))) {
    await marcarProcesado(mensajeId);
    return { respuesta: null, mensajeId, conversacionId };
  }

  const respuesta = await enrutar({
    carniceriaId,
    telefono,
    mensajeId,
    conversacionId,
    mensaje,
    esCarnicero,
  });

  return { respuesta, mensajeId, conversacionId };
}

async function enrutar(params: {
  carniceriaId: string;
  telefono: string;
  mensajeId: string;
  conversacionId: string;
  mensaje: MensajeEntranteNormalizado;
  esCarnicero: boolean;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeId, conversacionId, mensaje, esCarnicero } = params;

  if (esCarnicero) {
    // El carnicero NO pasa por la ventana de agrupación: sus respuestas son
    // decisiones ("confirmar", "aprobar", "2 y 3") y esperar unos segundos para
    // contestarle sería puro ruido en el mostrador. La sección 34 habla del
    // cliente, que es quien escribe de a pedacitos.
    await marcarProcesado(mensajeId);
    if (mensaje.tipo === "audio" && mensaje.media) {
      return await procesarAudioDeStock({
        carniceriaId,
        telefono,
        mensajeWhatsappId: mensajeId,
        media: mensaje.media,
      });
    }

    if (mensaje.texto) {
      // Prioridad: si hay una operación de stock pendiente, el texto es sobre
      // ESA (comportamiento sin cambios desde la Etapa 2). Solo si no hay nada
      // de stock pendiente se prueba si es una decisión sobre un pedido.
      const respuestaStock = await procesarTextoEntrante({
        carniceriaId,
        telefono,
        mensajeWhatsappId: mensajeId,
        texto: mensaje.texto,
      });
      if (respuestaStock !== null) return respuestaStock;

      const respuestaDecision = await procesarDecisionCarnicero({
        carniceriaId,
        carniceroTelefono: telefono,
        texto: mensaje.texto,
      });
      if (respuestaDecision !== null) return respuestaDecision;

      // Último recurso: un texto suelto del carnicero se trata como el arranque
      // de una carga de stock, igual que un audio suelto.
      //
      // Antes esto vivía SOLO en el simulador, y esa diferencia era una trampa:
      // el simulador contestaba cosas que WhatsApp de verdad ignoraba, así que
      // probar acá no probaba lo mismo que iba a pasar allá. Ahora es un solo
      // camino. De paso, un carnicero que escribe "entraron 20 kilos de asado"
      // en vez de mandar el audio ya no queda sin respuesta.
      return await procesarTextoDeStock({
        carniceriaId,
        telefono,
        mensajeWhatsappId: mensajeId,
        texto: mensaje.texto,
      });
    }

    return null;
  }

  // ------------------------------------------------------------
  // Cliente: pasa por la ventana de agrupación (sección 34)
  // ------------------------------------------------------------
  //
  // Un audio se transcribe ANTES de entrar a la ventana, y su transcripción se
  // guarda como cuerpo del mensaje. Así un audio y un texto mandados pegados se
  // interpretan juntos, que es lo que pide expresamente la sección 34, y de
  // paso la transcripción queda visible en el hilo del panel.
  if (mensaje.tipo === "audio" && mensaje.media) {
    const transcripcion = await transcribirAudioDeCliente(mensaje.media);
    if (!transcripcion.ok) {
      await marcarProcesado(mensajeId);
      return transcripcion.mensaje;
    }
    await guardarTranscripcion(mensajeId, transcripcion.texto);
  } else if (!mensaje.texto) {
    await marcarProcesado(mensajeId);
    return null;
  }

  const bloque = await esperarYAgrupar({ conversacionId, mensajeId });

  // `null` = llegó otro mensaje después y ese se va a hacer cargo del bloque
  // entero. Contestar acá sería hablarle dos veces al cliente por lo mismo.
  if (!bloque) return null;

  return await procesarTextoDePedido({
    carniceriaId,
    telefono,
    mensajeWhatsappId: mensajeId,
    texto: bloque.texto,
    nombreWhatsapp: mensaje.nombrePerfil,
  });
}

/** Deja la transcripción como cuerpo del mensaje, para que se agrupe como texto. */
async function guardarTranscripcion(mensajeId: string, texto: string): Promise<void> {
  await getSupabaseAdmin().from("mensajes_whatsapp").update({ cuerpo: texto }).eq("id", mensajeId);
}


/** ¿El bot está en pausa en esta conversación porque la atiende una persona? */
async function botEnPausa(conversacionId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("conversaciones")
    .select("bot_pausado_hasta")
    .eq("id", conversacionId)
    .maybeSingle();

  const hasta = data?.bot_pausado_hasta as string | null | undefined;
  return Boolean(hasta && new Date(hasta) > new Date());
}
