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

### 13/09/2026 — Cintura conversacional: léxico, doble confirmación, sustitutos y repetición

Cuatro fallas reportadas por el fundador probando en el simulador. Las cuatro se
arreglaron cerrando la clase de problema, no el caso puntual.

**1. El bot no reconocía "sí" y "no" dichos como los dice la gente.**
`src/lib/confirmacion.ts` comparaba el mensaje ENTERO contra una lista de frases:
"dale" andaba, "dale no hay problema" no. Ahora el mensaje se parte en palabras
(y en emojis sueltos) y cada palabra tiene que ser una frase de confirmación, de
cancelación, de modificación, o relleno sin contenido. **Si sobra una sola
palabra que no sea ninguna de esas cosas, se devuelve `null` y el mensaje va a la
IA con el contexto** — que es lo que mantiene intacto el caso "no, eran 12 kilos"
(una corrección, no una cancelación). Las frases se prueban de la más larga a la
más corta, y por eso los "sí" argentinos que empiezan con "no" ("no hay problema",
"no hay drama", "no pasa nada") ganan contra el "no" pelado.
Emojis reconocidos: 👍 👌 ✅ ✔ ☑ 🆗 💯 🤙 👏 🫡 🤝 / ❌ 👎 🚫 ⛔ 🙅. Cualquier otro
emoji acompaña pero no decide.
`confirmacionPedido.ts` sigue teniendo su propia lista corta a propósito (para que
un "dale" del carnicero no sea ambiguo entre stock y pedidos), pero ahora comparte
la limpieza de texto con `confirmacion.ts` en vez de duplicarla.

**2. Aceptar un cambio del carnicero reabría el pedido.** Cuando el carnicero
proponía otro horario, `decisionCarnicero.ts` dejaba el pedido en la fase
`esperando_confirmacion_final` — la misma que se usa cuando el cliente todavía no
vio el resumen. El "dale" del cliente hacía que el bot le mostrara el pedido
entero y le preguntara "¿está bien así?". Ahora hay una fase propia
(`esperando_aceptacion_cambio`): un sí ahí aprueba el pedido (descuenta stock,
congela total, avisa al carnicero — regla 4) y contesta con la confirmación
final, sin repreguntar nada. Un "no" no cancela: pregunta qué horario le sirve.
También se le refresca el `expires_at` al pedido, que venía con el vencimiento de
4 h de la aprobación y podía morirse mientras el cliente pensaba.

**3. Sustitutos sin chequear stock.** El filtro de stock ahora vive en una sola
función, `buscarSustitutosConStock` (`alternativas.ts`), y no hay ningún camino
que devuelva un sustituto sin pasar por ahí. Se sumó el tema de consulta
`sustitutos` ("¿tenés algo parecido?", "¿con qué lo cambio?"): la IA solo
clasifica y dice de qué producto habla — **nunca nombra el reemplazo**, porque
los pares autorizados están en la base y el stock lo verifica el código.
`responderStock` también cambió: cuando de algo no hay, ya no termina en "no me
queda" sino que ofrece lo que sí hay y sirve. Si no hay sustituto autorizado con
stock, se dice que no hay: no se inventa uno parecido.

**4. El bot repetía la misma pregunta palabra por palabra.** Dos arreglos, uno
puntual y uno general.
- Puntual: "¿cuántos son hombres y cuántas mujeres?" contestado con "1 y 1" no se
  entendía. Se agregó `src/lib/personas.ts`, un lector determinístico (sin IA) de
  ese desglose: "1 y 1", "2 varones y 1 mujer", "2 son mujeres" sobre un total
  conocido, "todos hombres", "mitad y mitad". **No reemplaza a la IA, la
  respalda**: primero se usa lo que trae el intérprete (que ve el mensaje entero
  y puede traer también la hora o un producto nuevo) y esto completa lo que falte.
  Además la pregunta tiene escalera: al segundo intento se pide más simple y con
  ejemplo de formato, y al tercero se deja de insistir y se calcula con el
  promedio de KG_POR_HOMBRE y KG_POR_MUJER. Un dato de estimación no puede trabar
  un pedido.
- General: `variarSiSeRepite` se aplica a CUALQUIER pregunta antes de mandarla —
  incluidas las que escribe la IA. Si es idéntica a la anterior, le cambia la
  entrada, rotando entre variantes para que dos repeticiones seguidas tampoco
  suenen iguales.

Archivos tocados: `confirmacion.ts`, `confirmacionPedido.ts`, `alternativas.ts`,
`consultas.ts`, `interpretarPedido.ts`, `decisionCarnicero.ts`, `flujoPedidos.ts`,
y el nuevo `personas.ts`. Sin migraciones.

