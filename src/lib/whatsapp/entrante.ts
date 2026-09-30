import {
  procesarTextoDeStock,
  procesarTextoEntrante,
  transcribirAudioDeCarnicero,
} from "@/lib/flujoStock";
import { partirInstrucciones } from "@/lib/instrucciones";
import { cargarCatalogo, nombreDichoPor } from "@/lib/catalogo";
import {
  procesarDecisionCarnicero,
  procesarTextoDePedido,
  transcribirAudioDeCliente,
} from "@/lib/flujoPedidos";
import { esCarniceroAutorizado } from "@/lib/quienEs";
import { probarComoLote, probarCorreccionDeLote } from "@/lib/flujoLotes";
import { probarComoTrozado } from "@/lib/flujoTrozado";
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

    // Audio y texto van por el MISMO camino: el audio se transcribe y listo.
    let texto = mensaje.texto ?? null;
    if (mensaje.tipo === "audio" && mensaje.media) {
      const transcripcion = await transcribirAudioDeCarnicero({ carniceriaId, telefono, media: mensaje.media });
      if (!transcripcion) return null;
      if (!transcripcion.ok) return transcripcion.mensaje;
      // Queda en el hilo como texto: así el historial (y el panel) lo ven.
      await guardarTranscripcion(mensajeId, transcripcion.texto);
      texto = transcripcion.texto;
    }
    if (!texto) return null;

    return await atenderCarniceroConCola({ carniceriaId, telefono, mensajeId, texto });
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


// ============================================================
// El carnicero: una instrucción a la vez, sin perder ninguna
// ============================================================

/**
 * Todo lo que el bot sabe hacer con UNA instrucción del carnicero, en orden de
 * prioridad. Es el mismo orden de siempre; solo se sacó a una función para
 * poder llamarlo una vez por instrucción.
 */
async function atenderInstruccionDeCarnicero(params: {
  carniceriaId: string;
  telefono: string;
  mensajeId: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeId, texto } = params;

  // Prioridad: si hay una operación de stock pendiente, el texto es sobre
  // ESA (comportamiento sin cambios desde la Etapa 2). Solo si no hay nada
  // de stock pendiente se prueba si es una decisión sobre un pedido.
  const respuestaStock = await procesarTextoEntrante({ carniceriaId, telefono, mensajeWhatsappId: mensajeId, texto });
  if (respuestaStock !== null) return respuestaStock;

  const respuestaDecision = await procesarDecisionCarnicero({ carniceriaId, carniceroTelefono: telefono, texto });
  if (respuestaDecision !== null) return respuestaDecision;

  // "Eran dos cajones" justo después de cargar uno: no llegaron dos más, le
  // faltó uno a lo que se acaba de cargar (ver probarCorreccionDeLote).
  const respuestaCorreccion = await probarCorreccionDeLote({ carniceriaId, telefono, texto });
  if (respuestaCorreccion !== null) return respuestaCorreccion;

  // ¿Está avisando que entró mercadería (media res, media res de cerdo o cajón
  // de pollo)? Va ANTES del flujo de stock genérico porque son dos operaciones
  // distintas: una carga de stock SUMA kilos a un producto, una media res
  // TRANSFORMA (entra una pieza grande y salen 28 cortes, hueso, grasa y
  // merma). Si esto devuelve null, el mensaje sigue de largo y no se pierde.
  const respuestaLote = await probarComoLote({ carniceriaId, telefono, mensajeWhatsappId: mensajeId, texto });
  if (respuestaLote !== null) return respuestaLote;

  // ¿Está contando que trozó pollo? ("trocé 3 pollos y saqué 2,700 de
  // pechuga"). Va antes del stock genérico por la misma razón que el lote:
  // trozar no suma kilos, TRANSFORMA pollos enteros en presas.
  const respuestaTrozado = await probarComoTrozado({ carniceriaId, telefono, mensajeWhatsappId: mensajeId, texto });
  if (respuestaTrozado !== null) return respuestaTrozado;

  // Último recurso: se trata como el arranque de una carga de stock. Un
  // carnicero que escribe "entraron 20 kilos de asado" no queda sin respuesta.
  return await procesarTextoDeStock({ carniceriaId, telefono, mensajeWhatsappId: mensajeId, texto });
}

