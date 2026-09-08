# Carnicom — Etapa 3
## Especificación funcional completa del bot de atención y pedidos por WhatsApp

**Versión consolidada:** 09/09/2026  
**Objetivo de este documento:** dejar por escrito, con el mayor nivel de detalle posible, todas las decisiones de negocio, conversación, comportamiento y operación definidas para Carnicom durante esta etapa. Este documento debe servir como fuente de verdad para la implementación técnica posterior.

> **Regla de interpretación:** cuando una decisión de este documento contradiga una idea o versión anterior, prevalece la decisión más reciente documentada aquí.

---

# 0. Resumen ejecutivo

Carnicom es un sistema para carnicerías de barrio cuyo canal principal con el cliente es WhatsApp. El cliente puede consultar, conversar y hacer pedidos anticipados para retirar por el local. El bot está conectado al stock real de la carnicería y utiliza ese contexto para responder, ofrecer alternativas y construir pedidos.

Carnicom no debe comportarse como un formulario rígido ni como un bot evidente. Debe conversar de manera natural, usando vocabulario argentino/rosarino, entendiendo el contexto y resolviendo la mayor cantidad posible de situaciones sin generar fricción.

El carnicero conserva siempre la última palabra sobre la aceptación de un pedido, pero en operación normal **no conversa directamente con el cliente**. Cuando hace falta una decisión humana, Carnicom le presenta al carnicero opciones rápidas y numeradas; el carnicero elige y Carnicom vuelve a encargarse de la conversación con el cliente.

La única excepción es una caída o error técnico que impida al bot continuar normalmente. En ese caso se puede habilitar intervención directa del carnicero para no perder la conversación.

---

# 1. Principios generales e innegociables

## 1.1 Carnicom es atención al público, no solo un tomador de pedidos

Carnicom debe poder:

- tomar pedidos;
- responder consultas sobre productos;
- responder consultas sobre stock;
- responder horarios;
- informar medios de pago;
- informar dirección;
- responder consultas generales;
- informar promociones cargadas;
- orientar sobre cortes y usos cuando tenga información suficiente;
- sugerir sustitutos;
- recibir texto y audio;
- interpretar correcciones y mensajes consecutivos;
- mantener el contexto de la conversación.

No se fuerza al cliente a elegir categorías ni a navegar botoneras.

## 1.2 Tono

El tono debe ser:

- argentino;
- natural;
- cercano;
- coloquial sin exagerar;
- simple;
- cordial;
- directo;
- profesional sin sonar corporativo;
- compatible con una carnicería de barrio de Rosario.

El cliente debería sentir que está hablando con la carnicería.

## 1.3 Regla absoluta: nunca inventar

Carnicom **NUNCA debe inventar**:

- stock;
- productos;
- cantidades;
- horarios;
- promociones;
- medios de pago;
- dirección;
- descuentos;
- precios;
- sustitutos fuera de los autorizados;
- datos de un pedido;
- una interpretación cuando el mensaje es ambiguo.

Si no sabe algo o no entiende, pregunta.

## 1.4 Regla absoluta: nunca suponer ante ambigüedad

Carnicom debe utilizar el contexto para entender expresiones naturales. Pero si existen dos o más interpretaciones razonables, debe preguntar.

Ejemplo correcto:

Cliente: “Quiero vacío.”  
Cliente: “Poneme medio kilo más.”

Si el contexto deja claro que se refiere al vacío, Carnicom puede interpretarlo.

Ejemplo ambiguo:

Pedido con vacío y chorizos.  
Cliente: “Sacame uno.”

Carnicom debe preguntar cuál.

**Nunca debe ejecutar una modificación dudosa.**

## 1.5 El contexto manda

El bot debe comprender la conversación completa y el estado actual del pedido. No debe tratar cada mensaje como una instrucción aislada.

## 1.6 El carnicero tiene la última palabra

Carnicom automatiza la conversación y propone soluciones, pero la aprobación final del pedido corresponde al carnicero.

## 1.7 El carnicero normalmente no habla con el cliente

En operación normal:

1. Carnicom conversa con el cliente.
2. Si necesita una decisión humana, consulta al carnicero.
3. Carnicom presenta opciones numeradas y concretas.
4. El carnicero elige.
5. Carnicom comunica la decisión al cliente con lenguaje natural.
6. Carnicom continúa resolviendo la conversación.

No se “entrega el chat” al carnicero en situaciones normales.

**Única excepción:** caída de la aplicación o error técnico grave que impida al bot seguir la conversación.

---

# 2. Mensaje inicial y atención general — ITEM 1

## 2.1 Mensaje inicial definitivo

> ¡Hola! 👋 ¿Cómo andás? ¿En qué te podemos ayudar?
>
> Podés consultarnos por precios, stock, horarios, productos o hacer tu pedido. También podés mandarnos un audio.

Aunque el texto menciona “precios” como capacidad conversacional original, la decisión vigente de producto es **no informar precios por ahora** (ver ITEM 13). En implementación, esta línea deberá adaptarse para no prometer una función que actualmente está desactivada. Una versión consistente sería:

> ¡Hola! 👋 ¿Cómo andás? ¿En qué te podemos ayudar?
>
> Podés consultarnos por stock, horarios, productos o hacer tu pedido. También podés mandarnos un audio.

## 2.2 Sin nombre en el primer contacto

No usar el nombre del cliente en el saludo inicial porque puede no estar disponible.

## 2.3 No usar “bienvenido”

Se descartó porque suena robótico.

## 2.4 Detección directa de intención

