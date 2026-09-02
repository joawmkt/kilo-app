import { redirect } from "next/navigation";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Quién está usando el panel y qué carnicería le corresponde.
//
// Una cuenta = una carnicería (`carnicerias.owner_user_id`). Toda pantalla del
// panel arranca por acá: si no hay sesión, al login; si hay sesión pero ninguna
// carnicería asociada, a una pantalla que lo explica en vez de romper.

export type SesionCarnicero = {
  usuarioId: string;
  email: string | null;
  carniceria: CarniceriaDelPanel;
};

export type CarniceriaDelPanel = {
  id: string;
  nombre: string;
  nombreVisible: string;
  direccion: string | null;
  telefonoContacto: string | null;
  emailContacto: string | null;
  umbralStockBajoDefault: number;
  horariosModo: "hibrido" | "bloquea" | "informativo";
  whatsappProveedor: "twilio" | "meta";
  telefonoWhatsapp: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappUltimaActividadAt: string | null;
  whatsappConectadoAt: string | null;
};

const CAMPOS_CARNICERIA =
  "id, nombre, nombre_visible, direccion, telefono_contacto, email_contacto, umbral_stock_bajo_default, horarios_modo, whatsapp_proveedor, telefono_whatsapp, whatsapp_phone_number_id, whatsapp_ultima_actividad_at, whatsapp_conectado_at";

type FilaCarniceria = {
  id: string;
  nombre: string;
  nombre_visible: string | null;
  direccion: string | null;
  telefono_contacto: string | null;
  email_contacto: string | null;
  umbral_stock_bajo_default: number | string;
  horarios_modo: string;
  whatsapp_proveedor: string;
  telefono_whatsapp: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_ultima_actividad_at: string | null;
  whatsapp_conectado_at: string | null;
};

function mapear(fila: FilaCarniceria): CarniceriaDelPanel {
  return {
    id: fila.id,
    nombre: fila.nombre,
    nombreVisible: fila.nombre_visible ?? fila.nombre,
    direccion: fila.direccion,
    telefonoContacto: fila.telefono_contacto,
    emailContacto: fila.email_contacto,
    umbralStockBajoDefault: Number(fila.umbral_stock_bajo_default ?? 3),
    horariosModo: (fila.horarios_modo as CarniceriaDelPanel["horariosModo"]) ?? "hibrido",
    whatsappProveedor: (fila.whatsapp_proveedor as CarniceriaDelPanel["whatsappProveedor"]) ?? "twilio",
    telefonoWhatsapp: fila.telefono_whatsapp,
    whatsappPhoneNumberId: fila.whatsapp_phone_number_id,
    whatsappUltimaActividadAt: fila.whatsapp_ultima_actividad_at,
    whatsappConectadoAt: fila.whatsapp_conectado_at,
  };
}

/**
 * Sesión del panel. Si no hay usuario logueado, redirige al login.
 * Si el usuario no tiene carnicería asociada, redirige a /panel/sin-carniceria.
 */
export async function requerirSesion(): Promise<SesionCarnicero> {
  const supabase = await getSupabaseServidor();

  // getUser() valida el token contra Supabase. getSession() lee la cookie sin
  // validarla, y por eso no sirve para decidir si alguien puede entrar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/panel/login");

  const { data, error } = await supabase
    .from("carnicerias")
    .select(CAMPOS_CARNICERIA)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la carnicería del usuario: ${error.message}`);
  }
  if (!data) redirect("/panel/sin-carniceria");

  return {
    usuarioId: user.id,
    email: user.email ?? null,
    carniceria: mapear(data as FilaCarniceria),
  };
}

/**
 * Igual que requerirSesion, pero para escrituras: además de la sesión devuelve
 * el cliente con service_role, ya sabiendo que el usuario es dueño de esa
 * carnicería.
 *
 * El chequeo de propiedad lo hace requerirSesion (lee `carnicerias` con RLS, o
 * sea que solo puede devolver la carnicería del propio usuario). Recién después
 * se usa la service_role, y siempre filtrando por ese `carniceria_id`.
 */
export async function requerirSesionParaEscribir(): Promise<{
  sesion: SesionCarnicero;
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
}> {
  const sesion = await requerirSesion();
  return { sesion, supabaseAdmin: getSupabaseAdmin() };
}
