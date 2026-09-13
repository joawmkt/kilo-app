# Stock por media res — diseño final

**KILO · v3 · 12/09/2026**
**Reemplaza a:** `docs/media-res-propuesta-stock.md` (v1) y a la v2 del 12/09
**Se apoya en:** `docs/media-res-proceso-y-datos.md` (los datos y las fuentes)

> **Estado:** decisiones tomadas. La tabla está calculada y es cargable. Falta una sola cosa antes
> de construir: media hora con el carnicero piloto para validar los repartos de la sección 3.

---

## 0. Qué se sacó, y por qué

La v2 tenía sofisticación que no se pagaba sola. El fundador la revisó punto por punto y esto es lo
que quedó afuera. **Se deja escrito para que nadie lo vuelva a proponer sin un motivo nuevo.**

| Lo que proponía la v2 | Qué pasó |
|---|---|
| Seis estados de confianza | **Quedan dos: estimado y pesado.** Los otros cuatro no eran confianza: "contado" era contar piezas, "reservado" es un pedido que aparta kilos, "vendido" es un movimiento y "ajustado" es un movimiento con causa. El doc B mezcló tres conceptos en una lista |
| Bolsa de "otros cortes y recortes" (6 %) | **Sale.** "Otros: 6,6 kg" no es stock, es un misterio. Se subdividen las filas del INAC en los cortes argentinos que contienen (sección 3) |
| Cinco pesos en la recepción | **Dos obligatorios** (facturado y recibido) **+ uno opcional** (pre-desposte). Los otros dos eran movimientos, no pesos guardados |
| Costeo y margen "para más adelante" | **Se construye ahora.** Fue un error mío: la sección 13 de la especificación prohíbe que **el bot le cante precios al cliente**, no que el panel le muestre al carnicero su propio margen. El panel ya maneja precios |
| `perfiles_desposte` | Se llama **`tabla_rendimiento`**, que es como la llama el fundador. Era un nombre feo para "la tabla de porcentajes" |

**Lo que se discutió y se mantuvo:** el contador de piezas. Ver la sección 2, donde está resuelta la
objeción que lo puso en duda.

---

## 1. Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| 1 | Vendible de arranque | **70 %** |
| 2 | Peso real al entregar | **Opcional**, con el estimado precargado |
| 3 | Categorías del piloto | **Novillo y vaca** — dos tablas |
| 4 | Stock por pieza | **Sí**, y se puede ver en piezas o en kilos |
| 5 | Costeo | **Completo**, incluido margen por corte |
| 6 | Desposte de una o por partes | **El lote se abre completo** |
| 7 | Hueso y grasa | **Piezas con bandera de subproducto**, sin flujo de venta todavía |

Sobre la 1, el razonamiento que conviene no perder: es **asimétrico**. Pasarse para arriba hace que
el bot prometa carne que no hay, y eso es un cliente perjudicado. Pasarse para abajo es una sorpresa
agradable. Con información incompleta, el error barato es el de abajo.

---

## 2. La pieza y el kilo — cómo conviven sin pelearse

La objeción que puso esto en duda era buena: **dos números que pueden discrepar es el mismo problema
de stock fantasma, movido de lugar.** Si hay un contador de piezas y un contador de kilos, tarde o
temprano dicen cosas distintas.

**La solución es que no sean dos números.** El stock se guarda como **piezas, y los kilos viven
adentro de cada pieza**:

```
Peceto
├─ pieza #1 (media res del 8/9)   1,58 kg estimados → quedan 0,86
└─ pieza #2 (media res del 11/9)  1,58 kg estimados → quedan 1,58
```

De ahí salen las dos vistas, **calculadas, nunca guardadas por separado**:

- **En kilos** = la suma de lo que queda en cada pieza → 2,44 kg
- **En piezas** = cuántas tienen algo → 2 piezas

