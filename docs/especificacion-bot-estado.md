# Estado de implementación de la especificación del bot

> Compañero de `docs/especificacion-bot.md`. Los números entre paréntesis son las secciones
> de esa especificación. **Actualizar este archivo cada vez que se implemente una parte.**
>
> Última revisión contra el código: **08/09/2026**, sobre `main` (commit `a6ccad4`).

Leyenda: ✅ hecho · 🟡 parcial · ❌ falta

---

## Lo que ya cumple hoy

| Sección | Qué pide | Nota |
|---|---|---|
| ✅ 13 | No informar precios | Estructural: el precio existe en la base para la caja, pero **nunca entra en el prompt del bot**, así que no puede inventarlo ni filtrarlo. |
| ✅ 7.2 / 54 | Un solo recordatorio, 1 hora antes, con el texto definitivo | Cron cada 10 min vía GitHub Actions. |
| ✅ 47 | Cálculo orientativo por personas (0,5 / 0,35 kg) | Incluye el "no repetir más de una vez por compra". |
| ✅ 46.5 | "Tapa" sin especificar → preguntar | Vía `terminos_ambiguos`. |
| ✅ 46.7 | "Picada" → preguntar variante | Ídem. |
| ✅ 46.1-46.4, 46.6 | Reglas de catálogo (salame/salamín, patas vs patitas, pata-muslo vs cuarto trasero, rancho, bifes de pechuga/suprema) | Verificado contra el catálogo el 08/09/2026: **ya estaban todas cargadas** como productos y sinónimos distintos. No hizo falta tocar nada. |
| ✅ 2.1-2.3 | Saludo inicial sin "bienvenido/a" y sin nombre en el primer contacto | Falta solo la línea que enumera las consultas posibles: se agrega cuando esas consultas existan (Tanda 2). |
| ✅ 6 | Pesos aproximados por unidad | Milanesas 150 g, hamburguesa y medallón 120 g (migración `0015`). Rellenos y productos variables quedan sin valor a propósito. |
| ✅ 5.3 | Nunca sustituir automáticamente | Siempre pide sí/no al cliente. |
| ✅ 14 / 41 | Sin mínimos ni umbrales por tamaño de pedido | No existe ninguna regla de ese tipo en el código. |
| ✅ 1.5 | El contexto manda | El intérprete recibe el pedido en construcción, la hora y las personas en cada turno. |
| ✅ 33 | Audios: conservar lo entendido y preguntar solo lo que falta | Funciona por el mismo mecanismo de items parciales. |

## Lo que está a medias

| Sección | Qué pide | Qué falta |
|---|---|---|
| 🟡 4 | Cliente nuevo vs recurrente | Saludo genérico en el primer contacto y variantes con nombre para el conocido (4.1, 4.3) ✅. Falta **pedir el nombre a las ~2 h** (4.2). |
| 🟡 5 | Sustituciones | Hoy es "misma familia, con stock, el que más tenga". Falta la **tabla de sustitutos autorizados** (5.5) y **preguntar el uso** (5.4). |
| 🟡 7.4-7.6 | Cierre del día, "en espera", no-show | Hoy el no-show es **automático** 60 min después de la hora. La especificación pide preguntarle al carnicero y permitir "en espera" un día más. |
| 🟡 36 | Rechazo del carnicero | Se puede rechazar, pero **sin motivo ni opciones numeradas**: el pedido muere ahí en vez de intentar resolverse. |
| 🟡 53 | Notificaciones al carnicero | Existen tabla y panel de avisos. Falta la regla transversal "**todo** cambio de un pedido se notifica". |
| 🟡 30 | Correcciones ("no, 1 kg") | Lo resuelve el intérprete por contexto, pero no está probado ni cubierto por la especificación de versionado. |

## Lo que falta entero

