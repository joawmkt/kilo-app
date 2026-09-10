import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { pedidosDeHoy, pedidosEsperandoAprobacion } from "@/lib/panel/pedidos";
import {
  ETIQUETA_ESTADO_STOCK,
  TONO_ESTADO_STOCK,
  productosQueNecesitanAtencion,
} from "@/lib/panel/productos";
import { TarjetaPedidoPendiente } from "@/components/panel/tarjeta-pedido";
import { AvisoConexionWhatsapp } from "@/components/panel/aviso-conexion";
import {
  EstadoVacio,
  Etiqueta,
  NumeroGrande,
  Tarjeta,
  TarjetaEncabezado,
  clasesBoton,
} from "@/components/panel/ui";
import { IconoReloj } from "@/components/panel/iconos";
import {
  formatearCantidad,
  formatearFechaLarga,
  formatearHora,
  formatearPesos,
} from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { etiquetaDePedido } from "@/lib/panel/pedidos";

// Inicio — la pantalla que resuelve el día.
//
// Responde de un vistazo: ¿hay algo que necesite mi atención AHORA?
//
// Orden deliberado: primero lo que hay que decidir (pedidos esperando
// aprobación), después lo que hay que preparar (los pedidos de hoy por hora),
// después lo que limita al bot (productos sin stock), y al final el resumen.
// Nada de gráficos: es una pantalla operativa, no un tablero.

export default async function InicioPage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const [pendientes, deHoy, necesitanAtencion] = await Promise.all([
    pedidosEsperandoAprobacion(supabase),
    pedidosDeHoy(supabase),
    productosQueNecesitanAtencion(supabase, sesion.carniceria.umbralStockBajoDefault),
  ]);

  const totalDelDia = deHoy.reduce((suma, pedido) => suma + (pedido.totalEstimado ?? 0), 0);
  const algunoSinPrecio = deHoy.some((pedido) => pedido.totalEstimado === null);
  const retirados = deHoy.filter((pedido) => pedido.estado === "retirado").length;
  const sinStock = necesitanAtencion.filter((producto) => producto.estado === "sin_stock");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">
          {sesion.carniceria.nombreVisible}
        </h1>
        <p className="mt-0.5 text-sm capitalize text-ink-2">{formatearFechaLarga(new Date())}</p>
      </header>

      <AvisoConexionWhatsapp carniceria={sesion.carniceria} />

      {/* ---------------------------------------------------------
          1. Lo más urgente: pedidos esperando aprobación
          --------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-titulo text-lg font-bold text-ink">
            Esperando que los apruebes
          </h2>
          {pendientes.length > 0 ? (
            <Etiqueta tono="atencion">{pendientes.length}</Etiqueta>
          ) : null}
        </div>

        {pendientes.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo="No hay nada esperando"
              descripcion="Cuando un cliente arme un pedido por WhatsApp, va a aparecer acá para que lo apruebes o lo rechaces."
            />
          </Tarjeta>
        ) : (
          <div className="flex flex-col gap-3">
            {pendientes.map((pedido) => (
              <TarjetaPedidoPendiente key={pedido.id} pedido={pedido} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------
          2. Los pedidos de hoy, por hora de retiro
          --------------------------------------------------------- */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Pedidos de hoy"
          descripcion="Ordenados por hora de retiro"
          accion={
            <Link href="/panel/pedidos" className={clasesBoton("fantasma")}>
              Ver todos
            </Link>
          }
        />

        {deHoy.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay pedidos para hoy"
            descripcion="Acá van a aparecer los pedidos aprobados con su hora de retiro, para que sepas cómo viene el día."
          />
        ) : (
          <ul>
            {deHoy.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/panel/pedidos/${pedido.id}`}
                  className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
                >
                  <span className="numero flex w-14 shrink-0 items-center gap-1 text-base font-semibold text-ink">
                    <IconoReloj className="h-4 w-4 text-ink-3" />
                    {pedido.horaRetiro ? formatearHora(pedido.horaRetiro) : "—"}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-titulo text-sm font-semibold text-ink">
                      {pedido.clienteNombre ?? formatearTelefono(pedido.telefono)}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {pedido.items
                        .map((item) => `${formatearCantidad(item.cantidad, item.unidad)} de ${item.nombre_display.toLowerCase()}`)
                        .join(" · ")}
                    </span>
                  </span>

                  <Etiqueta tono={etiquetaDePedido(pedido).tono}>
                    {etiquetaDePedido(pedido).texto}
                  </Etiqueta>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* ---------------------------------------------------------
          3. Lo que limita al bot: productos sin stock o con poco
          --------------------------------------------------------- */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Stock que necesita atención"
          descripcion="Lo que el bot no puede ofrecer, o está por no poder"
          accion={
            <Link href="/panel/stock" className={clasesBoton("fantasma")}>
              Ver stock
            </Link>
          }
        />

        {necesitanAtencion.length === 0 ? (
          <EstadoVacio
            titulo="Está todo con stock"
            descripcion="Ningún producto está en cero ni por debajo de su umbral. Si alguno baja, aparece acá."
          />
        ) : (
          <ul>
            {necesitanAtencion.slice(0, 8).map((producto) => (
              <li
                key={producto.id}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm text-ink">{producto.nombre}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="numero text-sm text-ink-2">
                    {formatearCantidad(producto.stock, producto.unidad)}
                  </span>
                  <Etiqueta tono={TONO_ESTADO_STOCK[producto.estado]}>
                    {ETIQUETA_ESTADO_STOCK[producto.estado]}
                  </Etiqueta>
                </span>
              </li>
            ))}

            {necesitanAtencion.length > 8 ? (
              <li className="px-4 py-3">
                <Link href="/panel/stock?estado=atencion" className="text-sm font-semibold text-brand">
                  Ver los {necesitanAtencion.length - 8} restantes
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </Tarjeta>

      {/* ---------------------------------------------------------
          4. Resumen corto del día
          --------------------------------------------------------- */}
      <Tarjeta className="p-4 sm:p-5">
        <h2 className="font-titulo text-base font-semibold text-ink">Cómo viene el día</h2>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumeroGrande valor={String(deHoy.length)} etiqueta="Pedidos de hoy" />
          <NumeroGrande valor={String(retirados)} etiqueta="Ya retirados" />
          <NumeroGrande
            valor={String(sinStock.length)}
            etiqueta="Sin stock"
            tono={sinStock.length > 0 ? "problema" : "neutro"}
          />
          <NumeroGrande
            valor={formatearPesos(totalDelDia)}
            etiqueta="Pedidos por WhatsApp"
            // Precisión sobre qué incluye este número: es lo que hace que el
            // carnicero pueda confiar en el resto del panel.
            ayuda={
              algunoSinPrecio
                ? "Estimado. Falta cargar el precio de algún producto, y no incluye el mostrador."
                : "Estimado sobre precios de lista. No incluye las ventas del mostrador."
            }
          />
        </div>

        <p className="mt-4 border-t border-border pt-3 text-xs text-ink-3">
          Los totales de esta pantalla cuentan solo los pedidos que entraron por WhatsApp. Lo que se
          vende en el mostrador todavía no está registrado en el sistema.
        </p>
      </Tarjeta>
    </div>
  );
}
