"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Tarjeta, TarjetaEncabezado, EstadoVacio, clasesBoton } from "./ui";
import { IconoEnviar } from "./iconos";
import { formatearHora } from "@/lib/panel/formatos";
import {
  enviarComoCliente,
  enviarComoCarnicero,
  limpiarConversacionDePrueba,
  type ResultadoSimulacion,
} from "@/app/panel/(interno)/simulador/acciones";

export type MensajeSimulado = {
  id: string;
  direccion: "entrante" | "saliente";
  cuerpo: string | null;
  origen: string | null;
  creadoAt: string;
};

type Lado = "cliente" | "carnicero";

// El simulador tiene dos lados, y son dos personas distintas usando el mismo
// número de WhatsApp de la carnicería:
//
//   - Cliente: pide algo. El bot arma el pedido y espera que la carnicería lo
//     apruebe.
//   - Carnicero: carga stock hablando ("entraron 20 kilos de asado"). El bot
//     entiende, muestra el resumen y espera un "confirmar" antes de tocar nada.
//
// En los dos casos el mensaje que escribís es el ENTRANTE (lo mandó el
// interlocutor) y la respuesta del bot es el SALIENTE. Se rotula en cada
// burbuja para que nadie se pierda de qué lado está mirando.

export function Simulador({
  telefonoCliente,
  telefonoCarnicero,
  mensajesCliente,
  mensajesCarnicero,
  sinStock,
}: {
  telefonoCliente: string;
  telefonoCarnicero: string;
  mensajesCliente: MensajeSimulado[];
  mensajesCarnicero: MensajeSimulado[];
  sinStock: boolean;
}) {
  const [lado, setLado] = useState<Lado>("cliente");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="De qué lado escribís"
        className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1"
      >
        <BotonSolapa activa={lado === "cliente"} onClick={() => setLado("cliente")} id="solapa-cliente">
          Como cliente
        </BotonSolapa>
        <BotonSolapa
          activa={lado === "carnicero"}
          onClick={() => setLado("carnicero")}
          id="solapa-carnicero"
        >
          Como carnicero
        </BotonSolapa>
      </div>

      {lado === "cliente" ? (
        <div role="tabpanel" aria-labelledby="solapa-cliente" className="flex flex-col gap-4">
          {sinStock ? (
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-ink-2">
              No hay ningún producto con stock cargado, así que el bot va a rechazar todo lo que
              pidas. Cargalo desde{" "}
              <Link href="/panel/stock" className="font-semibold text-brand">
                Stock
              </Link>{" "}
              o probá primero la solapa <strong>Como carnicero</strong>.
            </div>
          ) : null}

          <Conversacion
            titulo="Conversación de prueba"
            descripcion={`Cliente simulado ${telefonoCliente}`}
            etiquetaInterlocutor="Cliente simulado"
            telefono={telefonoCliente}
            mensajes={mensajesCliente}
            accionServidor={enviarComoCliente}
            campoNombre="Cliente de prueba"
            marcador="Hola, quiero 2 kilos de asado para las 7…"
            vacioTitulo="Todavía no escribiste nada"
            vacioDescripcion="Mandá un mensaje abajo y el bot te va a contestar igual que le contestaría a un cliente."
            pie="Escribís como el cliente, no como la carnicería"
          />

          <QueProbarCliente />
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby="solapa-carnicero" className="flex flex-col gap-4">
          <div className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3">
            <p className="font-titulo text-sm font-semibold text-ink">
              En WhatsApp esto se hace hablando
            </p>
            <p className="mt-1 text-sm text-ink-2">
              El carnicero manda un audio mientras acomoda la mercadería —&nbsp;no escribe nada.
              Acá lo escribís porque el simulador no puede recibir archivos de voz. De ahí en
              adelante es exactamente el mismo motor: lo que hace el audio es convertirse en este
              mismo texto antes de entrar.
            </p>
          </div>

          <Conversacion
            titulo="Carga de stock de prueba"
            descripcion={`Carnicero simulado ${telefonoCarnicero}`}
            etiquetaInterlocutor="Carnicero simulado"
            telefono={telefonoCarnicero}
            mensajes={mensajesCarnicero}
            accionServidor={enviarComoCarnicero}
            marcador="Entraron 20 kilos de asado y 8 de vacío…"
            vacioTitulo="Probá cargar mercadería"
            vacioDescripcion="Escribí lo que dirías por audio al recibir la media res. El bot te va a mostrar el resumen y a pedirte que lo confirmes antes de tocar el stock."
            pie="Escribís como la carnicería, no como un cliente"
          />

          <QueProbarCarnicero />
        </div>
      )}
    </div>
  );
}

