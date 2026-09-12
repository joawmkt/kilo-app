import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { cerrarSesion } from "@/app/panel/login/acciones";
import {
  FormularioDatosDelNegocio,
  FormularioHorarios,
  DiasEspeciales,
  MediosPago,
  Promociones,
  SustitutosAutorizados,
  type FilaPromocion,
  type FilaSustituto,
  type OpcionProducto,
} from "@/components/panel/configuracion-formularios";
import { EstadoConexionWhatsapp } from "@/components/panel/estado-conexion";
import { clasesBoton, EncabezadoPantalla, Tarjeta, TarjetaEncabezado } from "@/components/panel/ui";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";

export default async function ConfiguracionPage() {
  const sesion = await requerirSesion();
  const supabase = await getSupabaseServidor();

  const [
    { data: horarios },
    { data: diasEspeciales },
    { data: numeros },
    { data: promociones },
    { data: sustitutos },
    { data: productos },
  ] = await Promise.all([
    supabase
      .from("horarios_atencion")
      .select("dia_semana, cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
      .order("dia_semana"),
    supabase
      .from("dias_especiales")
      .select("id, fecha, cerrado, motivo")
      .gte("fecha", new Date().toISOString().slice(0, 10))
      .order("fecha"),
    supabase.from("numeros_carnicero").select("telefono, nombre, activo").eq("activo", true),
      supabase
        .from("promociones")
        .select("id, titulo, detalle, activa, desde, hasta")
        .order("created_at", { ascending: false }),
      supabase
        .from("sustitutos_autorizados")
        .select("id, requiere_preguntar_uso, producto:producto_id(nombre_display), sustituto:sustituto_id(nombre_display)")
        .order("prioridad", { ascending: true }),
      supabase
        .from("productos")
        .select("id, nombre_display")
        .eq("activo", true)
        .eq("es_complementario", false)
        .order("nombre_display"),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EncabezadoPantalla titulo="Configuración" descripcion="Los datos de tu carnicería y cómo atiende el bot." />

      {/* La conexión de WhatsApp va primero: es la falla más probable en
          producción y la más silenciosa. */}
      <EstadoConexionWhatsapp carniceria={sesion.carniceria} />

      <FormularioDatosDelNegocio carniceria={sesion.carniceria} />

      <FormularioHorarios
        horarios={(horarios ?? []) as FilaHorario[]}
        modo={sesion.carniceria.horariosModo}
      />

      <DiasEspeciales dias={(diasEspeciales ?? []) as FilaDiaEspecial[]} />

      {/* Medios de pago y promociones: los dos existen para que el bot pueda
          contestar sin inventar (especificación, secciones 17 y 19). Van acá y
          no en una sección propia porque son configuración del negocio, igual
          que los horarios y la dirección. */}
      <MediosPago habilitados={sesion.carniceria.mediosPago} />

      <Promociones promociones={(promociones ?? []) as FilaPromocion[]} />

      <SustitutosAutorizados
        sustitutos={((sustitutos ?? []) as unknown[]).map((fila) => {
          const f = fila as {
            id: string;
            requiere_preguntar_uso: boolean;
            producto: { nombre_display: string } | { nombre_display: string }[] | null;
            sustituto: { nombre_display: string } | { nombre_display: string }[] | null;
          };
          const nombreDe = (v: typeof f.producto) =>
            (Array.isArray(v) ? v[0]?.nombre_display : v?.nombre_display) ?? "—";
          return {
            id: f.id,
            productoNombre: nombreDe(f.producto),
            sustitutoNombre: nombreDe(f.sustituto),
            preguntarUso: Boolean(f.requiere_preguntar_uso),
          } satisfies FilaSustituto;
        })}
        productos={((productos ?? []) as { id: string; nombre_display: string }[]).map((p) => ({
          id: p.id,
          nombre: p.nombre_display,
        })) satisfies OpcionProducto[]}
      />

      {/* Quién puede cargar stock por audio. Es solo lectura por ahora: dar de
          alta un número nuevo implica que ese teléfono pase a poder modificar
          el stock, y conviene que lo hagamos nosotros hasta tener el flujo de
          alta resuelto. */}
      <Tarjeta>
        <TarjetaEncabezado
          titulo="Quién puede cargar stock por audio"
          descripcion="Estos números entran al flujo de stock; cualquier otro entra como cliente"
        />
        <ul className="px-4 py-3 sm:px-5">
          {(numeros ?? []).length === 0 ? (
            <li className="text-sm text-ink-2">
              Todavía no hay ningún número autorizado. Sin esto, los audios de stock se interpretan
              como pedidos de un cliente. Escribinos y lo cargamos.
            </li>
          ) : (
            (numeros ?? []).map((numero) => (
              <li
                key={numero.telefono as string}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
              >
                <span className="text-sm text-ink">{(numero.nombre as string) ?? "Sin nombre"}</span>
                <span className="numero text-sm text-ink-2">
                  {formatearTelefono(numero.telefono as string)}
                </span>
              </li>
            ))
          )}
        </ul>
      </Tarjeta>

      <Tarjeta className="p-4 sm:p-5">
        <h2 className="font-titulo text-base font-semibold text-ink">Tu cuenta</h2>
        <p className="mt-1 text-sm text-ink-2">{sesion.email}</p>
        <form action={cerrarSesion} className="mt-3">
          <button type="submit" className={clasesBoton("secundario")}>
            Cerrar sesión
          </button>
        </form>
      </Tarjeta>
    </div>
  );
}

export type FilaHorario = {
  dia_semana: number;
  cerrado: boolean;
  turno1_desde: string | null;
  turno1_hasta: string | null;
  turno2_desde: string | null;
  turno2_hasta: string | null;
};

export type FilaDiaEspecial = {
  id: string;
  fecha: string;
  cerrado: boolean;
  motivo: string | null;
};
