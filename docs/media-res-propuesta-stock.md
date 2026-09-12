> ⚠️ **SUPERADO el 12/09/2026 por `docs/media-res-diseno-final.md`.**
>
> Este documento es la propuesta v1. Se conserva porque explica el razonamiento original, pero el
> diseño que se construye es el del documento final, que sintetiza esta propuesta con otras dos
> hechas de forma independiente sobre el mismo pedido. Lo que cambió respecto de acá: los cinco
> pesos en vez de uno, el perfil versionado, los estados de confianza, la reserva de seguridad, el
> zero-out por piezas y la calibración a partir de las ventas.

# Stock por media res — propuesta de diseño

**Documento de propuesta para KILO — 10/09/2026**
**Se apoya en:** `docs/media-res-proceso-y-datos.md`

---

## La idea en una frase

En vez de que el stock sea una lista de kilos sueltos, que sea **el resultado de despostar una
media res**: entra una pieza grande de peso conocido, se abre en piezas más chicas, y lo que no
llega al mostrador queda registrado como merma con su causa. El carnicero carga una sola cosa —el
peso de la media res— y el sistema hace el resto.

---

## 1. El problema real, que no es el que parece

A primera vista el pedido es "una tabla de porcentajes". Pero la investigación dejó algo claro:
**hay una tabla de arranque razonable, y aun así no alcanza.**

> **Actualización del 10/09/2026.** Apareció la tabla del INAC de Uruguay que consiguió el
> fundador, y es mejor de lo esperado: está referida a una media res de novillo de **100 kg**, así
> que los kilos son porcentajes directos. Es la única tabla institucional de rendimiento por corte
> de la región. Cubre 20 cortes, tapa tres agujeros que teníamos, y —lo más importante— **coincide
> casi exactamente con nuestros datos derivados en cinco cortes** medidos por fuentes
> independientes. Está completa en la sección 3.0 del documento de investigación.
>
> Eso cambia el punto de partida, no la conclusión. Sigue haciendo falta el mecanismo que aprende:
> lo que el INAC da es un buen día uno, no la tabla de tu carnicería.

Tres razones por las que la tabla, sola, no alcanza:

1. **Ninguna fuente argentina la publica.** Ni el IPCVA, ni ARCA, ni ninguna fuente técnica. La del
   INAC es uruguaya, es de 2008, y usa nomenclatura de desposte uruguayo. Sirve de base; no es la
   realidad de una carnicería de Rosario en 2026.
2. **La variación es enorme y real.** El vacío va de 2,2 a 5 kg según la fuente. El asado, de 6 a
   13. No es imprecisión de los datos: es que las piezas realmente varían así.
3. **Cada carnicero desposta distinto.** Dónde corta la tapa de asado, cuánta grasa deja, si separa
   el corazón de cuadril o lo vende con el cuadril entero. Dos carniceros con la misma media res
   sacan tablas diferentes, y los dos tienen razón.

Hay una cuarta razón, que se ve mirando la tabla del INAC de cerca: **"vacío" ahí pesa 6,20 % y en
nuestros catálogos ~3,0 %, y ninguna de las dos está mal** — son cortes distintos con el mismo
nombre (uno con hueso y tres costillas, el otro no). O sea que ni siquiera se puede copiar una
tabla sin antes definir qué pieza es cada nombre. Esa definición la tiene que hacer el carnicero.

**Entonces la tabla no es el producto. El producto es el mecanismo que aprende la tabla de cada
carnicería.** Arrancamos con una tabla por defecto razonable, y cada desposte real la corrige.

Y hay algo mejor: ese mecanismo es exactamente lo que **ningún competidor tiene**. De los cuatro
sistemas argentinos relevados, ninguno modela el desposte. Todos tratan a la carnicería como un
kiosco con productos que se pesan.

---

## 2. Los cinco conceptos del modelo

### 2.1 La media res es un lote, no un ingreso de stock

Hoy, cargar stock es sumar kilos. Con este módulo, cargar una media res crea **una entidad con
identidad propia**: peso de entrada, categoría, proveedor, costo, fecha.

Eso es lo que después permite responder preguntas que hoy no se pueden ni formular:

- ¿Cuánto rindió *esta* media res?
- ¿Cuánto me costó realmente el kilo de vacío que vendí ayer?
- ¿Estoy despostando mejor o peor que el mes pasado?
- ¿Este proveedor me manda mejor mercadería que el otro?

### 2.2 El stock es por PIEZA, no por kilos sueltos

Este es el cambio conceptual más importante, y sale de algo que vos mismo señalaste: **cada media
res trae una sola pieza de cada corte.**

Hoy el stock dice "vacío: 3,2 kg". Eso puede significar una pieza entera de 3,2 kg, o el resto de
una pieza que ya se cortó por la mitad. Son situaciones **comercialmente muy distintas** y el
sistema no las distingue.

Con stock por pieza, cada una tiene su peso inicial y lo que le queda. Eso habilita cosas que hoy
son imposibles:

- **El bot puede contestar "¿tenés un vacío entero?"** con la verdad.
- **La merma de cada pieza es medible**: entró de 3,4 kg, se vendieron 2,9, se fueron 0,5 en
  recorte y grasa. Ese número, acumulado, *es* la tabla de rinde de esa carnicería.
- **Rotación natural**: se vende primero la pieza más vieja, sin que nadie lo piense.
- **Se sabe cuándo queda "la colita"**: los últimos 400 g de una pieza no se le ofrecen a alguien
  que pidió 2 kg.

### 2.3 La merma es un destino, no una diferencia

Hoy la merma es lo que sobra cuando las cuentas no cierran. En el modelo nuevo, **los kilos siempre
cierran**, porque cada kilo que entra tiene un destino explícito:

```
Peso de la media res = kilos vendidos
                     + kilos todavía en stock
                     + hueso
                     + grasa
                     + recortes (que van a picada)
                     + merma de conservación (goteo, oreo)
                     + ajuste sin explicar   ← este es el número que importa
```

Ese último renglón es el que hoy nadie mide y el que cuesta plata. Si da cero, el desposte está
controlado. Si da 6 kg, hay algo que averiguar.

### 2.4 El stock estimado se marca como estimado

Cuando el carnicero carga "una media res de 118 kg" y el sistema la explota por tabla, **ese stock
es una estimación, no una medición**. Sería contradictorio con la regla del proyecto —*nunca
inventar*— presentarlo como si fuera un dato duro.

La solución: cada pieza sabe de dónde viene su peso.

| Origen | Qué significa | Qué puede prometer el bot |
|---|---|---|
| **Pesada** | Alguien la puso en la balanza | Todo |
| **Estimada** | Salió de la tabla | Puede ofrecerla, pero no promete el último kilo |
| **Agotada** | El carnicero dijo que se terminó | Nada |

**Y acá hay algo lindo:** el sistema ya tiene la red de seguridad puesta. **El carnicero aprueba
cada pedido antes de que se confirme.** O sea que el bot puede trabajar con stock estimado sin
riesgo real: si la estimación estaba mal, el carnicero lo ve al aprobar y el flujo de rechazo por
falta de stock —que ya está implementado— lo resuelve solo. La aprobación humana es justamente lo
que hace seguro trabajar con aproximados.

### 2.5 La picada no es stock, es una transformación

Restricción legal, no de diseño: el Código Alimentario exige que la carne picada **se procese
frente al cliente**. No se puede tener "10 kg de picada" en stock.

Entonces se modela al revés: cuando se vende 1 kg de picada, **se consume 1 kg de recortes (o de
carnaza, o de paleta)** en ese momento. El carnicero elige de qué sale, porque eso cambia el costo.

Esto además abre el KPI más vendible de todo el producto, del que hablamos en la sección 5.

---

## 3. Cómo se carga el stock: tres caminos, un solo modelo

El punto es que el carnicero elija según el apuro, y que las tres opciones alimenten la misma
estructura.

### Camino A — "Entró una media res" (el rápido)

> 🎙️ *"Entró una media res de ciento dieciocho kilos, novillo"*

El sistema:
1. Crea el lote con esos 118 kg.
2. Genera las piezas esperadas según la tabla, escaladas al peso real.
3. Aparta el hueso y la grasa esperados.
4. Suma todo al stock, marcado como **estimado**.

**Un solo mensaje de voz y el stock queda cargado.** Es el momento en que el producto se gana al
carnicero.