function BotonSolapa({
  activa,
  onClick,
  id,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 font-titulo text-sm font-semibold transition-colors ${
        activa ? "bg-surface text-ink shadow-tarjeta" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Conversacion({
  titulo,
  descripcion,
  etiquetaInterlocutor,
  telefono,
  mensajes,
  accionServidor,
  campoNombre,
  marcador,
  vacioTitulo,
  vacioDescripcion,
  pie,
}: {
  titulo: string;
  descripcion: string;
  etiquetaInterlocutor: string;
  telefono: string;
  mensajes: MensajeSimulado[];
  accionServidor: (
    previo: ResultadoSimulacion | null,
    datos: FormData
  ) => Promise<ResultadoSimulacion>;
  campoNombre?: string;
  marcador: string;
  vacioTitulo: string;
  vacioDescripcion: string;
  pie: string;
}) {
  const [estado, accion] = useActionState<ResultadoSimulacion | null, FormData>(
    accionServidor,
    null
  );
  const [limpiando, iniciarTransicion] = useTransition();
  const [avisoLimpieza, setAvisoLimpieza] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo={titulo}
        descripcion={descripcion}
        accion={
          <button
            type="button"
            disabled={limpiando}
            onClick={() =>
              iniciarTransicion(async () => {
                const resultado = await limpiarConversacionDePrueba(telefono);
                setAvisoLimpieza(resultado.mensaje);
              })
            }
            className={clasesBoton("fantasma")}
          >
            {limpiando ? "Limpiando…" : "Empezar de cero"}
          </button>
        }
      />

      <div className="max-h-[26rem] overflow-y-auto px-3 py-3 sm:px-4">
        {mensajes.length === 0 ? (
          <EstadoVacio titulo={vacioTitulo} descripcion={vacioDescripcion} />
        ) : (
          <ol className="flex flex-col gap-2">
            {mensajes.map((mensaje) => {
              // "entrante" = lo escribiste vos, haciendo de interlocutor.
              const esDelInterlocutor = mensaje.direccion === "entrante";
              return (
                <li
                  key={mensaje.id}
                  className={`flex ${esDelInterlocutor ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      esDelInterlocutor ? "bg-surface-2" : "bg-brand-soft"
                    }`}
                  >
                    <p className="mb-0.5 font-titulo text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      {esDelInterlocutor ? etiquetaInterlocutor : "Bot"}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">
                      {mensaje.cuerpo ?? "(sin texto)"}
                    </p>
                    <p className="numero mt-1 text-right text-[11px] text-ink-3">
                      {formatearHora(mensaje.creadoAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form
        ref={formulario}
        action={async (datos) => {
          await accion(datos);
          formulario.current?.reset();
        }}
        className="border-t border-border p-3 sm:p-4"
      >
        <input type="hidden" name="telefono" value={telefono} />
        {campoNombre ? <input type="hidden" name="nombre" value={campoNombre} /> : null}

        <label className="sr-only" htmlFor={`texto-${telefono}`}>
          {pie}
        </label>
        <textarea
          id={`texto-${telefono}`}
          name="texto"
          rows={2}
          required
          placeholder={marcador}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-3">{pie}</span>
          <BotonEnviar />
        </div>

        {estado && !estado.ok ? (
          <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {estado.mensaje}
          </p>
        ) : null}

        {avisoLimpieza ? (
          <p role="status" className="mt-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
            {avisoLimpieza}
          </p>
        ) : null}
      </form>
    </Tarjeta>
  );
}

function QueProbarCliente() {
  return (
    <Tarjeta className="p-4 sm:p-5">
      <h2 className="font-titulo text-base font-semibold text-ink">Qué probar como cliente</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
        <li>
          <strong className="text-ink">Un pedido normal:</strong> &ldquo;hola, quiero 2 kilos de
          asado para las 7 de la tarde&rdquo;.
        </li>
        <li>
          <strong className="text-ink">Un corte que no tenés:</strong> pedí algo que esté en cero y
          fijate si ofrece una alternativa parecida.
        </li>
        <li>
          <strong className="text-ink">Sin decir cantidades:</strong> &ldquo;quiero asado y
          chorizo&rdquo; — tiene que preguntarte para cuántos son y calcular los kilos.
        </li>
        <li>
          <strong className="text-ink">Una palabra ambigua:</strong> &ldquo;quiero tapa&rdquo; —
          tiene que preguntar cuál.
        </li>
        <li>
          <strong className="text-ink">Una hora que ya pasó:</strong> si son las 3 de la tarde,
          decile &ldquo;a las 11 de la mañana&rdquo; — tiene que avisarte y ofrecerte mañana.
        </li>
        <li>
          <strong className="text-ink">Después de armar el pedido:</strong> andá a{" "}
          <Link href="/panel" className="font-semibold text-brand">
            Inicio
          </Link>{" "}
          y aprobalo. El cliente simulado recibe la confirmación y se descuenta el stock.
        </li>
      </ul>
    </Tarjeta>
  );
}

function QueProbarCarnicero() {
  return (
    <Tarjeta className="p-4 sm:p-5">
      <h2 className="font-titulo text-base font-semibold text-ink">Qué probar como carnicero</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
        <li>
          <strong className="text-ink">Una entrada de mercadería:</strong> &ldquo;entraron 20 kilos
          de asado y 8 de vacío&rdquo;. Mostrá el resumen y contestá{" "}
          <strong className="text-ink">confirmar</strong>.
        </li>
        <li>
          <strong className="text-ink">Corregir antes de confirmar:</strong> cuando te muestre el
          resumen, decile &ldquo;no, eran 12 kilos de asado&rdquo; en vez de confirmar.
        </li>
        <li>
          <strong className="text-ink">Hablar como se habla:</strong> &ldquo;me quedaron tres kilos
          de matambre&rdquo;, &ldquo;se vendió todo el chorizo&rdquo; — no hay que decirlo de una
          forma especial.
        </li>
        <li>
          <strong className="text-ink">Algo ambiguo:</strong> &ldquo;entró tapa&rdquo; — tiene que
          preguntar cuál y cuánta, no inventar.
        </li>
        <li>
          <strong className="text-ink">Y después mirá el resultado:</strong> entrá a{" "}
          <Link href="/panel/stock" className="font-semibold text-brand">
            Stock
          </Link>{" "}
          y fijate los kilos actualizados. Nada se toca hasta que confirmás.
        </li>
      </ul>
    </Tarjeta>
  );
}

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clasesBoton("principal")}>
      <IconoEnviar className="h-5 w-5" />
      {pending ? "El bot está pensando…" : "Enviar"}
    </button>
  );
}
