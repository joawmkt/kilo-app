import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { HiloConversacion } from "@/components/panel/hilo-conversacion";
import { TomarConversacion } from "@/components/panel/tomar-conversacion";
import { accionMarcarLeida } from "../../acciones";
import { EnlaceVolver, clasesBoton } from "@/components/panel/ui";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { minutosRestantesDeVentana, ventanaAbierta } from "@/lib/whatsapp/conversaciones";

export default async function ConversacionPage(props: PageProps<"/panel/mensajes/[id]">) {
  const sesion = await requerirSesion();
  const { id } = await props.params;
  const supabase = await getSupabaseServidor();

  const { data: conversacion } = await supabase
    .from("conversaciones")
    .select(
      "id, telefono, cliente_id, es_carnicero, ventana_24h_vence_at, no_leidos, bot_pausado_hasta, clientes(nombre)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!conversacion) notFound();

  const { data: mensajes } = await supabase
    .from("mensajes_whatsapp")
    .select("id, direccion, tipo, cuerpo, origen, estado_envio, error_mensaje, plantilla_nombre, pedido_id, created_at")
    .eq("conversacion_id", id)
    .order("created_at", { ascending: true })
    .limit(300);

  // Abrir la conversación la marca como leída. No es exacto con coexistencia
  // (puede haberla leído antes en el celular), pero es lo que espera cualquiera
  // que abra un chat.
  if (Number(conversacion.no_leidos ?? 0) > 0) {
    await accionMarcarLeida(id);
  }

  const cliente = Array.isArray(conversacion.clientes)
    ? conversacion.clientes[0]
    : (conversacion.clientes as { nombre: string | null } | null);

  const abierta = ventanaAbierta(conversacion.ventana_24h_vence_at as string | null);
  const minutos = minutosRestantesDeVentana(conversacion.ventana_24h_vence_at as string | null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EnlaceVolver href="/panel/mensajes">Volver a mensajes</EnlaceVolver>

        {conversacion.cliente_id ? (
          <Link
            href={`/panel/clientes/${conversacion.cliente_id}`}
            className={clasesBoton("fantasma")}
          >
            Ver el cliente
          </Link>
        ) : null}
      </div>

      <header>
        <h1 className="font-titulo text-lg font-bold text-ink">
          {cliente?.nombre ?? formatearTelefono(conversacion.telefono as string)}
        </h1>
        <p className="text-sm text-ink-2">{formatearTelefono(conversacion.telefono as string)}</p>
      </header>

      {/* Tomar la conversación (especificación, sección 43): la excepción para
          cuando algo falló y hace falta que atienda una persona. */}
      {conversacion.es_carnicero ? null : (
        <TomarConversacion
          conversacionId={id}
          pausadoHasta={(conversacion.bot_pausado_hasta as string | null) ?? null}
        />
      )}

      <HiloConversacion
        conversacionId={id}
        mensajes={((mensajes ?? []) as unknown as FilaMensaje[]).map((fila) => ({
          id: fila.id,
          direccion: fila.direccion as "entrante" | "saliente",
          tipo: fila.tipo,
          cuerpo: fila.cuerpo,
          origen: fila.origen,
          estadoEnvio: fila.estado_envio,
          error: fila.error_mensaje,
          plantilla: fila.plantilla_nombre,
          pedidoId: fila.pedido_id,
          creadoAt: fila.created_at,
        }))}
        ventanaAbierta={abierta}
        minutosRestantes={minutos}
        proveedor={sesion.carniceria.whatsappProveedor}
      />
    </div>
  );
}

type FilaMensaje = {
  id: string;
  direccion: string;
  tipo: string;
  cuerpo: string | null;
  origen: string | null;
  estado_envio: string | null;
  error_mensaje: string | null;
  plantilla_nombre: string | null;
  pedido_id: string | null;
  created_at: string;
};
