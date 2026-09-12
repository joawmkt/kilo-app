"use client";

import { useId, useState } from "react";
import { EstadoVacio } from "./ui";

// ============================================================
// Gráficos del panel
// ============================================================
//
// Un solo sistema visual para todos: mismos colores, mismas tipografías, mismo
// tratamiento de ejes. Reglas que valen para los dos gráficos de acá:
//
//   - Serie principal en `--grafico-1`, secundaria en `--grafico-2`. Los colores
//     semánticos (verde, ámbar, rojo) NO se usan como color de serie: están
//     reservados para significar estado.
//   - Marcas finas, esquinas redondeadas de 4px solo del lado del dato (la base
//     queda anclada a la línea de cero), 2px de separación entre barras.
//   - Grilla tenue, sin bordes pesados, sin ejes marcados.
//   - Etiquetas directas solo donde aportan (el máximo y el último), nunca un
//     número sobre cada barra.
//   - Todo gráfico tiene estado vacío digno: durante el piloto va a haber
//     poquísimos datos, y un gráfico en blanco se lee como "está roto".
//   - Todo gráfico tiene su tabla equivalente, plegada. La identidad de los
//     datos nunca depende solo del color.
//
// No hay librería de gráficos: son dos formas simples hechas con elementos
// HTML. Sumar una dependencia de 100 kB para dibujar rectángulos sería un mal
// negocio en un panel que se abre desde el celular de una carnicería.

export type PuntoGrafico = {
  etiqueta: string;
  /** Etiqueta larga para la tabla y el tooltip. */
  etiquetaLarga?: string;
  valor: number;
  /** Texto ya formateado (pesos, kilos) para mostrar. */
  valorFormateado: string;
};

// ============================================================
// Barras verticales — evolución en el tiempo
// ============================================================

