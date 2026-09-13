import { getSupabaseAdmin } from "./supabaseAdmin";
import { clasificarRespuesta } from "./confirmacion";
import { interpretarMediaRes } from "./interpretarMediaRes";
import { cargarMediaRes, type CategoriaAnimal } from "./mediaRes";

// ============================================================
// Cargar una media res hablando
// ============================================================
//
//   Carnicero: 🎙️ "llegó una media res de ciento cuatro kilos seiscientos"
//   KILO:      "Media res de 104,6 kg como novillo. ¿Confirmo?"
//   Carnicero: "sí"
//   KILO:      "Listo 👍 Te cargué 28 cortes estimados (77 kg vendibles)."
//
// DOS CONFIRMACIONES COMO MÁXIMO. Cargar una media res tiene que costar menos
// que anotarla en el cuaderno, o el carnicero vuelve al cuaderno.
//
// POR QUÉ SE CONFIRMA Y NO SE CARGA DIRECTO
// Porque esto crea 28 piezas de stock de una. Si el audio se entendió mal —y
// "ciento cuatro" contra "ciento cuarenta" es un error de una sílaba— el bot
// arranca a ofrecerle a los clientes carne que no existe. Un "¿confirmo?" es
// barato; deshacer 28 piezas mal cargadas, no.
//
// POR QUÉ USA `operaciones_stock` Y NO UNA TABLA PROPIA
// Porque para el carnicero hay UNA sola cosa pendiente a la vez. Si tuviera una
// tabla aparte, podría quedar con una carga de stock pendiente Y una media res
// pendiente al mismo tiempo, y su "sí" sería ambiguo. Reusando la misma tabla,
// eso no puede pasar: el enrutador ya mira si hay algo pendiente antes que nada.

const MARCA = "media_res" as const;

type MediaResPendiente = {
  tipo: typeof MARCA;
  pesoKg: number;
  categoria: CategoriaAnimal;
  categoriaExplicita: boolean;
  proveedor: string | null;
  cantidad: number;
};

/**
 * ¿Este texto del carnicero es el aviso de que entró una media res?
 *
 * Devuelve `null` si no lo es — y ahí el mensaje sigue de largo al flujo de
 * stock de siempre, sin perderse. Ese es el diseño: equivocarse hacia "no es una
 * media res" no cuesta nada.
 */
