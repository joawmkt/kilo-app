"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tarjeta, clasesBoton } from "./ui";
import { finalizarConexion } from "@/app/panel/(interno)/conectar/acciones";

// El botón que abre el Embedded Signup de Meta.
//
// Cómo funciona el flujo, y por qué el código está armado así:
//
//   1. El SDK de Facebook abre una ventana emergente con el flujo de Meta.
//   2. Mientras el carnicero avanza, la ventana le manda a la nuestra eventos
//      por `postMessage` con los identificadores (WABA ID y phone number ID).
//   3. Al terminar, el callback de `FB.login` devuelve un CÓDIGO DE UN SOLO USO.
//   4. Ese código VIVE UNOS 30 SEGUNDOS. Se manda al servidor de inmediato para
//      canjearlo por el token permanente. Nunca se canjea en el navegador: el
//      secreto de la app no puede estar acá.
//
// Los identificadores llegan por el paso 2 y el código por el paso 3, en ese
// orden y por vías distintas — por eso se guardan en una referencia y no en el
// estado: hay que tenerlos disponibles dentro del callback sin esperar a que
// React vuelva a renderizar.

type DatosDeSesion = {
  wabaId: string | null;
  phoneNumberId: string | null;
  telefono: string | null;
};

type RespuestaLogin = {
  authResponse?: { code?: string };
  status?: string;
};

type FacebookSdk = {
  init: (opciones: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (respuesta: RespuestaLogin) => void,
    opciones: {
      config_id: string;
      response_type: string;
      override_default_response_type: boolean;
      extras: { setup: Record<string, unknown>; featureType: string; sessionInfoVersion: string };
    }
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const VERSION_SDK = "v25.0";

export function BotonConectar({ appId, configId }: { appId: string; configId: string }) {
  const [sdkListo, setSdkListo] = useState(false);
  const [estado, setEstado] = useState<"inicial" | "abriendo" | "guardando" | "ok" | "error">(
    "inicial"
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const datos = useRef<DatosDeSesion>({ wabaId: null, phoneNumberId: null, telefono: null });

  // Paso 2: la ventana de Meta nos manda los identificadores mientras el
  // carnicero avanza por el flujo.
  useEffect(() => {
    function alRecibirMensaje(evento: MessageEvent) {
      if (evento.origin !== "https://www.facebook.com" && evento.origin !== "https://web.facebook.com") {
        return;
      }
      try {
        const contenido = JSON.parse(evento.data as string) as {
          type?: string;
          event?: string;
          data?: { waba_id?: string; phone_number_id?: string; display_phone_number?: string };
        };

        if (contenido.type !== "WA_EMBEDDED_SIGNUP") return;

        if (contenido.event === "FINISH" || contenido.event === "FINISH_ONLY_WABA") {
          datos.current = {
            wabaId: contenido.data?.waba_id ?? null,
            phoneNumberId: contenido.data?.phone_number_id ?? null,
            telefono: contenido.data?.display_phone_number ?? null,
          };
        }

        if (contenido.event === "CANCEL") {
          setEstado("inicial");
          setMensaje("Cancelaste la conexión. Podés volver a empezar cuando quieras.");
        }
      } catch {
        // Facebook manda por este canal mensajes que no son JSON; se ignoran.
      }
    }

    window.addEventListener("message", alRecibirMensaje);
    return () => window.removeEventListener("message", alRecibirMensaje);
  }, []);

  const iniciarSdk = useCallback(() => {
    window.FB?.init({
      appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: VERSION_SDK,
    });
    setSdkListo(true);
  }, [appId]);

  function abrirFlujo() {
    if (!window.FB) return;
    setEstado("abriendo");
    setMensaje(null);
    datos.current = { wabaId: null, phoneNumberId: null, telefono: null };

    window.FB.login(
      (respuesta) => {
        const codigo = respuesta.authResponse?.code;

        if (!codigo) {
          setEstado("inicial");
          setMensaje("No se completó la conexión. Podés intentarlo de nuevo.");
          return;
        }

        // Paso 4: contrarreloj. El código vence en unos 30 segundos.
        setEstado("guardando");
        void finalizarConexion({
          codigo,
          wabaId: datos.current.wabaId ?? "",
          phoneNumberId: datos.current.phoneNumberId ?? "",
          telefonoMostrado: datos.current.telefono,
        }).then((resultado) => {
          setEstado(resultado.ok ? "ok" : "error");
          setMensaje(resultado.mensaje);
        });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          // Coexistencia: el carnicero conserva su número y su app.
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  return (
    <Tarjeta className="p-4 sm:p-5" as="div">
      <Script
        src="https://connect.facebook.net/es_LA/sdk.js"
        strategy="afterInteractive"
        onLoad={iniciarSdk}
      />

      <h2 className="font-titulo text-base font-semibold text-ink">Conectar el número</h2>
      <p className="mt-1 text-sm text-ink-2">
        Se abre una ventana de Meta. Vas a elegir tu cuenta, poner el número y escanear un código QR
        desde el celular de la carnicería. No salís de acá.
      </p>

      <button
        type="button"
        disabled={!sdkListo || estado === "abriendo" || estado === "guardando" || estado === "ok"}
        onClick={abrirFlujo}
        className={clasesBoton("principal", "mt-4 w-full sm:w-auto")}
      >
        {!sdkListo
          ? "Cargando…"
          : estado === "abriendo"
            ? "Seguí en la ventana de Meta…"
            : estado === "guardando"
              ? "Terminando la conexión…"
              : estado === "ok"
                ? "Conectado"
                : "Conectar mi WhatsApp"}
      </button>

      {estado === "guardando" ? (
        <p className="mt-3 text-sm text-ink-2">
          No cierres esta pestaña. Estamos terminando de conectar el número.
        </p>
      ) : null}

      {mensaje ? (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            estado === "ok"
              ? "bg-success-soft text-success"
              : estado === "error"
                ? "bg-danger-soft text-danger"
                : "bg-surface-2 text-ink-2"
          }`}
        >
          {mensaje}
        </p>
      ) : null}
    </Tarjeta>
  );
}
