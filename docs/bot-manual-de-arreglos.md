# KILO — Manual para arreglar el bot

**Documento de contexto para conversaciones dedicadas a corregir el comportamiento del bot.**
Escrito el 13/09/2026. Actualizalo cada vez que se arregle un bug nuevo.

---

## Para qué existe este documento

Joaquín (fundador, **no programador**) abre una conversación cada vez que el bot se comporta mal.
Este documento es todo lo que esa conversación necesita saber para diagnosticar y arreglar sin
volver a preguntar lo básico.

**El objetivo no es arreglar bugs sueltos: es que el bot sea cada vez más robusto.** Cada arreglo
tiene que cerrar la clase entera de problema, no el caso puntual. Si un arreglo no se puede explicar
como "esto ya no puede volver a pasar por X razón", probablemente sea un parche.

---

## Cómo trabajar con Joaquín

Esto no es opcional, es cómo se trabaja acá:

1. **Explicá SIEMPRE el porqué de cada cosa, en castellano llano.** Él no programa. Sus palabras:
   *"a partir de ahora SIEMPRE enseñame y comentame por qué se hace cada cosa y para qué sirve,
   sino no aprendo nada en el proceso."* Un arreglo sin explicación es medio trabajo.
2. **Dale varios pasos juntos, no de a uno.** *"Dame varios pasos juntos, tampoco soy tonto."*
3. **Resolvé los bloqueos vos.** *"No quiero hacer nada manualmente."* Si hay que elegir entre
   pedirle que haga algo o hacerlo vos, hacelo vos.
4. **Si tenés una duda real de negocio, preguntale antes de implementar.** *"Si tenés dudas no
   hagas, preguntame."* Pero no le preguntes cosas que podés decidir con criterio técnico.
5. **Nunca le entregues código sin verificar.** `npx tsc --noEmit`, `npm run lint` y `npm run build`
   los tres limpios, siempre, antes de entregar.
6. **Los comentarios del código se escriben para que él los entienda** y explican POR QUÉ, no QUÉ.
   El código dice qué hace; el comentario dice por qué está así y qué pasa si se cambia.

---

## ⚠️ Lo más importante: el triage antes de tocar nada

**Hasta hoy, TODAS las fallas que parecían "el modelo es malo" resultaron ser otra cosa.** Cuatro
veces seguidas (la última: "1 y 1" no entendido — el modelo fallaba, pero la causa real era que se
le estaba pidiendo una decisión que no necesita modelo; ver Patrón 3). Antes de tocar un prompt o proponer cambiar de modelo, recorré esto en orden:

### 1. ¿El código que está probando existe en el entorno donde probó?

Joaquín prueba en el panel desplegado en Vercel, que se construye desde **GitHub**. Si el arreglo no
está pusheado, está probando otra cosa.

```bash
git fetch origin main && git log --oneline -1 origin/main
git cat-file -e origin/main:src/lib/ELARCHIVO.ts && echo "está" || echo "NO ESTÁ"
```

> **Caso real (13/09):** el bot contestó *"no relacioné eso con una actualización de stock"* a un
> aviso de media res. Causa: el flujo de media res no estaba pusheado. Nada que arreglar.

### 2. ¿Hay estado viejo pegado en la base?

**Esta es la causa número uno de bugs raros, y ya mordió tres veces.** Hay dos tablas que guardan
"algo pendiente" y se tragan los mensajes siguientes:

| Tabla | Qué traba | Cómo se limpia |
|---|---|---|
| `operaciones_stock` | Estados `pendiente_aclaracion`, `pendiente_confirmacion`, `pendiente_modificacion` | `delete from operaciones_stock where estado like 'pendiente%';` |
| `pedidos` | Estado `pendiente_aprobacion` (por diseño NO vencen solos) | Botón del panel, o `delete from pedidos where estado = 'pendiente_aprobacion';` |

El simulador tiene un botón **"Empezar de cero"** por número que hace justo esto.

> **Caso real (13/09):** el bot contestó *"¿De cuál corte es la media res?"* a un mensaje que decía
> "llegó una media res de 102 kg". Causa: había una `operaciones_stock` vieja pendiente, y la regla
> "si hay algo pendiente, el mensaje es sobre ESO" hizo que al modelo se le dijera que ese texto era
> la respuesta a una pregunta sobre cortes. **El modelo contestó bien; el contexto estaba mal.**

