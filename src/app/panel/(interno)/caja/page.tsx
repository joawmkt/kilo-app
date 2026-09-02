import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { ingresosDeHoy, ingresosDelMes, ingresosPorDia } from "@/lib/panel/caja";
import { GraficoBarras } from "@/components/panel/graficos";
import {
  EstadoVacio,
  NumeroGrande,
  Tarjeta,
  TarjetaEncabezado,
} from "@/components/panel/ui";
import { formatearHora, formatearPesos } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

// Caja del día — gestión interna de ingresos.
//
// ⚠️ En ningún lado de esta pantalla aparecen las palabras "factura" ni
// "facturación": el producto no emite comprobantes de ningún tipo y no se
// integra con controladores fiscales ni con ARCA.
//
// ⚠️ Y cada total dice exactamente qué incluye. Estos números cuentan SOLO los
// pedidos que entraron por WhatsApp; las ventas del mostrador no están
// registradas en ningún lado todavía. Llamar a esto "lo que vendiste hoy" sería
// mentira, y un carnicero que ve un número que sabe que es falso deja de confiar
// en el resto del panel.

const DIAS_COMPARACION = 7;

export default async function CajaPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();

  const [hoy, mes, porDia] = await Promise.all([
    ingresosDeHoy(supabase),
    ingresosDelMes(supabase),
    ingresosPorDia(supabase, DIAS_COMPARACION),
  ]);

  const nombresDia = ["D", "L", "M", "M", "J", "V", "S"];

  const datosGrafico = porDia.map((dia) => ({
    etiqueta: nombresDia[dia.fecha.getDay()],
    etiquetaLarga: new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(dia.fecha),
    valor: dia.total,
    valorFormateado: formatearPesos(dia.total),
  }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Caja</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Lo que entró por los pedidos de WhatsApp. Es para tu control, no es un comprobante.
        </p>
      </header>

      {/* La advertencia de alcance va arriba de los números, no en una nota al
          pie que nadie lee. */}
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
        <p className="font-titulo text-sm font-semibold text-ink">Qué incluyen estos números</p>
        <p className="mt-1 text-sm text-ink-2">
          Solo los pedidos que entraron por WhatsApp y que aprobaste. Lo que vendés en el mostrador
          no está contado acá: el sistema todavía no lo registra. Y los totales son estimativos,
          porque el precio final de cada pedido se define al pesar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta className="p-4 sm:p-5">
          <NumeroGrande
            valor={formatearPesos(hoy.totalEstimado)}
            etiqueta="Hoy · pedidos por WhatsApp"
            ayuda={
              hoy.pedidosSinPrecio > 0
                ? `${hoy.cantidadPedidos} pedidos · ${hoy.pedidosSinPrecio} sin precio cargado`
                : `${hoy.cantidadPedidos} ${hoy.cantidadPedidos === 1 ? "pedido" : "pedidos"}`
            }
          />
        </Tarjeta>

        <Tarjeta className="p-4 sm:p-5">
          <NumeroGrande
            valor={formatearPesos(mes.totalEstimado)}
            etiqueta="Este mes · pedidos por WhatsApp"
            ayuda={
              mes.pedidosSinPrecio > 0
                ? `${mes.cantidadPedidos} pedidos · ${mes.pedidosSinPrecio} sin precio cargado`
                : `${mes.cantidadPedidos} ${mes.cantidadPedidos === 1 ? "pedido" : "pedidos"}`
            }
          />
        </Tarjeta>
      </div>

      <Tarjeta>
        <TarjetaEncabezado
          titulo="Últimos 7 días"
          descripcion="Cuánto entró por día, para comparar de un vistazo"
        />
        <div className="px-4 py-4 sm:px-5">
          <GraficoBarras
            datos={datosGrafico}
            titulo="Ingresos por pedidos de WhatsApp, últimos 7 días"
            descripcionVacio="Cuando empiecen a entrar pedidos aprobados, acá vas a ver cómo viene cada día comparado con los anteriores."
          />
        </div>
      </Tarjeta>

      <Tarjeta>
        <TarjetaEncabezado titulo="Pedidos de hoy, uno por uno" />

        {hoy.detalle.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no entró nada hoy"
            descripcion="Cada pedido que apruebes va a aparecer acá con su total estimado."
          />
        ) : (
          <ul>
            {hoy.detalle.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/panel/pedidos/${pedido.id}`}
                  className="flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {pedido.clienteNombre ?? formatearTelefono(pedido.telefono)}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {pedido.horaRetiro ? `Retira ${formatearHora(pedido.horaRetiro)} · ` : ""}
                      {pedido.cantidadItems}{" "}
                      {pedido.cantidadItems === 1 ? "producto" : "productos"}
                    </span>
                  </span>

                  <span className="numero shrink-0 text-base font-semibold text-ink">
                    {pedido.total !== null ? formatearPesos(pedido.total) : "Sin precio"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {hoy.pedidosSinPrecio > 0 ? (
        <p className="text-sm text-ink-2">
          Hay {hoy.pedidosSinPrecio}{" "}
          {hoy.pedidosSinPrecio === 1 ? "pedido que no suma" : "pedidos que no suman"} al total
          porque falta cargar el precio de alguno de sus productos.{" "}
          <Link href="/panel/stock?estado=sin_precio" className="font-semibold text-brand">
            Cargar precios
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