Ejemplos:

- “Quiero 2 kg de nalga” → pedido.
- “¿Tenés vacío?” → consulta de stock.
- “¿A qué hora cierran?” → horario.
- “¿Venden carbón?” → consulta de producto.
- “¿Hacen delivery?” → consulta general.
- audio → se procesa con la misma lógica conversacional.

---

# 3. Pedido pendiente y demora de aprobación — ITEM 2

## 3.1 Aviso después de 30 minutos

Si el pedido ya fue enviado al carnicero y pasan 30 minutos sin aprobación, Carnicom envía un aviso al cliente.

Debe sonar coloquial y transmitir que la carnicería está ocupada.

Variantes recomendadas:

1. “Disculpá la demora, estamos a full en la carnicería. Apenas te confirmemos el pedido te aviso 🙌”
2. “Estamos con bastante movimiento ahora. Apenas quede confirmado tu pedido te aviso 👍”
3. “Perdón por la espera, la carnicería está a full. En cuanto revisemos tu pedido te aviso.”

No bombardear al cliente con recordatorios adicionales.

## 3.2 Vencimiento

Un pedido que permanece pendiente sin resolución vence a las **4 horas**, salvo que otra lógica posterior aplicable al pedido determine lo contrario.

## 3.3 Mientras está pendiente

No se crea un segundo pedido independiente para la misma intención. El cliente puede modificar el pendiente.

---

# 4. Cliente nuevo y recurrente — ITEM 3

## 4.1 Primer contacto

Saludo genérico, sin nombre.

## 4.2 Solicitud de nombre

Después de aproximadamente **2 horas desde la hora del pedido**, se puede pedir el nombre con una explicación natural relacionada con tenerlo en cuenta y poder avisarle de promociones.

Ejemplo:

> “Che, antes de que me olvide, ¿cómo te llamás? Así te tenemos en cuenta y también podemos avisarte cuando haya alguna promo.”

No convertir esto en una fricción para completar el pedido.

## 4.3 Cliente recurrente

Si el nombre está guardado, utilizarlo en contactos futuros.

Ejemplos variables:

- “¡Hola, {nombre}! 👋 Qué bueno tenerte de nuevo. ¿En qué te podemos ayudar hoy?”
- “¡Buenas, {nombre}! 👋 ¿Cómo andás? Contame qué necesitás.”
- “¡Hola, {nombre}! ¿Todo bien? 👋 Decime qué necesitás y te doy una mano.”

No hacer recomendaciones automáticas basadas en historial en esta etapa.

---

# 5. Sustituciones — ITEM 4

## 5.1 Sistema híbrido

La IA puede razonar cuál es la mejor alternativa, pero **solo puede proponer sustitutos dentro de un conjunto previamente autorizado**.

## 5.2 Criterios

Considerar:

1. mismo corte o presentación;
2. mismo uso culinario;
3. tipo de carne;
4. con hueso / sin hueso;
5. características del producto;
6. diferencia de precio cuando en el futuro se habiliten precios;
7. compatibilidad real con la preparación.

## 5.3 Nunca sustituir automáticamente

Siempre consultar al cliente.

## 5.4 Preguntar el uso cuando sea necesario

Ejemplo:

> “No tengo vacío en este momento. ¿Lo querías para la parrilla, para el horno o para otra comida?”

## 5.5 Mapeo básico inicial de sustitutos autorizados

Estos mapeos son una base de negocio y deben poder ajustarse con el carnicero piloto.

### Milanesas de carne / cortes magros

- Nalga → Cuadrada → Bola de lomo → Peceto.
- Cuadrada → Nalga → Bola de lomo.
- Bola de lomo → Nalga → Cuadrada.
- Peceto → Nalga / Bola de lomo cuando el uso lo permita.

No ofrecer roast beef como reemplazo automático de nalga para milanesas.

### Parrilla

La sustitución debe depender del uso y del stock. No asumir que cualquier corte de carne vacuna reemplaza a otro.

Ejemplo explícitamente descartado: no ofrecer lomo como reemplazo automático de vacío solo porque ambos son carne vacuna.

### Pollo

- Pechuga / suprema: tratarlas como un mismo concepto práctico en el catálogo cuando corresponda.
- No reemplazar automáticamente pechuga por pata-muslo.
- Pata-muslo y cuarto trasero no son equivalentes.

### Embutidos

- Chorizo y morcilla no son sustitutos automáticos entre sí.

## 5.6 Si el sustituto es más caro

Cuando en el futuro haya precios activos, deberá informarse que la alternativa es más cara antes de confirmar. En la versión actual, los precios no se comunican, por lo que esta regla queda preparada para una etapa futura.

---

# 6. Pesos aproximados por unidad — ITEM 5

Todos los productos vendidos por unidad pueden tener `peso_aproximado_unidad` configurable.

Valores iniciales:

- Milanesa de carne: **150 g/u aprox.**
- Milanesa de pollo: **150 g/u aprox.**
- Milanesa de cerdo: **150 g/u aprox.**
- Hamburguesa: **120 g/u aprox.**
- Medallón: **120 g/u aprox.**

Productos muy variables, como patitas, brochettes o albóndigas, pueden quedar sin valor predeterminado hasta que el carnicero lo configure.

Ejemplo:

Cliente: “4 milanesas de carne.”

Carnicom puede representar internamente:

> 4 milanesas de carne — aprox. 600 g.

Si el cliente pide “aprox. 1 kg de milanesas”, no convertir innecesariamente a unidades.

El peso siempre es aproximado.

---

