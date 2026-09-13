# Estado de implementación de la especificación del bot

> Compañero de `docs/especificacion-bot.md`. Los números entre paréntesis son las secciones
> de esa especificación. **Actualizar este archivo cada vez que se implemente una parte.**
>
> Última revisión contra el código: **10/09/2026**. Las seis tandas del plan están aplicadas.

Leyenda: ✅ hecho · 🟡 parcial · ❌ falta

---

## Resumen

Las seis tandas se aplicaron entre el 08 y el 10/09/2026, con `npm run lint` y `npm run build`
limpios en cada una. Migraciones nuevas: de la `0015` a la `0020`.

| Tanda | Qué trajo | Estado |
|---|---|---|
| 1 | Textos definitivos y pesos por unidad | ✅ |
| 2 | El bot responde consultas (horarios, dirección, pagos, promos, delivery, stock) | ✅ |
| 3 | Ventana de agrupación, confirmación final, avisos de demora y borradores | ✅ |
| 4 | Pedido modificable, cancelable y reprogramable, con versionado e historial | ✅ |
| 5 | Rechazo conversado, "en espera", resumen diario y cierres excepcionales | ✅ |
| 6 | Sustitutos autorizados, stock parcial, complementarios y handoff | ✅ |

---

## Sección por sección

| Sección | Qué pide | Estado |
|---|---|---|
| 1.1 | Atención al público, no solo tomar pedidos | ✅ Tanda 2 — `src/lib/consultas.ts` |
| 1.2 | Tono argentino, natural, cercano | ✅ Textos revisados en las Tandas 1 y 5 |
| 1.3 | Nunca inventar | ✅ Estructural: cada respuesta sale de un dato real o se reconoce que falta |
| 1.4 | Nunca suponer ante ambigüedad | ✅ Términos ambiguos, y se pregunta cuál pedido cuando hay más de uno |
| 1.5 | El contexto manda | ✅ |
| 1.6 / 1.7 | El carnicero decide pero no conversa | ✅ Tanda 5 — opciones numeradas por WhatsApp y por panel |
| 2.1-2.4 | Mensaje inicial y detección de intención | ✅ Tandas 1 y 2 |
| 3.1 | Aviso de demora a los 30 min, una sola vez | ✅ Tanda 3 (cron) |
| 3.2 | Vencimiento a las 4 h | ✅ Tanda 3 |
| 3.3 | No duplicar pedidos mientras hay uno pendiente | ✅ |
| 4.1 / 4.3 | Cliente nuevo vs recurrente | ✅ Tanda 1 |
| 4.2 | Pedir el nombre a las ~2 h | ❌ Único pendiente de la sección 4 |
| 5.1-5.5 | Sustitutos solo dentro de lo autorizado, preguntando el uso | ✅ Tanda 6 — tabla `sustitutos_autorizados` + panel |
| 5.6 | Avisar si el sustituto es más caro | ❌ Depende de que se activen los precios (sección 13) |
| 6 | Pesos aproximados por unidad | ✅ Tanda 1 (migración `0015`) |
| 7.1-7.2 | Hora orientativa y un solo recordatorio 1 h antes | ✅ |
| 7.3-7.6 | Cierre del día, "en espera", no-show recién al día siguiente | ✅ Tanda 5 |
| 8 / 12 / 35 | Modificar un pedido, invalidando la versión anterior | ✅ Tanda 4 |
| 9 | Varios pedidos simultáneos para fechas distintas | ✅ Tanda 4 — se pregunta cuál cuando hay más de uno |
| 10 | Cancelaciones, incluido "sacame todo" | ✅ Tanda 4 — detectado por intención, no por la palabra |
| 11 / 25 / 26 | Cambiar, adelantar o postergar el retiro | ✅ Tanda 4 — adelantar requiere que el carnicero confirme |
| 13 | No informar precios | ✅ Estructural: el precio nunca entra al prompt del bot |
| 14 / 41 | Sin mínimos ni reglas por tamaño | ✅ |
| 15 | Reconocer cuando no sabe algo | ✅ Tanda 2 |
| 16 | Consultar al carnicero, sin entregarle el chat | ✅ Tanda 5 |
| 17 | Promociones solo si están cargadas y vigentes | ✅ Tanda 2 — tabla `promociones` + panel |
| 18 | Horarios, con feriados y cierres | ✅ Tanda 2 |
| 19 | Medios de pago | ✅ Tanda 2 — casillas en el panel |
| 20 | Sin delivery | ✅ Tanda 2 |
| 21 | Dirección | ✅ Tanda 2 |
| 22 | Pedidos anticipados | ✅ Tanda 4 |
| 22.1 | Panel de pedidos futuros | 🟡 Se ven en `/panel/pedidos`, sin una vista propia de agenda |
| 23 | Resumen diario en la apertura | ✅ Tanda 5 |
| 24 | Cierre excepcional con pedidos programados | ✅ Tanda 5 |
| 27 | Historial de eventos del pedido | ✅ Tanda 4 — visible en el detalle del pedido |
| 28 | Un pedido retirado queda cerrado | ✅ |
| 29 / 32 | Ambigüedad y borradores abandonados | ✅ Tanda 3 |
| 30 | Correcciones ("no, 1 kg") | ✅ |
| 31 | Confirmación final obligatoria | ✅ Tanda 3 |
| 33 | Audios parciales | ✅ Y desde la Tanda 3 el audio se agrupa con el texto |
| 34 | Ventana de agrupación | ✅ Tanda 3 — **6 segundos**, no 20 (decisión del fundador, 10/09) |
| 36 / 50 | Rechazo con motivo y opciones numeradas | ✅ Tanda 5 |
| 37 / 38 | Stock agotado y reposición | ✅ |
| 39 | Stock parcial | ✅ Tanda 6 |
| 40 | Una sola recomendación de complementario | ✅ Tanda 6 |
| 42 | Atención 24/7 | 🟡 El bot atiende siempre; falta que proponga horarios válidos al elegir el retiro |
| 43 | Handoff por error técnico | ✅ Tanda 6 — "Atiendo yo" en la conversación, con pausa que se levanta sola |
| 44 | Cliente enojado | ✅ Tanda 6 (instrucción de interpretación) |
| 45 | Cierre natural de la conversación | 🟡 No hay un tipo de intención para "gracias/listo" |
| 46 | Reglas de catálogo | ✅ Ya estaban todas cargadas |
| 47 | Cálculo por personas | ✅ |
| 51 | Estados y versionado | ✅ Tanda 4 |
| 52 | Configuraciones del panel | ✅ Medios de pago, promociones y reemplazos autorizados agregados |
| 53 | Notificar todo cambio al carnicero | ✅ Tandas 4 y 5 |