### Camino B — "Pesé las piezas" (el preciso)

Mientras desposta, el carnicero va pesando y dictando:

> 🎙️ *"Vacío tres doscientos"* · *"Asado nueve y medio"* · *"Nalga cinco ochocientos"*

Cada peso dictado **reemplaza la estimación por el valor real** y marca la pieza como pesada. No
hace falta pesar todo: lo que se pese mejora, lo que no, queda estimado.

Esto es lo que va calibrando la tabla, sin que el carnicero sepa que la está calibrando.

### Camino C — Por corte suelto (el de hoy)

Sigue existiendo igual, para lo que no viene de una media res: achuras (que llegan por su propio
canal, dos veces por semana, de otro proveedor), pollo, cerdo, embutidos, complementarios.

---

## 4. La tabla: rangos, no valores fijos

Como pediste, la tabla no guarda un número sino un **rango con un valor típico**:

| Corte | Mínimo | Típico | Máximo | % s/ media res |
|---|---|---|---|---|
| Asado (costillar) | 6,0 | 9,5 | 13,0 | 7,9 % |
| Vacío | 2,2 | 3,6 | 5,0 | 3,0 % |
| Matambre | 1,0 | 1,6 | 2,2 | 1,3 % |
| … | | | | |

(La tabla completa, con fuentes por corte, está en el documento de investigación.)

**Para qué sirve cada columna:**

- El **típico** es lo que se carga al stock cuando se estima.
- El **rango** es lo que le dice al bot cuánta confianza tenerle. Si el típico es 3,6 kg pero el
  rango va de 2,2 a 5, el bot no debería comprometer 4,5 kg de vacío sin que alguien lo pese.
- El **porcentaje** es lo que permite escalar a medias reses de otro peso.

### Cómo se calibra sola

Cada vez que el carnicero pesa una pieza, el sistema guarda el par *(peso de la media res, peso
real de la pieza)*. Con unas pocas despostadas ya tiene el promedio real de esa carnicería, y a
partir de ahí **la estimación deja de ser un dato de internet y pasa a ser el promedio del propio
local**.

Propuesta concreta: mostrar el origen del número sin vueltas.

> Vacío — 3,4 kg estimado
> *Basado en tus últimas 6 medias reses (antes usábamos 3,6 de referencia general)*

Esa línea es, en sí misma, un argumento de venta: el sistema aprende del negocio.

### Los tres huecos de la tabla, dichos de frente

De la investigación quedaron datos que **no encontramos y no vamos a inventar**:

- **Pecho, brazuelo y chingolo**: no hay peso publicado en ninguna fuente argentina.
- **Carnaza de paleta**: dos fuentes dicen 2,5 kg y 10,5 kg. Sin resolver.
- **Variación por categoría** (ternera / novillito / novillo / vaca): ninguna fuente publica el
  mismo corte para distintas categorías.

Para esos tres casos la propuesta es la misma: **cargar la tabla como incompleta y que el sistema
lo diga**. La primera vez que el carnicero desposte, le pregunta el peso de esas piezas y aprende.
Es más honesto y, en la práctica, más rápido que discutir un número inventado.

---

## 5. Lo que esto habilita (y que hoy es invisible)

### 5.1 El costo real por kilo

Hoy el carnicero sabe cuánto pagó la media res. No sabe cuánto le cuesta el kilo de vacío que
vende. Con el lote cerrado, la cuenta sale sola:

```
Costo real por kg vendible = (costo de la media res − recupero de hueso y grasa)
                             ÷ kilos efectivamente vendibles
```

Con el rinde real de esa carnicería, no con el 76 % de FADA.

### 5.2 El rinde por media res, y por proveedor

Un tablero con una sola línea por media res: peso, kilos vendidos, merma, rinde. Tres o cuatro
medias reses después, se ve solo si un proveedor manda peor mercadería que otro. **Ese dato hoy no
existe en ninguna carnicería.**

### 5.3 Los kilos degradados a picada — el número que vale plata

De la investigación: **7,5 kg por animal terminan picados por no haberse vendido como pieza**, con
una diferencia de valor de $300-400 por kilo. Son **$2.400 por animal**.

