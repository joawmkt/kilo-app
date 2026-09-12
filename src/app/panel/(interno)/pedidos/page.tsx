import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { listarPedidos, type EstadoPedido } from "@/lib/panel/pedidos";
import { FilaPedido } from "@/components/panel/tarjeta-pedido";
import { EncabezadoPantalla, EstadoVacio, Tarjeta } from "@/components/panel/ui";
import { rangoDelDiaArgentina } from "@/lib/panel/formatos";

// Historial de pedidos, más allá de los de hoy.
//
// Los filtros van por la URL y no por estado del cliente: así el carnicero
// puede dejar "Sin retirar" guardado en favoritos, y volver atrás con el botón
// del navegador funciona como se espera.

const FILTROS_ESTADO: { valor: string; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "pendiente_aprobacion", etiqueta: "Esperando aprobación" },
  { valor: "aprobado", etiqueta: "Aprobados" },
  { valor: "retirado", etiqueta: "Retirados" },
  { valor: "no_show", etiqueta: "No retirados" },
  { valor: "rechazado", etiqueta: "Rechazados" },
];

const FILTROS_FECHA: { valor: string; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Siempre" },
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Últimos 7 días" },
  { valor: "mes", etiqueta: "Últimos 30 días" },
];

export default async function PedidosPage(props: PageProps<"/panel/pedidos">) {
  await requerirSesion();
  const supabase = await getSupabaseServidor();
  const parametros = await props.searchParams;

  const estado = leerParametro(parametros?.estado, FILTROS_ESTADO, "todos");
  const periodo = leerParametro(parametros?.fecha, FILTROS_FECHA, "todas");

  const pedidos = await listarPedidos(supabase, {
    estado: estado === "todos" ? "todos" : (estado as EstadoPedido),
    desde: desdeDePeriodo(periodo),
    limite: 200,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <EncabezadoPantalla titulo="Pedidos" descripcion={pedidos.length === 0
            ? "Sin pedidos en este filtro"
            : `${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}`} />

      <GrupoFiltros
        titulo="Estado"
        clave="estado"
        opciones={FILTROS_ESTADO}
        activo={estado}
        otros={{ fecha: periodo }}
      />
      <GrupoFiltros
        titulo="Cuándo"
        clave="fecha"
        opciones={FILTROS_FECHA}
        activo={periodo}
        otros={{ estado }}
      />

      <Tarjeta>
        {pedidos.length === 0 ? (
          <EstadoVacio
            titulo="No hay pedidos acá"
            descripcion="Probá con otro filtro. Los pedidos aparecen a medida que los clientes escriben por WhatsApp."
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
    </div>
  );
}

function GrupoFiltros({
  titulo,
  clave,
  opciones,
  activo,
  otros,
}: {
  titulo: string;
  clave: string;
  opciones: { valor: string; etiqueta: string }[];
  activo: string;
  otros: Record<string, string>;
}) {
  return (
    <section>
      <h2 className="mb-2 font-titulo text-sm font-semibold text-ink-2">
        {titulo}
      </h2>
      <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {opciones.map(({ valor, etiqueta }) => {
            const parametros = new URLSearchParams({ ...otros, [clave]: valor });
            const seleccionado = activo === valor;

            return (
              <Link
                key={valor}
                href={`/panel/pedidos?${parametros.toString()}`}
                aria-current={seleccionado ? "true" : undefined}
                className={`flex min-h-11 items-center rounded-full border px-4 font-titulo text-sm font-semibold transition-colors ${
                  seleccionado
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {etiqueta}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function leerParametro(
  crudo: string | string[] | undefined,
  opciones: { valor: string }[],
  porDefecto: string
): string {
  if (typeof crudo !== "string") return porDefecto;
  return opciones.some((opcion) => opcion.valor === crudo) ? crudo : porDefecto;
}

function desdeDePeriodo(periodo: string): string | undefined {
  if (periodo === "hoy") return rangoDelDiaArgentina().desde.toISOString();
  if (periodo === "semana") return new Date(Date.now() - 7 * 86400000).toISOString();
  if (periodo === "mes") return new Date(Date.now() - 30 * 86400000).toISOString();
  return undefined;
}
