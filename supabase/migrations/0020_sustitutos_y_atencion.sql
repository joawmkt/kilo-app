-- Tanda 6 — refinamiento de la atención.
-- Especificación del bot, secciones 5, 39, 40, 43 y 44.

-- ============================================================
-- 1. SUSTITUTOS AUTORIZADOS (sección 5)
-- ============================================================
--
-- Cambio de criterio importante. Hasta ahora, cuando faltaba un corte, el bot
-- ofrecía cualquier otro de la misma familia con stock. Eso da resultados
-- absurdos: la sección 5.5 dice explícitamente que NO hay que ofrecer lomo en
-- lugar de vacío solo porque los dos son carne vacuna, ni roast beef en lugar
-- de nalga para milanesas.
--
-- La sección 5.1 define el criterio: la IA puede razonar cuál es la mejor
-- alternativa, pero **solo dentro de un conjunto previamente autorizado**. Esta
-- tabla ES ese conjunto. Si un producto no tiene sustitutos cargados, el bot no
-- ofrece ninguno — y eso está bien: es preferible decir "no tengo" a ofrecer
-- algo que el cliente no quería.
--
-- `prioridad` ordena las opciones (1 es la mejor). `requiere_preguntar_uso`
-- marca los casos donde el reemplazo depende de para qué lo va a usar
-- (sección 5.4): ahí el bot pregunta antes de proponer.
create table if not exists sustitutos_autorizados (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  sustituto_id uuid not null references productos(id) on delete cascade,
  prioridad smallint not null default 1,
  requiere_preguntar_uso boolean not null default false,
  created_at timestamptz not null default now(),
  unique (carniceria_id, producto_id, sustituto_id),
  constraint sustituto_distinto check (producto_id <> sustituto_id)
);

create index if not exists sustitutos_por_producto_idx
  on sustitutos_autorizados (carniceria_id, producto_id, prioridad);

alter table sustitutos_autorizados enable row level security;

drop policy if exists "sustitutos_select_own" on sustitutos_autorizados;
create policy "sustitutos_select_own" on sustitutos_autorizados
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "sustitutos_insert_own" on sustitutos_autorizados;
create policy "sustitutos_insert_own" on sustitutos_autorizados
  for insert with check (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "sustitutos_delete_own" on sustitutos_autorizados;
create policy "sustitutos_delete_own" on sustitutos_autorizados
  for delete using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Carga inicial — el mapeo de la sección 5.5
-- ------------------------------------------------------------
--
-- Solo lo que la especificación autoriza explícitamente. Los cortes de parrilla
-- quedan SIN sustitutos a propósito: la 5.5 dice que ahí depende del uso y del
-- stock, y que no hay que asumir que un corte reemplaza a otro. Cuando el
-- carnicero piloto defina esos casos, se cargan desde el panel.
do $$
declare
  fila record;
  v_producto uuid;
  v_sustituto uuid;
begin
  for fila in
    select * from (values
      -- Milanesas / cortes magros (sección 5.5)
      ('nalga',       'cuadrada',     1, false),
      ('nalga',       'bola_de_lomo', 2, false),
      ('nalga',       'peceto',       3, true),
      ('cuadrada',    'nalga',        1, false),
      ('cuadrada',    'bola_de_lomo', 2, false),
      ('bola_de_lomo','nalga',        1, false),
      ('bola_de_lomo','cuadrada',     2, false),
      -- El peceto solo reemplaza cuando el uso lo permite: se pregunta antes.
      ('peceto',      'nalga',        1, true),
      ('peceto',      'bola_de_lomo', 2, true)
    ) as t(producto, sustituto, prioridad, preguntar)
  loop
    insert into sustitutos_autorizados (carniceria_id, producto_id, sustituto_id, prioridad, requiere_preguntar_uso)
    select p.carniceria_id, p.id, sfrom.id, fila.prioridad, fila.preguntar
    from productos p
    join productos sfrom
      on sfrom.carniceria_id = p.carniceria_id and sfrom.codigo = fila.sustituto
    where p.codigo = fila.producto
    on conflict (carniceria_id, producto_id, sustituto_id) do nothing;
  end loop;
end $$;

-- ============================================================
-- 2. UNA RECOMENDACIÓN POR PEDIDO (sección 40)
-- ============================================================
--
-- "Máximo una recomendación contextual por pedido. No repetir recomendaciones.
-- No vender por vender." Sin esta marca, el bot ofrecería carbón en cada
-- mensaje de la conversación, que es exactamente lo que la sección prohíbe.
alter table pedidos
  add column if not exists recomendacion_hecha boolean not null default false;

-- ============================================================
-- 3. HANDOFF POR ERROR TÉCNICO (sección 43)
-- ============================================================
--
-- La ÚNICA excepción en la que el carnicero habla directo con el cliente. Se
-- implementa como una pausa del bot en esa conversación: mientras está pausada,
-- el bot registra los mensajes pero no contesta, para no hablar por encima de
-- una persona.
--
-- Es una fecha y no un booleano para que la pausa se levante sola: una pausa
-- que hay que acordarse de sacar termina dejando conversaciones mudas para
-- siempre.
alter table conversaciones
  add column if not exists bot_pausado_hasta timestamptz;

comment on column conversaciones.bot_pausado_hasta is
  'Mientras esté en el futuro, el bot no contesta en esta conversación: la atiende una persona (sección 43).';