**No pueden discrepar porque una se calcula de la otra.** Es un solo dato con dos formas de mirarlo,
no dos datos que hay que mantener sincronizados.

### Qué habilita

1. **"¿Tenés un peceto entero?"** — hoy no se puede contestar. Con esto sí.
2. **Saber qué pieza lleva más días en la cámara** (FEFO), que es de dónde salen los 7,5 kg por
   animal que se degradan a picada.
3. **La calibración sin ritual** — ver abajo.
4. **El "se acabó"**: cuando el carnicero dice que se terminó el peceto, se cierra la pieza más vieja
   y sus kilos van a cero. Sin auditoría, sin planilla.

### La calibración sin ritual

Acá está la parte que ninguna de las tres propuestas originales tenía, y sale justamente de llevar
las piezas.

**Cuando una pieza se termina, ya sabemos cuántos kilos salieron de ella.** Y esa diferencia contra
lo que la tabla había estimado **es una medición**, conseguida sin pedirle nada a nadie:

> La tabla estimó el peceto de esta media res en 1,58 kg.
> Se vendió en tres veces: 0,60 + 0,55 + 0,72 = **1,87 kg**, y ahí se acabó la pieza.
> → El peceto de este proveedor rinde ~18 % más que la referencia. Anotado.
> **Nadie pesó nada de más. Era la balanza del mostrador, que ya estaba pesando igual.**

Esto es lo que convierte el "cierre de desposte" del doc B —pesar cortes después de despostar— de
**obligatorio** a **acelerador opcional**. Importa porque todo sistema de stock que depende de una
tarea administrativa diaria se abandona a las tres semanas.

> **Honestidad sobre el alcance.** Funciona bien en cortes que salen en pocas tajadas grandes:
> peceto, lomo, matambre, colita, tapa de cuadril. Funciona mal en el asado y la picada, que salen
> en muchas ventas chicas y de lotes mezclados. **No reemplaza al cierre de desposte: lo hace
> opcional para la mitad del catálogo.**

### Los dos estados de confianza

| Estado | Cuándo | Qué implica |
|---|---|---|
| **Estimado** | La pieza nació de la tabla al cargar la media res | El bot ofrece con reserva de seguridad |
| **Pesado** | Alguien la pesó (al despostar o al entregar) | Sin reserva: es el número real |

**Regla de oro: un peso real REEMPLAZA al estimado, nunca se suma.** Es el error clásico que duplica
stock, y es criterio de aceptación obligatorio para la Etapa 1.

### La reserva de seguridad se achica sola

| Confianza | Reserva | Por qué |
|---|---|---|
| Estimado, tabla sin calibrar | 15 % | No sabemos nada todavía |
| Estimado, tabla calibrada | 8 % | Ya hay historia de esta carnicería |
| Pesado | 0 % | Lo pesó él |

Fijarla en 15 % para siempre castigaría al carnicero que sí carga datos: vería menos stock del que
tiene y perdería ventas.

**Y acá KILO tiene una ventaja que las otras propuestas no sabían que existía:** el carnicero aprueba
cada pedido antes de confirmarlo. El stock estimado nunca llega solo al cliente — siempre pasa por
los ojos de alguien que está mirando la mercadería. Por eso podemos permitirnos una reserva más
chica que un sistema sin esa red.

---

## 3. La tabla — 28 cortes, sin bolsas

### 3.1 Cómo se armó

Dos reglas, y la segunda es la que evita el error que arruinó una de las propuestas:

**La forma la pone el INAC, la escala la ponés vos.** Los porcentajes del INAC son confiables para
decir *qué proporción tiene cada corte respecto de los otros*; no para decir *cuánto suma el total*,
porque eso ninguna fuente lo resuelve (68 %, 75 %, 65-72 % según a quién le preguntes). Se multiplica
la forma por el factor que hace que dé 70 %. Si mañana el piloto demuestra que el vendible real es
73 %, **se cambia un número y toda la tabla se reescala sola.**

