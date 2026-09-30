import { getSupabaseAdmin } from "./supabaseAdmin";
import { normalizarTexto } from "./texto";
import { CatalogoCarniceria, Producto } from "./catalogo";
import { listarParaElCliente, mediosPagoHabilitados } from "./mediosPago";
import { opcionesDeReemplazo } from "./alternativas";
import { estimadorInfoPieza, estimadorPiezaEntera, estimadorPorUnidad } from "./lotes";
import { armarRecomendacion, sinNadaParaOcasion, type Ocasion } from "./recomendaciones";
import { cargarTablaOcasiones } from "./recomendacionesCarniceria";
import { cierreDeConsulta, elegir } from "./tono";
import { aptitud, palabraDeOcasion, queEs, FICHAS } from "./conocimientoCortes";
import { tituloDeOcasion, type OcasionConcreta } from "./recomendaciones";

// ============================================================
// Atención general — especificación del bot, secciones 1.1 y 15 a 21
// ============================================================
//
// Hasta la Tanda 2, el bot solo entendía pedidos: cualquier otra cosa caía en
// "no te entendí". La sección 1.1 es explícita en que Carnicom es atención al
// público y no solo un tomador de pedidos.
//
// La regla que ordena todo este archivo es la 1.3: **nunca inventar**. Cada
// respuesta de acá sale de un dato real de la base. Cuando el dato no está
// cargado, no se improvisa ni se pone un valor "razonable" — se contesta con
// naturalidad que eso conviene confirmarlo, que es exactamente lo que pide la
// sección 15.
//
// Por eso ninguna de estas funciones recibe texto libre de la IA para repetir:
// la IA solo clasifica DE QUÉ está preguntando el cliente, y el texto de la
// respuesta lo arma este archivo con datos de la carnicería.

export type TemaConsulta =
  | "horarios"
  | "direccion"
  | "medios_pago"
  | "promociones"
  | "delivery"
  | "stock"
  | "sustitutos"
  | "peso_unidad"
  | "recomendacion"
  | "aptitud"
  | "que_es"
  | "otro";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const OFFSET_ARGENTINA_HORAS = -3;

