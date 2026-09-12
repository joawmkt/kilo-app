# Stock por media res — diseño final

**KILO · 12/09/2026 — decisiones tomadas, listo para construir**
**Reemplaza a:** `docs/media-res-propuesta-stock.md` (propuesta v1, 10/09/2026)
**Se apoya en:** `docs/media-res-proceso-y-datos.md` (los datos y las fuentes)

> **Estado:** las tres decisiones que cambiaban el diseño están tomadas (sección 9). El perfil
> semilla de la sección 5 está calculado y se puede cargar. Lo único que falta antes de construir la
> Etapa 1 es media hora con el carnicero piloto para resolver cinco solapamientos de nombres.

Este documento sintetiza tres propuestas independientes hechas sobre el mismo pedido:

| | Origen | Fortaleza |
|---|---|---|
| **v1** | KILO (10/09) | El stock por pieza y el rol del paso de aprobación del carnicero |
| **Doc B** | *Carga de stock por media res* | Rigor operativo, contable y regulatorio. El mejor de los tres |
| **Doc C** | *Análisis Integral de Rinde* | Dos mecanismos muy buenos, envueltos en una tabla que no cierra |

---

## Veredicto en una página

**Lo que adopto de cada uno, y por qué:**

1. **Los cinco pesos, no uno** *(doc B)*. Facturado, recibido, pre-desposte, salidas, vendido. La
   diferencia entre **facturado y recibido es plata**: es la única forma de detectar que el
   frigorífico factura más kilos de los que entrega.
2. **Perfil de desposte versionado y con vigencia** *(doc B)*, no una tabla suelta. Un lote
   despostado en marzo tiene que seguir explicándose con el perfil de marzo.
3. **Estados de confianza** *(doc B)*: estimado, pesado, contado, reservado, vendido, ajustado.
   Más rico que mi binario "estimada/pesada" de la v1.
4. **Reserva de seguridad sobre lo estimado** *(doc B)*, que se achica sola a medida que el dato
   se vuelve pesado. Mi v1 confiaba solo en el paso de aprobación del carnicero; esto es mejor.
5. **Perfil semilla que cierra al 100 %** *(doc B)*, con una bolsa explícita de "otros y recortes".
   Es lo que permite arrancar sin mentir sobre lo que no sabemos.
6. **Zero-out por piezas** *(doc C)*. **El mejor aporte de los tres documentos** y lo explico
   aparte más abajo, porque resuelve el problema que ni la v1 ni el doc B resolvían bien.
7. **Grupos de uso para sustituir** *(doc C)*: parrilla, milanesas, guiso, minutas. Encaja con la
   tabla `sustitutos_autorizados` que ya tenemos.
8. **Cierre de desposte en tres niveles** *(doc B)*: rápido, clave o completo.
9. **Mediana y P10–P90, no promedio** *(doc B)*. La mediana aguanta el desposte raro; el promedio no.
10. **El paso de aprobación del carnicero como red de seguridad** *(v1)*, que ninguno de los otros
    dos conoce porque no sabían que KILO ya lo tiene.

**Lo que descarto, y por qué:**

- **La tabla de porcentajes del doc C.** No cierra. Está el detalle abajo.
- **"Cada media res tiene una pieza de cada corte" como modelo de inventario** *(doc C lo pone como
  "regla fundamental"; mi v1 también lo daba por bueno)*. El doc B lo refuta bien y tiene razón.
- **Costeo y margen en el alcance inicial** *(docs B y C)*. La sección 13 de la especificación del
  bot dice que KILO no informa precios. El modelo de datos no lo tiene que impedir, pero no se
  construye ahora.
- **El 75 % de vendible del perfil semilla del doc B.** El propio documento lo marca como "punto
  inicial alto". Ver la decisión sobre esto más abajo.

---

## 1. El problema aritmético del doc C

Vale la pena mostrarlo con números, porque es la diferencia entre una tabla que se puede cargar y
una que no.

