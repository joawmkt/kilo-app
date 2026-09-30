// ============================================================
// No repetirse — regla general del bot (13/09/2026)
// ============================================================
//
// Un bot que manda dos veces el MISMO texto le dice al cliente "no te
// entendí y tampoco voy a cambiar de estrategia". Aburre y frustra, y es
// justo cuando la gente abandona la conversación.
//
// `variarSiSeRepite` es la red de seguridad general: se aplica a CUALQUIER
// pregunta, venga de donde venga (de la IA o del código), justo antes de
// mandarla. Si es idéntica a la anterior, le cambia la entrada.
//
// No reemplaza a las escaleras específicas (`preguntaPorLaHora`,
// `armarPreguntaPersonas`), que además de cambiar el tono cambian lo que se
// pide. Es lo que atrapa los casos que esas escaleras no previeron.
//
// Lo usan los dos lados: el cliente (flujoPedidos) y el carnicero (flujoStock,
// flujoLotes). Vive acá, en un archivo sin dependencias, para que haya una sola
// versión.
const ENTRADAS_REFORMULACION = [
  "Perdón, no te agarré bien 🙈 ",
  "Uy, se me pasó. ",
  "Disculpá, me perdí. ",
];

/**
 * Devuelve la pregunta con una entrada distinta si es idéntica a la anterior.
 *
 * La comparación saca primero cualquier entrada que hayamos agregado nosotros,
 * para que el texto que guardamos como "pregunta pendiente" no impida
 * detectar la repetición en el turno siguiente.
 */
export function variarSiSeRepite(pregunta: string, preguntaPrevia: string | null | undefined): string {
  if (!preguntaPrevia) return pregunta;

  const sinEntrada = (t: string) => {
    for (const entrada of ENTRADAS_REFORMULACION) {
      if (t.startsWith(entrada)) return t.slice(entrada.length);
    }
    return t;
  };

  const nueva = sinEntrada(pregunta.trim());
  const previa = sinEntrada(preguntaPrevia.trim());
  if (nueva !== previa) return pregunta;

  // Se elige la entrada según cuál se usó la vez pasada, así dos repeticiones
  // seguidas tampoco suenan iguales entre sí.
  const usadaAntes = ENTRADAS_REFORMULACION.findIndex((e) => preguntaPrevia.trim().startsWith(e));
  return ENTRADAS_REFORMULACION[(usadaAntes + 1) % ENTRADAS_REFORMULACION.length] + nueva;
}
