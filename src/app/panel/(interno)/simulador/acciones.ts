"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import { enviarWhatsapp, aFormatoCanonico } from "@/lib/whatsapp";
import { sumarUso } from "@/lib/uso";
import type { MensajeEntranteNormalizado } from "@/lib/whatsapp/tipos";

// El simulador: escribirle al bot como si fueras un cliente, sin Twilio ni Meta.
//
// Hace exactamente lo que haría el webhook: arma un mensaje entrante
// normalizado y se lo pasa a `procesarMensajeEntrante`, que es la misma función
// que usan los dos webhooks reales. No hay un camino paralelo ni una versión
// "de mentira" del motor — si funciona acá, funciona igual cuando el mensaje
// venga de Meta.
//
// Solo se habilita si la carnicería está en modo simulado. Si estuviera
// disponible con un proveedor real, un mensaje de prueba haría que el bot le
// escribiera a un cliente de verdad.

export type ResultadoSimulacion = { ok: boolean; mensaje: string };

export async function enviarComoCliente(
  _previo: ResultadoSimulacion | null,
  datos: FormData
): Promise<ResultadoSimulacion> {
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return {
      ok: false,
      mensaje:
        "El simulador solo funciona con la carnicería en modo simulado. Con un proveedor real, un mensaje de prueba le llegaría a un cliente de verdad.",
    };
  }

  const texto = String(datos.get("texto") ?? "").trim();
  const telefonoCrudo = String(datos.get("telefono") ?? "").trim();
  const nombre = String(datos.get("nombre") ?? "").trim();

  if (!texto) return { ok: false, mensaje: "Escribí un mensaje." };
  if (texto.length > 2000) return { ok: false, mensaje: "El mensaje es demasiado largo." };
  if (telefonoCrudo.replace(/\D/g, "").length < 8) {
    return { ok: false, mensaje: "Poné un teléfono de al menos 8 dígitos." };
  }

  const telefono = aFormatoCanonico(telefonoCrudo);
  const carniceriaId = sesion.carniceria.id;
  const telefonoCarniceria = sesion.carniceria.telefonoWhatsapp ?? "whatsapp:+000000000000";

  const mensaje: MensajeEntranteNormalizado = {
    telefono,
    nombrePerfil: nombre || null,
    tipo: "texto",
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
export async function limpiarConversacionDePrueba(telefonoCrudo: string): Promise<ResultadoSimulacion> {
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return { ok: false, mensaje: "Solo se puede limpiar en modo simulado." };
  }

  const telefono = aFormatoCanonico(telefonoCrudo);
  const supabaseAdmin = getSupabaseAdmin();
  const carniceriaId = sesion.carniceria.id;

  await supabaseAdmin
    .from("pedidos")
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
