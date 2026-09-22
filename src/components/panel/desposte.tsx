"use client";

import { useState, useTransition } from "react";
import { Tarjeta, TarjetaEncabezado, EstadoVacio, clasesBoton, Etiqueta } from "./ui";
import {
  accionCargarDesposte,
  accionTerminarDesposte,
  accionTrozar,
  type ResultadoDesposte,
} from "@/app/panel/(interno)/stock/desposte/acciones";

// Desposte pesado y trozado.
//
// POR QUÉ ESTA PANTALLA EXISTE, Y POR QUÉ NO ES LA DEL VACUNO
//
// El vacuno tiene tabla: al cargar la media res ya nacen los 28 cortes
// estimados y nadie pesa nada. El cerdo NO tiene tabla — las dos únicas
// fuentes que existen discrepan 1,89× justo en jamón y paleta, que entre los
// dos son el 47,4 % de la canal — así que sus piezas nacen acá, con el peso de
// la balanza.
//
// Y eso no es un peor servicio: sobre una media res de cerdo de 42 kg son ~12
// piezas, una o dos veces por semana. Lo que se descartó en vacuno era pesar
// 28 cortes todos los días. A los 10 despostes, estas pesadas SON la tabla de
// rendimiento de esta carnicería, con `origen = 'calibrado'` desde el día uno.

export type LoteAbierto = {
  id: string;
  etiqueta: string;
  especie: "vacuno" | "porcino" | "aviar";
  pesoKg: number;
  /** Lo que ya se pesó de esta media res en despostes anteriores. */
  despostadoKg: number;
  /** Lo que le queda por despostar: pesoKg − despostadoKg. */
  restanteKg: number;
  /** Los cortes que ya se cargaron, para mostrarlos (y que no se repitan). */
  cargados: { nombre: string; kg: number }[];
  /** Solo los cortes que TODAVÍA no se cargaron de esta media res. */
  sugeridos: { codigo: string; nombre: string; esSubproducto: boolean }[];
};

export type PrecargaPollo = {
  unidadesSugeridas: number;
  kgPorUnidad: number | null;
  salidas: { codigo: string; nombre: string; pct: number; esSubproducto: boolean }[];
  enStock: number;
};

export function PantallaDesposte({
  lotes,
  precargaPollo,
}: {
  lotes: LoteAbierto[];
  precargaPollo: PrecargaPollo | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <FormularioDesposte lotes={lotes} />
      {precargaPollo && <FormularioTrozado precarga={precargaPollo} />}
    </div>
  );
}

