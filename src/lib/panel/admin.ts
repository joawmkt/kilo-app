import { redirect } from "next/navigation";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Autorización del panel de administración.
//
// El panel del carnicero muestra UNA carnicería, y Row Level Security garantiza
// que no pueda ver otra. El panel de administración muestra TODAS, así que RLS
// no lo protege: la autorización tiene que ser explícita.
//
// Se resuelve con la tabla `administradores` (migración 0014). El chequeo se
// hace con la sesión del usuario y su policy propia — un usuario solo puede leer
// su propia fila, así que si la consulta devuelve algo, es administrador.
//
// Recién después de ese chequeo se usa la service_role para leer todas las
// carnicerías. Igual que en el resto del panel: primero se verifica quién es,
// después se usa la llave que abre todo.

export type SesionAdmin = {
  usuarioId: string;
  email: string | null;
  nombre: string | null;
};

/** Si el usuario no es administrador, lo saca de acá. */
export async function requerirAdmin(): Promise<SesionAdmin> {
  const supabase = await getSupabaseServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/panel/login?volver=/panel/admin");

  const { data } = await supabase
    .from("administradores")
    .select("user_id, email, nombre")
    .eq("user_id", user.id)
    .maybeSingle();

  // Un carnicero que llega acá de casualidad vuelve a su panel, no ve un error.
  if (!data) redirect("/panel");

  return {
    usuarioId: user.id,
    email: (data.email as string | null) ?? user.email ?? null,
    nombre: (data.nombre as string | null) ?? null,
  };
}

