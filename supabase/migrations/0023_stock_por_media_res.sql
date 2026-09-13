-- ============================================================
-- 0023 — Stock por media res
-- ============================================================
--
-- Ver `docs/media-res-diseno-final.md` para el razonamiento completo. Acá van
-- solo las decisiones que explican por qué las tablas son así y no de otra forma.
--
-- 1. UNA MEDIA RES NO SUMA KILOS: LOS TRANSFORMA.
--    Consume una pieza grande de peso conocido y produce cortes, recortes,
--    hueso, grasa y merma. El balance cierra contra el peso de entrada. Por eso
--    hay un lote (`recepciones_lote`) y no un simple "+110 kg".
--
-- 2. EL STOCK SON PIEZAS, Y LOS KILOS VIVEN ADENTRO DE CADA PIEZA.
--    NO hay una tabla de "kilos por corte". Los kilos de un corte son la suma de
--    sus piezas, calculada. Si existieran los dos números por separado, tarde o
--    temprano dirían cosas distintas — que es exactamente el problema de stock
--    fantasma que este diseño evita.
--
-- 3. LA CONFIANZA TIENE DOS ESTADOS, NO SEIS.
--    `estimado` (nació de la tabla) y `pesado` (alguien lo pesó). Se probó con
--    seis y no eran seis estados de confianza: "reservado" es un pedido que
--    aparta kilos, "vendido" es un movimiento, "ajustado" es un movimiento con
--    causa. Tres conceptos distintos en una sola lista.
--
-- 4. CADA KILO QUE SALE TIENE UNA CAUSA.
--    Sin eso, "la merma es lo que sobra" y desaparece el único número que le
--    devuelve plata al carnicero: los kilos que se degradan a picada por mala
--    rotación (~$2.400 por animal según la investigación).
--
-- 5. EL DESCUADRE ES UN RENGLÓN, NO UN ERROR.
--    entrada = salidas + lo que queda + DESCUADRE. La ecuación cierra siempre
--    porque el descuadre es la línea que la hace cerrar. Lo que se gestiona es
--    su TAMAÑO. Igual que el arqueo de caja: nunca da exacto, y la contabilidad
--    cierra lo mismo porque la diferencia tiene nombre.

-- ============================================================
-- 1. LA TABLA DE RENDIMIENTO — "la tabla de porcentajes"
-- ============================================================
--
-- Versionada, y eso no es burocracia: si en marzo la tabla decía que el asado
-- era el 9 % y en junio dice 8 %, la media res que entró en marzo tiene que
-- seguir explicándose con el 9 %, o su historia deja de cerrar. Es lo mismo que
-- guardar la lista de precios vieja para entender una factura vieja.

create table if not exists tablas_rendimiento (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  categoria text not null check (categoria in ('novillo', 'novillito', 'vaquillona', 'vaca', 'ternera')),
  -- Segmentar por proveedor se puede, pero NO desde el día uno: cada tabla
  -- necesita sus propias 10-20 medias res para calibrar, y si se parte en cinco
  -- el primer día, ninguna junta datos suficientes.
  proveedor text,
  version integer not null default 1,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  -- Las tres masas que no son carne vendible.
  pct_hueso numeric(5,2) not null,
  pct_grasa numeric(5,2) not null,
  pct_merma numeric(5,2) not null,
  notas text,
  created_at timestamptz not null default now(),
  unique (carniceria_id, categoria, proveedor, version)
);