# 7. Retiro, recordatorio y no-show — ITEMS 6, 24 y 25

## 7.1 Hora de retiro

La hora acordada es una orientación para preparación/retiro. El pedido continúa válido hasta el cierre, salvo reprogramación.

## 7.2 Recordatorio

Una vez confirmado el pedido, enviar **un solo recordatorio**, 1 hora antes de la hora estimada de retiro.

Ejemplo:

> “🔔 Te recuerdo que tu pedido está para retirar alrededor de las {hora} hs. ¡Te esperamos!”

Después de ese recordatorio no enviar más mensajes automáticos por retiro.

## 7.3 El cliente no tiene que avisar que retiró

El carnicero marca el pedido como retirado desde el CRM/panel.

## 7.4 Cierre del día: no marcar no-show automáticamente

Al horario de cierre, si existen pedidos confirmados sin estado final:

1. Carnicom avisa al carnicero.
2. El carnicero debe revisar cada caso.
3. Puede elegir:
   - **Retirado**
   - **En espera**

## 7.5 Estado “En espera”

Si el carnicero marca “En espera”:

- el pedido permanece activo un día adicional;
- el stock continúa reservado;
- el cliente puede retirarlo al día siguiente.

Ejemplo:

Pedido para martes.  
No se retira el martes.  
Al cierre, carnicero marca “En espera”.  
Puede retirarse el miércoles.  
Si al cierre del miércoles sigue sin retirarse → `no_show`.

## 7.6 No-show

Solo se marca automáticamente al cierre del día adicional cuando el pedido continúa sin retirarse.

---

# 8. Pedido confirmado y modificaciones — ITEM 8

Un pedido confirmado puede modificarse.

El cliente puede:

- agregar productos;
- quitar productos;
- cambiar cantidades;
- reemplazar productos.

Si la modificación afecta productos/stock:

1. se crea una nueva versión;
2. se verifica stock;
3. el cliente confirma el nuevo resumen;
4. la nueva versión requiere aprobación del carnicero.

La versión anterior no debe modificarse silenciosamente.

---

# 9. Múltiples pedidos — ITEM 9

Se permiten múltiples pedidos simultáneos para distintas fechas.

Ejemplo:

- pedido confirmado para hoy;
- pedido separado para mañana.

Cada pedido se gestiona independientemente.

Si el cliente dice “agregame esto al pedido de hoy”, es una modificación del pedido existente, no uno nuevo.

---

# 10. Cancelaciones — ITEMS 10 y 31

## 10.1 Pedido pendiente

Se puede cancelar directamente.

## 10.2 Pedido confirmado

Se cancela, se notifica al carnicero y se libera el stock reservado.

## 10.3 Pedido retirado

No se puede cancelar.

## 10.4 “Sacame todo”

Si el cliente expresa una modificación que en la práctica elimina todo el pedido, se interpreta como cancelación.

Carnicom debe entender la intención, no exigir la palabra exacta “cancelar”.

---

# 11. Cambio de horario — ITEM 11

El cliente puede cambiar la hora estimada de retiro.

- Pedido pendiente → actualizar.
- Pedido confirmado → actualizar sin reaprobar productos, siempre que solo cambie la hora.
- **Todo cambio se notifica al carnicero.**
- Recalcular el recordatorio de 1 hora.
- El pedido sigue válido hasta el cierre.

---

# 12. Modificación de productos — ITEM 12

El cliente puede agregar, quitar o cambiar productos.

Pedido pendiente:
- actualizar la versión pendiente;
- volver a confirmar el resumen con el cliente antes de enviarlo.

Pedido confirmado:
- crear nueva versión;
- recalcular stock;
- volver a confirmar con cliente;
- volver a aprobación del carnicero.

---

# 13. Precios — ITEM 13

**Decisión vigente: Carnicom no informa precios por ahora.**

El cliente descubre el precio al pagar en el local.

Motivo: evitar confusiones hasta que la lógica de precios, peso real y actualización esté correctamente implementada.

Por lo tanto:

- no mostrar total estimado;
- no mostrar precio por kg;
- no prometer un importe;
- no calcular descuentos;
- no mencionar recargos;
- no responder consultas de precio con datos inventados.

Si preguntan un precio durante esta etapa, la implementación debe usar una respuesta coherente con la política definida por el negocio, sin inventarlo.

---

# 14. Cantidades y mínimos — ITEM 14

No hay mínimos artificiales de compra.

Carnicom debe ser flexible con las cantidades que el negocio pueda vender.

No agregar umbrales innecesarios.

---

# 15. Preguntas que Carnicom no sabe responder — ITEM 15

Si tiene información confiable, responde.

Si no tiene información:

- no inventa;
- reconoce naturalmente que necesita verificar;
- consulta al carnicero mediante el mecanismo interno cuando corresponda;
- registra la consulta si resulta útil para mejorar el sistema.

Evitar frases robóticas.

---

# 16. Derivación de decisiones al carnicero — ITEM 16 + regla posterior

La idea inicial de “derivar el chat” queda reemplazada por la regla vigente:

**Carnicom consulta al carnicero, pero sigue siendo Carnicom quien conversa con el cliente.**

Motivos posibles para consultar:

- información que el bot no tiene;
- decisión excepcional;
- stock;
- preparación;
- rechazo;
- situación que requiere criterio humano.

El carnicero responde mediante opciones rápidas/numeradas siempre que sea posible.

---

# 17. Promociones — ITEM 17

Regla absoluta:

**NUNCA INVENTAR UNA PROMOCIÓN.**

