import { TarjetaPedidoPendiente, FilaPedido } from "@/components/panel/tarjeta-pedido";
import { TablaStock } from "@/components/panel/tabla-stock";
import { GraficoBarras, GraficoRanking } from "@/components/panel/graficos";
import {
  EstadoError,
  EstadoVacio,
  Etiqueta,
  NumeroGrande,
  Tarjeta,
  TarjetaEncabezado,
  clasesBoton,
} from "@/components/panel/ui";
import type { PedidoDelPanel } from "@/lib/panel/pedidos";
import type { ProductoDelPanel } from "@/lib/panel/productos";

// ============================================================
// VISTA PREVIA — pantalla de desarrollo, no de producto
// ============================================================
//
// Renderiza los componentes del panel con datos de ejemplo para poder revisar el
// sistema de diseño sin base de datos: contraste, tipografías, tamaños táctiles,
// cómo cae todo en el ancho de un teléfono, y modo claro contra modo oscuro.
//
// ⚠️ Los datos de acá son INVENTADOS y están a la vista para que nadie los
// confunda con datos reales. Esta ruta no debería quedar en producción: se borra
// junto con esta carpeta cuando el panel esté conectado a Supabase de verdad.

const AHORA = new Date("2026-08-30T14:30:00-03:00").toISOString();

const PEDIDO_PENDIENTE: PedidoDelPanel = {
  id: "ejemplo-1",
  estado: "pendiente_aprobacion",
  version: 1,
  consultaCarnicero: null,
  telefono: "whatsapp:+5491155667788",
  clienteId: "cliente-1",
  clienteNombre: "Marta Gutiérrez",
  clienteAusencias: 0,
  items: [
    {
      producto_id: "p1",
      producto_codigo: "vacio",
      nombre_display: "Vacío",
      cantidad: 2.5,
      unidad: "kg",
      disponible: true,
    },
    {
      producto_id: "p2",
      producto_codigo: "chorizo",
      nombre_display: "Chorizo",
      cantidad: 6,
      unidad: "unidad",
      disponible: true,
    },
    {
      producto_id: "p3",
      producto_codigo: "costilla",
      nombre_display: "Costilla",
      cantidad: 3,
      unidad: "kg",
      disponible: false,
      sustituye_a_producto_id: "p9",
    },
  ],
  horaRetiro: new Date("2026-08-30T19:00:00-03:00").toISOString(),
  totalEstimado: null,
  origen: "bot",
  creadoAt: AHORA,
  aprobadoAt: null,
  rechazadoAt: null,
  retiradoAt: null,
  conversacionId: null,
};

const PEDIDO_CON_AUSENCIAS: PedidoDelPanel = {
  ...PEDIDO_PENDIENTE,
  id: "ejemplo-2",
  clienteNombre: "Rubén Paz",
  clienteAusencias: 2,
  items: [PEDIDO_PENDIENTE.items[0]],
};

const PEDIDOS_HISTORIAL: PedidoDelPanel[] = [
  { ...PEDIDO_PENDIENTE, id: "h1", estado: "retirado", totalEstimado: 48500 },
  { ...PEDIDO_PENDIENTE, id: "h2", estado: "aprobado", clienteNombre: "Sofía Ledesma", totalEstimado: 22300 },
  { ...PEDIDO_PENDIENTE, id: "h3", estado: "no_show", clienteNombre: "Carlos Rivas", totalEstimado: 31000 },
  { ...PEDIDO_PENDIENTE, id: "h4", estado: "rechazado", clienteNombre: "Ana Belén", totalEstimado: null },
];

const PRODUCTOS: ProductoDelPanel[] = [
  producto("asado", "Asado", "vacuno_parrilla", 18.5, 12900, "disponible"),
  producto("vacio", "Vacío", "vacuno_parrilla", 2, 15400, "poco"),
  producto("costilla", "Costilla", "vacuno_parrilla", 0, 11200, "sin_stock"),
  producto("matambre", "Matambre", "vacuno_parrilla", 7.5, null, "disponible"),
  producto("milanesa_de_nalga", "Milanesa de nalga", "vacuno_milanesa", 12, 16800, "disponible"),
  producto("pollo_entero", "Pollo entero", "pollo", 9, 6400, "disponible"),
  producto("chorizo", "Chorizo", "embutidos", 24, 1800, "disponible"),
];

function producto(
  codigo: string,
  nombre: string,
  familia: string,
  stock: number,
  precio: number | null,
  estado: ProductoDelPanel["estado"]
): ProductoDelPanel {
  return {
    id: codigo,
    codigo,
    nombre,
    familia,
    unidad: codigo === "chorizo" || codigo === "pollo_entero" ? "unidad" : "kg",
    stock,
    precio,
    umbralPropio: null,
    umbralEfectivo: 3,
    estado,
    stockActualizadoAt: AHORA,
    stockOrigen: codigo === "vacio" ? "panel" : "audio",
    precioActualizadoAt: AHORA,
    esComplementario: false,
  };
}