type PendienteConCola = { id: string; cola: string[] };

async function pendienteConCola(carniceriaId: string, telefono: string): Promise<PendienteConCola | null> {
  const { data } = await getSupabaseAdmin()
    .from("operaciones_stock")
    .select("id, cola_instrucciones")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .in("estado", ["pendiente_aclaracion", "pendiente_confirmacion", "pendiente_modificacion"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, cola: ((data.cola_instrucciones as string[] | null) ?? []).filter(Boolean) };
}

/**
 * Varias instrucciones en un mismo mensaje (29/09/2026).
 *
 * "Llegó una media res de 104, un cajón de pollo de 8 y piqué 5 de nalga" son
 * tres trabajos, y el bot solo puede tener UNO pendiente a la vez (así el "sí"
 * del carnicero nunca es ambiguo). Entonces:
 *   1. se parte el mensaje (`partirInstrucciones`),
 *   2. se atiende la primera,
 *   3. las demás esperan en la fila de la operación que quedó pendiente
 *      (columna `cola_instrucciones`, migración 0028),
 *   4. cuando esa operación se cierra (la confirmó o la canceló), en el MISMO
 *      mensaje de respuesta se arranca con la siguiente.
 * El carnicero nunca tiene que repetir nada.
 */
async function atenderCarniceroConCola(params: {
  carniceriaId: string;
  telefono: string;
  mensajeId: string;
  texto: string;
  heredada?: string[];
  vuelta?: number;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeId, texto, heredada = [], vuelta = 0 } = params;

  const antes = await pendienteConCola(carniceriaId, telefono);

  // El catálogo solo se carga si el mensaje tiene más de un pedazo posible.
  let instrucciones = partirInstrucciones(texto);
  if (instrucciones.length === 1 && /[,.;\n]|\s(y|e|despues|después|ademas|además|tambien|también)\s/i.test(texto)) {
    try {
      const catalogo = await cargarCatalogo(carniceriaId);
      instrucciones = partirInstrucciones(texto, (pedazo) => catalogo.productos.some((p) => nombreDichoPor(p, pedazo)));
    } catch {
      // Sin catálogo se parte igual, solo que sin reconocer productos sueltos.
    }
  }
  const [primera, ...resto] = instrucciones.length > 0 ? instrucciones : [texto];

  const respuesta = await atenderInstruccionDeCarnicero({ carniceriaId, telefono, mensajeId, texto: primera });

  const despues = await pendienteConCola(carniceriaId, telefono);
  const sigueLaMisma = antes !== null && despues !== null && antes.id === despues.id;
  const cola = sigueLaMisma
    ? [...antes.cola, ...resto, ...heredada]
    : [...resto, ...(antes ? antes.cola : []), ...heredada];

  if (cola.length === 0) return respuesta;

  if (despues) {
    // Algo quedó esperando respuesta: la fila espera con ello.
    await getSupabaseAdmin().from("operaciones_stock").update({ cola_instrucciones: cola }).eq("id", despues.id);
    const aviso =
      resto.length > 0
        ? `\n\n(Después seguimos con ${cola.map((c) => `«${c}»`).join(" y ")}, no me olvido.)`
        : "";
    return `${respuesta ?? ""}${aviso}`.trim() || null;
  }

  // No quedó nada pendiente: se sigue con la próxima de la fila ahora mismo.
  if (vuelta >= 5) return respuesta;
  const [siguiente, ...demas] = cola;
  const respuestaSiguiente = await atenderCarniceroConCola({
    carniceriaId,
    telefono,
    mensajeId,
    texto: siguiente,
    heredada: demas,
    vuelta: vuelta + 1,
  });
  return [respuesta, respuestaSiguiente].filter((r): r is string => Boolean(r && r.trim())).join("\n\n—\n\n") || null;
}

