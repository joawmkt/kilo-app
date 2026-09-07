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

---

# Etapa 4 — Panel del carnicero y migración a la API de Meta

## Qué hay ahora

Un panel web en `/panel` donde el carnicero administra su negocio, y el
reemplazo de Twilio por la **WhatsApp Cloud API de Meta** como intermediario.

Las dos cosas conviven con lo que ya existía: el bot sigue funcionando igual, y
Twilio sigue andando para las carnicerías que todavía no migraron.

## Migración a Meta

### Cómo conviven los dos proveedores

`carnicerias.whatsapp_proveedor` decide, **por carnicería**, si va por `twilio` o
por `meta`. Así el corte se hace de a una y no como un apagón global: la
carnicería piloto puede seguir sobre Twilio mientras se completan los trámites
de Meta (verificación de negocio, revisión de la app, registro como Tech
Provider).

| | Twilio | Meta |
|---|---|---|
| Webhook | `/api/webhook/whatsapp` | `/api/webhook/meta` |
| Validación | firma de Twilio | HMAC-SHA256 del cuerpo crudo con el App Secret |
| Alta del webhook | pegar la URL | además, un GET con `hub.challenge` |
| Cómo se contesta | TwiML en la misma respuesta | una llamada aparte a la API |
| Audios | una URL descargable | un media ID → pedir URL → bajar (3 pasos) |
| Identificador del número | el número telefónico | el **Phone Number ID** |

La decisión de **qué hacer** con cada mensaje entrante no está duplicada: vive en
`src/lib/whatsapp/entrante.ts`, que usan los dos webhooks. Así los dos caminos no
se van separando con el tiempo.

### Estructura de `src/lib/whatsapp/`

| Archivo | Qué resuelve |
|---|---|
| `index.ts` | `enviarWhatsapp()` — punto único de salida, elige proveedor y deja el mensaje registrado |
| `meta.ts` | Cliente de la Cloud API: envío, plantillas, media, firma del webhook |
| `twilio.ts` | El proveedor viejo, ahora detrás de la misma interfaz |
| `entrante.ts` | Enrutamiento de un mensaje entrante, común a los dos |
| `conversaciones.ts` | Agrupa `mensajes_whatsapp` en hilos y lleva la ventana de 24 h |
| `telefonos.ts` | Formato canónico y el problema del "9" argentino |
| `tipos.ts` | Tipos compartidos |

### Tres cosas que rompen en producción si se ignoran

1. **El Phone Number ID no es el número telefónico.** Las llamadas a la API usan
   el ID. Un ID viejo apuntado en `carnicerias.whatsapp_phone_number_id` es la
   causa más común de "dejó de andar sin que nadie lo tocara".
2. **La ventana de 24 horas.** Fuera de ella solo se puede mandar una plantilla
   aprobada; un texto libre falla en el envío. `enviarWhatsapp` lo chequea antes
   y acepta una `plantillaDeRespaldo` — así el recordatorio de retiro de un
   pedido de ayer sale igual. El panel deshabilita el campo de escribir cuando la
   ventana está cerrada, en vez de dejar mandar algo que va a fallar.
3. **El token permanente.** El que ofrece la consola de desarrolladores vence en
   horas. Hace falta uno de System User.

### Coexistencia

Los mensajes que el carnicero manda **desde su celular** llegan al webhook como
`message_echoes`. Se guardan (si no, el hilo del panel tendría agujeros) pero
**nunca se contestan**: del otro lado ya contestó una persona.

La otra cara: la sincronización se corta si nadie abre la app de WhatsApp en el
celular al menos una vez cada 14 días. Cada evento del webhook actualiza
`carnicerias.whatsapp_ultima_actividad_at`, y el panel avisa a los 11 días —
antes de que se corte, no después. Es la falla más probable en producción y la
más silenciosa.

## El panel

Ocho módulos bajo `/panel`, con login de Supabase Auth (una cuenta por
carnicería).

| Ruta | Qué hace |
|---|---|
| `/panel` | Inicio: pedidos a aprobar, pedidos de hoy por hora, stock que falta, resumen |
| `/panel/pedidos` | Historial filtrable + detalle con acciones |
| `/panel/stock` | Catálogo con búsqueda, filtros y edición in situ de stock y precio |
| `/panel/mensajes` | Conversaciones y envío desde la computadora |
| `/panel/clientes` | Agenda con historial y ausencias |
| `/panel/caja` | Ingresos por pedidos de WhatsApp (gestión interna, **sin valor fiscal**) |
| `/panel/metricas` | Pedidos por día, cortes más pedidos, horarios, ausencias |
| `/panel/configuracion` | Datos del negocio, horarios con dos turnos, días especiales, estado de WhatsApp |
| `/panel/plantillas` | Plantillas del sistema con su estado de aprobación |
| `/panel/avisos` | La campanita |
| `/panel/vista-previa` | **Ruta de desarrollo**: el sistema de diseño con datos inventados, para revisar sin base de datos. Borrable. |

### Seguridad

- **Lecturas** con la clave anónima + la sesión del usuario, o sea con Row Level
  Security puesto: aunque una consulta se olvide de filtrar por carnicería, la
  base no devuelve filas de otra.
