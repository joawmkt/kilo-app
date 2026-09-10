import { getSupabaseAdmin } from "./supabaseAdmin";
import { enviarWhatsapp } from "./whatsapp";
import { formatearHoraArgentina } from "./tiempo";
import { registrarEvento } from "./pedidoEventos";
import { crearAviso } from "./notificaciones";
import type { ItemGuardadoPedido } from "./flujoPedidos";

// ============================================================
// Rechazo conversado con el carnicero — especificación, secciones 36 y 50
// ============================================================
//
// Un rechazo NO es el final del pedido. La sección 36 lo dice de entrada: "el
// rechazo no significa necesariamente fin del pedido". Casi siempre el problema
// es de tiempo o de stock, y los dos tienen salida — pero la salida la tiene
// que elegir el carnicero, no el bot.
//
// Cómo funciona, y por qué así:
//
//   1. El carnicero rechaza. El bot no le avisa nada al cliente todavía.
//   2. El bot le pregunta POR QUÉ, con tres opciones numeradas.
//   3. Según la respuesta le ofrece salidas concretas, también numeradas.
//   4. El carnicero contesta con un número (o varios: "2 y 3").
//   5. El bot traduce esa decisión a una conversación normal con el cliente.
//
// Los números son deliberados (sección 55.5): no son una botonera de cliente,
// son un mecanismo interno para que el carnicero resuelva desde el mostrador
// escribiendo un solo carácter. La experiencia conversacional del cliente no
// cambia en nada.

export type PasoConsulta = "motivo" | "demora" | "stock" | "otro";

export type OpcionConsulta = { numero: number; etiqueta: string; valor: string };

export type ConsultaCarnicero = {
  paso: PasoConsulta;
  opciones: OpcionConsulta[];
};

const MOTIVOS: OpcionConsulta[] = [
  { numero: 1, etiqueta: "Falta de tiempo", valor: "tiempo" },
  { numero: 2, etiqueta: "Falta de stock", valor: "stock" },
  { numero: 3, etiqueta: "Otro", valor: "otro" },
];

const SALIDAS_POR_TIEMPO: OpcionConsulta[] = [
  { numero: 1, etiqueta: "Posponer 1 hora", valor: "mas_1h" },
  { numero: 2, etiqueta: "Posponer 3 horas", valor: "mas_3h" },
  { numero: 3, etiqueta: "Pasar para mañana", valor: "manana" },
];

function listar(opciones: OpcionConsulta[]): string {
  return opciones.map((o) => `${o.numero}. ${o.etiqueta}`).join("\n");
}

/** Interpreta "2", "2 y 3", "1,3" — el carnicero escribe como quiere. */
export function numerosElegidos(texto: string): number[] {
  const encontrados = texto.match(/\d+/g) ?? [];
  const numeros = encontrados.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(numeros));
}

async function guardarConsulta(pedidoId: string, consulta: ConsultaCarnicero | null): Promise<void> {
  await getSupabaseAdmin()
    .from("pedidos")
    .update({ consulta_carnicero: consulta, updated_at: new Date().toISOString() })
    .eq("id", pedidoId);
}

/**
 * Arranca el rechazo: en vez de dar el pedido por perdido, le pregunta al
 * carnicero por qué no puede.
 *
 * Devuelve el texto para mandarle al carnicero.
 */
export async function iniciarRechazo(pedidoId: string): Promise<string> {
  await guardarConsulta(pedidoId, { paso: "motivo", opciones: MOTIVOS });
  return `¿Por qué no podés aprobar este pedido?\n${listar(MOTIVOS)}`;
}

/** ¿Hay una consulta abierta esperando respuesta del carnicero? */
export async function consultaAbierta(carniceriaId: string): Promise<{
  pedidoId: string;
  consulta: ConsultaCarnicero;
  telefonoCliente: string;
  clienteNombre: string | null;
  horaRetiro: string | null;
  items: ItemGuardadoPedido[];
} | null> {
  const { data } = await getSupabaseAdmin()
    .from("pedidos")
    .select("id, consulta_carnicero, telefono, hora_retiro, items, clientes(nombre)")
    .eq("carniceria_id", carniceriaId)
    .not("consulta_carnicero", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.consulta_carnicero) return null;

  const cliente = data.clientes as { nombre: string | null } | { nombre: string | null }[] | null;
  const nombre = Array.isArray(cliente) ? (cliente[0]?.nombre ?? null) : (cliente?.nombre ?? null);

  return {
    pedidoId: data.id as string,
    consulta: data.consulta_carnicero as ConsultaCarnicero,
    telefonoCliente: data.telefono as string,
    clienteNombre: nombre,
    horaRetiro: (data.hora_retiro as string | null) ?? null,
    items: (data.items ?? []) as ItemGuardadoPedido[],
  };
}