Carnicom solo puede comunicar promociones:

- cargadas en el sistema;
- activas;
- vigentes.

Si preguntan y no hay promociones cargadas, informar naturalmente que en ese momento no hay promociones disponibles.

No inferir descuentos.

No crear ofertas para cerrar una venta.

---

# 18. Horarios — ITEM 18

Los horarios se cargan desde el panel del carnicero.

Carnicom responde respetando esos horarios.

Debe contemplar:

- horario habitual;
- días cerrados;
- horarios especiales;
- cierres excepcionales.

Si falta el dato, no inventar.

---

# 19. Medios de pago — ITEM 19

El carnicero marca mediante casillas los medios de pago admitidos.

Carnicom solo informa los habilitados.

No inventar medios de pago.

No calcular recargos/descuentos en esta etapa.

---

# 20. Delivery — ITEM 20

No se implementa delivery.

Carnicom funciona exclusivamente con **retiro en el local**.

Si preguntan:

> “¿Hacen delivery?”

Responder naturalmente que por el momento los pedidos son para retirar por el local.

---

# 21. Dirección — ITEM 21

La dirección se carga desde el panel.

Si preguntan ubicación/dirección, responder con el dato configurado.

No inventar ubicación.

---

# 22. Pedidos anticipados — ITEM 22

Se permiten pedidos para hoy y para días futuros.

No establecer un máximo artificial de anticipación por ahora.

El retiro debe corresponder a un día/horario válido según la configuración del local.

Todo pedido sigue sujeto a:

- stock;
- confirmación final del cliente;
- aprobación del carnicero.

## 22.1 Panel de pedidos futuros

El carnicero debe poder visualizar pedidos programados para fechas futuras.

---

# 23. Resumen diario al carnicero — ITEM 23

Al horario de apertura configurado para ese día, Carnicom revisa los pedidos programados para esa jornada.

Si hay pedidos, envía al carnicero un resumen.

Contenido mínimo:

- cliente;
- hora estimada de retiro;
- detalle del pedido.

Ejemplo:

> “Buen día 👋 Hoy tenés 4 pedidos programados para preparar.”

Si no hay pedidos anticipados para ese día, no es necesario enviar un mensaje vacío.

---

# 24. Cierre excepcional con pedidos futuros — ITEM 26

Si el carnicero marca una fecha como cerrada excepcionalmente y existen pedidos programados:

1. no cancelar automáticamente;
2. alertar al carnicero;
3. Carnicom informa al cliente que ese día no se podrá retirar;
4. solicita una nueva fecha;
5. mantiene el stock reservado mientras se reprograma;
6. actualiza la fecha cuando el cliente elige una válida.

No obligar al cliente a reconstruir el pedido.

---

# 25. Adelantar la fecha de retiro — ITEM 27

Si el cliente quiere retirar antes de la fecha programada:

1. Carnicom no promete automáticamente que estará listo.
2. Consulta al carnicero.
3. El carnicero decide.
4. Si acepta, actualizar fecha/hora.
5. Notificar el cambio.
6. Recalcular recordatorio.
7. Si no acepta, mantener la fecha original.

---

# 26. Postergar la fecha de retiro — ITEM 28

Si el cliente quiere pasar otro día:

- permitir solicitar reprogramación;
- mantener el stock reservado;
- pedir nueva hora si falta;
- actualizar recordatorio;
- notificar siempre al carnicero.

Regla transversal incorporada:

> **TODOS LOS CAMBIOS EN LOS PEDIDOS DEBEN SER NOTIFICADOS AL CARNICERO.**

No todos requieren re-aprobación, pero todos deben ser visibles.

---

# 27. Historial del pedido — ITEM 29

Cada pedido debe guardar un historial de eventos.

Ejemplos:

- pedido creado;
- cliente confirmó resumen;
- enviado a aprobación;
- aprobado;
- horario cambiado;
- fecha cambiada;
- producto agregado;
- producto eliminado;
- versión invalidada;
- rechazo;
- sustitución propuesta;
- sustitución aceptada;
- stock actualizado;
- recordatorio enviado;
- retirado;
- en espera;
- no-show;
- cancelado.

Registrar, cuando sea posible:

- fecha/hora;
- acción;
- actor/origen;
- valor anterior;
- valor nuevo;
- estado resultante.

---

# 28. Pedido ya retirado — ITEM 30

Un pedido retirado queda cerrado.

Si el cliente pide algo nuevo después, se crea **un pedido nuevo**.

Nunca reabrir ni modificar silenciosamente un pedido retirado.

---

# 29. Mensajes ambiguos — ITEM 32

Carnicom usa el contexto.

Si entiende con claridad, actúa.

Si no entiende:

**NUNCA SUPONE. PREGUNTA.**

Esta regla tiene prioridad sobre la velocidad o automatización.

---

# 30. Correcciones — ITEM 33

Ejemplo:

Cliente: “Dame 2 kg de nalga.”  
Cliente: “No, perdón, 1 kg.”

Interpretar 1 kg como corrección, no como 1 kg adicional.

Si el pedido ya estaba confirmado, aplicar la lógica de modificación y notificación correspondiente.

---

# 31. Confirmación final obligatoria — ITEM 34

Antes de enviar un pedido al carnicero, Carnicom debe mostrar un resumen completo al cliente.

Ejemplo:

> “Entonces te preparo:
> - 1 kg de nalga
> - 6 chorizos
> - 1 bolsa de carbón
> Retiro: hoy 19:30.
> ¿Está bien así?”

El cliente debe confirmar.

