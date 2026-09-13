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
  categoria: string;
  proveedor: string | null;
  pesoRecibidoKg: number;
  pesoFacturadoKg: number | null;
  fecha: string;
  estado: string;
  rindeReal: number | null;
  piezasVivas: number;
};

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

export function CargarMediaRes({ categorias }: { categorias: string[] }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    accionCargarMediaRes,
    null
  );
  const formulario = useRef<HTMLFormElement>(null);
  const [mostrarCosto, setMostrarCosto] = useState(false);

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Cargar una media res"
        descripcion="El peso es lo único obligatorio. El resto se puede completar después."
      />

      <form
        ref={formulario}
        action={async (datos) => {
          const resultado = await accion(datos);
          void resultado;
          formulario.current?.reset();
        }}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <select name="categoria" required defaultValue="novillo" className={clasesCampo}>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Peso de tu balanza (kg)" obligatorio>
            <input
              name="peso_recibido_kg"
              type="text"
              inputMode="decimal"
              required
              placeholder="104,6"
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
              placeholder="105"
              className={clasesCampo}
            />
          </Campo>

          <Campo etiqueta="Proveedor">
            <input name="proveedor" type="text" placeholder="Frigorífico…" className={clasesCampo} />
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

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            Se van a crear los cortes estimados según la tabla de rendimiento.
          </p>
          <BotonCargar />
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

function BotonCargar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clasesBoton("principal")}>
      {pending ? "Cargando…" : "Cargar media res"}
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
          titulo="Todavía no cargaste ninguna media res"
          descripcion="Cuando cargues una, acá vas a ver cuánto rindió y cuánto te queda de cada corte."
        />
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <TarjetaEncabezado titulo="Medias reses" descripcion="Una línea por lote." />
      <ul>
        {lotes.map((lote) => (
          <li key={lote.id} className="border-t border-border first:border-t-0">
            <Link
              href={`/panel/stock/medias-reses/${lote.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-titulo text-sm font-semibold text-ink">
                  {lote.categoria.charAt(0).toUpperCase() + lote.categoria.slice(1)} de{" "}
                  {formatearNumero(lote.pesoRecibidoKg)} kg
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