### 3. ¿El sistema entendió bien QUIÉN escribió?

Si un cliente cae en el flujo del carnicero (o al revés), todo lo demás va a estar mal. Se decide en
**`src/lib/quienEs.ts` y en ningún otro lado**. Si algún día hay que agregar otra forma de decidirlo,
**va ahí adentro**, no en un lugar nuevo.

> **Caso real (10/09):** un mensaje de cliente cargó stock. Causa: el simulador tenía su propio
> enrutamiento y decidía el rol con un teléfono que mandaba el navegador. Había **dos lugares**
> contestando la misma pregunta y uno la contestó mal.

### 4. ¿Qué se le mandó REALMENTE al modelo?

Recién acá se mira el prompt. Y lo que hay que mirar primero no es el texto del prompt sino el
**contexto** que se le armó: los items ya cargados, la pregunta pendiente, el item parcial. Si el
contexto está mal, el modelo más caro del mundo se equivoca igual.

### 5. Recién ahora, el modelo

Si llegaste hasta acá y el contexto era correcto, entonces sí puede ser el modelo. Ver la sección
"Sobre cambiar de modelo" más abajo.

---

## Las cuatro reglas innegociables del bot

De `docs/especificacion-bot.md`, que es la fuente de verdad funcional. **Ante una contradicción con
cualquier otra decisión, gana la especificación** (su sección 55).

1. **Nunca inventar** — stock, precios, horarios, promociones, medios de pago, dirección, sustitutos
   ni datos de un pedido. Si no sabe, pregunta.
2. **Nunca suponer ante ambigüedad** — si hay dos interpretaciones razonables, pregunta.
3. **El carnicero tiene la última palabra, pero NO habla con el cliente.** El bot le presenta
   opciones numeradas, él elige, y el bot sigue conversando. Única excepción: error técnico grave
   (el botón "Atiendo yo").
4. **Todo cambio en un pedido se le notifica al carnicero**, aunque no requiera reaprobación.

Dos reglas más que atraviesan el código:

- **El modelo entiende, el código calcula.** Ninguna cuenta la hace la IA: ni kilos, ni totales, ni
  porcentajes. Todo en TypeScript.
- **El bot nunca le dice precios al cliente** (sección 13). El panel sí se los muestra al carnicero.

---

## El mapa del bot

### Por dónde entra un mensaje

```
WhatsApp (Meta o Twilio) ─┐
                          ├─→ procesarMensajeEntrante()  ← src/lib/whatsapp/entrante.ts
Simulador del panel ──────┘         │
                                    ├─ ¿quién es? → quienEs.ts
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              ES CARNICERO                     ES CLIENTE
                    │                               │
         1. ¿audio? → procesarAudioDeStock    ventana de agrupación (6 s)
         2. ¿operación de stock pendiente?         │
            → flujoStock.procesarTextoEntrante     ↓
         3. ¿decisión sobre un pedido?        flujoPedidos.procesarTextoDePedido
            → flujoPedidos.procesarDecisionCarnicero
         4. ¿avisa una media res?
            → flujoMediaRes.probarComoMediaRes
         5. último recurso: carga de stock
            → flujoStock.procesarTextoDeStock
```

**El orden de esos cinco pasos importa** y está comentado en `entrante.ts`. Si algo se "traga" un
mensaje, casi siempre es el paso 2 agarrando algo que no era suyo.

> `procesarMensajeEntrante` es el ÚNICO camino. El simulador llama a la misma función que los
> webhooks — no hay una versión "de mentira" del motor. Si alguna vez alguien propone un camino
> paralelo "para probar", ese es exactamente el bug del 10/09.

### Los archivos, y qué hace cada uno

**Decidir quién es quién**
| Archivo | Qué hace |
|---|---|
| `src/lib/quienEs.ts` | **El único lugar** donde se decide si un número es del carnicero o de un cliente |
| `src/lib/simulador.ts` | Los dos números de prueba. Los pone el servidor, nunca el navegador |
| `src/lib/numerosCarnicero.ts` | Lista los números autorizados (NO decide roles) |