**Para tener todos los cortes no se suman tablas: se SUBDIVIDEN filas.** Sumar los cortes argentinos
que le faltan al INAC daría 79 % de vendible, más que cualquier fuente — porque las definiciones se
solapan y se contarían los mismos kilos dos veces. En cambio cada fila del INAC se parte en los
cortes argentinos que contiene, **sumando exacto al padre**:

| Fila del INAC | Se parte en | Suma |
|---|---|---|
| Asado 9,85 | Asado 7,35 + Tapa de asado 2,50 | 9,85 ✅ |
| Vacío c/hueso 6,20 | Vacío 3,00 + Matambre 1,30 + Entraña 0,50 *(proporcional)* | 6,20 ✅ |
| Nalga 6,10 | Nalga sin tapa 4,10 + Tapa de nalga 1,50 *(proporcional)* | 6,10 ✅ |
| Cuadril 3,90 | Cuadril 2,50 + Colita de cuadril 1,10 *(proporcional)* | 3,90 ✅ |
| Pulpa de paleta 3,30 | Paleta 2,30 + Palomita 1,00 *(proporcional)* | 3,30 ✅ |

No se agregan kilos: se reparten. Y **recortes para picada es una línea propia**, porque es una
salida real del desposte, no un misterio.

### 3.2 Perfil NOVILLO v1

Escala ×0,9315 sobre una forma de 75,15 %.

| Corte | % | En 110 kg | De dónde sale |
|---|---|---|---|
| Asado / tira de asado | 6,85 | 7,5 kg | subdividido de Asado |
| Recortes para picada | 4,66 | 5,1 kg | salida de desposte |
| Cogote | 4,38 | 4,8 kg | **INAC** |
| Nalga sin tapa | 4,16 | 4,6 kg | subdividido de Nalga |
| Vacío | 3,61 | 4,0 kg | subdividido de Vacío c/hueso |
| Bife ancho (ojo de bife) | 3,35 | 3,7 kg | **INAC** |
| Cuadrada | 3,35 | 3,7 kg | **INAC** |
| Bola de lomo | 3,26 | 3,6 kg | catálogos argentinos |
| Aguja | 3,17 | 3,5 kg | **INAC** |
| Pecho | 3,17 | 3,5 kg | **INAC** |
| Bife angosto | 3,07 | 3,4 kg | **INAC** |
| Brazuelo | 2,61 | 2,9 kg | **INAC** |
| Cuadril | 2,52 | 2,8 kg | subdividido de Cuadril |
| Tapa de asado | 2,33 | 2,6 kg | subdividido de Asado |
| Falda | 2,33 | 2,6 kg | **INAC** |
| Paleta | 2,14 | 2,4 kg | subdividido de Pulpa de paleta |
| Lomo | 1,58 | 1,7 kg | **INAC** |
| Peceto | 1,58 | 1,7 kg | **INAC** |
| Matambre | 1,56 | 1,7 kg | subdividido de Vacío c/hueso |
| Tapa de nalga | 1,52 | 1,7 kg | subdividido de Nalga |
| Tortuguita | 1,49 | 1,6 kg | **INAC** |
| Garrón / osobuco | 1,40 | 1,5 kg | **INAC** |
| Marucha | 1,30 | 1,4 kg | **INAC** |
| Tapa de cuadril (picaña) | 1,21 | 1,3 kg | **INAC** |
| Colita de cuadril | 1,11 | 1,2 kg | subdividido de Cuadril |
| Palomita | 0,93 | 1,0 kg | subdividido de Pulpa de paleta |
| Chingolo | 0,75 | 0,8 kg | **INAC** |
| Entraña | 0,60 | 0,7 kg | subdividido de Vacío c/hueso |
| **VENDIBLE** | **70,00** | 77,0 kg | |
| Hueso | 18,00 | 19,8 kg | subproducto |
| Grasa recuperable | 8,00 | 8,8 kg | subproducto |
| Merma de frío y proceso | 4,00 | 4,4 kg | no vendible |
| **TOTAL** | **100,00** | 110,0 kg | ✅ |

