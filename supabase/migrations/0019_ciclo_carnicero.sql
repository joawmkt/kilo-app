-- Tanda 5 — el ciclo del carnicero.
-- Especificación del bot, secciones 7.4 a 7.6, 23, 24, 36 y 50.
--
-- La idea que atraviesa toda esta tanda está en la sección 1.7: el carnicero
-- decide, pero NO conversa con el cliente. El bot le hace preguntas cortas con
-- opciones numeradas, él contesta con un número, y el bot se encarga de
-- traducir esa decisión a una conversación normal con el cliente.

-- ============================================================
-- 1. CONSULTA ABIERTA AL CARNICERO (secciones 36 y 50)
-- ============================================================
--
-- Cuando el carnicero rechaza un pedido, el bot no lo da por muerto: le
-- pregunta por qué, y según la respuesta le ofrece salidas ("posponer 1 hora",
-- "pasarlo a mañana"). Eso es una conversación de varios pasos, así que hay que
-- recordar en qué paso está.
--
-- Vive en el pedido y no en una tabla aparte porque una consulta SIEMPRE es
-- sobre un pedido concreto: guardarlo acá evita tener que cruzar dos tablas
-- para saber a qué se refiere el "3" que acaba de escribir el carnicero.
--
-- Forma del jsonb: { paso: 'motivo' | 'demora' | 'stock' | 'otro',
--                    opciones: [{ numero, etiqueta, valor }] }
alter table pedidos
  add column if not exists consulta_carnicero jsonb,
  add column if not exists rechazo_motivo text;

comment on column pedidos.consulta_carnicero is
  'Pregunta con opciones numeradas que el bot le hizo al carnicero y espera respuesta (secciones 36 y 50).';

create index if not exists pedidos_consulta_carnicero_idx
  on pedidos (carniceria_id, updated_at desc)
  where consulta_carnicero is not null;

-- ============================================================
-- 2. "EN ESPERA" Y NO-SHOW (secciones 7.4 a 7.6)
-- ============================================================
--
-- Cambio importante de criterio respecto de lo que había: el no-show YA NO es
-- automático a los 60 minutos de la hora de retiro. La sección 7.4 dice que al
-- cierre el bot le pregunta al carnicero, y él elige "retirado" o "en espera".
-- Recién si al cierre del día adicional sigue sin retirarse, pasa a no_show
-- (7.6).
--
-- Marcar a alguien como ausente sin preguntarle a nadie era una acusación
-- automática basada en una suposición: nadie le avisa al sistema cuando el
-- cliente sí pasó por el mostrador.
alter table pedidos
  add column if not exists en_espera_hasta date;

comment on column pedidos.en_espera_hasta is
  'Hasta qué día queda reservado un pedido que el carnicero marcó "en espera" (sección 7.5).';

-- ============================================================
-- 3. RESUMEN DIARIO EN LA APERTURA (sección 23)
-- ============================================================
--
-- Una sola marca por día para no repetir el resumen en cada pasada del cron
-- (que corre cada 10 minutos). Es una fecha y no un timestamp a propósito: la
-- pregunta que hay que responder es "¿ya lo mandé HOY?".
alter table carnicerias
  add column if not exists resumen_diario_enviado_on date;

comment on column carnicerias.resumen_diario_enviado_on is
  'Último día en que se mandó el resumen de pedidos de la jornada (sección 23).';

-- ============================================================
-- 4. CIERRE EXCEPCIONAL CON PEDIDOS PROGRAMADOS (sección 24)
-- ============================================================
--
-- Si el carnicero marca un día como cerrado y hay pedidos para ese día, NO se
-- cancelan solos: se avisa, se le pide al cliente una fecha nueva y se mantiene
-- el pedido mientras tanto. Esta marca evita volver a avisarle al mismo cliente
-- cada vez que corre el cron.
alter table pedidos
  add column if not exists aviso_cierre_enviado_at timestamptz;

comment on column pedidos.aviso_cierre_enviado_at is
  'Cuándo se le avisó al cliente que ese día la carnicería no abre (sección 24).';