---

## Lo que quedó pendiente, y por qué

Son cuatro cosas, todas chicas y ninguna bloqueante:

1. **Pedir el nombre a las ~2 horas (4.2).** Hoy el nombre se toma del perfil de WhatsApp cuando
   está disponible. Falta el mensaje que lo pide con naturalidad si no lo tenemos.
2. **Avisar que un sustituto es más caro (5.6).** La propia especificación lo deja preparado para
   cuando se activen los precios, que hoy están desactivados por decisión de la sección 13.
3. **Proponer horarios válidos al pedir el retiro (42).** El bot ya conoce los horarios (se usan
   para el resumen diario y el cierre); falta usarlos para no aceptar una hora en que el local
   está cerrado.
4. **Cierre natural de la conversación (45).** Un "gracias" hoy cae en el intérprete general.
   Hace falta un tipo de intención propio para contestar corto y no reabrir la venta.

Y una decisión que conviene revisar con uso real:

- **La ventana de agrupación quedó en 6 segundos** en vez de los 20 de la especificación. Se puede
  mover sin tocar código con la variable de entorno `VENTANA_AGRUPACION_SEGUNDOS`.

---

## Migraciones de estas tandas

| Migración | Qué trae |
|---|---|
| `0015_pesos_por_unidad_especificacion.sql` | Pesos por unidad (6) |
| `0016_atencion_general.sql` | Medios de pago y promociones (17, 19) |
| `0017_ventana_y_confirmacion.sql` | Agrupación de mensajes y confirmación final (31, 34, 3.1, 32) |
| `0018_pedido_vivo.sql` | Versionado, estados nuevos, historial y avisos (8-12, 27, 35, 51, 53) |
| `0019_ciclo_carnicero.sql` | Rechazo conversado, "en espera", resumen diario, cierres (7.4-7.6, 23, 24, 36) |
| `0020_sustitutos_y_atencion.sql` | Sustitutos autorizados, complementarios y handoff (5, 40, 43) |
| `0021_pedido_listo.sql` | "Ya está listo" — aviso al cliente por si lo quiere retirar antes |