**Entender lo que dicen** (los tres llaman a Claude con `tool_choice` forzado)
| Archivo | Qué interpreta |
|---|---|
| `src/lib/interpretarPedido.ts` | Al cliente que hace un pedido |
| `src/lib/interpretarStock.ts` | Al carnicero cargando o corrigiendo mercadería |
| `src/lib/interpretarMediaRes.ts` | Si avisa que entró una media res, y cuánto pesa |
| `src/lib/modelos.ts` | Qué modelo usa cada uno (configurable por variable de entorno) |
| `src/lib/confirmacion.ts` | "sí/no/modificar" **sin IA**, por lista de palabras |
| `src/lib/confirmacionPedido.ts` | "aprobar/rechazar" del carnicero, también sin IA |

**Los flujos** (la máquina de estados)
| Archivo | Qué maneja |
|---|---|
| `src/lib/flujoPedidos.ts` | Todo el ciclo del pedido: armar, confirmar, aprobar, modificar, cancelar, reprogramar, retirar |
| `src/lib/flujoStock.ts` | Cargar y corregir stock |
| `src/lib/flujoMediaRes.ts` | Cargar una media res hablando |
| `src/lib/mediaRes.ts` | El motor de stock por piezas: explotar, consumir (FEFO), balance, costo |
| `src/lib/decisionCarnicero.ts` | El rechazo conversado con opciones numeradas |

**Apoyo**
| Archivo | Qué hace |
|---|---|
| `src/lib/catalogo.ts` | Carga el catálogo y arma el bloque de productos del prompt |
| `src/lib/alternativas.ts` | Sustitutos, leyendo `sustitutos_autorizados` |
| `src/lib/consultas.ts` | Horarios, dirección, pagos, promos — siempre desde datos reales |
| `src/lib/whatsapp/ventana.ts` | La ventana de agrupación de 6 s del cliente |
| `src/lib/pedidoEventos.ts` | El historial del pedido y el versionado |
| `src/lib/notificaciones.ts` | Los avisos al carnicero |
| `src/app/api/cron/recordatorios/route.ts` | Recordatorios, vencimientos, no-show, resumen diario |

### Documentos que hay que leer según el caso

| Documento | Cuándo |
|---|---|
| `docs/especificacion-bot.md` | **Siempre, antes de tocar comportamiento.** Fuente de verdad, 59 secciones |
| `docs/especificacion-bot-estado.md` | Qué está implementado y qué no. **Actualizalo al arreglar algo** |
| `docs/media-res-diseno-final.md` | Todo lo de stock por media res y por qué está así |
| `AGENTS.md` | Las reglas del proyecto, resumidas |

---

## Patrones de bug que ya conocemos

Los tres bugs serios que tuvimos son **el mismo bug con tres caras**. Si aparece uno nuevo,
probablemente sea la cuarta.

### Patrón 1 — Dos lugares deciden lo mismo, y uno decide mal

*Bug del 10/09: un cliente cargó stock.* Había dos funciones contestando "¿este número es del
carnicero?": la del motor y la del simulador.

**La regla que salió de ahí:** cada pregunta importante se contesta en **un solo lugar**. Si
encontrás dos, no arregles el que falla — **borrá uno**. Y los módulos que pueden hacer daño
(tocar stock, aprobar pedidos) **vuelven a preguntar por su cuenta** en vez de confiar en quien
los llamó. Ver las guardas `bloqueadoPorNoSerCarnicero` en `flujoStock.ts` y la del principio de
`procesarTextoDePedido`.

### Patrón 2 — Estado viejo que se traga los mensajes siguientes

*Bugs del 08/09 y del 13/09.* La regla "si hay algo pendiente, el mensaje es sobre ESO" es correcta
—es lo que hace que "no, eran 12 kilos" se lea como corrección— pero tiene un agujero: si lo
pendiente quedó viejo o mal, **absorbe todo lo que venga después**.

**La regla que salió de ahí:** un mensaje que claramente anuncia un hecho NUEVO tiene que poder
abandonar lo pendiente. Ya está hecho para las medias reses (`mencionaMediaRes` cancela la
operación vieja en `flujoStock.ts`). **Si aparece otro caso así, la solución es la misma: detectarlo
con texto, no con el modelo, y cancelar lo viejo.**

### Patrón 3 — Se le pide al modelo una decisión que no necesita modelo

*Bug del 13/09: "una media res de patito" casi se pierde.* Le estábamos pidiendo al modelo dos
cosas: **detectar** de qué se hablaba y **extraer** el dato. La primera no necesita un modelo — las
palabras están o no están.

