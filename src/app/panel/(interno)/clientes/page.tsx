import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { ListaClientes } from "@/components/panel/lista-clientes";
import { EncabezadoPantalla, EstadoVacio, Tarjeta } from "@/components/panel/ui";

// Clientes.
//
// Es una agenda con historial, no un CRM de ventas: no hay embudo, ni etapas,
// ni puntajes. Lo que el carnicero necesita saber de un cliente es cuántas
// veces le compró, cuándo fue la última, y si le dejó pedidos sin retirar.

export type ClienteDelPanel = {
  id: string;
  nombre: string | null;
  telefono: string;
  ausencias: number;
  pedidos: number;
  ultimoPedidoAt: string | null;
};

export default async function ClientesPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();

  const { data: filas, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, no_shows, created_at, pedidos(id, created_at, estado)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const clientes: ClienteDelPanel[] = ((filas ?? []) as unknown as FilaCliente[])
    .map((fila) => {
      // Solo cuentan los pedidos que llegaron a existir de verdad: los que
      // quedaron a medio armar o vencidos no son compras.
      const reales = (fila.pedidos ?? []).filter(
        (pedido) => !["pendiente_aclaracion", "vencido", "cancelado"].includes(pedido.estado)
      );

      const ultimo = reales.reduce<string | null>(
        (masReciente, pedido) =>
          masReciente === null || pedido.created_at > masReciente ? pedido.created_at : masReciente,
        null
      );

      return {
        id: fila.id,
        nombre: fila.nombre,
        telefono: fila.telefono,
        ausencias: Number(fila.no_shows ?? 0),
        pedidos: reales.length,
        ultimoPedidoAt: ultimo,
      };
    })
    .sort((a, b) => {
      if (a.ultimoPedidoAt && b.ultimoPedidoAt) return b.ultimoPedidoAt.localeCompare(a.ultimoPedidoAt);
      if (a.ultimoPedidoAt) return -1;
      if (b.ultimoPedidoAt) return 1;
      return (a.nombre ?? a.telefono).localeCompare(b.nombre ?? b.telefono, "es");
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <EncabezadoPantalla titulo="Clientes" descripcion={clientes.length === 0
            ? "Todavía no hay clientes"
            : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`} />

      {clientes.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no te escribió nadie"
            descripcion="Cada persona que le escriba al WhatsApp de la carnicería va a quedar acá, con su historial de pedidos y de ausencias."
          />
        </Tarjeta>
      ) : (
        <ListaClientes clientes={clientes} />
      )}
    </div>
  );
}

type FilaCliente = {
  id: string;
  nombre: string | null;
  telefono: string;
  no_shows: number;
  created_at: string;
  pedidos: { id: string; created_at: string; estado: string }[] | null;
};
