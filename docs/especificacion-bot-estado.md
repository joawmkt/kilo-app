# Estado de implementación de la especificación del bot

> Compañero de `docs/especificacion-bot.md`. Los números entre paréntesis son las secciones
> de esa especificación. **Actualizar este archivo cada vez que se implemente una parte.**
>
> Última revisión contra el código: **10/09/2026**. Las seis tandas del plan están aplicadas.

Leyenda: ✅ hecho · 🟡 parcial · ❌ falta

---

## Resumen

Las seis tandas se aplicaron entre el 08 y el 10/09/2026, con `npm run lint` y `npm run build`
limpios en cada una. Migraciones nuevas: de la `0015` a la `0020`.

| Tanda | Qué trajo | Estado |
|---|---|---|
| 1 | Textos definitivos y pesos por unidad | ✅ |
| 2 | El bot responde consultas (horarios, dirección, pagos, promos, delivery, stock) | ✅ |
| 3 | Ventana de agrupación, confirmación final, avisos de demora y borradores | ✅ |
| 4 | Pedido modificable, cancelable y reprogramable, con versionado e historial | ✅ |
| 5 | Rechazo conversado, "en espera", resumen diario y cierres excepcionales | ✅ |
| 6 | Sustitutos autorizados, stock parcial, complementarios y handoff | ✅ |

---

## Sección por sección

| Sección | Qué pide | Estado |
|---|---|---|
| 1.1 | Atención al público, no solo tomar pedidos | ✅ Tanda 2 — `src/lib/consultas.ts` |
| 1.2 | Tono argentino, natural, cercano | ✅ Textos revisados en las Tandas 1 y 5 |
| 1.3 | Nunca inventar | ✅ Estructural: cada respuesta sale de un dato real o se reconoce que falta |
| 1.4 | Nunca suponer ante ambigüedad | ✅ Términos ambiguos, y se pregunta cuál pedido cuando hay más de uno |
| 1.5 | El contexto manda | ✅ |
| 1.6 / 1.7 | El carnicero decide pero no conversa | ✅ Tanda 5 — opciones numeradas por WhatsApp y por panel |
| 2.1-2.4 | Mensaje inicial y detección de intención | ✅ Tandas 1 y 2 |
| 3.1 | Aviso de demora a los 30 min, una sola vez | ✅ Tanda 3 (cron) |
| 3.2 | Vencimiento a las 4 h | ✅ Tanda 3 |
| 3.3 | No duplicar pedidos mientras hay uno pendiente | ✅ |
| 4.1 / 4.3 | Cliente nuevo vs recurrente | ✅ Tanda 1 |
| 4.2 | Pedir el nombre a las ~2 h | ❌ Único pendiente de la sección 4 |
| 5.1-5.5 | Sustitutos solo dentro de lo autorizado, preguntando el uso | ✅ Tanda 6 — tabla `sustitutos_autorizados` + panel |
| 5.6 | Avisar si el sustituto es más caro | ❌ Depende de que se activen los precios (sección 13) |
| 6 | Pesos aproximados por unidad | ✅ Tanda 1 (migración `0015`) |
| 7.1-7.2 | Hora orientativa y un solo recordatorio 1 h antes | ✅ |
| 7.3-7.6 | Cierre del día, "en espera", no-show recién al día siguiente | ✅ Tanda 5 |
| 8 / 12 / 35 | Modificar un pedido, invalidando la versión anterior | ✅ Tanda 4 |
| 9 | Varios pedidos simultáneos para fechas distintas | ✅ Tanda 4 — se pregunta cuál cuando hay más de uno |
| 10 | Cancelaciones, incluido "sacame todo" | ✅ Tanda 4 — detectado por intención, no por la palabra |
| 11 / 25 / 26 | Cambiar, adelantar o postergar el retiro | ✅ Tanda 4 — adelantar requiere que el carnicero confirme |
| 13 | No informar precios | ✅ Estructural: el precio nunca entra al prompt del bot |
| 14 / 41 | Sin mínimos ni reglas por tamaño | ✅ |
| 15 | Reconocer cuando no sabe algo | ✅ Tanda 2 |
| 16 | Consultar al carnicero, sin entregarle el chat | ✅ Tanda 5 |
| 17 | Promociones solo si están cargadas y vigentes | ✅ Tanda 2 — tabla `promociones` + panel |
| 18 | Horarios, con feriados y cierres | ✅ Tanda 2 |
| 19 | Medios de pago | ✅ Tanda 2 — casillas en el panel |
| 20 | Sin delivery | ✅ Tanda 2 |
| 21 | Dirección | ✅ Tanda 2 |
| 22 | Pedidos anticipados | ✅ Tanda 4 |
| 22.1 | Panel de pedidos futuros | 🟡 Se ven en `/panel/pedidos`, sin una vista propia de agenda |
| 23 | Resumen diario en la apertura | ✅ Tanda 5 |
| 24 | Cierre excepcional con pedidos programados | ✅ Tanda 5 |
| 27 | Historial de eventos del pedido | ✅ Tanda 4 — visible en el detalle del pedido |
| 28 | Un pedido retirado queda cerrado | ✅ |
| 29 / 32 | Ambigüedad y borradores abandonados | ✅ Tanda 3 |
| 30 | Correcciones ("no, 1 kg") | ✅ |
| 31 | Confirmación final obligatoria | ✅ Tanda 3 |
| 33 | Audios parciales | ✅ Y desde la Tanda 3 el audio se agrupa con el texto |
| 34 | Ventana de agrupación | ✅ Tanda 3 — **6 segundos**, no 20 (decisión del fundador, 10/09) |
| 36 / 50 | Rechazo con motivo y opciones numeradas | ✅ Tanda 5 |
| 37 / 38 | Stock agotado y reposición | ✅ |
| 39 | Stock parcial | ✅ Tanda 6 |
| 40 | Una sola recomendación de complementario | ✅ Tanda 6 |
| 42 | Atención 24/7 | 🟡 El bot atiende siempre; falta que proponga horarios válidos al elegir el retiro |
| 43 | Handoff por error técnico | ✅ Tanda 6 — "Atiendo yo" en la conversación, con pausa que se levanta sola |
| 44 | Cliente enojado | ✅ Tanda 6 (instrucción de interpretación) |
| 45 | Cierre natural de la conversación | 🟡 No hay un tipo de intención para "gracias/listo" |
| 46 | Reglas de catálogo | ✅ Ya estaban todas cargadas |
| 47 | Cálculo por personas | ✅ |
| 51 | Estados y versionado | ✅ Tanda 4 |
| 52 | Configuraciones del panel | ✅ Medios de pago, promociones y reemplazos autorizados agregados |
| 53 | Notificar todo cambio al carnicero | ✅ Tandas 4 y 5 |