- **Escrituras** con la service_role, siempre después de `requerirSesion()`, que
  resuelve la carnicería del usuario leyendo `carnicerias` con RLS. Una Server
  Action es un endpoint POST alcanzable desde afuera: si no se verifica ahí, no
  se verifica en ningún lado.
- La service_role **nunca** llega al navegador: el panel se renderiza en el
  servidor.
- `src/proxy.ts` (lo que antes se llamaba middleware) refresca la sesión y manda
  al login. Es una comodidad, no la seguridad del sistema.

### Aprobar un pedido: una sola implementación

El carnicero puede aprobar desde WhatsApp (contestando "aprobar") o desde el
panel. Las dos vías llaman a `aprobarPedido()` / `rechazarPedido()` en
`flujoPedidos.ts`: mismo cambio de estado, mismo descuento de stock, mismo aviso
al cliente. El `.eq("estado", "pendiente_aprobacion")` del UPDATE es lo que evita
que un pedido se apruebe dos veces si toca el botón justo cuando ya contestó por
WhatsApp.

## Decisiones tomadas en esta etapa (30/08/2026)

| Tema | Decisión |
|---|---|
| Proveedor de WhatsApp | Directo a Meta; Carnicom se hace Tech Provider |
| Mensajería en el panel | Historial completo **más** envío desde la computadora |
| Precio | El bot lo dice como estimativo, aclarando que el total se define al pesar |
| Horarios | Híbrido: el bot toma el pedido fuera de hora pero avisa y ofrece los horarios |
| Plantillas de Meta | Centralizadas: las mantiene la plataforma, el panel solo las muestra |

### Lo que sigue abierto

- **Ventas del mostrador.** No están registradas en ningún lado. Por eso la caja
  dice "Pedidos por WhatsApp" y nunca "ventas totales", y aclara en pantalla qué
  no incluye. Cuando se decida cómo registrarlas, el único lugar a tocar es
  `obtenerIngresos()` en `src/lib/panel/caja.ts`.
- **Plantillas por carnicería.** Si se habilita, hace falta validar la categoría
  antes de mandarla a aprobar: una plantilla promocional enviada como "utility"
  la recategoriza Meta como marketing y cuesta cinco veces más.
- **El nombre de la marca.** El token `{{MARCA}}` sigue sin resolver, y vive en
  un solo archivo: `src/lib/panel/marca.tsx`. Completarlo es editar esa constante.

## Sistema de diseño

Tokens de color en `src/app/globals.css`, para modo claro y oscuro. Ningún
componente escribe un color a mano.

La regla que más importa: **el borgoña de marca es para navegación y acciones
principales; el bermellón de alerta es solo para problemas.** Son hues distintos
a propósito.

Los colores de gráfico (`--grafico-1`, `--grafico-2`) son tokens propios y no
`--brand` / `--accent`: el borgoña de marca queda por debajo de la banda de
luminosidad que necesita una marca de gráfico, y en modo oscuro el rosa y el
cobre del sistema quedan a ΔE 11.8 en visión normal — dos series pintadas así
son indistinguibles incluso para alguien sin daltonismo. Los pasos que se usan
pasan las seis verificaciones (banda de luminosidad, piso de croma, separación
para daltonismo, piso de visión normal y contraste).

Las tres tipografías (Archivo, Public Sans, IBM Plex Mono) se sirven desde
paquetes de Fontsource y no desde `next/font/google`: este último las descarga
**de Google en cada build**, y si esa llamada falla el build entero se cae.
Fontsource trae los `.woff2` dentro del paquete de npm.

## Para levantarlo

```bash
npm install          # trae @supabase/ssr y los tres paquetes de fuentes
npm run dev
```

Correr en Supabase la migración `supabase/migrations/0013_panel_carnicero.sql`, y
cargar en Vercel las variables nuevas de `.env.local.example`.

Para crear la primera cuenta: dar de alta el usuario en Supabase Auth y enlazarlo
con `update carnicerias set owner_user_id = '<uuid del usuario>' where id = '<uuid de la carnicería>';`.
Sin ese enlace el panel muestra la pantalla "tu cuenta todavía no tiene
carnicería" en vez de romperse.


---

# Etapa 4b — Un solo repositorio: sitio, panel y alta (05/09/2026)

## Qué cambió

El sitio institucional de **Ainnova** y el panel de **KILO** viven ahora en el
mismo proyecto. Antes eran dos repos (`ainnova-sitio` y `carnicom-app`), que es
lo que recomendaba `docs/integracion-con-la-app.md` para arrancar rápido; ahora
se hizo la Opción B de ese documento, que era el destino.

**Se fusionó ANTES de iniciar el trámite de Meta a propósito.** Las URLs de las
tres páginas legales se cargan en la ficha de la app; si se hubiera fusionado
después, habría que actualizarlas en Meta. Ahora ya están en su lugar
definitivo.

### Cómo quedó dividido

```
src/app/(sitio)/     → /, /servicios, /kilo, /conectar y las tres legales
src/app/panel/       → el panel del carnicero y el de administración
src/app/api/         → webhooks y cron
```

