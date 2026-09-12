import Link from "next/link";
import type { ReactNode } from "react";

// Componentes base del panel. Todo lo demás se apoya acá.
//
// Reglas que vienen del brief y que no se negocian:
//   - Ningún color escrito a mano: todo sale de los tokens de globals.css.
//   - Objetivos táctiles grandes: el carnicero toca con las manos ocupadas,
//     mojadas o con frío. Mínimo 44px de alto en cualquier cosa que se toque.
//   - Alto contraste: se ve bajo luz fuerte y con la pantalla sucia.
//   - Los números, grandes y con cifras tabulares (clase `numero`).
//
// Y una que ordena el aspecto: la jerarquía se codifica, no se decora. Una
// tarjeta que pide una decisión no se distingue de una informativa por llevar
// un ícono más lindo, sino por estar más alta y tener un filo de color. Si todo
// lleva el mismo radio y la misma sombra, no hay jerarquía: hay plantilla.

// ============================================================
// Tarjeta
// ============================================================

/**
 * Peso visual de una tarjeta. Es una decisión de información, no de estética:
 *
 *   apoyada   el default. Contenedor de lectura.
 *   atencion  pide una decisión del carnicero. Sube un escalón de sombra y
 *             lleva un filo de color arriba.
 *   plana     vive adentro de otra tarjeta, o en una grilla donde la sombra
 *             repetida ensuciaría más de lo que aclara.
 */
type PesoTarjeta = "apoyada" | "atencion" | "plana";

const CLASES_PESO: Record<PesoTarjeta, string> = {
  apoyada: "border border-border bg-surface shadow-tarjeta",
  atencion: "border border-border bg-surface shadow-media",
  plana: "border border-border bg-surface",
};

export function Tarjeta({
  children,
  className = "",
  peso = "apoyada",
  as: Componente = "section",
}: {
  children: ReactNode;
  className?: string;
  peso?: PesoTarjeta;
  as?: "section" | "div" | "article" | "li";
}) {
  return (
    <Componente
      className={`rounded-tarjeta ${CLASES_PESO[peso]} ${className}`}
    >
      {children}
    </Componente>
  );
}

export function TarjetaEncabezado({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-titulo text-[15px] font-bold tracking-tight text-ink">{titulo}</h2>
        {descripcion ? <p className="mt-0.5 text-[13px] text-ink-2">{descripcion}</p> : null}
      </div>
      {accion ? <div className="shrink-0">{accion}</div> : null}
    </div>
  );
}

// ============================================================
// Encabezado de pantalla
// ============================================================

/**
 * El encabezado de cada pantalla del panel: de qué se trata, en una línea qué
 * hay acá, y la acción principal a la derecha si la hay.
 *
 * Existe como componente y no como markup suelto en cada página para que las
 * nueve pantallas arranquen exactamente a la misma altura. Cuando cada página
 * escribe su propio `<h1>`, terminan con seis tamaños distintos y el panel se
 * siente cosido de retazos.
 */
export function EncabezadoPantalla({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-titulo text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
          {titulo}
        </h1>
        {descripcion ? <p className="mt-1 text-sm text-ink-2">{descripcion}</p> : null}
      </div>
      {accion ? <div className="shrink-0">{accion}</div> : null}
    </header>
  );
}

/**
 * Volver a la pantalla de la que se vino. Va arriba de todo en las pantallas de
 * detalle.
 *
 * Existe como componente porque venía escrito a mano en cada detalle como texto
 * suelto de 14px: un blanco de 11px de alto para apuntarle con el dedo, cuando
 * el resto del panel respeta 44px. La flecha es parte del enlace y no un adorno
 * agregado al final — indica la dirección, que es justamente lo que hace que se
 * lea como "atrás" y no como un enlace más.
 */
export function EnlaceVolver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-control px-2 font-titulo text-sm font-semibold text-brand transition-colors hover:bg-brand-soft"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}

// ============================================================
// Estados que no se pueden olvidar: vacío, cargando, error
// ============================================================

/**
 * Estado vacío. Nunca un espacio en blanco: siempre explica QUÉ va a aparecer
 * ahí, porque durante el piloto la mitad de las pantallas van a estar vacías y
 * un vacío sin explicación se lee como "está roto".
 */
export function EstadoVacio({
  titulo,
  descripcion,
  icono,
  accion,
}: {
  titulo: string;
  descripcion: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icono ? (
        <span
          aria-hidden
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3"
        >
          {icono}
        </span>
      ) : null}
      <p className="font-titulo text-base font-bold tracking-tight text-ink">{titulo}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-2">{descripcion}</p>
      {accion ? <div className="mt-3">{accion}</div> : null}
    </div>
  );
}

/**
 * Estado de error. Dice qué pasó y qué hacer, sin disculpas ni jerga técnica.
 * El detalle técnico va aparte, plegado, para cuando haya que diagnosticar.
 */
