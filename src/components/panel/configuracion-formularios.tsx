"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Tarjeta, TarjetaEncabezado, clasesBoton } from "./ui";
import { DIAS_SEMANA, formatearFecha, formatearHoraSimple } from "@/lib/panel/formatos";
import {
  agregarDiaEspecial,
  agregarSustituto,
  borrarDiaEspecial,
  borrarPromocion,
  borrarSustituto,
  cambiarEstadoPromocion,
  crearPromocion,
  guardarDatosDelNegocio,
  guardarHorarios,
  guardarMediosPago,
  type ResultadoAccion,
} from "@/app/panel/(interno)/configuracion/acciones";
import { MEDIOS_PAGO } from "@/lib/mediosPago";
import type { CarniceriaDelPanel } from "@/lib/panel/sesion";
import type { FilaDiaEspecial, FilaHorario } from "@/app/panel/(interno)/configuracion/page";

// ============================================================
// Datos del negocio
// ============================================================

export function FormularioDatosDelNegocio({ carniceria }: { carniceria: CarniceriaDelPanel }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    guardarDatosDelNegocio,
    null
  );

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado titulo="Datos de la carnicería" />
      <form action={accion} className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <Campo
          etiqueta="Nombre"
          nombre="nombre_visible"
          valorInicial={carniceria.nombreVisible}
          requerido
        />
        <Campo etiqueta="Dirección" nombre="direccion" valorInicial={carniceria.direccion ?? ""} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Teléfono de contacto"
            nombre="telefono_contacto"
            tipo="tel"
            valorInicial={carniceria.telefonoContacto ?? ""}
          />
          <Campo
            etiqueta="Correo"
            nombre="email_contacto"
            tipo="email"
            valorInicial={carniceria.emailContacto ?? ""}
          />
        </div>

        <Campo
          etiqueta="Avisame cuando un producto baje de"
          nombre="umbral_stock_bajo_default"
          tipo="text"
          modoTeclado="decimal"
          valorInicial={String(carniceria.umbralStockBajoDefault)}
          ayuda="En kilos o unidades, según cómo se cargue cada producto. Se puede ajustar producto por producto más adelante."
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="font-titulo text-sm font-semibold text-ink-2">
            Qué hace el bot con un pedido fuera de horario
          </legend>

          <Opcion
            nombre="horarios_modo"
            valor="hibrido"
            marcado={carniceria.horariosModo === "hibrido"}
            titulo="Lo toma pero avisa"
            descripcion="El bot acepta el pedido, aclara que está fuera de horario y ofrece los horarios disponibles. Vos igual aprobás o rechazás."
          />
          <Opcion
            nombre="horarios_modo"
            valor="bloquea"
            marcado={carniceria.horariosModo === "bloquea"}
            titulo="No lo acepta"
            descripcion="El bot no toma horas de retiro fuera de horario ni en días cerrados. Ojo: si el horario está mal cargado, rechaza pedidos buenos."
          />
          <Opcion
            nombre="horarios_modo"
            valor="informativo"
            marcado={carniceria.horariosModo === "informativo"}
            titulo="Solo informa"
            descripcion="Los horarios son un dato que el bot menciona si le preguntan. Sin ninguna validación."
          />
        </fieldset>

        <PieDeFormulario estado={estado} etiqueta="Guardar datos" />
      </form>
    </Tarjeta>
  );
}

// ============================================================
// Horarios de atención
// ============================================================

export function FormularioHorarios({
  horarios,
  modo,
}: {
  horarios: FilaHorario[];
  modo: CarniceriaDelPanel["horariosModo"];
}) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(guardarHorarios, null);

  const porDia = new Map(horarios.map((horario) => [horario.dia_semana, horario]));

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Horarios de atención"
        descripcion="Mañana y tarde, o un solo turno. Dejá los dos vacíos si abrís corrido."
      />

      <form action={accion} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        {/* Se ordena de lunes a domingo, que es como piensa la semana un
            comercio, aunque en la base el domingo sea el 0. */}
        {[1, 2, 3, 4, 5, 6, 0].map((dia) => (
          <FilaDia key={dia} dia={dia} horario={porDia.get(dia)} />
        ))}

        {modo === "informativo" ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            Ahora mismo estos horarios son solo informativos: el bot los menciona pero no rechaza
            nada. Se cambia arriba, en &ldquo;Datos de la carnicería&rdquo;.
          </p>
        ) : null}

        <PieDeFormulario estado={estado} etiqueta="Guardar horarios" />
      </form>
    </Tarjeta>
  );
}

