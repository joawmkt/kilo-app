-- ============================================================
-- 0029 — La tabla de recomendaciones, editable por cada carnicero
-- ============================================================
--
-- Pedido del fundador (29/09/2026): "quiero que el carnicero pueda editar las
-- tablas desde el panel".
--
-- El bot recomienda según para qué lo quiere el cliente ("¿qué te queda para
-- la parrilla?", "algo para milanesas"). De fábrica trae una tabla con
-- criterio de carnicería argentina (src/lib/recomendaciones.ts). Pero cada
-- carnicería tiene lo suyo: una ofrece la bondiola para la parrilla y otra no,
-- una pone la entraña primero y otra al final. Esta tabla guarda LA SUYA.
--
-- CÓMO SE LEE (ver src/lib/recomendacionesCarniceria.ts):
--   - Si la carnicería no tiene NINGUNA fila acá, el bot usa la de fábrica.
--     Así una carnicería nueva recomienda bien desde el primer día sin que
--     nadie cargue nada.
--   - La primera vez que el carnicero guarda un cambio en el panel, se copia
--     la de fábrica entera y se aplica su cambio. Desde ahí, esta tabla manda.
--   - Una ocasión sin filas (porque el carnicero sacó todo) queda vacía a
--     propósito: el bot dice que para eso no tiene nada.
--
-- Una fila = un producto dentro de una ocasión, con su lugar en la lista y si
-- es un corte principal o algo "para acompañar" (achuras, embutidos, carbón).
-- Nunca se ofrece algo sin stock: eso lo filtra el bot al contestar, no esta
-- tabla. Así el carnicero arma su lista UNA vez y no la toca todos los días.

create table if not exists recomendaciones_ocasion (
  id            uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  ocasion       text not null
                check (ocasion in ('parrilla', 'horno', 'milanesas', 'olla', 'plancha', 'vitel_tone', 'picada', 'salteado')),
  producto_id   uuid not null references productos(id) on delete cascade,
  rol           text not null default 'corte' check (rol in ('corte', 'acompana')),
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (carniceria_id, ocasion, producto_id)
);

create index if not exists recomendaciones_ocasion_carniceria_idx
  on recomendaciones_ocasion (carniceria_id, ocasion, rol, orden);

-- Mismo esquema que el resto del panel: el dueño LEE lo suyo con RLS; las
-- escrituras van por server actions que primero verifican la sesión y después
-- usan la service_role filtrando por su carniceria_id.
alter table recomendaciones_ocasion enable row level security;

drop policy if exists recomendaciones_ocasion_select_own on recomendaciones_ocasion;
create policy recomendaciones_ocasion_select_own on recomendaciones_ocasion
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );
