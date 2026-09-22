# Stock de pollo y cerdo — diseño

**KILO · v1 · 13/09/2026**
**Se apoya en:** `docs/pollo-y-cerdo-proceso-y-datos.md` (los datos y las fuentes)
**Extiende:** `docs/media-res-diseno-final.md` (el modelo del vacuno, que se reusa)

> **Estado:** decisiones tomadas, listo para construir. Las tres que faltaban las tomó el fundador
> el 13/09 y están en la sección 1. Lo único que queda antes de cargar números de rendimiento es
> media hora con el carnicero piloto — y el diseño está armado para no necesitarla antes de empezar.

---

## 0. El cambio conceptual, en una frase

La investigación no cambió el modelo: **cambió cuál de sus tres piezas es opcional.**

> **El vacuno es la única especie cuya tabla CREA stock.
> Pollo y cerdo arrancan midiendo — y lo que se mide es la tabla.**

Y eso no es una renuncia: es la conclusión de aplicar la regla de no inventar.

- En **vacuno** existía el INAC: una tabla institucional que cubría 66,65 % de la media res de forma
  coherente. Con eso se pudo armar un perfil de 28 cortes que cierra al 100 %.
- En **pollo** no existe nada equivalente — ni argentino, ni regional, ni en la base correcta. Y la
  única tabla con apertura por presa que apareció **suma 102,46 %**. Está descartada.
- En **cerdo** las dos fuentes que hay **discrepan 1,89× justo en los dos cortes más grandes**
  (jamón y paleta), que entre los dos son el **47,4 % de la canal**. Una tabla cuya mitad más pesada
  puede estar al doble no es una hipótesis: es ruido con formato de dato.

**Actualización del 20/09:** para pollo ya hay una medición real — un cajón de 6 trozado y pesado
presa por presa (sección 4.6). Da una tabla v1 que **cierra al 98,8 %** y que converge con la
investigación a 0,66 puntos. **Pero no cambia el modo de entrada:** esa tabla precarga el formulario
de trozado, no explota el cajón en presas. El cajón sigue entrando como aves enteras.

Entonces el motor soporta **dos modos de entrada de lote**, y cada especie usa el que le corresponde:

| Modo | Cómo nacen las piezas | Confianza inicial | Quién lo usa |
|---|---|---|---|
| **Lote con tabla** | Se explotan por porcentajes al cargar el lote | `estimado` | **Vacuno** |
| **Lote con desposte pesado** | Se crean al despostar, con el peso de la balanza | `pesado` | **Cerdo y pollo** |

**Y los dos convergen.** El desposte pesado, repetido 10-20 veces, **es** la tabla de rendimiento de
esa carnicería — con `origen = 'calibrado'` desde el primer día, en vez de `'referencia'`. O sea:
el mecanismo de calibración que en vacuno era un acelerador opcional, acá es el camino principal.
No hay código nuevo conceptual: hay una condición menos.

---

## 1. Decisiones tomadas

| # | Decisión | Elegido | Quién |
|---|---|---|---|
| 1 | Especie en la base | **Campo `especie` aparte**, `categoria` nullable adentro | Fundador, 13/09 |
| 2 | Nombres compartidos (peceto, cuadrada, cuadril, nalga, bola de lomo) | **El bot pregunta siempre de qué especie** | Fundador, 13/09 |
| 3 | Orden de trabajo | **Los tres frentes juntos** | Fundador, 13/09 |
| 4 | Tabla de referencia de **cerdo** | **No se carga ninguna.** Arranca con desposte pesado | Criterio técnico — sección 5.2 |
| 5 | Tabla de referencia de **pollo** | **PERFIL POLLO TROZADO v1**, medido sobre un cajón real. **Precarga el trozado; no crea stock** | Medición del fundador, 20/09 — sección 4.6 |
| 6 | Cabeza, patitas, cuerito, huesito de cerdo | **Piezas con bandera de subproducto**, igual que hueso y grasa en vacuno | Criterio técnico — sección 5.3 |
| 7 | Vencimiento y FEFO de pollo | **Va en el núcleo, no en la etapa 5** | Criterio técnico — sección 4.5 |
| 8 | Reserva de seguridad del pollo entero | **8 %**, y la primera venta real la reemplaza | Criterio técnico — sección 4.4 |
| 9 | "Un pollo": entero o trozado | **Es una preparación del pedido, no otro producto.** El bot pregunta | Fundador, 20/09 — sección 4.3 |
| 10 | Catálogo editable por el carnicero | **Tilde de activo, alta de productos propios y sinónimos propios.** Código y nombre canónico no se tocan nunca | Fundador, 20/09 — sección 8 |
| 11 | Colisión de sinónimos | **Se valida al guardar y se pregunta.** Un sinónimo no puede pisar el nombre canónico ni el sinónimo de otro producto activo | Criterio técnico — sección 8.3 |

### Sobre la decisión 2, y una atenuación que no le quita nada

La repregunta es lo correcto y es la opción segura: son **cinco nombres idénticos en dos especies**,
no un nombre ambiguo aislado como fue "roast beef". El costo es que agrega una repregunta a cinco
cortes vacunos de uso corriente.

**Ese costo se baja a cero sin cambiar la decisión, y encima ya está construido.** `catalogo.ts` ya
filtra los términos ambiguos así — el comentario en el código lo dice con todas las letras: *"Un
término ambiguo solo importa si quedan 2+ productos candidatos activos"*. O sea: la ambigüedad
**existe solo si esa carnicería tiene los dos productos activos en su catálogo.** Si no vende peceto
de cerdo, "peceto" no es ambiguo para ella y el bot no tiene nada que preguntar. La regla, que ya
corre hoy:

```
si hay 2+ productos activos que matchean el término en distintas especies → preguntar
si hay 1 → resolver sin preguntar
```

Es el mismo mecanismo que ya usa el término ambiguo `pollo`. **Para los cinco nombres compartidos no
hay que escribir código: hay que insertar cinco filas en `terminos_ambiguos`.**

---

## 2. La respuesta a la pregunta que ordenaba el trabajo

| | **El LOTE** | **Las PIEZAS** | **La TABLA DE RENDIMIENTO** |
|---|---|---|---|
| **Cerdo** | **Sí** — igual que vacuno | **Sí** — igual que vacuno | **Sí, pero se construye midiendo.** Ninguna de referencia |
| **Pollo** | **Sí, invertido**: el peso es dato, las cabezas son la incógnita | **Sí** — es donde mejor calza de los tres | **No, y probablemente nunca** |

"Ninguna" no fue la respuesta para nadie: **las tres piezas del modelo sirven para los dos.** Lo que
cambia es de dónde salen los números.

---

## 3. Modelo de datos

### 3.1 La migración de `especie` (0025)

```sql
-- recepciones_lote y tablas_rendimiento
alter table recepciones_lote  add column especie text;
alter table tablas_rendimiento add column especie text;

update recepciones_lote   set especie = 'vacuno';   -- todo lo que existe hoy
update tablas_rendimiento set especie = 'vacuno';

alter table recepciones_lote  alter column especie set not null;
alter table tablas_rendimiento alter column especie set not null;

alter table recepciones_lote add constraint especie_valida
  check (especie in ('vacuno','porcino','aviar'));

-- categoria pasa a ser nullable y se valida ADENTRO de la especie
alter table recepciones_lote alter column categoria drop not null;
alter table recepciones_lote drop constraint <el check viejo de categoria>;
alter table recepciones_lote add constraint categoria_valida_por_especie check (
  (especie = 'vacuno'  and categoria in ('novillo','novillito','vaquillona','vaca','ternera'))
  or (especie = 'porcino' and (categoria is null or categoria in ('capon')))
  or (especie = 'aviar'   and categoria is null)
);
```

**Por qué `especie` aparte y no `pollo` metido en `categoria`** — las tres razones, para que no se
vuelva a discutir:

1. **"Novillo" es una categoría *dentro de* vacuno.** Con un solo campo, la columna significa dos
   cosas distintas según la fila, y eso siempre termina en un `if` escondido.
2. **La tabla de rendimiento se busca por (especie, categoría), y en pollo no hay tabla.** Con un
   campo solo, *"no hay tabla para esta categoría"* y *"esta especie no usa tablas"* son el mismo
   NULL y no se pueden distinguir. Con dos campos, el descriptor de especie lo dice y listo.
3. **`where especie = 'porcino'`** contesta "cuánto compré de cerdo este mes" sin mantener listas de
   valores a mano en cada consulta.

**`categoria` de cerdo:** la investigación **no encontró categorías comerciales porcinas**
equivalentes a novillo/vaquillona/vaca. Solo aparece "capón" como término de oficio. Queda nullable
y con `'capon'` admitido, para no forzar una taxonomía que no existe. Si mañana el piloto dice que
distingue, se agrega un valor.

### 3.2 `productos.especie`

También hace falta ahí, y es lo que sostiene la decisión 2: sin `especie` en el producto, el bot no
puede saber que hay dos pecetos.

```sql
alter table productos add column especie text;   -- 'vacuno' | 'porcino' | 'aviar' | null
```

Nullable a propósito: hay productos del catálogo que no son de ninguna especie (bebidas, carbón, lo
que haya) y otros que son mezcla (una hamburguesa mixta). **No forzar.**

### 3.3 El modo de entrada del lote (0025 también)

```sql
alter table recepciones_lote add column modo_carga text not null default 'tabla'
  check (modo_carga in ('tabla','desposte_pesado'));

-- el lote de pollo/cerdo nace sin tabla y sin piezas
alter table recepciones_lote alter column tabla_rendimiento_id drop not null;

-- y necesita saber cuántas unidades trajo, cuando eso aplica
alter table recepciones_lote add column unidades int;   -- cabezas del cajón; null en media res
```

**`tabla_rendimiento_id` pasa a nullable.** Un lote de pollo no tiene tabla, y eso no es un dato
faltante: es la naturaleza del lote. Lo que sí se mantiene intacto es la regla de versionado: **si
el lote tiene tabla, se guarda cuál** — un lote despostado en marzo tiene que seguir explicándose con
la tabla de marzo.

### 3.4 Lo que NO se toca

- **`piezas_stock` no cambia.** `recepcion_lote_id` ya era nullable, y `kg_iniciales`/`kg_restantes`
  ya son todo lo que hace falta. El comentario de la migración `0023` decía literalmente que esto
  entraba *"sin necesidad de un modelo paralelo"*. Se cumplió.
- **`movimientos_stock` no cambia.** Los tipos que ya están (`venta`, `hueso`, `grasa`,
  `recorte_picada`, `merma_frio`, `degradado`, `descuadre`, `ajuste`) alcanzan para las tres
  especies. Se agrega **un** tipo: `trozado` (sección 4.5).
- **`productos.stock_actual` sigue siendo el cache** de la suma de las piezas, y sigue siendo lo
  único que lee el bot. **Del bot de ventas no hay que tocar nada, otra vez.**
