import { FormularioLogin } from "./formulario";
import { MARCA, LogoMarca } from "@/lib/panel/marca";

export default async function LoginPage(props: PageProps<"/panel/login">) {
  const parametros = await props.searchParams;
  const volverCrudo = parametros?.volver;
  const volver = typeof volverCrudo === "string" && volverCrudo.startsWith("/panel") ? volverCrudo : "/panel";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-brand-contraste">
            <LogoMarca className="h-8 w-8" />
          </span>
          <div>
            <h1 className="font-titulo text-xl font-bold text-ink">{MARCA}</h1>
            <p className="mt-1 text-sm text-ink-2">Entrá al panel de tu carnicería</p>
          </div>
        </div>

        <FormularioLogin volver={volver} />

        <p className="mt-6 text-center text-xs text-ink-3">
          ¿No podés entrar? Escribinos y te damos una mano.
        </p>
      </div>
    </div>
  );
}
