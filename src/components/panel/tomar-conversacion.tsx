"use client";

import { useState, useTransition } from "react";
import { clasesBoton } from "./ui";
import {
  accionDevolverConversacion,
  accionTomarConversacion,
} from "@/app/panel/(interno)/acciones";

// Tomar la conversación — especificación del bot, sección 43.
//
// Es la ÚNICA excepción a la regla de que el carnicero no habla directo con el
// cliente. Está pensada para cuando algo falló y hay que salvar la
// conversación, no para usarla todos los días: por eso el texto explica qué
// pasa y la pausa se levanta sola.

export function TomarConversacion({
  conversacionId,
  pausadoHasta,
}: {
  conversacionId: string;
  pausadoHasta: string | null;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const enPausa = Boolean(pausadoHasta && new Date(pausadoHasta) > new Date());

  function ejecutar(accion: () => Promise<{ ok: boolean; mensaje: string }>) {
    setMensaje(null);
    iniciarTransicion(async () => {
      const resultado = await accion();
      setMensaje(resultado.mensaje);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-border px-3 py-2">
      {enPausa ? (
        <>
          <span className="flex-1 text-sm text-ink-2">
            El bot está en pausa acá: los mensajes de este cliente los contestás vos.
          </span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ejecutar(() => accionDevolverConversacion(conversacionId))}
            className={clasesBoton("principal")}
          >
            Que siga el bot
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-ink-2">
            Si algo se complicó, podés atender vos esta conversación por un rato.
          </span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ejecutar(() => accionTomarConversacion(conversacionId))}
            className={clasesBoton("secundario")}
          >
            Atiendo yo
          </button>
        </>
      )}

      {mensaje ? <p className="w-full text-sm text-ink-2">{mensaje}</p> : null}
    </div>
  );
}