Los 13 cortes que lista suman **67,9 %** del peso de la media res. Pero el mismo documento dice que
la carne limpia vendible es **65 % – 72 %**. O sea: **con 13 cortes ya se comió todo el presupuesto**,
y quedan 4,1 puntos para entraña, falda, pecho, cogote, brazuelo, chingolo, tortuguita, marucha,
palomita, tapa de asado, recortes y picada. No entra.

Localicé de dónde viene la mayor parte del desvío, y son dos filas:

| Fila del doc C | Dice | Contraste | Probable |
|---|---|---|---|
| Bife ancho / angosto | **11,8 %** | INAC da bife angosto 3,30 %; los catálogos dan bife ancho ~2,5 % | ~6 % |
| Osobuco (del. + tras.) | **6,8 %** | INAC da garrón 1,50 %; con hueso de los dos cuartos, ~3,5 % | ~3,5 % |

Corrigiendo solo esas dos, los 13 cortes bajan a **58,8 %**. Sumando ~10 % de los cortes que no
lista, da **~69 % vendible**, que cae justo dentro de su propio rango de 65-72 %. **Cierra.**

O sea que el doc C no está equivocado en su modelo: tiene dos números mal. **Su valor está en los
mecanismos, no en la tabla.** Y eso deja algo importante en claro para nosotros: cualquier tabla
que carguemos tiene que pasar un control automático de que la suma cierre, porque a ojo no se ve.

## 2. Por qué NO se puede armar la tabla sumando INAC + catálogos argentinos

Es la trampa en la que casi caigo yo. Los 20 cortes del INAC suman 66,65 %. A esa lista le faltan
matambre, entraña, colita de cuadril, bife ancho, tapa de asado, bola de lomo y palomita, que según
los catálogos argentinos suman otro ~12,5 %. Sumar da **79 % vendible**, por encima de todo lo que
dice cualquier fuente.

No es que las fuentes se contradigan: es que **las definiciones se solapan**. El "Asado 9,85 %" del
INAC probablemente ya incluye la tapa de asado. El "Vacío con hueso, 3 costillas, 6,20 %" pisa la
zona del matambre. Sumar dos tablas con líneas de corte distintas cuenta los mismos kilos dos veces.

**La solución del doc B es la correcta, aunque él no lo diga así:** tomar los 66,65 % del INAC tal
cual, y meter TODO lo demás en una sola bolsa de "otros cortes y recortes vendibles". La bolsa no es
pereza — **es lo que impide contar dos veces.** Y se va desarmando sola a medida que el carnicero
pesa piezas de verdad.

---

## 3. La idea que ninguno de los tres tenía: calibrar sin ritual

Acá está la parte superadora, y sale de cruzar el mecanismo del doc C con el objetivo del doc B.

**El problema.** El doc B propone un "cierre de desposte": después de despostar, el carnicero pesa
los cortes clave y los totales. Es correcto, y es trabajo extra. Todo sistema de stock que depende
de una tarea administrativa diaria se abandona a las tres semanas — el propio doc B lo reconoce
cuando propone el modo "rápido".

**El mecanismo del doc C.** Cada corte lleva, además de kilos, un contador de **piezas**. Cuando se
vende la última pieza, el sistema pone los kilos en cero automáticamente ("zero-out"), en vez de
quedar arrastrando 400 gramos fantasma que nadie tiene.

**El cruce.** Si llevamos el contador de piezas, entonces **cuando se agota una pieza sabemos
exactamente cuántos kilos salieron de ella**. Y esa diferencia contra lo que el perfil había
estimado *es una medición*, obtenida sin pedirle nada a nadie:

> El perfil estimó que el peceto de esta media res pesaba 1,70 kg.
> Se vendió en tres veces: 0,60 + 0,55 + 0,72 = **1,87 kg**, y ahí se acabó la pieza.
> → El peceto de este proveedor rinde ~10 % más que la referencia. Anotado.
> **Nadie pesó nada de más. Era la balanza del mostrador, que ya estaba pesando igual.**

