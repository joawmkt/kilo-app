<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:kilo-reglas-de-proyecto -->

# KILO — reglas de este proyecto

## Antes de tocar el comportamiento del bot, leé la especificación

`docs/especificacion-bot.md` es la **fuente de verdad funcional** del bot de WhatsApp
(consolidada el 09/09/2026). Define tono, reglas de conversación, estados del pedido,
sustituciones, notificaciones al carnicero y todo el flujo de atención.

Reglas de uso de ese documento:

- Ante una contradicción con cualquier decisión anterior del proyecto, **gana la
  especificación** (ver su sección 55).
- Ante un caso que la especificación no cubra, aplicar sus principios de la sección 56
  (simplicidad, poca fricción, no inventar, preguntar ante duda real).
- Si sigue habiendo ambigüedad de negocio, **no inventar una regla nueva**: preguntársela
  al fundador antes de implementarla.

Las cuatro reglas innegociables, resumidas, porque atraviesan todo el código:

1. **Nunca inventar** — stock, precios, horarios, promociones, medios de pago, dirección,
   sustitutos o datos de un pedido. Si no sabe, pregunta.
2. **Nunca suponer ante ambigüedad** — si hay dos interpretaciones razonables, pregunta.
3. **El carnicero tiene la última palabra**, pero en operación normal **no habla con el
   cliente**: el bot le presenta opciones numeradas, él elige, y el bot sigue conversando.
   Única excepción: caída o error técnico grave.
4. **Todo cambio en un pedido se le notifica al carnicero**, aunque no requiera reaprobación.

## Estado de implementación

`docs/especificacion-bot-estado.md` lleva la cuenta de qué partes de la especificación
ya están implementadas y cuáles no. Actualizalo cuando implementes una.

## Marca

`Ainnova` es la empresa; `KILO` es el producto. El nombre viejo (`Carnicom`) quedó
deprecado: no usarlo en texto nuevo de cara al usuario. Los textos de marca viven en
`src/lib/marca.ts`.

<!-- END:kilo-reglas-de-proyecto -->