/** ¿Este usuario es administrador? Para decidir si mostrar el acceso. */
export async function esAdmin(): Promise<boolean> {
  try {
    const supabase = await getSupabaseServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("administradores")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
}

// ============================================================
// Datos de todas las carnicerías
// ============================================================

export type CarniceriaEnAdmin = {
  id: string;
  nombre: string;
  nombreVisible: string;
  telefonoWhatsapp: string | null;
  proveedor: "twilio" | "meta" | "simulado";
  altaEstado: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  tieneToken: boolean;
  webhooksSuscritosAt: string | null;
  ultimaActividadAt: string | null;
  conectadaAt: string | null;
  activa: boolean;
  tieneDueno: boolean;
  creadaAt: string;
  // Métricas del mes en curso
  pedidosDelMes: number;
  mensajesEnviados: number;
  mensajesRecibidos: number;
  audios: number;
};

export async function listarCarnicerias(): Promise<CarniceriaEnAdmin[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("carnicerias")
    .select(
      "id, nombre, nombre_visible, telefono_whatsapp, whatsapp_proveedor, alta_estado, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_token, webhooks_suscritos_at, whatsapp_ultima_actividad_at, whatsapp_conectado_at, activa, owner_user_id, created_at"
    )
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as FilaCarniceria[];
  const periodo = primerDiaDelMes();

  const [{ data: usos }, { data: pedidos }] = await Promise.all([
    supabaseAdmin
      .from("uso_mensual")
      .select("carniceria_id, mensajes_enviados, mensajes_recibidos, audios_transcriptos")
      .eq("periodo", periodo),
    supabaseAdmin
      .from("pedidos")
      .select("carniceria_id")
      .gte("created_at", `${periodo}T00:00:00Z`)
      .not("estado", "in", "(pendiente_aclaracion,vencido)"),
  ]);

  const usoPorCarniceria = new Map(
    ((usos ?? []) as FilaUso[]).map((fila) => [fila.carniceria_id, fila])
  );

  const pedidosPorCarniceria = new Map<string, number>();
  for (const fila of (pedidos ?? []) as { carniceria_id: string }[]) {
    pedidosPorCarniceria.set(fila.carniceria_id, (pedidosPorCarniceria.get(fila.carniceria_id) ?? 0) + 1);
  }

  return filas.map((fila) => {
    const uso = usoPorCarniceria.get(fila.id);
    return {
      id: fila.id,
      nombre: fila.nombre,
      nombreVisible: fila.nombre_visible ?? fila.nombre,
      telefonoWhatsapp: fila.telefono_whatsapp,
      proveedor: (fila.whatsapp_proveedor as CarniceriaEnAdmin["proveedor"]) ?? "twilio",
      altaEstado: fila.alta_estado ?? "pendiente",
      phoneNumberId: fila.whatsapp_phone_number_id,
      wabaId: fila.whatsapp_waba_id,
      // El token nunca se devuelve, solo si existe.
      tieneToken: Boolean(fila.whatsapp_token),
      webhooksSuscritosAt: fila.webhooks_suscritos_at,
      ultimaActividadAt: fila.whatsapp_ultima_actividad_at,
      conectadaAt: fila.whatsapp_conectado_at,
      activa: fila.activa,
      tieneDueno: Boolean(fila.owner_user_id),
      creadaAt: fila.created_at,
      pedidosDelMes: pedidosPorCarniceria.get(fila.id) ?? 0,
      mensajesEnviados: Number(uso?.mensajes_enviados ?? 0),
      mensajesRecibidos: Number(uso?.mensajes_recibidos ?? 0),
      audios: Number(uso?.audios_transcriptos ?? 0),
    };
  });
}

function primerDiaDelMes(): string {
  const ahora = new Date(Date.now() - 3 * 3600 * 1000); // hora Argentina
  return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

type FilaCarniceria = {
  id: string;
  nombre: string;
  nombre_visible: string | null;
  telefono_whatsapp: string | null;
  whatsapp_proveedor: string;
  alta_estado: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_token: string | null;
  webhooks_suscritos_at: string | null;
  whatsapp_ultima_actividad_at: string | null;
  whatsapp_conectado_at: string | null;
  activa: boolean;
  owner_user_id: string | null;
  created_at: string;
};

type FilaUso = {
  carniceria_id: string;
  mensajes_enviados: number;
  mensajes_recibidos: number;
  audios_transcriptos: number;
};

// ============================================================
// Checklist de puesta en marcha
// ============================================================
//
// Qué falta para que el sistema esté andando sobre Meta. Se chequea contra el
// estado real —variables cargadas, plantillas aprobadas, webhooks suscritos— y
// no contra una lista escrita a mano que se desactualiza sola.

export type PuntoDelChecklist = {
  clave: string;
  titulo: string;
  detalle: string;
  estado: "listo" | "pendiente" | "parcial";
  /** Qué hacer, si está pendiente. */
  accion?: string;
  /** Este paso es un trámite ante Meta, no trabajo nuestro. */
  esTramite?: boolean;
};

export async function armarChecklist(): Promise<PuntoDelChecklist[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const [{ data: plantillas }, carnicerias] = await Promise.all([
    supabaseAdmin.from("plantillas_meta").select("nombre, estado").is("carniceria_id", null),
    listarCarnicerias(),
  ]);

  const aprobadas = ((plantillas ?? []) as { nombre: string; estado: string }[]).filter(
    (plantilla) => plantilla.estado === "aprobada"
  ).length;
  const totalPlantillas = (plantillas ?? []).length;

  const enMeta = carnicerias.filter((c) => c.proveedor === "meta");
  const conWebhooks = enMeta.filter((c) => c.webhooksSuscritosAt);

  const puntos: PuntoDelChecklist[] = [
    {
      clave: "verificacion",
      titulo: "Verificación de negocio en Meta",
      detalle:
        "Empresa unipersonal, razón social igual a la constancia de ARCA carácter por carácter, Ainnova como nombre alternativo.",
      estado: process.env.META_APP_ID ? "listo" : "pendiente",
      accion: "business.facebook.com → Configuración del negocio → Centro de seguridad",
      esTramite: true,
    },
    {
      clave: "credenciales_envio",
      titulo: "Credenciales para mandar y recibir mensajes",
      detalle:
        "META_ACCESS_TOKEN (token permanente de System User, no el temporal de la consola), META_APP_SECRET y META_WEBHOOK_VERIFY_TOKEN.",
      estado: variablesDeEnvio(),
      accion: "Cargarlas en Vercel → Settings → Environment Variables",
    },
    {
      clave: "webhook_url",
      titulo: "Webhook dado de alta en Meta",
      detalle:
        "Apuntar a /api/webhook/meta y suscribirse a los campos «messages» y «message_echoes» (este último es el de coexistencia).",
      estado: process.env.META_WEBHOOK_VERIFY_TOKEN ? "parcial" : "pendiente",
      accion: "Panel de la app de Meta → WhatsApp → Configuración → Webhook",
      esTramite: true,
    },
    {
      clave: "plantillas",
      titulo: "Plantillas de utilidad aprobadas",
      detalle:
        totalPlantillas === 0
          ? "No hay plantillas cargadas en el sistema."
          : `${aprobadas} de ${totalPlantillas} aprobadas por Meta. Sin ellas, el recordatorio de un pedido hecho ayer no sale.`,
      estado: totalPlantillas > 0 && aprobadas === totalPlantillas ? "listo" : aprobadas > 0 ? "parcial" : "pendiente",
      accion: "Crearlas en el administrador de WhatsApp y esperar la aprobación",
      esTramite: true,
    },
    {
      clave: "embedded_signup",
      titulo: "Alta de carnicerías por Embedded Signup",
      detalle:
        "META_APP_ID y META_CONFIG_ID. El config ID sale del paso B6, después del registro como Tech Provider. La pantalla /panel/conectar ya está construida y se enciende sola cuando estas variables existan.",
      estado: process.env.META_APP_ID && process.env.META_CONFIG_ID ? "listo" : "pendiente",
      accion: "Registrarse como Tech Provider y crear la configuración de Embedded Signup",
      esTramite: true,
    },
    {
      clave: "carnicerias_conectadas",
      titulo: "Carnicerías conectadas a Meta",
      detalle:
        enMeta.length === 0
          ? `Ninguna todavía. Hay ${carnicerias.length} carnicería${carnicerias.length === 1 ? "" : "s"} en el sistema.`
          : `${conWebhooks.length} de ${enMeta.length} con los webhooks suscritos. Sin esa suscripción los mensajes no llegan, aunque el alta figure exitosa.`,
      estado:
        enMeta.length > 0 && conWebhooks.length === enMeta.length
          ? "listo"
          : enMeta.length > 0
            ? "parcial"
            : "pendiente",
      accion: "Conectar desde /panel/conectar, con el carnicero y su celular a mano",
    },
    {
      clave: "salir_de_simulado",
      titulo: "Salir del modo simulado",
      detalle: `${carnicerias.filter((c) => c.proveedor === "simulado").length} carnicería(s) todavía en simulado. Es lo esperable mientras se espera la habilitación de Meta.`,
      estado: carnicerias.some((c) => c.proveedor === "simulado") ? "pendiente" : "listo",
      accion: "Se hace solo al completar el alta: el flujo cambia el proveedor a meta",
    },
  ];

  return puntos;
}

function variablesDeEnvio(): "listo" | "parcial" | "pendiente" {
  const cargadas = [
    process.env.META_ACCESS_TOKEN,
    process.env.META_APP_SECRET,
    process.env.META_WEBHOOK_VERIFY_TOKEN,
  ].filter(Boolean).length;

  if (cargadas === 3) return "listo";
  if (cargadas > 0) return "parcial";
  return "pendiente";
}
