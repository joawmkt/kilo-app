"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ETIQUETA_ESTADO_STOCK,
  ETIQUETA_ORIGEN_STOCK,
  TONO_ESTADO_STOCK,
  estadoDeStock,
  nombreDeFamilia,
  type EstadoStock,
  type ProductoDelPanel,
} from "@/lib/panel/productos";
import { Etiqueta, EstadoVacio, clasesBoton } from "./ui";
import { IconoBuscar, IconoMicrofono, IconoPantalla } from "./iconos";
import { formatearNumero, formatearPesos, formatearRelativo } from "@/lib/panel/formatos";
import { accionActualizarPrecio, accionActualizarStock } from "@/app/panel/(interno)/acciones";

// Stock y precios.
//
// La voz sigue siendo la interfaz principal para cargar stock: esta pantalla
// existe para VER el estado y CORREGIR un error puntual sin tener que grabar de
// nuevo. Por eso la edición es in situ — tocar el número, cambiarlo, listo — y
// no un formulario en otra pantalla.

type Filtro = "todos" | "atencion" | "sin_stock" | "poco" | "disponible" | "sin_precio";

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "atencion", etiqueta: "Necesitan atención" },
  { valor: "sin_stock", etiqueta: "Sin stock" },
  { valor: "poco", etiqueta: "Queda poco" },
  { valor: "sin_precio", etiqueta: "Sin precio" },
];

export function TablaStock({
  productos,
  filtroInicial = "todos",
}: {
  productos: ProductoDelPanel[];
  filtroInicial?: Filtro;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);

  const visibles = useMemo(() => {
    const termino = busqueda
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "");

    return productos.filter((producto) => {
      if (termino) {
        const nombre = producto.nombre
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "");
        if (!nombre.includes(termino) && !producto.codigo.includes(termino)) return false;
      }

      switch (filtro) {
        case "atencion":
          return producto.estado !== "disponible";
        case "sin_stock":
          return producto.estado === "sin_stock";
        case "poco":
          return producto.estado === "poco";
        case "disponible":
          return producto.estado === "disponible";
        case "sin_precio":
          return producto.precio === null;
        default:
          return true;
      }
    });
  }, [productos, busqueda, filtro]);

  const porFamilia = useMemo(() => {
    const grupos = new Map<string, ProductoDelPanel[]>();
    for (const producto of visibles) {
      const lista = grupos.get(producto.familia) ?? [];
      lista.push(producto);
      grupos.set(producto.familia, lista);
    }
    return [...grupos.entries()].sort((a, b) =>
      nombreDeFamilia(a[0]).localeCompare(nombreDeFamilia(b[0]), "es")
    );
  }, [visibles]);

  const conteos = useMemo(
    () => ({
      sinStock: productos.filter((p) => p.estado === "sin_stock").length,
      poco: productos.filter((p) => p.estado === "poco").length,
      sinPrecio: productos.filter((p) => p.precio === null).length,
    }),
    [productos]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Búsqueda: puede haber más de cien productos. */}
      <label className="relative block">
        <span className="sr-only">Buscar un producto</span>
        <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar un corte…"
          className="min-h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-3 text-base text-ink placeholder:text-ink-3"
        />
      </label>

      {/* Filtro por estado: ver de un toque qué falta. */}
      <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {FILTROS.map(({ valor, etiqueta }) => {
            const activo = filtro === valor;
            const cantidad =
              valor === "sin_stock"
                ? conteos.sinStock
                : valor === "poco"
                  ? conteos.poco
                  : valor === "sin_precio"
                    ? conteos.sinPrecio
                    : valor === "atencion"
                      ? conteos.sinStock + conteos.poco
                      : productos.length;

            return (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                aria-pressed={activo}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 font-titulo text-sm font-semibold transition-colors ${
                  activo
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {etiqueta}
                <span className="numero text-xs opacity-70">{cantidad}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EstadoVacio
            titulo="No encontramos nada"
            descripcion={
              busqueda
                ? `Ningún producto coincide con "${busqueda}". Probá con otra palabra.`
                : "No hay productos en este filtro."
            }
            accion={
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  setFiltro("todos");
                }}
                className={clasesBoton("secundario")}
              >
                Ver todos
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {porFamilia.map(([familia, lista]) => (
            <section key={familia} className="rounded-xl border border-border bg-surface shadow-tarjeta">
              <h3 className="border-b border-border px-4 py-2.5 font-titulo text-sm font-semibold uppercase tracking-wide text-ink-3">
                {nombreDeFamilia(familia)}
              </h3>
              <ul>
                {lista.map((producto) => (
                  <FilaProducto key={producto.id} producto={producto} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Una fila = un producto, con sus dos números editables
// ============================================================

function FilaProducto({ producto }: { producto: ProductoDelPanel }) {
  // Estado local para que el número se actualice ya mismo al guardar, sin
  // esperar a que vuelva la página entera del servidor.
  const [stock, setStock] = useState(producto.stock);
  const [precio, setPrecio] = useState<number | null>(producto.precio);
  const [origen, setOrigen] = useState(producto.stockOrigen);
  const [error, setError] = useState<string | null>(null);

  const estado = estadoDeStock(stock, producto.umbralEfectivo);

  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-titulo text-sm font-semibold text-ink">{producto.nombre}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          <EtiquetaEstado estado={estado} />
          {producto.stockActualizadoAt ? (
            <span className="flex items-center gap-1">
              {origen === "audio" ? (
                <IconoMicrofono className="h-3.5 w-3.5" />
              ) : origen === "panel" ? (
                <IconoPantalla className="h-3.5 w-3.5" />
              ) : null}
              {origen ? ETIQUETA_ORIGEN_STOCK[origen] : "Actualizado"}{" "}
              {formatearRelativo(producto.stockActualizadoAt)}
            </span>
          ) : null}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <CampoNumero
          etiqueta={`Stock de ${producto.nombre}`}
          sufijo={producto.unidad === "kg" ? "kg" : "u."}
          valor={stock}
          decimales={producto.unidad === "kg" ? 2 : 0}
          onGuardar={async (nuevo) => {
            // El stock nunca puede quedar vacío (a diferencia del precio):
            // "sin stock" es cero, no es la ausencia de un dato.
            if (nuevo === null) return false;

            const resultado = await accionActualizarStock(producto.id, nuevo);
            if (resultado.ok) {
              setStock(nuevo);
              setOrigen("panel");
              setError(null);
            } else {
              setError(resultado.mensaje);
            }
            return resultado.ok;
          }}
        />

        <CampoNumero
          etiqueta={`Precio de ${producto.nombre}`}
          prefijo="$"
          valor={precio}
          decimales={0}
          permiteVacio
          ancho="w-32"
          onGuardar={async (nuevo) => {
            const resultado = await accionActualizarPrecio(producto.id, nuevo);
            if (resultado.ok) {
              setPrecio(nuevo);
              setError(null);
            } else {
              setError(resultado.mensaje);
            }
            return resultado.ok;
          }}
        />
      </div>
    </li>
  );
}

function EtiquetaEstado({ estado }: { estado: EstadoStock }) {
  return (
    <Etiqueta tono={TONO_ESTADO_STOCK[estado]} className="px-2 py-0.5">
      {ETIQUETA_ESTADO_STOCK[estado]}
    </Etiqueta>
  );
}

// ============================================================
// Número editable in situ
// ============================================================
//
// Tocar el número, cambiarlo, listo. Se guarda al salir del campo o al apretar
// Enter; Escape cancela. Nada de abrir un formulario en otra pantalla para
// corregir un kilo.

function CampoNumero({
  etiqueta,
  valor,
  onGuardar,
  decimales,
  prefijo,
  sufijo,
  permiteVacio = false,
  ancho = "w-24",
}: {
  etiqueta: string;
  valor: number | null;
  onGuardar: (nuevo: number | null) => Promise<boolean>;
  decimales: number;
  prefijo?: string;
  sufijo?: string;
  permiteVacio?: boolean;
  ancho?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, iniciarTransicion] = useTransition();

  function abrir() {
    setBorrador(valor === null ? "" : String(valor));
    setEditando(true);
  }

  function confirmar() {
    const limpio = borrador.trim().replace(",", ".");

    if (limpio === "") {
      if (!permiteVacio) {
        setEditando(false);
        return;
      }
      iniciarTransicion(async () => {
        await onGuardar(null);
        setEditando(false);
      });
      return;
    }

    const numero = Number(limpio);
    if (!Number.isFinite(numero) || numero < 0) {
      setEditando(false);
      return;
    }

    if (numero === valor) {
      setEditando(false);
      return;
    }

    iniciarTransicion(async () => {
      await onGuardar(numero);
      setEditando(false);
    });
  }

  if (editando) {
    return (
      <span className={`relative ${ancho}`}>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          aria-label={etiqueta}
          value={borrador}
          disabled={guardando}
          onChange={(evento) => setBorrador(evento.target.value)}
          onBlur={confirmar}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") confirmar();
            if (evento.key === "Escape") setEditando(false);
          }}
          className="numero min-h-11 w-full rounded-lg border-2 border-brand bg-surface px-2 text-right text-base font-semibold text-ink"
        />
      </span>
    );
  }

  const texto =
    valor === null
      ? "Sin precio"
      : prefijo === "$"
        ? formatearPesos(valor)
        : `${formatearNumero(valor, decimales)}${sufijo ? ` ${sufijo}` : ""}`;

  return (
    <button
      type="button"
      onClick={abrir}
      aria-label={`${etiqueta}: ${texto}. Tocar para cambiar.`}
      className={`numero min-h-11 ${ancho} whitespace-nowrap rounded-lg border border-border bg-surface px-2 text-right font-semibold transition-colors hover:border-brand hover:bg-brand-soft ${
        valor === null ? "text-sm font-normal text-ink-3" : "text-base text-ink"
      } ${guardando ? "opacity-50" : ""}`}
    >
      {texto}
    </button>
  );
}