Correr en orden. La `0020` además carga los reemplazos que la sección 5.5 autoriza explícitamente.

---

## Cambios posteriores a las seis tandas

### 10/09/2026 — El bot no puede confundir al cliente con el carnicero

**Qué pasó.** Probando en el simulador, mensajes escritos en la solapa del cliente se procesaron
como carga de stock: el bot le contestó al cliente *"no relacioné eso con una actualización de
stock"* y le terminó modificando el stock a la carnicería desde el hilo de un cliente.

**Por qué.** Dos causas encadenadas, y la segunda es la que importa:

1. Las dos solapas del simulador compartían la misma instancia de React (faltaba `key`), así que un
   mensaje del cliente salió por la acción del carnicero.
2. **El simulador decidía el rol por su cuenta**, a partir de un teléfono que mandaba el navegador
   en un campo oculto, y tenía su propio enrutamiento a mano en vez de usar el del motor. Había dos
   lugares que contestaban "¿quién es este número?", y uno lo contestó mal.

**Qué se hizo.** El principio: *el rol se decide en un solo lugar, del lado del servidor, y los
módulos que pueden hacer daño lo vuelven a chequear por las suyas.*

- **`src/lib/quienEs.ts` (nuevo)** — la única función que contesta si un número es del carnicero.
  Se eliminó `esNumeroDeCarnicero` de `numerosCarnicero.ts` para que no queden dos formas de
  preguntar lo mismo.
- **`src/lib/simulador.ts` (nuevo)** — los dos números de prueba, que ahora los pone el servidor. El
  navegador ya no manda teléfonos. El número del carnicero simulado vale como autorizado
  **solo mientras la carnicería está en modo simulado**, así que no deja un permiso abierto para
  cuando se conecte Meta.
- **El simulador dejó de tener enrutamiento propio.** Las dos puntas llaman al mismo
  `procesarMensajeEntrante` que usan los webhooks. Un camino, no dos.
- **Guardas en los flujos.** `flujoStock.ts` rechaza cualquier número que no sea del carnicero y
  `flujoPedidos.ts` rechaza el del carnicero, cada uno preguntando por su cuenta en vez de confiar
  en quien lo llamó. Las dos guardas dejan un `console.error` con "BLOQUEADO" si alguna vez saltan.
- **Efecto secundario bueno:** como el enrutamiento quedó unificado, ahora un carnicero que escribe
  "entraron 20 kilos de asado" **por texto** en WhatsApp de verdad recibe respuesta. Antes eso solo
  funcionaba en el simulador, y esa diferencia hacía que probar acá no probara lo de allá.

### 10/09/2026 — "Avisar que está listo" (fuera de especificación, pedido del fundador)

Un botón en el detalle del pedido que le manda al cliente *"tu pedido ya está listo, podés pasar
cuando quieras"*, por si lo quiere retirar antes de la hora que había acordado.

- **No es un estado nuevo**, es `pedidos.listo_at`. El pedido sigue aprobado: el stock sigue
  reservado, el recordatorio sigue saliendo y se puede seguir dejando en espera o marcando como
  retirado. La migración `0021` explica el razonamiento largo.
