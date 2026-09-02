import { cerrarSesion } from "../login/acciones";
import { Tarjeta, clasesBoton } from "@/components/panel/ui";
import { MARCA } from "@/lib/panel/marca";

// Pantalla para una cuenta que existe pero todavía no tiene carnicería
// asociada (`carnicerias.owner_user_id`). Pasa durante el alta: se crea el
// usuario en Supabase Auth y falta enlazarlo.
//
// Es preferible una pantalla que explique qué falta antes que un panel vacío
// donde todo dice "no hay datos" y nadie entiende por qué.

export default function SinCarniceriaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Tarjeta className="w-full max-w-md p-6 text-center" as="div">
        <h1 className="font-titulo text-lg font-bold text-ink">Tu cuenta todavía no tiene carnicería</h1>
        <p className="mt-2 text-sm text-ink-2">
          Entraste bien, pero esta cuenta todavía no está enlazada a ninguna carnicería, así que no
          hay nada que mostrarte. Es el último paso del alta y lo hacemos nosotros.
        </p>
        <p className="mt-3 text-sm text-ink-2">
          Escribinos y lo dejamos listo en el momento.
        </p>

        <form action={cerrarSesion} className="mt-5">
          <button type="submit" className={clasesBoton("secundario", "w-full")}>
            Salir de {MARCA}
          </button>
        </form>
      </Tarjeta>
    </div>
  );
}