export function GraficoBarras({
  datos,
  titulo,
  descripcionVacio,
  serie = 1,
}: {
  datos: PuntoGrafico[];
  titulo: string;
  descripcionVacio: string;
  serie?: 1 | 2;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const idTitulo = useId();

  const maximo = Math.max(...datos.map((punto) => punto.valor), 0);
  const hayDatos = datos.length > 0 && maximo > 0;

  if (!hayDatos) {
    return <EstadoVacio titulo="Todavía no hay datos suficientes" descripcion={descripcionVacio} />;
  }

  const color = serie === 1 ? "var(--grafico-1)" : "var(--grafico-2)";
  const indiceMaximo = datos.findIndex((punto) => punto.valor === maximo);

  // Las barras se dibujan con elementos HTML y no con SVG a propósito: un SVG
  // con `preserveAspectRatio="none"` estira el eje horizontal, y con él deforma
  // el radio de las esquinas hasta hacerlo desaparecer. En HTML el redondeo de
  // 4px del lado del dato es exactamente 4px, y la base queda anclada al cero.
  return (
    <figure className="m-0">
      <figcaption id={idTitulo} className="sr-only">
        {titulo}
      </figcaption>

      {/* Etiqueta directa: el máximo, o el punto que se está señalando. Nunca un
          número sobre cada barra. */}
      <p className="mb-1 text-center">
        <span className="numero text-xs font-semibold text-ink">
          {activo !== null
            ? `${datos[activo].etiquetaLarga ?? datos[activo].etiqueta}: ${datos[activo].valorFormateado}`
            : `Máximo: ${datos[indiceMaximo].valorFormateado}`}
        </span>
      </p>

      <div className="relative h-40" role="img" aria-labelledby={idTitulo}>
        {/* Grilla tenue: tres líneas y nada más. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((linea) => (
            <span key={linea} className="block h-px w-full bg-grafico-grilla" />
          ))}
        </div>

        <div className="relative flex h-full items-end gap-0.5">
          {datos.map((punto, indice) => {
            const altura = (punto.valor / maximo) * 100;
            const esActivo = activo === indice;

            return (
              <button
                key={`${punto.etiqueta}-${indice}`}
                type="button"
                // La zona sensible ocupa todo el alto de la columna: se puede
                // tocar con el dedo sin tener que apuntarle a la barra.
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setActivo(indice)}
                onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(indice)}
                onBlur={() => setActivo(null)}
                aria-label={`${punto.etiquetaLarga ?? punto.etiqueta}: ${punto.valorFormateado}`}
              >
                <span
                  className="block w-full max-w-10 rounded-t transition-opacity"
                  style={{
                    height: `${Math.max(altura, 1)}%`,
                    backgroundColor: color,
                    opacity: activo === null || esActivo ? 1 : 0.55,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex gap-0.5" aria-hidden>
        {datos.map((punto, indice) => (
          <span
            key={`${punto.etiqueta}-${indice}`}
            className={`flex-1 text-center text-[11px] ${
              indice === activo ? "font-semibold text-ink" : "text-ink-3"
            }`}
          >
            {punto.etiqueta}
          </span>
        ))}
      </div>

      <TablaEquivalente datos={datos} titulo={titulo} />
    </figure>
  );
}

// ============================================================
// Barras horizontales — ranking
// ============================================================
//
// Para categorías ordenadas (los cortes más pedidos, los horarios más elegidos)
// la barra horizontal es la forma correcta: los nombres se leen de corrido y no
// hay que rotar ninguna etiqueta.

export function GraficoRanking({
  datos,
  titulo,
  descripcionVacio,
  serie = 1,
}: {
  datos: PuntoGrafico[];
  titulo: string;
  descripcionVacio: string;
  serie?: 1 | 2;
}) {
  const maximo = Math.max(...datos.map((punto) => punto.valor), 0);

  if (datos.length === 0 || maximo === 0) {
    return <EstadoVacio titulo="Todavía no hay datos suficientes" descripcion={descripcionVacio} />;
  }

  const color = serie === 1 ? "var(--grafico-1)" : "var(--grafico-2)";

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="sr-only">{titulo}</figcaption>

      {datos.map((punto) => (
        <div key={punto.etiqueta} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm text-ink" title={punto.etiquetaLarga}>
            {punto.etiqueta}
          </span>

          <span className="h-5 flex-1 overflow-hidden rounded-sm bg-surface-2">
            <span
              className="block h-full rounded-sm"
              style={{ width: `${(punto.valor / maximo) * 100}%`, backgroundColor: color }}
            />
          </span>

          <span className="numero w-16 shrink-0 text-right text-sm font-semibold text-ink">
            {punto.valorFormateado}
          </span>
        </div>
      ))}
    </figure>
  );
}

// ============================================================
// Rosca — parte de un todo
// ============================================================
//
// La rosca sirve para UNA cosa y solo una: mostrar cómo se reparte un total
// entre dos o tres partes, con el total legible en el centro. No sirve para
// comparar categorías (para eso está el ranking) ni para ver evolución (para
// eso están las barras), y con más de tres segmentos deja de leerse.
//
// El agujero del medio no es un capricho de estilo: es lo que permite poner el
// total adentro, que es el número que el carnicero viene a buscar.

export type SegmentoRosca = {
  etiqueta: string;
  valor: number;
  /** 1 = serie principal (borgoña), 2 = secundaria (cobre). */
  serie: 1 | 2;
};

export function GraficoRosca({
  segmentos,
  total,
  etiquetaCentro,
  titulo,
  descripcionVacio,
}: {
  segmentos: SegmentoRosca[];
  /** El número grande del centro. */
  total: string;
  /** Qué es ese número, en dos o tres palabras. */
  etiquetaCentro: string;
  titulo: string;
  descripcionVacio: string;
}) {
  const suma = segmentos.reduce((acumulado, segmento) => acumulado + segmento.valor, 0);

  if (suma === 0) {
    return <EstadoVacio titulo="Todavía no hay datos suficientes" descripcion={descripcionVacio} />;
  }

  // Geometría del anillo. El radio y el grosor están en unidades del viewBox,
  // así que la rosca escala sola y el grosor nunca se deforma.
  const RADIO = 60;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

  // Cada segmento arranca donde terminó la suma de los anteriores. Se calcula
  // de una en un `reduce` y no acumulando dentro del `map`: mutar una variable
  // mientras se renderiza da resultados distintos según cuándo React vuelva a
  // correr el componente.
  const arcos = segmentos.reduce<{ segmento: SegmentoRosca; largo: number; desfase: number }[]>(
    (acumulado, segmento) => {
      const anterior = acumulado.at(-1);
      const desfase = anterior ? anterior.desfase - anterior.largo : 0;
      acumulado.push({ segmento, largo: (segmento.valor / suma) * CIRCUNFERENCIA, desfase });
      return acumulado;
    },
    []
  );

  return (
    <figure className="m-0 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
      <figcaption className="sr-only">{titulo}</figcaption>

      <div className="relative shrink-0">
        <svg viewBox="0 0 160 160" className="h-40 w-40" role="img" aria-label={titulo}>
          {/* Pista: cierra el anillo aunque los segmentos no sumen el total. */}
          <circle
            cx="80"
            cy="80"
            r={RADIO}
            fill="none"
            stroke="var(--grafico-pista)"
            strokeWidth="20"
          />

          {arcos.map(({ segmento, largo, desfase }) => (
              <circle
                key={segmento.etiqueta}
                cx="80"
                cy="80"
                r={RADIO}
                fill="none"
                stroke={segmento.serie === 1 ? "var(--grafico-1)" : "var(--grafico-2)"}
                strokeWidth="20"
                // El pequeño hueco (2 unidades) separa los segmentos sin
                // necesidad de pintarles un borde del color del fondo, que se
                // rompe apenas la tarjeta cambia de superficie.
                strokeDasharray={`${Math.max(largo - 2, 0)} ${CIRCUNFERENCIA}`}
                strokeDashoffset={desfase}
                // -90° para que el primer segmento arranque arriba y no a las 3.
                transform="rotate(-90 80 80)"
              />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="numero-grande text-2xl text-ink">{total}</span>
          <span className="max-w-24 text-center text-[11px] leading-tight text-ink-3">
            {etiquetaCentro}
          </span>
        </div>
      </div>

      {/* La referencia de colores es también la tabla de datos: cada fila dice
          su nombre, su número y su porcentaje. Así la identidad de cada
          segmento nunca depende solo del color. */}
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {segmentos.map((segmento) => (
          <li key={segmento.etiqueta} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: segmento.serie === 1 ? "var(--grafico-1)" : "var(--grafico-2)",
              }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{segmento.etiqueta}</span>
            <span className="numero shrink-0 text-sm font-semibold text-ink">{segmento.valor}</span>
            <span className="numero w-11 shrink-0 text-right text-sm text-ink-3">
              {Math.round((segmento.valor / suma) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ============================================================
// Tabla equivalente
// ============================================================
//
// La misma información en texto, para lector de pantalla, para imprimir, y para
// cuando alguien quiere el número exacto y no la forma de la curva.

function TablaEquivalente({ datos, titulo }: { datos: PuntoGrafico[]; titulo: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-3">Ver los números</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{titulo}</caption>
          <tbody>
            {datos.map((punto) => (
              <tr key={punto.etiqueta} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-1.5 text-left font-normal text-ink-2">
                  {punto.etiquetaLarga ?? punto.etiqueta}
                </th>
                <td className="numero py-1.5 text-right font-semibold text-ink">
                  {punto.valorFormateado}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
