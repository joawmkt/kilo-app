"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServidor } from "@/lib/supabaseServidor";

// Acciones de sesión del panel.
//
// Van por Server Actions y no por una ruta de API para que el formulario
// funcione aunque el JavaScript no haya cargado todavía — cosa que en una
// carnicería con conexión de celular pasa más seguido de lo que uno cree.

export type EstadoLogin = { error: string | null };

export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  datos: FormData
): Promise<EstadoLogin> {
  const email = String(datos.get("email") ?? "").trim();
  const contrasena = String(datos.get("contrasena") ?? "");
  const volver = String(datos.get("volver") ?? "/panel");

  if (!email || !contrasena) {
    return { error: "Escribí tu correo y tu contraseña." };
  }

  const supabase = await getSupabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena });

  if (error) {
    // Sin jerga técnica y sin revelar si el correo existe o no.
    return { error: "El correo o la contraseña no coinciden. Probá de nuevo." };
  }

  revalidatePath("/panel", "layout");
  // Solo rutas internas: un `volver` con una URL externa sería un redirect
  // abierto, que es la forma más fácil de usar un login ajeno para phishing.
  redirect(volver.startsWith("/panel") ? volver : "/panel");
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await getSupabaseServidor();
  await supabase.auth.signOut();
  revalidatePath("/panel", "layout");
  redirect("/panel/login");
}
