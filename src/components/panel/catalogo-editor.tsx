"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ETIQUETA_ESPECIE,
  normalizarTermino,
  type ProductoDelCatalogo,
} from "@/lib/panel/catalogo";
import { nombreDeFamilia } from "@/lib/panel/productos";
import { Etiqueta, EstadoVacio, Tarjeta, clasesBoton } from "./ui";
import { IconoBuscar } from "./iconos";
import {
  accionAgregarSinonimo,
  accionAlternarActivo,
  accionBorrarProducto,
  accionCrearProducto,
  accionGuardarAlias,
  accionQuitarSinonimo,
  accionResolverColision,
  type ResultadoCatalogo,
} from "@/app/panel/(interno)/catalogo/acciones";

// El catálogo, editable por el carnicero.
//
// Tres cosas y ninguna más:
//   - El TILDE de lo que comercializa. Apagar un producto lo saca del prompt
//     del bot en el mensaje siguiente: deja de existir para el cliente sin
//     borrar nada y sin perder su historia de stock.
//   - Los SINÓNIMOS: cómo lo llaman en el mostrador. El nombre del sistema
//     (`codigo` y `nombre_display`) no se toca nunca.
//   - El ALTA de productos propios, para lo que no vino de fábrica.

type Filtro = "todos" | "activos" | "inactivos" | "vacuno" | "porcino" | "aviar";

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "activos", etiqueta: "Los que vendo" },
  { valor: "inactivos", etiqueta: "Apagados" },
  { valor: "vacuno", etiqueta: "Vacuno" },
  { valor: "porcino", etiqueta: "Cerdo" },
  { valor: "aviar", etiqueta: "Pollo" },
];

type Colision = NonNullable<ResultadoCatalogo["colision"]>;

