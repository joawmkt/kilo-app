# Carnicom — Catálogo estructurado v0.3
## Etapa 2 — Carga de stock por audio

Este documento es la especificación funcional del catálogo que debe utilizar Carnicom para interpretar mensajes de clientes y, especialmente en esta etapa, audios del carnicero.

**Ubicación/contexto:** Argentina, Rosario, Santa Fe.
**Objetivo:** que el sistema reconozca vocabulario real de clientes y carniceros, pero evite adivinar cuando una expresión sea ambigua.

---

# 1. Reglas generales de interpretación

## 1.1 Principios

- Cada producto tiene un `nombre_canónico`.
- Los sinónimos y expresiones coloquiales deben mapear al producto canónico cuando la equivalencia sea segura.
- Las expresiones ambiguas NO deben adivinarse: el bot debe pedir aclaración.
- El contexto conversacional puede resolver una ambigüedad.
- Si el contexto no alcanza, preguntar.
- Las deformaciones razonables de transcripción de audio pueden tolerarse mediante el modelo de lenguaje, pero NO convertir cada error de Whisper en un sinónimo permanente.
- No confundir productos físicamente distintos aunque sus nombres sean parecidos.

## 1.2 Distinciones obligatorias

- `pata_y_muslo` != `cuarto_trasero`
- `pata` != `patitas_rebozadas`
- `pechuga_desosada` es el producto principal; `suprema` es una expresión reconocible, pero no una categoría comercial prioritaria.
- `salame` y `salamín` son un único producto canónico.
- `tapa` sola es ambigua.
- `picada` sola requiere preguntar si es común o especial cuando ambas existen.
- `bife` solo puede ser ambiguo.
- `mila`/`milanesa` puede requerir contexto para saber si es vacuna, pollo o cerdo.
- `medallón` puede requerir contexto.
- `pollo` solo debe interpretarse como pollo entero únicamente si ese es el producto configurado y no existe una ambigüedad contextual.

---

# 2. Cantidades por personas

Cuando el cliente pide carne "para X personas" y el contexto es un asado:

- Hombre: referencia inicial de 500 g.
- Mujer: referencia inicial de 350 g.
- El bot debe preguntar cuántos hombres y cuántas mujeres si solo se informa el total.
- La respuesta debe usar "aproximadamente".
- Fórmula orientativa:
  `hombres × 0,5 kg + mujeres × 0,35 kg`

Ejemplo:
4 hombres + 2 mujeres = aproximadamente 2,7 kg.

Estos valores son orientativos, no una regla rígida. No deben utilizarse para alterar stock sin una cantidad explícita.

---

# 3. Familias y productos

## 3.1 VACUNO — PARRILLA

### asado
Sinónimos/expresiones:
- asado
- tira de asado
- tira
- asado de tira
- costilla
- costillas
- asado común
- asado para parrilla
- asado parrillero
- asado con hueso
- asado del medio
- asado de costilla

Ambigüedad:
- `costillar` puede representar una pieza completa y no debe convertirse automáticamente a kg de asado.

### vacío
- vacío
- vacio
- un vacío
- vacío entero
- vacío para la parrilla
- vacío parrillero
- bife de vacío

### entraña
- entraña
- entrañita
- entrañas
- entraña fina
- entraña gruesa

Si el catálogo real distingue fina/gruesa, conservarlas separadas.

### matambre
- matambre
- mata hambre
- matambre vacuno
- matambre para parrilla
- matambre para arrollar

### tapa_de_asado
- tapa de asado
- tapa asado
- tapa del asado

`Tapa` sola es ambigua.

### falda
- falda
- faldita
- falda parrillera
- falda con hueso
- falda para puchero

### pecho
- pecho
- pechito
- pecho vacuno
- pechito de vaca
- pecho para puchero

---

## 3.2 VACUNO — CORTES SIN HUESO

### nalga
- nalga
- nalga de adentro
- nalga de afuera
- nalga para milanesa
- nalga para milanesas
- nalga feteada
- nalga cortada
- nalga en bifes

### cuadrada
- cuadrada
- cuadrada para milanesa
- cuadrada para milanesas
- cuadrada para bifes
- cuadrada feteada

### bola_de_lomo
- bola de lomo
- bola
- bola para milanesa
- bola de lomo para milanesa

`Bola` sola puede requerir contexto.

### peceto
- peceto
- peceto entero
- peceto para horno
- peceto para vitel toné
- peceto para milanesa

### cuadril
- cuadril
- cuadril entero
- bife de cuadril
- cuadril para horno
- cuadril para bifes

### colita_de_cuadril
- colita de cuadril
- colita
- colita de cuadril para horno

