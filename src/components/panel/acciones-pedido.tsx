"use client";

import { useState, useTransition } from "react";
import { clasesBoton, IconoCheck, IconoCruz } from "./ui";
import type { EstadoPedido } from "@/lib/panel/pedidos";
import {
  accionAprobarPedido,
  accionDejarEnEspera,
  accionMarcarListo,
  accionMarcarNoRetirado,
  accionMarcarRetirado,
  accionRechazarPedido,
  accionResponderConsulta,
} from "@/app/panel/(interno)/acciones";

export type ConsultaAbierta = {
  paso: string;
  opciones: { numero: number; etiqueta: string; valor: string }[];
};

// Las acciones disponibles dependen del estado del pedido. Mostrar un botón que
// no va a funcionar es peor que no mostrarlo: el carnicero lo toca, no pasa
// nada, y deja de confiar en el panel.

export function AccionesPedido({
  pedidoId,
  estado,
  version,
  consulta,
  listo = false,
}: {
  pedidoId: string;
  estado: EstadoPedido;
  version?: number;
  consulta?: ConsultaAbierta | null;
  /** ¿Ya se le avisó al cliente que el pedido está armado? */
  listo?: boolean;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState<null | "rechazar" | "no_retiro">(null);
  const [elegidos, setElegidos] = useState<number[]>([]);

  function ejecutar(accion: () => Promise<{ ok: boolean; mensaje: string }>) {
    setMensaje(null);
    setConfirmando(null);
    iniciarTransicion(async () => {
      const resultado = await accion();
      setMensaje({ ok: resultado.ok, texto: resultado.mensaje });
    });
  }

  // Hay una pregunta abierta del bot esperando respuesta (especificación,
  // secciones 36 y 50). Mientras esté abierta, es lo único que se muestra: es
  // exactamente la misma conversación que por WhatsApp, con botones.
  if (consulta) {
    const multiple = consulta.paso === "stock";
    const titulo =
      consulta.paso === "motivo"
        ? "¿Por qué no podés aprobarlo?"
        : consulta.paso === "demora"
          ? "¿Qué le podemos ofrecer?"
          : "¿De qué falta stock?";

    return (
      <div className="flex flex-col gap-3">
        <p className="font-titulo text-sm font-semibold text-ink">{titulo}</p>
        <div className="flex flex-wrap gap-2">
          {consulta.opciones.map((opcion) => {
            const activo = elegidos.includes(opcion.numero);
            return (
              <button
                key={opcion.numero}
                type="button"
                disabled={pendiente}
                onClick={() => {
                  if (!multiple) {
                    ejecutar(() => accionResponderConsulta([opcion.numero]));
                    return;
                  }
                  setElegidos((previos) =>
                    previos.includes(opcion.numero)
                      ? previos.filter((n) => n !== opcion.numero)
                      : [...previos, opcion.numero]
                  );
                }}
                className={clasesBoton(activo ? "principal" : "secundario")}
              >
                {opcion.etiqueta}
              </button>
            );
          })}
        </div>

        {multiple ? (
          <button
            type="button"
            disabled={pendiente || elegidos.length === 0}
            onClick={() => ejecutar(() => accionResponderConsulta(elegidos))}
            className={clasesBoton("principal")}
          >
            Confirmar lo que falta
          </button>
        ) : null}

        {mensaje ? (
          <p className={`text-sm ${mensaje.ok ? "text-ink-2" : "text-danger"}`}>{mensaje.texto}</p>
        ) : null}
      </div>
    );
  }

  const botones: React.ReactNode[] = [];

  if (estado === "pendiente_aprobacion") {
    botones.push(
      <button
        key="aprobar"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionAprobarPedido(pedidoId, version))}
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

  // "Ya está listo" (pedido del fundador, 10/09/2026).
  //
  // Va antes que "Marcar como retirado" porque es lo que pasa antes: primero el
  // carnicero termina de armarlo, después el cliente lo viene a buscar.
  //
  // El botón dice lo que hace —le manda un WhatsApp al cliente— porque eso no se
  // puede deshacer. Y desaparece una vez usado, en vez de quedar deshabilitado,
  // para que no quede la duda de si el aviso salió: si no está el botón, salió.
  if ((estado === "aprobado" || estado === "en_espera") && !listo) {
    botones.push(
      <button
        key="listo"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionMarcarListo(pedidoId))}
        className={clasesBoton("principal", "flex-1")}
      >
        <IconoCheck className="h-5 w-5" />
        Avisar que está listo
      </button>
    );
  }

  if (estado === "aprobado" || estado === "en_espera" || estado === "no_show") {
    botones.push(
      <button
        key="retirado"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionMarcarRetirado(pedidoId))}
        className={clasesBoton(listo ? "principal" : "secundario", "flex-1")}
      >
        <IconoCheck className="h-5 w-5" />
        Marcar como retirado
      </button>
    );
  }

  // "En espera": el pedido no se retiró hoy pero sigue en pie para mañana
  // (especificación, sección 7.5). Es la alternativa a marcarlo como ausente,
  // que ya no pasa sola por tiempo.
  if (estado === "aprobado") {
    botones.push(
      <button
        key="en_espera"
        type="button"
        disabled={pendiente}
        onClick={() => ejecutar(() => accionDejarEnEspera(pedidoId))}
        className={clasesBoton("secundario", "flex-1")}
      >
        Dejar en espera
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

      {listo && (estado === "aprobado" || estado === "en_espera") ? (
        <p className="text-xs text-ink-3">
          Ya le avisaste al cliente que está listo. Puede pasar a buscarlo en cualquier momento.
        </p>
      ) : null}

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