Si corrige algo:

1. actualizar;
2. generar nuevo resumen;
3. volver a confirmar.

Solo después se envía al carnicero.

Este paso es deliberado: agrega una interacción, pero reduce errores y fricciones posteriores.

---

# 32. Pedido incompleto — ITEMS 35 y 36

Si un cliente comienza realmente a armar un pedido y deja de responder:

## 32.1 Después de una hora

Solo si el pedido se ve **interrumpido o incompleto** durante más de 1 hora de inactividad, enviar:

> “¿Te puedo ayudar con algo?”

Enviar una sola vez.

No usar este mensaje:

- en consultas normales ya resueltas;
- en pedidos finalizados;
- porque el cliente simplemente dejó de conversar después de un cierre natural.

## 32.2 Borrador

Mientras no haya confirmación final:

- no enviar al carnicero;
- no reservar stock definitivamente.

Si el cliente vuelve, retomar el contexto.

## 32.3 Al cierre

Si no responde antes del cierre, descartar el borrador.

No enviar más mensajes.

Al día siguiente, si vuelve, iniciar un pedido nuevo.

---

# 33. Audios — ITEM 37

Carnicom acepta audios.

Si entiende solo una parte:

- conservar lo entendido;
- preguntar únicamente por la parte faltante;
- no obligar a repetir todo.

Ejemplo:

> “Te entendí medio kilo de chorizo para las 19 hs, pero no llegué a entender bien el otro producto. ¿Cuál era?”

Si el audio es completamente ininteligible:

- pedir que lo envíe nuevamente o lo escriba.

Nunca completar por intuición un dato que no se escuchó bien.

---

# 34. Varios mensajes consecutivos — ITEM 38

Carnicom utiliza una **ventana de espera de 20 segundos desde el último mensaje**.

Cada nuevo mensaje reinicia el contador.

Después de 20 segundos sin nuevos mensajes:

1. agrupa el bloque;
2. interpreta todo junto;
3. relaciona cantidades, productos, correcciones, audios y horarios;
4. responde una sola vez cuando sea posible.

Ejemplo:

- “Quiero vacío”
- “2 kilos”
- “y 6 chorizos”
- “para hoy tipo 8”

Debe procesarse como una sola intención.

La ventana también aplica a combinaciones de texto + audio.

---

# 35. Cliente modifica mientras espera aprobación — ITEM 39

Si el pedido está pendiente de aprobación y el cliente agrega/cambia algo:

1. invalidar la versión anterior pendiente;
2. incorporar el cambio;
3. verificar stock;
4. generar un nuevo resumen;
5. pedir confirmación final al cliente;
6. enviar la nueva versión al carnicero.

La versión vieja debe quedar técnicamente imposibilitada de ser aprobada por error.

---

# 36. Rechazo del carnicero — ITEMS 40 y 41 redefinidos

El rechazo no significa necesariamente fin del pedido.

## 36.1 Motivo inicial

El bot puede presentar al carnicero:

1. Falta de tiempo
2. Falta de stock
3. Otro

## 36.2 Falta de tiempo

Carnicom presenta opciones al carnicero, por ejemplo:

1. Posponer 1 hora
2. Posponer 3 horas
3. Pasar para mañana

Carnicero responde, por ejemplo:

> 3

Carnicom toma esa decisión y conversa con el cliente:

- explica naturalmente que hoy no llegan;
- propone mañana;
- obtiene aceptación;
- actualiza el pedido;
- continúa el flujo.

## 36.3 Falta de stock

Carnicom enumera los productos del pedido.

Ejemplo interno:

> ¿De qué falta stock?
>
> 1. Vacío  
> 2. Chorizos  
> 3. Milanesas

Carnicero:

> 3 y 2

Entonces Carnicom:

1. interpreta que faltan milanesas y chorizos;
2. actualiza el stock de esos productos;
3. informa al cliente;
4. busca sustitutos autorizados;
5. pregunta el uso si hace falta;
6. dialoga con el cliente;
7. reconstruye el pedido;
8. vuelve a pedir confirmación final;
9. vuelve a aprobación si corresponde.

## 36.4 Otro motivo

Carnicom solicita al carnicero una indicación breve o presenta nuevas opciones.

Luego Carnicom transforma esa decisión en una conversación natural con el cliente.

## 36.5 No existe “toma manual del chat” en funcionamiento normal

La versión anterior que permitía al carnicero tomar el control queda **anulada**.

---

# 37. Stock agotado informado por el carnicero — ITEM 42

Si el carnicero confirma que un producto se terminó:

- actualizar stock a `0`;
- dejar de ofrecerlo;
- impedir nuevos pedidos de ese producto hasta reposición;
- aplicar alternativas cuando corresponda.

---

# 38. Reposición de stock — ITEM 43

Carnicom está constantemente vinculado al stock real cargado por el carnicero.

Cuando se repone:

- vuelve a estar disponible inmediatamente;
- Carnicom vuelve a poder ofrecerlo.

No contactar automáticamente a clientes anteriores solo porque volvió a entrar stock, salvo que exista una lógica activa de un pedido pendiente que lo justifique.

---

# 39. Stock parcial — ITEM 44

Si el cliente pide más cantidad de la disponible:

Ejemplo:

Cliente: “Quiero 3 kg de vacío.”  
Stock: 1,8 kg.

Carnicom debe:

1. informar cuánto hay;
2. ofrecer esa cantidad;
3. intentar completar el kilaje faltante con un sustituto autorizado;
4. consultar al cliente;
5. preguntar uso si hace falta;
6. nunca agregar el sustituto sin aprobación.

