import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { enviarWhatsapp } from "@/lib/whatsapp";
import { formatearHoraArgentina } from "@/lib/tiempo";
import { avisarClienteNoRetiro, crearAviso } from "@/lib/notificaciones";
import { registrarEvento } from "@/lib/pedidoEventos";
import { diaEnArgentina, estaEnLaVentana, franjaDelDia, minutoDeApertura, minutoDeCierre } from "@/lib/horarios";

// Etapa 3, Paso 7-8 — recordatorio antes de la hora de retiro + marcado
// automático de ausencias ("no-show"). No hay nada corriendo en background
// dentro de Next.js/Vercel de por sí — este endpoint lo tiene que llamar
// algo externo cada pocos minutos. Se eligió un GitHub Actions scheduled
// workflow (.github/workflows/recordatorios.yml) en vez de Vercel Cron
// porque el plan gratuito de Vercel solo permite cron jobs UNA VEZ POR DÍA,
// insuficiente para avisar "30 minutos antes" con cualquier precisión, y no
// hace falta pagar un plan superior solo por esto.
//
// ============================================================
// VENTANAS PROVISORIAS (ajustables acá mismo, sin tocar el resto):
// - Se manda el recordatorio cuando falten <= RECORDATORIO_MINUTOS_ANTES
//   para la hora de retiro (una sola vez, `recordatorio_enviado_at` evita
//   reenvíos aunque el cron corra cada pocos minutos).
// - El no-show YA NO es automático por tiempo: desde la Tanda 5 se le
//   pregunta al carnicero al cierre y él decide (especificación, 7.4 a 7.6).
// ============================================================
// 23/08/2026: el fundador pidió que el recordatorio salga 1 hora antes
// (no 30 minutos) — le da más margen al cliente para organizarse.
const RECORDATORIO_MINUTOS_ANTES = Number(process.env.RECORDATORIO_MINUTOS_ANTES ?? "60");

