import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { balanceDeLote, costoDeLote, margenPorCorte } from "@/lib/mediaRes";
import { BotonSeAcabo } from "@/components/panel/medias-reses";
import { EnlaceVolver, Tarjeta, TarjetaEncabezado, Etiqueta } from "@/components/panel/ui";
import { formatearFecha, formatearNumero, formatearPesos } from "@/lib/panel/formatos";

export default async function DetalleMediaResPage(
  props: PageProps<"/panel/stock/medias-reses/[id]">
) {
  const sesion = await requerirSesion();
  const { id } = await props.params;
  const supabase = await getSupabaseServidor();

  const { data: lote } = await supabase
    .from("recepciones_lote")
    .select(
      "id, categoria, proveedor, remito, peso_recibido_kg, peso_facturado_kg, fecha, estado, rinde_real, descuadre_kg"
    )
    .eq("id", id)
    .maybeSingle();

  if (!lote) notFound();

  const [{ data: piezas }, balance, costo, margenes] = await Promise.all([
    supabase
      .from("piezas_stock")
      .select("id, producto_id, kg_iniciales, kg_restantes, confianza, estado, productos(nombre_display)")
      .eq("recepcion_lote_id", id)
      .order("kg_restantes", { ascending: false }),
    balanceDeLote(id),
    costoDeLote(id),
    margenPorCorte(id),
  ]);

  const filas = (piezas ?? []) as unknown as FilaPieza[];
  const vivas = filas.filter((p) => p.estado === "disponible");

  // La diferencia entre lo que dice el remito y lo que dijo tu balanza es plata:
  // es la única forma de darte cuenta de que te facturan más kilos de los que
  // te bajan del camión. El umbral de 2 % viene del plan de calibración.
  const facturado = lote.peso_facturado_kg === null ? null : Number(lote.peso_facturado_kg);
  const recibido = Number(lote.peso_recibido_kg);
  const difPeso = facturado !== null && facturado > 0 ? ((recibido - facturado) / facturado) * 100 : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <EnlaceVolver href="/panel/stock/medias-reses">Todas las medias reses</EnlaceVolver>

      <Tarjeta>
        <TarjetaEncabezado
          titulo={`${capitalizar(lote.categoria as string)} de ${formatearNumero(recibido)} kg`}
          descripcion={`${formatearFecha(lote.fecha as string)}${lote.proveedor ? ` · ${lote.proveedor}` : ""}`}
          accion={
            <Etiqueta tono={lote.estado === "abierta" ? "atencion" : "neutro"}>
              {lote.estado === "abierta" ? "Abierta" : "Cerrada"}
            </Etiqueta>
          }
        />

        {difPeso !== null ? (
          <div className="px-4 pb-3 sm:px-5">
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                Math.abs(difPeso) > 2 ? "bg-warning-soft text-warning" : "bg-surface-2 text-ink-2"
              }`}
            >
              Remito {formatearNumero(facturado!)} kg · tu balanza {formatearNumero(recibido)} kg ·{" "}
              <strong>{difPeso > 0 ? "+" : ""}{difPeso.toFixed(1)} %</strong>
              {Math.abs(difPeso) > 2
                ? " — esa diferencia es plata, conviene reclamarla."
                : " — dentro de lo normal."}
            </p>
          </div>
        ) : null}
      </Tarjeta>

      {/* ------------------------------------------------------------
          El balance. La ecuación cierra SIEMPRE, porque el descuadre es la
          línea que la hace cerrar — no es un error y no se espera que dé cero.
          Es igual que el arqueo de caja.
         ------------------------------------------------------------ */}
      {balance ? (
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Balance del lote"
            descripcion="Dónde fue a parar cada kilo que entró."
          />
          <div className="px-4 py-3 sm:px-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Dato etiqueta="Entró" valor={`${formatearNumero(balance.pesoEntrada)} kg`} />
              <Dato etiqueta="Vendido" valor={`${formatearNumero(balance.vendido)} kg`} />
              <Dato etiqueta="En stock" valor={`${formatearNumero(balance.enStock)} kg`} />
              <Dato etiqueta="Hueso" valor={`${formatearNumero(balance.hueso)} kg`} />
              <Dato etiqueta="Grasa" valor={`${formatearNumero(balance.grasa)} kg`} />
              <Dato etiqueta="Recortes a picada" valor={`${formatearNumero(balance.recortes)} kg`} />
              <Dato etiqueta="Merma de frío" valor={`${formatearNumero(balance.mermaFrio)} kg`} />
              <Dato
                etiqueta="Degradado"
                valor={`${formatearNumero(balance.degradado)} kg`}
                tono={balance.degradado > 0 ? "problema" : undefined}
              />
              <Dato
                etiqueta="Sin explicar"
                valor={`${formatearNumero(balance.descuadre)} kg`}
                tono={
                  balance.pesoEntrada > 0 &&
                  Math.abs(balance.descuadre / balance.pesoEntrada) > 0.02
                    ? "problema"
                    : undefined
                }
              />
            </dl>

            {balance.rindePct !== null ? (
              <p className="mt-3 border-t border-border pt-3 text-sm text-ink-2">
                Rinde vendible: <strong className="numero text-ink">{balance.rindePct} %</strong>
              </p>
            ) : null}

            <p className="mt-2 text-xs text-ink-3">
              &ldquo;Sin explicar&rdquo; nunca da cero, y está bien: los cortes se recortan, se
              mezclan y se pican. Lo que importa es que no crezca. Por encima del 2 % conviene mirar
              la balanza y quién está pesando.
            </p>
          </div>
        </Tarjeta>
      ) : null}

      {/* ------------------------------------------------------------
          El costo real por kilo. El número que ningún carnicero ve.
         ------------------------------------------------------------ */}
      {costo ? (
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Lo que te costó de verdad"
            descripcion="El kilo que vendés no cuesta lo mismo que el kilo que comprás."
          />
          <div className="px-4 py-3 sm:px-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Dato etiqueta="Costo del lote" valor={formatearPesos(costo.costoTotal)} />
              <Dato etiqueta="Por kilo al gancho" valor={`${formatearPesos(costo.costoPorKgGancho)}/kg`} />
              <Dato
                etiqueta="Por kilo vendible"
                valor={`${formatearPesos(costo.costoPorKgVendible)}/kg`}
                tono="problema"
              />
            </dl>
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              El kilo que vendés te sale <strong>{costo.recargoPct} % más caro</strong> que el kilo
              que compraste, porque el hueso, la grasa y la merma no se venden. Si ponés precios
              sobre el costo al gancho, estás perdiendo en todos los cortes.
            </p>
          </div>
        </Tarjeta>
      ) : null}

      {/* ------------------------------------------------------------
          El subsidio cruzado.
         ------------------------------------------------------------ */}
      {margenes.length > 0 ? (
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Margen por corte"
            descripcion="Todos los cortes cuestan lo mismo por kilo. Lo que cambia es a cuánto se venden."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 sm:px-5">Corte</th>
                  <th className="px-4 py-2 text-right">Precio</th>
                  <th className="px-4 py-2 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {margenes.map((m) => (
                  <tr key={m.productoId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-ink sm:px-5">{m.nombre}</td>
                    <td className="numero px-4 py-2 text-right text-ink-2">
                      {formatearPesos(m.precio)}
                    </td>
                    <td
                      className={`numero px-4 py-2 text-right font-semibold ${
                        m.margenPct < 0 ? "text-danger" : "text-ink"
                      }`}
                    >
                      {m.margenPct} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-ink-3 sm:px-5">
            Los cortes con margen negativo se venden a pérdida y los de arriba los bancan. No
            significa que haya que subirles el precio: significa que sabés cuánto lomo necesitás
            vender para bancar el brazuelo.
          </p>
        </Tarjeta>
      ) : null}

      {/* ------------------------------------------------------------
          Las piezas.
         ------------------------------------------------------------ */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Cortes de esta media res"
          descripcion={`${vivas.length} con stock, de ${filas.length}.`}
        />
        <ul>
          {filas.map((pieza) => {
            const restantes = Number(pieza.kg_restantes);
            const iniciales = Number(pieza.kg_iniciales);
            const agotada = pieza.estado !== "disponible";

            return (
              <li
                key={pieza.id}
                className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0 sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate font-titulo text-sm font-semibold ${
                      agotada ? "text-ink-3 line-through" : "text-ink"
                    }`}
                  >
                    {pieza.productos?.nombre_display ?? "—"}
                  </span>
                  <span className="block text-xs text-ink-3">
                    {agotada
                      ? `Se terminó · entró con ${formatearNumero(iniciales)} kg`
                      : `${formatearNumero(restantes)} kg de ${formatearNumero(iniciales)} kg`}
                    {" · "}
                    {pieza.confianza === "pesado" ? "pesado" : "estimado"}
                  </span>
                </span>

                {!agotada && lote.estado === "abierta" ? (
                  <BotonSeAcabo
                    productoId={pieza.producto_id}
                    nombre={pieza.productos?.nombre_display ?? "este corte"}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <p className="text-xs text-ink-3">
        Sesión de {sesion.carniceria.nombre}.
      </p>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
  tono?: "problema";
}) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{etiqueta}</dt>
      <dd className={`numero text-sm font-semibold ${tono === "problema" ? "text-danger" : "text-ink"}`}>
        {valor}
      </dd>
    </div>
  );
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

type FilaPieza = {
  id: string;
  producto_id: string;
  kg_iniciales: number;
  kg_restantes: number;
  confianza: string;
  estado: string;
  productos: { nombre_display: string } | null;
};
