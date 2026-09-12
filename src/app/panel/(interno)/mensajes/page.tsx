import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { EncabezadoPantalla, EstadoVacio, Etiqueta, Tarjeta } from "@/components/panel/ui";
import { formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { minutosRestantesDeVentana, ventanaAbierta } from "@/lib/whatsapp/conversaciones";

// Mensajería — lista de conversaciones.
//
// ⚠️ Nota honesta sobre los no leídos: con coexistencia el carnicero sigue
// usando su app de WhatsApp en el celular, y un mensaje que ya leyó ahí no se
// marca solo acá. El contador es una ayuda, no la verdad, y la pantalla lo dice
// en vez de fingir que es exacto.

export default async function MensajesPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();

  const { data, error } = await supabase
    .from("conversaciones")
    .select(
      "id, telefono, cliente_id, es_carnicero, ultimo_mensaje_at, ultimo_mensaje_direccion, ultimo_mensaje_preview, ventana_24h_vence_at, no_leidos, clientes(nombre)"
    )
    .eq("archivada", false)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const conversaciones = ((data ?? []) as unknown as FilaConversacion[]).map((fila) => {
    const cliente = Array.isArray(fila.clientes) ? fila.clientes[0] : fila.clientes;
    return {
      id: fila.id,
      telefono: fila.telefono,
      nombre: cliente?.nombre ?? null,
      esCarnicero: fila.es_carnicero,
      ultimoAt: fila.ultimo_mensaje_at,
      preview: fila.ultimo_mensaje_preview,
      direccion: fila.ultimo_mensaje_direccion,
      ventanaVence: fila.ventana_24h_vence_at,
      noLeidos: Number(fila.no_leidos ?? 0),
    };
  });

  const deClientes = conversaciones.filter((conversacion) => !conversacion.esCarnicero);
  const delLocal = conversaciones.filter((conversacion) => conversacion.esCarnicero);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EncabezadoPantalla titulo="Mensajes" descripcion="Todo lo que se habló por el WhatsApp de la carnicería, y desde acá podés contestar." />

      <p className="rounded-tarjeta border border-border bg-surface-2 px-4 py-3 text-sm text-ink-2">
        Seguís teniendo WhatsApp en el celular como siempre: esto no lo reemplaza. Los mensajes que
        mandes desde el celular también aparecen acá, pero el contador de no leídos puede no
        coincidir con lo que ya viste allá.
      </p>

      {conversaciones.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no hay conversaciones"
            descripcion="Cuando alguien le escriba al WhatsApp de la carnicería, la conversación va a aparecer acá con todo el ida y vuelta."
          />
        </Tarjeta>
      ) : (
        <>
          <Grupo titulo="Clientes" conversaciones={deClientes} />
          {delLocal.length > 0 ? <Grupo titulo="Del local" conversaciones={delLocal} /> : null}
        </>
      )}
    </div>
  );
}

type ConversacionListada = {
  id: string;
  telefono: string;
  nombre: string | null;
  esCarnicero: boolean;
  ultimoAt: string | null;
  preview: string | null;
  direccion: string | null;
  ventanaVence: string | null;
  noLeidos: number;
};

function Grupo({ titulo, conversaciones }: { titulo: string; conversaciones: ConversacionListada[] }) {
  if (conversaciones.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 font-titulo text-sm font-semibold text-ink-2">
        {titulo}
      </h2>

      <Tarjeta>
        <ul>
          {conversaciones.map((conversacion) => {
            const abierta = ventanaAbierta(conversacion.ventanaVence);
            const minutos = minutosRestantesDeVentana(conversacion.ventanaVence);

            return (
              <li key={conversacion.id}>
                <Link
                  href={`/panel/mensajes/${conversacion.id}`}
                  className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-titulo text-sm font-semibold text-ink">
                        {conversacion.nombre ?? formatearTelefono(conversacion.telefono)}
                      </span>
                      {conversacion.noLeidos > 0 ? (
                        <span className="numero shrink-0 rounded-full bg-brand px-1.5 text-xs font-bold text-brand-contraste">
                          {conversacion.noLeidos}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">
                      {conversacion.direccion === "saliente" ? "Vos: " : ""}
                      {conversacion.preview ?? "Sin mensajes"}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-ink-3">
                      {conversacion.ultimoAt ? formatearRelativo(conversacion.ultimoAt) : ""}
                    </span>
                    {abierta && minutos !== null && minutos < 180 ? (
                      <Etiqueta tono="atencion">Quedan {Math.round(minutos / 60) || 1} h</Etiqueta>
                    ) : !abierta ? (
                      <Etiqueta tono="neutro">Solo plantilla</Etiqueta>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </section>
  );
}

type FilaConversacion = {
  id: string;
  telefono: string;
  cliente_id: string | null;
  es_carnicero: boolean;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_direccion: string | null;
  ultimo_mensaje_preview: string | null;
  ventana_24h_vence_at: string | null;
  no_leidos: number;
  clientes: { nombre: string | null } | { nombre: string | null }[] | null;
};
