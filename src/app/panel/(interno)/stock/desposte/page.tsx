import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { precargaDeTrozado } from "@/lib/lotes";
import {
  PantallaDesposte,
  type LoteAbierto,
  type PrecargaPollo,
} from "@/components/panel/desposte";
import { EncabezadoPantalla, clasesBoton } from "@/components/panel/ui";

// Desposte y trozado — donde las piezas nacen pesadas.
//
// Esta pantalla es la contracara de la tabla de rendimiento: el vacuno tiene
// una y por eso sus cortes nacen solos al cargar la media res; el cerdo y el
// pollo no, así que sus piezas nacen acá con el peso de la balanza.
//
// Y eso es lo que a los 10-20 despostes se convierte en la tabla de rendimiento
// de ESTA carnicería. Ninguna fuente pública puede darle ese número: solo su
// propia balanza.

const PRODUCTOS_CERDO: { codigo: string; esSubproducto: boolean }[] = [
  { codigo: "pernil", esSubproducto: false },
  { codigo: "paleta_de_cerdo", esSubproducto: false },
  { codigo: "carre", esSubproducto: false },
  { codigo: "bondiola", esSubproducto: false },
  { codigo: "pechito_de_cerdo", esSubproducto: false },
  { codigo: "panceta", esSubproducto: false },
  { codigo: "matambre_de_cerdo", esSubproducto: false },
  { codigo: "solomillo", esSubproducto: false },
  { codigo: "costeleta_de_cerdo", esSubproducto: false },
  { codigo: "chorizo_de_cerdo", esSubproducto: false },
  // Vienen en la media res argentina y el vacuno no los tiene. No son descarte
  // —el cuerito se come y la patita se vende— pero tampoco son un corte del
  // mostrador con precio por kilo, así que entran como subproducto: contados,
  // pesados, y esperando a que se decida qué son.
  { codigo: "cuerito", esSubproducto: true },
  { codigo: "patitas_de_cerdo", esSubproducto: true },
  { codigo: "cabeza_de_cerdo", esSubproducto: true },
  { codigo: "huesito_de_cerdo", esSubproducto: true },
];