- **La regla del 100 %** de la migración `0024` se mantiene igual y **se aplica a las tablas que se
  construyan por calibración**: una tabla calibrada que no cierre está tan rota como una de
  referencia que no cierre.

---

## 4. POLLO

### 4.1 La recepción: el peso es dato, las cabezas son la incógnita

El cajón es un formato cerrado: **20 kg, con 6 a 12 cabezas adentro**, y cada ave envuelta
individualmente. El carnicero elige el tamaño del ave eligiendo cuántas entran.

```
recepcion_lote (especie='aviar', modo_carga='desposte_pesado')
  peso_recibido_kg = 20
  unidades = 10
  → 10 piezas de pollo_entero, 2,00 kg cada una, confianza 'estimado'
```

**Lo que se le pregunta por voz son las cabezas, no los kilos.** Esto invierte el flujo del vacuno y
es el motivo por el que el detector no puede ser el mismo (sección 6).

**El peso del cajón sigue siendo un campo, no una constante.** 20 kg es el formato dominante pero
apareció también el cajón de 10 kg, y no hay ninguna razón para clavarlo en el código. Se precarga
en 20 y se puede corregir.

### 4.2 Las piezas: acá el modelo calza mejor que en vacuno

En vacuno hubo que argumentar que el stock son piezas. En pollo **el proveedor ya lo entrega así**:
cada ave viene en su bolsa. La pieza no es una abstracción nuestra, es el envase.

Y eso desbloquea lo mismo que en vacuno, pero mejor:

- **"¿Tenés un pollo entero?"** se contesta contando piezas disponibles.
- **FEFO** sobre 4-6 días de vida útil, que es donde de verdad se pierde plata (sección 4.4).
- **"Se acabó"** funciona igual.

### 4.3 "Un pollo" no dice cómo entregarlo

Corrección del fundador, y es correcta. Contar piezas contesta **cuántos** pollos hay, pero no
contesta **qué quiere el cliente**. "Un pollo" puede ser dos cosas:

- **entero, sin abrir** — para el horno, relleno, a la parrilla
- **trozado** — la misma ave, cortada en presas, para milanesas, guiso o frito

**Las dos consumen exactamente la misma pieza: un `pollo_entero`.** Por eso esto no es un producto
distinto ni un movimiento de stock distinto: es **cómo hay que entregarlo**. El arreglo va en el
pedido, no en el stock:

- `pedido_items.preparacion` (nullable): `entero` · `trozado` · texto libre.
- **El bot pregunta** cuando el cliente pide un pollo sin aclarar: *"¿Entero o trozado?"*.
- **El ticket del carnicero lo muestra**: "1 pollo — trozado". Sin eso, el carnicero prepara el
  pedido adivinando, que es justo lo que el sistema tiene que sacarle de encima.

Y sirve para mucho más que el pollo: es el mismo campo que resuelve "la nalga cortada en
milanesas", "el asado fino" o "la pechuga sin piel". **[SIN CONFIRMAR]** si el flujo de pedidos ya
tiene dónde poner esto; si lo tiene, se reusa en vez de agregar un campo.

#### La trampa: trozar para un pedido ≠ trozar para la vitrina

Son dos cosas distintas, y si se confunden **el stock se duplica**:

| | Qué pasa con el stock |
|---|---|
| **Trozo un pollo para el pedido de alguien** | Se consume **1 pieza** de `pollo_entero`. **No nace ninguna presa** — se van con el cliente |
| **Trozo 3 pollos para llenar la vitrina** | Se cierran **3 piezas** de `pollo_entero` y **nacen piezas de presas** (sección 4.6) |

Si trozar para un pedido generara piezas de presas, esas presas quedarían en stock **además** de
haberse vendido. Es la misma familia de error que atajó la regla *"un peso real reemplaza al
estimado, nunca se suma"*.

**Criterio de aceptación obligatorio: trozar para un pedido no crea ni una sola pieza nueva.**

### 4.4 La calibración es automática y total

Esto es lo mejor que salió del análisis, y es una propiedad del pollo que el vacuno no tiene:

> **Un pollo entero es una pieza que se vende en UNA sola venta.**
> Una venta = una pieza consumida = **el peso real, exacto, de la balanza del mostrador.**

En vacuno la calibración sin ritual funcionaba bien en los cortes que salen en pocas tajadas
grandes y mal en el asado y la picada. **En pollo entero funciona en el 100 % del producto**, y el
volumen de mediciones es enorme: **un cajón de 10 cabezas son 10 pesadas reales**, sin pedirle nada a
nadie.

Consecuencia práctica: después del **segundo cajón** el sistema conoce el peso real promedio del
pollo de ese proveedor mejor que el proveedor. Y ahí la reserva de seguridad va a cero porque el
peso deja de ser estimado.

**La reserva inicial es 8 %, no 15 %** — y el motivo es que el peso del ave no sale de una tabla de
rendimiento sino de **una división exacta de un peso conocido**. El error posible es que el ave pese
1,90 en vez de 2,00, o sea **5 %**; 8 % lo cubre con margen. Los 15 % del vacuno cubren la
incertidumbre de una tabla de porcentajes, que es un problema de otra magnitud.

⚠️ **Esto es una decisión de política, no un dato.** **[SIN DATO]** cuál es la dispersión real de
peso dentro de un cajón. Si el piloto muestra que es más ancha, se sube el número; es una constante.

### 4.5 El vencimiento va en el núcleo

