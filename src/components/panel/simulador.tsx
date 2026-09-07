"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Tarjeta, TarjetaEncabezado, EstadoVacio, clasesBoton } from "./ui";
import { IconoEnviar } from "./iconos";
import { formatearHora } from "@/lib/panel/formatos";
import {
  enviarComoCliente,
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

// La conversación de prueba, con los lados invertidos respecto del resto del
// panel: acá el carnicero escribe HACIENDO DE CLIENTE, así que sus mensajes son
// los "entrantes" y las respuestas del bot son las "salientes". Se rotula para
// que no haya confusión.

export function Simulador({
  telefonoDePrueba,
  mensajes,
}: {
  telefonoDePrueba: string;
  mensajes: MensajeSimulado[];
}) {
  const [estado, accion] = useActionState<ResultadoSimulacion | null, FormData>(
    enviarComoCliente,
    null
  );
  const [limpiando, iniciarTransicion] = useTransition();
  const [avisoLimpieza, setAvisoLimpieza] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo="Conversación de prueba"
        descripcion={`Cliente simulado ${telefonoDePrueba}`}
        accion={
          <button
            type="button"
            disabled={limpiando}
            onClick={() =>
              iniciarTransicion(async () => {
                const resultado = await limpiarConversacionDePrueba(telefonoDePrueba);
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
          <EstadoVacio
            titulo="Todavía no escribiste nada"
            descripcion="Mandá un mensaje abajo y el bot te va a contestar igual que le contestaría a un cliente."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {mensajes.map((mensaje) => {
              // "entrante" = lo escribió el cliente simulado, o sea vos.
              const esDelCliente = mensaje.direccion === "entrante";
              return (
                <li
                  key={mensaje.id}
                  className={`flex ${esDelCliente ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      esDelCliente ? "bg-surface-2" : "bg-brand-soft"
                    }`}
                  >
                    <p className="mb-0.5 font-titulo text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      {esDelCliente ? "Cliente simulado" : "Bot"}
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
        <input type="hidden" name="telefono" value={telefonoDePrueba} />
        <input type="hidden" name="nombre" value="Cliente de prueba" />

        <label className="sr-only" htmlFor="texto-simulado">
          Escribir como cliente
        </label>
        <textarea
          id="texto-simulado"
          name="texto"
          rows={2}
          required
          placeholder="Hola, quiero 2 kilos de asado para las 7…"
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-3">Escribís como el cliente, no como la carnicería</span>
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

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clasesBoton("principal")}>
      <IconoEnviar className="h-5 w-5" />
      {pending ? "El bot está pensando…" : "Enviar"}
    </button>
  );
}
