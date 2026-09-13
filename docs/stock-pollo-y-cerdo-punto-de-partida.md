# KILO — Stock de pollo y cerdo: punto de partida

**Documento de contexto para la conversación dedicada a diseñar la carga de stock de pollo y cerdo.**
Escrito el 13/09/2026.

---

## Qué se pide

Extender el sistema de carga de stock, que hoy funciona solo para vacuno, a **pollo y cerdo**.

**La idea es reusar la lógica que ya construimos.** Pero antes de darla por buena hay que hacer
**la misma investigación que se hizo para el vacuno**, sobre pollo y sobre cerdo, y recién después
decidir qué parte del modelo aplica a cada uno y qué parte no.

**No asumir que el modelo del vacuno sirve tal cual.** Hay razones para sospechar que no — están
más abajo, en "Por qué esto probablemente NO es el mismo problema". Si la investigación dice que sí
sirve, mejor: se reusa y listo. Pero eso se decide con datos, no de entrada.

---

## Cómo trabajar con Joaquín

Esto no es opcional, es cómo se trabaja acá:

1. **Explicá SIEMPRE el porqué de cada cosa, en castellano llano.** Él no programa. Sus palabras:
   *"a partir de ahora SIEMPRE enseñame y comentame por qué se hace cada cosa y para qué sirve,
   sino no aprendo nada en el proceso."*
2. **Dale varios pasos juntos, no de a uno.** *"Dame varios pasos juntos, tampoco soy tonto."*
3. **Resolvé los bloqueos vos.** *"No quiero hacer nada manualmente."*
4. **Ante una duda real de negocio, preguntale antes de implementar.** *"Si tenés dudas no hagas,
   preguntame."* Pero no le preguntes lo que podés decidir con criterio técnico.
5. **Primero se discute, después se escribe el documento.** Pedido explícito suyo: *"deja de hacer
   documentos al pedo mientras estamos discutiendo. Primero discutimos todos los puntos y después
   creas el documento."*
6. **Él revisa y corrige.** Varias de las mejores decisiones del módulo de vacuno salieron de que
   él objetara algo que yo había sobrediseñado. Cuando objete, tomátelo en serio: suele tener razón.
7. **Verificá antes de entregar:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, los tres
   limpios.

---

## Regla de oro de la investigación: distinguir dato de invento

Esta es la regla que salvó el módulo de vacuno, y no es negociable.

Cada afirmación se marca:

- **[FUENTE + url]** — sale de un documento verificable.
- **[DERIVADO]** — se calculó a partir de datos de fuente. Decir de cuáles.
- **[SIN DATO]** — no se encontró. **Se deja el hueco, no se rellena.**

**Nunca inventar un número para que la tabla cierre.** Si falta, falta.

Por qué importa tanto: se revisaron tres propuestas de distintas IAs para el vacuno y **una tenía la
tabla mal**. Sus 13 cortes sumaban 67,9 % cuando el mismo documento decía que lo vendible era
65-72 % — o sea que con 13 cortes ya no quedaba lugar para los otros 15. Nadie lo vio hasta que se
sumó la columna. Los números que "parecen razonables" no lo son hasta que se suman.

**De ahí salió una regla que ya está en el código:** ningún perfil de rendimiento se guarda si no
suma 100 %. La migración `0024` **falla a propósito** si no cierra.

---

## Cómo está hecho el vacuno hoy

El diseño completo y su razonamiento están en **`docs/media-res-diseno-final.md`**. Leelo entero
antes de proponer nada — acá va solo el resumen.

### El modelo tiene tres partes separables

Esto es lo importante para pollo y cerdo: **son tres piezas independientes, y para cada producto hay
que preguntarse por separado si aplica o no.**

**1. El LOTE.** Una media res no suma kilos: es una entidad con identidad propia (peso de entrada,
proveedor, costo, fecha) que después **se transforma**. Tabla `recepciones_lote`. De ahí salen
preguntas que antes no se podían ni formular: cuánto rindió *esta* media res, cuánto costó de verdad
el kilo que vendí, si este proveedor me manda mejor mercadería.

**2. Las PIEZAS.** El stock no son "kilos de peceto": son **piezas, y los kilos viven adentro de cada
pieza**. Tabla `piezas_stock` con `kg_iniciales` y `kg_restantes`.

> No existe una tabla de "kilos por corte" en ningún lado. Los kilos de un producto son la **suma**
> de sus piezas, calculada. Por eso las dos vistas (en kilos y en piezas) no pueden contradecirse:
> una sale de la otra. Fue una objeción de Joaquín la que llevó a este diseño.

