"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GRUPOS_ESPECIE,
  armarRecomendacion,
  grupoDeEspecie,
  sinNadaParaOcasion,
  type OcasionConcreta,
  type TablaOcasiones,
} from "@/lib/recomendaciones";
import { nombreDeFamilia } from "@/lib/panel/productos";
import { Etiqueta, Tarjeta, TarjetaEncabezado, clasesBoton } from "./ui";
import {
  accionGuardarRecomendacion,
  accionRestaurarRecomendacion,
  type ResultadoRecomendacion,
} from "@/app/panel/(interno)/catalogo/recomendaciones/acciones";

// El editor de las recomendaciones del bot.
//
// Una ocasión a la vez (parrilla, horno, milanesas...). Para cada una, dos
// listas: los CORTES que ofrece, en orden, y lo que va PARA ACOMPAÑAR
// (achuras, embutidos, carbón). Abajo, en vivo, cómo contestaría el bot hoy
// con el stock de hoy: así el carnicero ve el efecto de lo que toca antes de
// guardar, sin tener que ir al simulador.

export type ProductoParaTabla = {
  id: string;
  codigo: string;
  nombre_display: string;
  alias_display: string | null;
  familia: string;
  especie: string | null;
  stock_actual: number;
  activo: boolean;
  unidad: string;
};

export type OcasionDelPanel = {
  ocasion: OcasionConcreta;
  titulo: string;
  /** Ids de producto, en orden. */
  cortes: string[];
  acompanan: string[];
};

type Listas = { cortes: string[]; acompanan: string[] };
type Rol = keyof Listas;

const NOMBRE_CORTO: Record<OcasionConcreta, string> = {
  parrilla: "Parrilla",
  horno: "Horno",
  milanesas: "Milanesas",
  olla: "Olla",
  plancha: "Plancha",
  vitel_tone: "Vitel toné",
  picada: "Picada",
  salteado: "Salteado",
};

function iguales(a: Listas, b: Listas): boolean {
  return a.cortes.join() === b.cortes.join() && a.acompanan.join() === b.acompanan.join();
}

function formatearStock(producto: ProductoParaTabla): string {
  const n = producto.stock_actual.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return producto.unidad === "kg" ? `${n} kg` : `${n} ${producto.unidad}`;
}

