import crypto from "crypto";
import type { ResultadoEnvio } from "./tipos";

// ============================================================
// Proveedor simulado — para trabajar sin Twilio y sin Meta
// ============================================================
//
// No sale nada a internet. El mensaje se da por enviado y se guarda en
// `mensajes_whatsapp` igual que cualquier otro, así que el panel lo muestra en
// el hilo de la conversación como si hubiera salido de verdad.
//
// Para qué sirve: mientras se espera la verificación de negocio de Meta —que
// tarda por trámite, no por trabajo— se puede probar el flujo completo de punta
// a punta: un cliente escribe, el bot arma el pedido consultando el stock real,
// el carnicero lo aprueba desde el panel, se descuenta el stock y el cliente
// recibe la confirmación. Todo con la base de datos real.
//
// Lo que NO prueba, y conviene tener claro:
//   - Que el webhook de Meta esté bien configurado.
//   - La firma del webhook ni la validación de la ventana de 24 horas contra la
//     API real (la ventana sí se simula, porque la lleva la base).
//   - Las plantillas: en simulación se dan por aprobadas y "salen" siempre.
//   - Los audios: no hay archivo que descargar. La simulación es solo de texto;
//     para probar la carga de stock por voz hace falta un proveedor real.
//
// El día que llegue la verificación, se cambia `carnicerias.whatsapp_proveedor`
// de 'simulado' a 'meta' y el mismo código empieza a hablar con Meta. No hay
// nada más que tocar del lado del motor.

/** Prefijo del identificador falso, para poder distinguirlo de un wamid real. */
const PREFIJO_ID = "sim";

export async function enviarTextoSimulado(params: {
  para: string;
  cuerpo: string;
}): Promise<ResultadoEnvio> {
  // Se deja rastro en el log del servidor: cuando se prueba desde el panel es
  // la forma más rápida de ver qué habría salido.
  console.info("[simulado] mensaje saliente", {
    para: params.para,
    cuerpo: params.cuerpo.slice(0, 120),
  });

  return {
    ok: true,
    proveedorMensajeId: `${PREFIJO_ID}:${crypto.randomUUID()}`,
    error: null,
  };
}

export function esMensajeSimulado(proveedorMensajeId: string | null): boolean {
  return Boolean(proveedorMensajeId?.startsWith(`${PREFIJO_ID}:`));
}