**3. La TABLA DE RENDIMIENTO.** Los porcentajes que dicen cómo se reparte el peso de entrada entre
los cortes, el hueso, la grasa y la merma. Tablas `tablas_rendimiento` + `rendimiento_cortes`.
Versionada y con fecha de vigencia, porque un lote de marzo tiene que seguir explicándose con la
tabla de marzo.

### Las decisiones que lo sostienen

| Decisión | Por qué |
|---|---|
| **Dos estados de confianza**: `estimado` y `pesado` | Se probó con seis y no eran seis: "reservado" es un pedido, "vendido" es un movimiento, "ajustado" es un movimiento con causa. Tres conceptos en una lista |
| **Un peso real REEMPLAZA al estimado, nunca se suma** | Es el error clásico que duplica stock |
| **Reserva de seguridad** sobre lo estimado: 15 % sin calibrar, 8 % calibrado, 0 % pesado | Fijarla castiga al que carga datos: vería menos stock del que tiene |
| **Cada kilo que sale tiene una causa** (venta, hueso, grasa, recorte, merma de frío, degradado, descuadre) | Sin eso "la merma es lo que sobra" y desaparece el único KPI que devuelve plata |
| **El descuadre es un renglón, no un error** | La ecuación siempre cierra porque el descuadre es la línea que la hace cerrar. No se espera que dé cero: se gestiona su tamaño, como el arqueo de caja |
| **El cierre al 100 % es de la TABLA, no del stock físico** | La tabla es una receta y si suma 108 % está rota. El físico nunca cierra, y está bien |
| **`productos.stock_actual` es un CACHE** de la suma de las piezas | Es lo único que lee el bot. Por eso nada del bot hubo que tocarlo |
| **Padre/hijo entre cortes** (`producto_padre_id`, `separable`) | La misma carne se vende con distinto nombre según cómo se cortó ese día. La tapa de asado a veces se separa del asado y a veces no |
| **Códigos del IPCVA** como columna vertebral del catálogo | El nomenclador oficial ya es un árbol con la resta definida. Solo se cargaron los 12 verificados: **un código inventado se lee como oficial** |

### Cómo se carga hablando

```
🎙️ "llegó una media res de ciento cuatro kilos seiscientos"
🤖 🥩 Media res de 104,6 kg como novillo (si no es, decime cuál). ¿Lo cargo?
   "confirmar"
🤖 Listo 👍 Cargué 28 cortes estimados, 73 kg vendibles.
```

**Dos confirmaciones como máximo.** Y se confirma antes de cargar porque esto crea 28 piezas de una:
"ciento cuatro" contra "ciento cuarenta" es un error de una sílaba.

**La detección es un regex, no el modelo** (`mencionaMediaRes()` en `interpretarMediaRes.ts`). El
reparto es: **detectar de qué se habla → texto determinístico; extraer el dato del lenguaje natural
→ el modelo.** Esto salió de un bug real y es un patrón a repetir.

---

## Por qué esto probablemente NO es el mismo problema

Hipótesis a verificar, **no verdades**. Están acá para orientar la investigación, no para saltearla.

### Pollo

- **El lote no es un animal, es un cajón.** Un pollo entero no se "desposta en 28 cortes": se vende
  entero, o se parte en pocas piezas grandes (pata y muslo, pechuga, alitas, carcasa). Si el lote es
  un cajón de N pollos, la unidad de entrada es otra cosa.
- **El pollo es mucho más uniforme que una media res.** Si todos los pollos de un cajón pesan casi
  lo mismo, buena parte de la maquinaria de rangos y calibración puede sobrar.
- **Se vende por UNIDAD además de por kilo.** "Dame dos pollos" es normal; "dame dos vacíos" no
  tanto. El catálogo ya tiene `productos.peso_aproximado_unidad_kg` para convertir, pero
  `pollo_entero` hoy está cargado con `unidad = 'kg'` — hay que decidir si eso está bien.
- **Se pudre mucho más rápido.** Eso hace que **FEFO y las alertas de degradación importen más** que
  en vacuno, no menos.

### Cerdo

- **Es el caso más parecido al vacuno**, pero la media res de cerdo es mucho más chica y probablemente
  se desposta distinto.
- **La duda central: ¿se compra entera o por pieza?** Si la mayoría de las carnicerías compra
  bondiola, carré y pechito por separado —en cajas— entonces **el lote no es un animal y toda la
  tabla de rendimiento sobra**. Si compran la media res de cerdo, aplica casi todo el modelo vacuno.