| | Pollo | Vacuno |
|---|---|---|
| Vida comercial | **4 a 6 días** a 4 °C | hasta 3 semanas a −1 °C |
| Temperatura legal | **−2 a 2 °C** (CAA art. 256) | régimen general |

**El pollo se degrada entre tres y cinco veces más rápido.** En el plan del vacuno las alertas de
degradación y FEFO eran la etapa 5, y estaba bien: con tres semanas de vida útil, un mes de sistema
sin alertas no rompe nada. **Con 4 días, sí.** Un cajón de 10 pollos que se pasa es la pérdida entera
de un cajón.

Entonces para pollo entran juntos desde el principio:

- `piezas_stock.vence_at`, calculado en la recepción a partir de la vida útil de la especie.
- Alerta al carnicero **a 2 días del vencimiento**, no el día del vencimiento.
- FEFO obligatorio en el consumo: la pieza más vieja sale primero, siempre.
- El KPI de kilos vencidos o degradados, visible desde el día uno.

### 4.6 El trozado: un movimiento con salida pesada, y la tabla que lo precarga

```
🎙️ "tro
cé tres pollos"  →  ¿cuánto te dio de filet?  →  "dos cien"
                     ¿pata y muslo?            →  "dos ochenta"
                     ¿alitas?                  →  "seiscientos"
🤖 Listo. 3 pollos (6 kg) → 2,10 filet + 2,80 pata y muslo + 0,60 alitas = 5,50 kg.
   Quedan 0,50 kg de carcasa y merma.
```

Mecánica: **N piezas de `pollo_entero` se cierran, y nacen M piezas de presas con `confianza='pesado'`
y el costo heredado del lote.** Un `movimiento_stock` de tipo `trozado` por cada lado, y la
diferencia va a `merma_frio` o a una pieza de carcasa según lo que el carnicero haga con ella.

**Por qué esto no es el "cierre de desposte" que en vacuno se declaró opcional:** son 4 pesadas sobre
aves de 2 kg, con la balanza ahí, en dos minutos. Lo que se descartó en vacuno era pesar 28 cortes
de una media res de 110 kg todos los días. No es lo mismo y no corre el mismo riesgo de abandono.

**Y estas pesadas son el activo.** A los 20 trozados, esa carnicería tiene su propia tabla de
rendimiento de pollo — **un dato que no existe publicado en ningún lado**, en la base correcta (pollo
eviscerado como llega), con su proveedor y su forma de cortar.

#### PERFIL POLLO TROZADO v1 — la primera medición real

**[FUENTE: video de un carnicero trozando un cajón de 6, transcripto por el fundador el 20/09/2026]**

| Salida | kg medidos | % del cajón | Por ave |
|---|---|---|---|
| Pata y muslo (6 pares) | 8,100 | **40,50 %** | 1,350 kg el par |
| Supremas (12) | 5,750 | **28,75 %** | 0,958 kg |
| Alitas (6 pares) | 2,975 | **14,88 %** | 0,496 kg el par |
| Menudos | 1,200 | 6,00 % | 0,200 kg |
| Piel | 1,165 | 5,83 % | 0,194 kg |
| Carcasa | 0,570 | 2,85 % | 0,095 kg |
| **Suma de lo pesado** | **19,760** | **98,80 %** | 3,293 kg |
| Merma / no contabilizado | 0,240 | 1,20 % | |
| **TOTAL sobre 20 kg** | **20,000** | **100,00 %** ✅ | |

**Cierra — y converge con la investigación por un camino independiente.** Las supremas dan
**28,75 %** del ave; la descomposición de La Tranquera, que es de otra fuente, otro país y otra
metodología, daba **carne blanca 29,41 %** sobre la carcasa. **0,66 puntos de diferencia.** Es el
mismo tipo de validación cruzada que en vacuno dio el INAC contra los catálogos argentinos, y sube
mucho la confianza en el número más importante de la tabla — que es justo el de la presa que manda
en la economía (sección 4.7).

**Tres advertencias, y la segunda es la que importa:**

1. **Es n = 1.** Un carnicero, un cajón, un día. No es un promedio de nada.
2. **Las definiciones de corte son las de ESE carnicero, y la propia tabla lo delata.** La carcasa
   da **95 g por ave**, que es poquísimo para un esqueleto entero; y las alitas dan **496 g el par**,
   que es mucho. La lectura más probable: **sus alitas llevan caballete y su pata y muslo se lleva
   parte del espinazo** — por eso casi no queda carcasa. Si el piloto corta distinto, **tres filas
   de esta tabla cambian de golpe**. Es el caso del vacío del vacuno otra vez: el nombre no alcanza,
   hay que fijar dónde empieza y dónde termina la presa.
3. **[SIN DATO] el peso real de ese cajón.** Se asumieron 20 kg porque es el formato. Si el cajón
   pesaba 19,76, la merma no es 1,2 % sino cero.

#### Cómo se usa esta tabla: precarga el formulario, no crea stock

```
🎙️ "trocé seis pollos"
🤖 Por lo que venís sacando: ~5,750 de supremas · 8,100 de pata y muslo · 2,975 de alitas.
   ¿Te dio así o corregimos alguno?
```

**Y esa es toda la diferencia con el vacuno.** En una media res la tabla *crea* 28 piezas porque
nadie va a pesar 28 cortes todos los días. Acá el carnicero tiene la balanza en la mano y son cuatro
pesadas: **la tabla no reemplaza la balanza, le ahorra tipear.** Cada corrección suya es una
medición nueva que reemplaza a la del video — y a los 10 trozados la tabla ya es suya, con
`origen = 'calibrado'`.

