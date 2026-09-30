// ============================================================
// Que el bot DECIDA en vez de preguntar (30/09/2026)
// ============================================================
//
// El fundador, mirando una charla real: "muy repetitivo. El bot debe poder
// tomar decisiones por sí solo, debe poder RESOLVER situaciones".
//
// Los casos, tal cual pasaron:
//   - Bot: "¿Cuánto querés de vacío y costilla?" / Cliente: "más de vacío que
//     de costilla" / Bot: "¿cuántos kg de cada uno? Por ejemplo 4 y 2,75" /
//     Cliente: "sí, eso me parece bien" / Bot: "necesito que me digas
//     exactamente cuántos kilos". → El bot ya tenía los números. Tenía que
//     PROPONERLOS y aceptar el sí. Ver `repartir` y `leerPreferenciaReparto`.
//   - Bot: "¿Cuántos chorizos?" / Cliente: "medio por persona" / Bot: "¿medio
//     kilo por persona de qué?". → Sabía que eran 15. Ver `cantidadPorPersona`.
//   - Cliente: "cambiá el vacío por el matambre" → el bot sacó el vacío y no
//     puso el matambre. Después "lo que era de vacío hacelo matambre" → le
//     preguntó para cuántas personas era. → Ver `leerReemplazo`: el matambre
//     va con la cantidad que tenía el vacío.
//
// Todo esto es texto y cuentas: no necesita IA (Patrón 3 del manual). Este
// archivo no importa nada; recibe lo que necesita y se puede probar solo.

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------
// "Medio chorizo por persona" → 15 personas × 0,5 = 8 chorizos
// ------------------------------------------------------------

const FACTOR: Record<string, number> = { medio: 0.5, media: 0.5, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuarto: 0.25 };

/**
 * "medio por persona", "medio chorizo por persona", "un chorizo por cabeza",
 * "300 gramos por persona", "dos por persona" → cantidad total, sabiendo
 * cuántos son. `unidad` dice si habló de kilos/gramos ("kg") o de unidades
 * (null = no lo dijo: se usa la del producto).
 */
export function cantidadPorPersona(texto: string, total: number | null): { cantidad: number; unidad: "kg" | null } | null {
  if (!total || total <= 0) return null;
  const t = normalizar(texto);
  const m =
    /\b(medio|media|un cuarto|un|uno|una|dos|tres|\d+(?:[.,]\d+)?)\s*(kilos?|kg|k|gramos|gr|g|chorizos?|morcillas?|unidades?|porcion(?:es)?|pedazos?)?\s*(?:de\s+\w+\s*)?(?:por|x|cada)\s+(?:persona|cabeza|uno|invitado|comensal|pibe|cristiano)s?\b/.exec(
      t
    );
  if (!m) return null;
  const crudo = m[1] === "un cuarto" ? "cuarto" : m[1];
  const factor = FACTOR[crudo] ?? Number(crudo.replace(",", "."));
  if (!Number.isFinite(factor) || factor <= 0) return null;
  const palabra = m[2] ?? "";
  if (/^(gramos|gr|g)$/.test(palabra)) return { cantidad: Math.round(((factor * total) / 1000) * 100) / 100, unidad: "kg" };
  if (/^(kilos?|kg|k)$/.test(palabra)) return { cantidad: Math.round(factor * total * 100) / 100, unidad: "kg" };
  // "300 por persona" sin unidad: con un número grande son gramos.
  if (!palabra && factor >= 50) return { cantidad: Math.round(((factor * total) / 1000) * 100) / 100, unidad: "kg" };
  return { cantidad: factor * total, unidad: null };
}

/**
 * Las unidades se venden enteras: 7,5 chorizos son 8. Siempre para arriba:
 * mejor que sobre medio chorizo a que falte (bug del 30/09: "Chorizo: 7,5
 * unidades").
 */
export function redondearUnidades(cantidad: number): number {
  return Math.ceil(cantidad - 1e-9);
}

// ------------------------------------------------------------
// Repartir los kilos de asado entre los cortes que eligió
// ------------------------------------------------------------

/** `kg` es la cantidad: kilos, o unidades si `unidad` es "unidad" (chorizos). */
export type Reparto = { codigo: string; kg: number; unidad?: "unidad" }[];

function redondearCuarto(kg: number): number {
  return Math.round(kg * 4) / 4;
}

/**
 * Reparte `kgTotal` entre los cortes. Parejo, salvo que prefiera más (o menos)
 * de uno: ese se lleva una parte y media (o la mitad). Redondeado a 250 g,
 * que es como se corta en el mostrador, y ninguno queda en menos de medio kilo.
 */