**Aviso honesto sobre los repartos.** El total de cada grupo es dato del INAC; **el reparto adentro
del grupo es inferencia mía**, hecha con las proporciones de los catálogos argentinos. Por eso la
última columna dice de dónde sale cada número, y por eso la media hora con el carnicero es lo que
más vale de todo este documento.

### 3.3 Perfil VACA v1 — hipótesis declarada

**No existe ni una sola fuente pública que publique rendimiento por corte de vaca.** La vaca no es un
novillo más chico: tiene más grasa de cobertura y menos pulpa. El perfil arranca con la misma forma y
otra escala, **marcado como hipótesis**:

| | Novillo | Vaca *(hipótesis)* |
|---|---|---|
| Vendible | 70,00 % | **67,00 %** |
| Hueso | 18,00 % | 18,00 % |
| Grasa | 8,00 % | **11,00 %** |
| Merma | 4,00 % | 4,00 % |

Que sea hipótesis no es un problema **siempre que el sistema lo diga**: nace como "estimado", con
15 % de reserva, y el carnicero aprueba cada pedido. Las primeras 10 vacas lo corrigen. Lo que sí
sería un problema es presentarlo como dato.

### 3.4 El cierre al 100 % es sobre la TABLA, no sobre el mostrador

Son dos cosas distintas y conviene no confundirlas:

- **La tabla tiene que sumar 100 %**, siempre. Es una receta: "de 100 kg que entran, 6,85 son asado".
  Si suma 108 %, está rota. Esto es matemática, no carnicería — y es lo que habría atajado el error
  de la propuesta que puso 67,9 % en 13 filas, que a ojo no se ve.
- **El stock físico NUNCA cierra perfecto.** Los cortes se mezclan, se recortan, se pican, sobra y
  falta. Por eso existe el **descuadre**, y se espera que no sea cero. El sistema no lo pelea: lo
  mide y avisa si se pasa del umbral.

Lo mismo con "no se admiten cortes solapados": es una regla de la tabla (no podés tener "nalga" y
"nalga de afuera" si una contiene a la otra). En el mostrador se mezcla todo lo que haga falta.

---

## 4. La merma tiene nombre y apellido

La merma existe, es real, y **cada kilo se registra**. Lo que no se hace es meterla toda en un
renglón, porque eso esconde justo lo que interesa ver:

| Salida | Qué es | ¿Se recupera? |
|---|---|---|
| Venta | Se vendió | — |
| Hueso | Subproducto | **Sí** — el sebero paga |
| Grasa | Subproducto | **Sí** |
| Recorte a picada | Se transforma y se vende | **Sí** |
| **Merma de frío** | Goteo y evaporación | **No — inevitable** |
| **Degradado** | Se pasó por mala rotación | **No — pero evitable** |
| **Descuadre sin explicar** | Faltan kilos y no se sabe por qué | **No — y es la alarma** |

Las tres últimas son merma de verdad. La diferencia importa porque **la de frío no se puede evitar,
la de degradado sí** (son los $2.400 por animal de la sección 6.3 de la investigación), y el
descuadre es la señal de que algo anda mal. Si van todas juntas, no sabés cuál te está costando.

---

## 5. Costeo y margen

**Se construye ahora.** Y hay una razón que va más allá de dejarlo listo: **el costo solo se puede
capturar en el momento en que entra la mercadería.** Si no se anota lo que se pagó el día que llegó
la media res, ese dato no se reconstruye nunca más.

### 5.1 El número que ningún carnicero ve

Ejemplo trabajado. *Los precios son de ejemplo, no datos de mercado.*

