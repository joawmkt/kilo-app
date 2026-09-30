import type { CatalogoCarniceria, Producto } from "./catalogo";
import type { ItemOperacion, ItemParcial, ResultadoInterpretacion } from "./interpretarStock";
import { numeroEnPalabra } from "./deteccionLote";

// ============================================================
// Respuestas cortas del carnicero, leídas SIN IA (30/09/2026)
// ============================================================
//
// Bugs del 30/09, uno detrás de otro:
//   - el bot preguntó "¿Nalga vacuna o de cerdo?", el carnicero contestó
//     "vacuna" y el bot dijo "no te llegué a entender" DOS veces;
//   - preguntó "¿Cuántos kilos de nalga vacuna?", le contestó "7" y otra vez
//     "no te llegué a entender".
// La IA, con una respuesta de una palabra, a veces no sabe a qué pregunta
// corresponde. Pero NOSOTROS sí sabemos qué preguntamos. Cuando la respuesta
// es corta y la pregunta pendiente tiene respuestas contadas (un animal, un
// número), se completa acá, sin modelo (Patrón 5 del manual: el lector sin IA
// de respaldo para las respuestas contadas).
//
// Y una regla de carnicería que manda el fundador: "nalga" a secas ES nalga
// vacuna, y la picada es SIEMPRE de carne vacuna. El cerdo se nombra ("nalga
// de cerdo"). Así que la pregunta "¿vacuna o de cerdo?" solo tiene sentido si
// se estuvo hablando de cerdo; si no, se resuelve sola a vacuno
// (`resolverEspecieSola`).
//
// Este archivo no toca la base: recibe todo lo que necesita.

type Especie = "vacuno" | "porcino";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** ¿La pregunta es "¿X vacuna o de cerdo?" (en cualquier orden)? */
export function preguntaDeEspecie(pregunta: string | null | undefined): boolean {
  const p = normalizar(pregunta ?? "");
  return /\b(vacun[oa]|de vaca|vaca)\b/.test(p) && /\b(cerdo|chancho|porcin[oa])\b/.test(p);
}

/** "vacuna", "de vaca", "la vacuna", "vaca" → vacuno; "cerdo", "de chancho" → porcino. */
export function especieDeRespuesta(texto: string): Especie | null {
  const t = normalizar(texto);
  if (t.split(/\s+/).length > 5) return null;
  const vaca = /\b(vacun[oa]s?|vacas?|novillo|ternera|de vaca)\b/.test(t);
  const cerdo = /\b(cerdos?|chanchos?|porcin[oa]s?|de cerdo)\b/.test(t);
  if (vaca === cerdo) return null;
  return vaca ? "vacuno" : "porcino";
}

/** "7", "7 kg", "7 kilos", "7,5", "siete", "7k" → 7. null si trae otra cosa. */
export function numeroDeRespuesta(texto: string): number | null {
  const t = normalizar(texto)
    .replace(/\b(kg|kgs|kilos?|k|son|eran|fueron|de|unos|unas|como|mas o menos|aprox|aproximadamente)\b/g, " ")
    .replace(/(\d)\s*k\b/g, "$1")
    .trim();
  if (!t) return null;
  const partes = t.split(/\s+/);
  if (partes.length !== 1) return null;
  const crudo = partes[0];
  if (/^\d+([.,]\d+)?$/.test(crudo)) {
    const n = Number(crudo.replace(",", "."));
    return n > 0 && n < 1000 ? n : null;
  }
  return numeroEnPalabra(crudo);
}

/** El código base (vacuno) de un producto: "nalga_de_cerdo" → "nalga". */
function codigoBase(codigo: string): string {
  return codigo.replace(/_de_cerdo$/, "");
}

/**
 * Los productos que tienen versión vacuna Y de cerdo y cuyo nombre aparece
 * en el texto ("¿Nalga vacuna o de cerdo?" → nalga).
 */
