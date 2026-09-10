// Los dos números del simulador, en un solo lugar.
//
// Son distintos a propósito: el motor guarda una conversación por teléfono, así
// que compartir número mezclaría el hilo del cliente con el de la carga de
// stock y ninguno de los dos se entendería.
//
// Viven acá y no en la pantalla del simulador porque el SERVIDOR tiene que
// poder decidir con ellos quién es quién sin preguntarle nada al navegador
// (ver `quienEs.ts`). Antes cada acción del simulador recibía el teléfono en un
// campo oculto del formulario, y ese campo fue exactamente por donde se coló el
// bug del 10/09/2026 que hizo que un mensaje del cliente cargara stock.

export const TELEFONO_CLIENTE_SIMULADO = "whatsapp:+5493400000001";
export const TELEFONO_CARNICERO_SIMULADO = "whatsapp:+5493400000002";

/** Para mostrar en pantalla, sin el prefijo del proveedor. */
export function soloElNumero(telefono: string): string {
  return telefono.replace(/^whatsapp:/, "");
}
