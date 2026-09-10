"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import { enviarWhatsapp, aFormatoCanonico } from "@/lib/whatsapp";
import { transcribirAudio } from "@/lib/whisper";
import { sumarUso } from "@/lib/uso";
import { TELEFONO_CARNICERO_SIMULADO, TELEFONO_CLIENTE_SIMULADO } from "@/lib/simulador";
import type { MensajeEntranteNormalizado } from "@/lib/whatsapp/tipos";

// El simulador: escribirle al bot como si fueras un cliente —o el carnicero—
// sin Twilio ni Meta.
//
// Hace exactamente lo que haría el webhook: arma un mensaje entrante
// normalizado y se lo pasa a `procesarMensajeEntrante`, que es la misma función
// que usan los dos webhooks reales. No hay un camino paralelo ni una versión
// "de mentira" del motor — si funciona acá, funciona igual cuando el mensaje
// venga de Meta.
//
// ------------------------------------------------------------
// Por qué el teléfono NO viene del formulario (bug del 10/09/2026)
// ------------------------------------------------------------
//
// Antes cada acción recibía el número en un campo oculto del formulario, y la
// acción del carnicero armaba su propio enrutamiento a mano en vez de usar el
// del motor. Las dos solapas del panel compartían la misma instancia de React,
// así que un mensaje escrito en la solapa del cliente salió por la acción del
// carnicero: quedó guardado en el hilo del cliente, con el número del cliente,
// pero procesado como carga de stock. El bot le contestó al cliente
// "no relacioné eso con una actualización de stock" y le terminó modificando el
// stock de la carnicería.
//
// Dos cambios para que no pueda volver a pasar:
//
// 1. El número lo pone el SERVIDOR, a partir de una constante. Lo que mande el
//    navegador ya no decide quién es quién.
// 2. Las dos puntas llaman al MISMO `procesarMensajeEntrante`. El rol lo decide
//    `quienEs.ts`, igual que en producción, y el simulador dejó de tener un
//    enrutamiento propio que podía desincronizarse del de verdad.
//
// Solo se habilita si la carnicería está en modo simulado. Con un proveedor
// real, un mensaje de prueba haría que el bot le escribiera a un cliente de
// verdad.

export type ResultadoSimulacion = { ok: boolean; mensaje: string };

// Ocho megas alcanzan de sobra para un audio de un par de minutos en opus, que
// es lo que graba el navegador. Además está el tope de Next para los Server
// Actions (ver next.config.ts): si este número sube, ese tiene que subir también.
const LIMITE_AUDIO_BYTES = 8 * 1024 * 1024;

type MensajeDelFormulario =
  | { ok: true; texto: string; esAudio: boolean }
  | { ok: false; mensaje: string };

/**
 * Un mensaje del simulador puede llegar escrito o grabado.
 *
 * Si llega grabado, se transcribe con Whisper —el mismo modelo, la misma
 * función y el mismo idioma que usa el webhook de verdad— y de ahí en adelante
 * el recorrido es idéntico al de un texto. Eso hace que el simulador sí
 * ejercite la transcripción, que era el agujero más grande que tenía: la voz de
 * un carnicero en su cámara, con ruido y modismos, es exactamente donde esto se
 * rompe o funciona.
 *
 * Lo único que sigue sin probarse es la descarga del archivo desde los
 * servidores de Meta, porque acá el audio ya llega en la mano.
 */
async function mensajeDelFormulario(datos: FormData): Promise<MensajeDelFormulario> {
  const audio = datos.get("audio");

  if (audio instanceof File && audio.size > 0) {
    if (audio.size > LIMITE_AUDIO_BYTES) {
      return { ok: false, mensaje: "Ese audio pesa demasiado. Probá con uno más corto." };
    }

    let transcripcion: string;
    try {
      const buffer = Buffer.from(await audio.arrayBuffer());
      transcripcion = await transcribirAudio(buffer, audio.name || "audio.webm");
    } catch (err) {
      console.error("Error transcribiendo un audio del simulador", err);
      return {
        ok: false,
        mensaje:
          "No pude transcribir ese audio. Revisá que OPENAI_API_KEY esté cargada y probá de nuevo.",
      };
    }

    if (!transcripcion) {
      return {
        ok: false,
        mensaje: "El audio llegó vacío o no se entendió nada. Probá de nuevo, más cerca del micrófono.",
      };
    }

    return { ok: true, texto: transcripcion, esAudio: true };
  }

  const texto = String(datos.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensaje: "Escribí un mensaje o grabá un audio." };
  if (texto.length > 2000) return { ok: false, mensaje: "El mensaje es demasiado largo." };
  return { ok: true, texto, esAudio: false };
}

export async function enviarComoCliente(
  _previo: ResultadoSimulacion | null,
  datos: FormData
): Promise<ResultadoSimulacion> {
  return await simular({ telefono: TELEFONO_CLIENTE_SIMULADO, nombre: "Cliente de prueba", datos });
}

export async function enviarComoCarnicero(
  _previo: ResultadoSimulacion | null,
  datos: FormData
): Promise<ResultadoSimulacion> {
  return await simular({ telefono: TELEFONO_CARNICERO_SIMULADO, nombre: null, datos });
}