**Riesgo evitado:** si la tabla creara stock, un trozado mal estimado metería presas fantasma en la
vitrina. Precargando, el peor caso es que el carnicero tenga que corregir un número.

### 4.7 Costeo: la pechuga es el único motivo para trozar

Estructura de precios mayoristas verificada (sep-2026), relativa al pollo entero:

| | × el entero |
|---|---|
| **Filet (pechuga)** | **2,17×** |
| Pata y muslo | 0,97× |
| Alitas | 0,87× |
| Picada MDM | 0,52× |

**La pechuga es la única presa que vale más que el pollo entero por kilo.** Todo lo demás vale
*menos* suelto que entero. Eso es lo inverso del vacuno, donde el subsidio cruzado se reparte entre
28 cortes con múltiplos de 0,86× a 2,16×.

**Con la medición de la sección 4.6 eso deja de ser teoría [DERIVADO]:**

| | |
|---|---|
| Valor de las presas de un cajón, a precio mayorista de presas | **$66.441** |
| Costo del cajón entero, a $2.900/kg | **$58.000** |
| **Diferencia** | **+$8.441 — un 14,6 %** |
| **Parte de ese valor que aportan las supremas** | **54,5 %**, con el 28,75 % del peso |

⚠️ Esa cuenta **no descuenta la mano de obra** ni usa precios de mostrador, y **supone que coloca la
piel, los menudos y la carcasa**. Sirve para ver la forma del negocio, no para decidir por él.

Consecuencia de producto: **el panel tiene que poder contestar "¿me conviene trozar o comprar filet?"**
y la respuesta depende de qué hace con el resto del ave. Con el costo por kilo parejo del lote
—mismo método que en vacuno para margen— eso sale solo: el filet aparece con margen alto y la
carcasa con margen negativo, y la pregunta pasa a ser *cuántos kilos de carcasa puede colocar*.

**El REC no existe para pollo.** La precarga automática de la recepción (etapa 6 del vacuno) no es
posible: el Remito Electrónico Cárnico cubre bovina/bubalina y porcina, **no aves**. En pollo la
carga es por voz o manual, siempre. Una razón más para que el flujo de voz del cajón sea corto.

---

## 5. CERDO

### 5.1 La recepción: es la media res del vacuno, en chico

| | Media res de cerdo | Media res de novillo |
|---|---|---|
| Peso | **40 a 47 kg** (tres fuentes convergen) | 110 a 124 kg |
| Piezas que salen | ~10 a 14 | 28 |
| Troceo obligatorio | **nunca le aplicó** (Res. 91/2022 es solo bovinos) | derogado en 2023 |
| REC | **sí** | sí |

Se reusa **toda** la recepción del vacuno: pesos facturado y recibido, proveedor, remito, costos,
temperatura, estado. Cambia `especie`, y el `modo_carga` arranca en `desposte_pesado`.

### 5.2 Por qué no se carga una tabla de referencia de cerdo

Las dos únicas fuentes de rendimiento porcino que existen **discrepan 1,89× en los dos cortes más
grandes**:

| | CIAP (Uruguay) | Practicante (derivado a base canal) |
|---|---|---|
| Jamón | 16,75 % | **29,5 %** |
| Paleta | 8,33 % | **17,9 %** |
| Carré | 13,68 % | 14,1 % ✅ |
| **Jamón + paleta** | **25,1 %** | **47,4 %** |

Y **casi seguro ninguna está mal**: el CIAP mide lo que la empresa entrega como corte (jamón
deshuesado y recortado, para chacinado), el practicante mide lo que sale de la canal (el pernil
entero con hueso y cuero). Prueba indirecta: el carré, que es el que se recorta parecido en los dos
casos, **es el único que coincide**.

Tres motivos para no cargar ninguna, en orden de peso:

1. **Los dos cortes en disputa son el 47,4 % de la canal.** Una tabla cuya mitad más pesada puede
   estar al doble no informa nada. En vacuno las discrepancias estaban en cortes secundarios y el
   INAC cubría 66,65 % de forma coherente; acá la mejor fuente cubre **54 % y deja 46 % sin abrir**.
2. **Ninguna fuente tiene cabeza, patitas ni cuerito**, que **sí vienen en la media res argentina**.
   Sin esas filas la tabla no puede cerrar al 100 % del peso de entrada sin inventarlas, y si no
   cierra, la diferencia se va a descuadre y arruina justo el KPI que sirve.
3. **No hay nomenclador oficial de cortes porcinos.** Vacuno tiene el del IPCVA, ovino tiene el suyo
   desde 2019, porcino no tiene. En vacuno solo se cargaron los 12 códigos verificados porque *un
   código inventado se lee como oficial*. **Acá no hay códigos que verificar contra nada.**

**Y el costo de no tenerla es bajo:** son ~12 piezas sobre 42 kg, una o dos veces por semana. Pesar
12 piezas una vez por semana no es el ritual diario que se descartó en vacuno. A los 10 despostes
tiene su tabla, con `origen='calibrado'`, que es mejor que cualquier referencia que le pudiéramos dar.

### 5.3 Cabeza, patitas, cuerito y huesito

La media res de cerdo comercializada **trae cabeza, patita, cuerito y huesito**. El vacuno no tiene
este problema.

**Decisión: son piezas con `es_subproducto = true`**, exactamente el tratamiento que tienen hueso y
grasa en vacuno (decisión 7 del diseño del vacuno): entran al stock, se les registra el peso, y **no
tienen flujo de venta todavía**.

