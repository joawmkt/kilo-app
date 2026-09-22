// ============================================================
// Cómo hay que entregarlo
// ============================================================
//
// "Un pollo" no dice cómo entregarlo. Puede ser:
//   - ENTERO, sin abrir: para el horno, relleno, a la parrilla.
//   - TROZADO: la misma ave, cortada en presas, para milanesas o guiso.
//
// LAS DOS CONSUMEN EXACTAMENTE LA MISMA PIEZA DE STOCK (un pollo entero). Por
// eso esto NO es un producto distinto ni un movimiento de stock distinto: es
// una propiedad del PEDIDO. Va en el item, y el carnicero la ve en el ticket.
//
// Y sirve para mucho más que el pollo: "la nalga cortada en milanesas", "el
// asado fino", "la pechuga sin piel".
//
// OJO CON LA TRAMPA QUE ESTO EVITA: trozar un pollo PARA UN PEDIDO no es lo
// mismo que trozar para la vitrina. Lo primero consume una pieza y no crea
// ninguna presa (se van con el cliente); lo segundo cierra piezas y crea otras
// (ver `trozar` en lotes.ts). Si el trozado de un pedido generara presas,
// quedarían en stock ADEMÁS de haberse vendido.

export type Preparacion = "entero" | "trozado";

const PATRONES: { preparacion: Preparacion; patron: RegExp }[] = [
  { preparacion: "trozado", patron: /\b(trozad[oa]s?|trocead[oa]s?|en\s+presas|cortad[oa]\s+en\s+presas|en\s+trozos)\b/ },
  { preparacion: "entero", patron: /\b(enter[oa]s?|sin\s+cortar|sin\s+trozar|para\s+el\s+horno)\b/ },
];

/**
 * ¿El cliente aclaró cómo lo quiere? `null` si no dijo nada.
 *
 * "Trozado" se pregunta PRIMERO a propósito: "pollo entero trozado" existe como
 * pedido (el ave completa, pero cortada) y ahí manda el trozado, porque es lo
 * que cambia el trabajo del carnicero.
 */
export function detectarPreparacion(texto: string): Preparacion | null {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  for (const { preparacion, patron } of PATRONES) {
    if (patron.test(t)) return preparacion;
  }
  return null;
}

/** Cómo se escribe en el ticket del carnicero y en el resumen al cliente. */
export function etiquetaPreparacion(preparacion: string | null | undefined): string {
  if (!preparacion) return "";
  if (preparacion === "entero") return " (entero)";
  if (preparacion === "trozado") return " (trozado)";
  return ` (${preparacion})`;
}
