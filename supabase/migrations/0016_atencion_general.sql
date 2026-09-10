-- Tanda 2 — atención general: medios de pago y promociones.
-- Especificación del bot, secciones 17 y 19.
--
-- Hasta ahora el bot solo sabía tomar pedidos. La sección 1.1 dice que tiene
-- que poder responder también consultas de horarios, dirección, medios de pago
-- y promociones. Horarios y dirección YA existían en la base (migración 0013);
-- estos dos no existían en ningún lado, así que el bot no tenía de dónde
-- sacarlos — y la sección 1.3 prohíbe inventarlos.
--
-- Las dos cosas se cargan desde el panel (Configuración). Si el carnicero no
-- carga nada, el bot lo dice con naturalidad en vez de improvisar.

-- ============================================================
-- 1. MEDIOS DE PAGO
-- ============================================================
--
-- Un array de códigos y no una tabla aparte: es una lista corta, cerrada y
-- sin datos propios más allá de "está habilitado o no". La sección 19 lo
-- describe justamente como casillas que el carnicero tilda.
--
-- Los códigos válidos viven en `src/lib/mediosPago.ts` (ahí está también el
-- texto que ve el cliente). No se valida acá con un CHECK a propósito: si
-- mañana aparece un medio nuevo, no queremos que sumarlo requiera una
-- migración.
alter table carnicerias
  add column if not exists medios_pago text[] not null default '{}';

comment on column carnicerias.medios_pago is
  'Códigos de los medios de pago habilitados (ver src/lib/mediosPago.ts). Vacío = el bot responde que conviene consultarlo en el local.';

-- ============================================================
-- 2. PROMOCIONES
-- ============================================================
--
-- Regla absoluta de la sección 17: el bot NUNCA inventa una promoción. Solo
-- puede comunicar las que estén cargadas, activas y vigentes. Por eso hay
-- tres filtros distintos y no uno solo:
--
--   activa  → el carnicero la apaga sin borrarla (ej. una promo que repite
--             todos los meses).
--   desde   → se carga con anticipación y recién aparece cuando arranca.
--   hasta   → deja de comunicarse sola, sin depender de que alguien se
--             acuerde de apagarla. Este es el que más protege: una promo
--             vencida que el bot sigue ofreciendo es un problema real con
--             un cliente parado en el mostrador.
--
-- `desde` y `hasta` en null significan "sin límite por ese lado".
create table if not exists promociones (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  titulo text not null,
  detalle text,
  activa boolean not null default true,
  desde date,
  hasta date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promociones_rango_coherente check (desde is null or hasta is null or hasta >= desde)
);

create index if not exists promociones_vigentes_idx
  on promociones (carniceria_id, activa);

alter table promociones enable row level security;

drop policy if exists "promociones_select_own" on promociones;
create policy "promociones_select_own" on promociones
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "promociones_insert_own" on promociones;
create policy "promociones_insert_own" on promociones
  for insert with check (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "promociones_update_own" on promociones;
create policy "promociones_update_own" on promociones
  for update using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "promociones_delete_own" on promociones;
create policy "promociones_delete_own" on promociones
  for delete using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );
