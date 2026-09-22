import { getSupabaseAdmin } from "./supabaseAdmin";
import { clasificarRespuesta } from "./confirmacion";
import { cargarCatalogo, type CatalogoCarniceria } from "./catalogo";
import { estimarTrozado, trozarConEstimacion, UNIDADES_POR_AVE, type SalidaEstimada } from "./lotes";
import { hablaDeTrozado, leerTrozado, normalizarTrozado, type VocabularioPresa } from "./lecturaTrozado";
import { variarSiSeRepite } from "./conversacion";

// ============================================================
// Trozar pollo hablando — "trocé 3 pollos y saqué 2,700 de pechuga"
// ============================================================
//
// Ver el comentario largo de `estimarTrozado` (lotes.ts) para la cuenta, y el
// de `lecturaTrozado.ts` para por qué se lee sin IA.
//
// El recorrido:
//   🎙️ "trocé 3 pollos y saqué 2,700 de pechuga"
//   🐔 Trozado de 3 pollos (7,5 kg):
//      • Pechuga desosada 2,7 kg (pesada · 450 g cada una)
//      • Pata y muslo ~3,8 kg
//      • ...
//      ¿Lo cargo? confirmar / cancelar
//   🎙️ "dale"  ->  se cierran los 3 pollos y nacen todas las presas.
//
// Vive en `operaciones_stock` como los lotes, por la misma razón: para el
// carnicero hay UNA sola cosa pendiente a la vez, así que su "sí" nunca es
// ambiguo.

const MARCA = "trozado" as const;

type TrozadoPendiente = {
  tipo: typeof MARCA;
  unidades: number | null;
  kgPorUnidad: number | null;
  pesadas: { codigo: string; kg: number }[];
  /** La cuenta ya hecha, para confirmar exactamente lo que se mostró. */
  salidas?: SalidaEstimada[];
  kgEntrada?: number;
  aviso?: string;
  fallos?: number;
};

/** El vocabulario de las presas de pollo: cómo se las puede nombrar. */
function vocabularioDePresas(catalogo: CatalogoCarniceria): VocabularioPresa[] {
  const presas = catalogo.productos.filter(
    (p) => p.especie === "aviar" && p.codigo !== "pollo_entero"
  );
  const primeras = new Map<string, number>();
  for (const p of presas) {
    const primera = normalizarTrozado(p.nombre_display).split(" ")[0];
    primeras.set(primera, (primeras.get(primera) ?? 0) + 1);
  }

  return presas.map((p) => {
    const palabras = new Set<string>();
    for (const v of [p.nombre_display, p.alias_display, ...p.sinonimos]) {
      if (v) palabras.add(normalizarTrozado(v));
    }
    // "pechuga" solo para "Pechuga desosada": la primera palabra del nombre,
    // si ningún otro producto de pollo empieza igual.
    const primera = normalizarTrozado(p.nombre_display).split(" ")[0];
    if (primera.length >= 4 && primeras.get(primera) === 1) {
      palabras.add(primera);
      if (!primera.endsWith("s")) palabras.add(`${primera}s`);
    }
    if (p.codigo === "pata_y_muslo") palabras.add("pata muslo");
    // Las más largas primero: "pata y muslo" antes que "pata".
    return { codigo: p.codigo, palabras: [...palabras].sort((a, b) => b.length - a.length) };
  });
}

function formatearKg(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function resumen(p: Required<Pick<TrozadoPendiente, "unidades" | "salidas" | "kgEntrada">> & { aviso?: string }): string {
  const lineas = p.salidas.map((s) => {
    if (s.estimado) return `• ${s.nombre} ~${formatearKg(s.kg)} kg`;
    const porAve = UNIDADES_POR_AVE[s.codigo];
    const cada =
      porAve && p.unidades
        ? ` · ${Math.round((s.kg / (porAve * p.unidades)) * 1000)} g cada una`
        : "";
    return `• ${s.nombre} ${formatearKg(s.kg)} kg (pesada${cada})`;
  });
  const hayEstimadas = p.salidas.some((s) => s.estimado);
  return (
    `🐔 Trozado de ${p.unidades} ${p.unidades === 1 ? "pollo" : "pollos"} (${formatearKg(p.kgEntrada)} kg):\n` +
    `${lineas.join("\n")}\n` +
    (hayEstimadas ? "Las que tienen ~ las calculé con tu tabla; se corrigen solas cuando se venden.\n" : "") +
    (p.aviso ? `${p.aviso}\n` : "") +
    `¿Lo cargo? Respondé *confirmar* o *cancelar*. Si pesaste otra presa, decime el peso y recalculo.`
  );
}

async function calcularYGuardar(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  operacionId?: string;
  pendiente: TrozadoPendiente;
  texto: string;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, operacionId, pendiente, texto } = params;
  const supabaseAdmin = getSupabaseAdmin();

  const guardar = async (fila: Record<string, unknown>) => {
    if (operacionId) {
      await supabaseAdmin.from("operaciones_stock").update(fila).eq("id", operacionId);
    } else {
      await supabaseAdmin.from("operaciones_stock").insert({
        carniceria_id: carniceriaId,
        telefono,
        mensaje_whatsapp_id: mensajeWhatsappId ?? null,
        items: [],
        ...fila,
      });
    }
  };

  // Sin cantidad de pollos no hay cuenta posible: se pregunta, y se guarda
  // TODO lo demás que ya dijo (el peso del pollo, la pechuga).
  if (!pendiente.unidades) {
    const pregunta = "¿Cuántos pollos trozaste?";
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: { ...pendiente, fallos: 0 },
      pregunta_pendiente: pregunta,
      updated_at: new Date().toISOString(),
    });
    return pregunta;
  }

  const estimacion = await estimarTrozado({
    carniceriaId,
    especie: "aviar",
    unidades: pendiente.unidades,
    pesadas: pendiente.pesadas,
    kgPorUnidadDicho: pendiente.kgPorUnidad,
  });

  if (!estimacion.ok) {
    // Se guarda igual, así la corrección ("fueron 2") se entiende.
    await guardar({
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: { ...pendiente, fallos: 0 },
      pregunta_pendiente: estimacion.mensaje,
      updated_at: new Date().toISOString(),
    });
    return estimacion.mensaje;
  }

  const completo: TrozadoPendiente = {
    ...pendiente,
    salidas: estimacion.salidas,
    kgEntrada: estimacion.kgEntrada,
    ...(estimacion.aviso ? { aviso: estimacion.aviso } : {}),
    fallos: 0,
  };

  await guardar({
    estado: "pendiente_confirmacion",
    transcripcion: texto,
    interpretacion: completo,
    pregunta_pendiente: null,
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

  return resumen({
    unidades: pendiente.unidades,
    salidas: estimacion.salidas,
    kgEntrada: estimacion.kgEntrada,
    aviso: estimacion.aviso,
  });
}

/** ¿El carnicero está contando que trozó pollo? `null` si no. */
export async function probarComoTrozado(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  texto: string;
}): Promise<string | null> {
  if (!hablaDeTrozado(params.texto)) return null;

  const catalogo = await cargarCatalogo(params.carniceriaId);
  const lectura = leerTrozado(params.texto, vocabularioDePresas(catalogo));

  return await calcularYGuardar({
    ...params,
    pendiente: { tipo: MARCA, ...lectura },
  });
}

