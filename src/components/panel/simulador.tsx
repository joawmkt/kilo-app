"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Tarjeta, TarjetaEncabezado, EstadoVacio, clasesBoton } from "./ui";
import { IconoEnviar } from "./iconos";
import { formatearHora } from "@/lib/panel/formatos";
import {
  enviarComoCliente,
  enviarComoCarnicero,
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

type Lado = "cliente" | "carnicero";

// El simulador tiene dos lados, y son dos personas distintas usando el mismo
// número de WhatsApp de la carnicería:
//
//   - Cliente: pide algo. El bot arma el pedido y espera que la carnicería lo
//     apruebe.
//   - Carnicero: carga stock hablando ("entraron 20 kilos de asado"). El bot
//     entiende, muestra el resumen y espera un "confirmar" antes de tocar nada.
//
// En los dos casos el mensaje que escribís es el ENTRANTE (lo mandó el
// interlocutor) y la respuesta del bot es el SALIENTE. Se rotula en cada
// burbuja para que nadie se pierda de qué lado está mirando.

export function Simulador({
  telefonoCliente,
  telefonoCarnicero,
  mensajesCliente,
  mensajesCarnicero,
  sinStock,
}: {
  telefonoCliente: string;
  telefonoCarnicero: string;
  mensajesCliente: MensajeSimulado[];
  mensajesCarnicero: MensajeSimulado[];
  sinStock: boolean;
}) {
  const [lado, setLado] = useState<Lado>("cliente");

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="De qué lado escribís"
        className="flex gap-1 rounded-tarjeta border border-border bg-surface-2 p-1"
      >
        <BotonSolapa activa={lado === "cliente"} onClick={() => setLado("cliente")} id="solapa-cliente">
          Como cliente
        </BotonSolapa>
        <BotonSolapa
          activa={lado === "carnicero"}
          onClick={() => setLado("carnicero")}
          id="solapa-carnicero"
        >
          Como carnicero
        </BotonSolapa>
      </div>

      {lado === "cliente" ? (
        <div key="cliente" role="tabpanel" aria-labelledby="solapa-cliente" className="flex flex-col gap-4">
          {sinStock ? (
            <div className="rounded-tarjeta border border-border bg-surface-2 px-4 py-3 text-sm text-ink-2">
              No hay ningún producto con stock cargado, así que el bot va a rechazar todo lo que
              pidas. Cargalo desde{" "}
              <Link href="/panel/stock" className="font-semibold text-brand">
                Stock
              </Link>{" "}
              o probá primero la solapa <strong>Como carnicero</strong>.
            </div>
          ) : null}

          <Conversacion
            key="conversacion-cliente"
            lado="cliente"
            titulo="Conversación de prueba"
            descripcion={`Cliente simulado ${telefonoCliente}`}
            etiquetaInterlocutor="Cliente simulado"
            mensajes={mensajesCliente}
            accionServidor={enviarComoCliente}
            marcador="Hola, quiero 2 kilos de asado para las 7…"
            vacioTitulo="Todavía no escribiste nada"
            vacioDescripcion="Mandá un mensaje abajo y el bot te va a contestar igual que le contestaría a un cliente."
            pie="Escribís como el cliente, no como la carnicería"
          />

          <QueProbarCliente />
        </div>
      ) : (
        <div key="carnicero" role="tabpanel" aria-labelledby="solapa-carnicero" className="flex flex-col gap-4">
          <div className="rounded-tarjeta border border-accent/40 bg-accent-soft px-4 py-3">
            <p className="font-titulo text-sm font-semibold text-ink">
              Probalo hablando, que es como se usa
            </p>
            <p className="mt-1 text-sm text-ink-2">
              El carnicero manda un audio mientras acomoda la mercadería, con las manos frías y la
              cámara de fondo. Grabá uno acá con el micrófono y vas a ver el recorrido completo:
              se transcribe, se entiende y se te muestra el resumen para confirmar. Escribir también
              sirve, pero es la versión fácil.
            </p>
          </div>

          <Conversacion
            key="conversacion-carnicero"
            lado="carnicero"
            titulo="Carga de stock de prueba"
            descripcion={`Carnicero simulado ${telefonoCarnicero}`}
            etiquetaInterlocutor="Carnicero simulado"
            mensajes={mensajesCarnicero}
            accionServidor={enviarComoCarnicero}
            marcador="Entraron 20 kilos de asado y 8 de vacío…"
            vacioTitulo="Probá cargar mercadería"
            vacioDescripcion="Escribí lo que dirías por audio al recibir la media res. El bot te va a mostrar el resumen y a pedirte que lo confirmes antes de tocar el stock."
            pie="Escribís como la carnicería, no como un cliente"
          />

          <QueProbarCarnicero />
        </div>
      )}
    </div>
  );
}

