"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { EstadoVacio, clasesBoton } from "./ui";
import { IconoEnviar, IconoMicrofono, IconoPantalla } from "./iconos";
import { formatearHora, formatearFecha } from "@/lib/panel/formatos";
import { accionEnviarMensaje } from "@/app/panel/(interno)/acciones";

export type MensajeDelHilo = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  cuerpo: string | null;
  origen: string | null;
  estadoEnvio: string | null;
  error: string | null;
  plantilla: string | null;
  pedidoId: string | null;
  creadoAt: string;
};

// El hilo de una conversación, más el envío desde la computadora.
//
// Lo que hace legible el hilo con coexistencia es distinguir de dónde salió
// cada mensaje saliente: del bot, del panel, o de la app de WhatsApp del propio
// carnicero. Sin eso, el carnicero no puede saber si algo lo contestó él o lo
// contestó el sistema.

const ETIQUETA_ORIGEN: Record<string, string> = {
  bot: "Bot",
  panel: "Desde el panel",
  app_whatsapp: "Desde el celular",
  cliente: "",
};

export function HiloConversacion({
  conversacionId,
  mensajes,
  ventanaAbierta,
  minutosRestantes,
  proveedor,
}: {
  conversacionId: string;
  mensajes: MensajeDelHilo[];
  ventanaAbierta: boolean;
  minutosRestantes: number | null;
  proveedor: "twilio" | "meta" | "simulado";
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-tarjeta border border-border bg-surface shadow-tarjeta">
        {mensajes.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay mensajes"
            descripcion="Cuando esta persona escriba, la conversación completa va a quedar acá."
          />
        ) : (
          <ol className="flex flex-col gap-2 p-3 sm:p-4">
            {mensajes.map((mensaje, indice) => (
              <Burbuja
                key={mensaje.id}
                mensaje={mensaje}
                mostrarFecha={
                  indice === 0 ||
                  formatearFecha(mensajes[indice - 1].creadoAt) !== formatearFecha(mensaje.creadoAt)
                }
              />
            ))}
          </ol>
        )}
      </div>

      <Redactor
        conversacionId={conversacionId}
        ventanaAbierta={ventanaAbierta}
        minutosRestantes={minutosRestantes}
        proveedor={proveedor}
      />
    </div>
  );
}

function Burbuja({ mensaje, mostrarFecha }: { mensaje: MensajeDelHilo; mostrarFecha: boolean }) {
  const esSaliente = mensaje.direccion === "saliente";
  const origen = mensaje.origen ?? (esSaliente ? "bot" : "cliente");
  const fallo = mensaje.estadoEnvio === "fallido";

  return (
    <>
      {mostrarFecha ? (
        <li className="my-1 flex justify-center">
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-3">
            {formatearFecha(mensaje.creadoAt)}
          </span>
        </li>
      ) : null}

      <li className={`flex ${esSaliente ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-3 py-2 ${
            fallo
              ? "border border-danger/40 bg-danger-soft"
              : esSaliente
                ? "bg-brand-soft"
                : "bg-surface-2"
          }`}
        >
          {esSaliente && ETIQUETA_ORIGEN[origen] ? (
            <p className="mb-0.5 flex items-center gap-1 font-titulo text-xs font-semibold text-ink-3">
              {origen === "app_whatsapp" ? <IconoMicrofono className="h-3 w-3" /> : null}
              {origen === "panel" ? <IconoPantalla className="h-3 w-3" /> : null}
              {ETIQUETA_ORIGEN[origen]}
            </p>
          ) : null}

          {mensaje.tipo === "audio" && !mensaje.cuerpo ? (
            <p className="flex items-center gap-1.5 text-sm italic text-ink-2">
              <IconoMicrofono className="h-4 w-4" />
              Audio
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-ink">
              {mensaje.cuerpo ?? "(sin texto)"}
            </p>
          )}

          {mensaje.plantilla ? (
            <p className="mt-1 text-[11px] text-ink-3">Plantilla: {mensaje.plantilla}</p>
          ) : null}

          <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-ink-3">
            {mensaje.pedidoId ? (
              <Link href={`/panel/pedidos/${mensaje.pedidoId}`} className="font-semibold text-brand">
                Ver pedido
              </Link>
            ) : null}
            <span className="numero">{formatearHora(mensaje.creadoAt)}</span>
          </p>

          {fallo ? (
            <p className="mt-1 text-xs text-danger">
              No se pudo enviar{mensaje.error ? `: ${mensaje.error}` : "."}
            </p>
          ) : null}
        </div>
      </li>
    </>
  );
}

