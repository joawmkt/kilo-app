import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta, clasesBoton } from "@/components/panel/ui";
import { LogoMarca } from "@/lib/panel/marca";
import { MARCA, PRODUCTO, DOMINIO } from "@/lib/marca";

// Esta pantalla usa el sistema de diseño del panel pero vive fuera de él, así
// que carga sus tipografías por su cuenta. Next deduplica el CSS: si alguien
// llega acá y después entra al panel, no se bajan dos veces.
import "@fontsource-variable/archivo";
import "@fontsource-variable/public-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";

// `/conectar` — la puerta de entrada del alta de una carnicería.
//
// Es pública y vive en la raíz del dominio del SaaS a propósito: es la
// dirección que se le pasa a un carnicero para que conecte su número, y tiene
// que ser corta y decible por teléfono.
//
// Explica el flujo sin pedir sesión. El alta de verdad —que necesita saber a
// qué carnicería conectar el número— vive en `/panel/conectar`, detrás del
// login.
//
// La presentación comercial del producto NO está acá: está en
// ainnova.com.ar/kilo. Esta página es operativa, para alguien que ya decidió.

export const metadata: Metadata = {
  title: `Conectar tu WhatsApp — ${PRODUCTO}`,
  description: `Cómo se conecta el WhatsApp de tu carnicería a ${PRODUCTO}. Conservás tu número y seguís usando tu app de siempre.`,
};

const PASOS = [
  {
    titulo: "Entrás con tu cuenta",
    detalle: "Te la damos cuando arrancamos. Si todavía no la tenés, escribinos y te la creamos.",
  },
  {
    titulo: "Apretás un botón",
    detalle: "Se abre una ventana de Meta, la empresa dueña de WhatsApp. Elegís tu cuenta y ponés tu número.",
  },
  {
    titulo: "Escaneás un código con el celular",
    detalle: "Igual que cuando abrís WhatsApp en la computadora. Tarda un par de minutos.",
  },
  {
    titulo: "Seguís usando tu WhatsApp igual que siempre",
    detalle:
      "Tu número no cambia, tus chats no se pierden y podés contestar a mano cuando quieras. El asistente convive con vos en el mismo número.",
  },
];

export default function ConectarPublico() {
  return (
    <div className="panel min-h-screen bg-bg font-panel text-ink">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-tarjeta bg-brand text-brand-contraste">
            <LogoMarca />
          </span>
          <span className="font-titulo text-lg font-bold text-ink">{PRODUCTO}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-ink sm:text-3xl">
            Conectar tu WhatsApp
          </h1>
          <p className="mt-2 text-base text-ink-2">
            Para que {PRODUCTO} pueda tomar pedidos por vos, hay que vincular una sola vez el
            WhatsApp de tu carnicería. Conservás tu número, tus chats y tu forma de trabajar.
          </p>
        </div>

        <Tarjeta className="p-5" as="div">
          <h2 className="font-titulo text-base font-semibold text-ink">Cómo es</h2>
          <ol className="mt-3 flex flex-col gap-4">
            {PASOS.map((paso, indice) => (
              <li key={paso.titulo} className="flex gap-3">
                <span
                  aria-hidden
                  className="numero flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand"
                >
                  {indice + 1}
                </span>
                <div>
                  <p className="font-titulo text-sm font-semibold text-ink">{paso.titulo}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{paso.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        </Tarjeta>

        <div className="rounded-tarjeta border border-warning/40 bg-warning-soft px-4 py-3">
          <p className="font-titulo text-sm font-semibold text-warning">
            Antes de conectar, revisá esto
          </p>
          <p className="mt-1 text-sm text-warning">
            Hay cosas que quedan fijas después de vincular el número y no se pueden cambiar: la foto
            de perfil, el nombre del negocio y si se importa o no el historial. Y el número tiene que
            estar en <strong>WhatsApp Business</strong> — no el WhatsApp común — con al menos una
            semana de uso.
          </p>
          <p className="mt-2 text-sm text-warning">
            No te preocupes por acordarte de todo: la pantalla de conexión te lo vuelve a listar, y
            lo hacemos juntos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/panel/conectar" className={clasesBoton("principal")}>
            Entrar y conectar
          </Link>
          <a
            href={`https://${DOMINIO}/kilo`}
            className={clasesBoton("secundario")}
            rel="noreferrer"
          >
            Ver qué es {PRODUCTO}
          </a>
        </div>

        <footer className="mt-6 border-t border-border pt-5 text-xs text-ink-3">
          <p>
            {PRODUCTO} es un producto de {MARCA}.{" "}
            <a href={`https://${DOMINIO}/privacidad`} className="underline" rel="noreferrer">
              Política de privacidad
            </a>{" "}
            ·{" "}
            <a href={`https://${DOMINIO}/terminos`} className="underline" rel="noreferrer">
              Términos
            </a>{" "}
            ·{" "}
            <a
              href={`https://${DOMINIO}/eliminacion-de-datos`}
              className="underline"
              rel="noreferrer"
            >
              Eliminación de datos
            </a>
          </p>
          <p className="mt-2">
            WhatsApp es una marca registrada de Meta Platforms, Inc. {MARCA} no está afiliado,
            patrocinado ni avalado por Meta Platforms, Inc.
          </p>
        </footer>
      </main>
    </div>
  );
}
