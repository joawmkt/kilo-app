import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { listarPedidos } from "@/lib/panel/pedidos";
import { FilaPedido } from "@/components/panel/tarjeta-pedido";
import {
  EnlaceVolver,
  EstadoVacio,
  NumeroGrande,
  Tarjeta,
  TarjetaEncabezado,
  clasesBoton,
} from "@/components/panel/ui";
import { formatearFecha, formatearPesos, formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

export default async function FichaClientePage(props: PageProps<"/panel/clientes/[id]">) {
  await requerirSesion();
  const { id } = await props.params;
  const supabase = await getSupabaseServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, no_shows, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!cliente) notFound();

  const [pedidos, { data: conversacion }] = await Promise.all([
    listarPedidos(supabase, { clienteId: id, estado: "todos", limite: 100 }),
    supabase.from("conversaciones").select("id").eq("telefono", cliente.telefono as string).maybeSingle(),
  ]);

  const retirados = pedidos.filter((pedido) => pedido.estado === "retirado").length;
  const gastado = pedidos
    .filter((pedido) => ["aprobado", "retirado"].includes(pedido.estado))
    .reduce((suma, pedido) => suma + (pedido.totalEstimado ?? 0), 0);
  const ausencias = Number(cliente.no_shows ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnlaceVolver href="/panel/clientes">Volver a clientes</EnlaceVolver>

      <Tarjeta className="p-4 sm:p-5">
        <h1 className="font-titulo text-xl font-bold text-ink">
          {(cliente.nombre as string | null) ?? formatearTelefono(cliente.telefono as string)}
        </h1>
        <p className="mt-0.5 text-sm text-ink-2">
          {formatearTelefono(cliente.telefono as string)} · cliente desde{" "}
          {formatearFecha(cliente.created_at as string)}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumeroGrande valor={String(pedidos.length)} etiqueta="Pedidos" />
          <NumeroGrande valor={String(retirados)} etiqueta="Retirados" />
          <NumeroGrande
            valor={String(ausencias)}
            etiqueta="No retirados"
            tono={ausencias > 0 ? "problema" : "neutro"}
          />
          <NumeroGrande
            valor={formatearPesos(gastado)}
            etiqueta="Total estimado"
            ayuda="Sobre precios de lista"
          />
        </div>

        {/* El registro de ausencias importa y tiene que verse, pero sin
            convertirlo en una condena: el dato sirve para decidir, no para
            etiquetar a una persona. */}
        {ausencias > 0 ? (
          <p className="mt-4 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
            Este cliente dejó {ausencias} {ausencias === 1 ? "pedido" : "pedidos"} sin retirar. Puede
            servirte para decidir cuánto preparar por adelantado.
          </p>
        ) : null}

        {conversacion ? (
          <Link
            href={`/panel/mensajes/${conversacion.id}`}
            className={clasesBoton("secundario", "mt-4")}
          >
            Ver la conversación
          </Link>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <TarjetaEncabezado titulo="Historial de pedidos" />
        {pedidos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hizo ningún pedido"
            descripcion="Escribió por WhatsApp pero no llegó a cerrar un pedido. Cuando lo haga, va a aparecer acá."
          />
        ) : (
          <ul>
            {pedidos.map((pedido) => (
              <li key={pedido.id}>
                <FilaPedido pedido={pedido} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {pedidos.length > 0 ? (
        <p className="text-xs text-ink-3">
          Último pedido {formatearRelativo(pedidos[0].creadoAt)}.
        </p>
      ) : null}
    </div>
  );
}
