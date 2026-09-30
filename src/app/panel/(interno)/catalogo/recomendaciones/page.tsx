import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { leerTablaDeCarniceria } from "@/lib/recomendacionesCarniceria";
import { OCASIONES_CONCRETAS, tituloDeOcasion } from "@/lib/recomendaciones";
import {
  RecomendacionesEditor,
  type OcasionDelPanel,
  type ProductoParaTabla,
} from "@/components/panel/recomendaciones-editor";
import { EncabezadoPantalla, EnlaceVolver } from "@/components/panel/ui";

// Recomendaciones del bot — qué ofrece según para qué lo quiere el cliente.
//
// Cuando un cliente pregunta "¿qué te queda para la parrilla?" o "¿qué uso
// para milanesas?", el bot contesta con la lista de esa ocasión, pero SOLO lo
// que tiene stock en ese momento. Acá el carnicero arma esas listas una vez:
// qué cortes, en qué orden, y qué va "para acompañar". No hay que tocarlas
// todos los días: el stock lo filtra el bot solo.

export default async function RecomendacionesPage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const [{ data: filas }, { tabla, personalizada }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, codigo, nombre_display, alias_display, familia, especie, stock_actual, activo, unidad")
      .order("nombre_display", { ascending: true }),
    leerTablaDeCarniceria(supabase, sesion.carniceria.id),
  ]);

  const productos: ProductoParaTabla[] = (
    (filas ?? []) as {
      id: string;
      codigo: string;
      nombre_display: string;
      alias_display: string | null;
      familia: string;
      especie: string | null;
      stock_actual: number | string;
      activo: boolean;
      unidad: string;
    }[]
  ).map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre_display: f.nombre_display,
    alias_display: f.alias_display,
    familia: f.familia,
    especie: f.especie,
    stock_actual: Number(f.stock_actual),
    activo: f.activo,
    unidad: f.unidad,
  }));

  // La tabla viene con CÓDIGOS; el editor trabaja con ids (es lo que se guarda).
  const idPorCodigo = new Map(productos.map((p) => [p.codigo, p.id]));
  const aIds = (codigos: string[]) =>
    codigos.map((c) => idPorCodigo.get(c)).filter((id): id is string => Boolean(id));

  const ocasiones: OcasionDelPanel[] = OCASIONES_CONCRETAS.map((ocasion) => ({
    ocasion,
    titulo: tituloDeOcasion(ocasion),
    cortes: aIds(tabla[ocasion].cortes),
    acompanan: aIds(tabla[ocasion].acompanan),
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EnlaceVolver href="/panel/catalogo">Catálogo</EnlaceVolver>
      <EncabezadoPantalla
        titulo="Recomendaciones del bot"
        descripcion="Qué ofrece cuando un cliente pregunta qué tenés para la parrilla, el horno, milanesas y demás."
      />

      <div className="rounded-tarjeta border border-border bg-surface-2 px-4 py-3">
        <p className="text-sm text-ink-2">
          Armá cada lista una sola vez, en el orden en que querés ofrecer, separada en vaca, cerdo
          y pollo. Cuando algo se termina, el bot ofrece otra cosa de la misma lista (primero de la
          misma especie). Nombra{" "}
          <strong className="text-ink">solo lo que tenga stock</strong> en ese momento: si hoy no
          hay entraña, no la ofrece, y cuando vuelva a entrar la ofrece sola.
          {personalizada ? null : " Por ahora estás usando la lista que viene de fábrica."}
        </p>
      </div>

      <RecomendacionesEditor productos={productos} ocasiones={ocasiones} />
    </div>
  );
}
