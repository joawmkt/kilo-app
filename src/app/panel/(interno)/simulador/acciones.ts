"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { procesarMensajeEntrante } from "@/lib/whatsapp/entrante";
import { enviarWhatsapp, aFormatoCanonico } from "@/lib/whatsapp";
import { registrarMensaje } from "@/lib/whatsapp/conversaciones";
import { procesarTextoEntrante, procesarTextoDeStock } from "@/lib/flujoStock";
import { procesarDecisionCarnicero } from "@/lib/flujoPedidos";
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
 * El otro lado del simulador: escribir como el CARNICERO, para probar la carga
 * de stock hablada.
 *
 * Por qué es una acción aparte y no el mismo `enviarComoCliente` con otro
 * número: el enrutamiento real decide entre cliente y carnicero mirando si el
 * número está en `numeros_carnicero`. Para reusar esa función habría que dar de
 * alta el número de prueba como número autorizado de verdad — y ese permiso
 * quedaría vivo el día que la carnicería se conecte a Meta, dejando que un
 * desconocido con ese número le toque el stock. No vale la pena: acá se arma el
 * mismo recorrido a mano, sin tocar la tabla de permisos.
 *
 * La única diferencia con WhatsApp de verdad está declarada en pantalla: allá
 * una carga de stock EMPIEZA con un audio, y acá se escribe. De la
 * transcripción en adelante es exactamente el mismo motor (ver
 * `procesarTextoDeStock`).
 */
export async function enviarComoCarnicero(
  _previo: ResultadoSimulacion | null,
  datos: FormData
): Promise<ResultadoSimulacion> {
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return {
      ok: false,
      mensaje:
        "El simulador solo funciona con la carnicería en modo simulado. Con un proveedor real, esto tocaría el stock a partir de un mensaje que no mandó nadie.",
    };
  }

  const texto = String(datos.get("texto") ?? "").trim();
  const telefonoCrudo = String(datos.get("telefono") ?? "").trim();

  if (!texto) return { ok: false, mensaje: "Escribí un mensaje." };
  if (texto.length > 2000) return { ok: false, mensaje: "El mensaje es demasiado largo." };
  if (telefonoCrudo.replace(/\D/g, "").length < 8) {
    return { ok: false, mensaje: "Poné un teléfono de al menos 8 dígitos." };
  }

  const telefono = aFormatoCanonico(telefonoCrudo);
  const carniceriaId = sesion.carniceria.id;
  const telefonoCarniceria = sesion.carniceria.telefonoWhatsapp ?? "whatsapp:+000000000000";

  try {
    // El mensaje se guarda igual que uno real para que aparezca en el hilo del
    // panel. `esCarnicero: true` es lo que lo pinta como del negocio y no de un
    // cliente.
    const { mensajeId } = await registrarMensaje({
      carniceriaId,
      telefonoInterlocutor: telefono,
      telefonoCarniceria,
      direccion: "entrante",
      tipo: "texto",
      cuerpo: texto,
      origen: "app_whatsapp",
      esCarnicero: true,
      rawPayload: { simulado: true, comoCarnicero: true },
      reiniciaVentana: true,
    });

    // Mismo orden de prioridad que el enrutamiento real (ver
    // src/lib/whatsapp/entrante.ts): primero una operación de stock en curso,
    // después una decisión sobre un pedido.
    let respuesta = await procesarTextoEntrante({
      carniceriaId,
      telefono,
      mensajeWhatsappId: mensajeId,
      texto,
    });

    if (respuesta === null) {
      respuesta = await procesarDecisionCarnicero({
        carniceriaId,
        carniceroTelefono: telefono,
        texto,
      });
    }

    // Y recién acá lo propio del simulador: si no era ninguna de las dos cosas,
    // se trata como el audio que abre una carga de stock.
    if (respuesta === null) {
      respuesta = await procesarTextoDeStock({
        carniceriaId,
        telefono,
        mensajeWhatsappId: mensajeId,
        texto,
      });
    }

    await sumarUso(carniceriaId, "mensajes_recibidos");

    if (respuesta) {
      await enviarWhatsapp({
        carniceriaId,
        hacia: telefono,
        cuerpo: respuesta,
        origen: "bot",
        esCarnicero: true,
      });
    }
  } catch (err) {
    console.error("Error simulando un mensaje del carnicero", err);
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