// Tanda 3 (especificación, secciones 3.1 y 32.1).
const MINUTOS_AVISO_DEMORA = Number(process.env.AVISO_DEMORA_MINUTOS ?? "30");
const MINUTOS_RETOMAR_BORRADOR = Number(process.env.RETOMAR_BORRADOR_MINUTOS ?? "60");

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: "Falta configurar CRON_SECRET en las variables de entorno." }, { status: 500 });
  }
  if (request.nextUrl.searchParams.get("secreto") !== secreto) {
    return NextResponse.json({ error: "falta o es incorrecto el parámetro ?secreto=" }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const ahora = new Date();
  const limiteRecordatorio = new Date(ahora.getTime() + RECORDATORIO_MINUTOS_ANTES * 60 * 1000);

  let recordatoriosEnviados = 0;
  let noShowsMarcados = 0;
  let avisosDemora = 0;
  let pedidosVencidos = 0;
  let avisosRetomar = 0;
  let resumenesEnviados = 0;
  let avisosCierre = 0;
  const errores: string[] = [];

  // ------------------------------------------------------------
  // Paso 7 — recordatorios
  // ------------------------------------------------------------
  const { data: paraRecordar, error: errRecordar } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, cliente_id, telefono, hora_retiro")
    .eq("estado", "aprobado")
    .is("recordatorio_enviado_at", null)
    .lte("hora_retiro", limiteRecordatorio.toISOString())
    .gte("hora_retiro", ahora.toISOString());

  if (errRecordar) {
    console.error("Error buscando pedidos para recordatorio", errRecordar);
    errores.push("error buscando pedidos para recordatorio");
  }

  for (const pedido of paraRecordar ?? []) {
    try {
      const hora = formatearHoraArgentina(new Date(pedido.hora_retiro as string));

      // Meta rechaza una plantilla con un parámetro vacío, así que si no
      // tenemos el nombre del cliente usamos un saludo genérico.
      const { data: clienteDelPedido } = await supabaseAdmin
        .from("clientes")
        .select("nombre")
        .eq("id", pedido.cliente_id as string)
        .maybeSingle();
      const nombreCliente = (clienteDelPedido?.nombre as string | null)?.trim() || "vecino/a";

      // El recordatorio sale 1 hora antes del retiro, pero el pedido puede
      // haberse hecho ayer: si el cliente no escribió en las últimas 24 horas,
      // la ventana de Meta está cerrada y el texto libre no sale. Por eso se
      // pasa una plantilla de respaldo — es exactamente el caso de uso para el
      // que existen las plantillas. `enviarWhatsapp` usa el texto si la ventana
      // está abierta (más barato y más natural) y la plantilla si no.
      await enviarWhatsapp({
        carniceriaId: pedido.carniceria_id as string,
        hacia: pedido.telefono as string,
        // Texto definitivo de la especificación (sección 54). "Alrededor de"
        // es deliberado: la hora de retiro es una orientación, no un turno
        // con horario exacto (sección 7.1).
        cuerpo: `🔔 Te recuerdo que tu pedido está para retirar alrededor de las ${hora} hs. ¡Te esperamos!`,
        origen: "bot",
        pedidoId: pedido.id as string,
        plantillaDeRespaldo: {
          nombre: "recordatorio_retiro",
          idioma: "es_AR",
          variables: [nombreCliente, hora],
        },
      });

      await supabaseAdmin
        .from("pedidos")
        .update({ recordatorio_enviado_at: new Date().toISOString() })
        .eq("id", pedido.id);

      recordatoriosEnviados++;
    } catch (err) {
      console.error("Error mandando recordatorio", pedido.id, err);
      errores.push(`recordatorio pedido ${pedido.id}`);
    }
  }

  // ------------------------------------------------------------
  // No-show — SOLO al cierre del día adicional (secciones 7.4 a 7.6)
  // ------------------------------------------------------------
  //
  // Cambio de criterio de la Tanda 5. Antes acá se marcaba no-show solo por
  // haber pasado 60 minutos de la hora de retiro. Eso era una acusación basada
  // en una suposición: nadie le avisa al sistema cuando el cliente SÍ pasó por
  // el mostrador, así que el que retiraba tarde quedaba marcado como ausente.
  //
  // Ahora, al cierre, el bot le pregunta al carnicero (más abajo) y él elige
  // "retirado" o "en espera". Solo un pedido que quedó en espera y tampoco se
  // retiró al día siguiente pasa a no_show.
  const hoyArgentina = diaEnArgentina(ahora).fecha;

  const { data: enEsperaVencidos } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, cliente_id")
    .eq("estado", "en_espera")
    .is("retirado_at", null)
    .lt("en_espera_hasta", hoyArgentina);

  for (const pedido of enEsperaVencidos ?? []) {
    try {
      const { data: actualizado } = await supabaseAdmin
        .from("pedidos")
        .update({ estado: "no_show", updated_at: new Date().toISOString() })
        .eq("id", pedido.id)
        .eq("estado", "en_espera")
        .select("id")
        .maybeSingle();

      if (!actualizado) continue;

      const { data: cliente } = await supabaseAdmin
        .from("clientes")
        .select("no_shows, nombre")
        .eq("id", pedido.cliente_id)
        .maybeSingle();

      if (cliente) {
        await supabaseAdmin
          .from("clientes")
          .update({ no_shows: Number(cliente.no_shows) + 1 })
          .eq("id", pedido.cliente_id);
      }

      await registrarEvento({
        pedidoId: pedido.id as string,
        carniceriaId: pedido.carniceria_id as string,
        tipo: "no_show",
        actor: "sistema",
        descripcion: "Pasó el día adicional en espera y el pedido no se retiró.",
      });

      await avisarClienteNoRetiro({
        carniceriaId: pedido.carniceria_id as string,
        pedidoId: pedido.id as string,
        clienteNombre: (cliente?.nombre as string | null) ?? null,
      });

      noShowsMarcados++;
    } catch (err) {
      console.error("Error marcando no-show", pedido.id, err);
      errores.push(`no-show pedido ${pedido.id}`);
    }
  }

  // ------------------------------------------------------------
  // Aviso de demora en la aprobación (especificación, sección 3.1)
  // ------------------------------------------------------------
  //
  // Media hora esperando sin ninguna señal es donde el cliente empieza a
  // pensar que el mensaje no llegó. El aviso sale UNA sola vez
  // (`aviso_demora_enviado_at`), porque la misma sección pide expresamente no
  // bombardear con recordatorios.
  //
  // El tono es el de la especificación: transmitir que la carnicería está a
  // full, no pedir disculpas corporativas.
  const limiteDemora = new Date(ahora.getTime() - MINUTOS_AVISO_DEMORA * 60 * 1000);

  const { data: demorados } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, telefono")
    .eq("estado", "pendiente_aprobacion")
    .is("aviso_demora_enviado_at", null)
    .lte("updated_at", limiteDemora.toISOString());

  for (const pedido of demorados ?? []) {
    try {
      await enviarWhatsapp({
        carniceriaId: pedido.carniceria_id as string,
        hacia: pedido.telefono as string,
        cuerpo: elegirAviso(AVISOS_DEMORA),
        origen: "bot",
        pedidoId: pedido.id as string,
      });

      await supabaseAdmin
        .from("pedidos")
        .update({ aviso_demora_enviado_at: new Date().toISOString() })
        .eq("id", pedido.id);

      avisosDemora++;
    } catch (err) {
      console.error("Error avisando la demora de un pedido", pedido.id, err);
      errores.push(`aviso de demora ${pedido.id}`);
    }
  }

  // ------------------------------------------------------------
  // Vencimiento del pedido sin resolver (especificación, sección 3.2)
  // ------------------------------------------------------------
  //
  // A las 4 horas sin que el carnicero lo resuelva, el pedido vence. Antes no
  // vencía nunca y el cliente quedaba trabado sin poder hacer uno nuevo.
  //
  // Se le avisa al cliente: dejarlo esperando en silencio un pedido que ya no
  // existe sería peor. El mensaje no inventa ningún motivo — solo dice que no
  // se llegó a confirmar y lo invita a escribir de nuevo.
  const { data: vencidos } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, telefono")
    .eq("estado", "pendiente_aprobacion")
    .not("expires_at", "is", null)
    .lt("expires_at", ahora.toISOString());

  for (const pedido of vencidos ?? []) {
    try {
      const { data: actualizado } = await supabaseAdmin
        .from("pedidos")
        .update({ estado: "vencido", updated_at: new Date().toISOString() })
        .eq("id", pedido.id)
        .eq("estado", "pendiente_aprobacion")
        .select("id")
        .maybeSingle();

      if (!actualizado) continue;

      await enviarWhatsapp({
        carniceriaId: pedido.carniceria_id as string,
        hacia: pedido.telefono as string,
        cuerpo:
          "Perdón, no llegamos a confirmarte el pedido a tiempo y lo tuve que dar de baja. " +
          "Si todavía lo necesitás, escribime y lo armamos de nuevo en un minuto 🙌",
        origen: "bot",
        pedidoId: pedido.id as string,
      });

      pedidosVencidos++;
    } catch (err) {
      console.error("Error venciendo un pedido sin aprobar", pedido.id, err);
      errores.push(`vencimiento ${pedido.id}`);
    }
  }

  // ------------------------------------------------------------
  // Borrador abandonado (especificación, sección 32)
  // ------------------------------------------------------------
  //
  // Un pedido que se empezó a armar y quedó por la mitad más de una hora: se
  // pregunta UNA vez si podemos ayudar. La sección 32.1 es explícita en que
  // esto NO va cuando la consulta ya quedó resuelta ni cuando el pedido
  // terminó — por eso el filtro es por los estados "a medio armar", que son
  // justamente los que quedan cuando la conversación se cortó.
  const limiteRetomar = new Date(ahora.getTime() - MINUTOS_RETOMAR_BORRADOR * 60 * 1000);

  const { data: abandonados } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, telefono")
    .in("estado", ["borrador", "pendiente_aclaracion", "pendiente_confirmacion_cliente"])
    .is("aviso_retomar_enviado_at", null)
    .lte("updated_at", limiteRetomar.toISOString());

  for (const pedido of abandonados ?? []) {
    try {
      await enviarWhatsapp({
        carniceriaId: pedido.carniceria_id as string,
        hacia: pedido.telefono as string,
        cuerpo: "¿Te puedo ayudar con algo?",
        origen: "bot",
        pedidoId: pedido.id as string,
      });

      await supabaseAdmin
        .from("pedidos")
        .update({ aviso_retomar_enviado_at: new Date().toISOString() })
        .eq("id", pedido.id);

      avisosRetomar++;
    } catch (err) {
      console.error("Error preguntando por un borrador abandonado", pedido.id, err);
      errores.push(`retomar ${pedido.id}`);
    }
  }

  // Borradores que ya pasaron su vencimiento (al cierre del día): se descartan
  // en silencio. La sección 32.3 pide expresamente NO mandar más mensajes.
  await supabaseAdmin
    .from("pedidos")
    .update({ estado: "vencido", updated_at: new Date().toISOString() })
    .in("estado", ["borrador", "pendiente_aclaracion", "pendiente_confirmacion_cliente"])
    .not("expires_at", "is", null)
    .lt("expires_at", ahora.toISOString());

  // ------------------------------------------------------------
  // Apertura y cierre de cada carnicería (secciones 23, 7.4 y 24)
  // ------------------------------------------------------------
  //
  // Tres cosas que dependen del horario del local, así que se resuelven juntas
  // recorriendo las carnicerías una sola vez:
  //
  //   - A la apertura: el resumen de los pedidos del día (sección 23).
  //   - Al cierre: preguntarle al carnicero qué pasó con los pedidos que
  //     quedaron sin marcar (sección 7.4).
  //   - En cualquier momento: avisarle a los clientes que tengan un pedido para
  //     un día que el carnicero marcó como cerrado (sección 24).
  const { data: carnicerias } = await supabaseAdmin
    .from("carnicerias")
    .select("id, resumen_diario_enviado_on")
    .eq("activa", true);

  const { fecha: hoy, minutos: minutoActual } = diaEnArgentina(ahora);

  for (const carniceria of carnicerias ?? []) {
    const carniceriaId = carniceria.id as string;

    try {
      const franja = await franjaDelDia(carniceriaId, hoy);

      // --- Resumen diario, a la apertura (sección 23) ---
      const yaSeMandoHoy = (carniceria.resumen_diario_enviado_on as string | null) === hoy;
      if (!yaSeMandoHoy && estaEnLaVentana(minutoActual, minutoDeApertura(franja))) {
        const { data: delDia } = await supabaseAdmin
          .from("pedidos")
          .select("id, hora_retiro, items, clientes(nombre)")
          .eq("carniceria_id", carniceriaId)
          .in("estado", ["aprobado", "en_espera"])
          .is("retirado_at", null)
          .gte("hora_retiro", `${hoy}T00:00:00-03:00`)
          .lte("hora_retiro", `${hoy}T23:59:59-03:00`)
          .order("hora_retiro", { ascending: true });

        const pedidosDelDia = delDia ?? [];

        // Sección 23: si no hay pedidos, no se manda un mensaje vacío.
        if (pedidosDelDia.length > 0) {
          await crearAviso({
            carniceriaId,
            tipo: "pedidos_del_dia",
            titulo: `Hoy tenés ${pedidosDelDia.length} ${pedidosDelDia.length === 1 ? "pedido" : "pedidos"} para preparar`,
            cuerpo: pedidosDelDia
              .map((p) => {
                const cliente = p.clientes as { nombre: string | null } | { nombre: string | null }[] | null;
                const nombre = Array.isArray(cliente) ? cliente[0]?.nombre : cliente?.nombre;
                const hora = p.hora_retiro ? formatearHoraArgentina(new Date(p.hora_retiro as string)) : "sin hora";
                return `${hora} — ${nombre ?? "cliente"}`;
              })
              .join("\n"),
            enlace: "/panel/pedidos",
            claveUnicidad: `pedidos_del_dia:${carniceriaId}:${hoy}`,
          });

          await avisarAlCarniceroPorWhatsapp(
            carniceriaId,
            `Buen día 👋 Hoy tenés ${pedidosDelDia.length} ${
              pedidosDelDia.length === 1 ? "pedido programado" : "pedidos programados"
            } para preparar. Los tenés en el panel.`
          );
        }

        await supabaseAdmin
          .from("carnicerias")
          .update({ resumen_diario_enviado_on: hoy })
          .eq("id", carniceriaId);

        resumenesEnviados++;
      }

      // --- Cierre del día: qué pasó con los pedidos sin marcar (sección 7.4) ---
      if (estaEnLaVentana(minutoActual, minutoDeCierre(franja))) {
        const { data: sinCerrar } = await supabaseAdmin
          .from("pedidos")
          .select("id")
          .eq("carniceria_id", carniceriaId)
          .eq("estado", "aprobado")
          .is("retirado_at", null)
          .lte("hora_retiro", ahora.toISOString());

        if ((sinCerrar ?? []).length > 0) {
          await crearAviso({
            carniceriaId,
            tipo: "pedidos_sin_cerrar",
            titulo: `Quedaron ${sinCerrar!.length} ${sinCerrar!.length === 1 ? "pedido" : "pedidos"} sin cerrar`,
            cuerpo: "Marcá cada uno como retirado o dejalo en espera para mañana.",
            enlace: "/panel/pedidos?estado=aprobado",
            claveUnicidad: `pedidos_sin_cerrar:${carniceriaId}:${hoy}`,
          });

          await avisarAlCarniceroPorWhatsapp(
            carniceriaId,
            `Cerramos por hoy 👋 Quedaron ${sinCerrar!.length} ${
              sinCerrar!.length === 1 ? "pedido" : "pedidos"
            } sin marcar. Entrá al panel y decime cuáles se retiraron y cuáles quedan en espera para mañana.`
          );
        }
      }

      // --- Días cerrados con pedidos ya programados (sección 24) ---
      const { data: cierres } = await supabaseAdmin
        .from("dias_especiales")
        .select("fecha, motivo")
        .eq("carniceria_id", carniceriaId)
        .eq("cerrado", true)
        .gte("fecha", hoy);

      for (const cierre of cierres ?? []) {
        const fecha = cierre.fecha as string;

        const { data: afectados } = await supabaseAdmin
          .from("pedidos")
          .select("id, telefono")
          .eq("carniceria_id", carniceriaId)
          .in("estado", ["aprobado", "en_espera", "pendiente_aprobacion"])
          .is("aviso_cierre_enviado_at", null)
          .gte("hora_retiro", `${fecha}T00:00:00-03:00`)
          .lte("hora_retiro", `${fecha}T23:59:59-03:00`);

        for (const pedido of afectados ?? []) {
          // Sección 24: NO se cancela solo. Se avisa, se pide fecha nueva y el
          // pedido se mantiene mientras se reprograma.
          await enviarWhatsapp({
            carniceriaId,
            hacia: pedido.telefono as string,
            cuerpo: `Perdón, ese día no vamos a abrir${cierre.motivo ? ` (${cierre.motivo})` : ""} 🙈 Tu pedido queda guardado. ¿Qué día te viene bien pasar a buscarlo?`,
            origen: "bot",
            pedidoId: pedido.id as string,
          });

          await supabaseAdmin
            .from("pedidos")
            .update({ aviso_cierre_enviado_at: new Date().toISOString() })
            .eq("id", pedido.id);

          avisosCierre++;
        }

        if ((afectados ?? []).length > 0) {
          await crearAviso({
            carniceriaId,
            tipo: "cierre_con_pedidos",
            titulo: `Hay pedidos para el ${fecha.split("-").reverse().slice(0, 2).join("/")}, que marcaste cerrado`,
            cuerpo: "Ya les avisamos a los clientes y les pedimos una fecha nueva.",
            enlace: "/panel/pedidos",
            claveUnicidad: `cierre_con_pedidos:${carniceriaId}:${fecha}`,
          });
        }
      }
    } catch (err) {
      console.error("Error en las tareas de apertura/cierre", carniceriaId, err);
      errores.push(`apertura/cierre ${carniceriaId}`);
    }
  }

  return NextResponse.json({
    ok: errores.length === 0,
    recordatorios_enviados: recordatoriosEnviados,
    no_shows_marcados: noShowsMarcados,
    avisos_demora: avisosDemora,
    pedidos_vencidos: pedidosVencidos,
    avisos_retomar: avisosRetomar,
    resumenes_enviados: resumenesEnviados,
    avisos_cierre: avisosCierre,
    errores,
  });
}

/**
 * Le manda un WhatsApp a los números autorizados de la carnicería. Se usa para
 * el resumen diario y el cierre del día: el carnicero está en el mostrador, no
 * mirando el panel.
 */
async function avisarAlCarniceroPorWhatsapp(carniceriaId: string, cuerpo: string): Promise<void> {
  const { data: numeros } = await getSupabaseAdmin()
    .from("numeros_carnicero")
    .select("telefono")
    .eq("carniceria_id", carniceriaId)
    .eq("activo", true);

  for (const numero of numeros ?? []) {
    try {
      await enviarWhatsapp({
        carniceriaId,
        hacia: numero.telefono as string,
        cuerpo,
        origen: "bot",
        esCarnicero: true,
      });
    } catch (err) {
      console.error("No se pudo avisar al carnicero", carniceriaId, err);
    }
  }
}

// Variantes del aviso de demora, tal cual las propone la sección 3.1. Se
// alterna al azar para que un cliente que pide seguido no reciba siempre la
// misma frase — es la misma idea que los saludos del cliente conocido.
const AVISOS_DEMORA = [
  "Disculpá la demora, estamos a full en la carnicería. Apenas te confirmemos el pedido te aviso 🙌",
  "Estamos con bastante movimiento ahora. Apenas quede confirmado tu pedido te aviso 👍",
  "Perdón por la espera, la carnicería está a full. En cuanto revisemos tu pedido te aviso.",
];

function elegirAviso(variantes: string[]): string {
  return variantes[Math.floor(Math.random() * variantes.length)];
}