/** "2026-09-10" del día de hoy en Argentina (no en UTC, que a la noche ya cambió de día). */
function hoyEnArgentina(ahora: Date = new Date()): string {
  const enArgentina = new Date(ahora.getTime() + OFFSET_ARGENTINA_HORAS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${enArgentina.getUTCFullYear()}-${pad(enArgentina.getUTCMonth() + 1)}-${pad(enArgentina.getUTCDate())}`;
}

/** "08:00:00" → "08:00". */
function hhmm(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : null;
}

type FilaHorario = {
  dia_semana: number;
  cerrado: boolean;
  turno1_desde: string | null;
  turno1_hasta: string | null;
  turno2_desde: string | null;
  turno2_hasta: string | null;
};

function describirTurnos(fila: FilaHorario): string {
  if (fila.cerrado) return "cerrado";
  const turnos: string[] = [];
  if (fila.turno1_desde && fila.turno1_hasta) turnos.push(`${hhmm(fila.turno1_desde)} a ${hhmm(fila.turno1_hasta)}`);
  if (fila.turno2_desde && fila.turno2_hasta) turnos.push(`${hhmm(fila.turno2_desde)} a ${hhmm(fila.turno2_hasta)}`);
  return turnos.length > 0 ? turnos.join(" y ") : "cerrado";
}

// ------------------------------------------------------------
// Horarios (sección 18)
// ------------------------------------------------------------
//
// Se agrupan los días con el mismo horario ("lunes a viernes de 8 a 13") en
// vez de listar siete líneas: en WhatsApp una parrilla de siete renglones se
// lee horrible y nadie la termina.
async function responderHorarios(carniceriaId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: filas } = await supabaseAdmin
    .from("horarios_atencion")
    .select("dia_semana, cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta")
    .eq("carniceria_id", carniceriaId)
    .order("dia_semana");

  const horarios = (filas ?? []) as FilaHorario[];
  if (horarios.length === 0) return null;

  // Se empieza por el lunes porque es como se piensa una semana comercial;
  // el domingo (0) queda al final.
  const ordenados = [...horarios].sort((a, b) => ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7));

  const bloques: { dias: number[]; texto: string }[] = [];
  for (const fila of ordenados) {
    const texto = describirTurnos(fila);
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.texto === texto) ultimo.dias.push(fila.dia_semana);
    else bloques.push({ dias: [fila.dia_semana], texto });
  }

  const lineas = bloques
    .filter((b) => b.texto !== "cerrado")
    .map((b) => {
      const nombres =
        b.dias.length === 1
          ? DIAS[b.dias[0]]
          : `${DIAS[b.dias[0]]} a ${DIAS[b.dias[b.dias.length - 1]]}`;
      return `• ${nombres}: ${b.texto}`;
    });

  if (lineas.length === 0) return null;

  const cerrados = bloques.filter((b) => b.texto === "cerrado").flatMap((b) => b.dias);
  const notaCerrado =
    cerrados.length > 0 ? `\n${cerrados.length === 1 ? "Los" : "Los"} ${cerrados.map((d) => DIAS[d]).join(" y ")} no abrimos.` : "";

  // Un cierre excepcional de hoy o mañana pisa al horario semanal (sección 18)
  // y es justo el dato por el que alguien pregunta el horario.
  const hoy = hoyEnArgentina();
  const { data: especiales } = await supabaseAdmin
    .from("dias_especiales")
    .select("fecha, cerrado, motivo")
    .eq("carniceria_id", carniceriaId)
    .gte("fecha", hoy)
    .order("fecha")
    .limit(1);

  const especial = especiales?.[0];
  const notaEspecial =
    especial && especial.cerrado
      ? `\n\nOjo: el ${(especial.fecha as string).split("-").reverse().slice(0, 2).join("/")} no abrimos${
          especial.motivo ? ` (${especial.motivo})` : ""
        }.`
      : "";

  return `Nuestros horarios son:\n${lineas.join("\n")}${notaCerrado}${notaEspecial}`;
}

// ------------------------------------------------------------
// Dirección (sección 21)
// ------------------------------------------------------------
async function responderDireccion(carniceriaId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("carnicerias")
    .select("direccion")
    .eq("id", carniceriaId)
    .maybeSingle();

  const direccion = (data?.direccion as string | null)?.trim();
  if (!direccion) return null;

  return `Estamos en ${direccion}. Te esperamos 🙌`;
}

// ------------------------------------------------------------
// Medios de pago (sección 19)
// ------------------------------------------------------------
async function responderMediosPago(carniceriaId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("carnicerias")
    .select("medios_pago")
    .eq("id", carniceriaId)
    .maybeSingle();

  const habilitados = mediosPagoHabilitados(data?.medios_pago as string[] | null);
  if (habilitados.length === 0) return null;

  return `Podés pagar con ${listarParaElCliente(habilitados)}.`;
}

// ------------------------------------------------------------
// Promociones (sección 17)
// ------------------------------------------------------------
//
// Regla absoluta: NUNCA inventar una promoción. Acá el "no hay" es una
// respuesta legítima y frecuente, no un fallo — por eso devuelve texto en vez
// de null cuando la consulta se pudo responder y la respuesta es que no hay
// nada cargado.
type PromoVigente = { titulo: string; detalle: string | null };

async function promocionesVigentes(carniceriaId: string): Promise<PromoVigente[]> {
  const hoy = hoyEnArgentina();

  const { data } = await getSupabaseAdmin()
    .from("promociones")
    .select("titulo, detalle, desde, hasta")
    .eq("carniceria_id", carniceriaId)
    .eq("activa", true)
    .or(`desde.is.null,desde.lte.${hoy}`)
    .or(`hasta.is.null,hasta.gte.${hoy}`)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((p) => ({
    titulo: String(p.titulo),
    detalle: ((p.detalle as string | null) ?? "").trim() || null,
  }));
}

async function responderPromociones(carniceriaId: string): Promise<string> {
  const vigentes = await promocionesVigentes(carniceriaId);
  if (vigentes.length === 0) return "Por ahora no tenemos ninguna promo cargada.";

  const lineas = vigentes.map((p) => (p.detalle ? `• ${p.titulo} — ${p.detalle}` : `• ${p.titulo}`));

  // Se cierra invitando a pedirla (21/09): antes la respuesta terminaba en la
  // lista y el cliente tenía que adivinar cómo seguir. "Quiero la promo" ya lo
  // entiende el intérprete como un pedido (ver bloquePromocionesParaPrompt).
  const invitacion =
    vigentes.length === 1 ? "¿Querés que te la prepare?" : "¿Querés que te prepare alguna?";

  return `Sí, tenemos:\n${lineas.join("\n")}\n\n${invitacion}`;
}

/**
 * Las promos vigentes, como bloque para el prompt del intérprete de pedidos.
 *
 * Existe para que "quiero la promo" se entienda como un PEDIDO de lo que dice
 * la promo, y no como otra pregunta por las promos. El modelo solo usa el
 * texto que cargó la carnicería: si la promo no dice producto y cantidad, no
 * se inventan (regla 1) y se pregunta.
 */
export async function bloquePromocionesParaPrompt(carniceriaId: string): Promise<string | null> {
  const vigentes = await promocionesVigentes(carniceriaId);
  if (vigentes.length === 0) return null;

  return [
    "PROMOS VIGENTES (texto tal cual lo cargó la carnicería):",
    ...vigentes.map((p) => `- ${p.titulo}${p.detalle ? ` — ${p.detalle}` : ""}`),
    "",
    'Si el cliente dice que QUIERE una promo ("quiero la promo", "dame esa", "mandame la de las',
    'milanesas"), eso NO es una consulta: es un PEDIDO. Armalo con el producto y la cantidad que dice la',
    "promo (usando los códigos de PRODUCTOS ACTIVOS). Si hay varias promos y no queda claro cuál quiere,",
    "respondé aclaracion preguntando cuál. Si la promo no dice cantidad o producto, preguntalo: NUNCA",
    "inventes una promo, un regalo ni un descuento que no esté escrito acá.",
  ].join("\n");
}

// ------------------------------------------------------------
// Stock y sustitutos (secciones 1.1, 5 y 37-38)
// ------------------------------------------------------------
//
// Responde "¿tenés vacío?" sin decir CUÁNTO hay: al cliente le importa si
// puede pedirlo, y el kilaje exacto es información interna del negocio (es la
// misma razón por la que la sección 46 pide listar cortes "sin los kg").
//
// ⚠️ Regla del 13/09/2026: cuando de algo NO hay, la respuesta no termina en
// "no me queda". Se ofrece lo que hay de la tabla de recomendaciones de la
// carnicería, y el buscador solo devuelve lo que TIENE STOCK (ver
// alternativas.ts). Nunca lo elige la IA. (Desde el 01/10 ya no hay tabla de
// sustitutos: el fundador pidió que todo salga de las recomendaciones.)

/**
 * Los nombres de lo que se puede ofrecer CON STOCK en lugar de un producto.
 * Devuelve [] si no hay nada — y ahí no se ofrece nada, que es lo correcto.
 */
async function sustitutosDisponibles(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  producto: Producto,
  yaExcluidos: Set<string>
): Promise<string[]> {
  const opciones = await opcionesDeReemplazo({ carniceriaId, catalogo, productoFaltante: producto, excluidos: yaExcluidos, maximo: 3 });
  for (const p of opciones.productos) yaExcluidos.add(p.id);
  return opciones.productos.map((p) => (p.alias_display ?? p.nombre_display).toLowerCase());
}

function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}`;
}

// ------------------------------------------------------------
// "¿Cuánto pesa uno?" (28/09/2026)
// ------------------------------------------------------------
//
// El peso sale SIEMPRE de un dato real, en este orden:
//   1. Lo que pesa una unidad según la carnicería o el pollo promedio del
//      stock (estimadorPorUnidad: catálogo → pollos → presas).
//   2. Lo que pesaron las piezas enteras de ese corte al entrar con las
//      medias reses (estimadorPiezaEntera).
// Si no hay ninguno de los dos, null → respuestaSinDato. Nunca se inventa.

/** "1,5 kg" o, si es menos de un kilo, "600 g" (redondeado a 50 g: es aproximado). */
export function textoPeso(kg: number): string {
  if (kg < 1) return `${Math.max(50, Math.round((kg * 1000) / 50) * 50)} g`;
  return `${(Math.round(kg * 10) / 10).toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`;
}

/** Frase con la que se marca la respuesta: flujoPedidos la busca para saber que "dame una" es una pieza entera. */
export const MARCA_PIEZA_ENTERA = "la pieza entera de";

async function responderPeso(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  codigos: string[],
  nombrar?: (producto: Producto) => string
): Promise<string | null> {
  if (codigos.length === 0) return null;
  const porUnidad = estimadorPorUnidad(carniceriaId);
  const porPieza = estimadorPiezaEntera(carniceriaId);
  const infoPieza = estimadorInfoPieza(carniceriaId);
  const frases: string[] = [];

  for (const codigo of codigos) {
    const producto = catalogo.porCodigo.get(codigo);
    if (!producto) continue;
    const nombre = (nombrar ? nombrar(producto) : producto.alias_display ?? producto.nombre_display).toLowerCase();

    // Los cortes que se venden por pieza (un vacío, un matambre): entre
    // cuánto y cuánto pesa uno entero, y cuántos enteros hay (01/10/2026).
    const info = await infoPieza(producto);
    if (info) {
      const rango =
        info.kgMax - info.kgMin >= 0.2
          ? `entre ${textoPeso(info.kgMin)} y ${textoPeso(info.kgMax)}`
          : `más o menos ${textoPeso(info.kgPromedio)}`;
      const hay =
        info.enteras.length === 0
          ? " Entera hoy no me queda, pero te corto lo que necesites."
          : info.enteras.length === 1
            ? ` Hoy tengo una de unos ${textoPeso(info.enteras[0].kg)}.`
            : ` Hoy tengo ${info.enteras.length}, de unos ${textoPeso(info.kgPromedio)} cada una.`;
      // "La pieza entera de" también es la marca con la que el pedido sabe
      // que un "dame una" que venga después es la pieza entera.
      frases.push(`${capitalizar(MARCA_PIEZA_ENTERA)} ${nombre} pesa ${rango}.${producto.stock_actual > 0 ? hay : ""}`);
      continue;
    }

    const unidad = await porUnidad(producto);
    if (unidad) {
      frases.push(`Cada ${nombre} pesa más o menos ${textoPeso(unidad.kg)}.`);
      continue;
    }
    const pieza = await porPieza(producto);
    if (pieza) {
      frases.push(`${capitalizar(MARCA_PIEZA_ENTERA)} ${nombre} pesa más o menos ${textoPeso(pieza)}.`);
    }
  }

  if (frases.length === 0) return null;
  return `${frases.join(" ")} Es aproximado: cada pieza es distinta y al final se cobra lo que pesa.`;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Red de seguridad determinística (Patrón 3 del manual): "¿cuánto pesa uno?"
 * tiene que ser una consulta de peso aunque la IA diga "no entendí". Solo
 * reconoce preguntas por el PESO de una unidad, no "¿cuánto sale?" (precio).
 */
export function preguntaPorPeso(texto: string): boolean {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // "¿A cuánto viene el kilo?" / "¿cuánto sale?" es PRECIO, no peso.
  if (/\ba cuanto\b|\bsale\b|\bcuesta\b|\bprecio\b|\$/.test(t)) return false;
  return (
    /\bcuanto (pesa|pesan|viene|vienen|trae|traen)\b/.test(t) ||
    /\bde cuanto (es|son|viene|vienen)\b.*\b(uno|una|cada|pieza|unidad)\b/.test(t) ||
    /\bcuantos? (kilos?|kg|gramos?) (tiene|tienen|pesa|pesan|trae|traen|viene|vienen)\b/.test(t) ||
    /\bque (peso|tamano) (tiene|tienen|trae|traen)\b/.test(t)
  );
}

async function responderStock(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  codigos: string[]
): Promise<string | null> {
  if (codigos.length === 0) return null;

  const hay: string[] = [];
  const noHay: Producto[] = [];

  for (const codigo of codigos) {
    const producto = catalogo.porCodigo.get(codigo);
    if (!producto) continue;
    if (producto.stock_actual > 0) hay.push(producto.nombre_display);
    else noHay.push(producto);
  }

  if (hay.length === 0 && noHay.length === 0) return null;

  const partes: string[] = [];
  // "Sí, tenemos matambre, costilla y vacío." (antes: "Matambre, Costilla, Vacío").
  const conY = (nombres: string[]) =>
    nombres.length <= 1 ? nombres[0] ?? "" : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  if (hay.length > 0) partes.push(`Sí, tenemos ${conY(hay.map((n) => n.toLowerCase()))}.`);

  if (noHay.length > 0) {
    const nombres = noHay.map((p) => p.nombre_display.toLowerCase());
    partes.push(
      hay.length > 0
        ? `De ${nombres.join(", ")} no me queda en este momento.`
        : `Justo de ${nombres.join(", ")} no me queda en este momento.`
    );

    // Antes de decir "no hay" y cortar, se mira si hay un reemplazo REAL.
    const yaExcluidos = new Set<string>(noHay.map((p) => p.id));
    const alternativas: string[] = [];
    for (const producto of noHay) {
      alternativas.push(...(await sustitutosDisponibles(carniceriaId, catalogo, producto, yaExcluidos)));
    }

    if (alternativas.length > 0) {
      partes.push(`Lo que sí tengo y te puede servir es ${enumerar(alternativas)}. ¿Te sirve?`);
      return partes.join(" ");
    }
  }

  // Antes terminaba SIEMPRE con "¿Te preparo algo?": el fundador lo marcó como
  // insoportable. Ahora a veces se ofrece, a veces no (tono.ts).
  return `${partes.join(" ")}${cierreDeConsulta(false)}`;
}

/**
 * "¿Tenés algo parecido?" — la consulta explícita por un reemplazo.
 *
 * El cliente puede preguntarlo sin nombrar el producto ("¿y algo parecido?"),
 * así que quien llama tiene que pasarle el producto del que se venía
 * hablando. Sin referencia no se adivina: se repregunta (regla 2, nunca
 * suponer ante ambigüedad).
 */
async function responderSustitutos(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  codigos: string[]
): Promise<string | null> {
  const productos = codigos
    .map((c) => catalogo.porCodigo.get(c))
    .filter((p): p is Producto => p != null);

  if (productos.length === 0) return null;

  const yaExcluidos = new Set<string>(productos.map((p) => p.id));
  const partes: string[] = [];

  for (const producto of productos) {
    // Si de lo que preguntó SÍ hay, la respuesta no es un sustituto: es que
    // se lo puede llevar.
    if (producto.stock_actual > 0) {
      partes.push(`De ${producto.nombre_display} todavía tengo, así que no hace falta cambiarlo.`);
      continue;
    }

    // Otros cortes de la misma ocasión que armó la carnicería, primero de la
    // misma especie (alternativas.ts, 30/09 y 01/10/2026). Bug real:
    // "¿qué otra cosa puede ser?" → "no tengo nada parecido" dos veces,
    // habiendo matambre y entraña para la parrilla.
    const opciones = await opcionesDeReemplazo({ carniceriaId, catalogo, productoFaltante: producto, excluidos: yaExcluidos });
    const nombre = producto.nombre_display.toLowerCase();
    if (opciones.productos.length > 0) {
      opciones.productos.forEach((p) => yaExcluidos.add(p.id));
      const nombres = opciones.productos.map((p) => (p.alias_display ?? p.nombre_display).toLowerCase());
      partes.push(
        opciones.fuente === "ocasion"
          ? `En lugar de ${nombre} te puedo dar ${enumerar(nombres)}, que también van ${opciones.paraQue ?? "bien"}. ¿Cuál te pongo?`
          : `En lugar de ${nombre} te puedo dar ${enumerar(nombres)}. ¿Cuál te pongo?`
      );
    } else {
      // Sección 1.3: nunca se inventa un reemplazo que la carnicería no
      // autorizó ni tiene en sus listas.
      partes.push(`Para reemplazar ${nombre} no tengo nada parecido en este momento.`);
    }
  }

  if (partes.length === 0) return null;
  return partes.join(" ");
}

// ------------------------------------------------------------
// Punto de entrada
// ------------------------------------------------------------

// ------------------------------------------------------------
// Varias preguntas en un mismo mensaje (01/10/2026)
// ------------------------------------------------------------
//
// Bug: "¿En qué dirección están? ¿Qué días abren?" se contestó solo con la
// dirección. La IA clasifica UN tema por mensaje, así que la otra pregunta se
// perdía. El fundador: "debe saber responder dos preguntas a la vez. Y no
// hacerlo en dos mensajes separados".
//
// Las preguntas de información (dónde, cuándo, cómo pago, si hay envío, si
// hay promos) se reconocen por el texto, sin IA (Patrón 3 del manual): son
// frases cortas y de forma fija. Se contestan TODAS, en un solo mensaje y en
// el orden en que las hizo.

const PATRONES_INFORMATIVOS: [TemaConsulta, RegExp][] = [
  ["direccion", /\b(direccion|donde (estan|queda|quedan|es el local|los encuentro|se encuentran)|ubicacion|ubicados|como llego|en que calle|la dire)\b/],
  [
    "horarios",
    /\b(horarios?|a que hora (abren|abris|cierran|cerras|atienden|arrancan)|hasta que hora|desde que hora|que dias|dias (abren|atienden|trabajan)|abren|abris|cierran|cerras|atienden|estan abiertos|esta abierto|trabajan (hoy|manana|el))\b/,
  ],
  ["medios_pago", /\b(medios? de pago|formas? de pago|como (se )?(paga|pago|puedo pagar|abono)|aceptan|toman (tarjeta|debito|credito|mercado ?pago|transferencia)|se puede pagar|puedo pagar|pagar con)\b/],
  ["delivery", /\b(delivery|envios?|hacen envio|mandan a domicilio|a domicilio|me lo (mandan|llevan|traen)|reparten)\b/],
  ["promociones", /\b(promos?|promociones?|ofertas?|descuentos?)\b/],
];

// "Quiero la promo", "dame la oferta": eso es un pedido, no una pregunta.
const PIDE_ALGO = /\b(quiero|queria|dame|damelo|pasame|anotame|poneme|me llevo|reservame|separame|preparame|haceme)\b/;

/**
 * Los temas de información que pregunta el texto, en el orden en que los
 * preguntó. Vacío si no pregunta ninguno.
 */
export function temasInformativosEnTexto(texto: string): TemaConsulta[] {
  const t = normalizarTexto(texto).replace(/[¿?¡!.,;:]+/g, " ").replace(/\s+/g, " ");
  const encontrados: { tema: TemaConsulta; posicion: number }[] = [];
  for (const [tema, patron] of PATRONES_INFORMATIVOS) {
    const m = patron.exec(t);
    if (!m) continue;
    if (tema === "promociones" && PIDE_ALGO.test(t)) continue;
    encontrados.push({ tema, posicion: m.index });
  }
  return encontrados.sort((a, b) => a.posicion - b.posicion).map((e) => e.tema);
}

export const TEMAS_INFORMATIVOS: TemaConsulta[] = ["direccion", "horarios", "medios_pago", "delivery", "promociones"];

/** Las preguntas de información: salen de los datos de la carnicería, no del catálogo. */
async function responderInformativo(carniceriaId: string, tema: TemaConsulta): Promise<string | null> {
  switch (tema) {
    case "horarios":
      return await responderHorarios(carniceriaId);
    case "direccion":
      return await responderDireccion(carniceriaId);
    case "medios_pago":
      return await responderMediosPago(carniceriaId);
    case "promociones":
      return await responderPromociones(carniceriaId);
    case "delivery":
      // Sección 20: no hay delivery y no está previsto. Es un dato del
      // producto, no de la carnicería, así que no depende de la base.
      return "Por el momento los pedidos son para retirar por el local.";
    default:
      return null;
  }
}

/**
 * Contesta varias preguntas de información en UN mensaje. Cada respuesta sale
 * de los datos reales de la carnicería (o reconoce que el dato no está, como
 * siempre: nunca se inventa). El "Te esperamos" de la dirección va una sola
 * vez, al final.
 */
export async function responderTemasInformativos(carniceriaId: string, temas: TemaConsulta[]): Promise<string> {
  const partes: string[] = [];
  for (const tema of temas) {
    const respuesta = (await responderInformativo(carniceriaId, tema)) ?? respuestaSinDato(tema);
    partes.push(respuesta);
  }
  if (partes.length > 1) {
    const conEsperamos = partes.findIndex((p) => /Te esperamos 🙌$/.test(p));
    if (conEsperamos >= 0 && conEsperamos < partes.length - 1) {
      partes[conEsperamos] = partes[conEsperamos].replace(/\s*Te esperamos 🙌$/, "");
    }
  }
  return partes.join("\n\n");
}

/**
 * Devuelve el texto con el que hay que contestar una consulta, o `null` si no
 * se pudo responder con datos reales.
 *
 * Ese `null` es importante: significa "no tengo el dato cargado", y quien
 * llama tiene que resolverlo como dice la sección 15 (reconocer que hay que
 * verificarlo), nunca completándolo por su cuenta.
 */
export async function responderConsulta(params: {
  carniceriaId: string;
  tema: TemaConsulta;
  catalogo: CatalogoCarniceria;
  productosConsultados?: string[];
  /** Cómo nombrar cada producto con la palabra del cliente (si no, el nombre de la carnicería). */
  nombrar?: (producto: Producto) => string;
  /** Para qué lo quiere, si pidió una recomendación. */
  ocasion?: Ocasion;
  /** El mensaje del cliente, para contestar con su palabra ("estofado", no "la olla"). */
  texto?: string;
}): Promise<string | null> {
  const { carniceriaId, tema, catalogo, productosConsultados, nombrar, ocasion, texto } = params;

  if (TEMAS_INFORMATIVOS.includes(tema)) return await responderInformativo(carniceriaId, tema);

  switch (tema) {
    case "stock":
      return await responderStock(carniceriaId, catalogo, productosConsultados ?? []);
    case "sustitutos":
      return await responderSustitutos(carniceriaId, catalogo, productosConsultados ?? []);
    case "peso_unidad":
      return await responderPeso(carniceriaId, catalogo, productosConsultados ?? [], nombrar);
    case "recomendacion": {
      // Siempre contesta algo cierto: la lista con stock real, o que para eso
      // no queda nada (y se le ofrece lo demás). Nunca un "te aviso".
      // La tabla es la que armó ESTE carnicero en el panel (o la de fábrica).
      const o = ocasion ?? "general";
      const tabla = await cargarTablaOcasiones(carniceriaId);
      return armarRecomendacion({ ocasion: o, porCodigo: catalogo.porCodigo, nombrar, tabla }) ?? sinNadaParaOcasion(o);
    }
    case "aptitud":
      return ocasion && ocasion !== "general"
        ? await responderAptitud(carniceriaId, catalogo, productosConsultados ?? [], ocasion, texto ?? "", nombrar)
        : null;
    case "que_es":
      return responderQueEs(catalogo, productosConsultados ?? [], nombrar);
    default:
      return null;
  }
}

// ------------------------------------------------------------
// "¿La aguja es buena para estofado?" — con fundamento (01/10/2026)
// ------------------------------------------------------------
//
// El porqué sale de las fichas de conocimientoCortes.ts (oficio de
// carnicero, escrito a mano: la IA no lo inventa). Si el corte no tiene
// ficha para esa preparación, se usa la tabla de recomendaciones de la
// carnicería, sin inventar un porqué. Siempre se dice si hay stock, y si no
// es lo ideal (o no hay), se ofrece lo que sí sirve y tiene stock.

/** "la aguja", "el vacío", "los chinchulines". */
function conArticulo(nombre: string): string {
  const n = nombre.toLowerCase().trim();
  const primera = n.split(/\s+/)[0];
  if (/as$/.test(primera)) return `las ${n}`;
  if (/(os|es)$/.test(primera)) return `los ${n}`;
  if (/a$/.test(primera)) return `la ${n}`;
  return `el ${n}`;
}

function capitalizarPrimera(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function responderAptitud(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  codigos: string[],
  ocasion: OcasionConcreta,
  texto: string,
  nombrar?: (producto: Producto) => string
): Promise<string | null> {
  const productos = codigos.map((c) => catalogo.porCodigo.get(c)).filter((p): p is Producto => p != null).slice(0, 2);
  if (productos.length === 0) return null;
  const tabla = await cargarTablaOcasiones(carniceriaId);
  const palabra = palabraDeOcasion(ocasion, texto);
  const nombreDe = (p: Producto) => (nombrar ? nombrar(p) : p.alias_display ?? p.nombre_display).toLowerCase();

  // Lo que sí sirve para esto y hay hoy (para ofrecer cuando no conviene o no hay).
  const alternativas = (excluir: Set<string>) =>
    tabla[ocasion].cortes
      .map((c) => catalogo.porCodigo.get(c))
      .filter((p): p is Producto => p != null && p.stock_actual > 0 && !excluir.has(p.id))
      .slice(0, 3)
      .map(nombreDe);

  const frases: string[] = [];
  const excluir = new Set(productos.map((p) => p.id));
  for (const producto of productos) {
    const nombre = nombreDe(producto);
    const hay = producto.stock_actual > 0;
    const sabido = aptitud(producto.codigo, ocasion);
    const enLaLista = tabla[ocasion].cortes.includes(producto.codigo) || tabla[ocasion].acompanan.includes(producto.codigo);
    const apto = sabido ? sabido.apto : enLaLista;

    // El porqué va después de dos puntos: los dos puntos internos del texto
    // de la ficha pasan a coma, así no queda "...: ...: ...".
    const motivo = sabido ? sabido.motivo.replace(/:\s*/g, ", ") : "";
    if (apto) {
      const porque = sabido ? `: ${motivo}` : "";
      const si = elegir(["Sí 👌", "Sí, de una.", "¡Sí!"]);
      frases.push(`${si} ${capitalizarPrimera(conArticulo(nombre))} va muy bien para ${palabra}${porque}.`);
      if (hay) {
        // "¿Tienen algo para estofado? ¿Aguja?": se contesta por la aguja y
        // se nombran un par de opciones más, que es lo que preguntó primero.
        const otras = /\balgo\b/i.test(texto) ? alternativas(excluir) : [];
        frases.push(otras.length > 0 ? `Hoy tengo, y también ${enumerarY(otras)}.` : elegir(["Hoy tengo.", "Hoy hay.", "Tengo hoy."]));
      }
      if (!hay) {
        const otras = alternativas(excluir);
        frases.push(otras.length > 0 ? `Justo hoy no me queda 😕 Para ${palabra} tengo ${enumerar(otras)}.` : "Justo hoy no me queda 😕");
      }
    } else {
      const porque = sabido ? `: ${motivo}` : ".";
      const otras = alternativas(excluir);
      frases.push(
        `${capitalizarPrimera(conArticulo(nombre))} para ${palabra} no es lo ideal${porque}${sabido ? "." : ""}` +
          (otras.length > 0 ? ` Para eso te recomiendo ${enumerar(otras)}, que tengo hoy.` : "")
      );
    }
  }
  return frases.join(" ").replace(/\.\./g, ".");
}

/** "¿Qué es la marucha?" → de dónde sale y para qué va, desde las fichas. */
function responderQueEs(
  catalogo: CatalogoCarniceria,
  codigos: string[],
  nombrar?: (producto: Producto) => string
): string | null {
  const producto = codigos.map((c) => catalogo.porCodigo.get(c)).find((p): p is Producto => p != null);
  if (!producto) return null;
  const descripcion = queEs(producto.codigo);
  if (!descripcion) return null;
  const nombre = (nombrar ? nombrar(producto) : producto.alias_display ?? producto.nombre_display).toLowerCase();
  const ficha = Object.keys(FICHAS[producto.codigo]?.bien ?? {});
  const paraQue = ficha
    .slice(0, 3)
    .map((o) => tituloDeOcasion(o as OcasionConcreta).replace(/^Para /, "").replace(/\s*\(.*\)$/, ""));
  return `${capitalizarPrimera(conArticulo(nombre))} ${descripcion}.${paraQue.length > 0 ? ` Va muy bien para ${enumerarY(paraQue)}.` : ""}`;
}

function enumerarY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Qué contestar cuando la consulta no se pudo responder con datos reales
 * (sección 15). Deliberadamente NO promete un plazo ni dice "le pregunto al
 * encargado": prometer un seguimiento que hoy no existe sería otra forma de
 * inventar.
 */
export function respuestaSinDato(tema: TemaConsulta): string {
  switch (tema) {
    case "horarios":
      return "Uy, no tengo los horarios a mano para confirmártelos. ¿Te sirve si igual me decís qué necesitás y lo dejamos preparado?";
    case "direccion":
      return "No tengo la dirección a mano para pasártela por acá. ¿Querés que igual te vaya armando el pedido?";
    case "medios_pago":
      return "Eso te lo confirman en el local al momento de pagar.";
    case "peso_unidad":
      // No hay ningún peso real cargado ni piezas que hayan entrado: no se
      // inventa un número. Se lo lleva de vuelta a kilos, que siempre sirve.
      return "Eso varía pieza a pieza y no lo tengo cargado para decírtelo seguro. Si me decís más o menos cuántos kilos querés, te lo preparo.";
    case "sustitutos":
      // Preguntó por "algo parecido" pero no sabemos parecido a QUÉ.
      return "¿Parecido a qué corte? Decime cuál tenías en mente y te digo qué tengo.";
    default:
      // Antes decía "eso te lo confirmo y te aviso": una promesa que nadie iba a
      // cumplir (no hay seguimiento automático). Se dice la verdad y se ofrece
      // lo que el bot SÍ puede hacer.
      return "Eso no te lo sé responder por acá. Si querés, te cuento qué tengo hoy para la parrilla, el horno o para milanesas, o te armo un pedido.";
  }
}
