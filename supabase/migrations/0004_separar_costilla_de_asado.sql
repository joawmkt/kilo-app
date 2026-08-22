-- Separa "costilla" de "asado" como productos distintos (pedido del
-- fundador, 22/08/2026, después de la primera prueba real por WhatsApp):
-- "asado" es un término genérico que engloba varios cortes distintos;
-- "costilla" es un corte propio, no un sinónimo de "asado".
--
-- Hasta ahora "costilla"/"costillas" estaban cargados como sinónimos
-- pelados de "asado" (así estaban en el catálogo funcional original
-- v0.3, y así quedó documentado incluso en el comentario de la tabla
-- producto_sinonimos en 0002_catalogo_etapa2.sql — no es un bug de
-- carga, era la interpretación original del catálogo fuente).
do $$
declare
  v_carniceria_id uuid;
  v_asado_id uuid;
  v_costilla_id uuid;
begin
  select id into v_carniceria_id
  from carnicerias
  where telefono_whatsapp = 'whatsapp:+14155238886';

  if v_carniceria_id is null then
    raise notice 'No se encontró la carnicería piloto (whatsapp:+14155238886) — no se aplican cambios.';
    return;
  end if;

  select id into v_asado_id
  from productos
  where carniceria_id = v_carniceria_id and codigo = 'asado';

  if v_asado_id is null then
    raise notice 'No se encontró el producto "asado" para esta carnicería — no se aplican cambios.';
    return;
  end if;

  -- saca "costilla"/"costillas" de los sinónimos de "asado"
  delete from producto_sinonimos
  where producto_id = v_asado_id
    and texto in ('costilla', 'costillas');

  -- crea el producto "costilla" (idempotente: si ya existe, no lo duplica)
  insert into productos (carniceria_id, codigo, nombre_display, familia, unidad, activo, notas)
  values (
    v_carniceria_id,
    'costilla',
    'Costilla',
    'vacuno_parrilla',
    'kg',
    true,
    'Corte propio, distinto de "asado" (que es un término genérico que engloba varios cortes). Separado de asado el 22/08/2026 a pedido del fundador.'
  )
  on conflict (carniceria_id, codigo) do nothing;

  select id into v_costilla_id
  from productos
  where carniceria_id = v_carniceria_id and codigo = 'costilla';

  insert into producto_sinonimos (producto_id, texto)
  select v_costilla_id, s
  from unnest(array['costilla', 'costillas']) as s
  on conflict (producto_id, texto) do nothing;
end $$;
