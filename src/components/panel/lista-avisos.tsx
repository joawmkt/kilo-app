"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Tarjeta, clasesBoton } from "./ui";
import { formatearRelativo } from "@/lib/panel/formatos";
import {
  accionMarcarAvisoLeido,
  accionMarcarTodosLosAvisosLeidos,
} from "@/app/panel/(interno)/acciones";
import type { AvisoDelPanel } from "@/app/panel/(interno)/avisos/page";

// Un punto de color por tipo de aviso, para poder barrer la lista con la vista.
// El bermellón queda reservado a lo que es un problema real; lo demás usa el
// ámbar de atención o el gris neutro.
const COLOR_POR_TIPO: Record<string, string> = {
  pedido_pendiente: "bg-warning",
  stock_agotado: "bg-danger",
  stock_bajo: "bg-warning",
  cliente_no_retiro: "bg-danger",
  whatsapp_desconectado: "bg-danger",
  whatsapp_por_vencer: "bg-warning",
  plantilla_aprobada: "bg-success",
  plantilla_rechazada: "bg-danger",
};

export function ListaAvisos({
  avisos,
  haySinLeer,
}: {
  avisos: AvisoDelPanel[];
  haySinLeer: boolean;
}) {
  const [pendiente, iniciarTransicion] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {haySinLeer ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciarTransicion(async () => void (await accionMarcarTodosLosAvisosLeidos()))}
            className={clasesBoton("secundario")}
          >
            Marcar todos como leídos
          </button>
        </div>
      ) : null}

      <Tarjeta>
        <ul>
          {avisos.map((aviso) => {
            const sinLeer = aviso.leidaAt === null;
            const contenido = (
              <>
                <span
                  aria-hidden
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    sinLeer ? (COLOR_POR_TIPO[aviso.tipo] ?? "bg-ink-3") : "bg-transparent"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-titulo text-sm ${
                      sinLeer ? "font-semibold text-ink" : "font-medium text-ink-2"
                    }`}
                  >
                    {aviso.titulo}
                  </span>
                  {aviso.cuerpo ? (
                    <span className="mt-0.5 block text-sm text-ink-2">{aviso.cuerpo}</span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-ink-3">
                    {formatearRelativo(aviso.creadoAt)}
                  </span>
                </span>
              </>
            );

            return (
              <li key={aviso.id} className="border-b border-border last:border-b-0">
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Cada aviso lleva a la pantalla donde se resuelve. */}
                  {aviso.enlace ? (
                    <Link
                      href={aviso.enlace}
                      onClick={() => {
                        if (sinLeer) void accionMarcarAvisoLeido(aviso.id);
                      }}
                      className="flex min-h-11 flex-1 items-start gap-3 hover:opacity-80"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <span className="flex min-h-11 flex-1 items-start gap-3">{contenido}</span>
                  )}

                  {sinLeer ? (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() =>
                        iniciarTransicion(async () => void (await accionMarcarAvisoLeido(aviso.id)))
                      }
                      className="shrink-0 self-center font-titulo text-xs font-semibold text-ink-3 hover:text-ink"
                    >
                      Marcar leído
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </div>
  );
}