function FilaDia({ dia, horario }: { dia: number; horario?: FilaHorario }) {
  const [cerrado, setCerrado] = useState(horario?.cerrado ?? false);

  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-titulo text-sm font-semibold text-ink">{DIAS_SEMANA[dia]}</span>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            name={`cerrado_${dia}`}
            defaultChecked={horario?.cerrado ?? false}
            onChange={(evento) => setCerrado(evento.target.checked)}
            className="h-5 w-5 accent-[var(--brand)]"
          />
          Cerrado
        </label>
      </div>

      {!cerrado ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ParDeHoras
            titulo="Mañana"
            nombreDesde={`turno1_desde_${dia}`}
            nombreHasta={`turno1_hasta_${dia}`}
            desde={horario?.turno1_desde}
            hasta={horario?.turno1_hasta}
          />
          <ParDeHoras
            titulo="Tarde"
            nombreDesde={`turno2_desde_${dia}`}
            nombreHasta={`turno2_hasta_${dia}`}
            desde={horario?.turno2_desde}
            hasta={horario?.turno2_hasta}
          />
        </div>
      ) : null}
    </div>
  );
}

function ParDeHoras({
  titulo,
  nombreDesde,
  nombreHasta,
  desde,
  hasta,
}: {
  titulo: string;
  nombreDesde: string;
  nombreHasta: string;
  desde: string | null | undefined;
  hasta: string | null | undefined;
}) {
  return (
    <div>
      <p className="mb-1 font-titulo text-xs font-semibold uppercase tracking-wide text-ink-3">
        {titulo}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="time"
          name={nombreDesde}
          aria-label={`${titulo}, desde`}
          defaultValue={desde ? formatearHoraSimple(desde) : ""}
          className="numero min-h-11 w-full rounded-lg border border-border bg-surface px-2 text-base text-ink"
        />
        <span className="text-ink-3">a</span>
        <input
          type="time"
          name={nombreHasta}
          aria-label={`${titulo}, hasta`}
          defaultValue={hasta ? formatearHoraSimple(hasta) : ""}
          className="numero min-h-11 w-full rounded-lg border border-border bg-surface px-2 text-base text-ink"
        />
      </div>
    </div>
  );
}

// ============================================================
// Días especiales
// ============================================================

