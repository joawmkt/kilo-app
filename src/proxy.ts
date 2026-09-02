import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Proxy (lo que en versiones anteriores de Next.js se llamaba middleware).
//
// Hace dos cosas, y ninguna de las dos es "autorizar":
//
//   1. Refresca la sesión de Supabase en cada navegación y reescribe las
//      cookies. Sin esto la sesión se vence sola y el carnicero se encuentra
//      deslogueado en medio del día.
//   2. Manda al login a quien entra a /panel sin sesión, para ahorrarle el
//      renderizado de una pantalla que no va a poder ver.
//
// El punto 2 es una comodidad, no la seguridad del sistema. La autorización
// real vive en cada pantalla (`requerirSesion`) y en Row Level Security, que es
// lo que hace que una carnicería no pueda ver los datos de otra ni aunque algo
// acá falle.

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin credenciales no hay sesión que refrescar. No se rompe la navegación:
  // la pantalla va a mostrar el error de configuración con su propio texto.
  if (!url || !anonKey) return respuesta;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesNuevas) {
        for (const { name, value } of cookiesNuevas) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesNuevas) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esRutaPublicaDelPanel = ruta === "/panel/login" || ruta.startsWith("/panel/auth");

  if (!user && ruta.startsWith("/panel") && !esRutaPublicaDelPanel) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/panel/login";
    // Para volver a donde quería ir después de loguearse.
    destino.searchParams.set("volver", ruta);
    return NextResponse.redirect(destino);
  }

  if (user && ruta === "/panel/login") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/panel";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  // Solo el panel. Las rutas de API del bot (webhooks, cron) no llevan sesión
  // de usuario y no tienen por qué pasar por acá: se autentican con la firma
  // del proveedor o con CRON_SECRET.
  matcher: ["/panel/:path*"],
};
