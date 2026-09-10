# De la media res al mostrador — proceso, datos y números

**Investigación para el módulo de stock de KILO — 10/09/2026**

> Este documento reúne todo lo que se pudo verificar sobre el recorrido de la carne desde que
> el frigorífico entrega la media res hasta que los cortes están en la vitrina, con foco en lo
> que hace falta para controlar stock, costear y manejar la mercadería.

---

## Nota metodológica — leer antes que nada

Este proyecto tiene una regla que atraviesa todo: **nunca inventar**. Sería contradictorio
romperla justo en el documento que va a alimentar el sistema de stock, así que cada dato de acá
está marcado:

- **[FUENTE]** — sale de una fuente concreta, con link.
- **[DERIVADO]** — cuenta hecha por mí a partir de datos con fuente. La cuenta está a la vista.
- **[SIN DATO]** — se buscó y no se encontró. Queda explícito para que nadie lo complete de
  memoria más adelante.

**El hallazgo más importante de toda la investigación es un vacío:** no existe una tabla pública
argentina —ni oficial, ni técnica, ni del IPCVA— que diga qué porcentaje de una media res
representa cada corte. El [Nomenclador de Cortes del IPCVA](https://carneargentina.org.ar/nomenclador-de-cortes)
describe la anatomía de cada pieza pero no publica pesos ni rendimientos. Lo mismo la tabla de
productos de ARCA.

Lo único que existe son **catálogos de frigoríficos y carnicerías que venden por pieza y publican
el peso aproximado**. Son datos comerciales reales, pero de un tipo de animal puntual (casi todos
novillo Angus/Hereford), no promedios estadísticos.

Esto tiene una consecuencia directa de producto, y conviene tenerla clara desde el principio:
**la tabla de rendimiento no se puede comprar ni copiar; hay que construirla midiendo.** Volvemos
sobre esto en el documento de propuesta.

---

## 1. El recorrido completo, etapa por etapa

### 1.1 Antes de la carnicería (contexto que explica los números)

| Etapa | Qué pasa | Pérdida de peso |
|---|---|---|
| Desbaste | El animal viaja y espera en ayuno antes de la faena | **4,4 % del peso vivo** [FUENTE](https://agroglobalcampus.com/carne-bovina-rendimiento-canal-y-comercial/) · FADA lo mide en **5 %** [FUENTE](https://www.lanueva.com/nota/2025-6-3-5-0-30-carne-vacuna-como-es-la-composicion-del-precio-que-paga-el-consumidor) |
| Faena | Se separa cuero, vísceras, cabeza y patas | El **rendimiento de faena** (peso vivo → peso en gancho) es de **57-58 %** [FUENTE](https://www.a24.com/agro/actualidad-agro/forma-precio-carne-vacuna-publico-01042020_CM6sgdj-I) |
| Oreo | La res sale a 35-37 °C y se orea 90-120 minutos a 12-16 °C | Sella la superficie y baja la evaporación posterior [FUENTE](https://agroglobalcampus.com/enfriamiento-y-maduracion-procesos-clave-en-la-calidad-de-la-carne/) |
| Cámara / maduración | Enfriado progresivo a 0-2 °C, 24-36 h | **2-3 % en 3 días**, reducible a 0,3 % con aire y agua pulverizada [FUENTE](https://agroglobalcampus.com/carne-bovina-rendimiento-canal-y-comercial/) |

**Por qué importa para el sistema:** el peso que la carnicería paga es el que marca la balanza del
frigorífico. Si la media res llega al día siguiente, ya perdió algo de peso en cámara. Esa
diferencia no es un error de nadie — es física — pero explica parte del descuadre entre lo que
dice el remito y lo que se pesa al recibir.

### 1.2 Llegada a la carnicería

- La media res se descarga y va a la cámara. En Argentina se sigue transportando y descargando
  entera: **el troceo obligatorio en piezas de hasta 32 kg fue derogado en enero de 2023**, antes
  de entrar en vigencia [FUENTE](https://comercioyjusticia.info/economia/finalmente-no-habra-troceo-y-siguen-las-medias-reses/).
  La norma original era la Resolución Conjunta 4/2021.
- **Pero sigue vigente la Resolución SRT 22/2021**, que limita a 32 kg el acarreo manual de
  productos cárnicos y obliga a usar medios mecánicos por encima de ese peso. Como las medias
  reses pesan hasta 120 kg, hay una contradicción práctica sin resolver: la media res es legal,
  el "hombreo" no.
- El debate se reabrió en 2024 [FUENTE](https://www.lanacion.com.ar/economia/campo/de-la-media-res-al-troceo-el-gobierno-pone-en-agenda-un-debate-sobre-la-carne-que-promete-ser-arduo-nid03062024/).

**Riesgo de producto a tener en cuenta:** si el troceo vuelve algún día, el flujo deja de ser
"llega una media res y se desposta" y pasa a ser "llegan cortes ya despostados". Conviene que el
modelo de datos sea genérico —**una pieza de N kg que se transforma en M piezas**— y no esté
casado con el concepto "media res".

### 1.3 Condiciones de conservación [FUENTE](https://www.fao.org/4/t0566s/t0566s12.htm)

| Dato | Valor |
|---|---|
| Temperatura ideal de almacenamiento | −1 °C |
| Refrigeración comercial habitual | 3-7 °C |
| Humedad relativa | 90 % |
| Duración de carne vacuna a −1 °C | hasta 3 semanas |
| Duración de despojos comestibles (achuras) | 7 días |
| Capacidad de cámara | 300-500 kg por metro de riel (media res) |

### 1.4 El desposte

La media res se divide primero en cuartos: **se sierra el cuerpo vertebral entre la 10ª y la 11ª
costilla** [FUENTE](https://www.produccion-animal.com.ar/informacion_tecnica/carne_y_subproductos/53-cortes_vacunos_y_menudencias.pdf)
(algunos frigoríficos cortan entre la 5ª y la 6ª; depende del tipo de corte comercial).

En la práctica comercial argentina la media res se piensa en **tres bloques**, no dos:

| Bloque | Qué incluye | % de la media res |
|---|---|---|
| **Pistola / cuarto trasero** | Rueda (garrón, tortuguita, peceto, cuadrada, bola de lomo, nalga con tapa) + Rump & Loin (colita, tapa de cuadril, cuadril, lomo, bife angosto) | **40,5 %** |
| **Parrillero** | Plancha de asado, matambre, vacío, entraña | **14 %** |
| **Delantero** | Bife ancho con tapa, aguja, cogote, paleta, marucha, bife de paleta, chingolo, pecho, brazuelo | **42 %** |

[FUENTE: Centro de Consignatarios Directos de Hacienda](https://ccdh.org.ar/el-sector/)

⚠️ **Advertencia sobre este cuadro:** suma 96,5 %, no 100 %, y es **la única fuente argentina que
encontramos con esta apertura**. Tomarlo como orden de magnitud, no como verdad establecida. El
3,5 % que falta probablemente sea grasa y recortes de playa.

Una carnicería de Posadas confirma que se maneja comercialmente así —trasero, delantero y
parrillero, con piezas de 20 a 30 kg cada bloque—
[FUENTE](https://misionesonline.net/2026/09/10/caida-consumo-carne-media-res/).

---

## 2. Cuánto pesa una media res

**[FUENTE: Sitio Argentino de Producción Animal](https://www.produccion-animal.com.ar/informacion_tecnica/comercializacion/10-clasificacion_por_peso_media_res.pdf)** —
clasificación por peso, sin oreo:

| Categoría | Media res (kg) |
|---|---|
| Mamón | hasta 50 |
| Ternero | 55 – 60 |
| Vaquillona | ~80 |
| Novillito | ~90 |
| **Novillo** | **~124** |
| Novillo pesado | +150 |
| Vaca | 100 – 120 |

El propio documento aclara que *"no existe regla fija para definir el peso que corresponde a cada
tipo de animal"*.

Otra fuente da rangos algo distintos —ternera 75-99, novillito 100-119, novillo 120-170
[FUENTE](https://www.frigorificosada.com.ar/blog/cuanto-pesa-una-media-res-y-como-calcular-su-promedio-rendimiento-y-ganancia/)—
y en ese mismo artículo aparece un "200 a 250 kg" que es **inconsistente con su propio desglose**:
casi seguro se refiere a la res entera, no a la media. **No usar ese número.**

Referencia comercial actual: media res "familiar" de 71-80 kg a $5.300/kg en diciembre de 2024
[FUENTE](https://www.baenegocios.com/negocios/Cuanto-hay-que-invertir-para-comprar-una-media-res-de-carne-y-que-cortes-vienen-20241216-0117.html).

---

## 3. La tabla de piezas — cuánto pesa cada corte

Esto es el corazón de lo que necesita el módulo de stock. **Todos los pesos son de novillo**
(media res de ~120-130 kg), que es lo que publican los catálogos.

La columna de porcentaje es **[DERIVADO]**: es el punto medio del rango dividido por una media res
de referencia de 120 kg. Sirve para escalar, no para prometer exactitud.

### 3.0 La tabla del INAC — la mejor fuente institucional que hay [FUENTE]

*Incorporada el 10/09/2026, del PDF que consiguió el fundador.*

El **Instituto Nacional de Carnes (INAC)** de Uruguay publica "Rendimientos típicos de algunos
cortes bovinos" (documento de 2008), y tiene una propiedad que ninguna otra fuente relevada tiene:
**está referido a una media res de novillo de 100 kg**. Es decir, los kilos SON los porcentajes,
directo, sin derivar nada.

Es la única tabla institucional de rendimiento por corte que apareció en toda la investigación.

| Corte (nomenclatura INAC) | kg / % s/ media res de 100 kg |
|---|---|
| Asado | **9,85** |
| Vacío con hueso (3 costillas) | 6,20 |
| Nalga | 6,10 |
| Cogote sin hueso | 4,70 |
| Cuadril | 3,90 |
| Costilla redonda sin hueso | 3,60 |
| Cuadrada | 3,60 |
| Aguja 1ª sin hueso | 3,40 |
| Pecho sin hueso | 3,40 |
| Pulpa de paleta sin hueso | 3,30 |
| Bife angosto | 3,30 |
| Brazuelo | 2,80 |
| Falda con hueso | 2,50 |
| Lomo | 1,70 |
| Peceto | 1,70 |
| Tortuguita | 1,60 |
| Garrón standard | 1,50 |
| Marucha sin hueso | 1,40 |
| Tapa de cuadril (picaña) | 1,30 |
| Chingolo (lomillo) | 0,80 |
| *(Nalga de afuera = cuadrada + peceto)* | *(5,30 — subtotal, no sumar)* |
| **Total de los cortes listados** | **66,65** |

**Cómo leer ese 66,65 %.** No es el rinde: es lo que suman *los cortes que el INAC eligió listar*.
Faltan de la lista matambre, entraña, colita de cuadril, bife ancho / ojo de bife, tapa de asado,
bola de lomo, palomita y osobuco. Sumando esos, se llega cómodamente al rango de rinde de 68-76 %
que documenta la sección 4.1. O sea: **la tabla es parcial pero coherente con el resto**.

#### Lo que esta tabla resuelve

1. **Tapa tres de los agujeros [SIN DATO]** de las tablas de abajo: pecho (3,40), brazuelo (2,80) y
   chingolo (0,80).
2. **Inclina la discrepancia de la carnaza de paleta.** La tabla de abajo tenía dos fuentes
   irreconciliables (2,5 kg contra 10,5 kg). El INAC da "pulpa de paleta sin hueso" en 3,30 % —
   cerca del extremo bajo. *Suficiente para descartar el 10,5, no para dar por cerrado el tema*:
   habría que confirmar que "pulpa de paleta" y "carnaza de paleta" son la misma pieza.
3. **Y lo más valioso: valida por convergencia.** Estas son dos fuentes independientes —catálogos
   comerciales argentinos de 2024-2026 contra un instituto uruguayo de 2008— y en cinco cortes dan
   prácticamente lo mismo:

   | Corte | Derivado de catálogos | INAC | |
   |---|---|---|---|
   | Peceto | 1,7 % | 1,70 % | idéntico |
   | Tapa de cuadril (picaña) | 1,3 % | 1,30 % | idéntico |
   | Lomo | 1,6 % | 1,70 % | casi |
   | Tortuguita | 1,5 % | 1,60 % | casi |
   | Bife angosto | 3,5 % | 3,30 % | casi |

   Dos conjuntos de datos que no se copiaron entre sí, separados por 18 años y un país, describiendo
   la misma realidad. **Eso sube bastante la confianza en la tabla de referencia inicial.**

#### Las tres advertencias

- **Es desposte uruguayo.** La nomenclatura no es idéntica ("nalga de afuera" no se usa así en
  Argentina) y algunos cortes se separan en distinto lugar. Sirve como referencia, no como verdad.
- **Es de 2008.** Los animales de hoy son más pesados y con distinto engrasamiento.
- **Las definiciones no siempre coinciden.** "Vacío con hueso (3 costillas)" da 6,20 % contra el
  ~3,0 % de la tabla de abajo, pero no es contradicción: son cortes distintos con el mismo nombre.
  Al cargar la tabla del sistema hay que fijar **qué pieza es cada nombre**, no solo cuánto pesa.

Conclusión práctica: **el INAC es la base de la tabla de referencia inicial** para los cortes que
cubre, completada con los catálogos argentinos para el resto. Y sigue en pie la conclusión de la
propuesta: la tabla de arranque se corrige sola con los despostes reales de cada carnicería.

### Bloque parrillero y delantero

| Corte | Peso de la pieza (kg) | % s/ media res de 120 kg | Fuentes |
|---|---|---|---|
| Asado / costillar entero (con hueso) | **6 – 13** | ~7,9 % | 5 catálogos |
| Tira de asado (porción) | 1,2 – 1,7 | — | 3 |
| Vacío | **2,2 – 5** | ~3,0 % | 4 |
| Matambre | **1,0 – 2,2** | ~1,3 % | 4 |
| Entraña | **0,4 – 0,8** | ~0,5 % | 5 (muy consistente) |
| Falda | 1,6 – 3,5 | ~2,1 % | 3 |
| Tapa de asado | 2,4 – 3,5 | ~2,5 % | 2 |
| Bife ancho entero (desosado) | 2,5 – 3,5 | ~2,5 % | 3 |
| Ojo de bife limpio | 1,2 – 1,7 | ~1,2 % | 1 |
| Aguja | 3 – 5 | ~3,3 % | 2 |
| Marucha | 1,7 – 2,5 | ~1,8 % | 1 |
| Paleta entera | ~7 | ~5,8 % | 1 — dato único |
| Palomita | 1,2 – 1,3 | ~1,0 % | 2 |
| Cogote | ~7,3 | ~6,1 % | 1 — dato único |
| Carnaza de paleta | **2,5 ó 10,5** ⚠️ | — | 2, y no coinciden |
| Pecho | **[SIN DATO]** | — | — |
| Brazuelo | **[SIN DATO]** | — | — |
| Chingolo | **[SIN DATO]** (solo aparece agrupado con palomita) | — | — |

### Bloque trasero (pistola)

| Corte | Peso de la pieza (kg) | % s/ media res de 120 kg | Fuentes |
|---|---|---|---|
| Bife angosto entero | 3,5 – 5 | ~3,5 % | 4 |
| Lomo | 1,3 – 2,5 | ~1,6 % | 4 |
| Cuadril entero | ~2,5 – 3,5 | ~2,5 % | 2 |
| Corazón de cuadril | 3,0 – 3,2 | ~2,6 % | 1 |
| Colita de cuadril | **0,9 – 1,8** | ~1,1 % | 6 — el mejor respaldado |
| Tapa de cuadril / picaña | 1,1 – 2,0 | ~1,3 % | 4 |
| Nalga sin tapa | 3,8 – 6 | ~4,1 % | 2 |
| Tapa de nalga | 1,2 – 2,5 | ~1,5 % | 3 |
| Bola de lomo | 3 – 4,5 | ~3,1 % | 2 |
| Cuadrada | 3 – 4 | ~2,9 % | 2 |
| Peceto | **1,5 – 2,5** | ~1,7 % | 5 |
| Tortuguita | 1,5 – 2 | ~1,5 % | 2 |
| Garrón / osobuco | 2 – 3,5 | ~2,3 % | 2 |
| Cima | ~2 | ~1,7 % | 3 |

⚠️ **"Roast beef" es un problema de nomenclatura, no de peso.** Los catálogos lo usan para cosas
distintas: para algunos es el bloque de aguja/bife ancho del delantero (~7 kg), para otros el bife
angosto sin hueso del trasero (~4-5 kg). **Antes de cargarlo hay que definir qué pieza es** en
nuestro catálogo.

### Control de coherencia [DERIVADO]

Sumando los puntos medios del trasero da **34,5 kg** de cortes. La pistola representa 40,5 % de
una media res de 120 kg = **48,6 kg**. La diferencia (~14 kg) es hueso de la rueda, garrón y grasa.
**Cierra.** Lo mismo pasa del lado del delantero. Es una señal de que los dos conjuntos de datos
—independientes entre sí— describen la misma realidad.

### El hueco más importante

**No existe ninguna fuente que publique el mismo corte para distintas categorías de animal.** Solo
hay un caso comparable: matambre de vaca 1,0-1,5 kg contra matambre de novillo 1,6-2,2 kg
[FUENTE](https://www.pampaynovillo.com.ar/carniceria/carne-vacuna/).

Como aproximación **[DERIVADO, no de fuente]**, escalar proporcionalmente al peso de la media res:
novillito ×0,72 · vaquillona ×0,65 · ternera ×0,48 · vaca ×0,85-1,0. No es exacto —el delantero y
el trasero no escalan igual según edad y engrasamiento— pero sirve como punto de partida
calibrable.

---

## 4. El rinde y las mermas

### 4.1 Cuánto de lo que se compra se vende

Cinco fuentes argentinas, y **no coinciden**:

| Fuente | Rinde de la carnicería | Detalle |
|---|---|---|
| [FADA](https://www.lanueva.com/nota/2025-6-3-5-0-30-carne-vacuna-como-es-la-composicion-del-precio-que-paga-el-consumidor) | **76 %** | "Un kilogramo de res rinde 760 g de cortes que se venden" |
| [a24](https://www.a24.com/agro/actualidad-agro/forma-precio-carne-vacuna-publico-01042020_CM6sgdj-I) | **79 %** | Pérdida de 21 % en hueso y grasa |
| [AgroGlobal](https://agroglobalcampus.com/carne-bovina-rendimiento-canal-y-comercial/) | **68 %** | 32 % hueso, grasa y fascias |
| [Valor Carne](https://www.valorcarne.com.ar/cuanto-pierde-la-ganaderia-por-la-comercializacion-en-medias-reses/) | **~70 %** | 25 kg de grasa + 35 kg de hueso por animal |
| [SADA](https://www.frigorificosada.com.ar/blog/cuanto-pesa-una-media-res-y-como-calcular-su-promedio-rendimiento-y-ganancia/) | **~60 %** | Hueso 15-20 % |

**Rango defendible: 68 % a 76 %.** El 76 % de FADA es el más citado porque viene del organismo que
publica el informe oficial de composición del precio de la carne.

Composición anatómica de referencia (disección científica, INTA):
**músculo 57,2 % / grasa total 20,6 % / hueso 16,3 %**
[FUENTE](https://www.produccion-animal.com.ar/informacion_tecnica/carne_y_subproductos/144-criollo_Garriz.pdf).
Da más grasa que las fuentes comerciales porque incluye grasa intermuscular que en la práctica
queda pegada al corte y se vende con él.

### 4.2 Los cuatro tipos de merma

[FUENTE: clasificación de Distarajal](https://distarajal.com/mermas-de-carne-que-son-como-se-calculan-y-como-reducirlas/) —
española, pero la taxonomía aplica igual:

1. **Por limpieza y despiece** — hueso, grasa, tendones. Es la más grande y la más previsible.
2. **Por conservación** — pérdida de agua por temperatura y manipulación.
3. **Por cocción** — no aplica a carnicería, sí a elaborados.
4. **Comercial o por caducidad** — lo que no se vendió a tiempo.

Fórmula estándar: `% merma = [(peso inicial − peso útil) / peso inicial] × 100`

La misma fuente advierte que **"no existe un porcentaje único válido"**.

### 4.3 Lo que no se encontró

- **[SIN DATO]** Merma por goteo en vitrina o por manipuleo día a día, en fuente argentina.
- **[SIN DATO]** Merma por corte individual (cuánto pierde un asado vs. una nalga al despostar).
- **[SIN DATO]** Porcentaje de recortes separado del de grasa.

**Conclusión de diseño:** como no hay tabla de merma confiable por corte para Argentina, **cada
carnicería tiene que medir la suya**. Y eso, lejos de ser un problema, es la funcionalidad
diferencial: nadie le puede decir al carnicero cuál es su merma real, solo su propia balanza.

---

## 5. Los subproductos: hueso, grasa, recortes y achuras

### 5.1 El circuito de los seberos

Está muy bien documentado y es plata que hoy no se registra en ningún lado
[FUENTE: La Nación](https://www.lanacion.com.ar/sociedad/seberos-el-circuito-en-las-sombras-detras-de-una-actividad-a-la-vista-de-todos-nid07102021/):

- Los **seberos** pasan por las carnicerías a levantar baldes con grasa, hueso y descarte. Un local
  puede entregar **56 kg** por pasada.
- **La carnicería cobra, no paga**: ~$1 por kilo de grasa, o una compensación mensual de $500 a
  $5.000 según el tamaño (valores de 2021; sirve la estructura, no el número). Algunos cobran en
  especie: detergente, lavandina, yerba, vino.
- Un sebero visita 30-40 carnicerías por día. Destino: seberías → jabones y cosmética.

Valor que se está dejando en la mesa, por animal
[FUENTE: Valor Carne](https://www.valorcarne.com.ar/cuanto-pierde-la-ganaderia-por-la-comercializacion-en-medias-reses/):
25 kg de grasa + 35 kg de hueso = **$3.700 a $7.200 por animal** no capturados.

### 5.2 Recortes → carne picada (con una restricción legal importante)

El **Código Alimentario Argentino, artículo 255** establece que la carne picada **debe procesarse
en presencia del interesado** en el punto de venta, con excepciones limitadas
[FUENTE](https://www.unosantafe.com.ar/santa-fe/la-carne-picada-si-o-si-debe-ser-procesada-frente-al-consumidor-n2124962.html).

**Consecuencia directa para el modelo de datos:** la picada **no es un producto con stock propio**,
es una **transformación en el momento de la venta**. Hay que modelarla como un consumo de stock de
otro artículo (recortes, carnaza, paleta) disparado por la venta, y el operador tiene que poder
elegir de qué sale, porque eso cambia el costo.

Existe además un proyecto para limitar al 5 % la grasa en la picada
[FUENTE](https://ahoracalafate.com.ar/contenido/12270/buscan-limitar-al-5-el-contenido-de-grasa-en-la-carne-picada) —
**[SIN VERIFICAR]** si se convirtió en norma.

### 5.3 Las achuras NO vienen con la media res

Dato contraintuitivo y muy relevante para el modelo
[FUENTE](https://www.produccion-animal.com.ar/informacion_tecnica/carne_y_subproductos/139-Achuras.pdf):

- Circuito propio: **frigorífico → achurero → carnicería**, con entregas **~2 veces por semana**.
- Altamente perecederas: la calidad depende del tiempo entre faena y consumo.
- Mercado: mollejas, chinchulines y tripa gorda 100 % mercado interno; hígados 30 % exportado;
  tendones y librillos, consumo interno cero.

**Consecuencia:** la entrada de mercadería no puede asumir que todo entra por el flujo
"media res → desposte". Las achuras son una compra independiente, con otro proveedor y otra
frecuencia.

---

## 6. La economía: cómo se forma el precio y dónde está el margen

### 6.1 El costo real por kilo vendible

La carnicería paga **un precio único por kilo de media res**, pero solo vende el 68-76 % de esos
kilos. El costo real es siempre mayor al nominal:

```
Costo real por kg vendible = Costo total de la media res ÷ (Peso × Rinde)
```

Ejemplo con números argentinos de 2024 **[DERIVADO]**:
media res de 100 kg a $4.746/kg con IVA = $474.600 · rinde 76 % → 76 kg vendibles →
**$6.245/kg de costo real**, un **31,6 % más** que el precio nominal.

Ese número **no descuenta el recupero de subproductos**, que FADA cuantifica en **6,5 % del precio
final**. Un sistema bien hecho debería restarlo antes de prorratear.

### 6.2 Por qué unos cortes subsidian a otros

Precios de referencia de abril 2024, con la media res a $4.746/kg
[FUENTE: De Frente al Campo](https://www.defrentealcampo.com.ar/como-se-conforma-el-precio-de-la-carne-desde-el-costo-hasta-los-impuestos-y-el-valor-agregado-de-distribucion/):

| Corte | Precio/kg | Múltiplo sobre el costo de la media res |
|---|---|---|
| Carnaza común | $5.070 | 1,07× |
| Asado | $6.795 | 1,43× |
| Colita de cuadril | $9.038 | 1,90× |
| Lomo | $10.230 | **2,16×** |

Y en 2020, el osobuco se vendía **por debajo** del costo nominal de la media res (0,86×)
[FUENTE](https://www.a24.com/agro/actualidad-agro/forma-precio-carne-vacuna-publico-01042020_CM6sgdj-I).

**Esa dispersión de 0,86× a 2,16× es la prueba dura del subsidio cruzado.** El carnicero compra un
paquete a precio único y lo vende a precios que el mercado le impone corte por corte. El único
grado de libertad que tiene es **dónde poner el margen**.

Dato que lo confirma desde el otro lado: si el carnicero comprara **selectivamente** solo los
cortes que quiere en vez de la media res entera, esos cortes le saldrían **~14 % más caros**
[FUENTE: La Nación](https://www.lanacion.com.ar/economia/campo/adios-a-la-media-res-bajara-el-precio-de-la-carne-nid22042021/).
Ese 14 % es literalmente el precio de comerse el delantero.

### 6.3 La pérdida invisible: degradar cortes a picada

El dato más accionable de toda la investigación
[FUENTE: Valor Carne](https://www.valorcarne.com.ar/cuanto-pierde-la-ganaderia-por-la-comercializacion-en-medias-reses/):

- **7,5 kg por animal** terminan picados por no haberse vendido como pieza.
- Diferencia de valor: **$300-400 por kilo**.
- **Pérdida: $2.400 por animal.**

Esto **no es merma ni robo**: los kilos siguen ahí. Es una pérdida que ningún sistema de stock
convencional detecta, porque nada falta — solo vale menos.

### 6.4 Margen

Este es el punto con peor información pública. Lo que hay:

- **Participación de la carnicería en el precio final (FADA):** 20,7 % (feb-2025), 17 % (ago-2024),
  20 % (abr-2026), 12,9 % (mar-2020). **Ojo: eso incluye sus costos operativos, no es margen neto.**
- **Único cálculo de margen bruto por media res que se encontró:** facturación $549.668, margen
  $119.066 → **21,7 % sobre facturación** (markup de 27,6 % sobre el costo)
  [FUENTE](https://www.defrentealcampo.com.ar/como-se-conforma-el-costo-desde-el-costo-hasta-los-impuestos-y-el-valor-agregado-de-distribucion/).
- **[SIN DATO]** No existe estudio sectorial de margen bruto de carnicerías argentinas con
  metodología clara.

Referencia de contexto sobre sensibilidad a la merma: las cadenas de supermercados argentinas
operaban con margen neto de **1,5 %** y perdían **1,6 % de la facturación** por merma y robo — es
decir, la pérdida desconocida se comía todo el margen
[FUENTE: La Nación, estudio Hasar](https://www.lanacion.com.ar/economia/por-robos-y-productos-vencidos-los-super-pierden-600-millones-nid1298513/).
Es de 2010 y de supermercados, no de carnicerías, pero ilustra el orden de magnitud del riesgo.

---

## 7. Normativa y documentación

### 7.1 IVA

- La carne bovina tributa **IVA al 10,5 %**, no 21 %
  [FUENTE](https://www.cronista.com/columnistas/Pan-leche-carne-verduras-como-afecta-el-IVA-a-lo-que-consumimos-20190605-0025.html).
- Las **achuras** ("despojos comestibles") también van al 10,5 %.
- ⚠️ **Los elaborados pueden cambiar de alícuota.** Si la carnicería vende milanesas armadas,
  hamburguesas o embutidos, puede dejar de ser "carne fresca sin elaboración" y pasar a 21 %.
  **El sistema necesita alícuota configurable por artículo, no una constante global.**
- **[SIN CONFIRMAR]** La propia fuente fiscal señala "opiniones administrativas contradictorias"
  sobre si la venta minorista a consumidor final mantiene el 10,5 %. En la práctica se aplica, pero
  **hay que confirmarlo con un contador antes de escribirlo en el código**.

### 7.2 El Remito Electrónico Cárnico (REC) — lo más importante de este bloque

- **Obligatorio desde el 1 de septiembre de 2019** (RG 4256) para respaldar el movimiento de carne
  de mayoristas a carnicerías [FUENTE: ARCA](https://www.afip.gob.ar/actividadesAgropecuarias/sector-pecuario/remito-electronico-carnico/).
- **Sanción por no usarlo:** en vez de la percepción normal del 2 %, se retiene **el 10,5 % completo
  de IVA** (RG 4588/2019)
  [FUENTE](https://bichosdecampo.com/habra-que-retener-todo-el-iva-a-quienes-comercialicen-carne-vacuna-o-porcina-sin-utilizar-el-remito-electronico/).

**Esta es probablemente la oportunidad técnica más grande del módulo.** ARCA tiene un endpoint de
vinculación remito-factura. Si el sistema puede leer el REC y **precargar la entrada de la media
res** (peso, proveedor, tropa), elimina el trabajo de carga manual, que es la principal fricción de
adopción de cualquier sistema de stock. Hay documentación de implementación de terceros
[FUENTE](https://www.sistemasagiles.com.ar/trac/wiki/RemitoElectronicoCarnico).

### 7.3 Régimen de Transparencia Fiscal al Consumidor — obligación vigente

**Desde el 01/04/2025**, todo comprobante a consumidor final debe incluir el IVA discriminado,
otros impuestos nacionales indirectos, y la leyenda literal *"Régimen de Transparencia Fiscal al
Consumidor Ley 27.743"* (Ley 27.743 + RG ARCA 5614/2024)
[FUENTE](https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4709).

**Es requisito legal para cualquier ticket que emita el sistema.**

### 7.4 Peso de los impuestos

25,4 % del precio final (feb-2025), 28 % (abr-2026). La carne es **el alimento básico donde más
inciden los impuestos**: $1 de cada $4
[FUENTE](https://www.infocampo.com.ar/el-debate-por-el-precio-de-la-carne-es-el-alimento-basico-en-el-que-mas-inciden-los-impuestos/).

---

## 8. Cómo se controla el stock hoy, y qué hace la competencia

### 8.1 El estado del arte

**[SIN DATO]** No existe ningún relevamiento argentino sobre qué proporción de carnicerías usa
software y cuál usa cuaderno. Es un hueco real, y probablemente un dato que convenga generar
nosotros.

### 8.2 Software argentino relevado

| Producto | Lo que sí hace | Lo que no |
|---|---|---|
| **[bcnsoft](https://bcnsoft.com.ar/blog/software-para-carnicerias/)** | Integración con balanza **Kretz Report por USB**; stock en kg; **control de merma comparando kg comprados vs. vendidos**; rentabilidad por corte; facturación ARCA con modo offline | No modela el desposte |
| **[PUNTOGEST / DyCAM](https://dycam.com.ar/sistema-para-carniceria-y-almacenes.php)** | **Artículos principales y subartículos** (lo más cerca de un desposte que encontramos); balanzas Kretz y Systel; listas de precios múltiples | No calcula mermas ni tiene módulo de media res |
| **[Don Gestión](https://dongestion.com/blog/como-mejorar-la-rentabilidad-de-tu-carniceria-controlando-precios-por-kilo-y-ventas)** | Cambio masivo de precios por kilo; listas diferenciadas | Sin merma |
| **[SIKI](https://sikisoftware.com/sistema-administrativo-contable-carniceria-frigorificos/)** | POS multicaja, avisos de perecederos, asientos contables automáticos | Sin desposte |

### 8.3 La brecha, dicha sin vueltas

De todo lo relevado, **solo bcnsoft menciona control de merma comparando comprado contra vendido, y
ninguno modela el desposte de una media res**: nadie representa "entra una pieza de X kg, salen N
cortes que suman Y kg, la diferencia es merma con causa identificada".

Todos tratan a la carnicería como un comercio genérico con productos que se pesan.

**Eso es exactamente el hueco que describe este proyecto.**

### 8.4 Balanzas: requisito de entrada al mercado

Las balanzas dominantes son **Kretz** (Report, Report NX, Aura) y **Systel** (Cuora Max/Neo), y los
dos softwares argentinos serios integran con ellas
[FUENTE](https://www.stec.com.ar/collections/kretz). **Cualquier sistema que quiera competir tiene
que hablar con una Kretz** — no es un extra, es requisito.

---

## 9. Los problemas reales del control de stock de carne

### 9.1 El problema estructural

En un kiosco vendés 1 unidad de 1 producto. En una carnicería vendés 0,437 kg de un corte cuyo
costo real depende del rinde de la media res de la que salió. **Cada venta cambia la unidad, el
stock y el valor al mismo tiempo** [FUENTE](https://www.treinta.co/blog/ventas-por-peso).

### 9.2 Las causas de descuadre, documentadas

| Causa | Dato |
|---|---|
| **Merma no registrada** | Si comprás 100 kg y vendés 76, la diferencia **no es un faltante: es el rinde**. Pero si vendés 70, hay 6 kg que se fueron en algún lado. Sin separar una cosa de la otra, la rentabilidad es adivinanza [FUENTE](https://bcnsoft.com.ar/blog/software-para-carnicerias/) |
| **Producto no vendido a tiempo** | ~25 % de las pérdidas del retail argentino, y afecta especialmente a carnes rojas [FUENTE](https://www.lanacion.com.ar/economia/por-robos-y-productos-vencidos-los-super-pierden-600-millones-nid1298513/) |
| **Robo interno y externo** | En retail argentino: robo externo >$42 M, robo interno >$20 M (mismo estudio) |
| **Degradación de valor** | 7,5 kg/animal picados innecesariamente = $2.400/animal. **Ningún sistema convencional lo detecta** |
| **Balanza** | Testimonio periodístico sobre manipulación en el pesaje y "maquillaje" de picada [FUENTE](https://diariodecuyo.com.ar/enlasredes/El-carnicero-influencer-que-deschava-las-trampas-del-rubro-revela-el-secreto-para-un-asado-a-1-500-por-persona-20230922-0064.html). **[SIN DATO]** sobre desvíos típicos y frecuencia de descalibración |

### 9.3 Buenas prácticas documentadas

[FUENTE](https://www.treinta.co/blog/ventas-por-peso): unidad base única (el kilogramo); rutina
diaria de revisar al abrir, registrar entradas y **anotar mermas al cerrar**; comparar registro
contra existencia física todos los días; empezar por un producto de alta rotación antes de escalar.

---

## 10. Resumen de los vacíos — lo que nadie publica

Esto es lo más importante si se va a diseñar sobre esta base. **Ninguno de estos datos existe
públicamente en fuentes argentinas confiables:**

1. **La tabla de rendimiento por corte de una media res argentina.** *(Actualizado el 10/09/2026:
   sigue sin existir para Argentina, pero apareció la del INAC de Uruguay — ver la sección 3.0. Es
   una base institucional real para arrancar; no reemplaza medir el desposte propio.)*
2. El método operativo real de reparto de costo que usa el carnicero (es conocimiento de oficio).
3. Margen bruto típico con metodología clara.
4. Merma por corte individual, merma en vitrina, merma por goteo.
5. Pérdida desconocida específica del rubro carnicería.
6. Errores de balanza: desvíos típicos, tolerancias, frecuencia de descalibración.
7. Penetración de software vs. cuaderno en carnicerías argentinas.
8. Si la venta minorista a consumidor final es 10,5 % o 21 % (hay opiniones contradictorias).
9. Variación del peso de cada corte según categoría del animal.

**Los puntos 1, 4 y 9 son exactamente los que este producto puede llenar con datos propios.**
Ninguna carnicería sabe su rinde real por corte, y nadie se lo puede decir de afuera — solo su
propia balanza, medida sistemáticamente. Eso es defendible como producto y no lo tiene ninguno de
los sistemas relevados.

---

## Fuentes principales

- [FADA vía La Nueva (feb-2025)](https://www.lanueva.com/nota/2025-6-3-5-0-30-carne-vacuna-como-es-la-composicion-del-precio-que-paga-el-consumidor) · [FADA vía Infocampo (abr-2026)](https://www.infocampo.com.ar/el-debate-por-el-precio-de-la-carne-es-el-alimento-basico-en-el-que-mas-inciden-los-impuestos/)
- [Valor Carne — Pérdidas por comercialización en medias reses](https://www.valorcarne.com.ar/cuanto-pierde-la-ganaderia-por-la-comercializacion-en-medias-reses/)
- [a24 — Formación del precio de la carne](https://www.a24.com/agro/actualidad-agro/forma-precio-carne-vacuna-publico-01042020_CM6sgdj-I) · [De Frente al Campo](https://www.defrentealcampo.com.ar/como-se-conforma-el-precio-de-la-carne-desde-el-costo-hasta-los-impuestos-y-el-valor-agregado-de-distribucion/)
- [AgroGlobal — Rendimiento canal y comercial](https://agroglobalcampus.com/carne-bovina-rendimiento-canal-y-comercial/) · [Enfriamiento y maduración](https://agroglobalcampus.com/enfriamiento-y-maduracion-procesos-clave-en-la-calidad-de-la-carne/)
- [FAO — Conservación y almacenamiento por refrigeración](https://www.fao.org/4/t0566s/t0566s12.htm)
- [Centro de Consignatarios Directos de Hacienda](https://ccdh.org.ar/el-sector/)
- [Sitio Argentino de Producción Animal — Clasificación por peso](https://www.produccion-animal.com.ar/informacion_tecnica/comercializacion/10-clasificacion_por_peso_media_res.pdf) · [Cortes vacunos y menudencias](https://www.produccion-animal.com.ar/informacion_tecnica/carne_y_subproductos/53-cortes_vacunos_y_menudencias.pdf) · [Achuras](https://www.produccion-animal.com.ar/informacion_tecnica/carne_y_subproductos/139-Achuras.pdf)
- [La Nación — Seberos](https://www.lanacion.com.ar/sociedad/seberos-el-circuito-en-las-sombras-detras-de-una-actividad-a-la-vista-de-todos-nid07102021/) · [Pérdidas en supermercados](https://www.lanacion.com.ar/economia/por-robos-y-productos-vencidos-los-super-pierden-600-millones-nid1298513/) · [Adiós a la media res](https://www.lanacion.com.ar/economia/campo/adios-a-la-media-res-bajara-el-precio-de-la-carne-nid22042021/)
- [ARCA — Remito Electrónico Cárnico](https://www.afip.gob.ar/actividadesAgropecuarias/sector-pecuario/remito-electronico-carnico/) · [Transparencia Fiscal](https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4709)
- [Comercio y Justicia — Fin del troceo](https://comercioyjusticia.info/economia/finalmente-no-habra-troceo-y-siguen-las-medias-reses/)
- [UNO Santa Fe — Carne picada frente al consumidor](https://www.unosantafe.com.ar/santa-fe/la-carne-picada-si-o-si-debe-ser-procesada-frente-al-consumidor-n2124962.html)
- Catálogos con peso por pieza: [Frigorífico Pocker](https://frigorificopocker.com/) · [La Julia Organics](https://www.lajuliaorganics.com/) · [Carnes Proa](https://carnesproa.com/cortes-de-carnes-argentinas-proa/) · [Los Prados](https://lospradosonline.com.ar/) · [Justino](https://justino.com.ar/) · [El Mirasol](http://www.elmirasol.com.ar/es/cortes-de-carne/)
- [INAC Uruguay — Rendimientos típicos de algunos cortes bovinos (2008)](https://www.inac.uy/innovaportal/v/3140/20/innova.front/pesos-promedio-de-principales-cortes-bovinos) — la única tabla institucional de rendimiento por corte de la región
- Software relevado: [bcnsoft](https://bcnsoft.com.ar/blog/software-para-carnicerias/) · [PUNTOGEST/DyCAM](https://dycam.com.ar/sistema-para-carniceria-y-almacenes.php) · [Don Gestión](https://dongestion.com/blog/como-mejorar-la-rentabilidad-de-tu-carniceria-controlando-precios-por-kilo-y-ventas) · [SIKI](https://sikisoftware.com/sistema-administrativo-contable-carniceria-frigorificos/)

---

## Pendiente de verificar a mano

~~INAC Uruguay~~ — **resuelto el 10/09/2026.** El fundador consiguió el PDF y está incorporado en
la sección 3.0. Era, efectivamente, la mejor base disponible: una tabla institucional referida a
una media res de 100 kg, o sea porcentajes directos.

Lo que sigue pendiente, ahora sí solo verificable en el mostrador:

1. **Que el carnicero piloto revise los rangos corte por corte.** Media hora suya vale más que toda
   esta investigación: él sabe dónde corta y nosotros no.
2. **Si "pulpa de paleta" (INAC) y "carnaza de paleta" son la misma pieza.** De eso depende cerrar
   la discrepancia de 2,5 contra 10,5 kg.
3. **Qué pieza es cada nombre en NUESTRO catálogo.** El caso del vacío en la sección 3.0 muestra que
   dos fuentes serias pueden dar números muy distintos para el mismo nombre sin que ninguna esté
   equivocada. El nombre no alcanza: hay que fijar dónde empieza y dónde termina la pieza.
