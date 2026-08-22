-- Carnicom — seed de catálogo real (Etapa 2)
-- Generado a partir de carnicom_catalogo_estructurado_v0.3.md
-- Correr DESPUES de supabase/migrations/0002_catalogo_etapa2.sql
-- Reemplazá el telefono_whatsapp de abajo si tu carnicería piloto usa otro numero de sandbox/whatsapp.

do $$
declare
  v_carniceria_id uuid;
  v_producto_id uuid;
begin
  select id into v_carniceria_id from carnicerias
    where telefono_whatsapp = 'whatsapp:+17372508034';

  if v_carniceria_id is null then
    raise exception 'No se encontro la carniceria piloto (telefono_whatsapp). Revisa supabase/schema.sql o ajusta este seed.';
  end if;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'asado', 'Asado', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'asado'), (v_producto_id, 'tira de asado'), (v_producto_id, 'tira'), (v_producto_id, 'asado de tira'), (v_producto_id, 'costilla'), (v_producto_id, 'costillas'), (v_producto_id, 'asado común'), (v_producto_id, 'asado para parrilla'), (v_producto_id, 'asado parrillero'), (v_producto_id, 'asado con hueso'), (v_producto_id, 'asado del medio'), (v_producto_id, 'asado de costilla')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'vacio', 'Vacío', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'vacío'), (v_producto_id, 'vacio'), (v_producto_id, 'un vacío'), (v_producto_id, 'vacío entero'), (v_producto_id, 'vacío para la parrilla'), (v_producto_id, 'vacío parrillero'), (v_producto_id, 'bife de vacío')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'entrana', 'Entraña', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'entraña'), (v_producto_id, 'entrañita'), (v_producto_id, 'entrañas'), (v_producto_id, 'entraña fina'), (v_producto_id, 'entraña gruesa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'matambre', 'Matambre', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'matambre'), (v_producto_id, 'mata hambre'), (v_producto_id, 'matambre vacuno'), (v_producto_id, 'matambre para parrilla'), (v_producto_id, 'matambre para arrollar')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'tapa_de_asado', 'Tapa de asado', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'tapa de asado'), (v_producto_id, 'tapa asado'), (v_producto_id, 'tapa del asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'falda', 'Falda', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'falda'), (v_producto_id, 'faldita'), (v_producto_id, 'falda parrillera'), (v_producto_id, 'falda con hueso'), (v_producto_id, 'falda para puchero')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pecho', 'Pecho', 'vacuno_parrilla', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pecho'), (v_producto_id, 'pecho vacuno'), (v_producto_id, 'pechito de vaca'), (v_producto_id, 'pecho para puchero')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'nalga', 'Nalga', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'nalga'), (v_producto_id, 'nalga de adentro'), (v_producto_id, 'nalga de afuera'), (v_producto_id, 'nalga para milanesa'), (v_producto_id, 'nalga para milanesas'), (v_producto_id, 'nalga feteada'), (v_producto_id, 'nalga cortada'), (v_producto_id, 'nalga en bifes')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'cuadrada', 'Cuadrada', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'cuadrada'), (v_producto_id, 'cuadrada para milanesa'), (v_producto_id, 'cuadrada para milanesas'), (v_producto_id, 'cuadrada para bifes'), (v_producto_id, 'cuadrada feteada')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'bola_de_lomo', 'Bola de lomo', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'bola de lomo'), (v_producto_id, 'bola'), (v_producto_id, 'bola para milanesa'), (v_producto_id, 'bola de lomo para milanesa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'peceto', 'Peceto', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'peceto'), (v_producto_id, 'peceto entero'), (v_producto_id, 'peceto para horno'), (v_producto_id, 'peceto para vitel toné'), (v_producto_id, 'peceto para milanesa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'cuadril', 'Cuadril', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'cuadril'), (v_producto_id, 'cuadril entero'), (v_producto_id, 'bife de cuadril'), (v_producto_id, 'cuadril para horno'), (v_producto_id, 'cuadril para bifes')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'colita_de_cuadril', 'Colita de cuadril', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'colita de cuadril'), (v_producto_id, 'colita'), (v_producto_id, 'colita de cuadril para horno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'tapa_de_cuadril', 'Tapa de cuadril', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'tapa de cuadril'), (v_producto_id, 'tapa del cuadril'), (v_producto_id, 'picanha'), (v_producto_id, 'picaña')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'tapa_de_nalga', 'Tapa de nalga', 'vacuno_sin_hueso', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'tapa de nalga'), (v_producto_id, 'tapa nalga')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'lomo', 'Lomo', 'vacuno_bifes_plancha', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'lomo'), (v_producto_id, 'lomito'), (v_producto_id, 'lomo entero'), (v_producto_id, 'lomo para bifes'), (v_producto_id, 'medallones de lomo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'bife_ancho', 'Bife ancho', 'vacuno_bifes_plancha', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'bife ancho'), (v_producto_id, 'ojo de bife'), (v_producto_id, 'ojo bife'), (v_producto_id, 'ojo de bife entero'), (v_producto_id, 'ojo'), (v_producto_id, 'bife ancho sin hueso')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'bife_angosto', 'Bife angosto', 'vacuno_bifes_plancha', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'bife angosto'), (v_producto_id, 'bife angosto entero')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'bife_de_chorizo', 'Bife de chorizo', 'vacuno_bifes_plancha', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'bife de chorizo'), (v_producto_id, 'bife chorizo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'roast_beef', 'Roast beef', 'vacuno_bifes_plancha', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'roast beef'), (v_producto_id, 'roastbeef'), (v_producto_id, 'roast'), (v_producto_id, 'rosbif'), (v_producto_id, 'roast beef para olla'), (v_producto_id, 'roast beef para bifes')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'paleta', 'Paleta', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'paleta'), (v_producto_id, 'paleta vacuna')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'carnaza_de_paleta', 'Carnaza de paleta', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'carnaza'), (v_producto_id, 'carnaza de paleta')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'marucha', 'Marucha', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'marucha')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'palomita', 'Palomita', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'palomita'), (v_producto_id, 'chingolo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'tortuguita', 'Tortuguita', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'tortuguita')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'aguja', 'Aguja', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'aguja'), (v_producto_id, 'aguja vacuna')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'azotillo', 'Azotillo', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'azotillo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'osobuco', 'Osobuco', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'osobuco'), (v_producto_id, 'ossobuco'), (v_producto_id, 'garrón')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'brazuelo', 'Brazuelo', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'brazuelo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'cogote', 'Cogote', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'cogote'), (v_producto_id, 'cogote vacuno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'espinazo', 'Espinazo', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'espinazo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'rabo', 'Rabo', 'vacuno_otros', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'rabo'), (v_producto_id, 'cola'), (v_producto_id, 'rabo de vaca')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'picada_comun', 'Picada comun', 'picada', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'carne picada'), (v_producto_id, 'picada'), (v_producto_id, 'carne molida'), (v_producto_id, 'carne para picar'), (v_producto_id, 'carne picada común'), (v_producto_id, 'picada común')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'picada_especial', 'Picada especial', 'picada', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'picada especial'), (v_producto_id, 'especial')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'picada_magra', 'Picada magra', 'picada', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'picada magra'), (v_producto_id, 'picada sin grasa'), (v_producto_id, 'picada con poca grasa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pollo_entero', 'Pollo entero', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pollo'), (v_producto_id, 'pollo entero'), (v_producto_id, 'pollo entero limpio'), (v_producto_id, 'pollo chico'), (v_producto_id, 'pollo grande'), (v_producto_id, 'pollo para horno'), (v_producto_id, 'pollo para asar')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pata', 'Pata', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pata'), (v_producto_id, 'patas'), (v_producto_id, 'pata de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'muslo', 'Muslo', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'muslo'), (v_producto_id, 'muslos'), (v_producto_id, 'muslo de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pata_y_muslo', 'Pata y muslo', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pata y muslo'), (v_producto_id, 'pata-muslo'), (v_producto_id, 'pata muslo'), (v_producto_id, 'patamuslo'), (v_producto_id, 'pata con muslo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'cuarto_trasero', 'Cuarto trasero', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'cuarto trasero'), (v_producto_id, 'cuartos traseros')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'rancho', 'Rancho', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'rancho'), (v_producto_id, 'rancho de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pechuga_desosada', 'Pechuga desosada', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pechuga'), (v_producto_id, 'pechugas'), (v_producto_id, 'pechuga de pollo'), (v_producto_id, 'pechuga sin hueso'), (v_producto_id, 'pechuga sin piel'), (v_producto_id, 'pechuga deshuesada'), (v_producto_id, 'bifes de pechuga'), (v_producto_id, 'bife de pechuga'), (v_producto_id, 'bifecitos de pollo'), (v_producto_id, 'bifes de pollo'), (v_producto_id, 'filetes de pollo'), (v_producto_id, 'filetes de pechuga'), (v_producto_id, 'suprema'), (v_producto_id, 'supremas'), (v_producto_id, 'suprema de pollo'), (v_producto_id, 'suprema fileteada')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'alitas', 'Alitas', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'alitas'), (v_producto_id, 'alas'), (v_producto_id, 'alas de pollo'), (v_producto_id, 'alitas de pollo'), (v_producto_id, 'alitas para horno'), (v_producto_id, 'alitas para parrilla')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'menudos', 'Menudos', 'pollo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'menudo'), (v_producto_id, 'menudos'), (v_producto_id, 'menudencia'), (v_producto_id, 'hígado y corazón'), (v_producto_id, 'menuditos')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'patitas_rebozadas', 'Patitas rebozadas', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'patitas'), (v_producto_id, 'patitas de pollo'), (v_producto_id, 'patitas rebozadas'), (v_producto_id, 'patitas para chicos')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_pollo', 'Milanesa de pollo', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa de pollo'), (v_producto_id, 'milanesas de pollo'), (v_producto_id, 'mila de pollo'), (v_producto_id, 'mila pollo'), (v_producto_id, 'milanesa de suprema'), (v_producto_id, 'suprema rebozada'), (v_producto_id, 'supremas rebozadas'), (v_producto_id, 'pollo rebozado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'hamburguesa_de_pollo', 'Hamburguesa de pollo', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'hamburguesa de pollo'), (v_producto_id, 'hamburguesas de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'medallon_de_pollo', 'Medallón de pollo', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'medallón de pollo'), (v_producto_id, 'medallones de pollo'), (v_producto_id, 'medallón rebozado'), (v_producto_id, 'medallón de pollo rebozado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'nuggets_de_pollo', 'Nuggets de pollo', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'nuggets'), (v_producto_id, 'nuggets de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'brochette_de_pollo', 'Brochette de pollo', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'brochette de pollo'), (v_producto_id, 'brochetas de pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pollo_relleno', 'Pollo relleno', 'pollo_elaborados', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pollo relleno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'bondiola', 'Bondiola', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'bondiola'), (v_producto_id, 'bondiola de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'carre', 'Carré', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'carré'), (v_producto_id, 'carre'), (v_producto_id, 'carré de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'costeleta_de_cerdo', 'Costeleta de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'costeleta de cerdo'), (v_producto_id, 'costeletas de cerdo'), (v_producto_id, 'costeleta'), (v_producto_id, 'costeletas')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pechito_de_cerdo', 'Pechito de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pechito de cerdo'), (v_producto_id, 'costillitas de cerdo'), (v_producto_id, 'costillitas')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'matambre_de_cerdo', 'Matambre de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'matambre de cerdo'), (v_producto_id, 'matambre de chancho')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'vacio_de_cerdo', 'Vacio de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'vacío de cerdo'), (v_producto_id, 'vacio de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'solomillo', 'Solomillo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'solomillo'), (v_producto_id, 'solomillo de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pulpa_de_cerdo', 'Pulpa de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pulpa de cerdo'), (v_producto_id, 'carne de cerdo'), (v_producto_id, 'pulpa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'paleta_de_cerdo', 'Paleta de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'paleta de cerdo'), (v_producto_id, 'paleta de chancho')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pata_de_cerdo', 'Pata de cerdo', 'cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pata de cerdo'), (v_producto_id, 'pata de chancho')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chorizo', 'Chorizo', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chorizo'), (v_producto_id, 'chori'), (v_producto_id, 'choris'), (v_producto_id, 'chorizo común'), (v_producto_id, 'chorizo criollo'), (v_producto_id, 'criollo'), (v_producto_id, 'chorizo parrillero'), (v_producto_id, 'chorizo para asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chorizo_de_cerdo', 'Chorizo de cerdo', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chorizo de cerdo'), (v_producto_id, 'chorizo puro cerdo'), (v_producto_id, 'puro cerdo'), (v_producto_id, 'chori de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chorizo_bombon', 'Chorizo bombón', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chorizo bombón'), (v_producto_id, 'bombón'), (v_producto_id, 'chori bombón'), (v_producto_id, 'bombones')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chorizo_colorado', 'Chorizo colorado', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chorizo colorado'), (v_producto_id, 'colorado'), (v_producto_id, 'chori colorado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chorizo_saborizado', 'Chorizo saborizado', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chorizo saborizado'), (v_producto_id, 'chori saborizado'), (v_producto_id, 'chorizo con queso'), (v_producto_id, 'chorizo con cheddar'), (v_producto_id, 'chorizo con verdeo'), (v_producto_id, 'chorizo con morrón'), (v_producto_id, 'chorizo con panceta'), (v_producto_id, 'chorizo especial')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'morcilla', 'Morcilla', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'morcilla'), (v_producto_id, 'morcillas'), (v_producto_id, 'morci'), (v_producto_id, 'morcilla común')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'morcilla_bombon', 'Morcilla bombón', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'morcilla bombón'), (v_producto_id, 'bombón de morcilla')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'morcilla_vasca', 'Morcilla vasca', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'morcilla vasca')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'morcilla_rosca', 'Morcilla rosca', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'morcilla rosca')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'salchicha_parrillera', 'Salchicha parrillera', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'salchicha parrillera'), (v_producto_id, 'parrillera'), (v_producto_id, 'salchicha de parrilla'), (v_producto_id, 'salchicha para asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'salchicha_viena', 'Salchicha viena', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'salchicha'), (v_producto_id, 'salchichas'), (v_producto_id, 'viena'), (v_producto_id, 'salchicha viena')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'salame', 'Salame', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'salame'), (v_producto_id, 'salamín'), (v_producto_id, 'salamines'), (v_producto_id, 'salame chico'), (v_producto_id, 'salamito')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'longaniza', 'Longaniza', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'longaniza'), (v_producto_id, 'longanizas'), (v_producto_id, 'longaniza calabresa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'panceta', 'Panceta', 'embutidos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'panceta'), (v_producto_id, 'panceta salada'), (v_producto_id, 'panceta ahumada'), (v_producto_id, 'panceta para parrilla')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chinchulines', 'Chinchulines', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chinchulines'), (v_producto_id, 'chinchu'), (v_producto_id, 'chinchulín')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'mollejas', 'Mollejas', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'molleja'), (v_producto_id, 'mollejas')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'rinon', 'Riñón', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'riñón'), (v_producto_id, 'riñones')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'higado', 'Hígado', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'hígado'), (v_producto_id, 'hígado vacuno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'lengua', 'Lengua', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'lengua'), (v_producto_id, 'lengua vacuna')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'corazon', 'Corazón', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'corazón'), (v_producto_id, 'corazón vacuno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'tripa_gorda', 'Tripa gorda', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'tripa gorda'), (v_producto_id, 'tripa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'choto', 'Choto', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'choto')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'mondongo', 'Mondongo', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'mondongo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'sesos', 'Sesos', 'achuras', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'sesos'), (v_producto_id, 'seso')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_carne', 'Milanesa de carne', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa'), (v_producto_id, 'milanesa de carne'), (v_producto_id, 'milanesa vacuna'), (v_producto_id, 'mila'), (v_producto_id, 'milas')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_nalga', 'Milanesa de nalga', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa de nalga'), (v_producto_id, 'mila de nalga')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_cuadrada', 'Milanesa de cuadrada', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa de cuadrada'), (v_producto_id, 'mila de cuadrada')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_bola', 'Milanesa de bola', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa de bola'), (v_producto_id, 'mila de bola')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'hamburguesa_de_carne', 'Hamburguesa de carne', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'hamburguesa'), (v_producto_id, 'hamburguesas'), (v_producto_id, 'hamburguesa de carne'), (v_producto_id, 'hamburguesa vacuna'), (v_producto_id, 'burger'), (v_producto_id, 'hamburguesa casera')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'medallon_de_carne', 'Medallón de carne', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'medallón'), (v_producto_id, 'medallones'), (v_producto_id, 'medallón de carne'), (v_producto_id, 'medallón vacuno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'albondigas', 'Albóndigas', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'albóndigas'), (v_producto_id, 'albóndiga'), (v_producto_id, 'albóndigas de carne')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'brochette_de_carne', 'Brochette de carne', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'brochette'), (v_producto_id, 'brocheta'), (v_producto_id, 'brochette de carne')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'matambre_arrollado', 'Matambre arrollado', 'elaborados_vacunos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'matambre arrollado'), (v_producto_id, 'matambre relleno')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'hamburguesa_de_cerdo', 'Hamburguesa de cerdo', 'elaborados_cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'hamburguesa de cerdo'), (v_producto_id, 'hamburguesas de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'milanesa_de_cerdo', 'Milanesa de cerdo', 'elaborados_cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'milanesa de cerdo'), (v_producto_id, 'mila de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'medallon_de_cerdo', 'Medallón de cerdo', 'elaborados_cerdo', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'medallón de cerdo'), (v_producto_id, 'medallones de cerdo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'brochette_mixta', 'Brochette mixta', 'elaborados_mixtos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'brochette mixta'), (v_producto_id, 'brocheta mixta'), (v_producto_id, 'brochette de carne y pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'hamburguesa_rellena', 'Hamburguesa rellena', 'elaborados_mixtos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'hamburguesa rellena'), (v_producto_id, 'hamburguesa con queso'), (v_producto_id, 'hamburguesa con jamón y queso')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'medallon_relleno', 'Medallón relleno', 'elaborados_mixtos', false, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'medallón relleno'), (v_producto_id, 'medallones rellenos')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'carbon', 'Carbon', 'complementarios', true, 'bolsa', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'carbón'), (v_producto_id, 'bolsa de carbón'), (v_producto_id, 'carbón para asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'sal_parrillera', 'Sal parrillera', 'complementarios', true, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'sal parrillera'), (v_producto_id, 'sal para parrilla'), (v_producto_id, 'sal para asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'sal_gruesa', 'Sal gruesa', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'sal gruesa')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'sal_fina', 'Sal fina', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'sal fina'), (v_producto_id, 'sal común')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pimienta', 'Pimienta', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pimienta'), (v_producto_id, 'pimienta negra'), (v_producto_id, 'pimienta molida')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'oregano', 'Orégano', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'orégano')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'aji_molido', 'Ají molido', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'ají molido'), (v_producto_id, 'aji molido')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'provenzal', 'Provenzal', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'provenzal')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'chimichurri', 'Chimichurri', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'chimichurri'), (v_producto_id, 'chimi')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'especias', 'Especias', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'especias'), (v_producto_id, 'condimentos'), (v_producto_id, 'condimento para carne'), (v_producto_id, 'condimento para pollo')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'queso', 'Queso', 'complementarios', true, 'kg', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'queso')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'provoleta', 'Provoleta', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'provoleta'), (v_producto_id, 'provoleta para parrilla')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pan', 'Pan', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pan'), (v_producto_id, 'pan para el asado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'pan_rallado', 'Pan rallado', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'pan rallado'), (v_producto_id, 'pan rallado para milanesas'), (v_producto_id, 'rallado')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'huevos', 'Huevos', 'complementarios', true, 'docena', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'huevos'), (v_producto_id, 'huevo'), (v_producto_id, 'docena de huevos')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'salsas', 'Salsas', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'salsa'), (v_producto_id, 'salsas')
    on conflict (producto_id, texto) do nothing;

  insert into productos (carniceria_id, codigo, nombre_display, familia, es_complementario, unidad, activo, stock_actual)
    values (v_carniceria_id, 'criolla', 'Criolla', 'complementarios', true, 'unidad', true, 0)
    on conflict (carniceria_id, codigo) do update set
      nombre_display = excluded.nombre_display, familia = excluded.familia,
      es_complementario = excluded.es_complementario, unidad = excluded.unidad
    returning id into v_producto_id;
  insert into producto_sinonimos (producto_id, texto) values (v_producto_id, 'salsa criolla'), (v_producto_id, 'criolla')
    on conflict (producto_id, texto) do nothing;

  -- Terminos ambiguos: expresiones que el bot NO debe resolver solo, tiene que preguntar.
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'tapa', '¿Tapa de asado, tapa de nalga o tapa de cuadril?', array['tapa_de_asado', 'tapa_de_nalga', 'tapa_de_cuadril'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'picada', '¿Picada común, especial o magra?', array['picada_comun', 'picada_especial', 'picada_magra'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'bife', '¿Qué bife: ancho, angosto o de chorizo?', array['bife_ancho', 'bife_angosto', 'bife_de_chorizo'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'mila', '¿Milanesa de carne, de pollo o de cerdo?', array['milanesa_de_carne', 'milanesa_de_pollo', 'milanesa_de_cerdo'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'milanesa', '¿Milanesa de carne, de pollo o de cerdo?', array['milanesa_de_carne', 'milanesa_de_pollo', 'milanesa_de_cerdo'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'medallon', '¿Medallón de carne, de pollo, de cerdo o relleno?', array['medallon_de_carne', 'medallon_de_pollo', 'medallon_de_cerdo', 'medallon_relleno'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'achuras', '¿Qué achuras querés?', array['chinchulines', 'mollejas', 'rinon', 'higado', 'lengua', 'corazon', 'tripa_gorda', 'choto', 'mondongo', 'sesos'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'pollo', '¿Pollo entero, pata y muslo o pechuga?', array['pollo_entero', 'pata_y_muslo', 'pechuga_desosada'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'brochette', '¿Brochette de carne, de pollo o mixta?', array['brochette_de_carne', 'brochette_de_pollo', 'brochette_mixta'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'brocheta', '¿Brochette de carne, de pollo o mixta?', array['brochette_de_carne', 'brochette_de_pollo', 'brochette_mixta'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'chori', '¿Qué chorizo: común, de cerdo, bombón, colorado o saborizado?', array['chorizo', 'chorizo_de_cerdo', 'chorizo_bombon', 'chorizo_colorado', 'chorizo_saborizado'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'chorizo', '¿Qué chorizo: común, de cerdo, bombón, colorado o saborizado?', array['chorizo', 'chorizo_de_cerdo', 'chorizo_bombon', 'chorizo_colorado', 'chorizo_saborizado'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'hamburguesa', '¿Hamburguesa de carne, de pollo o de cerdo?', array['hamburguesa_de_carne', 'hamburguesa_de_pollo', 'hamburguesa_de_cerdo'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (v_carniceria_id, 'pechito', '¿Pechito de vaca (para puchero) o pechito de cerdo (costillitas)?', array['pecho', 'pechito_de_cerdo'])
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
end $$;