---

## Lo que quedó pendiente, y por qué

Son cuatro cosas, todas chicas y ninguna bloqueante:

1. **Pedir el nombre a las ~2 horas (4.2).** Hoy el nombre se toma del perfil de WhatsApp cuando
   está disponible. Falta el mensaje que lo pide con naturalidad si no lo tenemos.
2. **Avisar que un sustituto es más caro (5.6).** La propia especificación lo deja preparado para
   cuando se activen los precios, que hoy están desactivados por decisión de la sección 13.
3. **Proponer horarios válidos al pedir el retiro (42).** El bot ya conoce los horarios (se usan
   para el resumen diario y el cierre); falta usarlos para no aceptar una hora en que el local
   está cerrado.
4. **Cierre natural de la conversación (45).** Un "gracias" hoy cae en el intérprete general.
   Hace falta un tipo de intención propio para contestar corto y no reabrir la venta.

Y una decisión que conviene revisar con uso real:

- **La ventana de agrupación quedó en 6 segundos** en vez de los 20 de la especificación. Se puede
  mover sin tocar código con la variable de entorno `VENTANA_AGRUPACION_SEGUNDOS`.

---

## Migraciones de estas tandas

| Migración | Qué trae |
|---|---|
| `0015_pesos_por_unidad_especificacion.sql` | Pesos por unidad (6) |
| `0016_atencion_general.sql` | Medios de pago y promociones (17, 19) |
| `0017_ventana_y_confirmacion.sql` | Agrupación de mensajes y confirmación final (31, 34, 3.1, 32) |
| `0018_pedido_vivo.sql` | Versionado, estados nuevos, historial y avisos (8-12, 27, 35, 51, 53) |
| `0019_ciclo_carnicero.sql` | Rechazo conversado, "en espera", resumen diario, cierres (7.4-7.6, 23, 24, 36) |
| `0020_sustitutos_y_atencion.sql` | Sustitutos autorizados, complementarios y handoff (5, 40, 43) |

Correr en orden. La `0020` además carga los reemplazos que la sección 5.5 autoriza explícitamente.
