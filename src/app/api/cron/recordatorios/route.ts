import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { enviarWhatsapp } from "@/lib/twilioEnviar";
import { formatearHoraArgentina } from "@/lib/tiempo";

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
// - Se marca no-show automáticamente cuando ya pasaron
//   GRACIA_NO_SHOW_MINUTOS desde la hora de retiro sin que se haya
//   marcado `retirado_at` — no hay forma de detectar automáticamente que
//   alguien SÍ retiró (no hay integración con caja), así que esto es una
//   aproximación: si el cliente retira cerca del límite y nadie lo marca a
//   mano, puede quedar contado como no-show igual. Aceptable para un
//   piloto (estadística interna, no afecta al cliente), pero es la
//   respuesta más simple a la pregunta 8 del roadmap, no una decisión
//   cerrada con el fundador — ajustar si en la práctica genera ruido.
// ============================================================
// 23/08/2026: el fundador pidió que el recordatorio salga 1 hora antes
// (no 30 minutos) — le da más margen al cliente para organizarse.
const RECORDATORIO_MINUTOS_ANTES = Number(process.env.RECORDATORIO_MINUTOS_ANTES ?? "60");
const GRACIA_NO_SHOW_MINUTOS = Number(process.env.GRACIA_NO_SHOW_MINUTOS ?? "60");

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
  const limiteNoShow = new Date(ahora.getTime() - GRACIA_NO_SHOW_MINUTOS * 60 * 1000);

  let recordatoriosEnviados = 0;
  let noShowsMarcados = 0;
  const errores: string[] = [];

  // ------------------------------------------------------------
  // Paso 7 — recordatorios
  // ------------------------------------------------------------
  const { data: paraRecordar, error: errRecordar } = await supabaseAdmin
    .from("pedidos")
    .select("id, carniceria_id, telefono, hora_retiro")
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
      const { data: carniceria } = await supabaseAdmin
        .from("carnicerias")
        .select("telefono_whatsapp")
        .eq("id", pedido.carniceria_id)
        .single();

      if (!carniceria?.telefono_whatsapp) continue;

      await enviarWhatsapp({
        carniceriaId: pedido.carniceria_id as string,
        desde: carniceria.telefono_whatsapp as string,
        hacia: pedido.telefono as string,
        cuerpo: `🔔 Recordatorio: tu pedido te espera a las ${formatearHoraArgentina(new Date(pedido.hora_retiro as string))}hs. ¡Te esperamos!`,
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
  // Paso 8 — no-shows automáticos
  // ------------------------------------------------------------
  const { data: paraNoShow, error: errNoShow } = await supabaseAdmin
    .from("pedidos")
    .select("id, cliente_id")
    .eq("estado", "aprobado")
    .is("retirado_at", null)
    .lt("hora_retiro", limiteNoShow.toISOString());

  if (errNoShow) {
    console.error("Error buscando pedidos para marcar no-show", errNoShow);
    errores.push("error buscando pedidos para no-show");
  }

  for (const pedido of paraNoShow ?? []) {
    try {
      await supabaseAdmin.from("pedidos").update({ estado: "no_show" }).eq("id", pedido.id).eq("estado", "aprobado");

      const { data: cliente } = await supabaseAdmin
        .from("clientes")
        .select("no_shows")
        .eq("id", pedido.cliente_id)
        .single();

      if (cliente) {
        await supabaseAdmin
          .from("clientes")
          .update({ no_shows: Number(cliente.no_shows) + 1 })
          .eq("id", pedido.cliente_id);
      }

      noShowsMarcados++;
    } catch (err) {
      console.error("Error marcando no-show", pedido.id, err);
      errores.push(`no-show pedido ${pedido.id}`);
    }
  }

  return NextResponse.json({
    ok: errores.length === 0,
    recordatorios_enviados: recordatoriosEnviados,
    no_shows_marcados: noShowsMarcados,
    errores,
  });
}
