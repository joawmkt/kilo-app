-- ============================================================
-- 0025 — La especie como campo propio, y el lote que no usa tabla
-- ============================================================
--
-- Ver `docs/pollo-y-cerdo-diseno.md`. Acá van solo las decisiones que explican
-- por qué las columnas son así y no de otra forma.
--
-- 1. `especie` ES UN CAMPO APARTE DE `categoria`, Y NO UN VALOR MÁS.
--    "Novillo" es una categoría DENTRO de vacuno. Si se metieran 'pollo' y
--    'cerdo' en el mismo enum, la columna significaría dos cosas distintas
--    según la fila, y eso siempre termina en un `if` escondido. Además:
--    en pollo NO hay tabla de rendimiento, y con un solo campo "no hay tabla
--    para esta categoría" y "esta especie no usa tablas" serían el mismo NULL.
--
-- 2. EL VACUNO ES LA ÚNICA ESPECIE CUYA TABLA CREA STOCK.
--    Para pollo no existe ninguna tabla publicada en la base correcta, y la
--    única con apertura por presa que se encontró SUMA 102,46 %. Para cerdo,
--    las dos fuentes que hay discrepan 1,89× justo en jamón y paleta, que
--    entre los dos son el 47,4 % de la canal. Una tabla cuya mitad más pesada
--    puede estar al doble no es una hipótesis: es ruido con formato de dato.
--    Por eso `modo_carga`: 'tabla' explota el lote en piezas; 'desposte_pesado'
--    abre el lote vacío y las piezas nacen cuando alguien las pesa.
--
-- 3. EL VENCIMIENTO ENTRA AL NÚCLEO POR EL POLLO.
--    Vida comercial de 4 a 6 días contra hasta 3 semanas del vacuno, y el CAA
--    (art. 256) exige de -2 a 2 °C. Con tres semanas, un mes sin alertas no
--    rompe nada; con cuatro días, un cajón entero se pierde.
--
-- 4. EL CATÁLOGO ES DEL CARNICERO.
--    `alias_display` es cómo lo llama ÉL; `codigo` y `nombre_display` no se
--    tocan nunca, porque los referencian la tabla de rendimiento, el árbol
--    padre/hijo y cada movimiento histórico.
--
-- ESTA MIGRACIÓN NO DEBE CAMBIAR EL COMPORTAMIENTO DEL VACUNO EN NADA.
-- Todo lo que existe hoy queda con especie='vacuno' y modo_carga='tabla'.

-- ============================================================
-- 1. productos: especie, alias del carnicero, vida útil
-- ============================================================

alter table productos
  add column if not exists especie text,
  add column if not exists alias_display text,
  add column if not exists es_propio boolean not null default false,
  add column if not exists vida_util_dias integer;

comment on column productos.especie is
  'vacuno | porcino | aviar. NULL a propósito para lo que no es de ninguna '
  'especie (bebidas, carbón) o es mezcla (una hamburguesa mixta). No forzar.';

comment on column productos.alias_display is
  'Cómo lo llama ESTA carnicería ("aguja" por "roast beef"). Solo afecta lo '
  'que se muestra. `codigo` y `nombre_display` no cambian nunca: los usan la '
  'tabla de rendimiento, el árbol padre/hijo y los movimientos históricos.';

comment on column productos.es_propio is
  'true = lo dio de alta el carnicero, no vino en el catálogo base. Se puede '
  'borrar si nunca tuvo movimientos; los de fábrica solo se desactivan.';

comment on column productos.vida_util_dias is
  'Días de vida útil desde que entra. Pollo: 4-6 (CAA art. 256, -2 a 2 °C). '
  'NULL = usa el valor por defecto de la especie en src/lib/especies.ts.';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'productos_especie_check') then
    alter table productos drop constraint productos_especie_check;
  end if;
end $$;

alter table productos
  add constraint productos_especie_check
  check (especie is null or especie in ('vacuno', 'porcino', 'aviar'));

-- Backfill por familia, que es el único dato que hay y es honesto:
-- lo que no se puede deducir queda en NULL, no se adivina.
update productos set especie = 'vacuno'  where especie is null and familia like 'vacuno%';
update productos set especie = 'porcino' where especie is null and familia = 'cerdo';
update productos set especie = 'aviar'   where especie is null and familia = 'pollo';

