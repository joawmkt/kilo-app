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

## Etapa 3 — Bot de pedidos asistido

El cliente le escribe por WhatsApp a la carnicería, el bot arma el pedido
contra el stock real (ofreciendo un sustituto si falta algo), pide la hora
de retiro, y recién lo confirma al cliente cuando el carnicero lo aprueba.
Ver el roadmap detallado en `claude/etapa3_roadmap_detallado.md` (Proyecto
Carnicom en Claude) para el paso a paso completo.

> **Los textos que le escribe el bot al cliente y al carnicero son
> PROVISORIOS.** El Bloque A del roadmap de Etapa 3 (tono/redacción
> definitiva, resuelto con otra IA especializada en contenido) todavía no
> está cerrado — reemplazar cuando esté listo, el texto vive todo junto
> arriba de cada mensaje en `src/lib/flujoPedidos.ts`.

### 1. Correr las migraciones nuevas (en este orden)

En el SQL Editor de Supabase:

1. [`supabase/migrations/0007_numeros_carnicero.sql`](./supabase/migrations/0007_numeros_carnicero.sql) —
   crea `numeros_carnicero` (quién es "el carnicero", separado de
   cualquier cliente que le escriba al mismo número). **Antes de correrlo,
   reemplazá el número de teléfono de ejemplo por el real** (ver el
   comentario dentro del archivo) — si te salteás este paso, tus propios
   mensajes de prueba van a caer en el flujo de pedidos, no en el de stock.
2. [`supabase/migrations/0008_pedidos_etapa3.sql`](./supabase/migrations/0008_pedidos_etapa3.sql) —
   alinea `pedidos` con `productos` (Etapa 2) y agrega los estados nuevos.
3. [`supabase/migrations/0009_conversion_kg_unidad.sql`](./supabase/migrations/0009_conversion_kg_unidad.sql) —
   agrega el peso aproximado por unidad de las milanesas (para poder
   convertir "dame 4 milanesas" a kilos y descontar del stock real). Los
   valores están puestos como estimación mía, no confirmados todavía —
   ajustar cuando haya una respuesta real de la carnicería piloto.

### 2. Variables de entorno nuevas

`CRON_SECRET` (protege el endpoint de recordatorios) — ver
`.env.local.example`. En Vercel: Project Settings → Environment Variables.

### 3. Activar el cron de recordatorios (GitHub Actions)

Vercel Cron en el plan gratuito solo permite una ejecución programada por
día, insuficiente para avisar "30 minutos antes" del retiro. Se usa en
cambio un workflow programado de GitHub Actions
([`.github/workflows/recordatorios.yml`](./.github/workflows/recordatorios.yml))
que llama a `/api/cron/recordatorios` cada 10 minutos. Para activarlo,
en el repo de GitHub → Settings → Secrets and variables → Actions, cargar:

- `APP_URL` — la URL del deploy, ej `https://carnicom-app-gules.vercel.app`
- `CRON_SECRET` — el mismo valor que en Vercel

### 4. Cómo funciona

- `src/lib/numerosCarnicero.ts` — quién es "el carnicero" (o uno de sus
  empleados autorizados) para esa carnicería (Paso 0). Cualquier otro
  número que le escriba al mismo WhatsApp entra al flujo de pedidos, nunca
  al de stock.
- `src/lib/interpretarPedido.ts` — mismo patrón que `interpretarStock.ts`
  pero para pedidos: interpreta qué pidió el cliente, si falta un dato, y
  la hora de retiro (calculada con Claude Haiku a partir de la hora actual
  real en Argentina).
- `src/lib/alternativas.ts` — regla de "alternativa más parecida" cuando
  falta stock (v1: mismo `familia`, con stock disponible) — respuesta
  provisoria a una pregunta de negocio todavía sin cerrar.
- `src/lib/clientes.ts` — identifica/crea al cliente por su teléfono; si
  WhatsApp manda su nombre de perfil (`ProfileName`) y todavía no lo
  teníamos guardado, lo usa para saludarlo por nombre la próxima vez.
- `src/lib/confirmacionPedido.ts` — palabras gatillo para que el carnicero
  apruebe/rechace un pedido — **deliberadamente distintas** de las de
  `confirmacion.ts` (stock), para que no haya ambigüedad si tiene una
  operación de stock y un pedido pendientes al mismo tiempo.
- `src/lib/twilioEnviar.ts` — mensajes salientes por la API REST de
  Twilio (hacía falta desde acá: avisarle al carnicero de un pedido nuevo,
  o al cliente de la decisión del carnicero, son mensajes a un número
  DISTINTO del que originó el evento — no alcanza con responder por TwiML).
- `src/lib/flujoPedidos.ts` — orquesta todo el Paso 3 al 6: interpreta,
  arma el pedido contra stock real, pide la hora si falta, avisa al
  carnicero, y al aprobar descuenta stock y confirma al cliente.
- `src/app/api/cron/recordatorios/route.ts` — Paso 7 y 8: manda el
  recordatorio (30 min antes del retiro, por defecto) y marca no-shows
  automáticamente (60 min después de la hora de retiro sin marcar
  `retirado_at`, por defecto) — ver el comentario del archivo para el
  porqué de esta simplificación.

### Estados de un pedido (`pedidos.estado`)

`pendiente_aclaracion` (armando el pedido con el cliente) → `pendiente_aprobacion` (esperando al carnicero) → (`aprobar` → `aprobado`, stock ya descontado y cliente ya avisado) | (`rechazar` → `rechazado`) | (`cancelado`, el cliente se queda sin nada disponible) | (vence sin responder → `vencido`). Desde `aprobado`, el cron lo puede pasar a `no_show` si pasa la hora de retiro + margen sin marcarse como retirado.

### Simplificaciones de esta primera versión (a revisar con uso real)

- **Un pedido pendiente de aprobación por vez, por carnicería**: si el
  carnicero llega a tener dos pedidos esperando aprobación al mismo
  tiempo, "aprobar"/"rechazar" actúa sobre el más reciente. Para el
  volumen de un piloto alcanza; si genera confusión, la solución es incluir
  un código corto de pedido en el aviso y pedir que lo repita al responder.
- **El stock se consulta pero no se reserva** hasta que el carnicero
  aprueba — dos pedidos casi simultáneos por lo último que queda de un
  producto podrían pasar la verificación los dos (ver comentario en
  `flujoPedidos.ts`).
- **No-show automático por tiempo**, no hay forma de confirmar que el
  cliente SÍ retiró (no hay integración con caja) — es una aproximación
  para tener el historial de ausencias funcionando ya, no una decisión de
  negocio cerrada.
- **Sin "modificar" en la aprobación del carnicero** (a diferencia de
  stock): si quiere cambiar algo de un pedido, por ahora lo rechaza y
  habla directo con el cliente fuera del bot.