Por qué así y no como merma: **el cuerito se come** y la patita se vende. No son descarte. Pero
tampoco son un corte del mostrador con precio por kilo en la mayoría de las carnicerías, y
**[SIN DATO]** qué hace con ellos el carnicero argentino. La bandera de subproducto es exactamente
el lugar donde algo espera a que se sepa qué es: está contado, está pesado, y el día que se decida
venderlo se le pone precio sin migrar nada.

### 5.4 El pernil y sus cinco hijos

> **El jamón (pernil) se subdivide en bola de lomo, cuadrada, cuadril, nalga y peceto** — los mismos
> cinco nombres del vacuno. Los frigoríficos los venden sueltos así.

Esto es **exactamente** la estructura que ya existe:

```
pernil  (separable = true)
├─ bola_de_lomo_de_cerdo   producto_padre_id → pernil
├─ cuadrada_de_cerdo
├─ cuadril_de_cerdo
├─ nalga_de_cerdo
└─ peceto_de_cerdo
```

Sale gratis: es el mismo caso de la tapa de asado, que a veces se separa del asado y a veces no. **No
hay código nuevo, hay filas nuevas.**

### 5.5 Lo que ya está a favor

- **El REC cubre porcina.** "Especies bovina/bubalina **y porcina**", y obliga a *"todo receptor de
  carnes"*. La **etapa 6 del plan del vacuno —precargar la recepción leyendo el REC— sirve tal cual
  para cerdo.** Es el único lugar donde cerdo está mejor parado que pollo.
- **El pechito es el corte estrella** y está reemplazando al asado vacuno; el crecimiento del consumo
  es de carne fresca, no de chacinados. El módulo llega a un producto en alza.
- **El sector reconoce que el desposte del cerdo es oficio no resuelto.** El presidente de CAPCOR
  pide trabajar los despostes con carniceros y chefs. Un sistema que le muestre al carnicero el
  rinde real de *su* media res de cerdo llega cuando lo necesita.

### 5.6 Los elaborados quedan afuera, y hay que decirlo

Chorizo, panceta curada, matambre arrollado, bondiola curada: **eso no es desposte, es
transformación**, y el CAA los regula aparte (art. 302 chacinados, art. 319 grasa máx. 50 %).

**No entran en este diseño.** Hoy son productos del catálogo sin lote y se dejan así. Modelarlos
implica una receta con entradas múltiples y un tiempo de proceso, que es otro flujo — el mismo
motivo por el que la picada se resolvió como transformación en el momento de la venta y no como
producto con stock propio (art. 255 CAA, igual para cerdo).

---

## 6. El flujo de voz: un solo detector que devuelve la especie

```
🎙️ "llegó un cajón de diez"
🤖 🐔 Cajón de 20 kg, 10 pollos de 2 kg cada uno. ¿Lo cargo?
   "dale"
🤖 Listo 👍 10 pollos en stock. Vencen el 18/09.

🎙️ "llegó una media res de cerdo de cuarenta y dos"
🤖 🐷 Media res de cerdo de 42 kg. ¿Lo cargo?
   "confirmar"
🤖 Listo 👍 Cargué el lote. Cuando la despostes, decime los pesos.
```

**Dos confirmaciones como máximo**, igual que en vacuno. Y se confirma antes de cargar porque el
cajón crea 10 piezas de una: *"diez"* contra *"doce"* es un error de una sílaba.

### El riesgo de bug que hay que atajar de entrada

Hoy `mencionaMediaRes()` captura "media res" y **asume vacuno**. Si se agrega un detector aparte
para cerdo, quedan dos regex compitiendo por la misma frase y "media res de cerdo" puede entrar como
vacuno y explotarse con la tabla de novillo.

**Es el Patrón 1 del manual de arreglos: dos lugares decidiendo lo mismo y uno decide mal.** Ya nos
costó un bug feo.

**Solución: un solo detector que devuelve la especie**, no tres detectores independientes.

```ts
detectarLote(texto) → { especie: 'vacuno'|'porcino'|'aviar', modo: ... } | null
```

Y se mantiene el reparto que ya está probado: **detectar de qué se habla → texto determinístico;
extraer el dato del lenguaje natural → el modelo.** Lo único que cambia por especie es *cuál* es el
dato a extraer: kilos en media res, cabezas en cajón.

---

## 7. El motor: `lotes.ts` con un descriptor por especie

`mediaRes.ts` se generaliza a `lotes.ts`. **No se clona.** Un `flujoPollo.ts` copia de
`flujoMediaRes.ts` es la duplicación exacta que ya produjo un bug.

Lo que hace que un solo motor alcance es un descriptor chico, declarativo:

| | **vacuno** | **porcino** | **aviar** |
|---|---|---|---|
| Unidad de entrada | media res | media res | cajón |
| Dato que se pregunta | kilos | kilos | **cabezas** |
| Peso del lote | se pregunta | se pregunta | **fijo, precargado en 20** |
| Modo de carga | `tabla` | `desposte_pesado` | `desposte_pesado` |
| Cómo nacen las piezas | 28, por tabla | al despostar, pesadas | **N iguales, una por ave** |
| Confianza inicial | `estimado` | `pesado` | `estimado` (el ave), `pesado` (las presas) |
| Tabla de rendimiento | crea piezas | no hay | **precarga el trozado** |
| Reserva de seguridad | 15 % / 8 % / 0 % | 0 % | **8 % → 0 %** |
| Vida útil | ~3 semanas | por confirmar | **4-6 días, con alerta** |
| Subproductos | hueso, grasa | hueso, grasa, **cabeza, patita, cuerito** | carcasa |
| Precarga por REC | sí | **sí** | **no** |
| Categorías | 5 | `capon` o null | ninguna |