create index if not exists productos_especie_idx
  on productos (carniceria_id, especie) where especie is not null;

-- ============================================================
-- 2. tablas_rendimiento: especie, y categoría opcional
-- ============================================================

alter table tablas_rendimiento
  add column if not exists especie text,
  add column if not exists uso text;

update tablas_rendimiento set especie = 'vacuno' where especie is null;
update tablas_rendimiento set uso = 'explota_lote' where uso is null;

alter table tablas_rendimiento alter column especie set not null;
alter table tablas_rendimiento alter column especie set default 'vacuno';
alter table tablas_rendimiento alter column uso set not null;
alter table tablas_rendimiento alter column uso set default 'explota_lote';

comment on column tablas_rendimiento.uso is
  'explota_lote = al cargar el lote se crean las piezas por porcentaje (vacuno). '
  'precarga_trozado = los porcentajes solo PRECARGAN el formulario de trozado y '
  'no crean stock (pollo). Si la tabla creara stock, un trozado mal estimado '
  'metería presas fantasma en la vitrina; precargando, el peor caso es que el '
  'carnicero corrija un número.';

-- La categoría pasa a ser opcional: en pollo no hay, y en cerdo la
-- investigación no encontró categorías comerciales equivalentes a
-- novillo/vaquillona/vaca (solo aparece "capón" como término de oficio).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tablas_rendimiento_categoria_check') then
    alter table tablas_rendimiento drop constraint tablas_rendimiento_categoria_check;
  end if;
  if exists (select 1 from pg_constraint
              where conname = 'tablas_rendimiento_carniceria_id_categoria_proveedor_version_key') then
    alter table tablas_rendimiento
      drop constraint tablas_rendimiento_carniceria_id_categoria_proveedor_version_key;
  end if;
end $$;

alter table tablas_rendimiento alter column categoria drop not null;

alter table tablas_rendimiento
  add constraint tablas_rendimiento_especie_check
  check (especie in ('vacuno', 'porcino', 'aviar'));

alter table tablas_rendimiento
  add constraint tablas_rendimiento_uso_check
  check (uso in ('explota_lote', 'precarga_trozado'));

alter table tablas_rendimiento
  add constraint tablas_rendimiento_categoria_por_especie_check check (
       (especie = 'vacuno'  and categoria in ('novillo','novillito','vaquillona','vaca','ternera'))
    or (especie = 'porcino' and (categoria is null or categoria in ('capon')))
    or (especie = 'aviar'   and categoria is null)
  );

-- Reemplaza al UNIQUE viejo: con `categoria` y `proveedor` nullables, un
-- UNIQUE normal no sirve (en Postgres dos NULL no chocan entre sí, así que
-- se podrían crear dos tablas de pollo v1 idénticas sin que nadie avise).
create unique index if not exists tablas_rendimiento_unica_idx
  on tablas_rendimiento (
    carniceria_id, especie, coalesce(categoria, ''), coalesce(proveedor, ''), version
  );

-- ============================================================
-- 3. recepciones_lote: especie, modo de carga y unidades
-- ============================================================

alter table recepciones_lote
  add column if not exists especie text,
  add column if not exists modo_carga text,
  add column if not exists unidades integer;

update recepciones_lote set especie = 'vacuno' where especie is null;
update recepciones_lote set modo_carga = 'tabla' where modo_carga is null;

alter table recepciones_lote alter column especie set not null;
alter table recepciones_lote alter column especie set default 'vacuno';
alter table recepciones_lote alter column modo_carga set not null;
alter table recepciones_lote alter column modo_carga set default 'tabla';

comment on column recepciones_lote.unidades is
  'Cuántas unidades trajo el lote. En pollo son las CABEZAS del cajón: el peso '
  'es dato fijo (20 kg) y las cabezas son la incógnita, justo al revés que en '
  'una media res. NULL donde no aplica.';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'recepciones_lote_categoria_check') then
    alter table recepciones_lote drop constraint recepciones_lote_categoria_check;
  end if;
end $$;

alter table recepciones_lote alter column categoria drop not null;

