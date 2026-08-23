-- Ajuste del fundador, 23/08/2026: "tira de asado" (el corte cortado en
-- tiras finitas, típico de la parrilla argentina) es el mismo corte que
-- "costilla" — no es el producto específico "asado" (que queda para el
-- asado entero/con hueso, sin cortar en tiras: "asado con hueso", "asado
-- del medio", "asado de tabla"). También se agregan sinónimos coloquiales
-- para "costilla" cortada fina: "banderita", "asado banderita", "costilla
-- banderita".
--
-- Cambio de DATOS, no de código (mismo mecanismo que 0004/0005/0011):
--   1) Saca "tira", "asado de tira" y "tira de asado" de los sinónimos
--      del producto específico "asado" y los pasa a "costilla".
--   2) Agrega "banderita", "asado banderita" y "costilla banderita" como
--      sinónimos nuevos de "costilla".
--   3) Actualiza el texto de la pregunta ambigua de "asado" (creada en
--      0011) para sacarle la aclaración "(tira)" al lado de Asado, ya que
--      ahora "tira" ya no es parte de ese corte sino de costilla.
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

  select id into v_asado_id from productos where carniceria_id = v_carniceria_id and codigo = 'asado';
  select id into v_costilla_id from productos where carniceria_id = v_carniceria_id and codigo = 'costilla';

  if v_asado_id is null or v_costilla_id is null then
    raise notice 'Falta "asado" o "costilla" en productos — corré antes 0004_separar_costilla_de_asado.sql.';
    return;
  end if;

  -- 1) "tira" / "asado de tira" / "tira de asado" pasan de asado a costilla.
  delete from producto_sinonimos
  where producto_id = v_asado_id and texto in ('tira', 'asado de tira', 'tira de asado');

  insert into producto_sinonimos (producto_id, texto)
  select v_costilla_id, s
  from unnest(array['tira', 'asado de tira', 'tira de asado']) as s
  on conflict (producto_id, texto) do nothing;

  -- 2) sinónimos coloquiales nuevos de costilla (corte fino).
  insert into producto_sinonimos (producto_id, texto)
  select v_costilla_id, s
  from unnest(array['banderita', 'asado banderita', 'costilla banderita']) as s
  on conflict (producto_id, texto) do nothing;

  -- 3) actualiza la pregunta ambigua de "asado" para no mencionar "tira".
  update terminos_ambiguos
  set pregunta = '¿Qué corte para el asado querés? Tenemos: Vacío, Costilla, Asado, Matambre, Entraña, Tapa de asado, Falda y Pecho. Contame cuál o cuáles.'
  where carniceria_id = v_carniceria_id and texto = 'asado';
end $$;