/**
 * Procesa lo que el carnicero contestó a una consulta abierta.
 *
 * Devuelve el texto para el carnicero, o `null` si el mensaje no era una
 * respuesta a esta consulta (y entonces tiene que seguir su camino normal).
 */
export async function responderConsultaCarnicero(params: {
  carniceriaId: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, texto } = params;
  const abierta = await consultaAbierta(carniceriaId);
  if (!abierta) return null;

  const numeros = numerosElegidos(texto);
  if (numeros.length === 0) return null;

  const { pedidoId, consulta, telefonoCliente, horaRetiro, items } = abierta;

  // ------------------------------------------------------------
  // Paso 1 — por qué no puede
  // ------------------------------------------------------------
  if (consulta.paso === "motivo") {
    const elegido = consulta.opciones.find((o) => o.numero === numeros[0]);
    if (!elegido) return `No entendí el número. Contestá con ${consulta.opciones.map((o) => o.numero).join(", ")}.`;

    await getSupabaseAdmin().from("pedidos").update({ rechazo_motivo: elegido.valor }).eq("id", pedidoId);

    if (elegido.valor === "tiempo") {
      await guardarConsulta(pedidoId, { paso: "demora", opciones: SALIDAS_POR_TIEMPO });
      return `¿Qué le podemos ofrecer?\n${listar(SALIDAS_POR_TIEMPO)}`;
    }

    if (elegido.valor === "stock") {
      // Se enumeran los productos del pedido para que diga cuáles faltan.
      const opciones: OpcionConsulta[] = items.map((item, i) => ({
        numero: i + 1,
        etiqueta: item.nombre_display,
        valor: item.producto_id,
      }));

      if (opciones.length === 0) {
        await guardarConsulta(pedidoId, null);
        return "Ese pedido no tiene productos cargados. Lo dejo rechazado y le aviso al cliente.";
      }

      await guardarConsulta(pedidoId, { paso: "stock", opciones });
      return `¿De qué falta stock? Podés decirme varios (ej: "2 y 3").\n${listar(opciones)}`;
    }

    // "Otro": no se inventa una salida. Se cierra el pedido y se le avisa al
    // cliente sin dar un motivo que el carnicero no dio (sección 1.3).
    await guardarConsulta(pedidoId, null);
    await rechazarDefinitivo({ carniceriaId, pedidoId, telefonoCliente });
    return "Listo, lo doy de baja y le aviso al cliente. Si querés escribirle algo puntual, hacelo desde el panel.";
  }

  // ------------------------------------------------------------
  // Paso 2a — falta de tiempo: se propone otro horario
  // ------------------------------------------------------------
  if (consulta.paso === "demora") {
    const elegido = consulta.opciones.find((o) => o.numero === numeros[0]);
    if (!elegido) return `No entendí el número. Contestá con ${consulta.opciones.map((o) => o.numero).join(", ")}.`;

    const base = horaRetiro ? new Date(horaRetiro) : new Date();
    const propuesta = new Date(base);
    if (elegido.valor === "mas_1h") propuesta.setHours(propuesta.getHours() + 1);
    else if (elegido.valor === "mas_3h") propuesta.setHours(propuesta.getHours() + 3);
    else propuesta.setDate(propuesta.getDate() + 1);

    await guardarConsulta(pedidoId, null);

    // El pedido queda esperando que el CLIENTE acepte el horario nuevo. No se
    // aprueba solo: la sección 36.2 dice que el bot propone y obtiene
    // aceptación antes de seguir.
    await getSupabaseAdmin()
      .from("pedidos")
      .update({
        estado: "pendiente_confirmacion_cliente",
        hora_retiro: propuesta.toISOString(),
        hora_retiro_original: horaRetiro,
        pregunta_pendiente: null,
        interpretacion: { fase: "esperando_confirmacion_final" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedidoId);

    const esManana = elegido.valor === "manana";
    const mensajeCliente = esManana
      ? `Perdón, hoy no llegamos a prepararte el pedido 🙈 ¿Te sirve si te lo dejamos para mañana a las ${formatearHoraArgentina(propuesta)} hs?`
      : `Perdón, estamos a full y no llegamos para esa hora. ¿Te sirve a las ${formatearHoraArgentina(propuesta)} hs?`;

    await enviarWhatsapp({
      carniceriaId,
      hacia: telefonoCliente,
      cuerpo: mensajeCliente,
      origen: "bot",
      pedidoId,
    });

    await registrarEvento({
      pedidoId,
      carniceriaId,
      tipo: "hora_cambiada",
      actor: "carnicero",
      descripcion: `El carnicero no llegaba: se le propuso al cliente retirar a las ${formatearHoraArgentina(propuesta)} hs.`,
      detalle: { anterior: horaRetiro, propuesta: propuesta.toISOString() },
    });

    return `Listo, le propuse las ${formatearHoraArgentina(propuesta)} hs. Te aviso cuando conteste 🙌`;
  }

  // ------------------------------------------------------------
  // Paso 2b — falta de stock: se marcan agotados y se rearma el pedido
  // ------------------------------------------------------------
  if (consulta.paso === "stock") {
    const faltantes = consulta.opciones.filter((o) => numeros.includes(o.numero));
    if (faltantes.length === 0) {
      return `No entendí los números. Contestá con ${consulta.opciones.map((o) => o.numero).join(", ")}.`;
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Sección 37: si el carnicero dice que se terminó, el stock va a 0 y deja
    // de ofrecerse a todo el mundo, no solo a este cliente.
    for (const faltante of faltantes) {
      await supabaseAdmin
        .from("productos")
        .update({ stock_actual: 0, stock_actualizado_at: new Date().toISOString() })
        .eq("id", faltante.valor);
    }

    await registrarEvento({
      pedidoId,
      carniceriaId,
      tipo: "stock_actualizado",
      actor: "carnicero",
      descripcion: `Se marcó sin stock: ${faltantes.map((f) => f.etiqueta).join(", ")}.`,
      detalle: { productos: faltantes.map((f) => f.valor) },
    });

    // El pedido vuelve a armarse sin esos productos: el bot le cuenta al
    // cliente y le ofrece seguir. La búsqueda de sustitutos la hace el flujo
    // normal cuando el cliente conteste.
    const quedan = items.filter((item) => !faltantes.some((f) => f.valor === item.producto_id));

    await guardarConsulta(pedidoId, null);
    await supabaseAdmin
      .from("pedidos")
      .update({
        estado: quedan.length > 0 ? "pendiente_aclaracion" : "cancelado",
        items: quedan,
        interpretacion: null,
        pregunta_pendiente: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedidoId);

    const faltantesTexto = faltantes.map((f) => f.etiqueta).join(", ");
    const mensajeCliente =
      quedan.length > 0
        ? `Uy, me quedé sin ${faltantesTexto} 🙈 El resto del pedido lo tengo. ¿Querés que lo reemplace por otra cosa parecida, o lo dejamos sin eso?`
        : `Uy, me quedé sin ${faltantesTexto} 🙈 ¿Querés que veamos alguna otra opción?`;

    await enviarWhatsapp({
      carniceriaId,
      hacia: telefonoCliente,
      cuerpo: mensajeCliente,
      origen: "bot",
      pedidoId,
    });

    return `Listo, marqué sin stock: ${faltantesTexto}. Ya le avisé al cliente y sigo yo 🙌`;
  }

  return null;
}

/** Rechazo sin vuelta atrás: se cierra el pedido y se le avisa al cliente. */
async function rechazarDefinitivo(params: {
  carniceriaId: string;
  pedidoId: string;
  telefonoCliente: string;
}): Promise<void> {
  const { carniceriaId, pedidoId, telefonoCliente } = params;

  await getSupabaseAdmin()
    .from("pedidos")
    .update({
      estado: "rechazado",
      rechazado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      consulta_carnicero: null,
    })
    .eq("id", pedidoId);

  await registrarEvento({
    pedidoId,
    carniceriaId,
    tipo: "rechazado",
    actor: "carnicero",
    descripcion: "El carnicero rechazó el pedido sin una alternativa.",
  });

  await enviarWhatsapp({
    carniceriaId,
    hacia: telefonoCliente,
    cuerpo: "Uy, no pudimos tomar tu pedido en este momento. Cualquier cosa, escribinos de nuevo 🙏",
    origen: "bot",
    pedidoId,
  });

  await crearAviso({
    carniceriaId,
    tipo: "pedido_cancelado",
    titulo: "Se rechazó un pedido",
    cuerpo: "Se le avisó al cliente.",
    enlace: `/panel/pedidos/${pedidoId}`,
    entidadTipo: "pedido",
    entidadId: pedidoId,
  });
}