alter table recepciones_lote
  add constraint recepciones_lote_especie_check
  check (especie in ('vacuno', 'porcino', 'aviar'));

alter table recepciones_lote
  add constraint recepciones_lote_modo_carga_check
  check (modo_carga in ('tabla', 'desposte_pesado'));

alter table recepciones_lote
  add constraint recepciones_lote_categoria_por_especie_check check (
       (especie = 'vacuno'  and categoria in ('novillo','novillito','vaquillona','vaca','ternera'))
    or (especie = 'porcino' and (categoria is null or categoria in ('capon')))
    or (especie = 'aviar'   and categoria is null)
  );

-- Un lote de pollo o de cerdo no tiene tabla, y eso no es un dato faltante:
-- es la naturaleza del lote.
alter table recepciones_lote alter column tabla_rendimiento_id drop not null;

-- Un lote en modo tabla SIN tabla sí sería un error: no habría con qué explotar.
alter table recepciones_lote
  add constraint recepciones_lote_tabla_si_modo_tabla_check
  check (modo_carga <> 'tabla' or tabla_rendimiento_id is not null);

create index if not exists recepciones_lote_especie_idx
  on recepciones_lote (carniceria_id, especie, fecha desc);

-- ============================================================
-- 4. piezas_stock: vencimiento
-- ============================================================

alter table piezas_stock
  add column if not exists vence_at timestamptz;

comment on column piezas_stock.vence_at is
  'Cuándo se pasa esta pieza. Se calcula al crearla con la vida útil del '
  'producto o de su especie. NULL = sin vencimiento conocido (todo el vacuno '
  'de antes de esta migración).';

-- Para la alerta y para FEFO: qué se vence primero, entre lo que sigue vivo.
create index if not exists piezas_stock_vencimiento_idx
  on piezas_stock (carniceria_id, vence_at)
  where estado = 'disponible' and vence_at is not null;

-- ============================================================
-- 5. movimientos_stock: el trozado
-- ============================================================
--
-- TROZAR PARA UN PEDIDO NO ES TROZAR PARA LA VITRINA, y confundirlos duplica
-- el stock:
--   - Trozo un pollo para el pedido de alguien -> se consume 1 pieza de
--     pollo entero y NO nace ninguna presa: se van con el cliente. Eso es un
--     movimiento 'venta' de toda la vida, con la preparación anotada en el item.
--   - Trozo 3 pollos para llenar la vitrina -> se cierran 3 piezas de pollo
--     entero y NACEN piezas de presas. Eso es 'trozado'.
-- Si el trozado para un pedido generara presas, esas presas quedarían en stock
-- ADEMÁS de haberse vendido. Es la misma familia de error que "un peso real
-- reemplaza al estimado, nunca se suma".

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'movimientos_stock_tipo_check') then
    alter table movimientos_stock drop constraint movimientos_stock_tipo_check;
  end if;
end $$;

alter table movimientos_stock
  add constraint movimientos_stock_tipo_check check (tipo in (
    'entrada',
    'venta',
    'hueso',
    'grasa',
    'recorte_picada',
    'merma_frio',
    'degradado',
    'descuadre',
    'ajuste',
    'trozado'          -- una pieza se convierte en otras (pollo entero -> presas)
  ));

-- ============================================================
-- 6. `pedidos.items` — la preparación
-- ============================================================
--
-- No hay DDL que correr: `items` es jsonb. Se documenta acá la clave nueva,
-- igual que se documentó la forma del item en 0008.
--
--   preparacion?: text   -- "entero" | "trozado" | texto libre
--
-- POR QUÉ NO ES UN PRODUCTO DISTINTO: "un pollo entero" y "un pollo trozado"
-- consumen exactamente la misma pieza de stock (un pollo_entero). Lo que cambia
-- es CÓMO hay que entregarlo. Y sirve para mucho más que el pollo: "la nalga
-- cortada en milanesas", "el asado fino", "la pechuga sin piel".

comment on column pedidos.items is
  'Items del pedido. Forma en 0008; 0025 agrega la clave opcional '
  '`preparacion` ("entero" | "trozado" | texto libre): cómo hay que entregarlo. '
  'No cambia qué pieza de stock se consume.';
