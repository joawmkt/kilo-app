import type { ReactNode } from "react";

// Componentes base del panel. Todo lo demás se apoya acá.
//
// Reglas que vienen del brief y que no se negocian:
//   - Ningún color escrito a mano: todo sale de los tokens de globals.css.
//   - Objetivos táctiles grandes: el carnicero toca con las manos ocupadas,
//     mojadas o con frío. Mínimo 44px de alto en cualquier cosa que se toque.
//   - Alto contraste: se ve bajo luz fuerte y con la pantalla sucia.
//   - Los números, grandes y con cifras tabulares (clase `numero`).

// ============================================================
// Tarjeta
// ============================================================

export function Tarjeta({
  children,
  className = "",
  as: Componente = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Componente
      className={`rounded-xl border border-border bg-surface shadow-tarjeta ${className}`}
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-titulo text-base font-semibold text-ink">{titulo}</h2>
        {descripcion ? <p className="mt-0.5 text-sm text-ink-2">{descripcion}</p> : null}
      </div>
      {accion ? <div className="shrink-0">{accion}</div> : null}
    </div>
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
      {icono ? <div className="mb-1 text-ink-3">{icono}</div> : null}
      <p className="font-titulo text-base font-semibold text-ink">{titulo}</p>
      <p className="max-w-sm text-sm text-ink-2">{descripcion}</p>
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
        className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger"
      >
        <IconoAlerta />
      </span>
      <p className="font-titulo text-base font-semibold text-ink">{titulo}</p>
      <p className="max-w-sm text-sm text-ink-2">{descripcion}</p>
      {accion ? <div className="mt-3">{accion}</div> : null}
      {detalle ? (
        <details className="mt-3 w-full max-w-md text-left">
          <summary className="cursor-pointer text-xs text-ink-3">Detalle técnico</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
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
      className={`animate-pulse rounded-md bg-surface-2 ${className}`}
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-titulo text-xs font-semibold ${CLASES_TONO[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// Números — lo que el carnicero mira de reojo
// ============================================================

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
  const colorValor =
    tono === "problema"
      ? "text-danger"
      : tono === "atencion"
        ? "text-warning"
        : tono === "exito"
          ? "text-success"
          : "text-ink";

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-titulo text-xs font-semibold uppercase tracking-wide text-ink-3">
        {etiqueta}
      </span>
      <span className={`numero text-2xl font-semibold sm:text-3xl ${colorValor}`}>{valor}</span>
      {ayuda ? <span className="text-xs text-ink-3">{ayuda}</span> : null}
    </div>
  );
}

// ============================================================
// Botones
// ============================================================

type VarianteBoton = "principal" | "secundario" | "peligro" | "fantasma";

const CLASES_BOTON: Record<VarianteBoton, string> = {
  // Borgoña de marca: acción principal. Nunca para alertas.
  principal: "bg-brand text-brand-contraste hover:bg-brand-hover",
  secundario: "border border-border bg-surface text-ink hover:bg-surface-2",
  // Bermellón: solo para acciones destructivas o de rechazo.
  peligro: "border border-danger bg-danger-soft text-danger hover:bg-danger hover:text-surface",
  fantasma: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};

export function clasesBoton(variante: VarianteBoton = "principal", extra = ""): string {
  return [
    // min-h-11 = 44px: el mínimo para tocar con el dedo sin errarle.
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-titulo text-sm font-semibold",
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
