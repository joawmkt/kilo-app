import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { GraficoBarras, GraficoRanking, GraficoRosca } from "@/components/panel/graficos";
import {
  EncabezadoPantalla,
  Tarjeta,
  TarjetaEncabezado,
  TarjetaMetrica,
} from "@/components/panel/ui";
import { formatearCantidad, rangoDelDiaArgentina } from "@/lib/panel/formatos";
import type { ItemPedido } from "@/lib/panel/pedidos";

// Métricas.
//
// Dos reglas que ordenan esta pantalla:
//
//   1. NO INVENTAR MÉTRICAS. Todo lo que está acá se calcula con datos que
//      realmente existen en la base. No hay "ticket promedio proyectado" ni
//      "índice de satisfacción": suenan bien y no se pueden calcular.
//   2. NO MOSTRAR GRÁFICOS VACÍOS. Durante el piloto va a haber poquísimos
//      datos, así que cada gráfico tiene un estado inicial digno que explica qué
//      va a aparecer ahí, en vez de un rectángulo en blanco.
//
// Los totales de plata no están acá: viven en Caja, donde se puede explicar bien
// qué incluyen y qué no.

const DIAS = 30;

export default async function MetricasPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();

  const desde = new Date(rangoDelDiaArgentina().desde.getTime() - (DIAS - 1) * 86400000);

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, estado, cliente_id, items, hora_retiro, created_at")
    .gte("created_at", desde.toISOString());

  if (error) throw new Error(error.message);

  const pedidos = (data ?? []) as unknown as FilaMetrica[];

  // Solo cuentan los pedidos que llegaron a existir: los que quedaron a medio
  // armar son conversaciones, no pedidos.
  const reales = pedidos.filter(
    (pedido) => !["pendiente_aclaracion", "vencido"].includes(pedido.estado)
  );

  // ---------- Pedidos por día ----------
  const porDia = new Map<number, number>();
  for (let indice = 0; indice < DIAS; indice += 1) {
    porDia.set(desde.getTime() + indice * 86400000, 0);
  }
  for (const pedido of reales) {
    const dia = rangoDelDiaArgentina(new Date(pedido.created_at)).desde.getTime();
    if (porDia.has(dia)) porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }

  // Se muestran los últimos 14 días: 30 barras en la pantalla de un teléfono
  // son rayitas ilegibles.
  const serieDias = [...porDia.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-14)
    .map(([tiempo, cantidad]) => {
      const fecha = new Date(tiempo);
      return {
        etiqueta: String(fecha.getDate()),
        etiquetaLarga: new Intl.DateTimeFormat("es-AR", {
          weekday: "long",
          day: "numeric",
          month: "short",
          timeZone: "America/Argentina/Buenos_Aires",
        }).format(fecha),
        valor: cantidad,
        valorFormateado: `${cantidad} ${cantidad === 1 ? "pedido" : "pedidos"}`,
      };
    });

  // ---------- Clientes nuevos vs. que vuelven ----------
  const primerPedidoPorCliente = new Map<string, string>();
  for (const pedido of reales) {
    if (!pedido.cliente_id) continue;
    const actual = primerPedidoPorCliente.get(pedido.cliente_id);
    if (!actual || pedido.created_at < actual) {
      primerPedidoPorCliente.set(pedido.cliente_id, pedido.created_at);
    }
  }
  const clientesAtendidos = primerPedidoPorCliente.size;
  const pedidosPorCliente = new Map<string, number>();
  for (const pedido of reales) {
    if (!pedido.cliente_id) continue;
    pedidosPorCliente.set(pedido.cliente_id, (pedidosPorCliente.get(pedido.cliente_id) ?? 0) + 1);
  }
  const recurrentes = [...pedidosPorCliente.values()].filter((cantidad) => cantidad > 1).length;

  // ---------- Productos más pedidos ----------
  const porProducto = new Map<string, { nombre: string; cantidad: number; veces: number; unidad: string }>();
  for (const pedido of reales) {
    const items = Array.isArray(pedido.items) ? (pedido.items as ItemPedido[]) : [];
    for (const item of items) {
      const acumulado = porProducto.get(item.producto_codigo) ?? {
        nombre: item.nombre_display,
        cantidad: 0,
        veces: 0,
        unidad: item.unidad,
      };
      acumulado.cantidad += item.cantidad;
      acumulado.veces += 1;
      porProducto.set(item.producto_codigo, acumulado);
    }
  }
  const masPedidos = [...porProducto.values()]
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 8)
    .map((producto) => ({
      etiqueta: producto.nombre,
      etiquetaLarga: `${producto.nombre}: ${producto.veces} pedidos, ${formatearCantidad(producto.cantidad, producto.unidad)} en total`,
      valor: producto.veces,
      valorFormateado: String(producto.veces),
    }));

  // ---------- Horarios de retiro más elegidos ----------
  const porHora = new Map<number, number>();
  for (const pedido of reales) {
    if (!pedido.hora_retiro) continue;
    // Hora Argentina (UTC-3), que es la que le importa al carnicero.
    const hora = new Date(new Date(pedido.hora_retiro).getTime() - 3 * 3600 * 1000).getUTCHours();
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
  }
  const horariosElegidos = [...porHora.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hora, cantidad]) => ({
      etiqueta: `${String(hora).padStart(2, "0")}h`,
      etiquetaLarga: `Entre las ${hora}:00 y las ${hora + 1}:00`,
      valor: cantidad,
      valorFormateado: `${cantidad} ${cantidad === 1 ? "pedido" : "pedidos"}`,
    }));

  // ---------- Ausencias y rechazos ----------
  const ausencias = reales.filter((pedido) => pedido.estado === "no_show").length;
  const entregables = reales.filter((pedido) =>
    ["aprobado", "retirado", "no_show"].includes(pedido.estado)
  ).length;
  const tasaAusencias = entregables === 0 ? null : Math.round((ausencias / entregables) * 100);

  // Pedidos que se cayeron por falta de stock: se detectan por los items que
  // quedaron marcados como no disponibles al armarse.
  const rechazadosPorStock = reales.filter((pedido) => {
    const items = Array.isArray(pedido.items) ? (pedido.items as ItemPedido[]) : [];
    return items.some((item) => item.disponible === false);
  }).length;

  return (
    <div className="flex w-full flex-col gap-6">
      <EncabezadoPantalla titulo="Métricas" descripcion={`Últimos ${DIAS} días`} />

      <section aria-label="Resumen del período" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaMetrica valor={String(reales.length)} etiqueta="Pedidos" tono="marca" />
        <TarjetaMetrica
          valor={String(clientesAtendidos)}
          etiqueta="Clientes atendidos"
          ayuda={`${recurrentes} volvieron más de una vez`}
        />
        <TarjetaMetrica
          valor={tasaAusencias === null ? "—" : `${tasaAusencias}%`}
          etiqueta="No retirados"
          tono={tasaAusencias !== null && tasaAusencias > 15 ? "problema" : "neutro"}
          ayuda={
            tasaAusencias === null
              ? "Todavía no hay pedidos entregables"
              : `${ausencias} de ${entregables}`
          }
        />
        <TarjetaMetrica
          valor={String(rechazadosPorStock)}
          etiqueta="Con falta de stock"
          tono={rechazadosPorStock > 0 ? "atencion" : "neutro"}
          ayuda="Pedidos donde faltó algo que el cliente pidió"
        />
      </section>

      <Tarjeta>
        <TarjetaEncabezado titulo="Pedidos por día" descripcion="Últimas dos semanas" />
        <div className="px-4 py-4 sm:px-5">
          <GraficoBarras
            datos={serieDias}
            titulo="Pedidos por día, últimas dos semanas"
            descripcionVacio="Cuando empiecen a entrar pedidos, acá vas a ver cuántos por día y si la cosa sube o baja."
          />
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Único reparto parte-de-un-todo de la pantalla, y por eso el único
            lugar donde una rosca es la forma correcta: cada cliente atendido
            está en exactamente una de las dos mitades. */}
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Quiénes te compran"
            descripcion="Cuántos volvieron a pedir en el período"
          />
          <div className="px-4 py-5 sm:px-5">
            <GraficoRosca
              segmentos={[
                { etiqueta: "Volvieron a pedir", valor: recurrentes, serie: 1 },
                { etiqueta: "Pidieron una sola vez", valor: clientesAtendidos - recurrentes, serie: 2 },
              ]}
              total={String(clientesAtendidos)}
              etiquetaCentro="clientes atendidos"
              titulo="Clientes que volvieron a pedir y clientes de una sola vez"
              descripcionVacio="Cuando varios clientes hayan pedido, acá vas a ver qué proporción vuelve, que es la métrica que más dice si el bot está funcionando."
            />
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaEncabezado
            titulo="Lo que más te piden"
            descripcion="Cuántos pedidos incluyeron cada corte"
          />
          <div className="px-4 py-4 sm:px-5">
            <GraficoRanking
              datos={masPedidos}
              titulo="Cortes más pedidos"
              descripcionVacio="Con unos cuantos pedidos vas a poder ver qué cortes te piden más, que es lo que más te dice qué conviene tener."
            />
          </div>
        </Tarjeta>
      </div>

      <Tarjeta>
        <TarjetaEncabezado
          titulo="A qué hora pasan a retirar"
          descripcion="Sirve para organizar el trabajo del local"
        />
        <div className="px-4 py-4 sm:px-5">
          <GraficoRanking
            datos={horariosElegidos}
            titulo="Horarios de retiro más elegidos"
            descripcionVacio="Cuando haya suficientes pedidos con hora de retiro, acá vas a ver en qué franjas se te junta la gente."
            serie={2}
          />
        </div>
      </Tarjeta>

      <p className="text-xs leading-relaxed text-ink-3">
        Todo lo de esta pantalla se calcula con los pedidos que entraron por WhatsApp. Las ventas del
        mostrador no están contadas.
      </p>
    </div>
  );
}

type FilaMetrica = {
  id: string;
  estado: string;
  cliente_id: string | null;
  items: unknown;
  hora_retiro: string | null;
  created_at: string;
};
