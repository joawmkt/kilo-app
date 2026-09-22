# Pollo y cerdo — proceso, datos y números

**Investigación para extender el módulo de stock de KILO — 13/09/2026**
**Equivalente, para pollo y cerdo, de `docs/media-res-proceso-y-datos.md`**

> Este documento reúne lo que se pudo verificar sobre cómo llegan el pollo y el cerdo a una
> carnicería argentina, qué pasa con ellos adentro y qué datos existen para armar una tabla de
> rendimiento. **No propone diseño**: eso va aparte, después de discutirlo.

---

## Nota metodológica — leer antes que nada

Mismo marcado que la investigación del vacuno, y por el mismo motivo:

- **[FUENTE + link]** — sale de un documento verificable.
- **[DERIVADO]** — cuenta hecha acá a partir de datos con fuente. La cuenta está a la vista.
- **[SIN DATO]** — se buscó y no se encontró. **Queda el hueco.**
- **[SIN CONFIRMAR]** — hay un indicio pero no alcanza.
- **[DESCARTADO]** — se encontró el dato y **no se usa**, con el motivo escrito.

Y se aplicó la regla que salvó el módulo de vacuno: **sumar las columnas antes de creerlas.** Ya
dio resultado una vez en esta investigación: la única tabla de despiece de pollo con apertura por
presa que apareció **suma 102,46 %** (sección 2.3). Está descartada.

---

## 0. Los cuatro hallazgos que cambian el problema

Antes del detalle, lo que importa para decidir:

**1. El pollo no llega como animal: llega como cajón cerrado de 20 kg.** Y la variable que elige el
carnicero no es el peso —el cajón siempre pesa 20 kg— sino **cuántas cabezas** entran en esos 20 kg
(6 a 12). O sea: el peso del lote es un dato fijo y conocido de antemano, y el peso de cada pollo
sale de una división. **Eso es lo contrario del vacuno**, donde el peso de entrada es la incógnita
principal y hay que preguntarlo por voz.

**2. El mismo mayorista vende las presas ya cortadas, por caja, y la pechuga es la única presa que
vale más que el pollo entero.** Pata y muslo cotiza *por debajo* del pollo entero por kilo. Eso
convierte "¿el carnicero desposta el pollo o compra presas?" en una decisión económica que el
sistema no puede suponer: **tiene que soportar las dos.**

**3. El troceo obligatorio de 32 kg nunca aplicó al cerdo.** La Resolución 91/2022 —la que reglamentó
el troceo— habla de **bovinos (vacunos y bubalinos)** y de nadie más, y además se dejó de aplicar en
enero de 2023. La media res de cerdo es legal, se sigue vendiendo, y **el carnicero la desposta él**.
Para cerdo, entonces, el modelo del vacuno aplica mucho más de lo que se sospechaba.