`Colita` sola puede requerir contexto.

### tapa_de_cuadril
- tapa de cuadril
- tapa del cuadril
- picanha
- picaña

No asumir que picanha/picaña siempre equivale a tapa de cuadril si la carnicería maneja ambos conceptos por separado.

### tapa_de_nalga
- tapa de nalga
- tapa nalga

---

## 3.3 VACUNO — BIFES / PLANCHA

### lomo
- lomo
- lomito
- lomo entero
- lomo para bifes
- medallones de lomo

`Lomito` puede requerir contexto.

### bife_ancho
- bife ancho
- ojo de bife
- ojo bife
- ojo de bife entero
- ojo
- bife ancho sin hueso

No fusionar automáticamente con bife de chorizo.

### bife_angosto
- bife angosto
- bife angosto entero

### bife_de_chorizo
- bife de chorizo
- bife chorizo

### roast_beef
- roast beef
- roastbeef
- roast
- rosbif
- roast beef para olla
- roast beef para bifes

`Bife` solo es ambiguo y puede requerir aclaración.

---

## 3.4 VACUNO — OTROS CORTES

### paleta
- paleta
- paleta vacuna

### carnaza_de_paleta
- carnaza
- carnaza de paleta

### marucha
- marucha

### palomita
- palomita
- chingolo

### tortuguita
- tortuguita

### aguja
- aguja
- aguja vacuna

### azotillo
- azotillo

### osobuco
- osobuco
- ossobuco
- garrón

### brazuelo
- brazuelo

### cogote
- cogote
- cogote vacuno

### espinazo
- espinazo

### rabo
- rabo
- cola
- rabo de vaca

---

# 4. CARNE PICADA

### picada_comun
- carne picada
- picada
- carne molida
- carne para picar
- carne picada común
- picada común

### picada_especial
- picada especial
- especial

### picada_magra
- picada magra
- picada sin grasa
- picada con poca grasa

Solo usar si la carnicería ofrece explícitamente esta variedad.

### reglas
- Si el cliente dice `picada` y existen común + especial: preguntar "¿Común o especial?"
- No interpretar `picada` como especial automáticamente.
- `carne para hamburguesa` no necesariamente equivale a picada común; puede ser una elaboración.

---

# 5. POLLO

## 5.1 pollo_entero
- pollo
- pollo entero
- pollo entero limpio
- pollo chico
- pollo grande
- pollo para horno
- pollo para asar

`pollo` solo depende del catálogo/contexto.

## 5.2 pata
- pata
- patas
- pata de pollo

## 5.3 muslo
- muslo
- muslos
- muslo de pollo

## 5.4 pata_y_muslo
- pata y muslo
- pata-muslo
- pata muslo
- patamuslo
- pata con muslo

IMPORTANTE: NO incluir `cuarto trasero` como sinónimo.

## 5.5 cuarto_trasero
- cuarto trasero
- cuartos traseros

Incluye pata + muslo + rancho.

## 5.6 rancho
- rancho
- rancho de pollo

Debe existir como producto/concepto separado si la carnicería lo vende separadamente.

## 5.7 pechuga_desosada
Producto canónico prioritario para el uso cotidiano.

- pechuga
- pechugas
- pechuga de pollo
- pechuga sin hueso
- pechuga sin piel
- pechuga deshuesada
- bifes de pechuga
- bife de pechuga
- bifecitos de pollo
- bifes de pollo
- filetes de pollo
- filetes de pechuga
- suprema
- supremas
- suprema de pollo
- suprema fileteada

Nota: `suprema` se reconoce como expresión, pero no se crea una categoría comercial separada salvo que la carnicería la necesite.

## 5.8 alitas
- alitas
- alas
- alas de pollo
- alitas de pollo
- alitas para horno
- alitas para parrilla

## 5.9 menudos
- menudo
- menudos
- menudencia
- hígado y corazón
- menuditos

Si la carnicería vende hígado/corazón/molleja de pollo por separado, crear productos independientes.

---

# 6. POLLO — ELABORADOS

### patitas_rebozadas
- patitas
- patitas de pollo
- patitas rebozadas
- patitas para chicos

IMPORTANTE: `patitas` NO significa patas del pollo.

### milanesa_de_pollo
- milanesa de pollo
- milanesas de pollo
- mila de pollo
- mila pollo
- milanesa de suprema
- suprema rebozada
- supremas rebozadas
- pollo rebozado

### hamburguesa_de_pollo
- hamburguesa de pollo
- hamburguesas de pollo