function BotonSolapa({
  activa,
  onClick,
  id,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`flex-1 rounded-control px-3 py-2 font-titulo text-sm font-semibold transition-colors ${
        activa ? "bg-surface text-ink shadow-tarjeta" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// Ojo con este componente: las dos solapas lo usan.
//
// Antes se renderizaba sin `key`, así que React reusaba la MISMA instancia al
// cambiar de solapa —el estado del formulario, el `useActionState` y todo lo
// demás quedaban compartidos entre el cliente y el carnicero— y por ahí se coló
// el bug del 10/09/2026: un mensaje escrito como cliente salió por la acción
// del carnicero. Las `key` de arriba son lo que hace que sean dos instancias
// distintas, y no un detalle de estilo.
//
// Aun así, la garantía de verdad no está acá: el servidor ya no le cree al
// navegador quién es quién (ver simulador/acciones.ts). Este componente ni
// siquiera conoce los números.
function Conversacion({
  lado,
  titulo,
  descripcion,
  etiquetaInterlocutor,
  mensajes,
  accionServidor,
  marcador,
  vacioTitulo,
  vacioDescripcion,
  pie,
}: {
  lado: "cliente" | "carnicero";
  titulo: string;
  descripcion: string;
  etiquetaInterlocutor: string;
  mensajes: MensajeSimulado[];
  accionServidor: (
    previo: ResultadoSimulacion | null,
    datos: FormData
  ) => Promise<ResultadoSimulacion>;
  marcador: string;
  vacioTitulo: string;
  vacioDescripcion: string;
  pie: string;
}) {
  const [estado, accion] = useActionState<ResultadoSimulacion | null, FormData>(
    accionServidor,
    null
  );
  const [limpiando, iniciarTransicion] = useTransition();
  const [avisoLimpieza, setAvisoLimpieza] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);

  return (
    <Tarjeta as="div">
      <TarjetaEncabezado
        titulo={titulo}
        descripcion={descripcion}
        accion={
          <button
            type="button"
            disabled={limpiando}
            onClick={() =>
              iniciarTransicion(async () => {
                const resultado = await limpiarConversacionDePrueba(lado);
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
          <EstadoVacio titulo={vacioTitulo} descripcion={vacioDescripcion} />
        ) : (
          <ol className="flex flex-col gap-2">
            {mensajes.map((mensaje) => {
              // "entrante" = lo escribiste vos, haciendo de interlocutor.
              const esDelInterlocutor = mensaje.direccion === "entrante";
              return (
                <li
                  key={mensaje.id}
                  className={`flex ${esDelInterlocutor ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                      esDelInterlocutor ? "bg-surface-2" : "bg-brand-soft"
                    }`}
                  >
                    <p className="mb-0.5 font-titulo text-xs font-semibold text-ink-3">
                      {esDelInterlocutor ? etiquetaInterlocutor : "Bot"}
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
        <label className="sr-only" htmlFor={`texto-${lado}`}>
          {pie}
        </label>
        <textarea
          id={`texto-${lado}`}
          name="texto"
          rows={2}
          required
          placeholder={marcador}
          className="w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-3">{pie}</span>
          <BotonEnviar />
        </div>

        <Grabador
          onEnviar={(archivo) => {
            const datos = new FormData();
            datos.set("audio", archivo, archivo.name);
            accion(datos);
          }}
        />

        {estado && !estado.ok ? (
          <p role="alert" className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {estado.mensaje}
          </p>
        ) : null}

        {avisoLimpieza ? (
          <p role="status" className="mt-2 rounded-control bg-success-soft px-3 py-2 text-sm text-success">
            {avisoLimpieza}
          </p>
        ) : null}
      </form>
    </Tarjeta>
  );
}

// Grabar un audio, que es como se usa esto de verdad.
//
// El carnicero tiene las manos ocupadas y frío: no va a escribir "entraron
// veinte kilos de asado", va a apretar el micrófono y hablar. Poder grabar acá
// hace que el simulador ejercite la parte que más se rompe —entender a alguien
// hablando con ruido de fondo y modismos del oficio— en vez de darla por buena.
//
// El archivo se manda al servidor y se transcribe ahí con la misma función que
// usa el webhook real. Nunca queda guardado: lo que se guarda es el texto.

type FormatoGrabacion = { mime: string; extension: string };

function formatoSoportado(): FormatoGrabacion | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidatos: FormatoGrabacion[] = [
    { mime: "audio/webm;codecs=opus", extension: "webm" },
    { mime: "audio/webm", extension: "webm" },
    { mime: "audio/ogg;codecs=opus", extension: "ogg" },
    { mime: "audio/mp4", extension: "m4a" },
  ];
  return candidatos.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

function Grabador({ onEnviar }: { onEnviar: (archivo: File) => void }) {
  const [estado, setEstado] = useState<"inactivo" | "grabando" | "listo">("inactivo");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [grabado, setGrabado] = useState<{ archivo: File; url: string } | null>(null);

  const grabadora = useRef<MediaRecorder | null>(null);
  const pedazos = useRef<Blob[]>([]);

  // El cronómetro mientras se graba. Se limpia solo al salir del estado.
  useEffect(() => {
    if (estado !== "grabando") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // Soltar la URL del preview y el micrófono si el componente desaparece.
  useEffect(() => {
    return () => {
      grabadora.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function descartar() {
    if (grabado) URL.revokeObjectURL(grabado.url);
    setGrabado(null);
    setSegundos(0);
    setEstado("inactivo");
  }

  async function empezar() {
    setError(null);

    const formato = formatoSoportado();
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no deja grabar audio acá. Podés subir un archivo con el botón de al lado.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No pude usar el micrófono. Permitilo en el candado de la barra de direcciones y probá de nuevo.");
      return;
    }

    pedazos.current = [];
    const rec = new MediaRecorder(stream, { mimeType: formato.mime });

    rec.ondataavailable = (evento) => {
      if (evento.data.size > 0) pedazos.current.push(evento.data);
    };

    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(pedazos.current, { type: formato.mime });
      if (blob.size === 0) {
        setError("La grabación salió vacía. Probá de nuevo.");
        setEstado("inactivo");
        return;
      }
      const archivo = new File([blob], `audio.${formato.extension}`, { type: formato.mime });
      setGrabado({ archivo, url: URL.createObjectURL(blob) });
      setEstado("listo");
    };

    grabadora.current = rec;
    setSegundos(0);
    rec.start();
    setEstado("grabando");
  }

  function detener() {
    grabadora.current?.stop();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {estado === "grabando" ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-danger">
            <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            Grabando <span className="numero">{formatearSegundos(segundos)}</span>
          </span>
          <button type="button" onClick={detener} className={clasesBoton("principal")}>
            Detener
          </button>
        </div>
      ) : estado === "listo" && grabado ? (
        <div className="flex flex-col gap-2">
          <audio controls src={grabado.url} className="w-full" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={descartar} className={clasesBoton("fantasma")}>
              Descartar
            </button>
            <button
              type="button"
              onClick={() => {
                onEnviar(grabado.archivo);
                descartar();
              }}
              className={clasesBoton("principal")}
            >
              Enviar audio
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={empezar} className={clasesBoton("secundario")}>
            🎙️ Grabar un audio
          </button>

          {/* El input real queda oculto y el label hace de botón. `focus-within`
              es lo que devuelve el anillo de foco: sin eso, quien navega con
              teclado llega al control y no ve dónde está parado. */}
          <label
            className={clasesBoton(
              "fantasma",
              "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand"
            )}
          >
            Subir un audio
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(evento) => {
                const archivo = evento.target.files?.[0];
                evento.target.value = "";
                if (archivo) onEnviar(archivo);
              }}
            />
          </label>

          <span className="text-xs text-ink-3">
            Como en WhatsApp. Se transcribe en el servidor; el audio no se guarda.
          </span>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatearSegundos(total: number): string {
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

function QueProbarCliente() {
  return (
    <Tarjeta className="p-4 sm:p-5">
      <h2 className="font-titulo text-base font-semibold text-ink">Qué probar como cliente</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
        <li>
          <strong className="text-ink">Un pedido normal:</strong> &ldquo;hola, quiero 2 kilos de
          asado para las 7 de la tarde&rdquo;.
        </li>
        <li>
          <strong className="text-ink">Un corte que no tenés:</strong> pedí algo que esté en cero y
          fijate si ofrece una alternativa parecida.
        </li>
        <li>
          <strong className="text-ink">Sin decir cantidades:</strong> &ldquo;quiero asado y
          chorizo&rdquo; — tiene que preguntarte para cuántos son y calcular los kilos.
        </li>
        <li>
          <strong className="text-ink">Una palabra ambigua:</strong> &ldquo;quiero tapa&rdquo; —
          tiene que preguntar cuál.
        </li>
        <li>
          <strong className="text-ink">Una hora que ya pasó:</strong> si son las 3 de la tarde,
          decile &ldquo;a las 11 de la mañana&rdquo; — tiene que avisarte y ofrecerte mañana.
        </li>
        <li>
          <strong className="text-ink">Después de armar el pedido:</strong> andá a{" "}
          <Link href="/panel" className="font-semibold text-brand">
            Inicio
          </Link>{" "}
          y aprobalo. El cliente simulado recibe la confirmación y se descuenta el stock.
        </li>
      </ul>
    </Tarjeta>
  );
}

function QueProbarCarnicero() {
  return (
    <Tarjeta className="p-4 sm:p-5">
      <h2 className="font-titulo text-base font-semibold text-ink">Qué probar como carnicero</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
        <li>
          <strong className="text-ink">Una entrada de mercadería, hablada:</strong> apretá{" "}
          <strong className="text-ink">Grabar un audio</strong> y decí &ldquo;entraron 20 kilos de
          asado y 8 de vacío&rdquo;. Mirá el resumen y contestá{" "}
          <strong className="text-ink">confirmar</strong>.
        </li>
        <li>
          <strong className="text-ink">Con ruido de verdad:</strong> grabá en el local, con la
          sierra o la radio de fondo. Es donde la transcripción se pone difícil, y es mejor saberlo
          ahora que delante de un cliente.
        </li>
        <li>
          <strong className="text-ink">Corregir antes de confirmar:</strong> cuando te muestre el
          resumen, decile &ldquo;no, eran 12 kilos de asado&rdquo; en vez de confirmar.
        </li>
        <li>
          <strong className="text-ink">Hablar como se habla:</strong> &ldquo;me quedaron tres kilos
          de matambre&rdquo;, &ldquo;se vendió todo el chorizo&rdquo; — no hay que decirlo de una
          forma especial.
        </li>
        <li>
          <strong className="text-ink">Algo ambiguo:</strong> &ldquo;entró tapa&rdquo; — tiene que
          preguntar cuál y cuánta, no inventar.
        </li>
        <li>
          <strong className="text-ink">Y después mirá el resultado:</strong> entrá a{" "}
          <Link href="/panel/stock" className="font-semibold text-brand">
            Stock
          </Link>{" "}
          y fijate los kilos actualizados. Nada se toca hasta que confirmás.
        </li>
      </ul>
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
