import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para el PANEL, del lado del servidor.
//
// Usa la clave anónima + la sesión del carnicero guardada en cookies, así que
// todas las lecturas pasan por Row Level Security: aunque una consulta se
// olvidara de filtrar por carnicería, la base no devolvería filas de otra.
//
// Contraste con src/lib/supabaseAdmin.ts, que usa la service_role key y saltea
// RLS. Ese es solo para el backend del bot y para las escrituras de negocio del
// panel, siempre después de verificar a mano que el usuario es dueño de la
// carnicería que está tocando.
//
// La service_role NUNCA llega al navegador: el panel se renderiza en el
// servidor y lo único que viaja al cliente es HTML y la anon key.

function credenciales(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno."
    );
  }

  return { url, anonKey };
}

/**
 * Cliente atado a la sesión del usuario. Se puede usar en Server Components,
 * Server Actions y Route Handlers.
 */
export async function getSupabaseServidor(): Promise<SupabaseClient> {
  // `cookies()` primero, a propósito: leer cookies marca la ruta como dinámica.
  // Si se chequearan las credenciales antes, Next intentaría prerenderizar el
  // panel en el build y fallaría ahí en vez de en la request, que es donde el
  // error se puede explicar bien.
  const almacenCookies = await cookies();
  const { url, anonKey } = credenciales();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesNuevas) {
        try {
          for (const { name, value, options } of cookiesNuevas) {
            almacenCookies.set(name, value, options);
          }
        } catch {
          // Desde un Server Component no se pueden escribir cookies. No es un
          // problema: el refresco de la sesión lo hace `proxy.ts` en cada
          // navegación, que sí puede escribirlas.
        }
      },
    },
  });
}