export function RecomendacionesEditor({
  productos,
  ocasiones,
}: {
  productos: ProductoParaTabla[];
  ocasiones: OcasionDelPanel[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [activa, setActiva] = useState<OcasionConcreta>(ocasiones[0]?.ocasion ?? "parrilla");
  const [aviso, setAviso] = useState<ResultadoRecomendacion | null>(null);
  const [elegido, setElegido] = useState("");

  const originales = useMemo(() => {
    const mapa = {} as Record<OcasionConcreta, Listas>;
    for (const o of ocasiones) mapa[o.ocasion] = { cortes: o.cortes, acompanan: o.acompanan };
    return mapa;
  }, [ocasiones]);
  const [listas, setListas] = useState<Record<OcasionConcreta, Listas>>(originales);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  // Si una ocasión no tiene cambios locales (o se acaban de descartar), se
  // muestra lo guardado.
  const actual = useMemo(
    () => listas[activa] ?? originales[activa] ?? { cortes: [], acompanan: [] },
    [listas, originales, activa]
  );
  const cambiada = !iguales(actual, originales[activa] ?? { cortes: [], acompanan: [] });
  const titulo = ocasiones.find((o) => o.ocasion === activa)?.titulo ?? "";

  // Lo que se puede agregar: productos que vende (activos) y que no estén ya.
  const disponibles = useMemo(() => {
    const usados = new Set([...actual.cortes, ...actual.acompanan]);
    const porFamilia = new Map<string, ProductoParaTabla[]>();
    for (const p of productos) {
      if (!p.activo || usados.has(p.id)) continue;
      const lista = porFamilia.get(p.familia) ?? [];
      lista.push(p);
      porFamilia.set(p.familia, lista);
    }
    return Array.from(porFamilia.entries()).sort(([a], [b]) => nombreDeFamilia(a).localeCompare(nombreDeFamilia(b)));
  }, [productos, actual]);

  // Cómo contestaría el bot HOY, con esta lista y el stock de hoy. Usa la
  // misma función que el bot, así lo que se ve acá es lo que va a decir.
  const vistaPrevia = useMemo(() => {
    const porCodigo = new Map(productos.filter((p) => p.activo).map((p) => [p.codigo, p]));
    const tabla = {} as TablaOcasiones;
    for (const o of ocasiones) {
      const l = listas[o.ocasion] ?? originales[o.ocasion];
      const codigos = (ids: string[]) => ids.map((id) => porId.get(id)?.codigo).filter((c): c is string => Boolean(c));
      tabla[o.ocasion] = { cortes: codigos(l.cortes), acompanan: codigos(l.acompanan) };
    }
    return armarRecomendacion({ ocasion: activa, porCodigo, tabla }) ?? sinNadaParaOcasion(activa);
  }, [productos, ocasiones, listas, originales, activa, porId]);

  function cambiar(nuevas: Listas) {
    setAviso(null);
    setListas((previas) => ({ ...previas, [activa]: nuevas }));
  }

  // Subir o bajar se hace DENTRO de su grupo (vaca, cerdo, pollo): se cambia
  // de lugar con el anterior (o el siguiente) de la misma especie.
  function mover(rol: Rol, indice: number, delta: -1 | 1) {
    const lista = [...actual[rol]];
    const grupo = grupoDe(lista[indice]);
    let destino = indice + delta;
    while (destino >= 0 && destino < lista.length && grupoDe(lista[destino]) !== grupo) destino += delta;
    if (destino < 0 || destino >= lista.length) return;
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
    cambiar({ ...actual, [rol]: lista });
  }

  function grupoDe(id: string) {
    const p = porId.get(id);
    return p ? grupoDeEspecie(p) : "otros";
  }

  function quitar(rol: Rol, id: string) {
    cambiar({ ...actual, [rol]: actual[rol].filter((x) => x !== id) });
  }

  function pasarAlOtro(rol: Rol, id: string) {
    const otro: Rol = rol === "cortes" ? "acompanan" : "cortes";
    cambiar({ ...actual, [rol]: actual[rol].filter((x) => x !== id), [otro]: [...actual[otro], id] });
  }

  function agregar(rol: Rol) {
    if (!elegido) return;
    cambiar({ ...actual, [rol]: [...actual[rol], elegido] });
    setElegido("");
  }

  function guardar() {
    const items = [
      ...actual.cortes.map((productoId) => ({ productoId, rol: "corte" as const })),
      ...actual.acompanan.map((productoId) => ({ productoId, rol: "acompana" as const })),
    ];
    iniciar(async () => {
      const resultado = await accionGuardarRecomendacion(activa, items);
      setAviso(resultado);
      if (resultado.ok) router.refresh();
    });
  }

  function restaurar() {
    iniciar(async () => {
      const resultado = await accionRestaurarRecomendacion(activa);
      setAviso(resultado);
      if (resultado.ok) {
        // La pantalla se recarga con lo guardado; se descarta lo que no se guardó.
        setListas((previas) => {
          const copia = { ...previas };
          delete (copia as Partial<Record<OcasionConcreta, Listas>>)[activa];
          return copia;
        });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Las ocasiones. Un punto marca las que tienen cambios sin guardar. */}
      {/* En el celular se deslizan de costado; en la compu entran todas. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex gap-2 pb-1 sm:flex-wrap" role="tablist" aria-label="Ocasiones">
          {ocasiones.map((o) => {
            const sucia = !iguales(listas[o.ocasion] ?? o, originales[o.ocasion]);
            const seleccionada = o.ocasion === activa;
            return (
              <button
                key={o.ocasion}
                type="button"
                role="tab"
                aria-selected={seleccionada}
                onClick={() => {
                  setActiva(o.ocasion);
                  setAviso(null);
                  setElegido("");
                }}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 font-titulo text-sm font-semibold transition-colors ${
                  seleccionada
                    ? "border-brand bg-brand text-brand-contraste"
                    : "border-border bg-surface text-ink hover:bg-surface-2"
                }`}
              >
                {NOMBRE_CORTO[o.ocasion]}
                {sucia ? <span aria-label="con cambios sin guardar" className="h-1.5 w-1.5 rounded-full bg-warning" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <Tarjeta>
        <TarjetaEncabezado
          titulo={titulo}
          descripcion={`${actual.cortes.length} cortes · ${actual.acompanan.length} para acompañar`}
          accion={
            <button type="button" onClick={restaurar} disabled={pendiente} className={clasesBoton("fantasma")}>
              Volver a la de fábrica
            </button>
          }
        />

        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <p className="text-[13px] text-ink-3">
            Lo que está sin stock se queda en la lista pero el bot no lo nombra hasta que vuelva a haber.
          </p>
          <Lista
            titulo="Lo que ofrece, en este orden"
            vacia="Sin cortes. Agregá abajo lo que querés ofrecer para esta ocasión."
            agrupar
            ids={actual.cortes}
            porId={porId}
            textoPasar="Pasar a acompañar"
            onSubir={(i) => mover("cortes", i, -1)}
            onBajar={(i) => mover("cortes", i, 1)}
            onQuitar={(id) => quitar("cortes", id)}
            onPasar={(id) => pasarAlOtro("cortes", id)}
          />
          <Lista
            titulo="Para acompañar (achuras, embutidos, carbón...)"
            vacia="Nada para acompañar."
            ids={actual.acompanan}
            porId={porId}
            textoPasar="Pasar a los cortes"
            onSubir={(i) => mover("acompanan", i, -1)}
            onBajar={(i) => mover("acompanan", i, 1)}
            onQuitar={(id) => quitar("acompanan", id)}
            onPasar={(id) => pasarAlOtro("acompanan", id)}
          />

          {/* Agregar un producto */}
          <div className="flex flex-col gap-2 rounded-control border border-dashed border-border p-3">
            <label className="font-titulo text-sm font-semibold text-ink" htmlFor="agregar-producto">
              Agregar un producto
            </label>
            <select
              id="agregar-producto"
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink"
            >
              <option value="">Elegí un producto…</option>
              {disponibles.map(([familia, lista]) => (
                <optgroup key={familia} label={nombreDeFamilia(familia)}>
                  {lista.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.alias_display ?? p.nombre_display}
                      {p.stock_actual > 0 ? "" : " (sin stock hoy)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => agregar("cortes")} disabled={!elegido} className={clasesBoton("secundario")}>
                Agregar a lo que ofrece
              </button>
              <button type="button" onClick={() => agregar("acompanan")} disabled={!elegido} className={clasesBoton("secundario")}>
                Agregar para acompañar
              </button>
            </div>
          </div>

          {/* Vista previa con el stock de hoy */}
          <div className="rounded-control bg-surface-2 px-4 py-3">
            <p className="font-titulo text-xs font-semibold text-ink-3">Así contestaría hoy, con el stock de hoy</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{vistaPrevia}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {cambiada ? (
              <button
                type="button"
                onClick={() => cambiar(originales[activa])}
                disabled={pendiente}
                className={clasesBoton("fantasma")}
              >
                Descartar cambios
              </button>
            ) : null}
            <button type="button" onClick={guardar} disabled={!cambiada || pendiente} className={clasesBoton("principal")}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>

          {aviso ? (
            <p
              role="status"
              className={`rounded-control px-3 py-2 text-sm ${
                aviso.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              {aviso.mensaje}
            </p>
          ) : null}
        </div>
      </Tarjeta>
    </div>
  );
}

function Lista({
  titulo,
  vacia,
  ids,
  porId,
  textoPasar,
  onSubir,
  onBajar,
  onQuitar,
  onPasar,
  agrupar = false,
}: {
  titulo: string;
  vacia: string;
  /** Separar por especie: de vaca, de cerdo, de pollo (01/10/2026). */
  agrupar?: boolean;
  ids: string[];
  porId: Map<string, ProductoParaTabla>;
  textoPasar: string;
  onSubir: (indice: number) => void;
  onBajar: (indice: number) => void;
  onQuitar: (id: string) => void;
  onPasar: (id: string) => void;
}) {
  if (agrupar && ids.length > 0) {
    const grupoDe = (id: string) => {
      const p = porId.get(id);
      return p ? grupoDeEspecie(p) : "otros";
    };
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-titulo text-sm font-semibold text-ink">{titulo}</h3>
        {GRUPOS_ESPECIE.map(({ grupo, titulo: tituloGrupo }) => {
          const delGrupo = ids.filter((id) => grupoDe(id) === grupo);
          if (delGrupo.length === 0) return null;
          return (
            <div key={grupo} className="border-l-2 border-border pl-3">
              <Lista
                titulo={tituloGrupo}
                vacia=""
                ids={delGrupo}
                porId={porId}
                textoPasar={textoPasar}
                // Los índices de adentro son del grupo; se traducen a los de la lista entera.
                onSubir={(i) => onSubir(ids.indexOf(delGrupo[i]))}
                onBajar={(i) => onBajar(ids.indexOf(delGrupo[i]))}
                onQuitar={onQuitar}
                onPasar={onPasar}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-titulo text-sm font-semibold text-ink">{titulo}</h3>
      {ids.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{vacia}</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y divide-border rounded-control border border-border">
          {ids.map((id, indice) => {
            const producto = porId.get(id);
            if (!producto) return null;
            const nombre = producto.alias_display ?? producto.nombre_display;
            return (
              <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-5 shrink-0 text-right font-titulo text-xs font-semibold text-ink-3">{indice + 1}</span>
                {/* min-w de 11rem: en el celular, si no entra al lado, los botones
                    bajan a su propia línea en vez de aplastar el nombre. */}
                <span className="flex min-w-[11rem] flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-ink">{nombre}</span>
                  {!producto.activo ? (
                    <Etiqueta tono="problema" className="whitespace-nowrap">Apagado: no se ofrece</Etiqueta>
                  ) : producto.stock_actual > 0 ? (
                    <Etiqueta tono="exito" className="whitespace-nowrap">Hay {formatearStock(producto)}</Etiqueta>
                  ) : (
                    <Etiqueta tono="atencion" className="whitespace-nowrap">Sin stock hoy</Etiqueta>
                  )}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <BotonIcono etiqueta={`Subir ${nombre}`} onClick={() => onSubir(indice)} disabled={indice === 0}>
                    ↑
                  </BotonIcono>
                  <BotonIcono etiqueta={`Bajar ${nombre}`} onClick={() => onBajar(indice)} disabled={indice === ids.length - 1}>
                    ↓
                  </BotonIcono>
                  <BotonIcono etiqueta={`${textoPasar}: ${nombre}`} onClick={() => onPasar(id)}>
                    ⇄
                  </BotonIcono>
                  <BotonIcono etiqueta={`Sacar ${nombre}`} onClick={() => onQuitar(id)} peligro>
                    ✕
                  </BotonIcono>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function BotonIcono({
  etiqueta,
  onClick,
  disabled = false,
  peligro = false,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-control text-base transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        peligro ? "text-danger hover:bg-danger-soft" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