export async function probarComoMediaRes(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto } = params;

  const interpretacion = await interpretarMediaRes(texto);
  if (interpretacion.tipo === "no_es_media_res") return null;

  const supabaseAdmin = getSupabaseAdmin();

  if (interpretacion.tipo === "falta_peso") {
    await supabaseAdmin.from("operaciones_stock").insert({
      carniceria_id: carniceriaId,
      telefono,
      mensaje_whatsapp_id: mensajeWhatsappId ?? null,
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: { tipo: MARCA, esperando: "peso" },
      pregunta_pendiente: interpretacion.pregunta,
      items: [],
    });
    return interpretacion.pregunta;
  }

  // Qué categoría usar cuando no la dijo. No se inventa: se elige la tabla
  // vigente más probable y se la nombra en la pregunta, para que corregirla sea
  // una palabra ("no, vaca") en vez de otra ronda de preguntas.
  const categoria =
    interpretacion.categoria ?? (await categoriaPorDefecto(carniceriaId));

  if (!categoria) {
    return "Todavía no tengo cargada la tabla de rendimiento, así que no puedo repartir los cortes. Avisale a quien te configuró el sistema.";
  }

  const pendiente: MediaResPendiente = {
    tipo: MARCA,
    pesoKg: interpretacion.pesoKg,
    categoria,
    categoriaExplicita: interpretacion.categoria !== null,
    proveedor: interpretacion.proveedor,
    cantidad: interpretacion.cantidad,
  };

  await supabaseAdmin.from("operaciones_stock").insert({
    carniceria_id: carniceriaId,
    telefono,
    mensaje_whatsapp_id: mensajeWhatsappId ?? null,
    estado: "pendiente_confirmacion",
    transcripcion: texto,
    interpretacion: pendiente,
    items: [],
    // Cuatro horas: si no confirmó en ese rato, la media res ya está despostada
    // y confirmarla tarde cargaría stock que no refleja nada.
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

  return resumenParaConfirmar(pendiente);
}

/**
 * El carnicero está contestando sobre una media res pendiente.
 *
 * Devuelve `null` si la operación pendiente NO es una media res, para que el
 * flujo de stock de siempre la maneje como venía haciéndolo.
 */
export async function responderSobreMediaRes(params: {
  carniceriaId: string;
  operacion: { id: string; estado: string; interpretacion: unknown };
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, operacion, texto } = params;

  const interpretacion = operacion.interpretacion as Record<string, unknown> | null;
  if (!interpretacion || interpretacion.tipo !== MARCA) return null;

  const supabaseAdmin = getSupabaseAdmin();

  // Caso 1: le faltaba el peso y ahora lo está diciendo.
  if (interpretacion.esperando === "peso") {
    const nueva = await interpretarMediaRes(`llegó una media res de ${texto}`);

    if (nueva.tipo !== "media_res") {
      return "No te entendí el peso. Decímelo así: «ciento cuatro kilos seiscientos».";
    }

    const categoria = nueva.categoria ?? (await categoriaPorDefecto(carniceriaId));
    if (!categoria) return "Todavía no tengo cargada la tabla de rendimiento.";

    const pendiente: MediaResPendiente = {
      tipo: MARCA,
      pesoKg: nueva.pesoKg,
      categoria,
      categoriaExplicita: nueva.categoria !== null,
      proveedor: nueva.proveedor,
      cantidad: nueva.cantidad,
    };

    await supabaseAdmin
      .from("operaciones_stock")
      .update({
        estado: "pendiente_confirmacion",
        interpretacion: pendiente,
        pregunta_pendiente: null,
        transcripcion: texto,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", operacion.id);

    return resumenParaConfirmar(pendiente);
  }

  // Caso 2: hay una media res esperando el sí o el no.
  const pendiente = interpretacion as unknown as MediaResPendiente;
  const respuesta = clasificarRespuesta(texto);

  if (respuesta === "cancelar") {
    await cerrar(operacion.id, "cancelado");
    return "Listo, no cargué nada.";
  }

  if (respuesta === "confirmar") {
    return await ejecutar({ carniceriaId, operacionId: operacion.id, pendiente });
  }

  // Cualquier otra cosa se interpreta como corrección, igual que en el flujo de
  // stock: "no, eran 106,4" tiene que corregir, no cancelar.
  const correccion = await interpretarMediaRes(texto);

  if (correccion.tipo === "media_res") {
    const corregida: MediaResPendiente = {
      tipo: MARCA,
      pesoKg: correccion.pesoKg,
      categoria: correccion.categoria ?? pendiente.categoria,
      categoriaExplicita: correccion.categoria !== null || pendiente.categoriaExplicita,
      proveedor: correccion.proveedor ?? pendiente.proveedor,
      cantidad: correccion.cantidad,
    };

    await supabaseAdmin
      .from("operaciones_stock")
      .update({
        interpretacion: corregida,
        transcripcion: texto,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operacion.id);

    return resumenParaConfirmar(corregida);
  }

  // Puede estar corrigiendo solo la categoría: "no, es vaca".
  const categoriaSuelta = detectarCategoria(texto);
  if (categoriaSuelta) {
    const corregida: MediaResPendiente = {
      ...pendiente,
      categoria: categoriaSuelta,
      categoriaExplicita: true,
    };
    await supabaseAdmin
      .from("operaciones_stock")
      .update({ interpretacion: corregida, transcripcion: texto, updated_at: new Date().toISOString() })
      .eq("id", operacion.id);
    return resumenParaConfirmar(corregida);
  }

  return "No te entendí. Podés responder *confirmar*, *cancelar*, o decirme el peso de nuevo.";
}

// ============================================================
// Lo que hace el trabajo
// ============================================================

async function ejecutar(params: {
  carniceriaId: string;
  operacionId: string;
  pendiente: MediaResPendiente;
}): Promise<string> {
  const { carniceriaId, operacionId, pendiente } = params;

  const resultados: string[] = [];
  let piezasTotales = 0;
  let kgTotales = 0;

  // Varias medias reses del mismo peso se cargan como LOTES SEPARADOS, no como
  // una sola de peso doble. Cada una tiene su propio rinde y su propio
  // descuadre: promediarlas perdería justo lo que hace útil el módulo.
  for (let i = 0; i < pendiente.cantidad; i++) {
    const resultado = await cargarMediaRes({
      carniceriaId,
      categoria: pendiente.categoria,
      pesoRecibidoKg: pendiente.pesoKg,
      proveedor: pendiente.proveedor,
    });

    if (!resultado.ok) {
      await cerrar(operacionId, "cancelado");
      return resultado.mensaje;
    }

    piezasTotales += resultado.piezas;
    kgTotales += resultado.kgVendibles;
    resultados.push(resultado.loteId);
  }

  await cerrar(operacionId, "ejecutado");

  const cuantas =
    pendiente.cantidad === 1
      ? `la media res de ${formatearKg(pendiente.pesoKg)} kg`
      : `las ${pendiente.cantidad} medias reses de ${formatearKg(pendiente.pesoKg)} kg`;

  return (
    `Listo 👍 Cargué ${cuantas}.\n` +
    `Te quedaron ${piezasTotales} cortes estimados, ${formatearKg(kgTotales)} kg vendibles.\n\n` +
    `Cuando vayas despostando, si me decís los pesos reales afino las cuentas. ` +
    `Y cuando se te termine un corte, avisame y lo pongo en cero.`
  );
}

async function cerrar(operacionId: string, estado: "ejecutado" | "cancelado"): Promise<void> {
  const ahora = new Date().toISOString();
  await getSupabaseAdmin()
    .from("operaciones_stock")
    .update({
      estado,
      updated_at: ahora,
      confirmed_at: estado === "ejecutado" ? ahora : null,
      executed_at: estado === "ejecutado" ? ahora : null,
    })
    .eq("id", operacionId);
}

function resumenParaConfirmar(pendiente: MediaResPendiente): string {
  const cuantas =
    pendiente.cantidad === 1
      ? `Media res de *${formatearKg(pendiente.pesoKg)} kg*`
      : `*${pendiente.cantidad}* medias reses de *${formatearKg(pendiente.pesoKg)} kg* cada una`;

  const proveedor = pendiente.proveedor ? `, de ${pendiente.proveedor}` : "";

  // Si la categoría la puso el sistema y no él, se dice con todas las letras.
  // Que el carnicero descubra tres días después que le cargamos vaca como
  // novillo sería peor que preguntar de más una vez.
  const categoria = pendiente.categoriaExplicita
    ? `como ${pendiente.categoria}`
    : `como ${pendiente.categoria} (si no es, decime cuál)`;

  return `🥩 ${cuantas} ${categoria}${proveedor}.\n¿Lo cargo? Respondé *confirmar* o *cancelar*.`;
}

async function categoriaPorDefecto(carniceriaId: string): Promise<CategoriaAnimal | null> {
  const { data } = await getSupabaseAdmin()
    .from("tablas_rendimiento")
    .select("categoria")
    .eq("carniceria_id", carniceriaId)
    .is("vigente_hasta", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.categoria as CategoriaAnimal | undefined) ?? null;
}

function detectarCategoria(texto: string): CategoriaAnimal | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // El orden importa: "novillito" contiene "novillo", y "vaquillona" contiene
  // "vaca" para nadie pero sí empieza parecido. Los más específicos primero.
  if (t.includes("novillito")) return "novillito";
  if (t.includes("vaquillona")) return "vaquillona";
  if (t.includes("ternera") || t.includes("ternero")) return "ternera";
  if (t.includes("novillo")) return "novillo";
  if (t.includes("vaca")) return "vaca";
  return null;
}

function formatearKg(valor: number): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