### 21/09/2026 — Segunda ronda: stock por voz, lotes, desposte, hora y promos

Diez puntos que reportó el fundador probando pollo y cerdo en el simulador.

**El arreglo de fondo: un solo camino para cambiar el stock.** El flujo de voz, el
panel, el rechazo de pedidos por falta de stock y el fallback de la aprobación
escribían `productos.stock_actual` directo. El motor de piezas (lotes.ts) lo
recalcula como SUMA DE PIEZAS cada vez que toca algo, así que esos cambios se
borraban solos en el próximo recálculo: "piqué 3 kg de vacío" bajaba el vacío hasta
la próxima venta de vacío. Ahora todo pasa por `moverStock` (ingreso = nace una
pieza, baja = se gasta FEFO, ajuste = la diferencia). El stock de antes de las piezas
se convierte en una pieza "de arrastre" la primera vez que se toca el producto, así
no se pierde.

**Stock por voz (`interpretarStock.ts`, `flujoStock.ts`).**
- `itemsParciales` es una lista: mientras se aclara un dato, se guardan TODOS los
  items del mensaje. Antes era uno solo y "saqué 6 pechugas y piqué 3 kg de vacío"
  perdía las pechugas y el vacío al preguntar qué picada era.
- Transformaciones: "piqué 3 kg de vacío" son dos movimientos con el mismo
  `transformacion` (vacío −3, picada +3). El resumen los muestra con flecha
  ("🔄 Vacío −3kg → Picada especial +3kg") para que un signo al revés salte a la vista.
- Pollo entero se cuenta en cabezas: "trocé 3 pollos" cierra 3 piezas enteras;
  "entraron 8" carga un cajón de 8.
- Un mensaje no entendido ya no borra lo que estaba a medio armar; la primera vez
  se muestra qué está pendiente, la segunda vez seguida se abandona y el mensaje se
  procesa como nuevo. Un mensaje suelto no entendido ya no crea una operación vacía
  que se trague el siguiente.