### medallon_de_pollo
- medallón de pollo
- medallones de pollo
- medallón rebozado
- medallón de pollo rebozado

### nuggets_de_pollo
- nuggets
- nuggets de pollo

### brochette_de_pollo
- brochette de pollo
- brochetas de pollo

### pollo_relleno
- pollo relleno

---

# 7. CERDO

### bondiola
- bondiola
- bondiola de cerdo

### carre
- carré
- carre
- carré de cerdo

### costeleta_de_cerdo
- costeleta de cerdo
- costeletas de cerdo
- costeleta
- costeletas

### pechito_de_cerdo
- pechito de cerdo
- pechito
- costillitas de cerdo
- costillitas

### matambre_de_cerdo
- matambre de cerdo
- matambre de chancho

### vacio_de_cerdo
- vacío de cerdo
- vacio de cerdo

### solomillo
- solomillo
- solomillo de cerdo

### pulpa_de_cerdo
- pulpa de cerdo
- carne de cerdo
- pulpa

`pulpa` sola puede requerir contexto.

### paleta_de_cerdo
- paleta de cerdo
- paleta de chancho

### pata_de_cerdo
- pata de cerdo
- pata de chancho

---

# 8. EMBUTIDOS

## chorizo
- chorizo
- chori
- choris
- chorizo común
- chorizo criollo
- criollo
- chorizo parrillero
- chorizo para asado

## chorizo_de_cerdo
- chorizo de cerdo
- chorizo puro cerdo
- puro cerdo
- chori de cerdo

## chorizo_bombon
- chorizo bombón
- bombón
- chori bombón
- bombones

## chorizo_colorado
- chorizo colorado
- colorado
- chori colorado

## chorizo_saborizado
- chorizo saborizado
- chori saborizado
- chorizo con queso
- chorizo con cheddar
- chorizo con verdeo
- chorizo con morrón
- chorizo con panceta
- chorizo especial

Los sabores específicos solo deben activarse si existen en el catálogo real.

## morcilla
- morcilla
- morcillas
- morci
- morcilla común

## morcilla_bombon
- morcilla bombón
- bombón de morcilla

## morcilla_vasca
- morcilla vasca

## morcilla_rosca
- morcilla rosca

## salchicha_parrillera
- salchicha parrillera
- parrillera
- salchicha de parrilla
- salchicha para asado

## salchicha_viena
- salchicha
- salchichas
- viena
- salchicha viena

## salame
Producto único para salame/salamín.

- salame
- salamín
- salamines
- salame chico
- salamito

## longaniza
- longaniza
- longanizas
- longaniza calabresa

## panceta
- panceta
- panceta salada
- panceta ahumada
- panceta para parrilla

---

# 9. ACHURAS / MENUDENCIAS

### chinchulines
- chinchulines
- chinchu
- chinchulín

### mollejas
- molleja
- mollejas

### riñon
- riñón
- riñones

### higado
- hígado
- hígado vacuno

### lengua
- lengua
- lengua vacuna

### corazon
- corazón
- corazón vacuno

### tripa_gorda
- tripa gorda
- tripa

### choto
- choto

### mondongo
- mondongo

### sesos
- sesos
- seso

### regla
`achuras` es una familia, no un producto individual.
Si el cliente/carnicero dice solamente "achuras", preguntar qué tipo.

---

# 10. ELABORADOS VACUNOS / GENERALES

### milanesa_de_carne
- milanesa
- milanesa de carne
- milanesa vacuna
- mila
- milas

La expresión `mila` sin contexto puede requerir aclarar el tipo.

### milanesa_de_nalga
- milanesa de nalga
- mila de nalga

### milanesa_de_cuadrada
- milanesa de cuadrada
- mila de cuadrada

### milanesa_de_bola
- milanesa de bola
- mila de bola

### hamburguesa_de_carne
- hamburguesa
- hamburguesas
- hamburguesa de carne
- hamburguesa vacuna
- burger
- hamburguesa casera

`hamburguesa` sola puede requerir contexto si también existen hamburguesas de pollo/cerdo.

### medallon_de_carne
- medallón
- medallones
- medallón de carne
- medallón vacuno

`medallón` solo puede requerir contexto.

### albondigas
- albóndigas
- albóndiga
- albóndigas de carne

### brochette_de_carne
- brochette
- brocheta
- brochette de carne

`brochette` sola puede requerir contexto.

### matambre_arrollado
- matambre arrollado
- matambre relleno

---

# 11. ELABORADOS DE CERDO

### hamburguesa_de_cerdo
- hamburguesa de cerdo
- hamburguesas de cerdo

### milanesa_de_cerdo
- milanesa de cerdo
- mila de cerdo

