import { getSupabaseAdmin } from "./supabaseAdmin";

// Etapa 3 — clientes finales identificados por su número de WhatsApp
// (tabla `clientes`, ya existía sin uso desde la Etapa 1).

export type Cliente = {
  id: string;
  telefono: string;
  nombre: string | null;
  no_shows: number;
  esNuevo: boolean;
};

// Busca (o crea, si es la primera vez que escribe) el cliente asociado a un
// número de teléfono dentro de una carnicería. `nombreWhatsapp` es el
// ProfileName que manda Twilio (nombre de perfil de WhatsApp del cliente,
// cuando está disponible) — si el cliente todavía no tiene nombre guardado,
// se usa para poder saludarlo por nombre en las próximas conversaciones
// (respuesta provisoria a la pregunta 4 del Bloque A: "¿lo saluda por
// nombre si ya lo tenemos guardado?" — sí, usando el nombre de perfil de
// WhatsApp, no hay que pedírselo aparte).
export async function obtenerOCrearCliente(
  carniceriaId: string,
  telefono: string,
  nombreWhatsapp?: string | null
): Promise<Cliente> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: existente, error: errExistente } = await supabaseAdmin
    .from("clientes")
    .select("id, telefono, nombre, no_shows")
    .eq("carniceria_id", carniceriaId)
    .eq("telefono", telefono)
    .maybeSingle();

  if (errExistente) {
    throw new Error(`Error buscando cliente: ${errExistente.message}`);
  }

  if (existente) {
    // Si no teníamos nombre guardado y ahora tenemos un ProfileName, lo
    // completamos — pero nunca pisamos un nombre que ya esté cargado.
    if (!existente.nombre && nombreWhatsapp) {
      await supabaseAdmin.from("clientes").update({ nombre: nombreWhatsapp }).eq("id", existente.id);
      return { ...existente, nombre: nombreWhatsapp, esNuevo: false };
    }
    return { ...existente, esNuevo: false };
  }

  const { data: creado, error: errCreado } = await supabaseAdmin
    .from("clientes")
    .insert({ carniceria_id: carniceriaId, telefono, nombre: nombreWhatsapp ?? null })
    .select("id, telefono, nombre, no_shows")
    .single();

  if (errCreado || !creado) {
    throw new Error(`Error creando cliente: ${errCreado?.message}`);
  }

  return { ...creado, esNuevo: true };
}