Los paréntesis de `(sitio)` hacen que el grupo no aparezca en la URL: las
direcciones son exactamente las mismas que antes.

### Dos identidades en un mismo `globals.css`

| | Sitio | Panel |
|---|---|---|
| Marca | Ainnova (la empresa) | KILO (el producto) |
| Paleta | navy, ámbar, crema | borgoña, cobre, blancos cálidos |
| Tipografías | Sora, Inter | Archivo, Public Sans, IBM Plex Mono |
| Modo oscuro | no, solo claro | sí, sigue al sistema o forzado |

No se pisan porque cada bloque de reglas está acotado a su subárbol: `.sitio`
envuelve al sitio y `.panel` al panel. En particular, `color-scheme: dark` se
declara en `.panel` y no en `:root` — si estuviera arriba, los controles de
formulario del sitio se pondrían oscuros cuando el sistema del visitante está en
oscuro. Y el panel usa `--font-panel` en vez de apropiarse de `--font-sans`, que
el sitio hereda.

## Modo simulado — trabajar sin Meta

Tercer proveedor, además de `twilio` y `meta`: `simulado`. No sale nada a
internet, pero **todo lo demás es real** — se consulta el stock de verdad, el
pedido queda en la base, y aprobarlo descuenta el stock.

`/panel/simulador` es una pantalla de chat donde se escribe **como si fueras un
cliente**. Llama a `procesarMensajeEntrante`, exactamente la misma función que
usan los dos webhooks reales: no hay un camino paralelo que pueda divergir.

Aparece solo si la carnicería está en modo simulado, y desaparece sola el día que
se conecta de verdad.

**Lo que el simulador no prueba,** y conviene tenerlo presente: que el webhook de
Meta esté bien configurado, la firma del webhook, los audios (no hay archivo que
descargar) y las plantillas, que acá se dan por aprobadas.

## `/conectar` — el alta, construida y apagada

La ruta que estaba reservada desde el sitio ahora existe:

- `/conectar` — pública, explica el flujo y sus cuatro decisiones irreversibles.
- `/panel/conectar` — el flujo real, detrás del login, con el chequeo previo de
  elegibilidad de la Etapa D listado antes del botón.

**Está apagada a propósito.** Sin `META_APP_ID` y `META_CONFIG_ID` la pantalla
muestra qué falta en vez de un botón que no hace nada. Cuando esas variables
existan, se enciende sola.

El canje del código está en `src/lib/whatsapp/alta.ts` y es el punto más frágil
de toda la integración: el código de un solo uso **vive unos 30 segundos** y se
canjea del lado del servidor, en el mismo request. El navegador solo lo
transporta.

Y la suscripción de webhooks es parte de la misma función, no un paso aparte: si
no se suscribe, el alta figura exitosa y **los mensajes de esa carnicería no
llegan nunca**. Es el fallo más silencioso del proceso de Meta. Si esa parte
falla, se puede reintentar sola desde el panel de administración, sin volver al
mostrador con el carnicero.

## Panel de administración

`/panel/admin`, solo para quien esté en la tabla `administradores`.

Row Level Security protege al panel del carnicero, pero no a este: acá se ven
**todas** las carnicerías, así que la autorización es explícita (`requerirAdmin`).
Un carnicero que escriba la URL a mano vuelve a su panel.

Muestra:

- **Qué falta para estar en producción**, chequeado contra el estado real —
  variables cargadas, plantillas aprobadas, webhooks suscritos — y no contra una
  lista escrita a mano que se desactualiza sola. Lo marcado como *trámite* no
  depende de programar.
- **Todas las carnicerías** con su proveedor, estado de alta y uso del mes.
- Una alerta fuerte para la carnicería que tiene token pero no webhooks, con el
  botón para reintentar.

## Conteo de uso

Tabla `uso_mensual` y función `sumar_uso` (migración 0014). Es el punto F3 del
plan de producción: *"instrumentar el conteo desde el primer día; sin eso el
precio del tier es una adivinanza"*. Los mensajes se podrían derivar de
`mensajes_whatsapp`, pero los audios transcriptos y las interpretaciones no
quedaban registrados en ningún lado — y son los otros dos costos variables.

La suma la hace Postgres en una sentencia atómica: dos mensajes simultáneos no se
pisan el contador.

## Para levantarlo

```bash
npm install     # @fontsource/sora e inter, además de lo de la etapa anterior
npm run dev
```

1. Correr `supabase/migrations/0014_modo_simulado_y_alta.sql`.
2. Poner la carnicería piloto en modo simulado:
   `update carnicerias set whatsapp_proveedor = 'simulado';`
3. Darse de alta como administrador:
   `insert into administradores (user_id, email) values ('<uuid>', 'consultas@ainnova.com.ar');`
4. Entrar a `/panel/simulador` y probar el bot de punta a punta.

## Sobre el dominio

El sitio estaba desplegado como proyecto aparte. Al fusionarse, **hay que
apuntar `ainnova.com.ar` a este proyecto** en Vercel y dar de baja el otro, o el
dominio va a seguir sirviendo la versión vieja sin el panel ni `/conectar`.