- **Hay más producto elaborado**: chorizo, panceta, matambre arrollado. Eso ya no es desposte, es
  **transformación**, que es otro flujo.

### La pregunta que ordena todo el trabajo

> **Para pollo y para cerdo, ¿cuál de las tres partes del modelo aplica: el lote, las piezas, la
> tabla de rendimiento — las tres, dos, una o ninguna?**

Puede perfectamente dar distinto para cada uno. **Y "ninguna" es una respuesta válida**: si el pollo
se compra por cajón y se vende por unidad, capaz alcanza con la carga de stock simple que ya existe
desde la Etapa 2. Reusar el modelo del vacuno porque está hecho, cuando no corresponde, es peor que
no reusarlo.

---

## Lo que hay que investigar

Mismo estándar que el documento del vacuno (`docs/media-res-proceso-y-datos.md`): fuentes argentinas,
marcado de dato vs. inferencia, y los huecos declarados.

### Pollo

1. **¿Cómo llega a la carnicería?** ¿Cajón de cuántos kilos, cuántos pollos? ¿Entero, eviscerado, en
   presas? ¿Enfriado o congelado?
2. **¿Cuánto pesa un pollo parrillero típico?** ¿Qué tan uniforme es dentro de un cajón?
3. **¿Cómo se despieza?** Qué presas salen, qué proporción del peso es cada una, y cuánto es carcasa
   y desecho.
4. **¿Se vende más por unidad o por kilo?**
5. **Cadena de frío y vida útil.** Días de conservación, temperaturas. Esto define si hacen falta
   alertas y FEFO más agresivos.
6. **Normativa argentina**: SENASA, trazabilidad, rotulado. ¿Hay algo equivalente al Remito
   Electrónico Cárnico?
7. **¿Existe una tabla de rendimiento de referencia?** El equivalente al INAC para aves.

### Cerdo

1. **¿La carnicería compra media res de cerdo o piezas sueltas?** *(La pregunta más importante de
   todas: define si aplica el modelo del lote.)*
2. **¿Cuánto pesa una media res de cerdo?** Y sus categorías comerciales, si las hay.
3. **¿Qué cortes salen y en qué proporción?** ¿Hay un nomenclador oficial como el del IPCVA?
4. **¿Cuánto es hueso, grasa y merma?** El cerdo tiene un perfil de grasa muy distinto al vacuno.
5. **¿Cuánto va a elaborados?** Chorizo, panceta, bondiola curada. Eso es transformación, no desposte.
6. **Normativa y cadena de frío.**

### Preguntas que cruzan a los dos

- **¿Se puede reusar la misma tabla de rendimiento, o hace falta un modelo distinto por especie?**
- **¿Las piezas tienen sentido en pollo?** ¿Qué es "una pieza" de pechuga?
- **¿Qué pasa con lo ya elaborado** (milanesas de pollo, hamburguesas, nuggets)? Hoy son productos
  del catálogo sin lote. ¿Se dejan así?
- **¿Y las achuras?** Llegan por un canal aparte, 2 veces por semana — está documentado en la
  sección 5.3 del documento de investigación del vacuno. Puede que pollo y cerdo tengan un canal
  propio parecido.

---

## Lo que ya está construido y se puede reusar

**El modelo de datos fue diseñado para esto.** Tres cosas concretas:

**1. `piezas_stock.recepcion_lote_id` es NULLABLE, a propósito.** El comentario de la migración
`0023` lo dice con todas las letras: *"así entra por la misma puerta lo que NO viene de una media
res (achuras, pollo, cerdo, una caja de 10 kg de nalga) sin necesidad de un modelo paralelo"*.
**Ya se puede tener stock por piezas de pollo sin tocar nada.**

**2. La entrada es genérica.** El modelo no está casado con "media res": es *una pieza de N kg que se
transforma en M piezas*. Se hizo así por si vuelve el troceo obligatorio, pero sirve igual para un
cajón de pollos.

**3. El catálogo ya tiene los productos cargados**, con sinónimos:

- **Pollo**: `pollo_entero`, `pata`, `muslo`, `pata_y_muslo`, `rancho`, `pechuga_desosada`,
  `alitas`, `menudos`, `patitas_rebozadas`, `milanesa_de_pollo`, `hamburguesa_de_pollo`,
  `medallon_de_pollo`, `nuggets_de_pollo`, `brochette_de_pollo`, `pollo_relleno`
