import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { CargarMediaRes, ListaDeLotes, type LoteDelPanel } from "@/components/panel/medias-reses";
import { EncabezadoPantalla, clasesBoton } from "@/components/panel/ui";
import { IconoMicrofono } from "@/components/panel/iconos";

// Medias reses — la entrada de mercadería, modelada como lo que realmente es.
//
// Cargar una media res no suma kilos: consume una pieza grande de peso conocido
// y produce cortes, hueso, grasa, recortes y merma. Por eso cada media res es un
// LOTE con identidad propia, y no un "+110 kg" al stock.
//
// Eso es lo que después permite contestar preguntas que hoy no se pueden ni
// formular: cuánto rindió ESTA media res, cuánto costó de verdad el kilo de
// vacío que se vendió ayer, si este proveedor manda mejor mercadería que el otro.

export default async function MediasResesPage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const [{ data: lotes }, { data: tablas }, { data: carniceria }] = await Promise.all([
    supabase
      .from("recepciones_lote")
      .select("id, especie, categoria, unidades, proveedor, peso_recibido_kg, peso_facturado_kg, fecha, estado, rinde_real")
      .order("fecha", { ascending: false })
      .limit(50),
    // Solo las de VACUNO: son las únicas que crean stock al cargar el lote.
    // La tabla de pollo existe pero su `uso` es 'precarga_trozado' y su
    // categoría es null — si entrara acá, el desplegable mostraría un vacío.
    supabase
      .from("tablas_rendimiento")
      .select("categoria")
      .eq("especie", "vacuno")
      .eq("uso", "explota_lote")
      .is("vigente_hasta", null),
    // El peso de cajón de esta carnicería: es el que se usa si en el
    // formulario del pollo no escriben otro (el mismo que usa el bot).
    supabase.from("carnicerias").select("peso_cajon_pollo_kg").eq("id", sesion.carniceria.id).maybeSingle(),
  ]);

  const pesoCajon = Number(carniceria?.peso_cajon_pollo_kg ?? 0);
  const pesoCajonPollo = pesoCajon > 0 ? pesoCajon : 20;

  const filas = (lotes ?? []) as unknown as FilaLote[];

  // Cuántos cortes siguen con stock en cada lote. Es lo que le dice al carnicero
  // si esa media res todavía está viva o ya se terminó.
  const piezasPorLote = new Map<string, number>();
  if (filas.length > 0) {
    const { data: piezas } = await supabase
      .from("piezas_stock")
      .select("recepcion_lote_id")
      .eq("estado", "disponible")
      .in(
        "recepcion_lote_id",
        filas.map((f) => f.id)
      );

    for (const pieza of piezas ?? []) {
      const id = pieza.recepcion_lote_id as string | null;
      if (!id) continue;
      piezasPorLote.set(id, (piezasPorLote.get(id) ?? 0) + 1);
    }
  }

  const lotesDelPanel: LoteDelPanel[] = filas.map((fila) => ({
    id: fila.id,
    especie: fila.especie,
    categoria: fila.categoria,
    unidades: fila.unidades === null ? null : Number(fila.unidades),
    proveedor: fila.proveedor,
    pesoRecibidoKg: Number(fila.peso_recibido_kg),
    pesoFacturadoKg: fila.peso_facturado_kg === null ? null : Number(fila.peso_facturado_kg),
    fecha: fila.fecha,
    estado: fila.estado,
    rindeReal: fila.rinde_real === null ? null : Number(fila.rinde_real),
    piezasVivas: piezasPorLote.get(fila.id) ?? 0,
  }));

  const categorias = Array.from(
    new Set(
      ((tablas ?? []) as { categoria: string | null }[])
        .map((t) => t.categoria)
        .filter((c): c is string => typeof c === "string" && c.length > 0)
    )
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <EncabezadoPantalla
        titulo="Lo que entra"
        descripcion="Medias reses, medias reses de cerdo y cajones de pollo. En vacuno el sistema reparte los cortes solo; en cerdo y pollo las piezas nacen cuando las pesás."
        accion={
          <Link href="/panel/stock" className={clasesBoton("secundario")}>
            Ver el stock
          </Link>
        }
      />

      {/* Mismo recordatorio que en la pantalla de stock: si el panel termina
          siendo la forma más cómoda de cargar mercadería, algo salió mal. */}
      <div className="flex items-start gap-3 rounded-tarjeta border border-border bg-surface-2 px-4 py-3">
        <IconoMicrofono className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />
        <p className="text-sm text-ink-2">
          Esta pantalla es el respaldo. Lo normal va a ser mandar un audio:{" "}
          <em>&ldquo;llegó una media res de ciento cuatro kilos seiscientos&rdquo;</em>,{" "}
          <em>&ldquo;llegó una media res de cerdo de cuarenta y dos&rdquo;</em> o{" "}
          <em>&ldquo;llegó un cajón de pollo de diez&rdquo;</em>.
        </p>
      </div>

      {/* Siempre se muestra: si falta la tabla de vacuno, el formulario lo avisa
          adentro pero cerdo y pollo (que no usan tabla) se pueden cargar igual. */}
      <CargarMediaRes categorias={categorias} pesoCajonPollo={pesoCajonPollo} />

      <ListaDeLotes lotes={lotesDelPanel} />
    </div>
  );
}

type FilaLote = {
  id: string;
  especie: "vacuno" | "porcino" | "aviar";
  categoria: string | null;
  unidades: number | null;
  proveedor: string | null;
  peso_recibido_kg: number;
  peso_facturado_kg: number | null;
  fecha: string;
  estado: string;
  rinde_real: number | null;
};
