"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { PRODUCTO } from "@/lib/marca";
import { LogoMarca } from "@/lib/panel/marca";
import {
  IconoCaja,
  IconoClientes,
  IconoConfiguracion,
  IconoInicio,
  IconoMas,
  IconoMensajes,
  IconoMetricas,
  IconoPedidos,
  IconoPlantillas,
  IconoStock,
  IconoSimulador,
  IconoAdmin,
} from "./iconos";

// Navegación del panel.
//
// En escritorio: barra lateral angosta de íconos a la izquierda, con el logo
// arriba. En teléfono: navegación INFERIOR con los cuatro destinos más usados
// más un "Más" para el resto. Nada de menú hamburguesa — el carnicero tiene que
// llegar a "Pedidos" en un toque, no en dos.

type Destino = {
  href: string;
  etiqueta: string;
  Icono: (props: { className?: string }) => React.ReactElement;
  /** true = entra en la barra inferior del teléfono. */
  principal?: boolean;
};

export const DESTINOS: Destino[] = [
  { href: "/panel", etiqueta: "Inicio", Icono: IconoInicio, principal: true },
  { href: "/panel/pedidos", etiqueta: "Pedidos", Icono: IconoPedidos, principal: true },
  { href: "/panel/stock", etiqueta: "Stock", Icono: IconoStock, principal: true },
  { href: "/panel/mensajes", etiqueta: "Mensajes", Icono: IconoMensajes, principal: true },
  { href: "/panel/clientes", etiqueta: "Clientes", Icono: IconoClientes },
  { href: "/panel/caja", etiqueta: "Caja", Icono: IconoCaja },
  { href: "/panel/metricas", etiqueta: "Métricas", Icono: IconoMetricas },
  { href: "/panel/plantillas", etiqueta: "Plantillas", Icono: IconoPlantillas },
  { href: "/panel/configuracion", etiqueta: "Ajustes", Icono: IconoConfiguracion },
];

// El simulador no es parte del producto: es la forma de probar el bot mientras
// se espera la conexión con Meta. Aparece solo si la carnicería está en modo
// simulado, y desaparece solo el día que se conecta de verdad.
const DESTINO_SIMULADOR: Destino = {
  href: "/panel/simulador",
  etiqueta: "Simulador",
  Icono: IconoSimulador,
};

// Solo para el fundador: todas las carnicerías y el estado de la plataforma.
// Un carnicero nunca ve este destino, y aunque escribiera la URL a mano,
// `requerirAdmin()` lo devuelve a su panel.
const DESTINO_ADMIN: Destino = {
  href: "/panel/admin",
  etiqueta: "Admin",
  Icono: IconoAdmin,
};

function destinos(mostrarSimulador: boolean, mostrarAdmin: boolean): Destino[] {
  const lista = [...DESTINOS];
  if (mostrarSimulador) lista.push(DESTINO_SIMULADOR);
  if (mostrarAdmin) lista.push(DESTINO_ADMIN);
  return lista;
}