Eso **no es merma ni robo**: los kilos siguen ahí. Es una pérdida que ningún sistema convencional
detecta, porque no falta nada — solo vale menos.

Con stock por pieza es **directamente medible**: una pieza que entró como corte entero y salió como
picada. El sistema puede avisar antes de que pase:

> ⚠️ La tapa de asado lleva 3 días. Si no sale hoy, se va a picada y perdés ~$X.

**Ese aviso, solo, puede justificar la suscripción.**

### 5.4 El descuadre con causa

Hoy, si comprás 100 kg y vendés 70, no sabés si el rinde fue malo o si faltan 6 kg. Con los
destinos explícitos, la pregunta se vuelve contestable — y cuando el renglón "sin explicar" da
distinto de cero, hay algo concreto que mirar.

---

## 6. Cómo se ve para el carnicero

El principio que ordena todo: **el carnicero está con las manos ocupadas y frío.** Todo tiene que
poder hacerse hablando, y lo que no, en dos toques.

### Cargar la media res

> 🎙️ *"Entró una media res de ciento dieciocho kilos"*
>
> 🤖 Anotado: media res de 118 kg. Te cargué al stock 24 cortes estimados.
> ¿La cargo como novillo, que es lo que venís trayendo?
>
> 🎙️ *"Sí"*
>
> 🤖 Listo 👍 Cuando vayas despostando, si me vas diciendo los pesos afino las cuentas.

### Ir pesando mientras desposta

> 🎙️ *"Vacío tres doscientos, asado nueve y medio, matambre uno ocho"*
>
> 🤖 Anotado. Te quedan 21 piezas sin pesar.

### Cerrar la media res

Cuando ya no queda nada, el sistema muestra el resumen — y este es el momento en que el carnicero
ve algo que nunca vio:

> **Media res del 8/9 — 118 kg**
> Vendido: 84,2 kg · Hueso y grasa: 27,5 kg · Recortes a picada: 5,1 kg
> **Sin explicar: 1,2 kg**
> **Rinde: 71,4 %** — tu promedio es 73,1 %

### En el panel

- **Stock**: piezas con kg restantes y un indicador de si el peso es real o estimado.
- **Medias reses**: la lista de lotes con su rinde. Una línea por lote.
- **Alertas**: piezas que llevan mucho tiempo, rinde por debajo del promedio, descuadres.

---

## 7. Qué cambia para el bot

El módulo de stock no vive aparte: **le da al bot información que hoy no tiene.**

1. **Puede contestar por pieza.** "¿Tenés un vacío entero?" pasa a ser respondible. Hoy no lo es.
2. **Sabe cuándo no comprometerse.** Con stock estimado y una pieza cerca del límite del rango,
   corresponde ofrecer con cuidado en vez de prometer — que es exactamente lo que pide la sección
   1.3 de la especificación del bot.
3. **Los sustitutos se vuelven más inteligentes.** Si queda una punta de nalga de 600 g y alguien
   pide 2 kg, el bot puede ofrecer completar con otra pieza autorizada.
4. **El aviso de degradación se puede convertir en venta.** Si una tapa de asado está por pasarse,
   el bot tiene a quién ofrecérsela: ya sabe quién compra ese corte.

---

## 8. Plan por etapas

Cada etapa se puede usar sola. Ninguna obliga a la siguiente.

### Etapa 1 — El lote y las piezas *(la base)*
Tabla de rangos cargada · carga por media res que explota en piezas · stock por pieza con kg
restantes · hueso, grasa y recortes como destinos · resumen al cerrar el lote.
**Se puede usar desde el día uno y ya muestra el rinde real.**

### Etapa 2 — Que aprenda
Pesaje por voz durante el desposte · calibración automática de la tabla por carnicería ·
comparación contra el promedio propio.

### Etapa 3 — La plata
Costo real por kilo · recupero de hueso y grasa · rinde por proveedor · margen real por corte.

### Etapa 4 — Que avise
Alertas de piezas que se van a degradar · sugerencia de precio según el rinde real · integración
con el bot para colocar lo que está por pasarse.

### Etapa 5 — Lo que saca fricción de verdad
Lectura del **Remito Electrónico Cárnico** para precargar la entrada sin escribir nada · balanza
Kretz.