export function CatalogoEditor({ productos }: { productos: ProductoDelCatalogo[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aviso, setAviso] = useState<ResultadoCatalogo | null>(null);
  const [colision, setColision] = useState<Colision | null>(null);

  const visibles = useMemo(() => {
    const termino = normalizarTermino(busqueda);
    return productos.filter((producto) => {
      if (termino) {
        const enNombre = normalizarTermino(producto.nombre).includes(termino);
        const enAlias = producto.alias ? normalizarTermino(producto.alias).includes(termino) : false;
        const enSinonimos = producto.sinonimos.some((s) =>
          normalizarTermino(s.texto).includes(termino)
        );
        if (!enNombre && !enAlias && !enSinonimos && !producto.codigo.includes(termino)) return false;
      }
      switch (filtro) {
        case "activos":
          return producto.activo;
        case "inactivos":
          return !producto.activo;
        case "vacuno":
        case "porcino":
        case "aviar":
          return producto.especie === filtro;
        default:
          return true;
      }
    });
  }, [productos, busqueda, filtro]);

  return (
    <div className="flex flex-col gap-4">
      {aviso && (
        <div
          className={`rounded-tarjeta border px-4 py-3 text-sm ${
            aviso.ok
              ? "border-border bg-surface-2 text-ink-2"
              : "border-danger/40 bg-surface-2 text-ink"
          }`}
          role="status"
        >
          {aviso.mensaje}
        </div>
      )}

      {colision && (
        <DialogoColision
          colision={colision}
          onCerrar={() => setColision(null)}
          onResuelto={(resultado) => {
            setColision(null);
            setAviso(resultado);
          }}
        />
      )}

      <label className="relative block">
        <span className="sr-only">Buscar un producto</span>
        <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre o por cómo lo llaman"
          className="min-h-12 w-full rounded-tarjeta border border-border bg-surface pl-11 pr-3 text-base text-ink placeholder:text-ink-3"
        />
      </label>

      <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {FILTROS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => setFiltro(opcion.valor)}
              className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-sm ${
                filtro === opcion.valor
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border bg-surface text-ink-2"
              }`}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="No encontré nada con eso"
            descripcion="Probá con otra palabra, o sacá el filtro."
          />
        </Tarjeta>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((producto) => (
            <FilaProducto
              key={producto.id}
              producto={producto}
              onAviso={setAviso}
              onColision={setColision}
            />
          ))}
        </ul>
      )}

      <AltaDeProducto onAviso={setAviso} />
    </div>
  );
}

// ------------------------------------------------------------
// Una fila
// ------------------------------------------------------------

function FilaProducto({
  producto,
  onAviso,
  onColision,
}: {
  producto: ProductoDelCatalogo;
  onAviso: (resultado: ResultadoCatalogo) => void;
  onColision: (colision: Colision) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nuevoSinonimo, setNuevoSinonimo] = useState("");
  const [editandoAlias, setEditandoAlias] = useState(false);
  const [alias, setAlias] = useState(producto.alias ?? "");

  function correr(accion: (p: null, d: FormData) => Promise<ResultadoCatalogo>, datos: FormData) {
    iniciar(async () => {
      const resultado = await accion(null, datos);
      if (resultado.colision) onColision(resultado.colision);
      onAviso(resultado);
    });
  }

  function alternar() {
    const datos = new FormData();
    datos.set("producto_id", producto.id);
    datos.set("activo", String(!producto.activo));
    correr(accionAlternarActivo, datos);
  }

  function agregarSinonimo() {
    const termino = nuevoSinonimo.trim();
    if (!termino) return;
    const datos = new FormData();
    datos.set("producto_id", producto.id);
    datos.set("termino", termino);
    setNuevoSinonimo("");
    correr(accionAgregarSinonimo, datos);
  }

  function guardarAlias() {
    const datos = new FormData();
    datos.set("producto_id", producto.id);
    datos.set("alias", alias);
    setEditandoAlias(false);
    correr(accionGuardarAlias, datos);
  }

  return (
    <li>
      {/* La tarjeta no trae relleno propio: sin este padding, el tilde, la
          etiqueta y el "Llamarlo de otra forma" quedaban pegados al borde (se
          veía "mal encuadrado", 21/09). */}
      <Tarjeta>
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={alternar}
                disabled={pendiente}
                aria-pressed={producto.activo}
                aria-label={producto.activo ? `Dejar de vender ${producto.nombre}` : `Vender ${producto.nombre}`}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm ${
                  producto.activo
                    ? "border-brand bg-brand text-brand-contraste"
                    : "border-border bg-surface text-ink-3"
                }`}
              >
                {producto.activo ? "✓" : ""}
              </button>

              <div className="flex flex-col gap-1">
                <p className={`text-base ${producto.activo ? "text-ink" : "text-ink-3 line-through"}`}>
                  {producto.alias ?? producto.nombre}
                </p>
                <p className="text-xs text-ink-3">
                  {producto.alias ? `En el sistema: ${producto.nombre} · ` : ""}
                  {nombreDeFamilia(producto.familia)} · {producto.unidad}
                  {producto.tienePadre ? " · sale de otro corte" : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {producto.especie && <Etiqueta tono="neutro">{ETIQUETA_ESPECIE[producto.especie]}</Etiqueta>}
              {producto.pctEnTabla !== null && (
                // El porcentaje de un corte de pollo es del POLLO trozado, no de
                // una media res: decir "de la media res" en la carcasa de pollo
                // era mezclar dos cosas que no tienen nada que ver.
                <Etiqueta tono="marca">
                  {producto.pctEnTabla.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %{" "}
                  {producto.especie === "aviar" ? "del pollo" : producto.especie === "porcino" ? "de la media res de cerdo" : "de la media res"}
                </Etiqueta>
              )}
              {producto.esPropio && <Etiqueta tono="neutro">Tuyo</Etiqueta>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {producto.sinonimos.map((sinonimo) => (
              <span
                key={sinonimo.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-ink-2"
              >
                {sinonimo.texto}
                <button
                  type="button"
                  aria-label={`Sacar "${sinonimo.texto}"`}
                  disabled={pendiente}
                  onClick={() => {
                    const datos = new FormData();
                    datos.set("sinonimo_id", sinonimo.id);
                    correr(accionQuitarSinonimo, datos);
                  }}
                  className="text-ink-3 hover:text-ink"
                >
                  ×
                </button>
              </span>
            ))}

            <input
              type="text"
              value={nuevoSinonimo}
              onChange={(evento) => setNuevoSinonimo(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  agregarSinonimo();
                }
              }}
              placeholder="+ cómo lo llaman"
              className="min-h-10 flex-1 rounded-full border border-dashed border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
            />
          </div>

          {editandoAlias ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={alias}
                onChange={(evento) => setAlias(evento.target.value)}
                placeholder={producto.nombre}
                className="min-h-10 flex-1 rounded-tarjeta border border-border bg-surface px-3 text-sm text-ink"
              />
              <button type="button" onClick={guardarAlias} className={clasesBoton("principal")} disabled={pendiente}>
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlias(producto.alias ?? "");
                  setEditandoAlias(false);
                }}
                className={clasesBoton("secundario")}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setEditandoAlias(true)}
                className="text-sm text-ink-3 underline underline-offset-4 hover:text-ink"
              >
                {producto.alias ? "Cambiar cómo lo llamás" : "Llamarlo de otra forma"}
              </button>
              {producto.esPropio && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => {
                    const datos = new FormData();
                    datos.set("producto_id", producto.id);
                    correr(accionBorrarProducto, datos);
                  }}
                  className="text-sm text-ink-3 underline underline-offset-4 hover:text-ink"
                >
                  Borrar
                </button>
              )}
            </div>
          )}
        </div>
      </Tarjeta>
    </li>
  );
}

