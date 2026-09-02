"use client";

import { useState, useTransition } from "react";
import { clasesBoton, IconoCheck, IconoCruz } from "./ui";
import type { EstadoPedido } from "@/lib/panel/pedidos";
import {
  accionAprobarPedido,
  accionMarcarNoRetirado,
  accionMarcarRetirado,
  accionRechazarPedido,
} from "@/app/panel/(interno)/acciones";

// Las acciones disponibles dependen del estado del pedido. Mostrar un botón que
// no va a funcionar es peor que no mostrarlo: el carnicero lo toca, no pasa
// nada, y deja de confiar en el panel.

export function AccionesPedido({ pedidoId, estado }: { pedidoId: string; estado: EstadoPedido }) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState<null | "rechazar" | "no_retiro">(null);

  function ejecutar(accion: () => Promise<{ ok: boolean; mensaje: string }>) {
    setMensaje(null);
    setConfirmando(null);
    iniciarTransicion(async () => {
      const resultado = await accion();
      setMensaje({ ok: resultado.ok, texto: resultado.mensaje });
    });
  }

  const botones: React.ReactNode[] = [];

  if (estado === "pendiente_aprobacion") {
    botones.push(
      <button
        key="aprobar"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionAprobarPedido(pedidoId))}
        className={clasesBoton("principal", "flex-1")}
      >
        <IconoCheck className="h-5 w-5" />
        Aprobar
      </button>
    );

    botones.push(
      confirmando === "rechazar" ? (
        <span key="rechazar" className="flex flex-1 gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ejecutar(() => accionRechazarPedido(pedidoId))}
            className={clasesBoton("peligro", "flex-1")}
          >
            Sí, rechazar
          </button>
          <button type="button" onClick={() => setConfirmando(null)} className={clasesBoton("fantasma")}>
            No
          </button>
        </span>
      ) : (
        <button
          key="rechazar"
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando("rechazar")}
          className={clasesBoton("secundario", "flex-1")}
        >
          <IconoCruz className="h-5 w-5" />
          Rechazar
        </button>
      )
    );
  }

  if (estado === "aprobado" || estado === "no_show") {
    botones.push(
      <button
        key="retirado"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionMarcarRetirado(pedidoId))}
        className={clasesBoton("principal", "flex-1")}
      >
        <IconoCheck className="h-5 w-5" />
        Marcar como retirado
      </button>
    );
  }

  if (estado === "aprobado" || estado === "retirado") {
    botones.push(
      confirmando === "no_retiro" ? (
        <span key="no_retiro" className="flex flex-1 gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ejecutar(() => accionMarcarNoRetirado(pedidoId))}
            className={clasesBoton("peligro", "flex-1")}
          >
            Sí, no lo retiró
          </button>
          <button type="button" onClick={() => setConfirmando(null)} className={clasesBoton("fantasma")}>
            No
          </button>
        </span>
      ) : (
        <button
          key="no_retiro"
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando("no_retiro")}
          className={clasesBoton("secundario", "flex-1")}
        >
          No lo retiró
        </button>
      )
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {botones.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">{botones}</div>
      ) : (
        <p className="text-sm text-ink-3">Este pedido ya está cerrado, no hay nada más que hacer.</p>
      )}

      {estado === "retirado" || estado === "no_show" ? (
        <p className="text-xs text-ink-3">
          Si se marcó mal, se puede corregir en cualquier momento: cambiar entre retirado y no
          retirado ajusta también el historial de ausencias del cliente.
        </p>
      ) : null}

      {mensaje ? (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            mensaje.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
}