**4. El vacío de datos se repite, y en cerdo es peor que en vacuno.** El vacuno al menos tenía la
tabla del INAC uruguayo. Para cerdo la mejor fuente regional cubre **54 % de la media canal en cinco
cortes** y deja 46 % sin abrir. Para pollo **no existe ninguna tabla institucional argentina**, y las
que hay están en % de peso vivo — que es la base del criadero, **no la base que ve la carnicería**.
Y hay un agravante: **el cerdo no tiene nomenclador oficial de cortes.** Vacuno tiene el del IPCVA,
ovino tiene el suyo desde 2019; porcino no tiene
[FUENTE: Disposición 3/2019, nomenclador ovino](https://www.boletinoficial.gob.ar/detalleAviso/primera/222067/20191127) ·
[FUENTE: glosario MAGyP de cortes bovinos, porcinos y ovinos](https://www.magyp.gob.ar/sitio/areas/bovinos/informacion_interes/informes/_archivos//000018_Nomencladores/000000-%20Presentaci%C3%B3n%20glosario%20de%20cortes%20bovinos,%20porcinos%20y%20ovinos.pdf).
**No hay columna vertebral de códigos oficiales para el catálogo de cerdo.**

---

## 1. Contexto: cuánto pesa cada especie en la mesa argentina

| Especie | Consumo per cápita 2025 | Fuente |
|---|---|---|
| **Pollo** | **47,7 kg/hab/año** | [Anuario Avícola 2025 (MAGyP)](https://www.magyp.gob.ar/sitio/areas/aves/informes/boletines/_archivos//250000_Anuario%20Avicola%202025.pdf) · [Infobae abr-2026](https://www.infobae.com/economia/2026/04/04/el-avance-del-pollo-y-del-cerdo-compensa-la-reduccion-del-consumo-de-carne-vacuna-en-la-dieta-argentina/) |
| **Vacuno** | **47,3 kg/hab/año** — mínimo en dos décadas | [Infobae abr-2026](https://www.infobae.com/economia/2026/04/04/el-avance-del-pollo-y-del-cerdo-compensa-la-reduccion-del-consumo-de-carne-vacuna-en-la-dieta-argentina/) |
| **Cerdo** | **18,9 kg/hab/año** — máximo histórico, +8,8 % interanual | [Anuario Porcino 2025 (MAGyP)](https://www.magyp.gob.ar/sitio/areas/porcinos/estadistica/_archivos//000005-Anuario/250000_Anuario%202025.pdf) |

**Por primera vez el pollo empató al vacuno.** [FUENTE] Y el cerdo creció 171 % en 20 años: de 6,22
kg/hab en 2006 a 18,89 en 2025
[FUENTE](https://www.infobae.com/economia/2026/07/27/el-consumo-de-carne-de-cerdo-casi-se-triplico-en-los-ultimos-20-anos-y-ya-compite-con-el-asado-vacuno/).

Dato de peso para priorizar: **en kilos que pasan por el mostrador, el pollo es tan grande como el
vacuno.** El módulo de vacuno atiende al 41 % de los kilos; el pollo a otro 41 %; el cerdo al 16 %.
[DERIVADO de los tres consumos: 47,3 + 47,7 + 18,9 = 113,9 kg]

---

## 2. POLLO

### 2.1 Cómo llega a la carnicería

**El formato es el cajón de 20 kg, y el número de cabezas es lo que se elige.** Tres proveedores
distintos, el mismo formato:

| Proveedor | Formato | Cabezas por cajón | Presentación |
|---|---|---|---|
| [Suprepollos](https://www.suprepollos.com.ar/productos/pollo-por-caja-de-20-kg) | Caja de 20 kg | **7, 8, 9, 10 u 11** | "Fresco, eviscerado con menudos" · caja de cartón con bolsa plástica **por unidad** |
| [Piquimau](https://piquimau.com.ar/producto/cajon-de-pollo/) | Cajón de 20 kg | **6, 7, 8, 9, 10, 11 o 12** | *"En cualquiera de los casos un cajón tiene 20 kg"* |
| [Distribuidora Sanju / pollo27](https://www.pollo27.com.ar/) | Cajón (SOYCHU) | — | también vende presas por caja (ver 2.7) |

**[DERIVADO]** El peso por pollo sale de dividir:

| Cabezas | kg por pollo |
|---|---|
| 6 | 3,33 |
| 7 | 2,86 |
| 8 | 2,50 |
| 9 | 2,22 |
| 10 | 2,00 |
| 11 | 1,82 |
| 12 | 1,67 |

Tres consecuencias directas:

- **El peso de entrada del lote no hay que preguntarlo.** Es 20 kg, salvo que el carnicero compre
  otro formato.
- **La uniformidad no es una hipótesis biológica: es una condición comercial.** El proveedor arma el
  cajón para que dé 20 kg con N aves parejas. La dispersión existe, pero está acotada por el propio
  armado del cajón. **[SIN DATO]** cuánto es esa dispersión real (¿±50 g? ¿±200 g?).
- **Cada pollo viene envuelto individualmente.** [FUENTE Suprepollos] Es decir: **el proveedor ya
  entrega el pollo como pieza**, no como kilos a granel.

### 2.2 Peso y edad del animal

| Dato | Valor | Fuente |
|---|---|---|
| Rendimiento de canal (peso vivo → canal) | **70-75 %** en condiciones prácticas actuales | [Avinews](https://avinews.com/rendimiento-de-canal-en-pollos-broilers-algunas-consideraciones/) |
| Idem, evolución genética (machos, 57 días) | 63,1 % (1957) → 69,3 % (1991) → **74,1 % (2001)** | [WPSA-AECA](https://www.wpsa-aeca.es/aeca_imgs_docs/01_02_47_calidad.pdf) |
| Pechuga sobre peso vivo, misma serie | 12,2 % (1957) → 15,4 % (1991) → **20,9 % (2001)** | idem |
| Rendimiento según peso (Brake 1993) | 1,0 kg → 63 % · 1,5 kg → 67 % · 2,0 kg → 69 % | [Avinews](https://avinews.com/rendimiento-de-canal-en-pollos-broilers-algunas-consideraciones/) |
| Pérdida por ayuno previo a faena | 0,20-0,25 % del peso vivo **por hora** (hasta 0,47 %) | idem |
| Efecto del enfriado | **inmersión en agua: +4 a 6 %** · **aire: −1 a 3 %** | idem |

**Ese último renglón importa y no es obvio.** Un pollo enfriado por inmersión **gana** 4-6 % de peso
en agua absorbida, y un pollo enfriado por aire **pierde** 1-3 %. Son hasta 9 puntos de diferencia
entre dos pollos que el carnicero paga por kilo. La merma que después ve en su cámara depende de
cómo lo enfrió el frigorífico. **[SIN DATO]** qué proporción de los frigoríficos avícolas argentinos
usa cada sistema.

### 2.3 El despiece: qué hay y qué falta

**Acá está el hueco más importante de toda la investigación del pollo.**

#### [DESCARTADO] La única tabla con apertura por presa

Un trabajo colombiano ([Politécnico Jaime Isaza Cadavid](https://repositorio.elpoli.edu.co/server/api/core/bitstreams/24b8bdb1-0b02-44cf-8381-f23d552161c0/content))
publica porcentajes por presa sobre peso de canal, para Cobb 500 y CobbAvian 48:

| Presa | CobbAvian 48 | Cobb 500 |
|---|---|---|
| Pechuga | 38,40 % | 37,63 % |
| Muslo | 13,54 % | 13,80 % |
| Contramuslo | 16,35 % | 17,12 % |
| Ala c/caballete | 19,48 % | 18,52 % |
| Rabadilla | 14,69 % | 14,00 % |
| **SUMA** | **102,46 %** | **101,07 %** |

**No se usa.** Suma más de 100 % sobre una base que dice ser la canal, y además el 19,5 % de ala es
inverosímil contra todas las demás fuentes (8,5-11 %). O la base no es la canal, o hay un error de
lectura del documento. En cualquiera de los dos casos, **no se puede cargar una tabla que no cierra**
— es exactamente el error que se detectó en una de las propuestas de vacuno.

#### Lo que sí se puede usar: dos descomposiciones internamente coherentes

**A. Por peso vivo** — PDF alojado en sitio argentino, datos de origen estadounidense
[FUENTE](http://www.latranqueraweb.com.ar/web/archivos/menu/POLLOS.pdf):

| Qué se saca | % del peso vivo |
|---|---|
| Sangre y plumas | 8 |
| Pérdida de evisceración | 6 |
| Patas | 4 |
| Cabeza | 2 |
| Menudos | 8 |
| Pescuezo | 4 |
| **Carcasa restante** | **68** |

Y esa carcasa se descompone (mismo documento, misma base):

| Componente | % del peso vivo | **% de la carcasa [DERIVADO]** |
|---|---|---|
| Hueso | 20 | **29,4 %** |
| Piel | 8 | **11,8 %** |
| Grasa y pérdidas | 2-4 | **4,4 %** |
| **Carne pura** | **35-40** | **54,4 %** |
| — carne blanca (pechuga) | 20 | 29,4 % |
| — carne oscura (muslo, encuentro) | 15 | 22,1 % |

**Las dos tablas cierran**: 8+6+4+2+8+4 = 32 → 68 % ✅ · 20+8+3+37 = 68 ✅ · y convertido a base
carcasa suma 100,0 % ✅. Es la descomposición más confiable que apareció, **pero describe hueso,
piel y carne — no presas comerciales.**

**B. Por presa, sobre peso de canal** — estudio peruano de seis genotipos a 13 semanas
[FUENTE](http://www.scielo.org.pe/pdf/agro/v11n3/2077-9917-agro-11-03-365.pdf):

| Presa | Rango entre genotipos | Estirpes rápidas (Hubbard) |
|---|---|---|
| Pechuga | 16,9 - 27,8 % de la canal | ~27,8 % |
| Muslo + pierna | 19,2 - 22,2 % | ~22,2 % |
| Ala | 8,5 - 11,0 % | ~11,0 % |
| Espinazo + cola | 25,0 - 33,9 % | ~25,0 % |
| Rendimiento de canal | 66,8 - 72,3 % del peso vivo | 72,3 % |

⚠️ **Advertencia fuerte sobre esta tabla:** son aves de **13 semanas** (91 días) e incluye razas
criollas. El parrillero argentino se faena a menos de la mitad de esa edad. **Sirve para acotar
órdenes de magnitud —el ala está entre 8,5 y 11 %, no en 19,5 %— y para nada más.**

#### Convergencia parcial, que es lo único que se puede afirmar

| Presa | Descomposición A (base carcasa) | Estudio B (base canal, estirpe rápida) | ¿Coinciden? |
|---|---|---|---|
| Pechuga | 29,4 % *(carne blanca, sin hueso)* | 27,8 % *(pechuga con hueso)* | **No comparables**: A es carne deshuesada, B es la presa entera |
| Muslo + pata | 22,1 % *(carne oscura)* | 22,2 % *(presa entera)* | Coinciden en el número, **pero tampoco son la misma cosa** |

**Y ese es justamente el problema.** Es el mismo caso del vacío en el vacuno: dos fuentes serias,
números parecidos o distintos, **y el nombre no alcanza para saber si hablan de la misma pieza.**

#### [SIN DATO] — lo que no existe para pollo

1. **Ninguna tabla argentina de rendimiento por presa.** Ni SENASA, ni MAGyP, ni INTA, ni cámara
   avícola. No hay equivalente al INAC uruguayo para aves.
2. **Ninguna tabla en base "pollo eviscerado como llega a la carnicería"**, que es la única base
   que le sirve al sistema. Todas las fuentes usan peso vivo o canal de planta.
3. **Cuánto es hueso en cada presa.** La pechuga con hueso y el filet son dos productos distintos
   del catálogo y nadie publica la relación entre ellos.
4. **La dispersión de peso dentro de un cajón.**
5. **Cuántas carnicerías argentinas trozan el pollo ellas mismas.**

### 2.4 Unidad de venta

- El mayorista vende **el cajón por peso total fijo** (20 kg) pero eligiendo **cabezas**: la unidad
  comercial de compra es mixta. [FUENTE Piquimau, Suprepollos]
- El proveedor entrega **cada pollo envuelto individualmente** [FUENTE Suprepollos] — el pollo ya
  es una pieza antes de entrar a la carnicería.
- **[SIN CONFIRMAR]** que en el mostrador argentino el pollo entero se cobre por kilo. Es lo que
  indica el uso corriente y los índices de precios del INDEC publican "pollo entero, $/kg"
  [FUENTE](https://www.ambito.com/economia/cuanto-sale-el-kilo-pollo-2024-argentina-segun-el-ultimo-dato-del-indec-n6032045),
  pero no se encontró una fuente que diga explícitamente cómo se factura en carnicería.
  **Es una pregunta para el carnicero piloto, no para internet.**

### 2.5 Frío y vida útil

| Dato | Valor | Fuente |
|---|---|---|
| **Ave refrigerada: temperatura de conservación** | **entre −2 °C y 2 °C** | **[CAA art. 256](https://ldz.eregulations.org/media/Capitulo_VI.pdf)** |
| **Ave congelada** | **no superior a −15 °C** | idem |
| Vida comercial a 4 °C, envase aeróbico | **4 a 6 días** | [WPSA-AECA](https://www.wpsa-aeca.es/aeca_imgs_docs/01_02_47_calidad.pdf) |
| Atmósfera modificada (N₂/CO₂ 30/70) | extiende la vida útil | idem |
| *Comparación: vacuno a −1 °C* | *hasta 3 semanas* | *[FAO](https://www.fao.org/4/t0566s/t0566s12.htm)* |

**El contraste es el dato de diseño:** 4-6 días contra 3 semanas. El pollo se degrada **entre tres y
cinco veces más rápido** que el vacuno. Y la temperatura legal del pollo (−2 a 2 °C) es más
exigente que la refrigeración comercial habitual de 3-7 °C que documentó la investigación del
vacuno. **FEFO y alertas de vencimiento no son un adorno acá: son el corazón del problema.**

### 2.6 Normativa

- **[CAA art. 256](https://ldz.eregulations.org/media/Capitulo_VI.pdf)** define **"ave eviscerada"**:
  se le removieron cabeza, tráquea, esófago, estómagos glandular y muscular, intestinos, pulmón,
  sacos aéreos, corazón, bazo e hígado con vesícula, ovarios y testículos. **El pollo que llega no
  tiene cabeza** — si viene "con menudos", vienen aparte, en bolsa.
- El mismo artículo **permite fraccionar el ave en presas "en establecimientos autorizados"**, con
  identificación del envase y cierre que garantice su inviolabilidad.
  ⚠️ **[SIN CONFIRMAR] si una carnicería minorista cuenta como "establecimiento autorizado" para
  trozar.** En la práctica trozan; la redacción admite lectura restrictiva. **Antes de escribir un
  flujo de despiece de pollo en el código, esto hay que verificarlo** — es el tipo de detalle donde
  el sistema puede quedar documentando una práctica que la norma no ampara.
- **El Remito Electrónico Cárnico NO cubre aves.** Alcanza a "carnes y subproductos de faena de las
  especies **bovina/bubalina y porcina**"
  [FUENTE: ARCA, RG 4256/18](https://www.afip.gob.ar/actividadesAgropecuarias/sector-pecuario/remito-electronico-carnico/que-es.asp).
  Consecuencia: **la precarga automática de la recepción por REC —etapa 6 del plan del vacuno— no va
  a funcionar para pollo.** Para pollo la carga es manual o por voz, sin atajo posible.
- **[SIN DATO]** régimen de trazabilidad avícola equivalente. SENASA tiene programas sanitarios
  avícolas, pero no se encontró un documento de traslado obligatorio comparable al REC.

### 2.7 La economía: precios mayoristas y si conviene trocear

**Lista real de un distribuidor mayorista, septiembre de 2026**
[FUENTE: Distribuidora Sanju / pollo27](https://www.pollo27.com.ar/):

| Producto | Formato | Precio | **$/kg [DERIVADO]** | **× el entero** |
|---|---|---|---|---|
| Pollo entero (SOYCHU) | cajón | $58.000 | **$2.900** | 1,00× |
| Filet (pechuga) rojo | caja 20 kg | $126.000 | **$6.300** | **2,17×** |
| Filet verde | caja 20 kg | $124.000 | **$6.200** | 2,14× |
| Pata y muslo fresca | caja 15 kg | $42.000 | **$2.800** | **0,97×** |
| Pata block | caja 15 kg | $40.000 | **$2.667** | 0,92× |
| Alitas | caja 15 kg | $38.000 | **$2.533** | **0,87×** |
| Picada MDM | caja 20 kg | $30.000 | **$1.500** | 0,52× |

*Un segundo proveedor tiene el cajón de 20 kg a $78.000 = $3.900/kg
[FUENTE Piquimau]. **La diferencia de 34 % entre los dos no se explica con los datos que hay**
(marca, fecha de actualización de la página, zona). No usar estos precios como referencia de
mercado: usarlos solo por la **estructura relativa**, que es lo que interesa.*

**Lo que dice esa estructura [DERIVADO]:**

1. **La pechuga es la única presa que vale más que el pollo entero.** 2,17×.
2. **Pata y muslo, alitas y picada valen MENOS por kilo que el pollo entero.** Entre 0,52× y 0,97×.
3. Por lo tanto: **trocear un pollo es rentable solo por la pechuga.** El resto del ave vale menos
   suelto que entero. Esto es lo inverso del vacuno, donde el subsidio cruzado se reparte entre
   muchos cortes con múltiplos de 0,86× a 2,16×.
4. Y la consecuencia comercial: **un carnicero que necesita filet tiene dos caminos con economía
   distinta** — comprar la caja de filet a $6.300/kg, o trocear pollos enteros a $2.900/kg y quedarse
   con el problema de vender el resto. **Cuál le conviene depende de su mostrador, no de una tabla.**

**[SIN DATO]** precios de mostrador de pollo entero vs. presas en carnicería argentina, que es lo que
haría falta para cerrar la cuenta del margen.

---

## 3. CERDO

### 3.1 Cómo llega: la media res de cerdo sigue viva

**La pregunta más importante del documento de partida tiene respuesta: se compra de las dos formas,
y la media res sigue siendo común.**

- **El troceo obligatorio nunca alcanzó al cerdo.** La Resolución 91/2022, que reglamentó el troceo,
  aplica a **"los bovinos (vacunos y bubalinos)"** y fija el límite de 32 kg para esa especie
  [FUENTE](https://www.noticiasagropecuarias.com/2022/10/28/se-publico-la-resolucion-que-reglamenta-el-troceo-de-la-media-res/).
  Y además **se dejó de aplicar en enero de 2023**
  [FUENTE](https://comercioyjusticia.info/economia/finalmente-no-habra-troceo-y-siguen-las-medias-reses/).
  El sector porcino esperaba quedar incluido —lo escribió en octubre de 2022
  [FUENTE: Infopork](https://infopork.com/2022/10/el-fin-de-la-media-res/)— y no quedó.
- **Lo que sí sigue vigente es la Resolución SRT 22/2021**, que limita a 32 kg el acarreo manual de
  productos cárnicos [FUENTE: idem Comercio y Justicia]. Una media res de cerdo pesa 40-45 kg:
  **la misma contradicción práctica que en vacuno** (la pieza es legal, hombrearla no).
- **Testimonio del sector, octubre 2022** (Juan Luis Uccelli, consultor porcino)
  [FUENTE: Infopork](https://infopork.com/2022/10/el-fin-de-la-media-res/):
  *"un porcentaje considerable de cerdos se sigue vendiendo en media res, y el carnicero hace el
  desposte él mismo."* Y el dato histórico: *"hace diez o doce años venía todo cortado de ciclo 2"* —
  o sea que el país ya estuvo en el otro modelo y volvió a la media res **para bajar costos de mano
  de obra en el frigorífico**.
- **Los dos canales están abiertos hoy:** [Frigorífico SADA](https://www.frigorificosada.com.ar/carne-porcina)
  vende mayorista **media res de cerdo** *y* cortes sueltos (carré, solomillo, bola de lomo, cuadrada,
  cuadril, peceto, pechito con manta, bondiola, paleta, matambrito).

**Pesos:**

| Dato | Valor | Fuente |
|---|---|---|
| **Peso promedio de res porcina, Argentina** | **95 kg/cabeza (2025 y 2024)** · 93 kg (2023) | [Anuario Porcino 2025](https://www.magyp.gob.ar/sitio/areas/porcinos/estadistica/_archivos//000005-Anuario/250000_Anuario%202025.pdf) |
| **→ media res [DERIVADO]** | **47,5 kg** | 95 ÷ 2 |
| Media res ofrecida al público | **40 a 45 kg**, $5.500/kg | [La Señalada](https://www.lasenaladacarnes.com/productos/mediaresdecerdo) |
| Media res de un capón de 110 kg | 40-45 kg | [Infopork](https://infopork.com/2022/10/el-fin-de-la-media-res/) |
| Faena total 2025 | 8.517.433 cabezas (+2,5 %) | [Anuario Porcino 2025](https://www.magyp.gob.ar/sitio/areas/porcinos/estadistica/_archivos//000005-Anuario/250000_Anuario%202025.pdf) |
| Rendimiento de faena (peso vivo → canal) | **78-82 %** (95-100 kg PV), hasta 81-82 % en pesados | [Todocarne](https://todocarne.es/canal-porcina/) *(España)* |
| Rendimiento de faena, Uruguay | **81,61 %** | [CIAP](https://www.ciap.org.ar/Sitio/Archivos/diagnosticodesituaciondelacalidaddelacarneporcina.pdf) |

**Las tres fuentes de peso convergen en 40-47 kg por media res.** Es **menos de la mitad** de una
media res de novillo (~110-124 kg). Cabe en una sola persona, entra en una cámara chica, y se
desposta en una sesión.

**Y trae cosas que el vacuno no trae.** La media res de cerdo comercializada incluye:
**carré, pechito, bondiola, solomillo, pernil, paleta, cuerito, huesito, patita y cabeza**
[FUENTE La Señalada]. Cuerito, patita y cabeza **no son cortes vendibles al mostrador de la misma
manera** — son producto con destino propio (o descarte). El vacuno no tiene este problema: la cabeza
y las patas no vienen con la media res.

### 3.2 Los cortes y el problema del nomenclador

**No existe nomenclador oficial de cortes porcinos en Argentina. [SIN DATO]** Vacuno tiene el del
IPCVA; ovino tiene el suyo desde 2019 (Disposición 3/2019). Porcino no aparece.

Lo más cercano es el **glosario del MAGyP** de cortes bovinos, porcinos y ovinos: ~25 cortes
porcinos, multilingüe, **sin códigos, sin pesos y sin rendimientos**, y sin carácter normativo
[FUENTE](https://www.magyp.gob.ar/sitio/areas/bovinos/informacion_interes/informes/_archivos//000018_Nomencladores/000000-%20Presentaci%C3%B3n%20glosario%20de%20cortes%20bovinos,%20porcinos%20y%20ovinos.pdf).
Sí define **"media res o media canal"**, con y sin cabeza, y el **corte CEE**.

**Consecuencia directa para el catálogo:** en vacuno se usaron los códigos del IPCVA como columna
vertebral porque *"un código inventado se lee como oficial"*. **Para cerdo no hay códigos que
copiar.** El catálogo de cerdo va a ser nomenclatura de uso comercial, y hay que asumirlo
explícitamente en lugar de inventar un esquema con pinta de oficial.

**Cortes de uso corriente en Argentina** [FUENTE: [Perfil](https://www.perfil.com/noticias/economia/uno-por-uno-todos-los-cortes-de-cerdo.phtml)]:
bondiola, carré, codillo, manitos/patitas, solomillo, tocino, jamón (pernil), paleta, panceta,
costillar, manta parrillera, pechito, matambrito, churrasquito.

**Y acá aparece el hallazgo de catálogo más útil de toda la investigación de cerdo:**

> **El jamón (pernil) se subdivide en cinco cortes con los MISMOS nombres que el vacuno**: bola de
> lomo, cuadrada, cuadril, nalga y peceto. [FUENTE Perfil] SADA los vende sueltos con esos nombres.

Esto es **exactamente** la estructura padre/hijo que ya existe en el modelo
(`producto_padre_id`, `separable`): el pernil a veces se vende entero y a veces se abre en cinco.
**Pero trae un riesgo de ambigüedad grave:** "peceto" y "cuadrada" **ya existen en el catálogo como
cortes vacunos**. Si un cliente escribe "un kilo de peceto", el bot tiene que saber de qué especie
habla. En vacuno el problema análogo fue "roast beef", que se resolvió definiendo la pieza. Acá es
peor, porque no es un nombre ambiguo: **son cinco nombres idénticos en dos especies**.

### 3.3 Rendimiento: dos fuentes parciales y una discrepancia que hay que resolver

#### Fuente A — CIAP, % de la media canal (Uruguay)

[FUENTE: Diagnóstico de situación de la calidad de carne porcina (CIAP)](https://www.ciap.org.ar/Sitio/Archivos/diagnosticodesituaciondelacalidaddelacarneporcina.pdf) ·
canal promedio 69,07 kg (media canal 30,77 kg) · animales de 55-110 kg PV, 85 % por debajo de 100 kg:

| Corte | Rango | Punto medio [DERIVADO] |
|---|---|---|
| Espinazo (lomo) | 11,31 - 16,05 % | 13,68 % |
| Jamón | 13,44 - 20,06 % | 16,75 % |
| Asado | 9,86 - 12,62 % | 11,24 % |
| Paleta | 7,00 - 9,66 % | 8,33 % |
| Bondiola | 3,09 - 4,93 % | 4,01 % |
| **SUMA de los 5 cortes** | | **54,01 %** |
| **Residuo no abierto** | | **45,99 %** |

La propia fuente dice el motivo de los rangos tan anchos: *"disparidad entre empresas a la hora de
realizar los recortes"*. **Casi la mitad de la media canal queda sin abrir** — ahí están panceta,
tocino, cabeza, patitas, cuerito, huesos, recortes y merma.

Es el mismo caso que el INAC en vacuno: **una tabla institucional regional, parcial pero coherente.**
La diferencia es que el INAC cubría 66,65 % y esta cubre 54 %.

#### Fuente B — un practicante, % de peso vivo

Un profesional del rubro publicó su propia medición sobre cerdos de calidad buena de 100 kg de peso
vivo [FUENTE: foro Engormix](https://www.engormix.com/porcicultura/rendimiento-pieza-porcinos/porcentajes-rendimientos-piezas_f3660/).
**Es un foro, no una publicación técnica — y se marca como tal.** Pero tiene una propiedad que la
hace útil: **cierra.**

| Pieza | % del peso vivo | **% de la canal [DERIVADO]** |
|---|---|---|
| Jamón | 23 | **29,5 %** |
| Paleta | 14 | **17,9 %** |
| Carré | 11 | **14,1 %** |
| Pecho con manta | 11 | **14,1 %** |
| Grasa | 10 | **12,8 %** |
| Hueso | 5 | **6,4 %** |
| Cuero | 4 | **5,1 %** |
| **SUMA** | **78 %** ≈ el rinde de faena | **100,0 %** ✅ |

**[DERIVADO]** Que los siete renglones sumen 78 % del peso vivo —justo el rendimiento de faena
documentado (78-82 %)— es una señal de coherencia interna: **es la canal entera descompuesta, sin
agujeros.** Convertida a base canal, suma 100,0 % exacto.

#### La discrepancia que hay que resolver antes de cargar nada

| Corte | Fuente A (CIAP) | Fuente B [DERIVADO] | Diferencia |
|---|---|---|---|
| **Jamón** | 16,75 % de la media canal | **29,5 %** de la canal | **1,8×** |
| **Paleta** | 8,33 % | **17,9 %** | **2,1×** |
| **Carré / espinazo** | 13,68 % | 14,1 % | coinciden |

**Y la explicación más probable no es que una esté mal: es que no hablan de la misma pieza.** El CIAP
mide lo que la empresa **entrega como corte** (jamón deshuesado y recortado, listo para chacinado);
el practicante mide lo que **sale de la canal** (el pernil entero, con hueso y cuero). El carré, que
casi no cambia entre las dos, es justamente el corte que se recorta parecido en los dos casos.

**Es el caso del vacío del vacuno otra vez**, y con el doble de magnitud: *6,20 % en el INAC contra
~3,0 % en los catálogos, y ninguno está mal.* La conclusión es la misma y hay que respetarla:
**el nombre no alcanza; hay que fijar dónde empieza y dónde termina cada pieza antes de cargar un
porcentaje.**

#### [SIN DATO] — lo que no existe para cerdo

1. **Ninguna tabla argentina de rendimiento por corte de media res porcina.** Ni oficial, ni de
   cámara, ni de INTA.
2. **Cuánto es hueso y cuánto grasa en una media res porcina argentina**, con apertura por corte.
   El perfil de grasa del cerdo es muy distinto al del vacuno (el practicante da 12,8 % de grasa
   sobre canal, contra 8 % que se usó para novillo), pero es un solo dato de un foro.
3. **Qué se hace con cuerito, patitas y cabeza** en una carnicería argentina: ¿se venden, se
   regalan, se descartan, van al sebero?
4. **Cuánto de la media res va a elaborados en la carnicería** (chorizo, panceta, matambre
   arrollado). El único dato de estructura es uruguayo y es de industria, no de carnicería:
   **80 % chacinados / 20 % fresco** [FUENTE CIAP] — y en Argentina la tendencia va al revés
   (ver 3.5).
5. **Categorías comerciales del cerdo** equivalentes a novillo/vaquillona/vaca. No se encontró una
   clasificación por peso o tipo de animal que use la carnicería. Solo aparece "capón" como término.

### 3.4 Elaborados y normativa

- **Los chacinados están definidos y regulados aparte**:
  **[CAA art. 302](https://ldz.eregulations.org/media/Capitulo_VI.pdf)** los clasifica en embutidos
  (frescos, secos, cocidos) y no embutidos, con criterios microbiológicos por categoría; y
  **el art. 319 limita la grasa a un máximo del 50 % del producto terminado.**
- **La carne picada sigue siendo art. 255**: se procesa delante del comprador salvo autorización.
  Vale igual para picada de cerdo. **La picada no es un producto con stock propio, es una
  transformación en el momento de la venta** — conclusión ya tomada en vacuno, aplica idéntica.
- **El Remito Electrónico Cárnico SÍ cubre porcina.** "Especies bovina/bubalina **y porcina**",
  obligados: frigoríficos, faenadores, abastecedores, despostaderos, consignatarios **y todo receptor
  de carnes**; excluye ventas a consumidor final
  [FUENTE: ARCA](https://www.afip.gob.ar/actividadesAgropecuarias/sector-pecuario/remito-electronico-carnico/que-es.asp).
  **Esto es importante y es una buena noticia: la etapa 6 del plan del vacuno —precargar la
  recepción leyendo el REC— sirve tal cual para cerdo, y no sirve para pollo.**
- **[SIN DATO]** temperatura de conservación específica para carne porcina fresca en el CAA. Se
  encontró la de aves (art. 256) pero no una equivalente para cerdo; lo razonable es que aplique el
  régimen general de carnes frescas, **pero no se verificó**.

### 3.5 Qué pasa en el mostrador

- **El pechito es el corte estrella y está reemplazando al asado vacuno.**
  *"el reemplazo del asado vacuno"*
  [FUENTE: Infobae jul-2026](https://www.infobae.com/economia/2026/07/27/el-consumo-de-carne-de-cerdo-casi-se-triplico-en-los-ultimos-20-anos-y-ya-compite-con-el-asado-vacuno/).
  Le siguen lomo, pernil, cuadrada y costilla.
- **El crecimiento del consumo es de carne fresca, no de chacinados.** *"Actualmente el boom de
  consumo que se está dando es por la carne fresca; todo eso se tracciona al mostrador"* [FUENTE
  idem]. Y cortes como el pernil, que históricamente *"se destinaba a la industria que realiza los
  chacinados y los fiambres"*, hoy van al mostrador.
- El sector reconoce que **el desposte del cerdo es un problema de oficio no resuelto**: el
  presidente de CAPCOR dice que *"hay que trabajar en los despostes para un mejor consumo de carne
  porcina"*, junto a carniceros y chefs, porque los cortes de cerdo *"se cocinan distinto a los
  cortes vacunos"*
  [FUENTE](https://www.valoragregadoagro.com/2023/05/25/hay-que-trabajar-en-el-desposte-de-la-media-res-de-cerdo-junto-a-los-carniceros-y-los-chefs/).

**Ese último punto es una oportunidad de producto, dicha por el propio sector:** el carnicero
argentino sabe despostar vacuno y **está aprendiendo** a despostar cerdo. Un sistema que le muestre
el rinde real de su media res de cerdo llega en el momento en que lo necesita.

---

## 4. Resumen de los vacíos

**Pollo**

1. Tabla de rendimiento por presa, argentina — **no existe** (no hay INAC de aves).
2. Tabla en base "pollo eviscerado como llega" — **no existe** en ninguna fuente.
3. Relación pechuga con hueso ↔ filet.
4. Dispersión de peso dentro del cajón.
5. Sistema de enfriado del proveedor (define si el pollo llega con agua o con merma).
6. Si una carnicería minorista puede trozar legalmente (art. 256 CAA).
7. Cómo se factura el pollo entero en el mostrador: por kilo o por unidad.

**Cerdo**

8. Tabla de rendimiento por corte de media res porcina, argentina — **no existe**.
9. Nomenclador oficial de cortes porcinos — **no existe**.
10. Hueso y grasa por corte.
11. Destino de cuerito, patitas y cabeza.
12. Cuánto va a elaborados en la carnicería.
13. Categorías comerciales del animal.
14. Temperatura legal de conservación de porcino fresco.

**Los puntos 1, 2, 8 y 10 son los mismos que en vacuno, y la conclusión también es la misma:**
nadie le puede decir al carnicero su rinde real, solo su propia balanza. La diferencia es que en
cerdo se arranca con menos base que en vacuno (54 % de la canal contra 66,65 %), y en pollo **sin
base institucional alguna**.

---

## 5. Fuentes principales

**Pollo**
- [Anuario Avícola 2025 — MAGyP](https://www.magyp.gob.ar/sitio/areas/aves/informes/boletines/_archivos//250000_Anuario%20Avicola%202025.pdf)
- [Suprepollos — caja de 20 kg](https://www.suprepollos.com.ar/productos/pollo-por-caja-de-20-kg) · [Piquimau — cajón de pollo](https://piquimau.com.ar/producto/cajon-de-pollo/) · [Distribuidora Sanju / pollo27 — lista mayorista](https://www.pollo27.com.ar/)
- [Avinews — Rendimiento de canal en broilers](https://avinews.com/rendimiento-de-canal-en-pollos-broilers-algunas-consideraciones/)
- [WPSA-AECA — Calidad de la carne de pollo](https://www.wpsa-aeca.es/aeca_imgs_docs/01_02_47_calidad.pdf)
- [La Tranquera — Pollo moderno: cómo obtener el máximo rendimiento](http://www.latranqueraweb.com.ar/web/archivos/menu/POLLOS.pdf)
- [Scielo Perú — Crecimiento y características de carcasa (seis genotipos)](http://www.scielo.org.pe/pdf/agro/v11n3/2077-9917-agro-11-03-365.pdf)
- [DESCARTADA: Politécnico Jaime Isaza Cadavid — rendimiento en canal y desprese](https://repositorio.elpoli.edu.co/server/api/core/bitstreams/24b8bdb1-0b02-44cf-8381-f23d552161c0/content)
- [Engormix — Pruebas de rendimiento en el deshuese de aves](https://www.engormix.com/avicultura/rendimiento-canal-pollo/pruebas-rendimiento-deshuese-aves_a27469/)

**Cerdo**
- [Anuario Porcino 2025 — MAGyP](https://www.magyp.gob.ar/sitio/areas/porcinos/estadistica/_archivos//000005-Anuario/250000_Anuario%202025.pdf)
- [CIAP — Diagnóstico de situación de la calidad de carne porcina](https://www.ciap.org.ar/Sitio/Archivos/diagnosticodesituaciondelacalidaddelacarneporcina.pdf)
- [Infopork — El fin de la media res (Uccelli)](https://infopork.com/2022/10/el-fin-de-la-media-res/)
- [Noticias Agropecuarias — Resolución 91/2022 que reglamentó el troceo](https://www.noticiasagropecuarias.com/2022/10/28/se-publico-la-resolucion-que-reglamenta-el-troceo-de-la-media-res/) · [Comercio y Justicia — no se aplicó el troceo](https://comercioyjusticia.info/economia/finalmente-no-habra-troceo-y-siguen-las-medias-reses/)
- [Frigorífico SADA — carne porcina](https://www.frigorificosada.com.ar/carne-porcina) · [La Señalada — media res de cerdo](https://www.lasenaladacarnes.com/productos/mediaresdecerdo)
- [Perfil — Todos los cortes de cerdo](https://www.perfil.com/noticias/economia/uno-por-uno-todos-los-cortes-de-cerdo.phtml)
- [MAGyP — Glosario de cortes bovinos, porcinos y ovinos](https://www.magyp.gob.ar/sitio/areas/bovinos/informacion_interes/informes/_archivos//000018_Nomencladores/000000-%20Presentaci%C3%B3n%20glosario%20de%20cortes%20bovinos,%20porcinos%20y%20ovinos.pdf) · [Disposición 3/2019 — nomenclador ovino](https://www.boletinoficial.gob.ar/detalleAviso/primera/222067/20191127)
- [Todocarne — Canal porcina](https://todocarne.es/canal-porcina/)
- [Valor Agregado Agro — desposte de la media res de cerdo (CAPCOR)](https://www.valoragregadoagro.com/2023/05/25/hay-que-trabajar-en-el-desposte-de-la-media-res-de-cerdo-junto-a-los-carniceros-y-los-chefs/)
- [Infobae — El consumo de cerdo casi se triplicó](https://www.infobae.com/economia/2026/07/27/el-consumo-de-carne-de-cerdo-casi-se-triplico-en-los-ultimos-20-anos-y-ya-compite-con-el-asado-vacuno/)

**Normativa y contexto**
- [Código Alimentario Argentino, Capítulo VI](https://ldz.eregulations.org/media/Capitulo_VI.pdf) — art. 255 (picada), 256 (aves), 302 y 319 (chacinados)
- [ARCA — Remito Electrónico Cárnico (RG 4256/18): qué es y a quién alcanza](https://www.afip.gob.ar/actividadesAgropecuarias/sector-pecuario/remito-electronico-carnico/que-es.asp)
- [Infobae — El avance del pollo y del cerdo compensa la caída del vacuno](https://www.infobae.com/economia/2026/04/04/el-avance-del-pollo-y-del-cerdo-compensa-la-reduccion-del-consumo-de-carne-vacuna-en-la-dieta-argentina/)
- [FAO — Conservación por refrigeración](https://www.fao.org/4/t0566s/t0566s12.htm) *(comparación con vacuno)*

---

## 6. Pendiente de verificar a mano

Igual que en vacuno, lo que falta no está en internet:

1. **Si el carnicero piloto troza pollo o compra presas** — y si troza, cuáles.
2. **Cuántos kilos de filet le salen de un cajón de 20 kg.** Una sola medición suya vale más que
   todas las tablas de esta investigación, porque es en la base correcta.
3. **Si compra media res de cerdo o cortes sueltos**, y a qué proveedor.
4. **Qué hace con cuerito, patitas y cabeza.**
5. **Cómo cobra el pollo entero**: por kilo o por unidad.
6. **Si el art. 256 del CAA le permite trozar pollo** en su local — esto se pregunta al bromatólogo
   municipal, no al carnicero.