**Tres configuraciones, un motor.** Y el día que aparezca una tabla de referencia confiable de cerdo,
es cambiar una línea del descriptor, no reescribir un módulo.

---

## 8. El catálogo lo maneja el carnicero

Pedido del fundador, 20/09: tilde de lo que comercializa, alta de productos propios, y sinónimos
propios sin tocar los nombres del sistema.

### 8.1 Casi todo esto ya está en la base — lo que falta es la pantalla

| Lo pedido | Estado hoy |
|---|---|
| Tildar qué comercializa y qué no | **Ya existe.** `productos.activo`, y `catalogo.ts` carga solo `activo = true` |
| Agregar ítems que no vienen de fábrica | **La tabla ya lo permite.** `productos` es por carnicería: `unique (carniceria_id, codigo)` |
| Sinónimos propios por corte | **Ya existe.** `producto_sinonimos`, y el prompt del bot se arma con `nombre_display` + sinónimos |
| Que el nombre del sistema no cambie nunca | **Ya está separado.** `codigo` (slug canónico) y `nombre_display` son campos distintos de los sinónimos |

**Lo que falta no es el modelo: es la pantalla.** Hoy `/panel/stock` muestra stock y precios y nada
más — no hay dónde tildar, ni dónde agregar, ni dónde escribir un sinónimo.

### 8.2 La pantalla `/panel/catalogo`

Una fila por producto:

```
☑ Roast beef        vacuno_parrilla    kg      + sinónimo:  [aguja ×] [ojo de bife ×]
☐ Peceto de cerdo   porcino            kg      + sinónimo:  [peceto de chancho ×]
```

- **El tilde escribe `productos.activo`.** Apagar un producto lo saca del prompt del bot en el
  mensaje siguiente: deja de existir para el cliente **sin borrar nada** y sin perder su historia de
  stock ni sus movimientos.
- **"Agregar producto"** crea la fila con `codigo` generado del nombre (slug), `especie`, `unidad` y
  `familia`. Nace sin `codigo_ipcva` y sin padre, y queda marcado como propio de esa carnicería.
- **Los sinónimos** se agregan y se borran de a uno, con la validación de 8.3.

**Tres reglas que no se negocian:**

1. **`codigo` es inmutable.** Es lo que referencian la tabla de rendimiento, el árbol padre/hijo y
   cada movimiento de stock histórico. Si el carnicero pudiera editarlo, un cambio de nombre le
   rompería el historial hacia atrás.
2. **`nombre_display` tampoco se edita** — es el nombre del sistema, tal como pediste. Ver abajo la
   única pregunta abierta que esto deja.
3. **Un producto de fábrica no se borra: se desactiva.** Solo se puede borrar un producto propio que
   nunca tuvo movimientos.

> **Pregunta abierta (decisión 12, pendiente).** Los sinónimos resuelven la **entrada**: el bot
> entiende "aguja". ¿Querés que también cambien la **salida**? Si el cliente escribe "aguja" y el
> bot contesta *"Roast beef: 2 kg"*, parece que no entendió. Se arregla con un `alias_display`
> opcional por carnicería —**cómo lo llamás vos**— que solo afecta lo que se muestra, mientras
> `codigo` y `nombre_display` siguen intactos por dentro. Es una columna y un fallback. **Decidilo
> vos: hoy no está.**

### 8.3 La colisión de sinónimos, que es justo lo que pasa con tu ejemplo

**"Roast beef muchos carniceros lo llaman aguja" — pero `aguja` YA es un producto del catálogo.**
Está en la tabla de rendimiento del novillo con 3,17 % y aparece en el árbol del IPCVA dentro del
compuesto 2301 ("Cogote, Aguja y Paleta"). Si alguien carga "aguja" como sinónimo de roast beef,
**quedan dos productos activos reclamando la misma palabra**, y el bot resuelve con el que encuentre
primero. Es un bug silencioso: nadie se entera hasta que descontó stock del corte equivocado.

**Regla:** al guardar un sinónimo se busca ese texto entre `nombre_display` + sinónimos de **todos
los productos activos** de esa carnicería.

| Caso | Qué hace el panel |
|---|---|
| No colisiona | Guarda. |
| Colisiona con un producto **inactivo** | Guarda, y avisa: *"si algún día reactivás Aguja, van a chocar"*. |
| Colisiona con un producto **activo** | **No guarda a ciegas.** Pregunta: *"'aguja' hoy es tu producto Aguja. ¿(a) 'aguja' pasa a significar Roast beef y dejás de usar el otro · (b) que sea ambiguo y el bot pregunte cada vez · (c) cancelar?"* |

**La opción (b) sale gratis: inserta una fila en `terminos_ambiguos`** — el mismo mecanismo que
resuelve los cinco nombres compartidos entre vacuno y cerdo. Un solo mecanismo para los dos
problemas, en vez de dos soluciones parecidas.

⚠️ **Y el caso del roast beef es más profundo de lo que parece.** La investigación del vacuno ya
había marcado que *"roast beef" es un problema de nomenclatura, no de peso*: para unos catálogos es
el bloque de aguja/bife ancho del delantero (~7 kg) y para otros el bife angosto sin hueso del
trasero (~4-5 kg). Entonces el carnicero que lo llama "aguja" **puede no estar poniendo un sinónimo:
puede estar diciendo que para él son el mismo corte.** Si es así, lo correcto no es agregar un
sinónimo, es **desactivar uno de los dos productos**. Por eso la opción (a) existe y es la primera.

