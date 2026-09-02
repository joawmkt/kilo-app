// Formatos de número de teléfono — el punto donde Twilio y Meta no se ponen
// de acuerdo, y donde se rompen las cosas si no hay un único formato canónico.
//
// FORMATO CANÓNICO INTERNO: "whatsapp:+549XXXXXXXXXX"
//
// Es el que ya usa toda la base de datos desde la Etapa 1 (`clientes.telefono`,
// `numeros_carnicero.telefono`, `pedidos.telefono`, `mensajes_whatsapp`) porque
// es el que manda Twilio. Se mantiene tal cual al migrar a Meta: cambiarlo
// obligaría a migrar datos existentes y a tocar todo el código del bot, sin
// ganar nada. La conversión pasa solo en el borde, al hablar con la API.
//
// Meta usa "wa_id": los mismos dígitos, sin "+" ni prefijo "whatsapp:".

const PREFIJO = "whatsapp:";

/** Deja solo los dígitos: "whatsapp:+5491122334455" -> "5491122334455". */
export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

// ============================================================
// El "9" argentino
// ============================================================
// Los celulares argentinos se marcan internacionalmente como +54 9 XX XXXX-XXXX,
// pero WhatsApp históricamente identifica a los usuarios argentinos SIN ese 9
// (wa_id "5411XXXXXXXX" en vez de "54911XXXXXXXX"). O sea: el mismo teléfono
// puede llegar escrito de dos formas distintas según de dónde venga el dato, y
// si no se normaliza, el mismo cliente termina duplicado en `clientes` y el bot
// pierde el hilo de su propio pedido.
//
// Heurística: un número argentino de celular tiene 13 dígitos con el 9
// (54 + 9 + 10) y 12 sin él (54 + 10). Si vienen 12 y el tercer dígito no es
// un 9, se lo agregamos.
function normalizarArgentina(digitos: string): string {
  if (!digitos.startsWith("54")) return digitos;
  if (digitos.startsWith("549")) return digitos;
  if (digitos.length === 12) return `549${digitos.slice(2)}`;
  return digitos;
}

/**
 * Formato canónico interno: "whatsapp:+549XXXXXXXXXX".
 * Acepta cualquiera de las formas que llegan de Twilio, de Meta, o cargadas a
 * mano en el panel.
 */
export function aFormatoCanonico(valor: string): string {
  const digitos = normalizarArgentina(soloDigitos(valor));
  return `${PREFIJO}+${digitos}`;
}

/** "whatsapp:+5491122334455" -> "+5491122334455" */
export function aE164(valor: string): string {
  return `+${normalizarArgentina(soloDigitos(valor))}`;
}

/** El identificador que espera la Cloud API de Meta: dígitos pelados. */
export function aWaId(valor: string): string {
  return normalizarArgentina(soloDigitos(valor));
}

/** ¿Son el mismo teléfono, más allá de cómo estén escritos? */
export function mismoTelefono(a: string, b: string): boolean {
  return aWaId(a) === aWaId(b);
}

/**
 * Para mostrar en el panel. No pretende ser un formateador internacional
 * completo: acomoda los números argentinos, que son el 100% del piloto, y
 * deja el resto en E.164, que siempre es legible.
 */
export function formatearTelefono(valor: string): string {
  const digitos = normalizarArgentina(soloDigitos(valor));

  if (digitos.startsWith("549") && digitos.length === 13) {
    const resto = digitos.slice(3); // 10 dígitos: área + abonado
    // Las áreas argentinas tienen 2, 3 o 4 dígitos. Se usa 2 para Buenos Aires
    // (11) y 3 para el resto, que cubre bien las ciudades donde va a correr
    // esto sin inventar un padrón completo de códigos de área.
    const largoArea = resto.startsWith("11") ? 2 : 3;
    const area = resto.slice(0, largoArea);
    const abonado = resto.slice(largoArea);
    const mitad = Math.ceil(abonado.length / 2);
    return `+54 9 ${area} ${abonado.slice(0, mitad)}-${abonado.slice(mitad)}`;
  }

  return `+${digitos}`;
}
