"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Tarjeta, TarjetaEncabezado, EstadoVacio, Etiqueta, clasesBoton } from "./ui";
import { formatearFecha, formatearNumero } from "@/lib/panel/formatos";
import {
  accionCargarMediaRes,
  accionMarcarAgotado,
  type ResultadoAccion,
} from "@/app/panel/(interno)/stock/medias-reses/acciones";

export type LoteDelPanel = {
  id: string;
  /** Null en cerdo y pollo: la investigación no encontró categorías comerciales. */
  categoria: string | null;
  especie: "vacuno" | "porcino" | "aviar";
  /** Cabezas del cajón. Null donde no aplica. */
  unidades: number | null;
  proveedor: string | null;
  pesoRecibidoKg: number;
  pesoFacturadoKg: number | null;
  fecha: string;
  estado: string;
  rindeReal: number | null;
  piezasVivas: number;
};

/**
 * Cómo se titula un lote en la lista.
 *
 * La categoría solo existe en vacuno: en cerdo no hay categorías comerciales
 * documentadas y en pollo no hay ninguna. Antes esto hacía
 * `lote.categoria.charAt(0)` y con un lote de cerdo reventaba la pantalla.
 */
function tituloDeLote(lote: LoteDelPanel): string {
  const peso = `${formatearNumero(lote.pesoRecibidoKg)} kg`;

  if (lote.especie === "aviar") {
    const cabezas = lote.unidades ? ` de ${lote.unidades} cabezas` : "";
    return `Cajón de pollo${cabezas} · ${peso}`;
  }

  const cabecera =
    lote.especie === "porcino"
      ? "Media res de cerdo"
      : lote.categoria
        ? lote.categoria.charAt(0).toUpperCase() + lote.categoria.slice(1)
        : "Media res";

  return `${cabecera} de ${peso}`;
}

// ============================================================
// Cargar una media res
// ============================================================
//
// La forma de verdad de cargar una media res va a ser por voz ("llegó una media
// res de ciento cuatro kilos"). Esta pantalla existe para el día que el audio no
// se entiende, y para poder probar el circuito completo sin depender de Whisper.
//
// Por eso lo único obligatorio es el peso recibido: todo lo demás se puede
// completar después. Un formulario con ocho campos obligatorios no lo llena
// nadie con las manos frías.

/** Qué entró. Cerdo entero = dos medias (se cargan como dos lotes). */
type TipoEntrada = "vacuno" | "cerdo_media" | "cerdo_entero" | "pollo";

const TIPOS: { valor: TipoEntrada; etiqueta: string }[] = [
  { valor: "vacuno", etiqueta: "Media res vacuna" },
  { valor: "cerdo_media", etiqueta: "Media res de cerdo" },
  { valor: "cerdo_entero", etiqueta: "Cerdo entero (2 medias)" },
  { valor: "pollo", etiqueta: "Cajón de pollo" },
];