**Sobre la etapa 5:** el REC es obligatorio desde 2019 y ARCA tiene un endpoint de vinculación
remito-factura. Si el sistema lee el REC y precarga peso, proveedor y tropa, se elimina la carga
manual, que es la razón número uno por la que los sistemas de stock se abandonan a las tres
semanas. Y la integración con balanza Kretz no es un extra: los dos competidores argentinos serios
ya la tienen, es requisito de entrada.

---

## 9. Bocetos del modelo de datos

No para implementar ahora, sino para que se vea que cierra:

```
medias_reses
  id · carniceria_id · fecha · categoria (ternera|novillito|novillo|vaca)
  peso_entrada_kg · proveedor · costo_total · remito_rec
  estado (abierta|cerrada) · rinde_real · cerrada_at

piezas_stock
  id · carniceria_id · producto_id · media_res_id (nullable)
  kg_iniciales · kg_restantes
  origen_peso (pesada|estimada) · estado (disponible|agotada|degradada)
  ingresada_at

movimientos_stock
  id · pieza_id · tipo (venta|merma_hueso|merma_grasa|recorte|
                        conservacion|degradada_a_picada|ajuste)
  kg · motivo · pedido_id (nullable) · created_at

tabla_rendimiento            ← la de referencia, por carnicería
  carniceria_id · producto_id
  kg_min · kg_tipico · kg_max · porcentaje_media_res
  origen (referencia|calibrada) · muestras · actualizada_at
```

Dos decisiones que vale la pena señalar:

- **`media_res_id` es opcional** en las piezas: así entra lo que no viene de una media res (achuras,
  pollo, cerdo) por la misma puerta, sin un modelo paralelo.
- **`movimientos_stock` con `tipo`** es lo que hace que los kilos cierren siempre. Cada kilo que
  sale tiene una causa. Sin eso, volvemos a "la merma es lo que sobra".

Y una advertencia de la investigación: **si el troceo obligatorio vuelve** (el debate se reabrió en
2024), el flujo cambia a "llegan cortes ya despostados". Por eso conviene que la entrada sea
genérica —*una pieza de N kg que se transforma en M piezas*— y no esté casada con el concepto
"media res". El modelo de arriba ya lo contempla.

---

## 10. Lo que necesito que decidas

Cinco cosas que no puedo resolver solo, porque son de negocio:

1. **¿El carnicero desposta toda la media res de una, o de a partes?** Cambia si el lote se abre
   completo o progresivamente.
2. **¿Querés que el hueso y la grasa se puedan vender desde el sistema**, o alcanza con registrarlos
   como salida? (Los seberos pagan, y hoy eso no queda registrado en ningún lado.)
3. **¿Cuántas categorías de animal maneja tu carnicería piloto?** Si es siempre novillo, arrancamos
   con una sola tabla y nos ahorramos la mitad del trabajo.
4. **¿Entra en el alcance el costo y el precio, o por ahora solo kilos?** El módulo funciona sin
   plata, pero la mitad del valor está ahí.
5. **La verificación con el carnicero piloto.** Antes de cargar la tabla por defecto, conviene
   sentarse con él y revisar los rangos corte por corte. Es media hora suya y vale más que toda
   esta investigación junta: él sabe lo que a nosotros nos falta.

---

## Anexo — la tabla de arranque

**Resuelto el 10/09/2026:** la tabla del INAC ya está incorporada. La tabla de referencia con la
que arranca el sistema se arma así, y conviene que quede escrito de dónde sale cada número:

| Origen | Qué aporta | Cuántos cortes |
|---|---|---|
| **INAC Uruguay (2008)** | Porcentajes directos sobre media res de 100 kg | 20 |
| **Catálogos argentinos** | Los cortes que el INAC no lista: matambre, entraña, colita de cuadril, bife ancho, tapa de asado, bola de lomo, palomita, osobuco | ~8 |
| **El carnicero piloto** | Corrige los dos anteriores y define qué pieza es cada nombre | todos |
| **Cada desposte real** | Reemplaza la referencia por la tabla propia de esa carnicería | todos, con el uso |

Las primeras dos filas se pueden cargar ya. La tercera es la media hora con el carnicero que pide
la decisión 5. La cuarta es el producto.
