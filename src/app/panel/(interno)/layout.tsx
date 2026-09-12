import Link from "next/link";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { esAdmin } from "@/lib/panel/admin";
import { BarraLateral, NavegacionInferior, SelectorDeTema } from "@/components/panel/navegacion";
import { IconoCampana } from "@/components/panel/iconos";
import { PRODUCTO } from "@/lib/marca";

// Armazón del panel: columna lateral oscura en escritorio, navegación inferior
// en teléfono, y una barra superior fina con el contexto y la campanita.
//
// Vive en un grupo de rutas `(interno)` — los paréntesis hacen que no aparezca
// en la URL — para que el login quede fuera de este armazón sin tener que
// duplicar las tipografías ni el manejo del tema.
//
// La barra superior es deliberadamente flaca: el título de cada pantalla lo
// pone la página con `EncabezadoPantalla`, no el armazón. Repetir el título
// arriba y abajo es de las cosas que más espacio vertical le roban a un panel
// que se usa en un teléfono.

// Todo lo que cuelga de acá depende de quién esté logueado y de datos que
// cambian minuto a minuto (pedidos, stock, mensajes). No hay nada que
// prerenderizar: se arma en cada request.
export const dynamic = "force-dynamic";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const [pendientes, carniceria, administra] = await Promise.all([
    contarPendientes(),
    datosDeCabecera(),
    esAdmin(),
  ]);

  return (
    <div className="flex min-h-screen w-full">
      <BarraLateral
        pendientes={pendientes.pedidos}
        mostrarSimulador={carniceria.enSimulacion}
        mostrarAdmin={administra}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado noLeidos={pendientes.avisos} nombre={carniceria.nombre} />

        {/* El padding de abajo en teléfono deja lugar para la barra fija. */}
        <main className="min-w-0 flex-1 px-3 pb-28 pt-5 sm:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <NavegacionInferior
        pendientes={pendientes.pedidos}
        mostrarSimulador={carniceria.enSimulacion}
        mostrarAdmin={administra}
      />
    </div>
  );
}

function Encabezado({ noLeidos, nombre }: { noLeidos: number; nombre: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-3 py-2 backdrop-blur-md sm:px-6 lg:px-8">
      <Link href="/panel" className="font-titulo text-base font-bold tracking-tight text-ink md:hidden">
        {PRODUCTO}
      </Link>

      {/* En escritorio el nombre del local es el contexto: con varias pestañas
          abiertas dice de cuál carnicería es este panel. */}
      <span className="hidden min-w-0 truncate font-titulo text-sm font-semibold text-ink-2 md:block">
        {nombre ?? "Panel de gestión"}
      </span>

      <div className="flex items-center gap-1">
        <SelectorDeTema />
        <Link
          href="/panel/avisos"
          className="relative flex h-11 w-11 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label={noLeidos > 0 ? `Avisos, ${noLeidos} sin leer` : "Avisos"}
        >
          <IconoCampana className="h-[22px] w-[22px]" />
          {noLeidos > 0 ? (
            <span className="numero absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
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

/**
 * Lo que el armazón necesita saber de la carnicería: cómo se llama (va en la
 * barra superior) y si todavía está en modo simulado (decide si la navegación
 * muestra el simulador).
 *
 * Las dos cosas salen de la misma fila, así que salen de la misma consulta.
 * Igual que los contadores: si falla, el panel tiene que seguir andando.
 */
async function datosDeCabecera(): Promise<{ nombre: string | null; enSimulacion: boolean }> {
  try {
    const supabase = await getSupabaseServidor();
    const { data } = await supabase
      .from("carnicerias")
      .select("nombre, nombre_visible, whatsapp_proveedor")
      .maybeSingle();

    return {
      nombre: data?.nombre_visible ?? data?.nombre ?? null,
      enSimulacion: data?.whatsapp_proveedor === "simulado",
    };
  } catch {
    return { nombre: null, enSimulacion: false };
  }
}
