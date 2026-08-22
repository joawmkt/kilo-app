-- "Asado de costilla" es una forma de nombrar el corte costilla, no un
-- sinónimo genérico de "asado" (confirmado con el fundador, 22/08/2026,
-- al cerrar la Etapa 2).
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

  delete from producto_sinonimos
  where producto_id = v_asado_id and texto = 'asado de costilla';

  insert into producto_sinonimos (producto_id, texto)
  values (v_costilla_id, 'asado de costilla')
  on conflict (producto_id, texto) do nothing;
end $$;
