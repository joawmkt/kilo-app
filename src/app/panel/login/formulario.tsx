"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion, type EstadoLogin } from "./acciones";
import { Tarjeta, clasesBoton, IconoAlerta } from "@/components/panel/ui";

const ESTADO_INICIAL: EstadoLogin = { error: null };

export function FormularioLogin({ volver }: { volver: string }) {
  const [estado, accion] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    // La tarjeta va elevada porque apoya sobre el vino-negro del fondo: en modo
    // oscuro la superficie de tarjeta y la del armazón quedan a dos pasos de
    // luminosidad, y sin sombra el formulario se fundiría con la página.
    <Tarjeta className="p-5 shadow-elevada" as="div">
      <form action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="volver" value={volver} />

        <Campo
          etiqueta="Correo"
          nombre="email"
          tipo="email"
          autoComplete="username"
          placeholder="carniceria@ejemplo.com"
        />
        <Campo
          etiqueta="Contraseña"
          nombre="contrasena"
          tipo="password"
          autoComplete="current-password"
        />

        {estado.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
            {estado.error}
          </p>
        ) : null}

        <BotonEntrar />
      </form>
    </Tarjeta>
  );
}

function Campo({
  etiqueta,
  nombre,
  tipo,
  autoComplete,
  placeholder,
}: {
  etiqueta: string;
  nombre: string;
  tipo: string;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-titulo text-sm font-semibold text-ink-2">{etiqueta}</span>
      <input
        name={nombre}
        type={tipo}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="min-h-12 rounded-control border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-3"
      />
    </label>
  );
}

function BotonEntrar() {
  // useFormStatus tiene que vivir en un componente hijo del <form>, no en el
  // mismo que lo declara.
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={clasesBoton("principal", "w-full")}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}
