# Carnicom

App/CRM para carnicerías — bot de pedidos por WhatsApp con gestión de stock.

## Etapa 1 — Infraestructura base

Estado actual: proyecto Next.js con ruta de webhook de WhatsApp (Twilio) que
guarda cada mensaje entrante en Supabase. Sin lógica de negocio todavía —
el objetivo de esta etapa es solo que el cableado funcione.

### Setup local

1. `npm install`
2. Copiá `.env.local.example` a `.env.local` y completá con tus credenciales
   reales de Supabase y Twilio.
3. `npm run dev` — corre en http://localhost:3000

### Base de datos

El esquema completo (tablas + Row Level Security) está en
[`supabase/schema.sql`](./supabase/schema.sql). Se corre una sola vez desde
el SQL Editor de tu proyecto de Supabase.

### Webhook de WhatsApp

`POST /api/webhook/whatsapp` — recibe los mensajes entrantes de Twilio,
valida la firma, y los guarda en la tabla `mensajes_whatsapp`. Configurá
esta URL (con tu dominio de Vercel) como "WHEN A MESSAGE COMES IN" en el
sandbox de WhatsApp de Twilio.

### Variables de entorno necesarias

Ver `.env.local.example`. En producción (Vercel) se cargan desde
Project Settings → Environment Variables, nunca committeadas al repo.

## Etapa 2 — Carga de stock por audio

El carnicero graba un audio por WhatsApp ("llegaron 15 kilos de asado") y el
sistema lo transcribe (Whisper), lo interpreta contra el catálogo real de la
carnicería (Claude Haiku), pide confirmación, y recién al confirmar actualiza
`productos.stock_actual`.

### 1. Correr la migración y el seed del catálogo (una sola vez)

En el SQL Editor de Supabase, en este orden:

1. [`supabase/migrations/0002_catalogo_etapa2.sql`](./supabase/migrations/0002_catalogo_etapa2.sql) —
   crea `productos`, `producto_sinonimos`, `terminos_ambiguos` y
   `operaciones_stock` (y da de baja `cortes_stock` de la Etapa 1, que no
   tenía datos reales todavía).
2. [`supabase/seed/catalogo_etapa2.sql`](./supabase/seed/catalogo_etapa2.sql) —
   carga los 117 productos reales del catálogo (con sinónimos y reglas de
   desambiguación) para la carnicería piloto. Es idempotente: se puede correr
   de nuevo sin duplicar filas. Si tu carnicería piloto usa otro número de
   WhatsApp que no sea el sandbox de prueba, actualizá el `telefono_whatsapp`
   al principio del archivo antes de correrlo.

El catálogo fuente (especificación funcional en lenguaje natural) vive en
[`supabase/seed/catalogo_v0.3_fuente.md`](./supabase/seed/catalogo_v0.3_fuente.md)
y la versión ya estructurada en JSON en
[`supabase/seed/catalogo_etapa2_productos.json`](./supabase/seed/catalogo_etapa2_productos.json)
y [`catalogo_etapa2_ambiguos.json`](./supabase/seed/catalogo_etapa2_ambiguos.json) —
son la referencia para agregar o corregir productos más adelante (el catálogo
puede crecer sin tocar la lógica del bot, ver sección 18 del documento fuente).

### 2. Completar las variables de entorno nuevas

`OPENAI_API_KEY` (Whisper) y `ANTHROPIC_API_KEY` (Claude Haiku) — ver
`.env.local.example`. En Vercel: Project Settings → Environment Variables.

### 3. La botonera de confirmación (especificación del 22/08/2026)

El fundador definió un flujo de confirmación explícito para no modificar
stock nunca sin que el carnicero lo confirme:
`INTERPRETAR → VALIDAR → PENDIENTE_CONFIRMACION → CONFIRMAR → EJECUTAR`.

**El sandbox de Twilio no soporta botones interactivos reales de WhatsApp**
(confirmado con la documentación de Twilio) — cada carnicería necesitaría su
propio número de WhatsApp Business verificado por Meta, y esa verificación
puede tardar semanas por carnicería. Decisión tomada con el fundador
(22/08/2026): implementar toda la máquina de estados de la especificación
usando **texto** como canal ("confirmar" / "modificar" / "cancelar", o texto
libre como "no, eran 12 kilos"), dejando los botones reales de WhatsApp
Business como mejora opcional futura, carnicería por carnicería, sin tener
que rehacer esta lógica.

- `src/lib/catalogo.ts` — carga productos activos + sinónimos + términos
  ambiguos de una carnicería desde Supabase, y arma el bloque de texto
  compacto que se le pasa a la IA de interpretación.
- `src/lib/twilioMedia.ts` — descarga el audio desde Twilio (auth básica con
  Account SID + Auth Token).
- `src/lib/whisper.ts` — transcribe el audio a texto (OpenAI Whisper).
- `src/lib/interpretarStock.ts` — le pasa el texto (transcripción, o una
  respuesta del carnicero con el contexto de lo que se venía hablando) al
  catálogo + Claude Haiku, que devuelve: una operación con uno o más items
  (`{producto_codigo, accion, cantidad, unidad, confidence}` por cada
  producto mencionado), una aclaración (término ambiguo), un pedido de dato
  faltante (ej. falta la cantidad), o "no entendido".
- `src/lib/confirmacion.ts` — clasifica una respuesta como
  confirmar/cancelar/modificar por palabra exacta (rápido, sin IA). Todo lo
  demás (incluidas las correcciones tipo "no, eran 12 kilos") se manda a
  `interpretarStock.ts` con el contexto de la operación en curso.
- `src/lib/tiempo.ts` — calcula la medianoche (hora Argentina) que se usa
  como vencimiento (`expires_at`) por defecto de una operación pendiente.
- `src/lib/flujoStock.ts` — orquesta todo: guarda cada operación en
  `operaciones_stock` (con sus `items` en JSON), nunca toca
  `productos.stock_actual` hasta la confirmación, y la confirmación es
  **idempotente** (un evento de "confirmar" duplicado no vuelve a aplicar el
  cambio — validado con una prueba real contra Postgres, ver commits).

### Estados de una operación (`operaciones_stock.estado`)

`pendiente_aclaracion` → `pendiente_confirmacion` → (`confirmar` → `ejecutado`) | (`modificar` → `pendiente_modificacion` → vuelve a `pendiente_confirmacion` con los items corregidos) | (`cancelar` → `cancelado`) | (vence sin responder → `vencido`).

### Límites conocidos de esta primera versión

- La expiración es **perezosa**: se chequea recién cuando alguien vuelve a
  tocar esa operación (no hay un cron corriendo en background que la marque
  apenas vence). En la práctica no cambia la experiencia del carnicero.
- La ejecución de cada item hace lectura + escritura del stock por separado
  (no en una única transacción). Para el volumen de un piloto de una sola
  carnicería dictando por voz no es un problema real; documentado en
  `flujoStock.ts` por si en el futuro hace falta pasar a un update atómico.