Media res de novillo de **110 kg**, $500.000 + $15.000 de flete = **$515.000**.

| | |
|---|---|
| Costo por kilo **al gancho** | **$4.682/kg** ← el que él cree que paga |
| Kilos vendibles (70 %) | 77,0 kg |
| Costo por kilo **vendible** | **$6.688/kg** ← **43 % más caro** |
| Recupero de hueso y grasa (28,6 kg a $200) | −$5.720 |
| Costo **neto** por kilo vendible | **$6.614/kg** |

**Ese 43 % es el módulo entero justificado en una línea.** El carnicero que fija precios sobre
$4.682 está perdiendo plata en todos los cortes y no lo sabe.

### 5.2 Margen por corte, y el subsidio cruzado

Cada kilo vendible cuesta lo mismo: $6.614. Lo que cambia es a cuánto se vende.

| Corte | Precio/kg | Costo/kg | Margen/kg | Margen % |
|---|---|---|---|---|
| Lomo | $28.000 | $6.614 | $21.386 | **76 %** |
| Tapa de cuadril | $19.000 | $6.614 | $12.386 | **65 %** |
| Asado | $11.000 | $6.614 | $4.386 | **40 %** |
| Recortes → picada | $7.500 | $6.614 | $886 | **12 %** |
| Cogote | $6.500 | $6.614 | −$114 | **−2 %** |
| Brazuelo | $5.200 | $6.614 | −$1.414 | **−27 %** |

**Ese es el subsidio cruzado, visible por primera vez.** El cogote y el brazuelo se venden a pérdida;
el lomo y la picaña los bancan. Es información que hoy ningún carnicero tiene, y no le dice "subí el
precio del brazuelo" — le dice **cuánto lomo necesita vender para bancar el brazuelo**.

### 5.3 Una advertencia técnica que conviene saber

El doc B recomienda repartir el costo **por valor relativo de venta** (el criterio de IAS 2 para
productos conjuntos). Lo probé con números y tiene una propiedad que lo hace inútil para esto:
**reparte el costo en proporción al precio, así que TODOS los cortes dan el mismo margen.** En el
ejemplo, 58 % para todos, incluido el brazuelo. No sirve para decidir nada.

Entonces se usan **dos métodos, para dos preguntas distintas**:

| Pregunta | Método |
|---|---|
| ¿Qué margen deja cada corte? | **Costo por kilo parejo** (la tabla de 5.2) |
| ¿Cuánto vale el inventario que tengo? | Valor relativo de venta (IAS 2) |

El reparto contable definitivo lo define el contador de la carnicería. Lo de acá es **gestión**.

---

## 6. Modelo de datos

```
recepciones_lote                    ← la media res que entró
  id · carniceria_id · categoria (novillo|vaca)
  proveedor · remito_rec · factura
  peso_facturado_kg · peso_recibido_kg        ← los dos obligatorios
  peso_predesposte_kg (nullable)              ← opcional
  costo_mercaderia · costo_flete · costo_otros
  temperatura_recepcion · estado (aceptado|observado|rechazado)
  tabla_rendimiento_id · fecha

tabla_rendimiento                   ← "la tabla de porcentajes", versionada
  id · carniceria_id · categoria · proveedor (nullable)
  version · vigente_desde · vigente_hasta

rendimiento_corte
  tabla_id · producto_id
  pct_central · pct_p10 · pct_p90
  origen (referencia|calibrado) · muestras

piezas_stock                        ← EL stock. Los kilos viven acá adentro
  id · carniceria_id · producto_id · recepcion_lote_id (nullable)
  kg_iniciales · kg_restantes
  confianza (estimado|pesado)
  es_subproducto (hueso, grasa)
  estado (disponible|agotada|degradada) · ingresada_at

movimientos_stock                   ← cada kilo que sale, con causa
  id · pieza_id
  tipo (entrada | venta | hueso | grasa | recorte_picada |
        merma_frio | degradado | descuadre | ajuste | reserva | libera)
  kg · costo_unitario · causa · pedido_id (nullable) · created_at
```