// ============================================================
// Redactor — escribir y mandar desde la computadora
// ============================================================
//
// La ventana de 24 horas de Meta manda: dentro de ella se puede escribir texto
// libre; fuera de ella, solo plantillas aprobadas. El campo se deshabilita
// cuando está cerrada y la pantalla explica por qué. Dejar escribir un mensaje
// que va a fallar en el envío es peor que no dejar escribirlo.

function Redactor({
  conversacionId,
  ventanaAbierta,
  minutosRestantes,
  proveedor,
}: {
  conversacionId: string;
  ventanaAbierta: boolean;
  minutosRestantes: number | null;
  proveedor: "twilio" | "meta" | "simulado";
}) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, iniciarTransicion] = useTransition();

  // Solo Meta corta por ventana. Con Twilio el proveedor la aplica del otro
  // lado pero no la exponemos; en simulado no sale nada a internet. En los dos
  // casos se deja escribir y, si falla, el error queda visible en el hilo.
  const bloqueado = proveedor === "meta" && !ventanaAbierta;

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;

    setAviso(null);
    iniciarTransicion(async () => {
      const resultado = await accionEnviarMensaje(conversacionId, limpio);
      if (resultado.ok) {
        setTexto("");
        setAviso(null);
      } else {
        setAviso({ ok: false, texto: resultado.mensaje });
      }
    });
  }

  if (bloqueado) {
    return (
      <div className="rounded-tarjeta border border-border bg-surface-2 px-4 py-3">
        <p className="font-titulo text-sm font-semibold text-ink">
          Pasaron más de 24 horas desde su último mensaje
        </p>
        <p className="mt-1 text-sm text-ink-2">
          WhatsApp no deja escribirle libremente después de ese plazo: solo se le puede mandar una
          plantilla aprobada por Meta. En cuanto la persona vuelva a escribir, se reabre la ventana y
          podés contestarle normalmente.
        </p>
        <Link href="/panel/plantillas" className={clasesBoton("secundario", "mt-3")}>
          Ver las plantillas
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-tarjeta border border-border bg-surface p-3 shadow-tarjeta">
      <label className="sr-only" htmlFor="redactor">
        Escribir un mensaje
      </label>
      <textarea
        id="redactor"
        rows={3}
        value={texto}
        disabled={enviando}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          // Enter manda, Shift+Enter hace un salto de línea. En el teléfono el
          // teclado muestra su propio botón de enviar.
          if (evento.key === "Enter" && !evento.shiftKey) {
            evento.preventDefault();
            enviar();
          }
        }}
        placeholder="Escribí un mensaje…"
        className="w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-3">
          {proveedor === "meta" && minutosRestantes !== null
            ? minutosRestantes < 180
              ? `Podés escribirle libremente por ${Math.max(1, Math.round(minutosRestantes / 60))} h más`
              : "Se le puede escribir libremente"
            : "El mensaje sale del WhatsApp de la carnicería"}
        </span>

        <button
          type="button"
          disabled={enviando || texto.trim().length === 0}
          onClick={enviar}
          className={clasesBoton("principal")}
        >
          <IconoEnviar className="h-5 w-5" />
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>

      {aviso ? (
        <p role="alert" className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