**Lotes (`deteccionLote.ts`, `interpretarLote.ts`, `flujoLotes.ts`).**
- La especie sale de la palabra de especie que aparezca cerca ("dos medias res MÁS
  de cerdo" ya es cerdo). "Media res" a secas con un peso que podría ser de cerdo
  (≤ 70 kg) pregunta "¿Es de vaca o de cerdo?" en vez de cargarla como novillo.
- "8 pollos" es un cajón de 8 cabezas.
- Se puede corregir el animal de un lote pendiente ("de cerdo") conservando el peso.
- Un lote de otra forma (un cajón de pollo mientras esperaba una media res), o una
  llegada con su propio número, deja de lado lo pendiente y arranca de nuevo.
- Varias medias reses de distinto peso: `pesosKg` (una de 51 y otra de 46 son dos
  lotes). "51 y 46" se lee sin IA: nunca más 51,46 kg.
- Después de dos mensajes sin entender, se cancela y se avisa, en vez del disco rayado.

**Desposte y trozado.** Se puede despostar una media res de cerdo de a partes: cada
guardado suma al stock, descuenta de lo que le queda a la media res y saca esos
cortes de las opciones de esa media res. "Terminé de despostar" la cierra y anota el
resto como hueso y merma. En el trozado de pollo los pesos siguen a la cantidad de
pollos, y ni el formulario ni el servidor aceptan que salga más de lo que entró
(antes 3 pollos de 7,5 kg dieron 14,8 kg de presas).

**Cliente.**
- Hora de retiro: una hora válida ya no se descarta si el resto de la respuesta del
  modelo vino mal; si la pregunta pendiente es la hora y el modelo no la trajo, se lee
  sin IA ("tipo 19", "a las 7", "mañana a las 10"); un ISO sin zona se toma como hora
  argentina; el segundo "¿a qué hora?" ya no es igual al primero.
- Promos: las vigentes van en el prompt, así "quiero la promo" arma el pedido; la
  respuesta a "¿tienen promos?" cierra invitando a pedirla.

**Panel.** Catálogo con relleno en las tarjetas y colores de estado que existen en
el sistema de diseño; el % de los cortes de pollo dice "del pollo", no "de la media res".

Archivos nuevos: `conversacion.ts` (no repetirse, compartido), `horaRetiro.ts`.
Sin migraciones.

### 22/09/2026 — El bot recuerda lo que se habló (historial en el prompt)

Hasta acá, a la IA se le mandaba solo el mensaje nuevo más un resumen armado por el
código. Si el resumen perdía algo, no había de dónde recuperarlo. Ahora los intérpretes
de stock y de pedidos reciben además los últimos 12 mensajes de las últimas 3 horas,
tal cual se dijeron (`src/lib/historial.ts`, leyendo `mensajes_whatsapp`). El resumen
estructurado sigue mandando sobre qué está confirmado o cargado; el historial es la red
para que "vacuno" se entienda como la respuesta a "¿vacío vacuno o de cerdo?" sin
olvidar los 3 kg ni la picada especial.

Nota de la misma fecha: la carpeta local había vuelto al último commit (se perdieron del
disco pollo/cerdo y los arreglos del 21/09, que nunca se habían subido a GitHub). Se
restauraron desde la copia de trabajo de Claude. **Commitear y pushear enseguida.**

### 22/09/2026 (tarde) — Cerdo, trozado por voz, venta por unidad y cambios de pedido

- **Cerdo contado.** "Entraron dos cerdos", "un chancho entero", "medio cerdo" ya son un
  lote de cerdo (antes caían al flujo genérico y la IA terminaba cargando pollo). Cada
  "cerdo" de hasta 70 kg es una media; uno de 70 a 140 kg es el animal entero y se carga
  como dos medias de la mitad, avisándolo en el resumen. Si una charla arrancó en el flujo
  de stock y recién con la respuesta se nota que era un lote ("dos cerdos" + "48 y 52"),
  se reencauza como lote con los dos mensajes juntos.
- **Guarda de especie.** Si en la charla se nombró un animal y la IA arma un producto de
  otro (cerdo → "Pollo entero"), no se manda a confirmar: se pregunta.
- **Trozado de pollo por voz (`lecturaTrozado.ts`, `flujoTrozado.ts`, `estimarTrozado`).**
  "Trocé 3 pollos y saqué 2,700 de pechuga" se lee sin IA. Con las presas pesadas y la tabla
  de trozado se calculan las demás (cada punto de tabla vale pesado ÷ % de lo pesado), con
  tope en lo que pesaban los pollos. Se cargan TODAS las presas: las pesadas como 'pesado',
  las calculadas como 'estimado'. Si dice cuánto pesaba el pollo, ese peso reemplaza al
  estimado antes de trozar.
- **Venta por unidad (`estimadorPorUnidad`).** "3 pata muslo" ya no pide kilos: el peso de
  una unidad sale del catálogo (nuevo botón "Venderlo por unidad"), del peso real de los
  pollos en stock, o de la tabla de trozado (presas de pollo). El resumen muestra
  "3 u. (~1,5 kg)". Si no hay ningún dato, se pide en kilos (no se inventa). En la carga por
  voz, "entraron 10 pechugas" se pasa a kilos con el mismo estimador.
- **Cambiar un pedido confirmado (secciones 8 y 49).** Nuevo tipo `modificacion` en el
  intérprete, que ahora ve el pedido confirmado del cliente. "Sacá el vacío" devuelve el
  stock, crea una versión nueva, avisa al carnicero y vuelve a armar el pedido por el camino
  de siempre (resumen → confirmación → aprobación). "Quiero cambiar mi pedido" sin detalle
  muestra el pedido y pregunta qué cambiar, sin tocar nada.
- **Cancelar un pedido aprobado devuelve el stock** (10.2). Antes quedaba descontado.

### 28/09/2026 — La hora, decidida por código; el nombre del cliente; peso por corte; carga manual de cerdo y pollo

- **La hora de retiro ya no depende de la IA (`horaRetiro.ts`, sección 42).** Un solo lugar
  decide (`horaDelMensaje` en flujoPedidos.ts): primero lee el texto sin IA ("10", "10 dije",
  "10.", "para las 10 AM", "tipo 7", "8 y media", "mañana a las 10", "el sábado a las 9",
  "en media hora"), y la hora que salga se contrasta SIEMPRE con el horario cargado del local
  (`cargarAgenda` en horarios.ts, que incluye días especiales). "10" a las 19:39 no es "las
  22:00 de hoy": es mañana a las 10. Si la hora pedida ya pasó o el local está cerrado, se
  propone la más cercana en que esté abierto ("Hoy a las 22:00 estamos cerrados (hoy
  atendemos de 08:00 a 13:00 y de 17:00 a 20:30). ¿Te sirve hoy a las 20:30?") y un "sí"
  la acepta sin pasar por la IA. La hora ya no se pierde cuando en el mismo mensaje hay un
  producto que no se reconoció. En los mensajes se muestra "hoy 19:00" / "mañana 10:00" /
  "el sábado 03/10 09:00", no una fecha cruda. 26 casos probados, incluidos los del log real.
- **Se le contesta con la palabra del cliente en toda la charla (`nombreParaCliente`).** Si
  pidió "roast beef" (en esta carnicería es sinónimo de aguja) y después contestó "10", el
  resumen dice "Roast beef: 10 kg", no "Aguja". El nombre se busca en el mensaje actual, en
  sus mensajes anteriores y en cómo figuraba en el pedido. **Nombre propio gana a sinónimo**
  (`corregirPorNombrePropio`): si la IA eligió un producto por un sinónimo y otro producto
  activo se LLAMA así, se toma el otro (caso real: palomita tiene "chingolo" de sinónimo).
- **"¿Cuánto pesa uno?" (tema de consulta `peso_unidad`).** Se contesta con datos reales:
  primero el peso por unidad del catálogo o del pollo en stock, y si no, lo que pesaron las
  piezas enteras de ese corte al entrar con las medias reses (`estimadorPiezaEntera`: "La
  pieza entera de matambre de cerdo pesa más o menos 1,5 kg"). Hay un detector sin IA de
  respaldo (`preguntaPorPeso`) que distingue peso de precio ("¿a cuánto viene?"). La pieza
  entera solo se usa para convertir unidades a kilos si el cliente dijo "entero/pieza" o si
  se le acababa de contar ese peso: "2 bifes de chorizo" nunca son 2 bifes angostos enteros.
- **Carga manual de cerdo y pollo en el panel.** "Lo que entra" ahora deja elegir media res
  vacuna, media res de cerdo, cerdo entero (dos medias de la mitad) o cajón de pollo
  (cabezas + peso del cajón, que por defecto es el de la carnicería). Usa el mismo
  `cargarLote` que el bot.

### 29/09/2026 — Más flexible: recomendaciones, errores de tipeo, varias cosas juntas y audios

- **Recomendaciones por ocasión (`recomendaciones.ts`, tema de consulta `recomendacion`).**
  "¿Qué te queda de asado?", "algo para la parrilla", "¿qué cortes tenés?", "¿qué más me
  ofrecés?", "¿qué uso para milanesas / vitel toné / un guiso?" ahora se contestan con los
  cortes que sirven para eso Y tienen stock. La tabla de ocasiones (parrilla, horno,
  milanesas, olla, plancha, vitel toné, picada, salteado) vive en el código y se cruza con
  el catálogo real: nunca se ofrece algo que la carnicería no tiene. Sin ocasión, se muestra
  un pantallazo agrupado y se pregunta para qué lo quiere. Detector sin IA de respaldo
  (`ocasionPedida`); "quiero 2 kg de vacío para la parrilla" sigue siendo un pedido.
- **Saludo.** La bienvenida ya no repite "contame qué necesitás" dos veces, sale una sola
  vez por charla, y un "¡Hola! ¿qué te quedó para la parrilla?" contesta la pregunta con
  un saludo corto adelante. "Eso te lo confirmo y te aviso" (una promesa que nadie cumplía)
  se reemplazó por una respuesta honesta que ofrece lo que el bot sí puede hacer.
- **"Media res" mal escrita (`canonizarLote`).** "mediarres", "mediaree", "media rre",
  "mediarez", "1/2 res", en mayúsculas o no, se reconocen como media res. Si igual se
  escapa y la IA de stock arma un producto "media_res", se reencauza como lote con todo lo
  que dijo junto. "LAS MEDIA RES PESAN 100 102 y 89 KILOS" se lee sin IA.
- **Un "sí" con comentarios (`porVerboDeAccion` en confirmacion.ts).** "no era tan difícil
  si cargalo" es un sí: una orden clara (cargalo, confirmalo, mandalo, preparalo) gana
  aunque venga con otras palabras, salvo que además pida otra cosa (un número, "pero",
  "sin", "agregale", una especie, una pregunta).
- **Varias instrucciones en un mensaje (`instrucciones.ts` + cola, migración 0028).**
  "Llegó una media res de 104, un cajón de pollo de 8 y piqué 5 de nalga" se parte en tres
  y se atienden de a una: la primera se confirma, y al cerrarla el bot sigue solo con la
  siguiente. Solo se corta entre cosas de distinto tipo; "entraron 20 de asado y 8 de
  vacío" sigue siendo una sola carga.
- **El audio del carnicero va por el mismo camino que el texto.** Antes iba directo a la
  carga de stock genérica y se salteaba lotes, trozado y la operación pendiente.
- **La tabla de recomendaciones se edita desde el panel** (Catálogo → *Recomendaciones del
  bot*, migración 0029). Por ocasión: qué cortes ofrece y en qué orden, y qué va "para
  acompañar". Muestra el stock de hoy de cada uno y una vista previa de cómo contestaría el
  bot ahora mismo. Mientras la carnicería no guarde nada, usa la de fábrica; la primera vez
  que guarda, se copia la de fábrica entera y desde ahí manda la suya. "Volver a la de
  fábrica" restaura una ocasión.