Ejemplo:

> “De vacío me quedan 1,8 kg. Si querés, te llevás esos y podemos completar lo que falta con otro corte parecido para la parrilla. ¿Te sirve?”

Objetivo: resolver la necesidad del cliente, no limitarse a decir “no hay”.

---

# 40. Recomendaciones y complementarios — ITEM 45

Máximo **una recomendación contextual por pedido**.

Debe ser útil y relacionada con la compra.

Ejemplos:

- asado → “¿Carbón tenés?”
- preparación al horno → condimento pertinente;
- milanesas → pan rallado/huevos si corresponde.

No repetir recomendaciones.

No vender por vender.

---

# 41. Pedidos grandes — ITEM 46

Todos los pedidos se tratan igual.

No crear:

- umbrales especiales;
- pedidos “grandes” con reglas distintas;
- límites artificiales;
- condicionantes innecesarios.

Si el carnicero no puede aceptarlo, utiliza el flujo normal de aprobación/rechazo.

La última palabra es del carnicero.

---

# 42. Atención fuera de horario — ITEM 47

Carnicom atiende **24/7**.

Fuera del horario del local:

- puede responder consultas;
- puede tomar pedidos futuros;
- puede consultar el stock registrado;
- no permite retiro en horarios cerrados;
- propone horarios válidos;
- registra pedidos pendientes.

Evitar molestar al carnicero fuera de su jornada con notificaciones no urgentes. Los pendientes pueden presentarse al inicio de la siguiente jornada.

---

# 43. Error técnico / caída — ITEM 48

Esta es la **única excepción** en la que el carnicero puede tomar contacto directo con el cliente.

Si la aplicación está caída o Carnicom tiene un error que impide seguir normalmente:

## Hacia el cliente

No decir:

- “se cayó el sistema”;
- “hay un error de API”;
- “el bot falló”;
- detalles técnicos.

Pedir que aguarde de manera natural.

Ejemplo:

> “Dame un momentito que estoy revisando eso y ya te sigo.”

## Hacia el carnicero

Enviar una alerta prioritaria indicando:

- conversación afectada;
- cliente;
- contexto disponible;
- pedido en curso si existe;
- último estado confiable.

El carnicero puede tomar directamente la conversación para no perder al cliente.

## Seguridad

Nunca confirmar acciones cuyo resultado técnico sea incierto.

---

# 44. Cliente enojado o agresivo — ITEM 49

Carnicom:

- nunca devuelve un insulto;
- nunca confronta;
- nunca provoca;
- mantiene vocabulario cordial;
- intenta identificar el motivo real del enojo;
- intenta resolver el problema.

Un insulto por sí solo **no habilita contacto directo del carnicero**.

---

# 45. Cierre natural de conversación — ITEM 50

Si una consulta quedó resuelta:

- despedida breve;
- no seguir haciendo preguntas innecesarias.

Si un pedido quedó confirmado:

- cerrar naturalmente;
- después solo queda el recordatorio de 1 hora, salvo que el cliente vuelva a escribir.

Si el cliente dice “gracias”, “listo”, “dale”:

- responder brevemente;
- no reiniciar venta;
- no ofrecer productos adicionales.

Variantes:

- “¡Dale, gracias a vos! 🙌”
- “¡Perfecto! Cualquier cosa escribinos.”
- “¡Listo! Gracias 🙌”

---

# 46. Reglas de catálogo ya definidas previamente

Estas reglas deben mantenerse porque afectan la comprensión del lenguaje del cliente.

## 46.1 Salame / salamín

Tratar “salame” y “salamín” como un único ítem práctico/sinónimos según catálogo.

## 46.2 Patas vs patitas

- “Patas” → patas reales del animal/pollo según contexto.
- “Patitas” → producto rebozado, típicamente infantil.

No confundir.

## 46.3 Pata-muslo vs cuarto trasero

**No son lo mismo.**

El cuarto trasero incluye además el “rancho”.

## 46.4 Rancho

Debe existir/reconocerse en catálogo.

## 46.5 “Tapa”

Si el cliente dice solamente:

> “Quiero tapa.”

Carnicom pregunta:

> “¿Qué tapa?”

No asumir tapa de asado, tapa de nalga, tapa de cuadril, etc.

## 46.6 Pechuga / suprema / bifes de pechuga

Agregar “bifes de pechuga”.

En el contexto operativo definido, pechuga/suprema pueden mapearse al mismo concepto práctico de pechuga sin hueso ni piel cuando corresponda, conservando sinónimos para reconocimiento.

## 46.7 Picada

Si el cliente pide picada y existen variantes, preguntar si quiere:

- común;
- especial.

## 46.8 Categorías relevantes

El catálogo contempla al menos:

- carne vacuna;
- pollo;
- cerdo;
- embutidos;
- elaborados/derivados;
- complementarios.

Complementarios definidos:

- carbón;
- sal parrillera;
- sal fina;
- sal gruesa;
- queso;
- especias;
- pan rallado;
- huevos;
- otros que el negocio cargue.

---

# 47. Cálculo orientativo por personas

Regla de referencia previamente definida:

- aproximadamente **0,5 kg por persona**;
- aproximadamente **0,35 kg por mujer**.

Cuando un cliente pide ayuda “para X personas”, Carnicom puede preguntar cuántos hombres y cuántas mujeres para estimar.

Esto es una recomendación orientativa, no una garantía exacta.

No repetir esta recomendación más de una vez en la compra.

---

