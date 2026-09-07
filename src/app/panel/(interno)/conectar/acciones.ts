"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/panel/sesion";
import { completarAlta, type ResultadoAlta } from "@/lib/whatsapp/alta";

// El navegador transporta el código de un solo uso hasta acá y nada más.
//
// El canje por el token permanente pasa del lado del servidor porque el código
// vive unos 30 segundos y porque el secreto de la aplicación de Meta no puede
// salir del servidor. Ver src/lib/whatsapp/alta.ts.

export async function finalizarConexion(datos: {
  codigo: string;
  wabaId: string;
  phoneNumberId: string;
  telefonoMostrado?: string | null;
}): Promise<ResultadoAlta> {
  const sesion = await requerirSesion();

  if (!datos.codigo || !datos.wabaId || !datos.phoneNumberId) {
    return {
      ok: false,
      mensaje: "El flujo de Meta no devolvió todos los datos. Probá de nuevo desde el principio.",
    };
  }

  const resultado = await completarAlta({
    carniceriaId: sesion.carniceria.id,
    codigo: datos.codigo,
    wabaId: datos.wabaId,
    phoneNumberId: datos.phoneNumberId,
    telefonoMostrado: datos.telefonoMostrado ?? null,
  });

  revalidatePath("/panel/conectar");
  revalidatePath("/panel/configuracion");
  revalidatePath("/panel", "layout");

  return resultado;
}
