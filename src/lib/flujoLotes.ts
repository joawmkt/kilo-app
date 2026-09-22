import { getSupabaseAdmin } from "./supabaseAdmin";
import { clasificarRespuesta } from "./confirmacion";
import { interpretarLote, detectarEspecieDeLote, type ResultadoLoteVoz } from "./interpretarLote";
import { especieExplicita, anunciaLlegada, leerListaDePesos } from "./deteccionLote";
import { variarSiSeRepite } from "./conversacion";
import { cargarLote } from "./lotes";
import { descriptor, type CategoriaAnimal, type Especie } from "./especies";

// ============================================================
// Cargar mercadería hablando — las tres especies, un solo flujo
// ============================================================
//
//   🎙️ "llegó una media res de ciento cuatro kilos seiscientos"
//   🥩 Media res de 104,6 kg como novillo (si no es, decime cuál). ¿La cargo?
//
//   🎙️ "llegó una media res de cerdo de cuarenta y dos"
//   🐷 Media res de cerdo de 42 kg. ¿La cargo?
//   ... "Listo. Cuando la despostes, decime los pesos y te armo el stock."
//
//   🎙️ "llegó un cajón de pollo de diez"
//   🐔 Cajón de 20 kg con 10 pollos de 2 kg cada uno. ¿Lo cargo?
//   ... "Listo 👍 10 pollos en stock. Vencen el 24/09."
//
// DOS CONFIRMACIONES COMO MÁXIMO. Cargar mercadería tiene que costar menos que
// anotarla en el cuaderno, o el carnicero vuelve al cuaderno.
//
// POR QUÉ SE CONFIRMA Y NO SE CARGA DIRECTO: porque esto crea muchas piezas de
// una. "Ciento cuatro" contra "ciento cuarenta" es un error de una sílaba, y
// "diez" contra "doce" también. Un "¿confirmo?" es barato; deshacer piezas mal
// cargadas, no.
//
// POR QUÉ USA `operaciones_stock` Y NO UNA TABLA PROPIA: porque para el
// carnicero hay UNA sola cosa pendiente a la vez. Con una tabla aparte podría
// quedar con una carga de stock pendiente Y un lote pendiente al mismo tiempo,
// y su "sí" sería ambiguo.

const MARCA = "lote" as const;
// Las operaciones creadas antes de que existieran pollo y cerdo se guardaron
// con esta marca. Se siguen reconociendo para no dejar colgada ninguna que
// esté pendiente en el momento de la migración.
const MARCA_VIEJA = "media_res" as const;

type LotePendiente = {
  tipo: typeof MARCA | typeof MARCA_VIEJA;
  especie: Especie;
  pesoKg: number;
  /**
   * Un peso por pieza. Vale más que pesoKg × cantidad: el 21/09 entraron dos
   * medias de cerdo, una de 51 y otra de 46, y el formato viejo (un peso y una
   * cantidad) solo podía guardar "dos de lo mismo". Se leen como lotes
   * separados, cada uno con su propio peso.
   */
  pesosKg?: number[];
  unidades: number | null;
  categoria: CategoriaAnimal | string | null;
  categoriaExplicita: boolean;
  proveedor: string | null;
  cantidad: number;
  /** Mensajes seguidos sin entender sobre este lote. Ver `noEntendido`. */
  fallos?: number;
  /** Algo que decidió el sistema (ej. "cerdo entero partido en dos"). Se muestra al confirmar. */
  nota?: string;
};

type LoteLeido = Extract<ResultadoLoteVoz, { tipo: "lote" }>;

/**
 * ¿Hay que preguntar de qué animal es?
 *
 * "Media res" a secas se venía cargando como vacuna, y el 21/09 una de cerdo
 * de 49,5 kg entró como novillo. Una media res vacuna de menos de 70 kg casi
 * no existe; una de cerdo de más de 70, tampoco. Entonces: si no nombró el
 * animal y el peso cae donde podría ser cualquiera de los dos, se pregunta
 * (regla 2: nunca suponer ante ambigüedad). Si pesa más, es vaca sin dudas.
 */
function hayQuePreguntarEspecie(texto: string, leido: LoteLeido): boolean {
  if (leido.especie !== "vacuno") return false;
  if (especieExplicita(texto) !== null) return false;
  if (leido.categoria) return false; // dijo "novillo": es vaca
  const pesos = leido.pesosKg ?? [leido.pesoKg];
  const maxCerdo = descriptor("porcino").rangoPesoKg[1];
  return pesos.every((p) => p <= maxCerdo);
}