export function DiasEspeciales({ dias }: { dias: FilaDiaEspecial[] }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(agregarDiaEspecial, null);
  const [borrando, iniciarTransicion] = useTransition();

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Feriados y cierres"
        descripcion="Días puntuales en que la carnicería no abre. Pisan al horario de la semana."
      />

      <div className="px-4 py-4 sm:px-5">
        {dias.length === 0 ? (
          <p className="text-sm text-ink-2">
            No hay ningún día especial cargado. Los que agregues acá van a aparecer en esta lista.
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
            {dias.map((dia) => (
              <li key={dia.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="numero block text-sm font-semibold text-ink">
                    {formatearFecha(`${dia.fecha}T12:00:00Z`)}
                  </span>
                  {dia.motivo ? (
                    <span className="block truncate text-xs text-ink-3">{dia.motivo}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={borrando}
                  onClick={() => iniciarTransicion(async () => void (await borrarDiaEspecial(dia.id)))}
                  className={clasesBoton("fantasma")}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form action={accion} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5 sm:w-44">
            <span className="font-titulo text-sm font-semibold text-ink-2">Fecha</span>
            <input
              type="date"
              name="fecha"
              required
              className="numero min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink"
            />
          </label>

          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-titulo text-sm font-semibold text-ink-2">Motivo (opcional)</span>
            <input
              type="text"
              name="motivo"
              placeholder="Feriado, vacaciones…"
              className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-3"
            />
          </label>

          <BotonGuardar etiqueta="Agregar" />
        </form>

        {estado ? <Aviso estado={estado} /> : null}
      </div>
    </Tarjeta>
  );
}

// ============================================================
// Medios de pago (especificación del bot, sección 19)
// ============================================================

export function MediosPago({ habilitados }: { habilitados: string[] }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(guardarMediosPago, null);
  const tildados = new Set(habilitados);

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Medios de pago"
        descripcion="Lo único que el bot puede contestar si un cliente pregunta cómo se paga"
      />

      <form action={accion} className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {MEDIOS_PAGO.map((medio) => (
            <label
              key={medio.codigo}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                name="medios_pago"
                value={medio.codigo}
                defaultChecked={tildados.has(medio.codigo)}
                className="h-5 w-5 accent-[var(--brand)]"
              />
              <span className="text-sm font-semibold text-ink">{medio.etiqueta}</span>
            </label>
          ))}
        </div>

        <p className="text-xs text-ink-3">
          Si no tildás ninguno, el bot contesta que se confirma en el local. Nunca inventa un medio de pago.
        </p>

        <div className="flex justify-end">
          <BotonGuardar etiqueta="Guardar medios de pago" />
        </div>

        {estado ? <Aviso estado={estado} /> : null}
      </form>
    </Tarjeta>
  );
}

// ============================================================
// Promociones (especificación del bot, sección 17)
// ============================================================

export type FilaPromocion = {
  id: string;
  titulo: string;
  detalle: string | null;
  activa: boolean;
  desde: string | null;
  hasta: string | null;
};

export function Promociones({ promociones }: { promociones: FilaPromocion[] }) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(crearPromocion, null);
  const [ocupado, iniciarTransicion] = useTransition();

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Promociones"
        descripcion="El bot solo puede nombrar promos cargadas acá — nunca se inventa una"
      />

      <div className="px-4 py-4 sm:px-5">
        {promociones.length === 0 ? (
          <p className="text-sm text-ink-2">
            No hay promos cargadas. Si un cliente pregunta, el bot le va a decir que por ahora no hay ninguna.
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
            {promociones.map((promo) => (
              <li key={promo.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {promo.titulo}
                    {promo.activa ? null : <span className="ml-2 text-xs font-normal text-ink-3">(pausada)</span>}
                  </span>
                  {promo.detalle ? (
                    <span className="block truncate text-xs text-ink-3">{promo.detalle}</span>
                  ) : null}
                  {promo.desde || promo.hasta ? (
                    <span className="numero block text-xs text-ink-3">
                      {promo.desde ? `desde ${formatearFecha(`${promo.desde}T12:00:00Z`)}` : "sin fecha de inicio"}
                      {" · "}
                      {promo.hasta ? `hasta ${formatearFecha(`${promo.hasta}T12:00:00Z`)}` : "sin vencimiento"}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      iniciarTransicion(async () => void (await cambiarEstadoPromocion(promo.id, !promo.activa)))
                    }
                    className={clasesBoton("fantasma")}
                  >
                    {promo.activa ? "Pausar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => iniciarTransicion(async () => void (await borrarPromocion(promo.id)))}
                    className={clasesBoton("fantasma")}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={accion} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-titulo text-sm font-semibold text-ink-2">Promo</span>
            <input
              type="text"
              name="titulo"
              required
              placeholder="2x1 en hamburguesas"
              className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-3"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-titulo text-sm font-semibold text-ink-2">Detalle (opcional)</span>
            <input
              type="text"
              name="detalle"
              placeholder="Llevando 2 packs o más"
              className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-3"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5 sm:w-44">
              <span className="font-titulo text-sm font-semibold text-ink-2">Desde (opcional)</span>
              <input
                type="date"
                name="desde"
                className="numero min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink"
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:w-44">
              <span className="font-titulo text-sm font-semibold text-ink-2">Hasta (opcional)</span>
              <input
                type="date"
                name="hasta"
                className="numero min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink"
              />
            </label>

            <BotonGuardar etiqueta="Agregar promo" />
          </div>
        </form>

        <p className="mt-3 text-xs text-ink-3">
          Poner una fecha de fin es la forma más segura de que una promo vencida no se siga ofreciendo sola.
        </p>

        {estado ? <Aviso estado={estado} /> : null}
      </div>
    </Tarjeta>
  );
}

// ============================================================
// Sustitutos autorizados (especificación del bot, sección 5)
// ============================================================

export type OpcionProducto = { id: string; nombre: string };
export type FilaSustituto = {
  id: string;
  productoNombre: string;
  sustitutoNombre: string;
  preguntarUso: boolean;
};

export function SustitutosAutorizados({
  sustitutos,
  productos,
}: {
  sustitutos: FilaSustituto[];
  productos: OpcionProducto[];
}) {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(agregarSustituto, null);
  const [borrando, iniciarTransicion] = useTransition();

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Reemplazos autorizados"
        descripcion="Lo único que el bot puede ofrecer cuando falta un corte"
      />

      <div className="px-4 py-4 sm:px-5">
        <p className="mb-3 text-sm text-ink-2">
          Si un corte no tiene ningún reemplazo cargado, el bot va a decir que no hay en vez de ofrecer otra
          cosa. Es a propósito: un reemplazo mal elegido molesta más que un &quot;no tengo&quot;.
        </p>

        {sustitutos.length === 0 ? (
          <p className="text-sm text-ink-2">Todavía no hay reemplazos cargados.</p>
        ) : (
          <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
            {sustitutos.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-sm text-ink">
                  Si falta <strong>{s.productoNombre}</strong> → ofrecer <strong>{s.sustitutoNombre}</strong>
                  {s.preguntarUso ? (
                    <span className="block text-xs text-ink-3">Preguntando antes para qué lo va a usar</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={borrando}
                  onClick={() => iniciarTransicion(async () => void (await borrarSustituto(s.id)))}
                  className={clasesBoton("fantasma")}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form action={accion} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-titulo text-sm font-semibold text-ink-2">Si falta…</span>
              <select
                name="producto_id"
                required
                className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink"
              >
                <option value="">Elegí un corte</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-titulo text-sm font-semibold text-ink-2">…ofrecer</span>
              <select
                name="sustituto_id"
                required
                className="min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink"
              >
                <option value="">Elegí el reemplazo</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="preguntar_uso" className="h-5 w-5 accent-[var(--brand)]" />
            Preguntarle antes para qué lo va a usar
          </label>

          <div className="flex justify-end">
            <BotonGuardar etiqueta="Autorizar reemplazo" />
          </div>
        </form>

        {estado ? <Aviso estado={estado} /> : null}
      </div>
    </Tarjeta>
  );
}

// ============================================================
// Piezas compartidas
// ============================================================

function Campo({
  etiqueta,
  nombre,
  valorInicial,
  tipo = "text",
  modoTeclado,
  requerido = false,
  ayuda,
}: {
  etiqueta: string;
  nombre: string;
  valorInicial: string;
  tipo?: string;
  modoTeclado?: "decimal" | "numeric";
  requerido?: boolean;
  ayuda?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-titulo text-sm font-semibold text-ink-2">{etiqueta}</span>
      <input
        type={tipo}
        name={nombre}
        inputMode={modoTeclado}
        required={requerido}
        defaultValue={valorInicial}
        className={`min-h-12 rounded-lg border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-3 ${
          modoTeclado ? "numero" : ""
        }`}
      />
      {ayuda ? <span className="text-xs text-ink-3">{ayuda}</span> : null}
    </label>
  );
}

function Opcion({
  nombre,
  valor,
  marcado,
  titulo,
  descripcion,
}: {
  nombre: string;
  valor: string;
  marcado: boolean;
  titulo: string;
  descripcion: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border px-3 py-3 has-checked:border-brand has-checked:bg-brand-soft">
      <input
        type="radio"
        name={nombre}
        value={valor}
        defaultChecked={marcado}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block font-titulo text-sm font-semibold text-ink">{titulo}</span>
        <span className="mt-0.5 block text-sm text-ink-2">{descripcion}</span>
      </span>
    </label>
  );
}

function PieDeFormulario({
  estado,
  etiqueta,
}: {
  estado: ResultadoAccion | null;
  etiqueta: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BotonGuardar etiqueta={etiqueta} />
      {estado ? <Aviso estado={estado} /> : null}
    </div>
  );
}

function BotonGuardar({ etiqueta }: { etiqueta: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clasesBoton("principal")}>
      {pending ? "Guardando…" : etiqueta}
    </button>
  );
}

function Aviso({ estado }: { estado: ResultadoAccion }) {
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        estado.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      {estado.mensaje}
    </p>
  );
}
