import { getSupabaseAdmin } from "./supabaseAdmin";
import { CatalogoCarniceria } from "./catalogo";
import { listarParaElCliente, mediosPagoHabilitados } from "./mediosPago";

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
async function responderPromociones(carniceriaId: string): Promise<string> {
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

  const vigentes = data ?? [];
  if (vigentes.length === 0) return "Por ahora no tenemos ninguna promo cargada.";

  const lineas = vigentes.map((p) => {
    const detalle = (p.detalle as string | null)?.trim();
    return detalle ? `• ${p.titulo} — ${detalle}` : `• ${p.titulo}`;
  });

  return `Sí, tenemos:\n${lineas.join("\n")}`;
}

// ------------------------------------------------------------
// Stock (secciones 1.1 y 37-38)
// ------------------------------------------------------------
//
// Responde "¿tenés vacío?" sin decir CUÁNTO hay: al cliente le importa si
// puede pedirlo, y el kilaje exacto es información interna del negocio (es la
// misma razón por la que la sección 46 pide listar cortes "sin los kg").
function responderStock(catalogo: CatalogoCarniceria, codigos: string[]): string | null {
  if (codigos.length === 0) return null;

  const hay: string[] = [];
  const noHay: string[] = [];

  for (const codigo of codigos) {
    const producto = catalogo.porCodigo.get(codigo);
    if (!producto) continue;
    if (producto.stock_actual > 0) hay.push(producto.nombre_display);
    else noHay.push(producto.nombre_display);
  }

  if (hay.length === 0 && noHay.length === 0) return null;

  const partes: string[] = [];
  if (hay.length > 0) partes.push(`Sí, tenemos ${hay.join(", ")}.`);
  if (noHay.length > 0) {
    partes.push(
      hay.length > 0
        ? `De ${noHay.join(", ")} no me queda en este momento.`
        : `Justo de ${noHay.join(", ")} no me queda en este momento.`
    );
  }
  partes.push("¿Te preparo algo?");

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
}): Promise<string | null> {
  const { carniceriaId, tema, catalogo, productosConsultados } = params;

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
      return responderStock(catalogo, productosConsultados ?? []);
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
      return "Eso te lo confirman en el local al momento de pagar. ¿Te preparo algo mientras tanto?";
    default:
      return "Eso te lo confirmo bien y te aviso. ¿Te puedo ayudar con algo más mientras tanto?";
  }
}