/**
 * ¿Este texto del carnicero avisa que entró mercadería?
 *
 * Devuelve `null` si no — y ahí el mensaje sigue de largo al flujo de stock de
 * siempre, sin perderse. Equivocarse hacia "no es un lote" no cuesta nada.
 */
export async function probarComoLote(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  texto: string;
}): Promise<string | null> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto } = params;

  const interpretacion = await interpretarLote(texto);
  if (interpretacion.tipo === "no_es_lote") return null;

  const supabaseAdmin = getSupabaseAdmin();

  if (interpretacion.tipo === "falta_dato") {
    await supabaseAdmin.from("operaciones_stock").insert({
      carniceria_id: carniceriaId,
      telefono,
      mensaje_whatsapp_id: mensajeWhatsappId ?? null,
      estado: "pendiente_aclaracion",
      transcripcion: texto,
      interpretacion: {
        tipo: MARCA,
        especie: interpretacion.especie,
        esperando: interpretacion.falta,
        cantidad: interpretacion.cantidad,
        // Si la especie fue supuesta ("media res" a secas), se anota para
        // preguntarla cuando llegue el peso.
        especieSupuesta: interpretacion.especie === "vacuno" && especieExplicita(texto) === null,
      },
      pregunta_pendiente: interpretacion.pregunta,
      items: [],
    });
    return interpretacion.pregunta;
  }

  // Media res sin animal y con un peso que podría ser de cerdo: se pregunta.
  if (hayQuePreguntarEspecie(texto, interpretacion)) {
    return await guardarEsperandoEspecie({ carniceriaId, telefono, mensajeWhatsappId, texto, leido: interpretacion });
  }

  const pendiente = await armarPendiente(carniceriaId, interpretacion);
  if (typeof pendiente === "string") return pendiente;

  await supabaseAdmin.from("operaciones_stock").insert({
    carniceria_id: carniceriaId,
    telefono,
    mensaje_whatsapp_id: mensajeWhatsappId ?? null,
    estado: "pendiente_confirmacion",
    transcripcion: texto,
    interpretacion: pendiente,
    items: [],
    // Cuatro horas: si no confirmó en ese rato, la mercadería ya está en la
    // cámara o despostada, y confirmarla tarde cargaría stock que no refleja nada.
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

  return resumenParaConfirmar(pendiente);
}

const PREGUNTA_ESPECIE = "¿Es de vaca o de cerdo?";

async function guardarEsperandoEspecie(params: {
  carniceriaId: string;
  telefono: string;
  mensajeWhatsappId?: string;
  texto: string;
  leido: LoteLeido;
  operacionId?: string;
}): Promise<string> {
  const { carniceriaId, telefono, mensajeWhatsappId, texto, leido, operacionId } = params;
  const pesos = leido.pesosKg ?? Array.from({ length: leido.cantidad }, () => leido.pesoKg);
  const cuantas =
    pesos.length === 1
      ? `la media res de ${formatearKg(pesos[0])} kg`
      : `las medias reses de ${pesos.map(formatearKg).join(" y ")} kg`;
  const pregunta = `Anotado el peso. ${PREGUNTA_ESPECIE.replace("Es", pesos.length === 1 ? "Es" : "Son")} (${cuantas})`;

  const fila = {
    estado: "pendiente_aclaracion",
    transcripcion: texto,
    interpretacion: {
      tipo: MARCA,
      especie: leido.especie,
      esperando: "especie",
      pesosKg: pesos,
      proveedor: leido.proveedor,
      cantidad: pesos.length,
    },
    pregunta_pendiente: pregunta,
    updated_at: new Date().toISOString(),
  };

  if (operacionId) {
    await getSupabaseAdmin().from("operaciones_stock").update(fila).eq("id", operacionId);
  } else {
    await getSupabaseAdmin().from("operaciones_stock").insert({
      ...fila,
      carniceria_id: carniceriaId,
      telefono,
      mensaje_whatsapp_id: mensajeWhatsappId ?? null,
      items: [],
    });
  }
  return pregunta;
}

/**
 * El carnicero está contestando sobre un lote pendiente.
 *
 * Devuelve `null` si la operación pendiente NO es un lote, para que el flujo de
 * stock de siempre la maneje como venía haciéndolo.
 */
export async function responderSobreLote(params: {
  carniceriaId: string;
  operacion: { id: string; estado: string; interpretacion: unknown };
  texto: string;
  telefono?: string;
}): Promise<string | null> {
  const { carniceriaId, operacion, texto } = params;

  const interpretacion = operacion.interpretacion as Record<string, unknown> | null;
  if (!interpretacion) return null;
  if (interpretacion.tipo !== MARCA && interpretacion.tipo !== MARCA_VIEJA) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const especie = (interpretacion.especie as Especie | undefined) ?? "vacuno";
  const desc = descriptor(especie);
  const telefono = params.telefono ?? (await telefonoDeOperacion(operacion.id));

  // ------------------------------------------------------------
  // Un lote NUEVO mientras había otro pendiente (21/09/2026)
  // ------------------------------------------------------------
  //
  // "Me entró un cajón de pollo" no es la respuesta a "¿la cargo?": es otra
  // mercadería. Antes el lote pendiente se tragaba el mensaje y contestaba
  // "No te entendí" una y otra vez (Patrón 2 del manual). Si el texto anuncia
  // una llegada de otra especie, o una llegada con su propio número, se deja
  // de lado lo pendiente y se arranca de nuevo con este mensaje.
  const especieNueva = detectarEspecieDeLote(texto);
  const nombrada = especieExplicita(texto);
  const traeNumero = /\d/.test(texto);
  // Dos señales de "esto es otra cosa":
  //   - nombra un animal que llega en OTRA forma (un cajón de pollo mientras
  //     esperábamos una media res): no puede ser una corrección;
  //   - anuncia una llegada CON su propio número ("me entraron dos de 51 y
  //     46"): el mensaje se basta solo.
  // En cambio "media res de cerdo" sin número, con una media res pendiente, es
  // una corrección del animal y se maneja más abajo (se conserva el peso).
  const formaDistinta = nombrada !== null && descriptor(nombrada).unidadEntrada !== desc.unidadEntrada;
  if (
    especieNueva !== null &&
    telefono &&
    ((nombrada !== null && nombrada !== especie && formaDistinta) || (anunciaLlegada(texto) && traeNumero))
  ) {
    await cerrar(operacion.id, "cancelado");
    const nueva = await probarComoLote({ carniceriaId, telefono, texto });
    if (nueva !== null) {
      return `(Dejé de lado lo que te había preguntado antes.)\n\n${nueva}`;
    }
  }

  // ------------------------------------------------------------
  // Caso 0: faltaba saber de qué animal es
  // ------------------------------------------------------------
  if (interpretacion.esperando === "especie") {
    const elegida = nombrada ?? especieDeRespuestaCorta(texto);
    const pesos = (interpretacion.pesosKg as number[] | undefined) ?? [];
    if (!elegida || elegida === "aviar" || pesos.length === 0) {
      return await noEntendido({
        operacionId: operacion.id,
        interpretacion,
        mensaje: `${PREGUNTA_ESPECIE} Contestame *vaca* o *cerdo*.`,
      });
    }

    const leido: LoteLeido = {
      tipo: "lote",
      especie: elegida,
      pesoKg: pesos[0],
      pesosKg: pesos.length > 1 ? pesos : null,
      unidades: null,
      categoria: null,
      proveedor: (interpretacion.proveedor as string | null | undefined) ?? null,
      cantidad: pesos.length,
    };
    return await pasarAConfirmacion(carniceriaId, operacion.id, leido, texto);
  }

  // ------------------------------------------------------------
  // Caso 1: faltaba un dato (peso o cabezas) y ahora lo está diciendo.
  // ------------------------------------------------------------
  if (interpretacion.esperando === "peso" || interpretacion.esperando === "cabezas") {
    const cantidadEsperada = Number(interpretacion.cantidad ?? 1);

    // Primero sin modelo: si la respuesta es solo números ("51 y 46",
    // "104,6", "49500"), se leen directo. El modelo recién si trae palabras.
    let nueva: ResultadoLoteVoz | null = null;
    const numeros = leerListaDePesos(texto);
    if (numeros && interpretacion.esperando === "peso") {
      const [minP, maxP] = desc.rangoPesoKg;
      if (numeros.every((n) => n >= minP && n <= maxP)) {
        nueva = {
          tipo: "lote",
          especie,
          pesoKg: numeros[0],
          pesosKg: numeros.length > 1 ? numeros : null,
          unidades: null,
          categoria: null,
          proveedor: null,
          cantidad: numeros.length > 1 ? numeros.length : cantidadEsperada,
        };
      }
    }

    if (!nueva) {
      // Se le vuelve a dar contexto al modelo, porque "cuarenta y dos" solo no
      // dice de qué está hablando. La especie ya la sabemos de la pregunta.
      const cuantas = cantidadEsperada > 1 ? `llegaron ${cantidadEsperada} ` : "llegó una ";
      const preludio =
        desc.unidadEntrada === "cajon"
          ? "llegó un cajón de pollo de "
          : `${cuantas}${cantidadEsperada > 1 ? desc.etiqueta.replace("media res", "medias reses") : desc.etiqueta} de `;
      nueva = await interpretarLote(`${preludio}${texto}`, especie);
    }

    if (nueva.tipo !== "lote") {
      return await noEntendido({
        operacionId: operacion.id,
        interpretacion,
        mensaje:
          desc.unidadEntrada === "cajon"
            ? "No te entendí cuántas cabezas. Decímelo así: «de diez»."
            : cantidadEsperada > 1
              ? "No te entendí los pesos. Decímelos así: «51 y 46»."
              : "No te entendí el peso. Decímelo así: «ciento cuatro kilos seiscientos».",
      });
    }

    // Si la especie había sido supuesta, recién ahora con el peso se puede
    // decidir si hay que preguntarla.
    if (interpretacion.especieSupuesta && hayQuePreguntarEspecie("", nueva) && telefono) {
      return await guardarEsperandoEspecie({
        carniceriaId,
        telefono,
        texto,
        leido: nueva,
        operacionId: operacion.id,
      });
    }

    return await pasarAConfirmacion(carniceriaId, operacion.id, nueva, texto);
  }

  // ------------------------------------------------------------
  // Caso 2: hay un lote esperando el sí o el no.
  // ------------------------------------------------------------
  const pendiente = normalizarPendiente(interpretacion);
  const respuesta = clasificarRespuesta(texto);

  if (respuesta === "cancelar") {
    await cerrar(operacion.id, "cancelado");
    return "Listo, no cargué nada.";
  }

  if (respuesta === "confirmar") {
    return await ejecutar({ carniceriaId, operacionId: operacion.id, pendiente });
  }

  // ¿Está corrigiendo el ANIMAL? "de cerdo", "es chancho", "no, es de vaca".
  // Bug del 21/09: se cargó una de cerdo como novillo, el carnicero contestó
  // "de cerdo" y el bot respondió "No te entendí" hasta el cansancio.
  if (nombrada && nombrada !== pendiente.especie) {
    const mismaForma = descriptor(nombrada).unidadEntrada === desc.unidadEntrada;
    if (mismaForma) {
      const corregida = await armarPendiente(carniceriaId, {
        especie: nombrada,
        pesoKg: pendiente.pesoKg,
        pesosKg: pendiente.pesosKg ?? null,
        unidades: pendiente.unidades,
        categoria: null,
        proveedor: pendiente.proveedor,
        cantidad: pendiente.cantidad,
      });
      if (typeof corregida === "string") return corregida;

      // El rango cambia con el animal: 49,5 kg es normal para un cerdo, pero
      // 120 no. Si el peso no cierra para el animal nuevo, se pregunta.
      const [minP, maxP] = descriptor(nombrada).rangoPesoKg;
      const pesos = corregida.pesosKg ?? [corregida.pesoKg];
      if (pesos.some((p) => p < minP || p > maxP)) {
        await supabaseAdmin
          .from("operaciones_stock")
          .update({
            estado: "pendiente_aclaracion",
            interpretacion: { tipo: MARCA, especie: nombrada, esperando: "peso", cantidad: pesos.length },
            pregunta_pendiente: `¿Cuánto pesó la ${descriptor(nombrada).etiqueta}?`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", operacion.id);
        return `Ese peso no me cierra para una ${descriptor(nombrada).etiqueta}. ¿Cuánto pesó?`;
      }

      await guardarPendiente(operacion.id, corregida, texto);
      return resumenParaConfirmar(corregida);
    }
  }

  // Cualquier otra cosa se interpreta como corrección: "no, eran 106,4" tiene
  // que corregir, no cancelar.
  const numeros = leerListaDePesos(texto);
  const correccion: ResultadoLoteVoz =
    numeros && desc.unidadEntrada === "media_res" && numeros.every((n) => n >= desc.rangoPesoKg[0] && n <= desc.rangoPesoKg[1])
      ? {
          tipo: "lote",
          especie: pendiente.especie,
          pesoKg: numeros[0],
          pesosKg: numeros.length > 1 ? numeros : null,
          unidades: null,
          categoria: null,
          proveedor: null,
          cantidad: numeros.length > 1 ? numeros.length : pendiente.cantidad,
        }
      : await interpretarLote(texto, pendiente.especie);

  if (correccion.tipo === "lote") {
    const pesosNuevos = correccion.pesosKg ?? (correccion.pesoKg > 0 ? null : pendiente.pesosKg ?? null);
    const corregida: LotePendiente = {
      ...pendiente,
      pesoKg: correccion.pesoKg > 0 ? correccion.pesoKg : pendiente.pesoKg,
      pesosKg: pesosNuevos ?? undefined,
      unidades: correccion.unidades ?? pendiente.unidades,
      categoria: correccion.categoria ?? pendiente.categoria,
      categoriaExplicita: correccion.categoria !== null || pendiente.categoriaExplicita,
      proveedor: correccion.proveedor ?? pendiente.proveedor,
      cantidad: pesosNuevos ? pesosNuevos.length : correccion.cantidad,
      fallos: 0,
    };

    await guardarPendiente(operacion.id, corregida, texto);
    return resumenParaConfirmar(corregida);
  }

  // Puede estar corrigiendo solo la categoría: "no, es vaca".
  const categoriaSuelta = detectarCategoria(texto, pendiente.especie);
  if (categoriaSuelta) {
    const corregida: LotePendiente = {
      ...pendiente,
      categoria: categoriaSuelta,
      categoriaExplicita: true,
      fallos: 0,
    };
    await guardarPendiente(operacion.id, corregida, texto);
    return resumenParaConfirmar(corregida);
  }

  return await noEntendido({
    operacionId: operacion.id,
    interpretacion,
    mensaje: `No te entendí 🙈 Lo que tengo pendiente es:\n${resumenParaConfirmar(pendiente)}\n\nSi es otra cosa, decime *cancelar* y arrancamos de nuevo.`,
  });
}

/**
 * Qué contestar cuando no se entendió — sin quedarse trabado.
 *
 * Bug del 21/09: el bot contestó cuatro veces seguidas el mismo "No te
 * entendí. Podés responder confirmar, cancelar...". Dos reglas (Patrón 4):
 *   - la primera vez se explica QUÉ está pendiente, para que el carnicero
 *     entienda por qué el bot insiste;
 *   - la segunda vez seguida, se abandona lo pendiente: casi seguro cambió de
 *     tema. Se le avisa y listo, en vez de un disco rayado.
 */
async function noEntendido(params: {
  operacionId: string;
  interpretacion: Record<string, unknown>;
  mensaje: string;
}): Promise<string> {
  const fallos = Number(params.interpretacion.fallos ?? 0) + 1;

  if (fallos >= 2) {
    await cerrar(params.operacionId, "cancelado");
    return "Te pido disculpas, no lo estoy entendiendo 🙈 Dejé eso sin cargar para no equivocarme. Mandámelo de nuevo de una, por ejemplo: *llegó una media res de cerdo de 49 kilos* o *entró un cajón de pollo de 8*.";
  }

  const { data } = await getSupabaseAdmin()
    .from("operaciones_stock")
    .select("pregunta_pendiente")
    .eq("id", params.operacionId)
    .maybeSingle();

  await getSupabaseAdmin()
    .from("operaciones_stock")
    .update({ interpretacion: { ...params.interpretacion, fallos }, updated_at: new Date().toISOString() })
    .eq("id", params.operacionId);

  return variarSiSeRepite(params.mensaje, (data?.pregunta_pendiente as string | null) ?? null);
}

/** Respuestas de una palabra que no nombran el animal pero lo dicen: "la vacuna", "porcina". */
function especieDeRespuestaCorta(texto: string): Especie | null {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/^(de\s+)?(la\s+)?(vacun|vaca)/.test(t)) return "vacuno";
  if (/^(de\s+)?(la\s+)?(porcin|cerd|chanch)/.test(t)) return "porcino";
  return null;
}

async function pasarAConfirmacion(
  carniceriaId: string,
  operacionId: string,
  leido: LoteLeido,
  texto: string
): Promise<string> {
  const pendiente = await armarPendiente(carniceriaId, leido);
  if (typeof pendiente === "string") return pendiente;

  await getSupabaseAdmin()
    .from("operaciones_stock")
    .update({
      estado: "pendiente_confirmacion",
      interpretacion: pendiente,
      pregunta_pendiente: null,
      transcripcion: texto,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", operacionId);

  return resumenParaConfirmar(pendiente);
}

async function guardarPendiente(operacionId: string, pendiente: LotePendiente, texto: string): Promise<void> {
  await getSupabaseAdmin()
    .from("operaciones_stock")
    .update({
      estado: "pendiente_confirmacion",
      interpretacion: pendiente,
      pregunta_pendiente: null,
      transcripcion: texto,
      updated_at: new Date().toISOString(),
    })
    .eq("id", operacionId);
}

async function telefonoDeOperacion(operacionId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("operaciones_stock")
    .select("telefono")
    .eq("id", operacionId)
    .maybeSingle();
  return (data?.telefono as string | null | undefined) ?? null;
}

// ============================================================
// Lo que hace el trabajo
// ============================================================

async function armarPendiente(
  carniceriaId: string,
  interpretacion: {
    especie: Especie;
    pesoKg: number;
    pesosKg?: number[] | null;
    nota?: string;
    unidades: number | null;
    categoria: string | null;
    proveedor: string | null;
    cantidad: number;
  }
): Promise<LotePendiente | string> {
  const desc = descriptor(interpretacion.especie);

  // El vacuno es la única especie que necesita categoría sí o sí, porque es la
  // única cuya tabla crea el stock. Si no la dijo, se elige la tabla vigente
  // más probable y se la NOMBRA en la pregunta, para que corregirla sea una
  // palabra ("no, vaca") en vez de otra ronda.
  let categoria: string | null = interpretacion.categoria;
  if (interpretacion.especie === "vacuno" && categoria === null) {
    categoria = await categoriaPorDefecto(carniceriaId, "vacuno");
    if (!categoria) {
      return "Todavía no tengo cargada la tabla de rendimiento, así que no puedo repartir los cortes. Avisale a quien te configuró el sistema.";
    }
  }

  // El peso del cajón sale del formato de la carnicería, no de un número clavado
  // en el código: 20 kg es el formato dominante pero también existe el de 10.
  let pesoKg = interpretacion.pesoKg;
  if (desc.unidadEntrada === "cajon" && !(pesoKg > 0)) {
    pesoKg = await pesoDelCajon(carniceriaId);
  }

  const pesosKg =
    interpretacion.pesosKg && interpretacion.pesosKg.length > 1 ? interpretacion.pesosKg : undefined;

  return {
    tipo: MARCA,
    especie: interpretacion.especie,
    pesoKg,
    ...(pesosKg ? { pesosKg } : {}),
    ...(interpretacion.nota ? { nota: interpretacion.nota } : {}),
    unidades: interpretacion.unidades,
    categoria,
    categoriaExplicita: interpretacion.categoria !== null,
    proveedor: interpretacion.proveedor,
    cantidad: pesosKg ? pesosKg.length : interpretacion.cantidad,
  };
}

/** Un peso por pieza a cargar, sea cual sea el formato en que vino. */
function pesosDe(pendiente: LotePendiente): number[] {
  if (pendiente.pesosKg && pendiente.pesosKg.length > 0) return pendiente.pesosKg;
  return Array.from({ length: Math.max(1, pendiente.cantidad) }, () => pendiente.pesoKg);
}

async function ejecutar(params: {
  carniceriaId: string;
  operacionId: string;
  pendiente: LotePendiente;
}): Promise<string> {
  const { carniceriaId, operacionId, pendiente } = params;
  const desc = descriptor(pendiente.especie);

  let piezasTotales = 0;
  let kgTotales = 0;
  let esperaDesposte = false;

  // Varios lotes del mismo tamaño se cargan como LOTES SEPARADOS, no como uno
  // de peso doble. Cada uno tiene su propio rinde y su propio descuadre:
  // promediarlos perdería justo lo que hace útil el módulo.
  for (const peso of pesosDe(pendiente)) {
    const resultado = await cargarLote({
      carniceriaId,
      especie: pendiente.especie,
      categoria: pendiente.categoria,
      pesoRecibidoKg: peso,
      unidades: pendiente.unidades,
      proveedor: pendiente.proveedor,
    });

    if (!resultado.ok) {
      await cerrar(operacionId, "cancelado");
      return resultado.mensaje;
    }

    piezasTotales += resultado.piezas;
    kgTotales += resultado.kgVendibles;
    esperaDesposte = resultado.esperaDesposte;
  }

  await cerrar(operacionId, "ejecutado");

  if (esperaDesposte) {
    return (
      `Listo 👍 Cargué ${describirCantidad(pendiente)}.\n\n` +
      `Cuando la despostes, decime los pesos de cada corte y te armo el stock. ` +
      `No te apures: con los primeros 10 despostes ya voy a saber cuánto te rinde a vos.`
    );
  }

  if (desc.unidadEntrada === "cajon") {
    const kgPorUnidad = pendiente.unidades
      ? Math.round((pendiente.pesoKg / pendiente.unidades) * 1000) / 1000
      : 0;
    const vence = desc.vidaUtilDiasPorDefecto
      ? `\nOjo que el pollo dura poco: te aviso cuando falten 2 días para que se pase.`
      : "";
    return (
      `Listo 👍 Cargué ${describirCantidad(pendiente)}.\n` +
      `Te quedaron ${piezasTotales} pollos de ${formatearKg(kgPorUnidad)} kg cada uno.${vence}`
    );
  }

  return (
    `Listo 👍 Cargué ${describirCantidad(pendiente)}.\n` +
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

function describirCantidad(pendiente: LotePendiente): string {
  const desc = descriptor(pendiente.especie);

  if (desc.unidadEntrada === "cajon") {
    const uno = `el cajón de ${formatearKg(pendiente.pesoKg)} kg con ${pendiente.unidades} cabezas`;
    return pendiente.cantidad === 1
      ? uno
      : `los ${pendiente.cantidad} cajones de ${pendiente.unidades} cabezas`;
  }

  const pesos = pesosDe(pendiente);
  if (pesos.length === 1) return `la ${desc.etiqueta} de ${formatearKg(pesos[0])} kg`;
  return `las ${pesos.length} ${plural(desc.etiqueta)} (${pesos.map(formatearKg).join(" kg y ")} kg)`;
}

function resumenParaConfirmar(pendiente: LotePendiente): string {
  const desc = descriptor(pendiente.especie);
  const proveedor = pendiente.proveedor ? `, de ${pendiente.proveedor}` : "";

  if (desc.unidadEntrada === "cajon") {
    const kgPorUnidad = pendiente.unidades
      ? Math.round((pendiente.pesoKg / pendiente.unidades) * 1000) / 1000
      : 0;
    const cuantos =
      pendiente.cantidad === 1
        ? `Cajón de *${formatearKg(pendiente.pesoKg)} kg* con *${pendiente.unidades}* pollos`
        : `*${pendiente.cantidad}* cajones de *${formatearKg(pendiente.pesoKg)} kg* con *${pendiente.unidades}* pollos cada uno`;
    return (
      `${desc.emoji} ${cuantos} de ${formatearKg(kgPorUnidad)} kg cada uno${proveedor}.\n` +
      `¿Lo cargo? Respondé *confirmar* o *cancelar*.`
    );
  }

  const pesos = pesosDe(pendiente);
  const todasIguales = pesos.every((p) => p === pesos[0]);
  const cuantas =
    pesos.length === 1
      ? `${capitalizar(desc.etiqueta)} de *${formatearKg(pesos[0])} kg*`
      : todasIguales
        ? `*${pesos.length}* ${plural(desc.etiqueta)} de *${formatearKg(pesos[0])} kg* cada una`
        : `*${pesos.length}* ${plural(desc.etiqueta)}: ${pesos.map((p) => `*${formatearKg(p)} kg*`).join(" y ")}`;

  // Si la categoría la puso el sistema y no él, se dice con todas las letras.
  // Que el carnicero descubra tres días después que le cargamos vaca como
  // novillo sería peor que preguntar de más una vez.
  const categoria = pendiente.categoria
    ? pendiente.categoriaExplicita
      ? ` como ${pendiente.categoria}`
      : ` como ${pendiente.categoria} (si no es, o si es de cerdo, decime)`
    : "";

  const laLas = pesos.length === 1 ? "¿La cargo?" : "¿Las cargo?";
  const nota = pendiente.nota ? `\n(${pendiente.nota})` : "";
  return `${desc.emoji} ${cuantas}${categoria}${proveedor}.${nota}\n${laLas} Respondé *confirmar* o *cancelar*.`;
}

function normalizarPendiente(interpretacion: Record<string, unknown>): LotePendiente {
  return {
    tipo: MARCA,
    especie: (interpretacion.especie as Especie | undefined) ?? "vacuno",
    pesoKg: Number(interpretacion.pesoKg ?? 0),
    unidades:
      interpretacion.unidades === null || interpretacion.unidades === undefined
        ? null
        : Number(interpretacion.unidades),
    categoria: (interpretacion.categoria as string | null | undefined) ?? null,
    categoriaExplicita: Boolean(interpretacion.categoriaExplicita),
    proveedor: (interpretacion.proveedor as string | null | undefined) ?? null,
    cantidad: Number(interpretacion.cantidad ?? 1),
    ...(Array.isArray(interpretacion.pesosKg) && interpretacion.pesosKg.length > 1
      ? { pesosKg: (interpretacion.pesosKg as unknown[]).map(Number) }
      : {}),
    fallos: Number(interpretacion.fallos ?? 0),
    ...(typeof interpretacion.nota === "string" ? { nota: interpretacion.nota } : {}),
  };
}

async function categoriaPorDefecto(carniceriaId: string, especie: Especie): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("tablas_rendimiento")
    .select("categoria")
    .eq("carniceria_id", carniceriaId)
    .eq("especie", especie)
    .eq("uso", "explota_lote")
    .is("vigente_hasta", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.categoria as string | null | undefined) ?? null;
}

/**
 * "Entraron 8 pollos" que llegó por el flujo de stock en vez de por acá (el
 * carnicero contestó "8" a "¿cuántos pollos entraron?"). Se carga como lo que
 * es: un cajón de 8 cabezas con el peso de cajón de la carnicería. NO como
 * "8 kg de pollo entero", que es lo que pasaba antes del 21/09.
 */
export async function cargarPollosEnteros(params: {
  carniceriaId: string;
  unidades: number;
}): Promise<{ ok: boolean; mensaje: string }> {
  const pesoKg = await pesoDelCajon(params.carniceriaId);
  const resultado = await cargarLote({
    carniceriaId: params.carniceriaId,
    especie: "aviar",
    pesoRecibidoKg: pesoKg,
    unidades: Math.floor(params.unidades),
  });
  if (!resultado.ok) return { ok: false, mensaje: resultado.mensaje };
  const kgCada = Math.round((pesoKg / params.unidades) * 1000) / 1000;
  return {
    ok: true,
    mensaje: `Pollo entero: cargué ${resultado.piezas} pollos de ${formatearKg(kgCada)} kg (cajón de ${formatearKg(pesoKg)} kg).`,
  };
}

async function pesoDelCajon(carniceriaId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("carnicerias")
    .select("peso_cajon_pollo_kg")
    .eq("id", carniceriaId)
    .maybeSingle();

  const peso = Number(data?.peso_cajon_pollo_kg ?? 0);
  return peso > 0 ? peso : (descriptor("aviar").pesoFijoKgPorDefecto ?? 20);
}

function detectarCategoria(texto: string, especie: Especie): string | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  if (especie !== "vacuno") return null;

  // El orden importa: "novillito" contiene "novillo". Los más específicos primero.
  if (t.includes("novillito")) return "novillito";
  if (t.includes("vaquillona")) return "vaquillona";
  if (t.includes("ternera") || t.includes("ternero")) return "ternera";
  if (t.includes("novillo")) return "novillo";
  if (t.includes("vaca")) return "vaca";
  return null;
}

/** "media res de cerdo" -> "medias reses de cerdo". */
function plural(etiqueta: string): string {
  return etiqueta.replace(/^media res/, "medias reses").replace(/^cajón/, "cajones");
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearKg(valor: number): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export { detectarEspecieDeLote };
