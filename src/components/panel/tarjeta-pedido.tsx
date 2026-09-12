"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Etiqueta,
  IconoCheck,
  IconoCruz,
  clasesBoton,
} from "./ui";
import { IconoReloj } from "./iconos";
import {
  ETIQUETA_ESTADO,
  etiquetaDePedido,
  type PedidoDelPanel,
} from "@/lib/panel/pedidos";
import { formatearCantidad, formatearHora, formatearPesos, formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { accionAprobarPedido, accionRechazarPedido } from "@/app/panel/(interno)/acciones";

// Tarjeta de un pedido esperando aprobación.
//
// Es la acción más frecuente del panel, así que los dos botones son grandes y
// están siempre visibles, sin abrir nada. Rechazar es una acción destructiva
// (le avisa al cliente que no se le toma el pedido), así que pide confirmación
// una vez: con las manos mojadas y gente esperando, un toque de más pasa.

export function TarjetaPedidoPendiente({ pedido }: { pedido: PedidoDelPanel }) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ejecutar(accion: () => Promise<{ ok: boolean; mensaje: string }>) {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await accion();
      if (!resultado.ok) setError(resultado.mensaje);
    });
  }

  // Es la única tarjeta del panel que pide una decisión, y por eso es la única
  // que sube un escalón de sombra y lleva un filo de color arriba. El ámbar no
  // está de adorno: es el mismo que significa "esperando" en las etiquetas de
  // estado. Si el filo apareciera también en tarjetas informativas, dejaría de
  // querer decir nada.
  return (
    <article className="overflow-hidden rounded-tarjeta border border-border bg-surface shadow-media">
      <span aria-hidden className="block h-1 bg-warning" />

      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="font-titulo text-[17px] font-bold tracking-tight text-ink">
            {pedido.clienteNombre ?? formatearTelefono(pedido.telefono)}
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {pedido.clienteNombre ? `${formatearTelefono(pedido.telefono)} · ` : ""}
            pedido {formatearRelativo(pedido.creadoAt)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <Etiqueta tono="atencion">{ETIQUETA_ESTADO[pedido.estado]}</Etiqueta>
          {pedido.clienteAusencias > 0 ? (
            <Etiqueta tono="problema">
              {pedido.clienteAusencias} {pedido.clienteAusencias === 1 ? "ausencia" : "ausencias"}
            </Etiqueta>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3.5 sm:px-5">
        <ul className="flex flex-col">
          {pedido.items.map((item, indice) => (
            <li
              key={`${item.producto_id}-${indice}`}
              className="flex items-baseline justify-between gap-3 py-1.5"
            >
              <span className="min-w-0 text-sm text-ink">
                {item.nombre_display}
                {item.sustituye_a_producto_id ? (
                  <span className="ml-1.5 text-xs text-ink-3">(alternativa)</span>
                ) : null}
              </span>
              {/* Punteado entre el producto y su cantidad: con cinco o seis
                  renglones, la vista sola no sostiene la fila y se termina
                  leyendo la cantidad del producto de al lado. */}
              <span aria-hidden className="min-w-4 flex-1 border-b border-dotted border-border" />
              <span className="numero shrink-0 text-base font-semibold text-ink">
                {formatearCantidad(item.cantidad, item.unidad)}
              </span>
            </li>
          ))}
        </ul>

        {pedido.horaRetiro ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
            <IconoReloj className="h-4 w-4 text-ink-3" />
            Retira a las{" "}
            <span className="numero font-semibold text-ink">{formatearHora(pedido.horaRetiro)}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mx-4 mb-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger sm:mx-5"
        >
          {error}
        </p>
      ) : null}

      {/* La barra de acciones va sobre el fondo secundario: separa "lo que hay
          que decidir" de "con qué se decide" sin agregar otra línea más. */}
      <div className="flex flex-col gap-2 border-t border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => ejecutar(() => accionAprobarPedido(pedido.id))}
          className={clasesBoton("principal", "flex-1")}
        >
          <IconoCheck className="h-5 w-5" />
          {pendiente ? "Un momento…" : "Aprobar"}
        </button>

        {confirmandoRechazo ? (
          <div className="flex flex-1 gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => accionRechazarPedido(pedido.id))}
              className={clasesBoton("peligro", "flex-1")}
            >
              Sí, rechazar
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoRechazo(false)}
              className={clasesBoton("fantasma")}
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => setConfirmandoRechazo(true)}
            className={clasesBoton("secundario", "flex-1")}
          >
            <IconoCruz className="h-5 w-5" />
            Rechazar
          </button>
        )}

        <Link href={`/panel/pedidos/${pedido.id}`} className={clasesBoton("fantasma")}>
          Ver detalle
        </Link>
      </div>
    </article>
  );
}

// ============================================================
// Fila compacta — para listas e historial
// ============================================================

export function FilaPedido({ pedido }: { pedido: PedidoDelPanel }) {
  const total = pedido.totalEstimado;

  return (
    <Link
      href={`/panel/pedidos/${pedido.id}`}
      className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-titulo text-sm font-semibold text-ink">
          {pedido.clienteNombre ?? formatearTelefono(pedido.telefono)}
        </p>
        <p className="truncate text-xs text-ink-3">
          {pedido.horaRetiro ? `Retira ${formatearHora(pedido.horaRetiro)} · ` : ""}
          {pedido.items.length} {pedido.items.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Etiqueta tono={etiquetaDePedido(pedido).tono}>{etiquetaDePedido(pedido).texto}</Etiqueta>
        {total !== null ? (
          <span className="numero text-sm text-ink-2">{formatearPesos(total)}</span>
        ) : null}
      </div>
    </Link>
  );
}