export function CargarMediaRes({
  categorias,
  pesoCajonPollo,
}: {
  /** Categorías de vacuno con tabla de rendimiento. Vacío = falta la tabla. */
  categorias: string[];
  /** El peso de cajón de esta carnicería (se usa si no escriben otro). */
  pesoCajonPollo: number;
}) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    accionCargarMediaRes,
    null
  );
  const formulario = useRef<HTMLFormElement>(null);
  const [mostrarCosto, setMostrarCosto] = useState(false);
  const [tipo, setTipo] = useState<TipoEntrada>("vacuno");

  const esVacuno = tipo === "vacuno";
  const esPollo = tipo === "pollo";
  const faltaTabla = esVacuno && categorias.length === 0;

  const pie = esVacuno
    ? "Se van a crear los cortes estimados según la tabla de rendimiento."
    : esPollo
      ? "Se crea un pollo entero por cabeza, con el peso del cajón repartido entre todos."
      : "El lote queda abierto: los cortes nacen cuando lo despostás y cargás los pesos.";

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Cargar lo que entró"
        descripcion={
          esPollo
            ? "Lo único obligatorio es cuántos pollos trae el cajón."
            : "El peso es lo único obligatorio. El resto se puede completar después."
        }
      />

      <form
        ref={formulario}
        action={async (datos) => {
          const resultado = await accion(datos);
          void resultado;
          // El reset vacía los campos pero no cambia "Qué entró" (lo maneja
          // React): si cargás tres cajones seguidos no tenés que volver a elegirlo.
          formulario.current?.reset();
        }}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Qué entró">
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEntrada)}
              className={clasesCampo}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          {esVacuno && categorias.length > 0 ? (
            <Campo etiqueta="Categoría">
              <select name="categoria" required defaultValue="novillo" className={clasesCampo}>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}

          {esPollo ? (
            <Campo etiqueta="Pollos que trae el cajón" obligatorio>
              <input
                name="unidades"
                type="text"
                inputMode="numeric"
                required
                placeholder="8"
                className={clasesCampo}
              />
            </Campo>
          ) : null}

          <Campo
            etiqueta={
              esPollo ? "Peso del cajón (kg)" : tipo === "cerdo_entero" ? "Peso del cerdo entero (kg)" : "Peso de tu balanza (kg)"
            }
            obligatorio={!esPollo}
            ayuda={
              esPollo
                ? `Si lo dejás vacío uso ${formatearNumero(pesoCajonPollo)} kg, el de tus cajones.`
                : tipo === "cerdo_entero"
                  ? "Lo parto en dos medias de la mitad del peso."
                  : undefined
            }
          >
            <input
              name="peso_recibido_kg"
              type="text"
              inputMode="decimal"
              required={!esPollo}
              placeholder={esPollo ? formatearNumero(pesoCajonPollo) : esVacuno ? "104,6" : tipo === "cerdo_entero" ? "90" : "45"}
              className={clasesCampo}
            />
          </Campo>

          <Campo
            etiqueta="Peso del remito (kg)"
            ayuda="Si es distinto al de tu balanza, te aviso. Esa diferencia es plata."
          >
            <input
              name="peso_facturado_kg"
              type="text"
              inputMode="decimal"
              placeholder={esVacuno ? "105" : ""}
              className={clasesCampo}
            />
          </Campo>

          <Campo etiqueta="Proveedor">
            <input
              name="proveedor"
              type="text"
              placeholder={esPollo ? "Granja…" : "Frigorífico…"}
              className={clasesCampo}
            />
          </Campo>
        </div>

        {mostrarCosto ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Lo que pagaste ($)"
              ayuda="Solo se puede anotar ahora: después no se reconstruye."
            >
              <input
                name="costo_mercaderia"
                type="text"
                inputMode="decimal"
                placeholder="500000"
                className={clasesCampo}
              />
            </Campo>
            <Campo etiqueta="Flete ($)">
              <input name="costo_flete" type="text" inputMode="decimal" className={clasesCampo} />
            </Campo>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMostrarCosto(true)}
            className="self-start text-sm font-semibold text-brand"
          >
            + Agregar lo que pagaste
          </button>
        )}

        {faltaTabla ? (
          <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-ink-2">
            Para vacuno falta la tabla de rendimiento: sin ella no puedo repartir los kilos en cortes, y
            prefiero no cargar nada antes que inventar porcentajes. Corré la migración{" "}
            <code>0024_tablas_rendimiento_semilla.sql</code> en Supabase. Cerdo y pollo se pueden cargar igual.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-3">{pie}</p>
          <BotonCargar deshabilitado={faltaTabla} texto={esPollo ? "Cargar cajón" : "Cargar"} />
        </div>

        {estado ? (
          <p
            role="status"
            className={`rounded-control px-3 py-2 text-sm ${
              estado.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {estado.mensaje}
          </p>
        ) : null}
      </form>
    </Tarjeta>
  );
}

function BotonCargar({ deshabilitado, texto }: { deshabilitado: boolean; texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || deshabilitado} className={clasesBoton("principal")}>
      {pending ? "Cargando…" : texto}
    </button>
  );
}

// ============================================================
// La lista de lotes
// ============================================================

export function ListaDeLotes({ lotes }: { lotes: LoteDelPanel[] }) {
  if (lotes.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no cargaste nada"
          descripcion="Cuando cargues una, acá vas a ver cuánto rindió y cuánto te queda de cada corte."
        />
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <TarjetaEncabezado titulo="Lotes" descripcion="Una línea por media res o cajón." />
      <ul>
        {lotes.map((lote) => (
          <li key={lote.id} className="border-t border-border first:border-t-0">
            <Link
              href={`/panel/stock/medias-reses/${lote.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-titulo text-sm font-semibold text-ink">
                  {tituloDeLote(lote)}
                </span>
                <span className="block truncate text-xs text-ink-3">
                  {formatearFecha(lote.fecha)}
                  {lote.proveedor ? ` · ${lote.proveedor}` : ""}
                  {lote.estado === "abierta" ? ` · ${lote.piezasVivas} cortes con stock` : ""}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                <Etiqueta tono={lote.estado === "abierta" ? "atencion" : "neutro"}>
                  {lote.estado === "abierta" ? "Abierta" : "Cerrada"}
                </Etiqueta>
                {lote.rindeReal !== null ? (
                  <span className="numero text-sm text-ink-2">Rinde {lote.rindeReal} %</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// ============================================================
// "Se acabó"
// ============================================================
//
// Un toque. Pone en cero los kilos de ese corte y, de paso, mide: comparando lo
// que salió de la pieza contra lo que la tabla había estimado, el sistema
// aprende — sin que nadie haya pesado nada de más, porque la balanza del
// mostrador ya estaba pesando igual.

export function BotonSeAcabo({
  productoId,
  nombre,
}: {
  productoId: string;
  nombre: string;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<ResultadoAccion | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciarTransicion(async () => {
            setMensaje(await accionMarcarAgotado(productoId));
          })
        }
        className={clasesBoton("fantasma")}
        aria-label={`Marcar que se acabó ${nombre}`}
      >
        {pendiente ? "…" : "Se acabó"}
      </button>
      {mensaje ? (
        <span className={`text-xs ${mensaje.ok ? "text-ink-2" : "text-danger"}`}>
          {mensaje.mensaje}
        </span>
      ) : null}
    </span>
  );
}

const clasesCampo =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3";

function Campo({
  etiqueta,
  ayuda,
  obligatorio = false,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  obligatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-titulo text-sm font-semibold text-ink">
        {etiqueta}
        {obligatorio ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {ayuda ? <span className="text-xs text-ink-3">{ayuda}</span> : null}
    </label>
  );
}
