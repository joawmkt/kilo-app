import { FormularioLogin } from "./formulario";
import { PRODUCTO } from "@/lib/marca";
import { LogoMarca } from "@/lib/panel/marca";

// Login — la primera pantalla de KILO y la única que se ve desde afuera.
//
// Va sobre el vino-negro del armazón, no sobre el fondo claro del panel: es lo
// que hace que entrar se sienta como entrar a algo, y que la tarjeta blanca del
// formulario sea lo único iluminado de la pantalla. Es el mismo color que
// después sostiene la navegación, así que la pantalla de entrada y la
// herramienta se leen como el mismo producto.
//
// La identidad se apoya en el color y en el logotipo, sin agregar nada más: la
// única decisión que hay para tomar acá es entrar.

export default async function LoginPage(props: PageProps<"/panel/login">) {
  const parametros = await props.searchParams;
  const volverCrudo = parametros?.volver;
  const volver =
    typeof volverCrudo === "string" && volverCrudo.startsWith("/panel") ? volverCrudo : "/panel";

  return (
    <div className="nav-oscura flex min-h-screen flex-col items-center justify-center gap-7 bg-nav px-4 py-10">
      <div className="flex flex-col items-center gap-3.5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-tarjeta bg-brand text-brand-contraste">
          <LogoMarca className="h-8 w-8" />
        </span>
        <div>
          <h1 className="font-titulo text-2xl font-bold tracking-tight text-nav-ink">{PRODUCTO}</h1>
          <p className="mt-1 text-sm text-nav-ink-2">Entrá al panel de tu carnicería</p>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <FormularioLogin volver={volver} />

        <p className="mt-6 text-center text-xs text-nav-ink-2">
          ¿No podés entrar? Escribinos y te damos una mano.
        </p>
      </div>
    </div>
  );
}