- **Cerdo**: `bondiola`, `carre`, `costeleta_de_cerdo`, `pechito_de_cerdo`, `matambre_de_cerdo`,
  `vacio_de_cerdo`, `solomillo`, `pulpa_de_cerdo`, `paleta_de_cerdo`, `pata_de_cerdo`, `panceta`,
  `chorizo_de_cerdo`, `milanesa_de_cerdo`, `hamburguesa_de_cerdo`, `medallon_de_cerdo`
- También está el término ambiguo `pollo`, que hace preguntar *"¿Pollo entero, pata y muslo o
  pechuga?"*

### Lo que SÍ hay que tocar

**Las categorías están restringidas a vacuno.** En la migración `0023`, tanto `recepciones_lote`
como `tablas_rendimiento` tienen:

```sql
categoria text not null check (categoria in ('novillo','novillito','vaquillona','vaca','ternera'))
```

Hace falta una migración para extenderlo. **Y conviene pensar antes cómo se llama la cosa**: ¿se
agregan `pollo` y `cerdo` como categorías al mismo campo, o hace falta un campo `especie` separado
de `categoria`? La segunda opción parece más limpia —"novillo" es una categoría *dentro de* vacuno—
pero es una decisión de diseño, no un trámite.

---

## Los archivos que hay que conocer

| Archivo | Qué hace |
|---|---|
| `src/lib/mediaRes.ts` | El motor: cargar, explotar en piezas, consumir por FEFO, "se acabó", pesar, balance, costo, margen |
| `src/lib/flujoMediaRes.ts` | La conversación: detectar, confirmar, corregir, ejecutar |
| `src/lib/interpretarMediaRes.ts` | La compuerta de texto + el modelo que saca el peso |
| `supabase/migrations/0023_stock_por_media_res.sql` | Las tablas, el balance y el recálculo del cache |
| `supabase/migrations/0024_tablas_rendimiento_semilla.sql` | Cómo se carga una tabla de rendimiento y cómo se valida que cierre |
| `src/app/panel/(interno)/stock/medias-reses/` | Las pantallas |
| `src/lib/catalogo.ts` | Cómo se arma el bloque de productos del prompt |

**Si el modelo del vacuno aplica**, lo más probable es que convenga **generalizar `mediaRes.ts` a
`lotes.ts`** en vez de copiar el archivo con otro nombre. Un `flujoPollo.ts` que sea un clon de
`flujoMediaRes.ts` es exactamente el tipo de duplicación que ya nos costó un bug feo: había dos
lugares decidiendo lo mismo y uno decidió mal (ver `docs/bot-manual-de-arreglos.md`, Patrón 1).

---

## Cómo se entrega

Joaquín trabaja en VS Code y commitea y pushea él. **Desde este entorno no se puede pushear** (el
proxy lo bloquea). El circuito:

1. Trabajar sobre una copia **sincronizada con `origin/main`**. Él pushea seguido: **`git fetch`
   antes de escribir código.** El 12/09 casi se le entrega un componente escrito contra un sistema
   de diseño que él ya había reemplazado.
2. Verificar: `tsc`, `lint`, `build`.
3. `git checkout -- next-env.d.ts` (el build lo ensucia).
4. `SendUserFile` → `mcp__remote-devices__device_commit_files` a
   `C:\Users\Usuario\OneDrive\Escritorio\Joaquin\Carnicom KILO\carnicom-app\...`
5. Decirle qué migraciones correr **antes** de commitear.

Los archivos `.env*` y `.github/workflows/*` se rechazan solos: esos van como texto para pegar.

---

## Orden de trabajo sugerido

1. **Investigar pollo y cerdo**, con el estándar de marcado de fuentes. Sin proponer nada todavía.
2. **Mostrarle los hallazgos y discutirlos.** Sin escribir documento — él lo pidió expresamente.
3. **Contestar la pregunta que ordena todo**: para cada especie, ¿aplica el lote, las piezas, la
   tabla de rendimiento? ¿Cuáles sí y cuáles no?
4. **Recién ahí, el documento de diseño**, con las decisiones que necesita que tome él.
5. **Después, el código**: migraciones primero, motor después, pantallas al final.

**Y una advertencia que vale por todo lo demás:** el módulo de vacuno salió bien porque se
investigó primero y se diseñó después. La tentación de copiar `mediaRes.ts`, cambiarle los nombres y
declarar el pollo terminado va a estar ahí desde el primer minuto. Si el pollo no funciona como una
media res, ese atajo produce un módulo que nadie usa.
