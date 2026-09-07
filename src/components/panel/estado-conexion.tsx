import Link from "next/link";
import { Tarjeta, TarjetaEncabezado, Etiqueta, clasesBoton } from "./ui";
import { evaluarConexion } from "./aviso-conexion";
import type { CarniceriaDelPanel } from "@/lib/panel/sesion";
import { formatearFechaYHora, formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

// Estado de la conexión de WhatsApp, en detalle.
//
// El aviso corto vive en Inicio (aviso-conexion.tsx). Acá está la explicación
// completa, incluido el porqué de la regla de los 14 días: si el carnicero no
// entiende de dónde sale el pedido de "abrí la app", lo va a ignorar hasta que
// se le corte el servicio.

export function EstadoConexionWhatsapp({ carniceria }: { carniceria: CarniceriaDelPanel }) {
  const estado = evaluarConexion(carniceria);

  const tono =
    estado.nivel === "ok"
      ? "exito"
      : estado.nivel === "por_vencer"
        ? "atencion"
        : "problema";

  const etiqueta =
    estado.nivel === "ok"
      ? "Conectado"
      : estado.nivel === "por_vencer"
        ? "Por cortarse"
        : estado.nivel === "cortada"
          ? "Cortado"
          : "Sin configurar";

  return (
    <Tarjeta>
      <TarjetaEncabezado
        titulo="Conexión de WhatsApp"
        descripcion="El estado del número por el que atiende el bot"
        accion={<Etiqueta tono={tono}>{etiqueta}</Etiqueta>}
      />

      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-2 gap-4">
          <Dato
            etiqueta="Número"
            valor={
              carniceria.telefonoWhatsapp
                ? formatearTelefono(carniceria.telefonoWhatsapp)
                : "Sin configurar"
            }
          />
          <Dato
            etiqueta="Vía"
            valor={
              carniceria.whatsappProveedor === "meta"
                ? "API de Meta"
                : carniceria.whatsappProveedor === "simulado"
                  ? "Simulado (no sale a WhatsApp)"
                  : "Twilio"
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Dato
            etiqueta="Última actividad"
            valor={
              carniceria.whatsappUltimaActividadAt
                ? formatearRelativo(carniceria.whatsappUltimaActividadAt)
                : "Sin registro todavía"
            }
            ayuda={
              carniceria.whatsappUltimaActividadAt
                ? formatearFechaYHora(carniceria.whatsappUltimaActividadAt)
                : undefined
            }
          />
          <Dato
            etiqueta="Conectado desde"
            valor={
              carniceria.whatsappConectadoAt
                ? formatearFechaYHora(carniceria.whatsappConectadoAt)
                : "—"
            }
          />
        </div>

        {carniceria.whatsappProveedor !== "meta" || !carniceria.whatsappPhoneNumberId ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
            <p className="font-titulo text-sm font-semibold text-ink">
              Todavía no está conectado a WhatsApp
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {carniceria.whatsappProveedor === "simulado"
                ? "Estás en modo simulado: podés probar todo, pero los mensajes no salen a WhatsApp de verdad."
                : "Este número anda por el proveedor viejo. Conectarlo con Meta es un trámite de unos minutos."}
            </p>
            <Link href="/panel/conectar" className={clasesBoton("principal", "mt-3")}>
              Conectar WhatsApp
            </Link>
          </div>
        ) : null}

        {estado.nivel !== "ok" ? (
          <p
            className={`rounded-lg px-3 py-2.5 text-sm ${
              estado.nivel === "por_vencer"
                ? "bg-warning-soft text-warning"
                : "bg-danger-soft text-danger"
            }`}
          >
            <span className="font-semibold">{estado.titulo}.</span> {estado.descripcion}
          </p>
        ) : null}

        {/* La explicación de la regla, siempre visible. Es el tipo de cosa que
            nadie lee hasta que la necesita, y para entonces tiene que estar. */}
        <div className="rounded-lg bg-surface-2 px-3 py-3 text-sm text-ink-2">
          <p className="font-titulo font-semibold text-ink">Por qué hay que abrir WhatsApp</p>
          <p className="mt-1">
            Tu número funciona en dos lados a la vez: la app de WhatsApp del celular, que usás como
            siempre, y el bot. Para que sigan sincronizados, WhatsApp pide que la app se abra en el
            celular al menos una vez cada 14 días. Si pasa más tiempo, la conexión se corta sola y el
            bot deja de contestar sin avisar. Con abrir la app un segundo alcanza.
          </p>
        </div>
      </div>
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  return (
    <div>
      <p className="font-titulo text-xs font-semibold uppercase tracking-wide text-ink-3">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-ink">{valor}</p>
      {ayuda ? <p className="text-xs text-ink-3">{ayuda}</p> : null}
    </div>
  );
}