export function EstadoError({
  titulo = "No pudimos cargar esto",
  descripcion,
  detalle,
  accion,
}: {
  titulo?: string;
  descripcion: string;
  detalle?: string | null;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span
        aria-hidden
        className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <IconoAlerta className="h-6 w-6" />
      </span>
      <p className="font-titulo text-base font-bold tracking-tight text-ink">{titulo}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-2">{descripcion}</p>
      {accion ? <div className="mt-3">{accion}</div> : null}
      {detalle ? (
        <details className="mt-3 w-full max-w-md text-left">
          <summary className="cursor-pointer text-xs text-ink-3">Detalle técnico</summary>
          <pre className="mt-2 overflow-x-auto rounded-control bg-surface-2 p-3 text-xs text-ink-2">
            {detalle}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Esqueleto de carga. Nunca un spinner centrado tapando toda la pantalla. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-surface-2 ${className}`}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function EsqueletoFilas({ filas = 4 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: filas }).map((_, indice) => (
        <div key={indice} className="flex items-center gap-3">
          <Esqueleto className="h-10 flex-1" />
          <Esqueleto className="h-10 w-20" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Etiquetas de estado
// ============================================================

export type TonoEtiqueta = "neutro" | "marca" | "exito" | "atencion" | "problema";

const CLASES_TONO: Record<TonoEtiqueta, string> = {
  neutro: "bg-surface-2 text-ink-2",
  marca: "bg-brand-soft text-brand",
  exito: "bg-success-soft text-success",
  atencion: "bg-warning-soft text-warning",
  problema: "bg-danger-soft text-danger",
};

/** El color de texto del tono, para cuando hace falta suelto (números, íconos). */
export const TEXTO_TONO: Record<TonoEtiqueta, string> = {
  neutro: "text-ink",
  marca: "text-brand",
  exito: "text-success",
  atencion: "text-warning",
  problema: "text-danger",
};

export function Etiqueta({
  children,
  tono = "neutro",
  className = "",
}: {
  children: ReactNode;
  tono?: TonoEtiqueta;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-titulo text-xs font-semibold ${CLASES_TONO[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// Números — lo que el carnicero mira de reojo
// ============================================================

/**
 * Un número con su etiqueta, sin contenedor. Para usar adentro de una tarjeta
 * que ya tiene su propio encabezado.
 *
 * La etiqueta va en caja baja y no en versalitas: una fila de MAYÚSCULAS
 * espaciadas se lee más lento, y acá la etiqueta está justamente para que se
 * entienda de qué es el número sin detenerse a leerla.
 */
export function NumeroGrande({
  valor,
  etiqueta,
  ayuda,
  tono = "neutro",
}: {
  valor: string;
  etiqueta: string;
  ayuda?: string;
  tono?: TonoEtiqueta;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-titulo text-[13px] font-semibold text-ink-2">{etiqueta}</span>
      <span className={`numero-grande text-[28px] sm:text-[32px] ${TEXTO_TONO[tono]}`}>{valor}</span>
      {ayuda ? <span className="text-xs leading-snug text-ink-3">{ayuda}</span> : null}
    </div>
  );
}

/**
 * El número del día, en su propia tarjeta. Es la unidad de la fila de arriba
 * del Inicio: lo primero que se ve al abrir el panel.
 *
 * El ícono no es decoración — es lo que hace que la fila se pueda barrer de
 * reojo sin leer las etiquetas, que es exactamente cómo se mira esta fila a las
 * ocho de la mañana con el local lleno.
 *
 * No hay variación de porcentaje ("+26% vs. el mes pasado") a propósito: KILO
 * no tiene con qué calcularla todavía, y el brief es explícito en que no se
 * inventa un número que no existe.
 */
export function TarjetaMetrica({
  valor,
  etiqueta,
  ayuda,
  icono,
  tono = "neutro",
}: {
  valor: string;
  etiqueta: string;
  ayuda?: string;
  icono?: ReactNode;
  tono?: TonoEtiqueta;
}) {
  return (
    <Tarjeta as="div" peso="plana" className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        {icono ? (
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${CLASES_TONO[tono]}`}
          >
            {icono}
          </span>
        ) : null}
        <span className="font-titulo text-[13px] font-semibold leading-tight text-ink-2">
          {etiqueta}
        </span>
      </div>

      <span className={`numero-grande text-[30px] sm:text-[34px] ${TEXTO_TONO[tono]}`}>{valor}</span>

      {ayuda ? <span className="text-xs leading-snug text-ink-3">{ayuda}</span> : null}
    </Tarjeta>
  );
}

// ============================================================
// Botones
// ============================================================

type VarianteBoton = "principal" | "secundario" | "peligro" | "fantasma";

const CLASES_BOTON: Record<VarianteBoton, string> = {
  // Borgoña de marca: acción principal. Nunca para alertas.
  principal: "bg-brand text-brand-contraste shadow-tarjeta hover:bg-brand-hover",
  secundario: "border border-border bg-surface text-ink hover:bg-surface-2 hover:border-ink-3/40",
  // Bermellón: solo para acciones destructivas o de rechazo.
  peligro: "border border-danger bg-danger-soft text-danger hover:bg-danger hover:text-surface",
  fantasma: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};

export function clasesBoton(variante: VarianteBoton = "principal", extra = ""): string {
  return [
    // min-h-11 = 44px: el mínimo para tocar con el dedo sin errarle.
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4",
    "font-titulo text-sm font-semibold tracking-tight",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    CLASES_BOTON[variante],
    extra,
  ].join(" ");
}

// ============================================================
// Iconos — SVG inline, sin librería y sin descargas
// ============================================================

export function IconoAlerta({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconoCheck({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m5 13 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconoCruz({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