// ------------------------------------------------------------
// La colisión
// ------------------------------------------------------------
//
// Tu ejemplo: "roast beef muchos lo llaman aguja" — pero `aguja` ya es otro
// producto del catálogo. Si se guardara igual, quedarían dos productos activos
// reclamando la misma palabra y el bot resolvería con el que encuentre primero.
// Nadie se entera hasta que descontó stock del corte equivocado.
//
// La opción (a) va PRIMERA porque suele ser la correcta: si para ese carnicero
// son el mismo corte, lo que corresponde no es un sinónimo, es apagar uno.

function DialogoColision({
  colision,
  onCerrar,
  onResuelto,
}: {
  colision: Colision;
  onCerrar: () => void;
  onResuelto: (resultado: ResultadoCatalogo) => void;
}) {
  const [pendiente, iniciar] = useTransition();

  function resolver(opcion: "reemplazar" | "ambiguo") {
    const datos = new FormData();
    // `productoIdDestino` es al que se le está agregando el sinónimo;
    // `productoId` es el que ya tenía la palabra. Si se invierten, se apaga el
    // producto equivocado.
    datos.set("producto_id", colision.productoIdDestino);
    datos.set("otro_producto_id", colision.productoId);
    datos.set("termino", colision.termino);
    datos.set("opcion", opcion);
    iniciar(async () => {
      onResuelto(await accionResolverColision(null, datos));
    });
  }

  return (
    <Tarjeta>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="text-base text-ink">
          «{colision.termino}» ya significa <strong>{colision.nombre}</strong> en tu catálogo.
        </p>
        <p className="text-sm text-ink-2">
          Si los dos quedan activos con la misma palabra, el bot va a elegir uno de los dos sin
          avisarte — y te puede descontar stock del corte equivocado.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => resolver("reemplazar")}
            className={clasesBoton("principal")}
          >
            Son el mismo corte: apagá {colision.nombre}
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => resolver("ambiguo")}
            className={clasesBoton("secundario")}
          >
            Son distintos: que el bot pregunte
          </button>
          <button type="button" onClick={onCerrar} className={clasesBoton("secundario")}>
            Dejalo como está
          </button>
        </div>
      </div>
    </Tarjeta>
  );
}

// ------------------------------------------------------------
// Dar de alta algo que no vino de fábrica
// ------------------------------------------------------------

function AltaDeProducto({ onAviso }: { onAviso: (resultado: ResultadoCatalogo) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("secundario")}>
        Agregar un producto que no está
      </button>
    );
  }

  return (
    <Tarjeta>
      <form
        action={(datos: FormData) => {
          iniciar(async () => {
            const resultado = await accionCrearProducto(null, datos);
            onAviso(resultado);
            if (resultado.ok) setAbierto(false);
          });
        }}
        className="flex flex-col gap-3 px-4 py-4 sm:px-5"
      >
        <p className="text-sm text-ink-2">
          El nombre que pongas acá es el que va a usar el sistema. Después podés agregarle todos los
          sinónimos que quieras.
        </p>
        <input
          name="nombre"
          required
          placeholder="Nombre del producto"
          className="min-h-12 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
        />
        <div className="flex flex-wrap gap-3">
          <select
            name="especie"
            defaultValue=""
            className="min-h-12 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
          >
            <option value="">Sin especie</option>
            <option value="vacuno">Vacuno</option>
            <option value="porcino">Cerdo</option>
            <option value="aviar">Pollo</option>
          </select>
          <select
            name="unidad"
            defaultValue="kg"
            className="min-h-12 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
          >
            <option value="kg">Por kilo</option>
            <option value="unidad">Por unidad</option>
            <option value="docena">Por docena</option>
            <option value="bolsa">Por bolsa</option>
          </select>
          <input
            name="familia"
            placeholder="Familia (opcional)"
            className="min-h-12 flex-1 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            Crear
          </button>
          <button type="button" onClick={() => setAbierto(false)} className={clasesBoton("secundario")}>
            Cancelar
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}