export function repartir(kgTotal: number, codigos: string[], preferido?: { codigo: string; mas: boolean }): Reparto {
  if (codigos.length === 0 || !(kgTotal > 0)) return [];
  const pesos = codigos.map((c) => (preferido && c === preferido.codigo ? (preferido.mas ? 1.5 : 0.5) : 1));
  const suma = pesos.reduce((a, b) => a + b, 0);
  const reparto = codigos.map((codigo, i) => ({ codigo, kg: Math.max(0.5, redondearCuarto((kgTotal * pesos[i]) / suma)) }));
  // Que la suma cierre con el total (redondeado): la diferencia va al más grande.
  const total = redondearCuarto(kgTotal);
  const diferencia = total - reparto.reduce((a, r) => a + r.kg, 0);
  // Si sobra, va al primero que nombró; si falta, se saca del último.
  if (diferencia >= 0.25) reparto[0].kg = redondearCuarto(reparto[0].kg + diferencia);
  if (diferencia <= -0.25) {
    const ultimo = [...reparto].reverse().find((r) => r.kg + diferencia >= 0.5) ?? reparto[reparto.length - 1];
    ultimo.kg = Math.max(0.5, redondearCuarto(ultimo.kg + diferencia));
  }
  return reparto;
}

export type PreferenciaReparto = { tipo: "preferido"; codigo: string; mas: boolean } | { tipo: "parejo" };

/**
 * "más de vacío que de costilla", "más vacío", "poca costilla", "menos de
 * costilla", "mitad y mitad", "parejo", "como vos veas" → cómo quiere el
 * reparto. `productos` son los cortes en juego con las palabras que los
 * nombran.
 */
export function leerPreferenciaReparto(
  texto: string,
  productos: { codigo: string; palabras: string[] }[]
): PreferenciaReparto | null {
  const t = normalizar(texto);
  if (/\b(mitad y mitad|parejo|pareja|igual|lo mismo de (cada|los dos)|como (vos )?(veas|quieras|te parezca)|lo que vos (digas|veas)|elegi vos|decidi vos|vos sabes)\b/.test(t)) {
    return { tipo: "parejo" };
  }
  const aparece = (p: { palabras: string[] }, fragmento: string) =>
    p.palabras.some((w) => new RegExp(`\\b${normalizar(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(fragmento));

  const mas = /\bmas\s+(de\s+|del\s+|de la\s+)?([a-zñ ]+?)(\s+que\b|$|\s+y\b|\s+por\b)/.exec(t);
  if (mas) {
    const elegido = productos.find((p) => aparece(p, mas[2]));
    if (elegido) return { tipo: "preferido", codigo: elegido.codigo, mas: true };
  }
  const menos = /\b(menos|poco|poca|poquito|poquita)\s+(de\s+|del\s+|de la\s+)?([a-zñ ]+?)(\s+que\b|$|\s+y\b)/.exec(t);
  if (menos) {
    const elegido = productos.find((p) => aparece(p, menos[3]));
    if (elegido) return { tipo: "preferido", codigo: elegido.codigo, mas: false };
  }
  return null;
}

// ------------------------------------------------------------
// "Cambiá el vacío por el matambre"
// ------------------------------------------------------------

/** Un producto nombrado en el texto y dónde aparece (posición en el texto normalizado). */
export type ProductoEnTexto = { codigo: string; posicion: number };

const PISTA_REEMPLAZO =
  /\b(cambi\w*|reemplaz\w*|en vez del?|en lugar del?|lo (que era )?de|lo del|la de|hacelo|hacela|hacemelo|ponelo|ponele|poneme|pasalo|pasame|por el|por la|mejor)\b/;

/**
 * ¿Pide cambiar un producto por otro? Devuelve de cuál (`de`, puede ser null
 * si solo nombra el nuevo: "hacelo matambre") a cuál (`a`).
 *
 *   "cambiá el vacío por el matambre"          → de vacío, a matambre
 *   "en vez de vacío poneme matambre"          → de vacío, a matambre
 *   "matambre en lugar del vacío"              → de vacío, a matambre
 *   "lo que era de vacío hacelo matambre"      → de vacío, a matambre
 *   "hacelo matambre" / "dale, matambre"       → de null,  a matambre
 */
export function leerReemplazo(texto: string, productos: ProductoEnTexto[]): { de: string | null; a: string } | null {
  const t = normalizar(texto);
  if (productos.length === 0) return null;
  const ordenados = [...productos].sort((x, y) => x.posicion - y.posicion);
  const distintos = ordenados.filter((p, i) => ordenados.findIndex((q) => q.codigo === p.codigo) === i);

  if (distintos.length >= 2) {
    if (!PISTA_REEMPLAZO.test(t)) return null;
    // "en vez de X" / "en lugar de X": X es el que se va, esté donde esté.
    const enVez = /\ben (vez|lugar) de(l)?\b/.exec(t);
    if (enVez) {
      const despues = distintos.find((p) => p.posicion > enVez.index);
      const otro = distintos.find((p) => p !== despues);
      if (despues && otro) return { de: despues.codigo, a: otro.codigo };
    }
    // "cambiá X por Y", "lo de X hacelo Y": el primero se va.
    return { de: distintos[0].codigo, a: distintos[1].codigo };
  }

  if (distintos.length === 1 && PISTA_REEMPLAZO.test(t)) return { de: null, a: distintos[0].codigo };
  return null;
}
