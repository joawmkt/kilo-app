import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { EstadoVacio, Etiqueta, Tarjeta, TarjetaEncabezado } from "@/components/panel/ui";
import type { TonoEtiqueta } from "@/components/panel/ui";

// Plantillas de Meta.
//
// MODELO CENTRALIZADO (decisión pendiente 4.3 del brief, versión recomendada
// para v1): las plantillas del sistema las crea y mantiene la plataforma,
// iguales para todas las carnicerías. El panel solo MUESTRA cuáles hay y en qué
// estado de aprobación están.
//
// Por qué no se deja que cada carnicería escriba las suyas todavía: si el
// carnicero escribe una plantilla con lenguaje promocional y la manda como
// "utility", Meta la recategoriza como marketing y le cobra cinco veces más.
// Habilitarlo requiere validaciones y advertencias que todavía no existen.

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Sin mandar a aprobar",
  pendiente: "Esperando a Meta",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  pausada: "Pausada",
  deshabilitada: "Deshabilitada",
};

const TONO_ESTADO: Record<string, TonoEtiqueta> = {
  borrador: "neutro",
  pendiente: "atencion",
  aprobada: "exito",
  rechazada: "problema",
  pausada: "atencion",
  deshabilitada: "problema",
};

const ETIQUETA_CATEGORIA: Record<string, string> = {
  utility: "Aviso de servicio",
  marketing: "Promocional",
  authentication: "Código de acceso",
};

export default async function PlantillasPage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const { data, error } = await supabase
    .from("plantillas_meta")
    .select("id, nombre, idioma, categoria, encabezado, cuerpo, pie, variables, estado, motivo_rechazo, es_del_sistema")
    .order("nombre");

  if (error) throw new Error(error.message);

  const plantillas = (data ?? []) as unknown as FilaPlantilla[];
  const enMeta = sesion.carniceria.whatsappProveedor === "meta";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Plantillas</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Los mensajes que se le pueden mandar a un cliente después de 24 horas sin hablar.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
        <p className="font-titulo text-sm font-semibold text-ink">Para qué sirven</p>
        <p className="mt-1 text-sm text-ink-2">
          Cuando un cliente te escribe se abre una ventana de 24 horas en la que le podés contestar
          lo que quieras. Pasado ese plazo, WhatsApp solo deja mandarle uno de estos mensajes, que
          tienen que estar aprobados por Meta de antemano. Es lo que usa el sistema, por ejemplo,
          para el recordatorio de un pedido que se hizo ayer.
        </p>
        <p className="mt-2 text-sm text-ink-2">
          Las escribimos y las mantenemos nosotros, iguales para todas las carnicerías. Vos las ves
          acá para saber con qué se cuenta y si Meta las aprobó.
        </p>
      </div>

      {!enMeta ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          Tu carnicería todavía está conectada por Twilio. Las plantillas empiezan a usarse cuando el
          número pase a la API de Meta; hasta entonces esta lista es informativa.
        </div>
      ) : null}

      <Tarjeta>
        <TarjetaEncabezado titulo="Plantillas del sistema" />

        {plantillas.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hay plantillas"
            descripcion="Cuando se carguen las plantillas del sistema, acá vas a ver cada una con su texto y su estado de aprobación."
          />
        ) : (
          <ul>
            {plantillas.map((plantilla) => (
              <li key={plantilla.id} className="border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-titulo text-sm font-semibold text-ink">
                      {nombreLegible(plantilla.nombre)}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {ETIQUETA_CATEGORIA[plantilla.categoria] ?? plantilla.categoria} ·{" "}
                      {plantilla.idioma}
                    </p>
                  </div>
                  <Etiqueta tono={TONO_ESTADO[plantilla.estado] ?? "neutro"}>
                    {ETIQUETA_ESTADO[plantilla.estado] ?? plantilla.estado}
                  </Etiqueta>
                </div>

                {/* Vista previa de cómo le llega el mensaje al cliente, con las
                    variables reemplazadas por ejemplos. Un texto con {{1}} y
                    {{2}} no le dice nada a nadie. */}
                <div className="mt-3 rounded-2xl bg-surface-2 px-3 py-2">
                  {plantilla.encabezado ? (
                    <p className="text-sm font-semibold text-ink">{plantilla.encabezado}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {conEjemplos(plantilla.cuerpo, plantilla.variables)}
                  </p>
                  {plantilla.pie ? <p className="mt-1 text-xs text-ink-3">{plantilla.pie}</p> : null}
                </div>

                {plantilla.estado === "rechazada" && plantilla.motivo_rechazo ? (
                  <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <span className="font-semibold">Meta la rechazó:</span> {plantilla.motivo_rechazo}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

function nombreLegible(nombre: string): string {
  return nombre.replace(/_/g, " ").replace(/^\w/, (letra) => letra.toUpperCase());
}

/** Reemplaza {{1}}, {{2}}… por los ejemplos cargados, para la vista previa. */
function conEjemplos(cuerpo: string, variables: VariablePlantilla[] | null): string {
  if (!variables || variables.length === 0) return cuerpo;

  let resultado = cuerpo;
  for (const variable of variables) {
    resultado = resultado.replaceAll(`{{${variable.posicion}}}`, variable.ejemplo ?? "…");
  }
  return resultado;
}

type VariablePlantilla = { posicion: number; descripcion?: string; ejemplo?: string };

type FilaPlantilla = {
  id: string;
  nombre: string;
  idioma: string;
  categoria: string;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  variables: VariablePlantilla[] | null;
  estado: string;
  motivo_rechazo: string | null;
  es_del_sistema: boolean;
};