function estaActivo(pathname: string, href: string): boolean {
  if (href === "/panel") return pathname === "/panel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ============================================================
// Escritorio — barra lateral
// ============================================================

export function BarraLateral({
  pendientes,
  mostrarSimulador = false,
  mostrarAdmin = false,
}: {
  pendientes: number;
  mostrarSimulador?: boolean;
  mostrarAdmin?: boolean;
}) {
  const pathname = usePathname();
  const lista = destinos(mostrarSimulador, mostrarAdmin);

  return (
    <nav
      aria-label="Secciones del panel"
      className="hidden w-20 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4 md:flex"
    >
      {/* Ainnova es la empresa; KILO es el producto que el carnicero contrató y
          adentro del cual trabaja. Los nombres salen de src/lib/marca.ts. */}
      <Link
        href="/panel"
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-contraste"
        aria-label={`Inicio del panel de ${PRODUCTO}`}
        title={PRODUCTO}
      >
        <LogoMarca />
      </Link>

      {lista.map(({ href, etiqueta, Icono }) => {
        const activo = estaActivo(pathname, href);
        const mostrarPendientes = href === "/panel/pedidos" && pendientes > 0;

        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={`group relative flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors ${
              activo ? "bg-brand-soft text-brand" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span className="relative">
              <Icono className="h-6 w-6" />
              {mostrarPendientes ? <PuntoPendiente cantidad={pendientes} /> : null}
            </span>
            <span className="font-titulo text-[10px] font-semibold leading-tight">{etiqueta}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ============================================================
// Teléfono — navegación inferior
// ============================================================

export function NavegacionInferior({
  pendientes,
  mostrarSimulador = false,
  mostrarAdmin = false,
}: {
  pendientes: number;
  mostrarSimulador?: boolean;
  mostrarAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const lista = destinos(mostrarSimulador, mostrarAdmin);
  const principales = lista.filter((destino) => destino.principal);
  const secundarios = lista.filter((destino) => !destino.principal);
  const hayActivoSecundario = secundarios.some((destino) => estaActivo(pathname, destino.href));

  return (
    <>
      {abierto ? (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 bg-ink/30 md:hidden"
          />
          <div className="fixed inset-x-0 bottom-[4.5rem] z-50 mx-3 rounded-2xl border border-border bg-surface p-2 shadow-elevada md:hidden">
            <ul className="grid grid-cols-2 gap-1">
              {secundarios.map(({ href, etiqueta, Icono }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setAbierto(false)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-3 ${
                      estaActivo(pathname, href)
                        ? "bg-brand-soft text-brand"
                        : "text-ink-2 hover:bg-surface-2"
                    }`}
                  >
                    <Icono className="h-5 w-5" />
                    <span className="font-titulo text-sm font-semibold">{etiqueta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Secciones del panel"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {principales.map(({ href, etiqueta, Icono }) => {
          const activo = estaActivo(pathname, href);
          const mostrarPendientes = href === "/panel/pedidos" && pendientes > 0;

          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 ${
                activo ? "text-brand" : "text-ink-3"
              }`}
            >
              <span className="relative">
                <Icono className="h-6 w-6" />
                {mostrarPendientes ? <PuntoPendiente cantidad={pendientes} /> : null}
              </span>
              <span className="font-titulo text-[11px] font-semibold">{etiqueta}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 ${
            abierto || hayActivoSecundario ? "text-brand" : "text-ink-3"
          }`}
        >
          <IconoMas className="h-6 w-6" />
          <span className="font-titulo text-[11px] font-semibold">Más</span>
        </button>
      </nav>
    </>
  );
}

function PuntoPendiente({ cantidad }: { cantidad: number }) {
  return (
    <span
      className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-surface"
      aria-label={`${cantidad} pedidos esperando aprobación`}
    >
      {cantidad > 9 ? "9+" : cantidad}
    </span>
  );
}

// ============================================================
// Selector de modo claro / oscuro
// ============================================================
//
// Automático por defecto (sigue al sistema). El carnicero puede forzarlo:
// bajo el sol de la vereda el modo claro se lee mejor, y de noche pasa lo
// contrario. La preferencia queda en el navegador de cada dispositivo.

type Tema = "auto" | "claro" | "oscuro";

const CLAVE_TEMA = "carnicom-tema";
const EVENTO_TEMA = "carnicom:tema";

// El tema ya vive en el DOM: el script del layout pone `data-tema` en <html>
// antes del primer pintado para que no parpadee. Duplicarlo en un estado de
// React obligaría a sincronizarlo con un efecto; en cambio se lee el atributo
// como fuente de verdad, que es justo para lo que existe useSyncExternalStore.
function suscribir(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_TEMA, alCambiar);
  // `storage` avisa cuando el carnicero cambia el tema en otra pestaña.
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_TEMA, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

function leerTema(): Tema {
  const valor = document.documentElement.getAttribute("data-tema");
  return valor === "claro" || valor === "oscuro" ? valor : "auto";
}

// En el servidor no hay DOM ni preferencia guardada: siempre "auto".
function leerTemaEnServidor(): Tema {
  return "auto";
}

function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  try {
    if (tema === "auto") {
      raiz.removeAttribute("data-tema");
      window.localStorage.removeItem(CLAVE_TEMA);
    } else {
      raiz.setAttribute("data-tema", tema);
      window.localStorage.setItem(CLAVE_TEMA, tema);
    }
  } catch {
    // Modo incógnito o almacenamiento bloqueado: el tema igual se aplica en
    // esta sesión, solo que no se recuerda para la próxima.
    if (tema === "auto") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", tema);
  }
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

export function SelectorDeTema() {
  const tema = useSyncExternalStore(suscribir, leerTema, leerTemaEnServidor);

  const siguiente: Record<Tema, Tema> = { auto: "claro", claro: "oscuro", oscuro: "auto" };
  const etiqueta: Record<Tema, string> = {
    auto: "Automático",
    claro: "Modo claro",
    oscuro: "Modo oscuro",
  };

  return (
    <button
      type="button"
      onClick={() => aplicarTema(siguiente[tema])}
      className="flex min-h-11 items-center rounded-lg px-3 font-titulo text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
      title={`${etiqueta[tema]} — tocar para cambiar`}
    >
      {etiqueta[tema]}
    </button>
  );
}
