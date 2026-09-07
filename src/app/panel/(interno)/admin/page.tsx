import Link from "next/link";
import { requerirAdmin, armarChecklist, listarCarnicerias } from "@/lib/panel/admin";
import {
  EstadoVacio,
  Etiqueta,
  NumeroGrande,
  Tarjeta,
  TarjetaEncabezado,
} from "@/components/panel/ui";
import type { TonoEtiqueta } from "@/components/panel/ui";
import { formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { MARCA, PRODUCTO } from "@/lib/marca";

// Panel de administración — la vista del fundador, no la del carnicero.
//
// Dos cosas que el panel del carnicero no puede mostrar:
//   1. Todas las carnicerías juntas, con su estado de conexión y su uso.
//   2. Qué falta para que el sistema esté andando sobre Meta, chequeado contra
//      el estado real y no contra una lista escrita a mano.

const TONO_ESTADO_ALTA: Record<string, TonoEtiqueta> = {
  pendiente: "neutro",
  conectando: "atencion",
  conectada: "exito",
  error: "problema",
};

const ETIQUETA_PROVEEDOR: Record<string, string> = {
  meta: "Meta",
  twilio: "Twilio",
  simulado: "Simulado",
};

const TONO_PUNTO: Record<string, TonoEtiqueta> = {
  listo: "exito",
  parcial: "atencion",
  pendiente: "neutro",
};

const ETIQUETA_PUNTO: Record<string, string> = {
  listo: "Listo",
  parcial: "A medias",
  pendiente: "Falta",
};

export default async function AdminPage() {
  await requerirAdmin();

  const [carnicerias, checklist] = await Promise.all([listarCarnicerias(), armarChecklist()]);

  const listos = checklist.filter((punto) => punto.estado === "listo").length;
  const enMeta = carnicerias.filter((c) => c.proveedor === "meta").length;
  const pedidosDelMes = carnicerias.reduce((suma, c) => suma + c.pedidosDelMes, 0);
  const mensajesDelMes = carnicerias.reduce(
    (suma, c) => suma + c.mensajesEnviados + c.mensajesRecibidos,
    0
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Administración</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          {MARCA} · {PRODUCTO} — todas las carnicerías y el estado de la plataforma.
        </p>
      </header>

      <Tarjeta className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumeroGrande valor={String(carnicerias.length)} etiqueta="Carnicerías" />
          <NumeroGrande
            valor={String(enMeta)}
            etiqueta="En Meta"
            ayuda={`${carnicerias.length - enMeta} todavía no`}
          />
          <NumeroGrande valor={String(pedidosDelMes)} etiqueta="Pedidos del mes" />
          <NumeroGrande
            valor={String(mensajesDelMes)}
            etiqueta="Mensajes del mes"
            ayuda="El insumo para calcular el costo variable"
          />
        </div>
      </Tarjeta>

      {/* ---------------------------------------------------------
          Checklist de puesta en marcha
          --------------------------------------------------------- */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Qué falta para estar en producción"
          descripcion={`${listos} de ${checklist.length} pasos completos`}
        />

        <ul className="divide-y divide-border">
          {checklist.map((punto) => (
            <li key={punto.clave} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-titulo text-sm font-semibold text-ink">
                    {punto.titulo}
                    {punto.esTramite ? (
                      <span className="ml-2 text-xs font-normal text-ink-3">trámite</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-2">{punto.detalle}</p>
                  {punto.estado !== "listo" && punto.accion ? (
                    <p className="mt-1 text-xs text-ink-3">→ {punto.accion}</p>
                  ) : null}
                </div>
                <Etiqueta tono={TONO_PUNTO[punto.estado]}>{ETIQUETA_PUNTO[punto.estado]}</Etiqueta>
              </div>
            </li>
          ))}
        </ul>

        <p className="border-t border-border px-4 py-3 text-xs text-ink-3 sm:px-5">
          Lo marcado como <strong>trámite</strong> no depende de programar: son pasos ante Meta que
          tardan por burocracia. Todo lo demás del sistema ya está construido y se enciende cuando
          esas variables existan.
        </p>
      </Tarjeta>

      {/* ---------------------------------------------------------
          Carnicerías
          --------------------------------------------------------- */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Carnicerías"
          descripcion="Estado de conexión y uso del mes en curso"
        />

        {carnicerias.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay ninguna carnicería"
            descripcion="Cuando des de alta la primera, va a aparecer acá con su estado de conexión."
          />
        ) : (
          <ul className="divide-y divide-border">
            {carnicerias.map((carniceria) => (
              <li key={carniceria.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-titulo text-sm font-semibold text-ink">
                      {carniceria.nombreVisible}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {carniceria.telefonoWhatsapp
                        ? formatearTelefono(carniceria.telefonoWhatsapp)
                        : "Sin número"}
                      {" · "}
                      {ETIQUETA_PROVEEDOR[carniceria.proveedor] ?? carniceria.proveedor}
                      {carniceria.ultimaActividadAt
                        ? ` · actividad ${formatearRelativo(carniceria.ultimaActividadAt)}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!carniceria.tieneDueno ? (
                      <Etiqueta tono="atencion">Sin usuario</Etiqueta>
                    ) : null}
                    {carniceria.proveedor === "meta" && !carniceria.webhooksSuscritosAt ? (
                      <Etiqueta tono="problema">Sin webhooks</Etiqueta>
                    ) : null}
                    <Etiqueta tono={TONO_ESTADO_ALTA[carniceria.altaEstado] ?? "neutro"}>
                      {carniceria.altaEstado}
                    </Etiqueta>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <Dato etiqueta="Pedidos" valor={String(carniceria.pedidosDelMes)} />
                  <Dato etiqueta="Enviados" valor={String(carniceria.mensajesEnviados)} />
                  <Dato etiqueta="Recibidos" valor={String(carniceria.mensajesRecibidos)} />
                  <Dato etiqueta="Audios" valor={String(carniceria.audios)} />
                </div>

                {/* El problema más silencioso de todo el proceso de Meta: el alta
                    figura exitosa pero los mensajes nunca llegan. */}
                {carniceria.proveedor === "meta" &&
                carniceria.tieneToken &&
                !carniceria.webhooksSuscritosAt ? (
                  <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2">
                    <p className="text-sm text-danger">
                      Esta carnicería tiene las credenciales guardadas pero no quedó suscrita a los
                      webhooks. Los mensajes de sus clientes no van a llegar nunca.
                    </p>
                    <Link
                      href={`/panel/admin/${carniceria.id}`}
                      className="mt-1 inline-block font-titulo text-sm font-semibold text-danger underline"
                    >
                      Reintentar la suscripción
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta className="p-4 sm:p-5">
        <h2 className="font-titulo text-base font-semibold text-ink">Dar de alta una carnicería</h2>
        <p className="mt-1 text-sm text-ink-2">
          Son tres pasos, y por ahora dos son a mano en Supabase porque involucran crear un usuario:
        </p>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-ink-2">
          <li>
            Crear la fila en <span className="numero text-xs">carnicerias</span> con su nombre y su
            número, en modo <span className="numero text-xs">simulado</span> para poder probar.
          </li>
          <li>
            Crear el usuario en Supabase Auth y enlazarlo:{" "}
            <span className="numero text-xs">
              update carnicerias set owner_user_id = &lsquo;…&rsquo; where id = &lsquo;…&rsquo;
            </span>
            .
          </li>
          <li>
            Cargar su catálogo y sus números autorizados, y pasarle el link de{" "}
            <Link href="/conectar" className="font-semibold text-brand">
              /conectar
            </Link>{" "}
            cuando Meta esté habilitado.
          </li>
        </ol>
      </Tarjeta>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="font-titulo text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {etiqueta}
      </p>
      <p className="numero text-base font-semibold text-ink">{valor}</p>
    </div>
  );
}