# 48. Flujo completo de un pedido normal

## Paso 1 — Cliente inicia conversación

Texto o audio.

## Paso 2 — Carnicom interpreta intención

Utiliza contexto y ventana de 20 segundos si hay varios mensajes.

## Paso 3 — Construye pedido

Identifica:

- productos;
- cantidades;
- unidades/peso;
- fecha;
- hora aproximada de retiro;
- aclaraciones.

## Paso 4 — Resuelve faltantes de información

Pregunta solo lo necesario.

Si no entiende, pregunta.

## Paso 5 — Consulta stock real

Nunca trabaja con stock inventado.

## Paso 6 — Resuelve faltantes/stock parcial

Utiliza sustitutos autorizados y conversación con cliente.

## Paso 7 — Recomendación opcional

Máximo una recomendación contextual.

## Paso 8 — Resumen final obligatorio

El cliente confirma el pedido completo.

## Paso 9 — Envío al carnicero

El pedido queda pendiente de aprobación.

## Paso 10 — Carnicero decide

- aprobar;
- rechazar por tiempo;
- rechazar por stock;
- otro.

## Paso 11 — Si aprueba

Carnicom confirma al cliente.

Ejemplo base:

> “¡Listo! Tu pedido está confirmado 🙌 Te esperamos alrededor de las {hora} hs para retirarlo.”

## Paso 12 — Si rechaza

Carnicom consulta opciones al carnicero y vuelve a conversar con el cliente para intentar resolver.

## Paso 13 — Recordatorio

Una hora antes.

## Paso 14 — Retiro

Carnicero marca retirado.

## Paso 15 — Si queda sin actualizar al cierre

Carnicom consulta al carnicero:

- retirado;
- en espera.

## Paso 16 — En espera

Reservar stock un día más.

## Paso 17 — No-show

Solo al cierre del día adicional si continúa sin retirar.

---

# 49. Flujo de modificación de pedido confirmado

1. Cliente pide cambio.
2. Carnicom interpreta usando contexto.
3. Si es ambiguo, pregunta.
4. Registra cambio.
5. Notifica al carnicero.
6. Si afecta productos/stock, crea nueva versión.
7. Verifica stock.
8. Resuelve sustituciones si hace falta.
9. Presenta resumen actualizado.
10. Cliente confirma.
11. Nueva versión va al carnicero.
12. Versión anterior queda invalidada.
13. Carnicero aprueba/rechaza.
14. Carnicom informa resultado.

---

# 50. Flujo interno carnicero ↔ Carnicom

La interfaz interna debe priorizar velocidad.

## Ejemplo: rechazo

Carnicom:

> “¿Por qué no podés aprobar este pedido?
> 1. Falta de tiempo
> 2. Falta de stock
> 3. Otro”

Carnicero:

> “1”

Carnicom:

> “¿Qué opción podemos ofrecer?
> 1. +1 hora
> 2. +3 horas
> 3. Mañana”

Carnicero:

> “3”

Carnicom se ocupa del cliente.

## Ejemplo: stock

Carnicero:

> “2”

Carnicom:

> “¿De qué falta stock?
> 1. Vacío
> 2. Chorizos
> 3. Milanesas”

Carnicero:

> “2 y 3”

Carnicom:

- actualiza esos stocks a 0 cuando el carnicero está indicando que se terminaron;
- busca alternativas;
- conversa con el cliente;
- recompone el pedido.

---

# 51. Estados recomendados del pedido

La implementación técnica puede nombrarlos de otra forma, pero conceptualmente deben existir:

- `borrador`
- `pendiente_confirmacion_cliente`
- `pendiente_aprobacion_carnicero`
- `confirmado`
- `modificacion_pendiente`
- `cancelado`
- `retirado`
- `en_espera`
- `no_show`
- `vencido`

También debe existir versionado para impedir aprobar versiones antiguas.

---

# 52. Configuraciones del panel del carnicero

El panel debe permitir, directa o indirectamente, administrar al menos:

## Negocio

- horarios habituales;
- horarios especiales/cierres;
- dirección;
- medios de pago habilitados;
- promociones activas.

## Stock

Carnicom debe estar vinculado al stock real. La carga por audio es el método principal ya definido en la arquitectura previa, pudiendo existir controles de panel/CRM para visualizar o corregir valores.

## Productos

- catálogo;
- sinónimos;
- disponibilidad;
- pesos aproximados por unidad;
- sustitutos autorizados;
- complementarios.

## Pedidos

- pedidos de hoy;
- pedidos futuros;
- estado;
- historial;
- retiro;
- en espera;
- no-show;
- aprobación/rechazo.

---

# 53. Notificaciones al carnicero

Debe recibir notificación por:

- pedido nuevo listo para aprobación;
- modificación de cualquier pedido;
- pedido futuro relevante al iniciar el día;
- pedido sin estado final al cierre;
- cierre excepcional que afecta pedidos;
- consulta que necesita decisión humana;
- rechazo/flujo de resolución;
- error técnico grave;
- cualquier otro cambio relevante en un pedido.

Regla transversal:

> **Todo cambio de un pedido debe notificarse al carnicero.**

---

# 54. Mensajes base a conservar/pulir

## Pedido enviado a aprobación

> “¡Listo! Tu pedido quedó a confirmar. Apenas lo revisemos te aviso 🙌”

Evitar decir “por la carnicería” de una manera que haga parecer que el bot es un tercero separado.

## Aprobado

> “¡Listo! Tu pedido está confirmado 🙌 Te esperamos alrededor de las {hora} hs para retirarlo.”