create table if not exists rendimiento_cortes (
  id uuid primary key default gen_random_uuid(),
  tabla_id uuid not null references tablas_rendimiento(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  pct_central numeric(5,2) not null,
  -- P10 y P90, NO mínimo y máximo: la mediana y los percentiles aguantan el
  -- desposte raro, el promedio y los extremos no.
  pct_p10 numeric(5,2),
  pct_p90 numeric(5,2),
  origen text not null default 'referencia' check (origen in ('referencia', 'calibrado')),
  muestras integer not null default 0,
  unique (tabla_id, producto_id)
);

-- ------------------------------------------------------------
-- El control de cierre al 100 %
-- ------------------------------------------------------------
--
-- OJO CON QUÉ CIERRA Y QUÉ NO:
--   - La TABLA tiene que sumar 100 %. Es una receta ("de 100 kg que entran,
--     6,85 son asado"). Si suma 108 %, está rota. Esto es matemática.
--   - El STOCK FÍSICO nunca cierra perfecto, y está bien: los cortes se mezclan,
--     se recortan y se pican. Para eso está el descuadre.
--
-- Esta función es sobre lo primero. Existe porque el error es invisible a ojo:
-- una de las propuestas que se revisaron tenía 67,9 % en 13 filas y decía que el
-- vendible era 65-72 %. Nadie lo vio hasta que se sumó.

create or replace function verificar_cierre_tabla_rendimiento(p_tabla_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_cortes numeric;
  v_resto numeric;
begin
  select coalesce(sum(pct_central), 0) into v_cortes
    from rendimiento_cortes where tabla_id = p_tabla_id;

  select pct_hueso + pct_grasa + pct_merma into v_resto
    from tablas_rendimiento where id = p_tabla_id;

  return round(v_cortes + coalesce(v_resto, 0), 2);
end $$;

comment on function verificar_cierre_tabla_rendimiento is
  'Devuelve cuánto suma la tabla. Tiene que dar 100,00. Correr después de tocar '
  'cualquier porcentaje. No es un trigger a propósito: durante una carga en '
  'varios pasos la tabla está incompleta, y abortar a mitad sería peor.';

-- ============================================================
-- 2. LA RECEPCIÓN — la media res que entró
-- ============================================================

create table if not exists recepciones_lote (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  categoria text not null check (categoria in ('novillo', 'novillito', 'vaquillona', 'vaca', 'ternera')),
  proveedor text,
  remito text,
  factura text,

  -- LOS DOS PESOS QUE IMPORTAN, y la diferencia entre ellos es PLATA:
  -- es la única forma de darse cuenta de que el frigorífico factura más kilos
  -- de los que baja del camión.
  peso_facturado_kg numeric(10,2),
  peso_recibido_kg numeric(10,2) not null check (peso_recibido_kg > 0),
  -- Opcional: pesar antes de cortar separa la merma de frío de la de proceso.
  -- Es un pesaje extra, así que nunca se exige.
  peso_predesposte_kg numeric(10,2),

  -- El costo solo se puede capturar AHORA. Si no se anota el día que llegó la
  -- media res, no se reconstruye nunca más.
  costo_mercaderia numeric(12,2),
  costo_flete numeric(12,2),
  costo_otros numeric(12,2),

  temperatura_recepcion numeric(4,1),
  estado_recepcion text not null default 'aceptado'
    check (estado_recepcion in ('aceptado', 'observado', 'rechazado')),

  tabla_rendimiento_id uuid references tablas_rendimiento(id) on delete restrict,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  rinde_real numeric(5,2),
  descuadre_kg numeric(10,2),
  cerrada_at timestamptz,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists recepciones_lote_abiertas_idx
  on recepciones_lote (carniceria_id, fecha desc) where estado = 'abierta';

-- ============================================================
-- 3. LAS PIEZAS — esto ES el stock
-- ============================================================

create table if not exists piezas_stock (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  -- Opcional a propósito: así entra por la misma puerta lo que NO viene de una
  -- media res (achuras, pollo, cerdo, una caja de 10 kg de nalga) sin necesidad
  -- de un modelo paralelo. Y si el troceo obligatorio vuelve —el debate se
  -- reabrió en 2024— llegan cortes ya despostados y el modelo aguanta igual.
  recepcion_lote_id uuid references recepciones_lote(id) on delete set null,

  kg_iniciales numeric(10,3) not null check (kg_iniciales >= 0),
  kg_restantes numeric(10,3) not null check (kg_restantes >= 0),

  confianza text not null default 'estimado' check (confianza in ('estimado', 'pesado')),
  es_subproducto boolean not null default false,

  estado text not null default 'disponible'
    check (estado in ('disponible', 'agotada', 'degradada')),

  ingresada_at timestamptz not null default now(),
  agotada_at timestamptz,
  created_at timestamptz not null default now()
);

-- Para la vista de stock: las piezas vivas de cada producto.
create index if not exists piezas_stock_disponibles_idx
  on piezas_stock (carniceria_id, producto_id) where estado = 'disponible';

-- Para FEFO: qué pieza lleva más tiempo en la cámara. De acá salen los kilos que
-- se degradan a picada por mala rotación.
create index if not exists piezas_stock_antiguedad_idx
  on piezas_stock (carniceria_id, ingresada_at) where estado = 'disponible';

create index if not exists piezas_stock_lote_idx on piezas_stock (recepcion_lote_id);

-- ============================================================
-- 4. LOS MOVIMIENTOS — cada kilo que entra o sale, con su causa
-- ============================================================

create table if not exists movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  pieza_id uuid references piezas_stock(id) on delete cascade,
  recepcion_lote_id uuid references recepciones_lote(id) on delete set null,

  tipo text not null check (tipo in (
    'entrada',           -- nació la pieza
    'venta',             -- se vendió (por pedido o por mostrador)
    'hueso',             -- subproducto: el sebero paga
    'grasa',             -- subproducto: el sebero paga
    'recorte_picada',    -- se transforma y se vende
    'merma_frio',        -- goteo y evaporación: merma inevitable
    'degradado',         -- se pasó por mala rotación: merma EVITABLE
    'descuadre',         -- faltan kilos y no se sabe por qué: la alarma
    'ajuste'             -- corrección a mano, siempre con causa
  )),

  kg numeric(10,3) not null,
  -- Guardado en el movimiento, no calculado después: permite reconstruir el
  -- margen de una venta vieja aunque haya cambiado el precio de la media res.
  costo_unitario numeric(12,4),
  causa text,
  pedido_id uuid references pedidos(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movimientos_stock_pieza_idx
  on movimientos_stock (pieza_id, created_at desc);
create index if not exists movimientos_stock_lote_idx
  on movimientos_stock (recepcion_lote_id, tipo);
create index if not exists movimientos_stock_fecha_idx
  on movimientos_stock (carniceria_id, created_at desc);

-- ============================================================
-- 5. Coexistencia con el stock que ya usa el bot
-- ============================================================
--
-- `productos.stock_actual` sigue existiendo y sigue siendo lo que lee el bot.
-- Ahora pasa a ser un CACHE de la suma de las piezas.
--
-- Por qué un cache y no una vista: el bot consulta el stock en cada mensaje y
-- `productos` ya está en todas las consultas del catálogo. Recalcular en cada
-- lectura sería pagar un join por mensaje para un número que cambia pocas veces
-- al día. Se recalcula al escribir, que es cuando cambia.
--
-- Esto es lo que hace que TODO el bot siga funcionando sin tocar una línea.

create or replace function recalcular_stock_de_producto(p_producto_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_kg numeric;
begin
  select coalesce(sum(kg_restantes), 0) into v_kg
    from piezas_stock
   where producto_id = p_producto_id and estado = 'disponible';

  update productos
     set stock_actual = round(v_kg, 2),
         stock_actualizado_at = now(),
         stock_origen = 'media_res'
   where id = p_producto_id;

  return round(v_kg, 2);
end $$;

comment on function recalcular_stock_de_producto is
  'Recalcula productos.stock_actual sumando las piezas disponibles. El bot lee '
  'stock_actual y no sabe nada de piezas: por eso todo lo anterior sigue andando.';

-- `stock_origen` ya existía con un check; se le agrega el valor nuevo.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'productos_stock_origen_check') then
    alter table productos drop constraint productos_stock_origen_check;
  end if;
end $$;

alter table productos
  add constraint productos_stock_origen_check
  check (stock_origen is null or stock_origen in ('audio', 'panel', 'pedido', 'media_res', 'ajuste'));

-- ============================================================
-- 6. El balance del lote — la ecuación que siempre cierra
-- ============================================================

create or replace function balance_de_lote(p_lote_id uuid)
returns table (
  peso_entrada numeric,
  vendido numeric,
  hueso numeric,
  grasa numeric,
  recortes numeric,
  merma_frio numeric,
  degradado numeric,
  en_stock numeric,
  descuadre numeric,
  rinde_pct numeric
)
language plpgsql
as $$
declare
  v_entrada numeric;
begin
  select coalesce(peso_predesposte_kg, peso_recibido_kg) into v_entrada
    from recepciones_lote where id = p_lote_id;

  return query
  with m as (
    select tipo, coalesce(sum(kg), 0) as kg
      from movimientos_stock
     where recepcion_lote_id = p_lote_id
     group by tipo
  ),
  s as (
    select coalesce(sum(kg_restantes), 0) as kg
      from piezas_stock
     where recepcion_lote_id = p_lote_id and estado = 'disponible'
  )
  select
    v_entrada,
    coalesce((select kg from m where tipo = 'venta'), 0),
    coalesce((select kg from m where tipo = 'hueso'), 0),
    coalesce((select kg from m where tipo = 'grasa'), 0),
    coalesce((select kg from m where tipo = 'recorte_picada'), 0),
    coalesce((select kg from m where tipo = 'merma_frio'), 0),
    coalesce((select kg from m where tipo = 'degradado'), 0),
    (select kg from s),
    -- EL DESCUADRE ES LO QUE HACE CERRAR LA ECUACIÓN. No es un error: es el
    -- nombre de la diferencia. Se espera que NO dé cero.
    round(v_entrada
      - coalesce((select kg from m where tipo = 'venta'), 0)
      - coalesce((select kg from m where tipo = 'hueso'), 0)
      - coalesce((select kg from m where tipo = 'grasa'), 0)
      - coalesce((select kg from m where tipo = 'recorte_picada'), 0)
      - coalesce((select kg from m where tipo = 'merma_frio'), 0)
      - coalesce((select kg from m where tipo = 'degradado'), 0)
      - (select kg from s), 3),
    case when v_entrada > 0 then round(100.0 * (
        coalesce((select kg from m where tipo = 'venta'), 0)
      + coalesce((select kg from m where tipo = 'recorte_picada'), 0)
      + (select kg from s)) / v_entrada, 2)
    else null end;
end $$;

-- ============================================================
-- 7. RLS — mismo criterio que el resto del panel
-- ============================================================

alter table tablas_rendimiento enable row level security;
alter table rendimiento_cortes enable row level security;
alter table recepciones_lote enable row level security;
alter table piezas_stock enable row level security;
alter table movimientos_stock enable row level security;

drop policy if exists "tablas_rendimiento_select_own" on tablas_rendimiento;
create policy "tablas_rendimiento_select_own" on tablas_rendimiento
  for select using (carniceria_id in (select id from carnicerias where owner_user_id = auth.uid()));

drop policy if exists "rendimiento_cortes_select_own" on rendimiento_cortes;
create policy "rendimiento_cortes_select_own" on rendimiento_cortes
  for select using (tabla_id in (
    select t.id from tablas_rendimiento t
     join carnicerias c on c.id = t.carniceria_id
    where c.owner_user_id = auth.uid()));

drop policy if exists "recepciones_lote_select_own" on recepciones_lote;
create policy "recepciones_lote_select_own" on recepciones_lote
  for select using (carniceria_id in (select id from carnicerias where owner_user_id = auth.uid()));

drop policy if exists "piezas_stock_select_own" on piezas_stock;
create policy "piezas_stock_select_own" on piezas_stock
  for select using (carniceria_id in (select id from carnicerias where owner_user_id = auth.uid()));

drop policy if exists "movimientos_stock_select_own" on movimientos_stock;
create policy "movimientos_stock_select_own" on movimientos_stock
  for select using (carniceria_id in (select id from carnicerias where owner_user_id = auth.uid()));