Cuatro cosas a señalar:

- **No hay tabla de "stock por corte".** Los kilos de un corte son la suma de sus piezas. Es lo que
  impide que las dos vistas discrepen (sección 2).
- **`recepcion_lote_id` es opcional** en las piezas: así entra por la misma puerta lo que no viene de
  una media res (achuras, pollo, cerdo, una caja de 10 kg de nalga) sin un modelo paralelo.
- **`costo_unitario` en cada movimiento** es lo que permite reconstruir el margen de una venta vieja
  aunque después haya cambiado el precio de la media res.
- **`tabla_rendimiento_id` guardado en el lote**: por eso la tabla se versiona. Un lote despostado en
  marzo tiene que seguir explicándose con la tabla de marzo, o su historia deja de cerrar — igual que
  se guarda la lista de precios vieja para entender una factura vieja.

**Segmentación:** la tabla admite un proveedor, pero **se arranca con dos** (novillo y vaca) y se
parte solo cuando los datos muestren una diferencia que se repita. Cada tabla necesita sus propias
10-20 medias res para aprender; si se parte en cinco el día uno, ninguna junta datos suficientes.

Y una advertencia de la investigación: **si el troceo obligatorio vuelve** (el debate se reabrió en
2024), llegan cortes ya despostados. Por eso la entrada es genérica —*una pieza de N kg que se
transforma en M piezas*— y no está casada con el concepto "media res".

---

## 7. Plan por etapas

| Etapa | Qué trae | Criterio de que está lista |
|---|---|---|
| **1 · El lote** | Recepción con peso facturado y recibido · tabla de 28 cortes · explosión en piezas · hueso, grasa y recortes como destinos · costo del lote | Una media res se carga por voz en menos de un minuto y el balance cierra |
| **2 · La plata** | Costo real por kilo vendible · recupero de subproductos · margen por corte · rinde por lote | El carnicero ve el 43 % de la sección 5.1 con sus propios números |
| **3 · Que aprenda** | "Se acabó" · peso real opcional al entregar · calibración desde las ventas | Un peso real reemplaza al estimado sin duplicar stock |
| **4 · Que aprenda más rápido** | Cierre de desposte rápido/clave/completo · mediana y P10–P90 · tabla v1 calibrada | Error de pronóstico por corte medido y bajando |
| **5 · Que avise** | Alertas de degradación · FEFO · sobreventa · descuadre con causa | El KPI de kilos degradados a picada es visible |
| **6 · Sin escribir nada** | Lectura del Remito Electrónico Cárnico · balanza Kretz | La carga manual de la recepción desaparece |

**Calibración del piloto:** 10-20 medias res de línea base pesando los cortes clave (lomo, peceto,
asado, vacío, nalga, cuadril) más los totales de vendible, hueso y grasa → **mediana y P10-P90**, no
promedio ni mínimo/máximo (la mediana aguanta el desposte raro) → validar con las 10 siguientes sin
tocar la tabla.

---

## 8. Lo único que falta antes de construir

**Media hora con el carnicero piloto**, con tres objetivos concretos:

1. **Validar los cinco repartos de la sección 3.1.** ¿Separa la tapa de asado o la vende con el
   asado? ¿Dónde corta el vacío respecto del matambre? ¿Separa la colita de cuadril? Cada respuesta
   confirma o corrige un reparto que hoy es inferencia.
2. **Revisar los rangos corte por corte.** Él sabe cuánto pesa un peceto de los que le bajan.
3. **Fijar qué pieza es cada nombre.** El caso del vacío —6,20 % en el INAC contra ~3,0 % en los
   catálogos, **y ninguno está mal**— muestra que el nombre no alcanza: hay que fijar dónde empieza y
   dónde termina la pieza.