## Recordatorio

> “🔔 Te recuerdo que tu pedido está para retirar alrededor de las {hora} hs. ¡Te esperamos!”

## Pedido incompleto, 1 hora

> “¿Te puedo ayudar con algo?”

## Delivery

> “Por el momento los pedidos son para retirar por el local.”

## Sin promociones

> “Por ahora no tenemos ninguna promo cargada.”

## Ambigüedad

Preguntar de forma específica, nunca genérica si puede evitarse.

Ejemplo:

> “Cuando decís ‘tapa’, ¿qué tapa querías?”

---

# 55. Contradicciones detectadas durante la revisión y resolución

Antes de cerrar este documento se revisaron las decisiones previas y se encontraron estos puntos que requerían consolidación:

## 55.1 Precio

Una definición anterior del proyecto contemplaba precio por kilo y consultas de precio. En esta etapa se decidió explícitamente:

**no informar precios por ahora.**

Esta decisión más reciente prevalece.

Por eso también se recomienda quitar “precios” del mensaje inicial mientras la función esté desactivada.

## 55.2 Contacto directo del carnicero

Durante la conversación se planteó que el carnicero podía tomar el chat ante rechazos o situaciones complejas.

Esa idea fue posteriormente reemplazada.

**Regla vigente:** el carnicero nunca habla directamente con el cliente en operación normal. Carnicom media todas las decisiones.

**Única excepción:** caída/error técnico que impida a Carnicom continuar.

## 55.3 No-show

Una versión inicial proponía marcar no-show directamente al cierre.

Fue reemplazada.

**Regla vigente:** al cierre primero se consulta al carnicero. Puede marcar retirado o en espera. Solo después del día adicional puede pasar a no-show.

## 55.4 Stock

El proyecto ya había definido carga de stock por audio como método principal. Durante esta etapa también se habló del panel y de que Carnicom está “constantemente linkeado” al stock real.

No son conceptos incompatibles:

- audio = método principal de carga/actualización;
- panel/CRM = visualización, control y corrección;
- Carnicom = consume siempre el stock real vigente.

## 55.5 Botones

La botonera para el cliente fue descartada.

Las opciones numeradas para el carnicero **no son una botonera de cliente**: son un mecanismo interno para acelerar decisiones. Pueden implementarse como números/respuestas rápidas sin alterar la experiencia conversacional del cliente.

---

# 56. Principios UX finales

Para cualquier decisión futura, priorizar:

1. **Simplicidad.**
2. **Poca fricción.**
3. **Conversación natural.**
4. **No imponer reglas innecesarias.**
5. **No hacer preguntas que ya pueden responderse por contexto.**
6. **Preguntar cuando exista duda real.**
7. **No inventar.**
8. **Mantener informado al carnicero sin obligarlo a conversar con el cliente.**
9. **Dar siempre la última palabra operativa al carnicero.**
10. **Resolver antes que rechazar.**
11. **No saturar al cliente con mensajes.**
12. **No evidenciar innecesariamente la automatización.**

---

# 57. Checklist de implementación / QA funcional

Antes de considerar esta etapa terminada, probar como mínimo:

- pedido simple por texto;
- pedido por audio;
- varios mensajes en menos de 20 segundos;
- corrección inmediata;
- frase ambigua;
- “tapa” sin especificar;
- stock suficiente;
- stock parcial;
- stock cero;
- sustituto con uso conocido;
- sustituto con uso desconocido;
- pedido con complementario;
- recomendación única;
- confirmación final;
- cliente corrige después del resumen;
- demora de aprobación >30 min;
- modificación mientras espera aprobación;
- versión vieja no aprobable;
- rechazo por falta de tiempo;
- rechazo por falta de stock;
- selección múltiple de productos agotados;
- stock actualizado a 0;
- reposición;
- pedido para mañana;
- múltiples pedidos en distintas fechas;
- cambio de hora;
- cambio de fecha;
- adelantar retiro;
- postergar retiro;
- cierre excepcional;
- cancelación;
- “sacame todo”;
- pedido retirado + nueva compra;
- borrador abandonado 1 hora;
- borrador abandonado hasta cierre;
- resumen diario de apertura;
- pedido sin actualizar al cierre;
- estado en espera;
- no-show al día siguiente;
- consulta de promoción con promo activa;
- consulta de promoción sin promo;
- consulta de medios de pago;
- consulta de horario;
- consulta de dirección;
- consulta de delivery;
- mensaje fuera de horario;
- cliente enojado/insultando;
- error técnico con handoff excepcional;
- conversación cerrada con “gracias”;
- verificar que no se informe precio;
- verificar que todo cambio notifique al carnicero.

---

# 58. Fuente de verdad

Este documento consolida las decisiones funcionales y de negocio discutidas para Carnicom hasta el 09/09/2026, incluyendo las reglas heredadas del catálogo y contexto previo que siguen vigentes.

Para implementación:

- no recuperar reglas descartadas de versiones anteriores;
- si aparece una contradicción, usar la sección 55 como guía;
- ante un caso no definido, aplicar los principios de la sección 56;
- si aun así existe ambigüedad de negocio, no inventar una regla nueva: consultarla antes de implementarla.

---

# 59. Regla maestra de Carnicom

> **Carnicom debe automatizar todo lo posible sin volverse rígido. Debe entender el contexto, conversar como la carnicería, consultar cuando no sabe, nunca suponer, nunca inventar, intentar resolver los problemas antes de rechazar un pedido y mantener siempre al carnicero informado y con la última palabra.**
