import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { listarProductos } from "@/lib/panel/productos";
import { TablaStock } from "@/components/panel/tabla-stock";
import { EstadoVacio, Tarjeta } from "@/components/panel/ui";
import { IconoMicrofono } from "@/components/panel/iconos";

export default async function StockPage(props: PageProps<"/panel/stock">) {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();
  const parametros = await props.searchParams;

  const productos = await listarProductos(supabase, sesion.carniceria.umbralStockBajoDefault);

  const filtroCrudo = typeof parametros?.estado === "string" ? parametros.estado : "todos";
  const filtro = (
    ["todos", "atencion", "sin_stock", "poco", "disponible", "sin_precio"] as const
  ).includes(filtroCrudo as never)
    ? (filtroCrudo as "todos" | "atencion" | "sin_stock" | "poco" | "disponible" | "sin_precio")
    : "todos";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Stock y precios</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Tocá cualquier número para corregirlo.
        </p>
      </header>

      {/* Recordatorio explícito de que esta pantalla NO reemplaza a la voz.
          Si el panel termina siendo la forma más cómoda de cargar stock, algo
          salió mal en el diseño. */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
        <IconoMicrofono className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />
        <p className="text-sm text-ink-2">
          Para cargar mercadería que llega, mandá un audio por WhatsApp como siempre. Esta pantalla
          es para ver cómo está todo y corregir algo puntual.
        </p>
      </div>

      {productos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no hay productos cargados"
            descripcion="Cuando esté cargado el catálogo de la carnicería, acá vas a ver cada corte con su stock y su precio."
          />
        </Tarjeta>
      ) : (
        <>
          <TablaStock productos={productos} filtroInicial={filtro} />

          <p className="text-xs text-ink-3">
            Los precios son de lista y sirven de referencia: el total real de cada pedido se define
            al pesar en el local.
          </p>
        </>
      )}
    </div>
  );
}
