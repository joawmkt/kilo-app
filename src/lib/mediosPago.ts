// Medios de pago que el carnicero puede habilitar — especificación del bot,
// sección 19.
//
// La lista vive en código y no en la base porque es un vocabulario cerrado y
// compartido por todas las carnicerías: lo que cambia por local es CUÁLES
// están tildados, no cuáles existen. Agregar uno nuevo es agregar una línea
// acá, sin migración.
//
// `etiqueta` es lo que ve el carnicero en el panel; `paraElCliente` es cómo lo
// nombra el bot por WhatsApp. Se separan a propósito: "QR / billetera virtual"
// es claro para quien configura, pero a un cliente le decís "Mercado Pago o
// cualquier billetera con QR".
//
// ⚠️ Sección 19: no se calculan recargos ni descuentos por medio de pago en
// esta etapa, y la sección 13 prohíbe informar precios. El bot dice QUÉ se
// acepta, nunca CUÁNTO sale.

export type MedioPago = {
  codigo: string;
  etiqueta: string;
  paraElCliente: string;
};

export const MEDIOS_PAGO: MedioPago[] = [
  { codigo: "efectivo", etiqueta: "Efectivo", paraElCliente: "efectivo" },
  { codigo: "debito", etiqueta: "Tarjeta de débito", paraElCliente: "débito" },
  { codigo: "credito", etiqueta: "Tarjeta de crédito", paraElCliente: "crédito" },
  { codigo: "transferencia", etiqueta: "Transferencia bancaria", paraElCliente: "transferencia" },
  { codigo: "qr", etiqueta: "QR / billetera virtual", paraElCliente: "Mercado Pago u otra billetera con QR" },
];

const POR_CODIGO = new Map(MEDIOS_PAGO.map((m) => [m.codigo, m]));

export function esCodigoDeMedioPago(codigo: string): boolean {
  return POR_CODIGO.has(codigo);
}

/** Filtra y ordena los códigos guardados según el orden canónico de arriba. */
export function mediosPagoHabilitados(codigos: string[] | null | undefined): MedioPago[] {
  const guardados = new Set(codigos ?? []);
  return MEDIOS_PAGO.filter((m) => guardados.has(m.codigo));
}

/** "efectivo, débito y transferencia" — para meterlo dentro de una frase. */
export function listarParaElCliente(medios: MedioPago[]): string {
  const nombres = medios.map((m) => m.paraElCliente);
  if (nombres.length === 0) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