- **El panel lo muestra como si fuera un estado** ("Listo para retirar"), vía `etiquetaDePedido()`,
  que es ahora el único lugar donde un pedido se traduce a lo que se ve.
- **Se avisa una sola vez.** El `.is("listo_at", null)` del update garantiza que dos toques del
  botón no manden dos WhatsApp.
- **El recordatorio se adapta** en vez de suprimirse: si el pedido ya está listo, dice *"ya está
  armado, esperándote"*. Un cliente que arregló para dentro de seis horas sigue necesitando que le
  recuerden a qué hora quedó.
- **Pendiente**: hoy es solo por panel. Que el carnicero pueda contestar "listo" por WhatsApp es
  posible, pero hay que resolver a cuál pedido se refiere cuando tiene varios aprobados.

### 13/09/2026 — Stock por media res (fuera de especificación del bot)

El módulo completo del diseño de `docs/media-res-diseno-final.md`, Etapa 1 y 2. Migraciones `0022`
a `0024`.

**Lo que se puede hacer ahora:**

1. **Cargar una media res hablando.** *"Llegó una media res de ciento cuatro kilos seiscientos"* →
   el bot confirma → se crean 28 piezas estimadas. Dos confirmaciones como máximo.
2. **Cargarla por panel**, en `/panel/stock/medias-reses`. Es el respaldo, no el camino principal.
3. **Ver el balance del lote**: dónde fue a parar cada kilo, con el descuadre como renglón.
4. **Ver el costo real por kilo vendible** y el margen por corte.
5. **Marcar que un corte se acabó**, que además calibra la tabla.

**Decisiones que conviene no volver a discutir:**

- **El stock son piezas y los kilos viven adentro de cada pieza.** No existe una tabla de "kilos por
  corte": se suman las piezas. Por eso las dos vistas (en kilos y en piezas) no pueden contradecirse.
- **`productos.stock_actual` es un cache** de esa suma y sigue siendo lo único que lee el bot. Toda
  función que toca una pieza lo recalcula. Por eso nada del bot hubo que tocarlo.
- **Dos estados de confianza**, no seis: `estimado` y `pesado`. Un peso real REEMPLAZA al estimado,
  nunca se suma.
- **El descuadre es un renglón de la ecuación, no un error.** El balance siempre cierra porque el
  descuadre es la línea que lo hace cerrar. No se espera que dé cero: lo que se gestiona es su tamaño.
- **El cierre al 100 % es sobre la TABLA de rendimiento, no sobre el stock físico.** La tabla es una
  receta y si suma 108 % está rota; el físico nunca cierra y está bien que así sea.
- **El intérprete de media res es aparte del de stock** (`interpretarMediaRes.ts`). Son operaciones
  distintas: una carga de stock SUMA kilos, una media res TRANSFORMA. Ante la duda devuelve
  "no es una media res" y el mensaje sigue al flujo de siempre, que es el error barato.
- **La media res pendiente vive en `operaciones_stock`**, no en una tabla propia: para el carnicero
  hay una sola cosa pendiente a la vez, así que su "sí" nunca es ambiguo.

**Descuento de stock al aprobar un pedido:** ahora descuenta POR PIEZA (la más vieja primero, FEFO)
cuando el producto tiene piezas de alguna media res, y cae al descuento de siempre sobre
`stock_actual` cuando no las tiene. El fallback no es transitorio: el pollo, el cerdo y las achuras
nunca van a venir de una media res.

**Códigos del IPCVA:** se cargaron solo los 12 verificados contra el nomenclador publicado. El resto
quedó en `NULL` a propósito — un código inventado se lee como oficial. Dos trampas anotadas en la
migración `0022`: "tapa de asado" NO es el 2310 (ese es "Tapa de Aguja – Asado de Carnicero", del
delantero), y la marucha tiene dos ubicaciones según la fuente.

**Lo que falta:** el peso real al marcar un pedido como retirado (dispara la calibración), y la caja
para la venta presencial.
