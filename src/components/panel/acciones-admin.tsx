"use client";

import { useState, useTransition } from "react";
import { Tarjeta, TarjetaEncabezado, clasesBoton } from "./ui";
import {
  accionCambiarProveedor,
  accionReintentarWebhooks,
  type ResultadoAdmin,
} from "@/app/panel/(interno)/admin/acciones";

const PROVEEDORES: { valor: "twilio" | "meta" | "simulado"; etiqueta: string; detalle: string }[] = [
  {
    valor: "simulado",
    etiqueta: "Simulado",
    detalle: "No sale nada a WhatsApp. Para probar sin molestar a clientes reales.",
  },
  {
    valor: "twilio",
    etiqueta: "Twilio",
    detalle: "El proveedor viejo. Sirve para retroceder si algo de Meta falla.",
  },
  {
    valor: "meta",
    etiqueta: "Meta",
    detalle: "El destino. Necesita el alta completa con Phone Number ID y token.",
  },
];

export function AccionesCarniceria({
  carniceriaId,
  proveedor,
  tieneToken,
  webhooksSuscritos,
}: {
  carniceriaId: string;
  proveedor: "twilio" | "meta" | "simulado";
  tieneToken: boolean;
  webhooksSuscritos: boolean;
}) {
  const [pendiente, iniciarTransicion] = useTransition();
  const [aviso, setAviso] = useState<ResultadoAdmin | null>(null);

  function ejecutar(accion: () => Promise<ResultadoAdmin>) {
    setAviso(null);
    iniciarTransicion(async () => setAviso(await accion()));
  }

  return (
    <div className="flex flex-col gap-4">
      {tieneToken && !webhooksSuscritos ? (
        <Tarjeta as="div">
          <TarjetaEncabezado
            titulo="Suscribir los webhooks"
            descripcion="Sin esto los mensajes de esta carnicería no llegan, aunque el alta figure bien"
          />
          <div className="px-4 py-4 sm:px-5">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => accionReintentarWebhooks(carniceriaId))}
              className={clasesBoton("principal")}
            >
              {pendiente ? "Suscribiendo…" : "Reintentar suscripción"}
            </button>
          </div>
        </Tarjeta>
      ) : null}

      <Tarjeta as="div">
        <TarjetaEncabezado
          titulo="Por dónde habla esta carnicería"
          descripcion="Lo normal es que lo cambie el alta sola. Esto es para probar o para retroceder."
        />

        <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
          {PROVEEDORES.map((opcion) => {
            const actual = opcion.valor === proveedor;
            return (
              <div
                key={opcion.valor}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-control border px-3 py-3 ${
                  actual ? "border-brand bg-brand-soft" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-titulo text-sm font-semibold text-ink">{opcion.etiqueta}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{opcion.detalle}</p>
                </div>

                {actual ? (
                  <span className="font-titulo text-xs font-semibold text-brand">En uso</span>
                ) : (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => ejecutar(() => accionCambiarProveedor(carniceriaId, opcion.valor))}
                    className={clasesBoton("secundario")}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            );
          })}

          {aviso ? (
            <p
              role="status"
              className={`rounded-control px-3 py-2 text-sm ${
                aviso.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              {aviso.mensaje}
            </p>
          ) : null}
        </div>
      </Tarjeta>
    </div>
  );
}
