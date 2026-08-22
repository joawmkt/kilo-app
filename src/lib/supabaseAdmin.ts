import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para uso EXCLUSIVO del backend (rutas de API).
// Usa la service_role key, que ignora Row Level Security — por eso
// este archivo nunca debe importarse desde código que corre en el
// navegador (componentes de cliente, "use client").
//
// Se crea de forma perezosa (lazy) para que Next.js pueda analizar
// las rutas en build time sin que falte todavía la variable de entorno.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
    );
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