/**
 * El carnicero contesta sobre un trozado pendiente. `null` si la operación
 * pendiente no es un trozado.
 */
export async function responderSobreTrozado(params: {
  carniceriaId: string;
  telefono: string;
  operacion: { id: string; interpretacion: unknown; pregunta_pendiente: string | null };
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, operacion, texto } = params;
  const pendiente = operacion.interpretacion as TrozadoPendiente | null;
  if (!pendiente || pendiente.tipo !== MARCA) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const decision = clasificarRespuesta(texto);

  if (decision === "cancelar") {
    await supabaseAdmin
      .from("operaciones_stock")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", operacion.id);
    return "Listo, no cargué nada del trozado.";
  }

  if (decision === "confirmar" && pendiente.unidades && pendiente.salidas?.length) {
    // Se marca primero (CAS sobre el estado) para que un "dale" repetido no
    // troce dos veces.
    const { data: tomada } = await supabaseAdmin
      .from("operaciones_stock")
      .update({ estado: "ejecutado", confirmed_at: new Date().toISOString(), executed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", operacion.id)
      .eq("estado", "pendiente_confirmacion")
      .select("id")
      .maybeSingle();
    if (!tomada) return "Ese trozado ya lo había cargado.";

    const resultado = await trozarConEstimacion({
      carniceriaId,
      especie: "aviar",
      unidades: pendiente.unidades,
      salidas: pendiente.salidas,
      kgPorUnidadDicho: pendiente.kgPorUnidad,
    });

    if (!resultado.ok) {
      await supabaseAdmin.from("operaciones_stock").update({ estado: "cancelado" }).eq("id", operacion.id);
      return `No pude cargar el trozado: ${resultado.mensaje}`;
    }
    return `Listo 👍 ${resultado.mensaje}\nYa están todas las presas en el stock.`;
  }

  // Cualquier otra cosa: ¿trae un dato del trozado? ("fueron 4", "la pata y
  // muslo pesó 3,1", "cada pollo pesaba 2,4"). Se suma a lo que ya había.
  const catalogo = await cargarCatalogo(carniceriaId);
  const lectura = leerTrozado(texto, vocabularioDePresas(catalogo));
  const trajoAlgo = lectura.unidades !== null || lectura.kgPorUnidad !== null || lectura.pesadas.length > 0;

  if (trajoAlgo) {
    const pesadas = new Map(pendiente.pesadas.map((p) => [p.codigo, p.kg]));
    for (const p of lectura.pesadas) pesadas.set(p.codigo, p.kg);
    return await calcularYGuardar({
      carniceriaId,
      telefono,
      operacionId: operacion.id,
      texto,
      pendiente: {
        tipo: MARCA,
        unidades: lectura.unidades ?? pendiente.unidades,
        kgPorUnidad: lectura.kgPorUnidad ?? pendiente.kgPorUnidad,
        pesadas: [...pesadas.entries()].map(([codigo, kg]) => ({ codigo, kg })),
      },
    });
  }

  // No se entendió. Primera vez: se explica qué está pendiente. Segunda vez
  // seguida: se suelta y el mensaje sigue como algo nuevo (no el disco rayado).
  const fallos = Number(pendiente.fallos ?? 0) + 1;
  if (fallos >= 2) {
    await supabaseAdmin
      .from("operaciones_stock")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", operacion.id);
    return null;
  }
  await supabaseAdmin
    .from("operaciones_stock")
    .update({ interpretacion: { ...pendiente, fallos }, updated_at: new Date().toISOString() })
    .eq("id", operacion.id);

  const recordatorio = pendiente.salidas?.length && pendiente.unidades && pendiente.kgEntrada
    ? resumen({ unidades: pendiente.unidades, salidas: pendiente.salidas, kgEntrada: pendiente.kgEntrada })
    : operacion.pregunta_pendiente ?? "¿Cuántos pollos trozaste?";
  return variarSiSeRepite(`No te entendí 🙈 Tengo pendiente el trozado:\n${recordatorio}`, operacion.pregunta_pendiente);
}