Con esto, el "cierre de desposte" del doc B pasa de ser **obligatorio** a ser **un acelerador
opcional**: si el carnicero quiere calibrar más rápido, pesa; si no quiere, el sistema aprende igual,
más despacio, de las ventas que ya hace.

**Lo único que hace falta para que funcione** es capturar el peso real al entregar el pedido, en vez
de descontar el peso pedido. El doc B ya lo pide por otra razón ("reconocer ingreso y costo con el
peso final, no con el peso reservado"). Se junta con el botón de "Avisar que está listo" que
acabamos de hacer: al marcar el pedido como retirado, se pide el peso real — **opcional**, y si no
lo cargan se usa el estimado.

> **Nota honesta.** Esto funciona bien para cortes que se venden en pocas tajadas grandes (peceto,
> lomo, cuadril, matambre). Funciona peor para el asado o la picada, que salen en muchas ventas
> chicas de varios lotes mezclados. Para esos, el cierre por totales del doc B sigue siendo la única
> forma. **No reemplaza al cierre: lo hace opcional para la mitad del catálogo.**

---

## 4. El modelo, en siete decisiones

### 4.1 La entrada es una transformación, no una suma

Cargar una media res no suma kilos: **consume** una pieza grande de peso conocido y **produce**
cortes, recortes, hueso, grasa y merma. El balance tiene que cerrar contra el peso pre-desposte.

Esto es de los tres documentos y no está en discusión. Es lo que hace que los kilos nunca se pierdan
sin explicación.

### 4.2 El kilo es la unidad; la pieza es un contador paralelo

El doc B tiene razón contra el doc C y contra mi v1: una pieza se convierte en muchas milanesas, un
producto del catálogo puede agrupar varios músculos, y la picada nace de recortes. **El kilo manda.**

Pero la pieza se guarda igual, porque es lo que habilita el zero-out y la calibración de la sección
3. **La pieza no es la unidad de stock: es el testigo de cuándo se terminó.**

### 4.3 Tres números distintos, no uno

| Número | Qué es | Quién lo usa |
|---|---|---|
| **Físico** | Lo que hay en la cámara | El carnicero |
| **Disponible** | Físico − reservas − reserva de seguridad | El bot, para ofrecer |
| **Valuado** | Costo del lote sin repartir | La contabilidad, más adelante |

Que el bot ofrezca el disponible y no el físico es lo que cumple la sección 1.3 de la especificación
("nunca inventar") cuando el dato todavía es estimado.

### 4.4 La confianza es un atributo del saldo

Seis estados, del doc B: **estimado · pesado · contado · reservado · vendido · ajustado**.

La regla de oro: **un peso real reemplaza al estimado del mismo alcance, nunca se suma.** Es el error
clásico que duplica stock, y el criterio de aceptación que hay que probar sí o sí.

### 4.5 La reserva de seguridad se achica sola

El doc B propone 15 % fijo sobre lo estimado. Lo tomo, con una corrección: **la reserva es función de
la confianza, no una constante.**

| Confianza del saldo | Reserva | Por qué |
|---|---|---|
| Estimado, perfil sin calibrar | 15 % | No sabemos nada todavía |
| Estimado, perfil calibrado | 8 % | Ya tenemos historia de esta carnicería |
| Pesado | 0 % | Lo pesó él |

Fijarla en 15 % para siempre sería castigar al carnicero que sí carga datos: vería menos stock del
que tiene y perdería ventas. La reserva tiene que ser el precio de la incertidumbre, y bajar cuando
la incertidumbre baja.

**Y acá KILO tiene una ventaja que los otros dos documentos no sabían que existía:** el carnicero
aprueba cada pedido antes de confirmarlo. El stock estimado nunca llega solo al cliente — siempre
pasa por los ojos de alguien que está mirando la mercadería. Por eso podemos permitirnos una reserva
más chica que un sistema sin esa red.

### 4.6 El perfil está versionado y segmentado, pero no desde el día uno

Versión y fecha de vigencia, del doc B. Y su orden de segmentación, que es el correcto:
**frigorífico → categoría → banda de peso → estilo de desposte.**

Pero **se arranca con UN perfil por carnicería** y se parte solo cuando los datos muestren
diferencias que se repitan. Diez perfiles desde el día uno es diez veces menos datos por perfil, y
ninguno llega a calibrar.

### 4.7 La merma es un destino con causa, no un residuo

De mi v1 y del doc B. Cada kilo que sale tiene una causa: venta, hueso, grasa, recorte a picada,
conservación, degradado, ajuste. **Sin esto, "la merma es lo que sobra" y desaparece el único KPI que
le devuelve plata al carnicero** — los 7,5 kg por animal que se degradan a picada, $2.400 por animal
(sección 6.3 del documento de investigación).

---

## 5. El perfil semilla, ya cargable

**Decisión del fundador (12/09/2026): vendible de arranque = 70 %.**

### 5.1 La forma y la escala son dos cosas distintas

Esta es la idea que destraba el problema del capítulo 2. Los porcentajes del INAC son muy buenos
para una cosa y malos para otra:

- **La FORMA** —qué proporción tiene cada corte respecto de los otros— es dato de fuente, y las
  cinco coincidencias con los catálogos argentinos dicen que es confiable.
- **La ESCALA** —cuánto suma el total vendible— es lo que ninguna fuente resuelve: 68 %, 75 %,
  65-72 % según a quién le preguntes.

Entonces: **la forma la pone el INAC, la escala la ponés vos.** Se multiplica la forma por el factor
que hace que el total dé 70 %, y listo. Si mañana el piloto demuestra que el vendible real es 73 %,
se cambia un número y toda la tabla se reescala sola — no hay que volver a investigar nada.

A los 20 cortes del INAC le agrego **bola de lomo**, que es el único corte que los carniceros
argentinos venden todos los días y que el INAC no lista por ninguna parte (los otros que parecían
faltar están adentro de cortes del INAC — ver 5.3). Forma = 70,15 %; escala = ×0,9123.

### 5.2 Perfil NOVILLO v1 — semilla

| Corte | Forma (INAC) | **Semilla %** | P10 | P90 | En una media res de 110 kg |
|---|---|---|---|---|---|
| Asado | 9,85 | **8,99** | 6,74 | 11,23 | 9,9 kg |
| Vacío con hueso (3 costillas) | 6,20 | **5,66** | 4,24 | 7,07 | 6,2 kg |
| Nalga | 6,10 | **5,57** | 4,17 | 6,96 | 6,1 kg |
| Cogote sin hueso | 4,70 | **4,29** | 3,43 | 5,15 | 4,7 kg |
| Cuadril | 3,90 | **3,56** | 2,85 | 4,27 | 3,9 kg |
| Costilla redonda sin hueso | 3,60 | **3,28** | 2,63 | 3,94 | 3,6 kg |
| Cuadrada | 3,60 | **3,28** | 2,63 | 3,94 | 3,6 kg |
| **Bola de lomo** *(agregado)* | 3,50 | **3,19** | 2,55 | 3,83 | 3,5 kg |
| Aguja 1ª sin hueso | 3,40 | **3,10** | 2,48 | 3,72 | 3,4 kg |
| Pecho sin hueso | 3,40 | **3,10** | 2,48 | 3,72 | 3,4 kg |
| Pulpa de paleta sin hueso | 3,30 | **3,01** | 2,41 | 3,61 | 3,3 kg |
| Bife angosto | 3,30 | **3,01** | 2,41 | 3,61 | 3,3 kg |
| Brazuelo | 2,80 | **2,55** | 2,04 | 3,07 | 2,8 kg |
| Falda con hueso | 2,50 | **2,28** | 1,82 | 2,74 | 2,5 kg |
| Lomo | 1,70 | **1,55** | 1,32 | 1,78 | 1,7 kg |
| Peceto | 1,70 | **1,55** | 1,32 | 1,78 | 1,7 kg |
| Tortuguita | 1,60 | **1,46** | 1,24 | 1,68 | 1,6 kg |
| Garrón / osobuco | 1,50 | **1,37** | 1,16 | 1,57 | 1,5 kg |
| Marucha sin hueso | 1,40 | **1,28** | 1,09 | 1,47 | 1,4 kg |
| Tapa de cuadril (picaña) | 1,30 | **1,19** | 1,01 | 1,36 | 1,3 kg |
| Chingolo (lomillo) | 0,80 | **0,73** | 0,62 | 0,84 | 0,8 kg |

| Cierre del perfil | % | |
|---|---|---|
| 21 cortes nombrados | **64,00** | Estimado por corte |
| Otros cortes y recortes vendibles | **6,00** | Bolsa que se desarma al aprender |
| **Vendible** | **70,00** | ← la decisión |
| Hueso | **18,00** | Subproducto |
| Grasa recuperable | **8,00** | Subproducto |
| Merma de frío y proceso | **4,00** | No vendible, con causa |
| **TOTAL** | **100,00** | ✅ cierra |

Las bandas P10–P90 usan el criterio del doc B: ±15 % en piezas anatómicamente estables (las chicas),
±20 % en las medianas, ±25 % en las grandes y compuestas. **Son una construcción operativa, no
intervalos publicados**, y se reemplazan por percentiles observados apenas haya 10 despostes.

### 5.3 Los solapamientos que tiene que resolver el carnicero

No agregué matambre, entraña, colita de cuadril, bife ancho, tapa de asado ni palomita porque **casi
con seguridad ya están adentro de cortes del INAC**, y sumarlos contaría los mismos kilos dos veces:

| Corte argentino | Probablemente está adentro de | A confirmar |
|---|---|---|
| Tapa de asado | Asado (9,85) | ¿Lo separa o lo vende con el asado? |
| Matambre y entraña | Vacío con hueso / Falda con hueso | ¿Dónde corta el vacío? |
| Colita de cuadril | Cuadril (3,90) | ¿La separa? |
| Bife ancho / ojo de bife | Costilla redonda sin hueso (3,60) | ¿Es el mismo corte? |
| Palomita | Pulpa de paleta / Brazuelo | ¿La separa? |

**Cada "sí, lo separo" parte una fila en dos, no agrega una fila nueva.** Esa es la regla, y es lo
que mantiene el cierre al 100 %.

### 5.4 Perfil VACA v1 — hipótesis declarada

**Decisión del fundador: la carnicería piloto maneja novillo y vaca.** Son dos perfiles.

La vaca no es un novillo más chico: tiene más grasa de cobertura y menos pulpa. **No encontré ni una
sola fuente que publique el rendimiento por corte de vaca**, así que el perfil arranca como la misma
forma del novillo con otra escala, **marcado explícitamente como hipótesis**:

| | Novillo | Vaca *(hipótesis)* |
|---|---|---|
| Vendible | 70,00 % | **67,00 %** |
| Hueso | 18,00 % | 18,00 % |
| Grasa | 8,00 % | **11,00 %** |
| Merma | 4,00 % | 4,00 % |

Que sea una hipótesis no es un problema **siempre que el sistema lo diga**: el saldo nace con
confianza "estimado", la reserva de seguridad es del 15 %, y el carnicero aprueba cada pedido. Las
primeras 10 vacas lo corrigen. Lo que sí sería un problema es presentarlo como si fuera dato.

### 5.5 El control de cierre es obligatorio en el código

Ningún perfil se guarda si no suma 100 %, y ningún perfil admite dos cortes solapados. **Es lo que
habría atajado el error del doc C antes de que llegara a un documento** — 67,9 % en 13 filas no se
ve a ojo, pero una suma lo canta al instante.

---

## 6. Modelo de datos

Evolución del boceto de la v1, con lo que aportaron los dos documentos:

```
recepciones_lote          ← NUEVO (doc B): los cinco pesos viven acá
  id · carniceria_id · proveedor · remito_rec · factura
  peso_facturado_kg · peso_recibido_kg · peso_predesposte_kg
  temperatura_recepcion · estado (aceptado|observado|rechazado)
  categoria · costo_total · fecha

perfiles_desposte         ← NUEVO (doc B): versionado, no una tabla suelta
  id · carniceria_id · proveedor · categoria · banda_peso
  version · vigente_desde · vigente_hasta

rendimientos_perfil
  perfil_id · producto_id
  pct_central · pct_p10 · pct_p90
  origen (referencia|calibrado) · muestras

eventos_desposte
  id · recepcion_lote_id · perfil_id · operador · fecha
  nivel_cierre (ninguno|rapido|clave|completo)

piezas_stock              ← de la v1, con el contador del doc C
  id · carniceria_id · producto_id · recepcion_lote_id (nullable)
  kg_estimados · kg_pesados (nullable) · kg_restantes
  piezas_totales · piezas_restantes       ← habilita el zero-out
  confianza (estimado|pesado|contado)
  estado (disponible|agotada|degradada) · ingresada_at

movimientos_stock
  id · pieza_id · tipo (entrada|transforma_consume|transforma_produce|
                        reserva|libera|venta|merma_hueso|merma_grasa|
                        recorte_picada|degradada|ajuste_conteo|devolucion)
  kg · piezas · causa · pedido_id (nullable) · created_at
```

Dos cosas a señalar:

- **`recepcion_lote_id` es opcional** en las piezas. Así entra por la misma puerta lo que no viene de
  una media res (achuras, pollo, cerdo, una caja de 10 kg de nalga) sin un modelo paralelo.
- **`piezas_totales` / `piezas_restantes`** es lo único que agrega el doc C al modelo, y es lo que
  hace posible todo lo de la sección 3.

Y una advertencia que viene del documento de investigación: **si el troceo obligatorio vuelve** (el
debate se reabrió en 2024), llegan cortes ya despostados. Por eso la entrada es genérica —*una pieza
de N kg que se transforma en M piezas*— y no está casada con el concepto "media res".

---

## 7. Plan por etapas

Cada etapa sirve sola. Ninguna obliga a la siguiente.

| Etapa | Qué trae | Criterio de que está lista |
|---|---|---|
| **1 · El lote** | Recepción con los cinco pesos · perfil semilla · explosión en piezas · hueso/grasa/recortes como destinos · cierre de lote | Una media res se carga por voz en menos de un minuto y el balance cierra |
| **2 · Que aprenda sin pedir nada** | Contador de piezas · zero-out · peso real opcional al retirar · calibración desde las ventas | Un peso real reemplaza al estimado sin duplicar stock |
| **3 · Que aprenda más rápido** | Cierre de desposte rápido/clave/completo · mediana y P10–P90 · perfil v1 por segmento | Error de pronóstico por corte medido y bajando |
| **4 · Que avise** | Alertas de degradación · FEFO · sobreventa · desbalance con causa | El KPI de kilos degradados a picada es visible |
| **5 · La plata** | Costo real por kilo · recupero de hueso y grasa · rinde por proveedor · margen | *Requiere activar precios (sección 13 de la especificación)* |
| **6 · Sin escribir nada** | Lectura del Remito Electrónico Cárnico · balanza Kretz | La carga manual de la recepción desaparece |

**Calibración del piloto** (plan del doc B, que adopto tal cual): 10-20 medias res de línea base
pesando los cortes clave (lomo, peceto, asado, vacío, nalga, cuadril) más los totales de vendible,
hueso y grasa → mediana y P10-P90 → validar con las 10 siguientes sin tocar el perfil.

---

## 8. Lo que no entra ahora, y por qué

| Tema | Por qué queda afuera |
|---|---|
| Costeo, margen y reparto por valor relativo de venta | La sección 13 de la especificación dice que KILO no informa precios. El modelo de datos no lo impide, pero no se construye |
| Trazabilidad HACCP completa, foto del rótulo, retiro de lote | Correcto y necesario para escalar. No es lo que hace fracasar un piloto |
| Diez perfiles segmentados | Un perfil por carnicería primero; partir solo con datos que lo justifiquen |
| Pronóstico de demanda | Etapa 4 como mínimo |

---

## 9. Decisiones tomadas

### Las tres que decidió el fundador (12/09/2026)

| # | Decisión | Elegido | Qué implica |
|---|---|---|---|
| 1 | Vendible de arranque | **70 %** | El perfil semilla de la sección 5, ya cargable |
| 2 | Peso real al entregar | **Opcional** | Habilita la calibración sin ritual de la sección 3 |
| 3 | Categorías del piloto | **Novillo y vaca** | Dos perfiles; el de vaca nace como hipótesis declarada |

Sobre la 1, el razonamiento que la sostiene y que conviene no perder: es **asimétrica**. Pasarse
para arriba hace que el bot prometa carne que no hay, y eso es un cliente perjudicado. Pasarse para
abajo es una sorpresa agradable. Con información incompleta, el error barato es el de abajo.

Sobre la 2, el detalle de implementación: al marcar el pedido como retirado, el campo de peso
aparece **con el estimado ya cargado**. Si el carnicero lo corrige, aprendemos; si toca "listo" sin
mirar, no perdimos nada. **Nunca bloquear la entrega por esto.**

### Las dos que resolví yo, porque el diseño las absorbe

Estas dos estaban pendientes desde el 10/09. Al bajar el modelo a detalle resultó que **ninguna de
las dos obliga a decidir ahora**, porque se pueden soportar las dos alternativas sin costo:

**¿Desposta toda la media res de una, o de a partes?** → **El lote se abre completo.** Las piezas
estimadas se crean todas al cargar la media res, aunque todavía estén sin cortar. El motivo: para el
bot, lo que importa es si hay o no hay ese corte **hoy**, y si está en la media res que entró, hay —
esté cortado o no. Si el carnicero desposta de a partes, lo único que cambia es el momento físico, y
eso ya lo cubre el paso de aprobación: él ve el pedido antes de confirmarlo. Abrir el lote
progresivamente agregaría un estado más ("pieza sin cortar") a cambio de nada.

**¿Se vende el hueso y la grasa desde el sistema?** → **Se modelan como piezas con bandera de
subproducto, y no se construye el flujo de venta ahora.** Así el kilo queda registrado desde el día
uno —que es lo que importa, porque hoy no queda en ningún lado— y el día que quieras venderle al
sebero desde el sistema, ya están los kilos: alcanza con darles precio. No hay que migrar nada.

### La que sigue abierta, y vale más que todo este documento

**Media hora con el carnicero piloto**, con dos objetivos concretos:

1. **Resolver los cinco solapamientos de la sección 5.3.** Cada "sí, lo separo" parte una fila en
   dos. Es la diferencia entre una tabla que refleja su carnicería y una que refleja Uruguay en 2008.
2. **Revisar los rangos P10–P90 corte por corte.** Él sabe cuánto pesa un peceto de los que le bajan.

La sección 2 explica por qué esto no se puede saltear: dos fuentes serias dan números muy distintos
para el mismo nombre **sin que ninguna esté equivocada**. El nombre no alcanza; hay que fijar dónde
empieza y dónde termina la pieza.