const SERIE_DIAS = [
  { etiqueta: "L", etiquetaLarga: "Lunes 24", valor: 34500, valorFormateado: "$34.500" },
  { etiqueta: "M", etiquetaLarga: "Martes 25", valor: 51200, valorFormateado: "$51.200" },
  { etiqueta: "M", etiquetaLarga: "Miércoles 26", valor: 28900, valorFormateado: "$28.900" },
  { etiqueta: "J", etiquetaLarga: "Jueves 27", valor: 62400, valorFormateado: "$62.400" },
  { etiqueta: "V", etiquetaLarga: "Viernes 28", valor: 88700, valorFormateado: "$88.700" },
  { etiqueta: "S", etiquetaLarga: "Sábado 29", valor: 124300, valorFormateado: "$124.300" },
  { etiqueta: "D", etiquetaLarga: "Domingo 30", valor: 41000, valorFormateado: "$41.000" },
];

const RANKING = [
  { etiqueta: "Asado", valor: 42, valorFormateado: "42" },
  { etiqueta: "Vacío", valor: 31, valorFormateado: "31" },
  { etiqueta: "Milanesa de nalga", valor: 27, valorFormateado: "27" },
  { etiqueta: "Chorizo", valor: 19, valorFormateado: "19" },
  { etiqueta: "Pollo entero", valor: 11, valorFormateado: "11" },
];

export default function VistaPreviaPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
        <p className="font-titulo text-sm font-semibold text-warning">
          Vista previa del sistema de diseño
        </p>
        <p className="mt-1 text-sm text-warning">
          Todos los datos de esta pantalla son inventados. Sirve para revisar contraste, tamaños y
          cómo cae todo en un teléfono, sin necesidad de conectarse a la base.
        </p>
      </div>

      <Seccion titulo="Pedidos esperando aprobación">
        <div className="flex flex-col gap-3">
          <TarjetaPedidoPendiente pedido={PEDIDO_PENDIENTE} />
          <TarjetaPedidoPendiente pedido={PEDIDO_CON_AUSENCIAS} />
        </div>
      </Seccion>

      <Seccion titulo="Resumen del día">
        <Tarjeta className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumeroGrande valor="7" etiqueta="Pedidos de hoy" />
            <NumeroGrande valor="4" etiqueta="Ya retirados" />
            <NumeroGrande valor="2" etiqueta="Sin stock" tono="problema" />
            <NumeroGrande
              valor="$124.300"
              etiqueta="Pedidos por WhatsApp"
              ayuda="Estimado sobre precios de lista. No incluye el mostrador."
            />
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Historial">
        <Tarjeta>
          <ul>
            {PEDIDOS_HISTORIAL.map((pedido) => (
              <li key={pedido.id}>
                <FilaPedido pedido={pedido} />
              </li>
            ))}
          </ul>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Stock y precios">
        <TablaStock productos={PRODUCTOS} />
      </Seccion>

      <Seccion titulo="Gráficos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Tarjeta>
            <TarjetaEncabezado titulo="Últimos 7 días" />
            <div className="px-4 py-4">
              <GraficoBarras
                datos={SERIE_DIAS}
                titulo="Ingresos por día"
                descripcionVacio="Cuando haya pedidos, acá vas a ver la comparación."
              />
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Lo que más te piden" />
            <div className="px-4 py-4">
              <GraficoRanking
                datos={RANKING}
                titulo="Cortes más pedidos"
                descripcionVacio="Con unos cuantos pedidos vas a ver qué cortes te piden más."
              />
            </div>
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion titulo="Estados vacío y de error">
        <div className="grid gap-4 sm:grid-cols-2">
          <Tarjeta>
            <EstadoVacio
              titulo="No hay nada esperando"
              descripcion="Cuando un cliente arme un pedido por WhatsApp, va a aparecer acá para que lo apruebes."
            />
          </Tarjeta>
          <Tarjeta>
            <EstadoError
              descripcion="Puede ser un problema momentáneo de conexión. Probá de nuevo; si sigue igual, escribinos."
              accion={<button className={clasesBoton("principal")}>Probar de nuevo</button>}
            />
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion titulo="Etiquetas de estado">
        <Tarjeta className="flex flex-wrap gap-2 p-4">
          <Etiqueta tono="neutro">Neutro</Etiqueta>
          <Etiqueta tono="marca">Marca</Etiqueta>
          <Etiqueta tono="exito">Disponible</Etiqueta>
          <Etiqueta tono="atencion">Queda poco</Etiqueta>
          <Etiqueta tono="problema">Sin stock</Etiqueta>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Botones">
        <Tarjeta className="flex flex-wrap gap-2 p-4">
          <button className={clasesBoton("principal")}>Aprobar</button>
          <button className={clasesBoton("secundario")}>Rechazar</button>
          <button className={clasesBoton("peligro")}>Sí, rechazar</button>
          <button className={clasesBoton("fantasma")}>Ver detalle</button>
        </Tarjeta>
      </Seccion>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-titulo text-lg font-bold text-ink">{titulo}</h2>
      {children}
    </section>
  );
}