### medallon_de_cerdo
- medallón de cerdo
- medallones de cerdo

---

# 12. ELABORADOS MIXTOS

### brochette_mixta
- brochette mixta
- brocheta mixta
- brochette de carne y pollo

### hamburguesa_rellena
- hamburguesa rellena
- hamburguesa con queso
- hamburguesa con jamón y queso

### medallon_relleno
- medallón relleno
- medallones rellenos

---

# 13. COMPLEMENTARIOS

Los complementarios son productos que pueden agregarse al pedido, pero NO son cortes de carne.

## carbon
- carbón
- bolsa de carbón
- carbón para asado

## sal_parrillera
- sal parrillera
- sal para parrilla
- sal para asado

## sal_gruesa
- sal gruesa

## sal_fina
- sal fina
- sal común

## pimienta
- pimienta
- pimienta negra
- pimienta molida

## oregano
- orégano

## aji_molido
- ají molido
- aji molido

## provenzal
- provenzal

## chimichurri
- chimichurri
- chimi

## especias
- especias
- condimentos
- condimento para carne
- condimento para pollo

## queso
- queso

## provoleta
- provoleta
- provoleta para parrilla

## pan
- pan
- pan para el asado

## pan_rallado
- pan rallado
- pan rallado para milanesas
- rallado

## huevos
- huevos
- huevo
- docena de huevos

## salsas
- salsa
- salsas

## criolla
- salsa criolla
- criolla

---

# 14. REGLA DE RECOMENDACIÓN DE COMPLEMENTARIOS

El bot debe hacer como máximo **UNA recomendación de complementario por compra**.

Nunca hacer una lista de preguntas.

Debe detectar el contexto principal de la compra.

## Si detecta ASADO / PARRILLA
Ejemplo:
"2 kg de asado, un vacío y 8 choris."

Puede hacer UNA sugerencia:
"¿Necesitás carbón?"

## Si detecta CARNE AL HORNO
Ejemplo:
"Quiero un peceto para hacerlo al horno."

Puede sugerir:
"¿Necesitás sal o pimienta?"

## Si detecta MILANESAS
Ejemplo:
"2 kg de nalga para milanesas."

Puede sugerir:
"¿Necesitás pan rallado?"

## Si el cliente ya pidió el complementario
No volver a ofrecerlo.

## Si el cliente ya indicó que tiene el complementario
No volver a ofrecerlo.

## Si ya se realizó una recomendación en esa compra
No hacer otra.

La recomendación es opcional y debe sentirse como asistencia de compra, no venta agresiva.

---

# 15. REGLAS DE DESAMBIGUACIÓN

## tapa
Si dice solamente "tapa":
"¿Tapa de asado, tapa de nalga o tapa de cuadril?"

## picada
Si existen común y especial:
"¿Común o especial?"

## mila / milanesa
Si no se puede determinar el tipo:
"¿De carne, pollo o cerdo?"

## bife
Si no hay contexto:
"¿Qué bife querés: ancho, angosto o de chorizo?"

## achuras
"¿Qué achuras querés?"

## medallón
Si existen varios tipos:
"¿De carne o de pollo?"

## brochette
Si existen varias:
"¿De carne, pollo o mixta?"

## pollo
Si no se puede saber:
"¿Pollo entero, pata y muslo o pechuga?"

## chori
Si solo existe un chorizo:
interpretar como chorizo.
Si existen variedades relevantes y el contexto no alcanza:
preguntar.

---

# 16. CONTEXTO DE COMPRA

El sistema debe intentar identificar el contexto de la conversación:

- asado/parrilla
- horno
- milanesas
- puchero
- plancha
- pollo
- picada
- comida general

El contexto puede ayudar a interpretar expresiones ambiguas y a realizar UNA recomendación de complementario.

No debe inventar un contexto si no hay evidencia.

---

# 17. UNIDADES

Por defecto:

- Carnes y elaborados vendidos por peso → `kg`
- Productos vendidos por unidad → `unidad`
- Huevos → `docena` o `unidad`
- Carbón → `bolsa` (si se vende así)
- Sal/especias/salsas → según presentación real del producto

La unidad real debe poder configurarse por producto.

---

# 18. IMPORTANTE PARA EL PASO DE STOCK

Este catálogo es el vocabulario/base de interpretación.

NO todos los productos tienen que estar inicialmente habilitados para stock en el piloto.

La implementación debe permitir:
- producto activo/inactivo;
- stock inicial;
- unidad;
- sinónimos;
- familia;
- reglas de desambiguación.

El catálogo puede crecer después sin cambiar la lógica central del bot.
