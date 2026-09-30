import { getSupabaseAdmin } from "./supabaseAdmin";
import { CatalogoCarniceria, Producto } from "./catalogo";
import { listarParaElCliente, mediosPagoHabilitados } from "./mediosPago";
import { buscarSustitutosConStock, opcionesDeReemplazo } from "./alternativas";
import { estimadorPiezaEntera, estimadorPorUnidad } from "./lotes";
import { armarRecomendacion, sinNadaParaOcasion, type Ocasion } from "./recomendaciones";
import { cargarTablaOcasiones } from "./recomendacionesCarniceria";
import { cierreDeConsulta } from "./tono";

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
// "no me queda". Se busca un sustituto autorizado — y el buscador solo
// devuelve los que TIENEN STOCK (ver alternativas.ts). Nunca se nombra un
// reemplazo sin haber mirado el stock, y nunca lo elige la IA: los pares
// autorizados están en la base y el filtro de stock es del código.

/**
 * Los nombres de los sustitutos autorizados CON STOCK de un producto.
 * Devuelve [] si no hay ninguno — y ahí no se ofrece nada, que es lo correcto.
 */
async function sustitutosDisponibles(
  carniceriaId: string,
  catalogo: CatalogoCarniceria,
  producto: Producto,
  yaExcluidos: Set<string>
): Promise<string[]> {
  const opciones = await buscarSustitutosConStock({
    carniceriaId,
    catalogo,
    productoFaltante: producto,
    yaExcluidos,
  });
  for (const o of opciones) yaExcluidos.add(o.producto.id);
  // Dos alcanzan: una lista larga en WhatsApp no la lee nadie.
  return opciones.slice(0, 2).map((o) => o.producto.nombre_display);
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
  const frases: string[] = [];

  for (const codigo of codigos) {
    const producto = catalogo.porCodigo.get(codigo);
    if (!producto) continue;
    const nombre = (nombrar ? nombrar(producto) : producto.alias_display ?? producto.nombre_display).toLowerCase();

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

    // Primero los sustitutos autorizados; si no hay, otros cortes de la misma
    // ocasión que armó la carnicería (alternativas.ts, 30/09/2026). Bug real:
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
}): Promise<string | null> {
  const { carniceriaId, tema, catalogo, productosConsultados, nombrar, ocasion } = params;

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
    default:
      return null;
  }
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