**La regla que salió de ahí:** repartir según quién es mejor en qué.
- **Detectar / clasificar por palabras presentes** → texto plano, regex, determinístico. No duda.
- **Extraer datos de lenguaje natural** ("ciento cuatro kilos seiscientos") → el modelo.

De paso ahorra llamadas a la IA. `confirmacion.ts` ya funcionaba así desde la Etapa 2, y
`mencionaMediaRes()` es el mismo patrón.

### Patrón 4 — El bot repite el mismo texto y el cliente abandona

*Bugs del 13/09: "¿cuántos hombres y cuántas mujeres?" preguntado dos veces palabra por palabra, y
"¿está bien así?" preguntado después de que el cliente ya había dicho que sí.*

Los dos son la misma falla vista desde afuera: **el bot le pide al cliente algo que el cliente ya
contestó.** Y las dos causas están del lado del código, no del modelo: una pregunta armada por una
función que siempre devuelve el mismo string, y dos situaciones distintas compartiendo la misma fase.

**Las tres reglas que salieron de ahí:**

1. **Ninguna pregunta se manda dos veces igual.** `variarSiSeRepite` (en `flujoPedidos.ts`) se aplica
   a cualquier pregunta antes de mandarla, incluidas las que escribe la IA. Es la red de seguridad.
2. **Toda pregunta que se pueda repetir necesita una escalera, no solo una variante.** Cambiar el
   tono no alcanza si el cliente no puede contestar: en el segundo intento hay que pedir el dato de
   otra forma y con un ejemplo de formato, y en el tercero **hay que poder seguir sin ese dato**.
   Ver `preguntaPorLaHora` y `armarPreguntaPersonas`. Si un dato es una estimación y no un requisito
   (cuánta gente es), a la tercera se resuelve con un promedio y se sigue.
3. **Dos situaciones distintas nunca comparten la misma fase.** Si un "sí" significa dos cosas
   distintas según cómo llegaste ahí, son dos fases. Es el Patrón 1 (dos lugares decidiendo lo mismo)
   visto en la máquina de estados.

---

## Cómo probar

**Orden obligatorio:**

1. **Migraciones en Supabase primero**, en orden numérico. El código nuevo asume tablas nuevas.
2. **El código corriendo**: `npm run dev` local, o pusheado a Vercel.
3. **Limpiar el estado viejo** antes de cada prueba (botón "Empezar de cero").

**El simulador** (`/panel/simulador`, solo con la carnicería en modo simulado) tiene dos solapas que
llaman al mismo motor que WhatsApp. Los números los pone el servidor:
`+5493400000001` es el cliente, `+5493400000002` el carnicero.

**Casos que conviene correr después de cualquier arreglo del bot:**

| Como cliente | Tiene que |
|---|---|
| "hola" | Saludar y ofrecer tomar el pedido |
| "quiero 2 kilos de asado para las 7" | Entender producto, cantidad Y hora de una |
| "asado" | Preguntar CUÁL corte para asar (asado es categoría, no corte) |
| "no, 1 kilo" | Corregir, no empezar de nuevo |
| "¿a qué hora abren?" | Contestar con el horario real, o decir que no lo tiene |
| "quiero peceto" (sin stock) | Ofrecer un sustituto autorizado **que tenga stock**, no cualquier cosa |
| "¿tenés algo parecido?" | Ofrecer solo sustitutos autorizados CON stock; si no hay, decirlo |
| "dale no hay problema" | Leerlo como un sí (igual que 👍, "de una", "ni ahí" como no) |
| "1 y 1" (a la pregunta de personas) | Entender 1 hombre y 1 mujer, no repetir la pregunta |
| El carnicero propone otra hora y el cliente dice "dale" | Cerrar el pedido, **no** volver a mostrar el resumen |
| Cualquier pregunta contestada mal dos veces | Reformularla, nunca mandar el mismo texto dos veces |
| "gracias" | No reabrir la venta |

| Como carnicero | Tiene que |
|---|---|
| "entraron 20 kilos de asado y 8 de vacío" | Resumir y pedir confirmación |
| "llegó una media res de 104 kilos 600" | Resumir la media res y pedir confirmación |
| "no, eran 106,4" | Corregir el peso, NO cancelar |
| "no, es vaca" | Cambiar la categoría |
| "aprobar" | Aprobar el pedido pendiente |
| "media docena de huevos" | **NO** dispararse como media res |