| Sección | Qué pide | Tamaño |
|---|---|---|
| ❌ 1.1 / 15-21 | **Atención general**: responder stock, horarios, dirección, medios de pago, promociones, delivery, consultas de producto | Grande. Hoy el bot solo entiende `saludo`, `pedido`, `aclaracion`, `info_faltante`, `no_entendido`: cualquier consulta que no sea un pedido cae en "no entendí". |
| ❌ 17 | Promociones | No existen en la base ni en el panel. |
| ❌ 19 | Medios de pago | No existen en la base ni en el panel. |
| ❌ 21 | Dirección | El dato existe en `carnicerias.direccion`; el bot no lo usa. |
| ❌ 31 | **Confirmación final obligatoria** antes de mandar al carnicero | Mediano. Hoy el pedido va directo al carnicero sin resumen previo al cliente. |
| ❌ 34 | **Ventana de 20 segundos** para agrupar mensajes seguidos | Mediano. Además resuelve C6 (consolidar mensajes), con fecha límite dura el **1/10**. |
| ❌ 3.1 | Aviso de demora a los 30 min | Chico. |
| ❌ 3.2 | Vencimiento del pendiente a las 4 h | Chico. Hoy vence al fin del día. |
| ❌ 51 | Estados nuevos (`borrador`, `pendiente_confirmacion_cliente`, `modificacion_pendiente`, `en_espera`) y **versionado** | Grande, y es la base de casi todo lo de abajo. |
| ❌ 8 / 12 / 35 | Modificar un pedido (pendiente o confirmado), invalidando la versión vieja | Grande. |
| ❌ 9 | Varios pedidos simultáneos para distintas fechas | Grande. Hoy hay un índice único que permite **uno solo** por cliente. |
| ❌ 10 | Cancelaciones, incluido "sacame todo" | Mediano. |
| ❌ 11 / 25 / 26 | Cambiar, adelantar o postergar la hora/fecha de retiro | Mediano. |
| ❌ 22 / 22.1 | Pedidos anticipados para días futuros y su panel | Mediano. |
| ❌ 23 | Resumen diario al carnicero en la apertura | Chico-mediano. |
| ❌ 24 | Cierre excepcional con pedidos futuros → reprogramar | Mediano. |
| ❌ 27 | Historial de eventos por pedido | Mediano. No existe la tabla. |
| ❌ 32 | Borrador abandonado: "¿Te puedo ayudar con algo?" a la hora, y descarte al cierre | Chico-mediano. |
| ❌ 39 | Stock parcial ("me quedan 1,8 de los 3 kg, ¿completamos?") | Mediano. |
| ❌ 40 | Máximo una recomendación de complementario por pedido | Chico. El catálogo ya marca `es_complementario`. |
| ❌ 42 | Atención 24/7 proponiendo horarios válidos | Mediano. Depende de leer `horarios_atencion`. |
| ❌ 43 | Handoff excepcional por error técnico | Mediano. |
| ❌ 44 | Cliente enojado | Chico (instrucción de prompt). |

---

## Orden de implementación propuesto

Pensado para que cada tanda sea desplegable sola y no rompa lo que ya funciona.

**Tanda 1 — textos y datos de catálogo.** Riesgo casi nulo, mejora visible.
Mensajes definitivos (2.1, 4.3, 54) y pesos por unidad (6). **Aplicada el 08/09/2026.**

**Tanda 2 — el bot deja de ser solo un tomador de pedidos.**
Tipos de consulta nuevos + horarios, dirección, delivery, medios de pago y promociones
(1.1, 15-21, 42). Requiere agregar medios de pago y promociones a la base y al panel.

**Tanda 3 — la conversación se vuelve segura.**
Confirmación final obligatoria (31), ventana de 20 segundos (34, y con esto C6 antes del 1/10),
aviso de demora (3.1), vencimiento a 4 h (3.2), borrador abandonado (32).

**Tanda 4 — el pedido pasa a ser un objeto vivo.**
Estados nuevos y versionado (51), modificaciones (8, 12, 35), cancelación (10),
cambios de hora y fecha (11, 25, 26), varios pedidos simultáneos (9), historial (27).

**Tanda 5 — el ciclo del carnicero.**
Rechazo con motivo y opciones numeradas (36, 50), "en espera" y no-show al cierre (7.4-7.6),
resumen diario (23), cierre excepcional (24), regla de notificar todo cambio (53).

**Tanda 6 — refinamiento de la atención.**
Sustitutos autorizados y pregunta de uso (5.4, 5.5), stock parcial (39), complementarios (40),
cliente enojado (44), handoff por error técnico (43).

---

## Registro de tandas aplicadas

- **08/09/2026 — Tanda 1.**
  - Saludo inicial nuevo, sin "bienvenido/a" y sin nombre en el primer contacto (2.1-2.3), con
    variantes rotativas para el cliente ya conocido (4.3).
  - Textos definitivos de "pedido a confirmar", "pedido confirmado" y recordatorio (54).
  - Migración `0015`: pesos por unidad según la especificación (6) — milanesas a 150 g, y se
    incorporan hamburguesa y medallón a 120 g, que antes **no se podían pedir por unidad**.
  - Verificado que las reglas de catálogo de la sección 46 ya estaban todas cargadas.
  - Queda pendiente de la sección 2.1 la línea que enumera las consultas posibles ("stock,
    horarios, productos"): se suma cuando la Tanda 2 las haga reales.