export default async function DespostePage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const { data: lotesCrudos } = await supabase
    .from("recepciones_lote")
    .select("id, especie, categoria, unidades, proveedor, peso_recibido_kg, fecha, modo_carga, estado")
    .eq("modo_carga", "desposte_pesado")
    .eq("estado", "abierta")
    .order("fecha", { ascending: false })
    .limit(20);

  const filas = (lotesCrudos ?? []) as unknown as {
    id: string;
    especie: "vacuno" | "porcino" | "aviar";
    unidades: number | null;
    proveedor: string | null;
    peso_recibido_kg: number;
    fecha: string;
  }[];

  // Solo los de cerdo: el cajón de pollo ya nació con sus piezas (una por ave),
  // así que no espera ningún desposte. Lo suyo es el trozado, más abajo.
  const dePorcino = filas.filter((f) => f.especie === "porcino");

  const { data: productos } = await supabase
    .from("productos")
    .select("codigo, nombre_display, alias_display")
    .eq("activo", true)
    .in(
      "codigo",
      PRODUCTOS_CERDO.map((p) => p.codigo)
    );

  const nombrePorCodigo = new Map(
    ((productos ?? []) as { codigo: string; nombre_display: string; alias_display: string | null }[]).map(
      (p) => [p.codigo, p.alias_display ?? p.nombre_display]
    )
  );

  const sugeridos = PRODUCTOS_CERDO.filter((p) => nombrePorCodigo.has(p.codigo)).map((p) => ({
    codigo: p.codigo,
    nombre: nombrePorCodigo.get(p.codigo)!,
    esSubproducto: p.esSubproducto,
  }));

  // Lo que ya se despostó de cada media res: para mostrar cuánto queda y para
  // sacar de las opciones los cortes que ya se cargaron (pedido del fundador,
  // 21/09: "si despostó el matambre, sacar la opción de matambre en esa media
  // res"). `despostarLote` hace el mismo control del lado del servidor.
  const { data: piezasDeLotes } = dePorcino.length
    ? await supabase
        .from("piezas_stock")
        .select("recepcion_lote_id, kg_iniciales, productos!inner(codigo)")
        .in(
          "recepcion_lote_id",
          dePorcino.map((f) => f.id)
        )
    : { data: [] };

  const previasPorLote = new Map<string, { kg: number; cargados: { codigo: string; kg: number }[] }>();
  for (const fila of (piezasDeLotes ?? []) as unknown as {
    recepcion_lote_id: string;
    kg_iniciales: number;
    productos: { codigo: string };
  }[]) {
    const actual = previasPorLote.get(fila.recepcion_lote_id) ?? { kg: 0, cargados: [] };
    actual.kg += Number(fila.kg_iniciales);
    actual.cargados.push({ codigo: fila.productos.codigo, kg: Number(fila.kg_iniciales) });
    previasPorLote.set(fila.recepcion_lote_id, actual);
  }

  const redondear = (n: number) => Math.round(n * 100) / 100;

  const lotes: LoteAbierto[] = dePorcino.map((fila) => {
    const peso = Number(fila.peso_recibido_kg);
    const previas = previasPorLote.get(fila.id) ?? { kg: 0, cargados: [] };
    const codigosCargados = new Set(previas.cargados.map((c) => c.codigo));
    const restante = redondear(Math.max(0, peso - previas.kg));
    return {
      id: fila.id,
      especie: fila.especie,
      pesoKg: peso,
      despostadoKg: redondear(previas.kg),
      restanteKg: restante,
      cargados: previas.cargados.map((c) => ({
        nombre: nombrePorCodigo.get(c.codigo) ?? c.codigo,
        kg: redondear(c.kg),
      })),
      etiqueta: `Media res de cerdo de ${peso} kg · ${
        previas.kg > 0 ? `quedan ${restante} kg · ` : ""
      }${fila.fecha}${fila.proveedor ? ` · ${fila.proveedor}` : ""}`,
      sugeridos: sugeridos.filter((p) => !codigosCargados.has(p.codigo)),
    };
  });

  // ------------------------------------------------------------
  // El trozado de pollo
  // ------------------------------------------------------------

  const { data: enStock } = await supabase
    .from("piezas_stock")
    .select("id, productos!inner(codigo)")
    .eq("estado", "disponible")
    .eq("productos.codigo", "pollo_entero")
    .gt("kg_restantes", 0);

  const pollosEnStock = (enStock ?? []).length;
  let precargaPollo: PrecargaPollo | null = null;

  if (pollosEnStock > 0) {
    const sugerencia = await precargaDeTrozado({
      carniceriaId: sesion.carniceria.id,
      especie: "aviar",
      unidades: Math.min(pollosEnStock, 6),
    });

    if (sugerencia) {
      const total = sugerencia.salidas.reduce((suma, s) => suma + s.pctCentral, 0);
      precargaPollo = {
        unidadesSugeridas: Math.min(pollosEnStock, 6),
        kgPorUnidad: total > 0 ? sugerencia.kgEntrada / Math.min(pollosEnStock, 6) : null,
        enStock: pollosEnStock,
        salidas: sugerencia.salidas.map((s) => ({
          codigo: s.codigo,
          nombre: s.nombre,
          pct: s.pctCentral,
          esSubproducto: s.codigo === "piel_de_pollo" || s.codigo === "carcasa_de_pollo",
        })),
      };
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EncabezadoPantalla
        titulo="Desposte y trozado"
        descripcion="Acá las piezas nacen pesadas. Y estas pesadas, repetidas, son tu tabla de rendimiento."
        accion={
          <Link href="/panel/stock" className={clasesBoton("secundario")}>
            Ver el stock
          </Link>
        }
      />

      <PantallaDesposte lotes={lotes} precargaPollo={precargaPollo} />
    </div>
  );
}