/**
 * El cuerpo de las dos acciones. Lo único que las distingue es el número, y el
 * número lo elige esta capa, nunca el formulario.
 *
 * De acá para adentro es el motor de verdad: `procesarMensajeEntrante` mira el
 * número, le pregunta a `quienEs.ts` si es carnicero o cliente, y enruta. El
 * simulador no sabe ni decide nada sobre roles.
 */
async function simular(params: {
  telefono: string;
  nombre: string | null;
  datos: FormData;
}): Promise<ResultadoSimulacion> {
  const { telefono: telefonoFijo, nombre, datos } = params;
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return {
      ok: false,
      mensaje:
        "El simulador solo funciona con la carnicería en modo simulado. Con un proveedor real, un mensaje de prueba le llegaría a un cliente de verdad.",
    };
  }

  const entrada = await mensajeDelFormulario(datos);
  if (!entrada.ok) return entrada;
  const { texto, esAudio } = entrada;

  const telefono = aFormatoCanonico(telefonoFijo);
  const carniceriaId = sesion.carniceria.id;
  const telefonoCarniceria = sesion.carniceria.telefonoWhatsapp ?? "whatsapp:+000000000000";

  const mensaje: MensajeEntranteNormalizado = {
    telefono,
    nombrePerfil: nombre,
    // Se marca como audio para que el hilo del panel lo muestre como lo que
    // fue. `media` va en null porque no hay archivo que descargar: el audio ya
    // se transcribió acá arriba, que es justo lo que hace el webhook real antes
    // de llegar a este punto.
    tipo: esAudio ? "audio" : "texto",
    texto,
    media: null,
    proveedorMensajeId: null,
    esEcoDelNegocio: false,
    recibidoAt: new Date(),
  };

  try {
    const resultado = await procesarMensajeEntrante({
      carniceriaId,
      telefonoCarniceria,
      mensaje,
      rawPayload: { simulado: true },
    });

    await sumarUso(carniceriaId, "mensajes_recibidos");
    if (esAudio) await sumarUso(carniceriaId, "audios_transcriptos");

    // El webhook de Meta contesta con una llamada aparte a la API; acá pasa lo
    // mismo, solo que el "envío" no sale a internet.
    if (resultado?.respuesta) {
      await enviarWhatsapp({
        carniceriaId,
        hacia: telefono,
        cuerpo: resultado.respuesta,
        origen: "bot",
      });
    }
  } catch (err) {
    console.error("Error simulando un mensaje entrante", err);
    return {
      ok: false,
      mensaje: err instanceof Error ? err.message : "Algo falló procesando el mensaje.",
    };
  }

  revalidatePath("/panel/simulador");
  revalidatePath("/panel/stock");
  revalidatePath("/panel");
  revalidatePath("/panel/mensajes");
  return { ok: true, mensaje: "Mensaje procesado." };
}

/**
 * Borra las conversaciones y los pedidos de un teléfono de prueba, para poder
 * volver a empezar. No toca stock ni catálogo.
 *
 * Existe porque un pedido a medio armar bloquea al cliente para hacer uno nuevo
 * (por diseño: los pedidos pendientes no vencen solos), y probando se llega a
 * ese estado todo el tiempo.
 */
export async function limpiarConversacionDePrueba(
  lado: "cliente" | "carnicero"
): Promise<ResultadoSimulacion> {
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return { ok: false, mensaje: "Solo se puede limpiar en modo simulado." };
  }

  // Igual que arriba: el navegador dice QUÉ lado quiere limpiar, no QUÉ número
  // borrar. Un número arbitrario acá sería una forma de borrarle a la
  // carnicería la conversación de un cliente de verdad desde el panel.
  const telefono = aFormatoCanonico(
    lado === "carnicero" ? TELEFONO_CARNICERO_SIMULADO : TELEFONO_CLIENTE_SIMULADO
  );
  const supabaseAdmin = getSupabaseAdmin();
  const carniceriaId = sesion.carniceria.id;

  await supabaseAdmin
    .from("pedidos")
    .delete()
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono);

  // También las cargas de stock a medio confirmar de ese número. Se borra la
  // OPERACIÓN, no el stock: una carga ya confirmada movió `productos.stock_actual`
  // y eso no se deshace desde acá — se corrige desde la pantalla de Stock, igual
  // que en la vida real.
  await supabaseAdmin
    .from("operaciones_stock")
    .delete()
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono);

  const { data: conversacion } = await supabaseAdmin
    .from("conversaciones")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .maybeSingle();

  if (conversacion) {
    await supabaseAdmin.from("mensajes_whatsapp").delete().eq("conversacion_id", conversacion.id);
    await supabaseAdmin.from("conversaciones").delete().eq("id", conversacion.id);
  }

  await supabaseAdmin
    .from("clientes")
    .delete()
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono);

  revalidatePath("/panel/simulador");
  revalidatePath("/panel");
  return { ok: true, mensaje: "Listo, ese número quedó como nuevo." };
}
