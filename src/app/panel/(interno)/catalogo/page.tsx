import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { listarCatalogo } from "@/lib/panel/catalogo";
import { CatalogoEditor } from "@/components/panel/catalogo-editor";
import Link from "next/link";
import { EncabezadoPantalla, Tarjeta, EstadoVacio, clasesBoton } from "@/components/panel/ui";

// El catálogo — qué vende esta carnicería y cómo lo llaman acá.
//
// Esta pantalla es la que le faltaba al sistema. El modelo de datos ya
// soportaba todo esto desde la Etapa 2 (`productos.activo`,
// `producto_sinonimos`, `terminos_ambiguos`) y nadie lo podía tocar sin entrar
// a la base.
//
// Y importa más de lo que parece: lo que está acá ES lo que el bot entiende.
// Un producto apagado desaparece del prompt en el mensaje siguiente; un
// sinónimo nuevo se entiende en el mensaje siguiente. No hay que redesplegar
// nada.

export default async function CatalogoPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();
  const productos = await listarCatalogo(supabase);

  const activos = productos.filter((p) => p.activo).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EncabezadoPantalla
        titulo="Catálogo"
        descripcion={`Tildá lo que vendés y agregá cómo lo llaman en tu barrio. ${activos} de ${productos.length} activos.`}
        accion={
          // Qué recomienda el bot para la parrilla, el horno, milanesas...
          <Link href="/panel/catalogo/recomendaciones" className={clasesBoton("secundario")}>
            Recomendaciones del bot
          </Link>
        }
      />

      <div className="rounded-tarjeta border border-border bg-surface-2 px-4 py-3">
        <p className="text-sm text-ink-2">
          Lo que tildás acá es lo que el bot puede ofrecer. Si apagás un producto deja de existir
          para el cliente, pero no se borra nada: su historia de stock queda intacta y lo podés
          volver a encender cuando quieras.
        </p>
      </div>

      {productos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no hay productos cargados"
            descripcion="Cuando esté cargado el catálogo de la carnicería, acá vas a poder elegir qué vendés y cómo lo llamás."
          />
        </Tarjeta>
      ) : (
        <CatalogoEditor productos={productos} />
      )}
    </div>
  );
}