function productosConDosEspecies(texto: string, catalogo: CatalogoCarniceria): string[] {
  const t = normalizar(texto);
  const bases: string[] = [];
  for (const producto of catalogo.productos) {
    if (producto.codigo.endsWith("_de_cerdo")) continue;
    if (!catalogo.porCodigo.has(`${producto.codigo}_de_cerdo`)) continue;
    const nombre = normalizar(producto.alias_display ?? producto.nombre_display);
    if (new RegExp(`\\b${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t)) bases.push(producto.codigo);
  }
  return bases;
}

function nombreDe(codigo: string | undefined, catalogo: CatalogoCarniceria): string {
  const p: Producto | undefined = codigo ? catalogo.porCodigo.get(codigo) : undefined;
  return (p?.alias_display ?? p?.nombre_display ?? codigo ?? "").toLowerCase();
}

function completo(i: ItemParcial): boolean {
  return Boolean(i.producto_codigo && i.accion && i.cantidad && i.cantidad > 0);
}

/**
 * En una transformación ("hice 10 kg de picada con nalga y costilla"), si ya
 * se sabe cuánto salió y solo falta el peso de UNO de los que se usaron, ese
 * es la diferencia: dijo 7 de nalga → la costilla son 3. No se pregunta lo
 * que se puede calcular (el bot decide, 30/09/2026).
 */
function completarPorDiferencia(items: ItemParcial[]): ItemParcial[] {
  const grupos = new Set(items.map((i) => i.transformacion).filter((t): t is string => Boolean(t)));
  let resultado = items;
  for (const grupo of grupos) {
    const delGrupo = resultado.filter((i) => i.transformacion === grupo);
    const destinos = delGrupo.filter((i) => i.accion === "ingreso");
    const origenes = delGrupo.filter((i) => i.accion === "baja");
    const sinCantidad = origenes.filter((i) => !(i.cantidad && i.cantidad > 0));
    if (destinos.length !== 1 || !destinos[0].cantidad || sinCantidad.length !== 1 || !sinCantidad[0].producto_codigo) continue;
    const usado = origenes.reduce((a, i) => a + (i.cantidad ?? 0), 0);
    const resto = Math.round((destinos[0].cantidad - usado) * 1000) / 1000;
    if (resto <= 0) continue;
    resultado = resultado.map((i) => (i === sinCantidad[0] ? { ...i, cantidad: resto } : i));
  }
  return resultado;
}

/** Con los items ya completados: la operación, o la próxima pregunta. */
function siguientePaso(entrada: ItemParcial[], catalogo: CatalogoCarniceria): ResultadoInterpretacion | null {
  const items = completarPorDiferencia(entrada);
  if (items.some((i) => !i.accion)) return null; // sin saber si sube o baja, que decida la IA
  const falta = items.find((i) => !completo(i));
  if (!falta) {
    return {
      tipo: "operacion",
      items: items.map(
        (i): ItemOperacion => ({
          producto_codigo: i.producto_codigo!,
          accion: i.accion!,
          cantidad: i.cantidad!,
          unidad: i.unidad ?? catalogo.porCodigo.get(i.producto_codigo!)?.unidad ?? "kg",
          confidence: 1,
          ...(i.transformacion ? { transformacion: i.transformacion } : {}),
        })
      ),
    };
  }
  if (!falta.producto_codigo) return null; // falta el producto: eso lo pregunta la IA
  const producto = catalogo.porCodigo.get(falta.producto_codigo);
  const unidad = producto?.unidad === "kg" || !producto ? "kilos" : `${producto.unidad}s`;
  // En una transformación con dos orígenes, con uno alcanza: el otro sale por
  // diferencia (completarPorDiferencia). Se lo dice, así no espera otra pregunta.
  const otro =
    falta.accion === "baja" && falta.transformacion
      ? items.find((i) => i !== falta && i.transformacion === falta.transformacion && i.accion === "baja" && !i.cantidad)
      : undefined;
  const pregunta = otro?.producto_codigo
    ? `¿Cuántos ${unidad} de ${nombreDe(falta.producto_codigo, catalogo)} usaste? El resto lo pongo de ${nombreDe(otro.producto_codigo, catalogo)}.`
    : falta.accion === "baja" && falta.transformacion
      ? `¿Cuántos ${unidad} de ${nombreDe(falta.producto_codigo, catalogo)} usaste?`
      : `¿Cuántos ${unidad} de ${nombreDe(falta.producto_codigo, catalogo)}?`;
  return { tipo: "info_faltante", pregunta, itemsParciales: items };
}

/** Pone la especie elegida en el item de ese producto (o en el que no tenía producto). */
function aplicarEspecie(
  items: ItemParcial[],
  base: string,
  especie: Especie,
  catalogo: CatalogoCarniceria
): ItemParcial[] | null {
  const elegido = especie === "vacuno" ? base : `${base}_de_cerdo`;
  if (!catalogo.porCodigo.has(elegido)) return null;
  const copia = items.map((i) => ({ ...i }));
  const conEseProducto = copia.find((i) => i.producto_codigo && codigoBase(i.producto_codigo) === base);
  if (conEseProducto) {
    conEseProducto.producto_codigo = elegido;
    return copia;
  }
  const sinProducto = copia.find((i) => !i.producto_codigo);
  if (sinProducto) {
    sinProducto.producto_codigo = elegido;
    return copia;
  }
  // No estaba en la lista: se suma, copiando la acción y la transformación de
  // un item que las tenga (en "hice picada de nalga y costilla", las dos bajan).
  const modelo = copia.find((i) => i.accion === "baja" && i.transformacion) ?? copia.find((i) => i.accion);
  copia.push({
    producto_codigo: elegido,
    ...(modelo?.accion ? { accion: modelo.accion } : {}),
    ...(modelo?.transformacion ? { transformacion: modelo.transformacion } : {}),
  });
  return copia;
}

/**
 * Si el carnicero contestó con una sola cosa (un animal o un número) a una
 * pregunta que tiene justo ese tipo de respuesta, arma el resultado sin IA.
 * null = no es ese caso; que lo lea la IA como siempre.
 */
export function respuestaCortaDeStock(params: {
  pregunta: string | null | undefined;
  itemsParciales: ItemParcial[] | undefined;
  texto: string;
  catalogo: CatalogoCarniceria;
}): ResultadoInterpretacion | null {
  const { pregunta, texto, catalogo } = params;
  const items = params.itemsParciales ?? [];
  if (!pregunta || items.length === 0) return null;

  // 1. "¿Nalga vacuna o de cerdo?" → "vacuna"
  if (preguntaDeEspecie(pregunta)) {
    const especie = especieDeRespuesta(texto);
    if (!especie) return null;
    const bases = productosConDosEspecies(`${pregunta} ${texto}`, catalogo);
    if (bases.length !== 1) return null;
    const nuevos = aplicarEspecie(items, bases[0], especie, catalogo);
    return nuevos ? siguientePaso(nuevos, catalogo) : null;
  }

  // 2. "¿Cuántos kilos de nalga?" → "7"
  if (/\bcu[aá]nt[oa]s?\b/i.test(pregunta)) {
    const numero = numeroDeRespuesta(texto);
    if (numero === null) return null;
    // A qué item le falta: el que nombra la pregunta; si no, el único sin cantidad.
    const sinCantidad = items.filter((i) => i.producto_codigo && !(i.cantidad && i.cantidad > 0));
    const p = normalizar(pregunta);
    const nombrado = sinCantidad.find((i) => p.includes(nombreDe(i.producto_codigo, catalogo)));
    const objetivo = nombrado ?? (sinCantidad.length === 1 ? sinCantidad[0] : undefined);
    if (!objetivo) return null;
    const nuevos = items.map((i) => (i === objetivo ? { ...i, cantidad: numero } : i));
    return siguientePaso(nuevos, catalogo);
  }

  return null;
}

/**
 * La IA preguntó "¿vacuna o de cerdo?" pero en la charla nadie habló de
 * cerdo: se resuelve sola a vacuno. "Nalga" es nalga vacuna; la picada es
 * siempre de carne vacuna (regla del fundador, 30/09). null = no aplica.
 */
export function resolverEspecieSola(params: {
  pregunta: string;
  itemsParciales: ItemParcial[] | undefined;
  textoDeLaCharla: string;
  catalogo: CatalogoCarniceria;
}): ResultadoInterpretacion | null {
  const { pregunta, textoDeLaCharla, catalogo } = params;
  if (!preguntaDeEspecie(pregunta)) return null;
  if (/\b(cerdos?|chanchos?|porcin[oa]s?|capon|lechon)\b/.test(normalizar(textoDeLaCharla))) return null;
  const items = params.itemsParciales ?? [];
  const bases = productosConDosEspecies(pregunta, catalogo);
  if (bases.length !== 1 || items.length === 0) return null;
  const nuevos = aplicarEspecie(items, bases[0], "vacuno", catalogo);
  return nuevos ? siguientePaso(nuevos, catalogo) : null;
}
