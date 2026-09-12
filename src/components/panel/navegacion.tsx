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
// El armazón es un bloque oscuro: en escritorio una columna a la izquierda, en
// teléfono una barra abajo. Que sea oscuro y no blanco es la decisión que más
// ordena la pantalla — separa el marco del contenido, así una tarjeta blanca se
// lee como contenido y no como parte de la navegación.
//
// En escritorio ancho la columna muestra las etiquetas; entre 768 y 1024 px
// queda como riel de íconos, porque a ese ancho 240 px de navegación le comen
// demasiado a una tabla de stock.
//
// En teléfono: navegación INFERIOR con los cuatro destinos más usados más un
// "Más" para el resto. Nada de menú hamburguesa — el carnicero tiene que llegar
// a "Pedidos" en un toque, no en dos.

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

/**
 * Los destinos que no son del producto (Simulador, Admin) van separados abajo,
 * con una división. Mezclarlos con Pedidos y Stock hace que el panel parezca
 * tener once secciones cuando en realidad tiene nueve más dos herramientas.
 */
function esHerramienta(href: string): boolean {
  return href === DESTINO_SIMULADOR.href || href === DESTINO_ADMIN.href;
}

// ============================================================
// Escritorio — columna lateral
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
  const secciones = lista.filter((destino) => !esHerramienta(destino.href));
  const herramientas = lista.filter((destino) => esHerramienta(destino.href));

  return (
    <nav
      aria-label="Secciones del panel"
      className="nav-oscura sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col gap-1 overflow-y-auto bg-nav px-3 py-4 md:flex lg:w-[244px] lg:px-4"
    >
      {/* Ainnova es la empresa; KILO es el producto que el carnicero contrató y
          adentro del cual trabaja. Los nombres salen de src/lib/marca.ts. */}
      <Link
        href="/panel"
        className="mb-5 flex items-center gap-3 rounded-control px-1 py-1 lg:px-1.5"
        aria-label={`Inicio del panel de ${PRODUCTO}`}
        title={PRODUCTO}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand text-brand-contraste">
          <LogoMarca />
        </span>
        <span className="hidden font-titulo text-lg font-bold tracking-tight text-nav-ink lg:block">
          {PRODUCTO}
        </span>
      </Link>

      <ul className="flex flex-col gap-0.5">
        {secciones.map((destino) => (
          <li key={destino.href}>
            <EnlaceLateral
              destino={destino}
              activo={estaActivo(pathname, destino.href)}
              pendientes={destino.href === "/panel/pedidos" ? pendientes : 0}
            />
          </li>
        ))}
      </ul>

      {herramientas.length > 0 ? (
        <>
          <hr className="my-3 border-nav-border" />
          {/* Etiqueta de grupo solo donde el ancho alcanza para leerla; en el
              riel angosto la división sola ya dice lo mismo. */}
          <p className="mb-1 hidden px-3 font-titulo text-[11px] font-semibold text-nav-ink-2 lg:block">
            Herramientas
          </p>
          <ul className="flex flex-col gap-0.5">
            {herramientas.map((destino) => (
              <li key={destino.href}>
                <EnlaceLateral
                  destino={destino}
                  activo={estaActivo(pathname, destino.href)}
                  pendientes={0}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </nav>
  );
}

function EnlaceLateral({
  destino: { href, etiqueta, Icono },
  activo,
  pendientes,
}: {
  destino: Destino;
  activo: boolean;
  pendientes: number;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      title={etiqueta}
      className={`relative flex min-h-11 items-center gap-3 rounded-control px-3 transition-colors max-lg:justify-center max-lg:px-0 ${
        activo
          ? "bg-nav-activo text-nav-activo-ink"
          : "text-nav-ink-2 hover:bg-nav-2 hover:text-nav-ink"
      }`}
    >
      {/* El marcador de cobre es lo que dice "estás acá" de un vistazo. El
          fondo más claro solo no alcanza: sobre el vino oscuro la diferencia
          entre `--nav-2` y `--nav-activo` es sutil a propósito, para que el
          hover no grite. */}
      {activo ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-nav-marca"
        />
      ) : null}

      <span className="relative shrink-0">
        <Icono className="h-[22px] w-[22px]" />
        {pendientes > 0 ? <PuntoPendiente cantidad={pendientes} /> : null}
      </span>

      <span className="hidden min-w-0 flex-1 truncate font-titulo text-sm font-semibold tracking-tight lg:block">
        {etiqueta}
      </span>

      {/* Con etiquetas visibles el contador va al final de la fila, donde se lee
          como un dato y no como una notificación pegada al ícono. */}
      {pendientes > 0 ? (
        <span className="numero hidden shrink-0 rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white lg:block">
          {pendientes > 99 ? "99+" : pendientes}
        </span>
      ) : null}
    </Link>
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
            className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          />
          <div className="nav-oscura fixed inset-x-0 bottom-[4.75rem] z-50 mx-3 rounded-bloque bg-nav p-2 shadow-elevada md:hidden">
            <ul className="grid grid-cols-2 gap-1">
              {secundarios.map(({ href, etiqueta, Icono }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setAbierto(false)}
                    className={`flex min-h-12 items-center gap-3 rounded-control px-3 ${
                      estaActivo(pathname, href)
                        ? "bg-nav-activo text-nav-activo-ink"
                        : "text-nav-ink-2 hover:bg-nav-2 hover:text-nav-ink"
                    }`}
                  >
                    <Icono className="h-5 w-5" />
                    <span className="font-titulo text-sm font-semibold tracking-tight">
                      {etiqueta}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <nav
        aria-label="Secciones del panel"
        className="nav-oscura fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 bg-nav pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {principales.map(({ href, etiqueta, Icono }) => {
          const activo = estaActivo(pathname, href);
          const mostrarPendientes = href === "/panel/pedidos" && pendientes > 0;

          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 ${
                activo ? "text-nav-activo-ink" : "text-nav-ink-2"
              }`}
            >
              {/* Arriba y no abajo: abajo lo tapa la barra de gestos del
                  teléfono. */}
              {activo ? (
                <span
                  aria-hidden
                  className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-nav-marca"
                />
              ) : null}
              <span className="relative">
                <Icono className="h-6 w-6" />
                {mostrarPendientes ? <PuntoPendiente cantidad={pendientes} /> : null}
              </span>
              <span className="font-titulo text-[11px] font-semibold tracking-tight">
                {etiqueta}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 ${
            abierto || hayActivoSecundario ? "text-nav-activo-ink" : "text-nav-ink-2"
          }`}
        >
          <IconoMas className="h-6 w-6" />
          <span className="font-titulo text-[11px] font-semibold tracking-tight">Más</span>
        </button>
      </nav>
    </>
  );
}

function PuntoPendiente({ cantidad }: { cantidad: number }) {
  return (
    <span
      className="numero absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white lg:hidden"
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

const SIGUIENTE_TEMA: Record<Tema, Tema> = { auto: "claro", claro: "oscuro", oscuro: "auto" };
const ETIQUETA_TEMA: Record<Tema, string> = {
  auto: "Automático",
  claro: "Modo claro",
  oscuro: "Modo oscuro",
};

export function SelectorDeTema() {
  const tema = useSyncExternalStore(suscribir, leerTema, leerTemaEnServidor);

  return (
    <button
      type="button"
      onClick={() => aplicarTema(SIGUIENTE_TEMA[tema])}
      className="flex min-h-11 items-center gap-2 rounded-control px-3 font-titulo text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      title={`${ETIQUETA_TEMA[tema]} — tocar para cambiar`}
    >
      <IconoTema tema={tema} />
      <span className="hidden sm:block">{ETIQUETA_TEMA[tema]}</span>
    </button>
  );
}

/** Sol, luna o medio y medio: en el teléfono el botón es solo el ícono. */
function IconoTema({ tema }: { tema: Tema }) {
  if (tema === "claro") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (tema === "oscuro") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
    </svg>
  );
}
