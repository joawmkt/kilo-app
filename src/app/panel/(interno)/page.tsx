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
  EncabezadoPantalla,
  EstadoVacio,
  Etiqueta,
  Tarjeta,
  TarjetaEncabezado,
  TarjetaMetrica,
  clasesBoton,
} from "@/components/panel/ui";
import { IconoCaja, IconoPedidos, IconoReloj, IconoStock } from "@/components/panel/iconos";
import { IconoCheck } from "@/components/panel/ui";
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
// Orden deliberado: arriba de todo el resumen del día, en cuatro números que se
// leen sin detenerse; después lo que hay que decidir (pedidos esperando
// aprobación), después lo que hay que preparar (los pedidos de hoy por hora) y
// lo que limita al bot (productos sin stock), lado a lado donde hay ancho.
//
// El resumen subió al tope y dejó de ser el pie de la pantalla: era lo primero
// que el carnicero venía a buscar y estaba abajo de todo. Las fichas son bajas
// a propósito — cuatro números y nada más — para que en un teléfono la fila de
// pedidos por aprobar siga entrando arriba del pliegue.
//
// Nada de gráficos: es una pantalla operativa, no un tablero. Los gráficos
// viven en Métricas.

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
    <div className="flex w-full flex-col gap-6">
      <EncabezadoPantalla
        titulo={sesion.carniceria.nombreVisible}
        descripcion={formatearFechaLarga(new Date())}
      />

      {/* ---------------------------------------------------------
          Cómo viene el día, en cuatro números
          --------------------------------------------------------- */}
      <section aria-label="Resumen del día" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaMetrica
          valor={String(deHoy.length)}
          etiqueta="Pedidos de hoy"
          icono={<IconoPedidos className="h-[18px] w-[18px]" />}
          tono="marca"
        />
        <TarjetaMetrica
          valor={String(retirados)}
          etiqueta="Ya retirados"
          icono={<IconoCheck className="h-[18px] w-[18px]" />}
          tono={retirados > 0 ? "exito" : "neutro"}
        />
        <TarjetaMetrica
          valor={String(sinStock.length)}
          etiqueta="Sin stock"
          icono={<IconoStock className="h-[18px] w-[18px]" />}
          tono={sinStock.length > 0 ? "problema" : "neutro"}
        />
        <TarjetaMetrica
          valor={formatearPesos(totalDelDia)}
          etiqueta="Pedidos por WhatsApp"
          icono={<IconoCaja className="h-[18px] w-[18px]" />}
          // Precisión sobre qué incluye este número: es lo que hace que el
          // carnicero pueda confiar en el resto del panel.
          ayuda={
            algunoSinPrecio
              ? "Estimado. Falta cargar algún precio, y no incluye el mostrador."
              : "Estimado sobre precios de lista. No incluye el mostrador."
          }
        />
      </section>

      <AvisoConexionWhatsapp carniceria={sesion.carniceria} />

      {/* ---------------------------------------------------------
          Lo más urgente: pedidos esperando aprobación
          --------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-titulo text-lg font-bold tracking-tight text-ink">
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
              icono={<IconoCheck className="h-5 w-5" />}
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
          Lo que hay que preparar y lo que limita al bot.
          Lado a lado donde hay ancho: son dos listas cortas, y apiladas dejan
          media pantalla vacía a la derecha en cualquier monitor.
          --------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta className="lg:col-span-3">
          <TarjetaEncabezado
            titulo="Pedidos de hoy"
            descripcion="Ordenados por hora de retiro"
            accion={
              <Link href="/panel/pedidos" className={clasesBoton("fantasma", "px-3")}>
                Ver todos
              </Link>
            }
          />

          {deHoy.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no hay pedidos para hoy"
              descripcion="Acá van a aparecer los pedidos aprobados con su hora de retiro, para que sepas cómo viene el día."
              icono={<IconoReloj className="h-5 w-5" />}
            />
          ) : (
            <ul>
              {deHoy.map((pedido) => (
                <li key={pedido.id}>
                  <Link
                    href={`/panel/pedidos/${pedido.id}`}
                    className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-5"
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
                          .map(
                            (item) =>
                              `${formatearCantidad(item.cantidad, item.unidad)} de ${item.nombre_display.toLowerCase()}`
                          )
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

        <Tarjeta className="lg:col-span-2">
          <TarjetaEncabezado
            titulo="Stock que necesita atención"
            descripcion="Lo que el bot no puede ofrecer"
            accion={
              <Link href="/panel/stock" className={clasesBoton("fantasma", "px-3")}>
                Ver stock
              </Link>
            }
          />

          {necesitanAtencion.length === 0 ? (
            <EstadoVacio
              titulo="Está todo con stock"
              descripcion="Ningún producto está en cero ni por debajo de su umbral. Si alguno baja, aparece acá."
              icono={<IconoStock className="h-5 w-5" />}
            />
          ) : (
            <ul>
              {necesitanAtencion.slice(0, 8).map((producto) => (
                <li
                  key={producto.id}
                  className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0 sm:px-5"
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
                <li className="px-4 py-3 sm:px-5">
                  <Link
                    href="/panel/stock?estado=atencion"
                    className="font-titulo text-sm font-semibold text-brand hover:underline"
                  >
                    Ver los {necesitanAtencion.length - 8} restantes
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </Tarjeta>
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        Los totales de esta pantalla cuentan solo los pedidos que entraron por WhatsApp. Lo que se
        vende en el mostrador todavía no está registrado en el sistema.
      </p>
    </div>
  );
}
