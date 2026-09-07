import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirAdmin, listarCarnicerias } from "@/lib/panel/admin";
import { AccionesCarniceria } from "@/components/panel/acciones-admin";
import { Etiqueta, Tarjeta, TarjetaEncabezado } from "@/components/panel/ui";
import { formatearFechaYHora, formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

export default async function DetalleCarniceriaAdmin(props: PageProps<"/panel/admin/[id]">) {
  await requerirAdmin();
  const { id } = await props.params;

  const carnicerias = await listarCarnicerias();
  const carniceria = carnicerias.find((c) => c.id === id);
  if (!carniceria) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link href="/panel/admin" className="text-sm font-semibold text-brand">
        ← Volver a administración
      </Link>

      <Tarjeta>
        <TarjetaEncabezado
          titulo={carniceria.nombreVisible}
          descripcion={
            carniceria.telefonoWhatsapp
              ? formatearTelefono(carniceria.telefonoWhatsapp)
              : "Sin número de WhatsApp"
          }
          accion={
            <Etiqueta tono={carniceria.activa ? "exito" : "neutro"}>
              {carniceria.activa ? "Activa" : "Inactiva"}
            </Etiqueta>
          }
        />

        <dl className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <Dato etiqueta="Proveedor" valor={carniceria.proveedor} />
          <Dato etiqueta="Estado del alta" valor={carniceria.altaEstado} />
          <Dato etiqueta="Phone Number ID" valor={carniceria.phoneNumberId ?? "—"} mono />
          <Dato etiqueta="WABA ID" valor={carniceria.wabaId ?? "—"} mono />
          <Dato
            etiqueta="Token de la carnicería"
            valor={carniceria.tieneToken ? "Guardado" : "No hay"}
            ayuda={
              carniceria.tieneToken
                ? "Es secreto: no se muestra ni se puede leer desde el navegador."
                : undefined
            }
          />
          <Dato
            etiqueta="Webhooks"
            valor={
              carniceria.webhooksSuscritosAt
                ? `Suscritos ${formatearFechaYHora(carniceria.webhooksSuscritosAt)}`
                : "Sin suscribir"
            }
          />
          <Dato
            etiqueta="Última actividad"
            valor={
              carniceria.ultimaActividadAt
                ? formatearRelativo(carniceria.ultimaActividadAt)
                : "Sin registro"
            }
          />
          <Dato
            etiqueta="Usuario del panel"
            valor={carniceria.tieneDueno ? "Enlazado" : "Falta enlazar"}
          />
        </dl>
      </Tarjeta>

      <AccionesCarniceria
        carniceriaId={carniceria.id}
        proveedor={carniceria.proveedor}
        tieneToken={carniceria.tieneToken}
        webhooksSuscritos={Boolean(carniceria.webhooksSuscritosAt)}
      />
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  ayuda,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  ayuda?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-titulo text-xs font-semibold uppercase tracking-wide text-ink-3">
        {etiqueta}
      </dt>
      <dd className={`mt-0.5 break-all text-sm text-ink ${mono ? "numero" : ""}`}>{valor}</dd>
      {ayuda ? <dd className="text-xs text-ink-3">{ayuda}</dd> : null}
    </div>
  );
}
