import Link from "next/link";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { BarraLateral, NavegacionInferior, SelectorDeTema } from "@/components/panel/navegacion";
import { IconoCampana } from "@/components/panel/iconos";
import { MARCA } from "@/lib/panel/marca";

// Armazón del panel: barra lateral en escritorio, navegación inferior en
// teléfono, y el encabezado con la campanita.
//
// Vive en un grupo de rutas `(interno)` — los paréntesis hacen que no aparezca
// en la URL — para que el login quede fuera de este armazón sin tener que
// duplicar las tipografías ni el manejo del tema.

// Todo lo que cuelga de acá depende de quién esté logueado y de datos que
// cambian minuto a minuto (pedidos, stock, mensajes). No hay nada que
// prerenderizar: se arma en cada request.
export const dynamic = "force-dynamic";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const pendientes = await contarPendientes();

  return (
    <div className="flex min-h-screen w-full">
      <BarraLateral pendientes={pendientes.pedidos} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado noLeidos={pendientes.avisos} />

        {/* El padding de abajo en teléfono deja lugar para la barra fija. */}
        <main className="min-w-0 flex-1 px-3 pb-28 pt-4 sm:px-5 md:pb-8">{children}</main>
      </div>

      <NavegacionInferior pendientes={pendientes.pedidos} />
    </div>
  );
}

function Encabezado({ noLeidos }: { noLeidos: number }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-3 py-2 backdrop-blur sm:px-5">
      <Link href="/panel" className="font-titulo text-sm font-bold text-ink md:hidden">
        {MARCA}
      </Link>
      <span className="hidden font-titulo text-sm font-semibold text-ink-2 md:block">
        Panel de gestión
      </span>

      <div className="flex items-center gap-1">
        <SelectorDeTema />
        <Link
          href="/panel/avisos"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
          aria-label={noLeidos > 0 ? `Avisos, ${noLeidos} sin leer` : "Avisos"}
        >
          <IconoCampana className="h-6 w-6" />
          {noLeidos > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-surface">
              {noLeidos > 9 ? "9+" : noLeidos}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}

/**
 * Contadores del encabezado y de la navegación. Se leen con la sesión del
 * usuario (o sea, con Row Level Security puesto), así que no hace falta filtrar
 * por carnicería: la base solo devuelve las filas propias.
 *
 * Si algo falla acá, la navegación tiene que seguir andando: un contador en
 * cero es mucho mejor que un panel que no carga.
 */
async function contarPendientes(): Promise<{ pedidos: number; avisos: number }> {
  try {
    const supabase = await getSupabaseServidor();

    const [pedidos, avisos] = await Promise.all([
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente_aprobacion"),
      supabase.from("notificaciones").select("id", { count: "exact", head: true }).is("leida_at", null),
    ]);

    return { pedidos: pedidos.count ?? 0, avisos: avisos.count ?? 0 };
  } catch (err) {
    console.error("No se pudieron contar los pendientes del encabezado", err);
    return { pedidos: 0, avisos: 0 };
  }
}
