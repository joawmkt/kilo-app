import { procesarAudioDeStock, procesarTextoEntrante } from "@/lib/flujoStock";
import {
  procesarAudioDePedido,
  procesarDecisionCarnicero,
  procesarTextoDePedido,
} from "@/lib/flujoPedidos";
import { esNumeroDeCarnicero } from "@/lib/numerosCarnicero";
import { registrarMensaje } from "./conversaciones";
import { aFormatoCanonico } from "./telefonos";
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
// La regla de la Etapa 3 no cambia: un número autorizado en `numeros_carnicero`
// es el carnicero (flujo de stock + decisiones sobre pedidos); cualquier otro
// número es un cliente (flujo de pedidos, nunca el de stock).

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

  const esCarnicero = await esNumeroDeCarnicero(carniceriaId, telefono);

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

  const respuesta = await enrutar({ carniceriaId, telefono, mensajeId, mensaje, esCarnicero });

  return { respuesta, mensajeId, conversacionId };
}

async function enrutar(params: {
  carniceriaId: string;
  telefono: string;
  mensajeId: string;
  mensaje: MensajeEntranteNormalizado;
  esCarnicero: boolean;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeId, mensaje, esCarnicero } = params;

  if (esCarnicero) {
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

      return await procesarDecisionCarnicero({
        carniceriaId,
        carniceroTelefono: telefono,
        texto: mensaje.texto,
      });
    }

    return null;
  }

  if (mensaje.tipo === "audio" && mensaje.media) {
    return await procesarAudioDePedido({
      carniceriaId,
      telefono,
      mensajeWhatsappId: mensajeId,
      media: mensaje.media,
      nombreWhatsapp: mensaje.nombrePerfil,
    });
  }

  if (mensaje.texto) {
    return await procesarTextoDePedido({
      carniceriaId,
      telefono,
      mensajeWhatsappId: mensajeId,
      texto: mensaje.texto,
      nombreWhatsapp: mensaje.nombrePerfil,
    });
  }

  return null;
}