/** "2,5" o "2.5" -> 2.5. Vacío o basura -> 0. */
function aNumero(valor: string): number {
  const n = Number(valor.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function kg(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Margen de la balanza: igual que en el servidor (lotes.ts).
const MARGEN_BALANZA = 1.02;

// ------------------------------------------------------------
// Desposte de un lote
// ------------------------------------------------------------
//
// Se puede despostar DE A PARTES (pedido del fundador, 21/09): hoy el
// matambre, mañana el resto. Cada vez que se guarda, esos cortes entran al
// stock, se descuentan de lo que le queda a la media res y desaparecen de la
// lista de ESA media res. Cuando termina, "Terminé de despostar" cierra la
// media res y lo que no se pesó queda anotado como hueso y merma.

function FormularioDesposte({ lotes }: { lotes: LoteAbierto[] }) {
  const [loteId, setLoteId] = useState(lotes[0]?.id ?? "");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoDesposte | null>(null);
  const [pendiente, iniciar] = useTransition();

  const lote = lotes.find((l) => l.id === loteId) ?? lotes[0] ?? null;

  if (lotes.length === 0 || !lote) {
    return (
      <Tarjeta>
        <EstadoVacio
          titulo="No hay lotes esperando desposte"
          descripcion="Cuando cargues una media res de cerdo, va a aparecer acá para que le pongas los pesos."
        />
      </Tarjeta>
    );
  }

  const cargandoAhora = Object.values(valores).reduce((suma, v) => suma + aNumero(v), 0);
  const seVaDelPeso = cargandoAhora > lote.restanteKg * MARGEN_BALANZA;

  return (
    <Tarjeta>
      <TarjetaEncabezado
        titulo="Cargar un desposte"
        descripcion="Pesá lo que separaste y ponelo acá. Podés hacerlo de a partes: lo que no pesaste, dejalo vacío."
      />
      <form
        action={(datos: FormData) => {
          iniciar(async () => {
            const r = await accionCargarDesposte(null, datos);
            setResultado(r);
            if (r.ok) setValores({});
          });
        }}
        className="flex flex-col gap-4 px-4 py-4 sm:px-5"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-2">¿De qué lote?</span>
          <select
            name="lote_id"
            value={lote.id}
            onChange={(evento) => {
              setLoteId(evento.target.value);
              setValores({});
              setResultado(null);
            }}
            className="min-h-12 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
          >
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 rounded-tarjeta bg-surface-2 px-3 py-3 text-sm">
          <span className="text-ink">
            Entraron <strong>{kg(lote.pesoKg)} kg</strong>
            {lote.despostadoKg > 0 && (
              <>
                {" "}· ya despostaste {kg(lote.despostadoKg)} kg · <strong>quedan {kg(lote.restanteKg)} kg</strong>
              </>
            )}
          </span>
          {lote.cargados.length > 0 && (
            <span className="text-ink-3">
              Ya cargados: {lote.cargados.map((c) => `${c.nombre} ${kg(c.kg)} kg`).join(" · ")}
            </span>
          )}
        </div>

        {lote.sugeridos.length === 0 ? (
          <p className="text-sm text-ink-2">Ya cargaste todos los cortes de esta media res.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {lote.sugeridos.map((producto) => (
              <FilaPeso
                key={`${lote.id}-${producto.codigo}`}
                producto={producto}
                valor={valores[producto.codigo] ?? ""}
                onCambio={(v) => setValores((previo) => ({ ...previo, [producto.codigo]: v }))}
              />
            ))}
          </div>
        )}

        {cargandoAhora > 0 && (
          <p className={`text-sm ${seVaDelPeso ? "text-danger" : "text-ink-3"}`} role="status">
            {seVaDelPeso
              ? `Eso suma ${kg(cargandoAhora)} kg y a esta media res le quedan ${kg(lote.restanteKg)} kg. Revisá los pesos.`
              : `Estás cargando ${kg(cargandoAhora)} kg. Van a quedar ${kg(Math.max(0, lote.restanteKg - cargandoAhora))} kg por despostar.`}
          </p>
        )}

        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-ink-2" : "text-danger"}`} role="status">
            {resultado.mensaje}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={pendiente || cargandoAhora === 0 || seVaDelPeso}
            className={clasesBoton("principal", "sm:flex-1")}
          >
            {pendiente ? "Guardando..." : "Guardar lo que pesé"}
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              iniciar(async () => setResultado(await accionTerminarDesposte(lote.id)));
            }}
            className={clasesBoton("secundario")}
          >
            Terminé de despostar
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}

// ------------------------------------------------------------
// Trozado de pollo
// ------------------------------------------------------------
//
// Bug del 21/09: los pesos se precargaban una sola vez, para la cantidad
// sugerida (6 pollos). El carnicero cambió a 3 y los números se quedaron en
// los de 6: guardó 14,8 kg de presas saliendo de 7,5 kg de pollo. Ahora cada
// fila sigue a la cantidad de pollos MIENTRAS el carnicero no la toque; la que
// toca, queda con su número. Y si la suma se pasa de lo que entró, no deja
// guardar (el servidor tampoco lo acepta).

function FormularioTrozado({ precarga }: { precarga: PrecargaPollo }) {
  const [unidades, setUnidades] = useState(String(precarga.unidadesSugeridas));
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoDesposte | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cantidad = Math.max(0, Math.floor(Number(unidades) || 0));
  const kgEntrada = precarga.kgPorUnidad ? cantidad * precarga.kgPorUnidad : 0;
  const sePasaDelStock = cantidad > precarga.enStock;

  const sugerido = (pct: number) =>
    precarga.kgPorUnidad ? String(Math.round(kgEntrada * (pct / 100) * 1000) / 1000) : "";

  const valorDe = (salida: PrecargaPollo["salidas"][number]) => editados[salida.codigo] ?? sugerido(salida.pct);
  const suma = precarga.salidas.reduce((total, salida) => total + aNumero(valorDe(salida)), 0);
  const sePasaDelPeso = kgEntrada > 0 && suma > kgEntrada * MARGEN_BALANZA;

  return (
    <Tarjeta>
      <TarjetaEncabezado
        titulo="Trozar pollos para la vitrina"
        descripcion="Los números vienen precargados con lo que te viene saliendo. Corregí el que no dio: cada corrección tuya reemplaza a la referencia."
        accion={<Etiqueta tono="neutro">{precarga.enStock} enteros en stock</Etiqueta>}
      />
      <form
        action={(datos: FormData) => {
          iniciar(async () => {
            const r = await accionTrozar(null, datos);
            setResultado(r);
            if (r.ok) setEditados({});
          });
        }}
        className="flex flex-col gap-4 px-4 py-4 sm:px-5"
      >
        <input type="hidden" name="especie" value="aviar" />

        <label className="flex flex-col gap-1">
          <span className="text-sm text-ink-2">¿Cuántos pollos trozaste?</span>
          <input
            name="unidades"
            inputMode="numeric"
            value={unidades}
            onChange={(evento) => setUnidades(evento.target.value)}
            className="min-h-12 w-32 rounded-tarjeta border border-border bg-surface px-3 text-base text-ink"
          />
        </label>

        {sePasaDelStock ? (
          <p className="text-sm text-danger">Tenés {precarga.enStock} pollos enteros en stock.</p>
        ) : kgEntrada > 0 ? (
          <p className="text-sm text-ink-3">
            Son unos {kg(kgEntrada)} kg de entrada. Ojo: se trozan los que se vencen primero.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {precarga.salidas.map((salida) => (
            <FilaPeso
              key={salida.codigo}
              producto={salida}
              valor={valorDe(salida)}
              onCambio={(v) => setEditados((previo) => ({ ...previo, [salida.codigo]: v }))}
            />
          ))}
        </div>

        {kgEntrada > 0 && (
          <p className={`text-sm ${sePasaDelPeso ? "text-danger" : "text-ink-3"}`} role="status">
            {sePasaDelPeso
              ? `Las presas suman ${kg(suma)} kg y entraron ${kg(kgEntrada)} kg. No puede salir más de lo que entró.`
              : `Las presas suman ${kg(suma)} kg de ${kg(kgEntrada)} kg (merma ${kg(Math.max(0, kgEntrada - suma))} kg).`}
          </p>
        )}

        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-ink-2" : "text-danger"}`} role="status">
            {resultado.mensaje}
          </p>
        )}

        <button
          type="submit"
          disabled={pendiente || sePasaDelPeso || sePasaDelStock || cantidad === 0}
          className={clasesBoton("principal")}
        >
          {pendiente ? "Guardando..." : "Guardar el trozado"}
        </button>
      </form>
    </Tarjeta>
  );
}

// ------------------------------------------------------------

function FilaPeso({
  producto,
  valor,
  onCambio,
}: {
  producto: { codigo: string; nombre: string; esSubproducto: boolean };
  valor: string;
  onCambio: (valor: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {producto.nombre}
        {producto.esSubproducto && <span className="text-ink-3"> · subproducto</span>}
      </span>
      <input
        name={`kg_${producto.codigo}`}
        inputMode="decimal"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        placeholder="kg"
        className="min-h-11 w-28 rounded-tarjeta border border-border bg-surface px-3 text-right text-base text-ink"
      />
      {producto.esSubproducto && (
        <input type="hidden" name={`sub_${producto.codigo}`} value="true" />
      )}
    </div>
  );
}