### 8.4 El catálogo y la tabla de rendimiento se tocan

Esto no es obvio y conviene dejarlo escrito: **si el carnicero desactiva un corte que tiene
porcentaje en la tabla de rendimiento, la tabla deja de sumar 100 %** — esos kilos no desaparecen de
la media res, solo dejan de tener dónde ir.

**Regla: cada cambio de catálogo revalida la tabla** con la misma validación de la migración `0024`.
Si al desactivar un corte la tabla no cierra, el panel exige decidir a dónde van esos kilos:
**al producto padre** (lo más común: "la tapa de asado la vendo con el asado") o **a recortes**.

Un producto propio nuevo, al revés, nace **sin** fila en la tabla: existe para vender, pero no le
llegan kilos desde la media res hasta que alguien le asigne un porcentaje o lo cuelgue de un padre.

---

## 9. Plan de etapas

Los tres frentes juntos, en el orden en que las dependencias lo permiten.

| Etapa | Qué trae | Criterio de que está lista |
|---|---|---|
| **1 · La base** | Migración `especie` + `modo_carga` + `unidades` + `productos.especie` · backfill a `'vacuno'` | **El vacuno sigue funcionando exactamente igual.** `tsc`, `lint`, `build` limpios y el flujo de media res sin cambios de comportamiento |
| **2 · El catálogo de cerdo** | Productos de cerdo con `especie` · padre/hijo del pernil · las cinco filas de `terminos_ambiguos` para los nombres compartidos | "Un kilo de peceto" pregunta la especie **solo si** la carnicería tiene los dos activos |
| **2b · El catálogo editable** | Pantalla `/panel/catalogo`: tilde de activo · alta de productos propios · sinónimos con validación de colisión · revalidación de la tabla | El carnicero agrega "aguja" como sinónimo de roast beef y **el panel le avisa de la colisión en vez de romperle el bot** |
| **3 · El motor genérico** | `mediaRes.ts` → `lotes.ts` con descriptor · `detectarLote()` único · modo `desposte_pesado` | Una media res de vacuno se carga igual que antes, por el camino nuevo |
| **4 · Cerdo** | Recepción de media res porcina · desposte pesado · subproductos (cabeza, patita, cuerito) · costo y margen | Una media res de cerdo se carga por voz, se desposta pesando, y el balance cierra |
| **5 · Pollo** | Recepción del cajón (cabezas → piezas) · venta de pollo entero con peso real · **preparación entero/trozado en el pedido** · **vencimiento, alerta a 2 días y FEFO** | Un cajón se carga en menos de un minuto · "un pollo" pregunta entero o trozado · **trozar para un pedido no crea piezas nuevas** |
| **6 · Trozado de pollo** | Movimiento `trozado` con pesada · **PERFIL POLLO TROZADO v1 precargando el formulario** · carcasa y merma · "¿conviene trozar o comprar filet?" | El carnicero corrige los números precargados y la tabla pasa a `origen='calibrado'` |
| **7 · Que aprendan** | Las pesadas de desposte y trozado construyen `tablas_rendimiento` con `origen='calibrado'` para cerdo y pollo · mediana y P10-P90 | A los 10-20 lotes hay tabla propia, y **cierra al 100 %** |

**La etapa 1 es la más riesgosa de todas y no parece.** Es una migración sobre tablas con datos del
vacuno andando. El criterio de aceptación no es "compila": es **que el vacuno no cambie de
comportamiento en nada**.

---

## 10. Lo que falta, y por qué no bloquea

Igual que en vacuno, lo que falta no está en internet. **La diferencia es que este diseño está armado
para arrancar sin eso** — porque no carga ninguna tabla de referencia, no hay ningún número que el
carnicero tenga que validar antes de que el sistema sirva.

Preguntas para el piloto, en orden de valor:

1. **¿Troza pollo o compra presas?** Si compra presas, la etapa 6 baja de prioridad y el cajón de
   presas entra como un lote de un solo producto. Si troza, la etapa 6 es la que construye el activo.
2. **¿Corta el pollo como el del video?** Ya no hace falta pedirle el dato desde cero — hace falta
   **contrastar**. Las tres preguntas concretas: ¿las alitas se las lleva con caballete? ¿la pata y
   muslo se lleva parte del espinazo? ¿saca la piel de las supremas? Si contesta que sí a las tres,
   el PERFIL v1 le sirve tal cual desde el día uno.
3. **¿Querés `alias_display`?** (decisión 12, sección 8.2) Si el cliente dice "aguja", ¿el bot le
   contesta "aguja" o "Roast beef"?
4. **¿Compra media res de cerdo o cortes sueltos?** Los dos canales están abiertos. Define si la
   etapa 4 arranca por el lote o por la caja.
5. **¿Qué hace con cuerito, patitas y cabeza?** Define si el subproducto necesita flujo de venta.
6. **¿Cómo cobra el pollo entero: por kilo o por unidad?** **[SIN CONFIRMAR]** en la investigación.
7. **¿Cuánto varía el peso de los pollos dentro de un cajón?** Es el número de la reserva del 8 %.

Y una que no es para él: **si el art. 256 del CAA le permite trozar pollo en su local.** El artículo
permite fraccionar en presas *"en establecimientos autorizados"*, y **[SIN CONFIRMAR]** si una
carnicería minorista cuenta como tal. En la práctica trozan. Esto se pregunta al bromatólogo
municipal antes de escribir el flujo de trozado, no al carnicero.