---

## Cómo se entrega un arreglo

Joaquín trabaja en VS Code y commitea y pushea él. **Desde este entorno no se puede pushear** (el
proxy lo bloquea; ya se intentó). El circuito es:

1. Trabajar en una copia **sincronizada con `origin/main`**. Ojo: él pushea seguido, así que
   **antes de escribir código hay que hacer `git fetch` y comparar**. El 12/09 casi se le entrega un
   componente escrito contra un sistema de diseño que él ya había reemplazado.
2. Verificar: `npx tsc --noEmit`, `npm run lint`, `npm run build`. Los tres limpios.
3. `git checkout -- next-env.d.ts` (el build lo regenera y ensucia el diff).
4. `SendUserFile` con los archivos → devuelve un `file_uuid` por archivo.
5. `mcp__remote-devices__device_commit_files` escribiendo en
   `C:\Users\Usuario\OneDrive\Escritorio\Joaquin\Carnicom KILO\carnicom-app\...`
   respetando la ruta relativa del repo.
6. Decirle qué migraciones correr y en qué orden, **antes** de commitear.

**Se rechazan solos:** los archivos `.env*` y `.github/workflows/*`. Esos hay que dárselos como
texto para pegar.

---

## Sobre cambiar de modelo

Joaquín ya preguntó si Haiku es el problema (13/09). La respuesta honesta fue que no, y conviene
tenerla a mano porque va a volver a surgir.

Los tres intérpretes **no escriben texto libre**: llenan un formulario con esquema cerrado y
`tool_choice` forzado. En extracción estructurada la brecha entre un modelo chico y uno grande es
mucho menor que en conversación abierta. Y las tres fallas que parecían del modelo eran de
arquitectura.

**Pero se puede medir en vez de discutir.** Cada intérprete tiene su variable de entorno:

```
CLAUDE_MODEL_PEDIDOS     → el que habla con los clientes
CLAUDE_MODEL_STOCK       → el que entiende al carnicero
CLAUDE_MODEL_MEDIA_RES   → el que saca el peso
CLAUDE_MODEL_HAIKU       → el que vale si no hay uno específico
```

Se cambia en Vercel, se redespliega solo, se prueba, se vuelve atrás igual de rápido.
**Si hay que probar uno, que sea `CLAUDE_MODEL_PEDIDOS`**: es el único cuyos errores los ve un
cliente de verdad. Los otros dos hablan con el carnicero, que corrige en el momento.

---

## Lo que se sabe que falta

De `docs/especificacion-bot-estado.md`, todo chico y ninguno bloqueante:

1. **Pedir el nombre del cliente a las ~2 h** (§4.2). Hoy se toma del perfil de WhatsApp si está.
2. **Avisar si un sustituto es más caro** (§5.6). Depende de activar precios.
3. **Proponer horarios válidos al elegir el retiro** (§42). El bot ya conoce los horarios pero no
   los usa para rechazar una hora con el local cerrado.
4. **Cierre natural de la conversación** (§45). Un "gracias" cae en el intérprete general.
5. **Peso real al marcar un pedido como retirado.** Es lo que dispara la calibración de la tabla de
   rendimiento (ver `docs/media-res-diseno-final.md`, sección 2).

Y una decisión a revisar con uso real: **la ventana de agrupación quedó en 6 segundos** en vez de
los 20 de la especificación. Se cambia sin tocar código con `VENTANA_AGRUPACION_SEGUNDOS`.

---

## Cómo cerrar cada arreglo

1. **Decir qué clase de problema se cerró**, no solo el síntoma. Si no se puede explicar por qué no
   puede volver a pasar, es un parche.
2. **Dejar el porqué en un comentario del código**, escrito para que Joaquín lo entienda dentro de
   seis meses.
3. **Actualizar `docs/especificacion-bot-estado.md`.**
4. **Agregar el caso a la lista de pruebas** de este documento, si es un caso nuevo.
5. **Si es un patrón nuevo, agregarlo a "Patrones de bug"** de este documento. Esa sección es lo que
   hace que el bot sea más robusto con el tiempo, y no solo que tenga menos bugs hoy.
