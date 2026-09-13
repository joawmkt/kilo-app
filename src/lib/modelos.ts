// ============================================================
// Qué modelo usa cada intérprete
// ============================================================
//
// Los tres intérpretes del bot usaban la misma constante, así que probar otro
// modelo en uno solo obligaba a tocar código y desplegar. Ahora cada uno se
// puede cambiar por variable de entorno, sin tocar nada:
//
//   CLAUDE_MODEL_PEDIDOS     -> entender al cliente que pide
//   CLAUDE_MODEL_STOCK       -> entender al carnicero cargando mercadería
//   CLAUDE_MODEL_MEDIA_RES   -> sacar el peso de una media res
//   CLAUDE_MODEL_HAIKU       -> el que vale para todos si no hay uno específico
//
// Por qué existe esto: para que la pregunta "¿conviene un modelo más grande?" se
// conteste MIDIENDO, no discutiendo. Se cambia una variable en Vercel, se prueba
// una semana, se compara. Si no mejora, se vuelve atrás igual de rápido.
//
// ------------------------------------------------------------
// Antes de cambiar un modelo, leé esto
// ------------------------------------------------------------
//
// Los tres intérpretes NO escriben texto libre: llenan un formulario con
// `tool_choice` forzado y un esquema cerrado. En esa tarea —extracción
// estructurada, con el catálogo entero en el prompt— la diferencia entre un
// modelo chico y uno grande es mucho menor que en conversación abierta.
//
// Hasta hoy (13/09/2026), TODAS las fallas que parecían "el modelo es malo"
// resultaron ser problemas de arquitectura:
//
//   - El cliente enrutado al flujo de stock: dos lugares decidían el rol.
//   - "No relacioné esto con una actualización de stock": el flujo de media res
//     no estaba desplegado.
//   - "¿De cuál corte es la media res?": había una operación vieja pendiente y
//     al modelo se le dijo que el mensaje era una respuesta a ESA pregunta.
//
// En los tres casos el modelo hizo bien lo que se le pidió. El pedido estaba mal.
// Cambiar de modelo no habría arreglado ninguno, y habría costado más.
//
// La regla práctica: antes de subir de modelo, mirar qué se le mandó en el
// prompt. Si el contexto estaba mal, el modelo más caro se equivoca igual.

const DEFECTO = "claude-haiku-4-5-20251001";

function elegir(especifico: string | undefined): string {
  return especifico || process.env.CLAUDE_MODEL_HAIKU || DEFECTO;
}

/** Interpretar el mensaje de un CLIENTE que hace un pedido. */
export function modeloPedidos(): string {
  return elegir(process.env.CLAUDE_MODEL_PEDIDOS);
}

/** Interpretar al CARNICERO cargando o corrigiendo stock. */
export function modeloStock(): string {
  return elegir(process.env.CLAUDE_MODEL_STOCK);
}

/** Sacar el peso de una media res. */
export function modeloMediaRes(): string {
  return elegir(process.env.CLAUDE_MODEL_MEDIA_RES);
}
