import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import {
  NOMBRE_ACTOR,
  etiquetaDePedido,
  obtenerHistorialDePedido,
  obtenerPedido,
} from "@/lib/panel/pedidos";
import { AccionesPedido } from "@/components/panel/acciones-pedido";
import { EnlaceVolver, Etiqueta, Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/panel/ui";
import {
  formatearCantidad,
  formatearFechaYHora,
  formatearHora,
  formatearPesos,
} from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

export default async function DetallePedidoPage(props: PageProps<"/panel/pedidos/[id]">) {
  await requerirSesion();
  const { id } = await props.params;
  const supabase = await getSupabaseServidor();

  const pedido = await obtenerPedido(supabase, id);
  if (!pedido) notFound();

  // La conversación que originó el pedido: es lo que explica POR QUÉ el bot
  // armó este pedido y no otro.
  const { data: conversacion } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", pedido.telefono)
    .maybeSingle();

  // Historial de eventos (especificación, sección 27): por qué el pedido está
  // como está, sin tener que leer toda la conversación.
  const historial = await obtenerHistorialDePedido(supabase, id);

  const total = pedido.totalEstimado;
  const faltaAlgunPrecio = pedido.items.some(
    (item) => item.precio_unitario === null || item.precio_unitario === undefined
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnlaceVolver href="/panel/pedidos">Volver a pedidos</EnlaceVolver>

      <Tarjeta>
        <TarjetaEncabezado
          titulo={pedido.clienteNombre ?? formatearTelefono(pedido.telefono)}
          descripcion={`Pedido del ${formatearFechaYHora(pedido.creadoAt)}`}
          accion={
            <Etiqueta tono={etiquetaDePedido(pedido).tono}>{etiquetaDePedido(pedido).texto}</Etiqueta>
          }
        />

        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Teléfono" valor={formatearTelefono(pedido.telefono)} />
            <Dato
              etiqueta="Hora de retiro"
              valor={pedido.horaRetiro ? `${formatearHora(pedido.horaRetiro)}hs` : "Sin definir"}
            />
            <Dato etiqueta="Entró por" valor={pedido.origen === "panel" ? "El panel" : "WhatsApp"} />
          </div>

          <div>
            <h3 className="font-titulo text-sm font-semibold text-ink-3">
              Productos
            </h3>
            <ul className="mt-2 divide-y divide-border rounded-control border border-border">
              {pedido.items.map((item, indice) => (
                <li
                  key={`${item.producto_id}-${indice}`}
                  className="flex items-baseline justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{item.nombre_display}</span>
                    {item.sustituye_a_producto_id ? (
                      <span className="block text-xs text-ink-3">
                        Se ofreció como alternativa porque faltaba lo que había pedido
                      </span>
                    ) : null}
                    {!item.disponible ? (
                      <span className="block text-xs text-warning">
                        No había stock cuando se armó el pedido
                      </span>
                    ) : null}
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="numero block text-base font-semibold text-ink">
                      {formatearCantidad(item.cantidad, item.unidad)}
                    </span>
                    {item.precio_unitario !== null && item.precio_unitario !== undefined ? (
                      <span className="numero block text-xs text-ink-3">
                        {formatearPesos(item.precio_unitario * item.cantidad)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* El total es estimativo y la pantalla lo dice. El precio final se
              determina al pesar: un número presentado como definitivo que
              después no coincide destruye la confianza en todo el panel. */}
          <div className="rounded-control bg-surface-2 px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-titulo text-sm font-semibold text-ink-2">Total estimado</span>
              <span className="numero text-xl font-semibold text-ink">
                {total !== null ? formatearPesos(total) : "Sin calcular"}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-3">
              {total !== null
                ? "Calculado con los precios de lista al momento de aprobar. El total real se define al pesar."
                : faltaAlgunPrecio
                  ? "Falta cargar el precio de alguno de estos productos."
                  : "El total se calcula cuando se aprueba el pedido."}
            </p>
          </div>

          {pedido.clienteAusencias > 0 ? (
            <p className="flex items-center gap-2 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
              Este cliente tiene {pedido.clienteAusencias}{" "}
              {pedido.clienteAusencias === 1 ? "pedido que no retiró" : "pedidos que no retiró"}.
            </p>
          ) : null}
        </div>

        <div className="border-t border-border px-4 py-3 sm:px-5">
          <AccionesPedido
            pedidoId={pedido.id}
            estado={pedido.estado}
            version={pedido.version}
            consulta={pedido.consultaCarnicero}
            listo={pedido.listoAt !== null}
          />
        </div>
      </Tarjeta>

      <div className="flex flex-wrap gap-2">
        {conversacion ? (
          <Link href={`/panel/mensajes/${conversacion.id}`} className={clasesBoton("secundario")}>
            Ver la conversación
          </Link>
        ) : null}
        {pedido.clienteId ? (
          <Link href={`/panel/clientes/${pedido.clienteId}`} className={clasesBoton("secundario")}>
            Ver el cliente
          </Link>
        ) : null}
      </div>

      {historial.length > 0 ? (
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Qué pasó con este pedido"
            descripcion={pedido.version > 1 ? `Va por la versión ${pedido.version}` : undefined}
          />
          <ul className="divide-y divide-border">
            {historial.map((evento) => (
              <li key={evento.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm text-ink">
                  {evento.descripcion ?? evento.tipo.replace(/_/g, " ")}
                </p>
                <p className="numero mt-0.5 text-xs text-ink-3">
                  {NOMBRE_ACTOR[evento.actor] ?? evento.actor} · {formatearFechaYHora(evento.creadoAt)}
                  {evento.version ? ` · versión ${evento.version}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="font-titulo text-xs font-semibold text-ink-3">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-ink">{valor}</p>
    </div>
  );
}
