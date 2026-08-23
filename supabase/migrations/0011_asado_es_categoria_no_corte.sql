-- "Asado" dicho SOLO (sin ningún corte específico) no es un corte en sí
-- mismo, es la CATEGORÍA de cortes que se pueden hacer a la parrilla
-- (pedido del fundador, 23/08/2026): "COSTILLA = CORTE. ASADO = CATEGORIA
-- DE CORTES QUE PUEDEN ASARSE/HACERSE A LA PARRILLA."
--
-- Hasta ahora la palabra suelta "asado" era un sinónimo directo del
-- producto específico con codigo='asado' (una tira puntual), así que un
-- cliente que solo decía "quiero asado" caía directo en ese corte en vez
-- de que le preguntemos cuál de todos los cortes para parrilla quiere.
--
-- Esta migración NO toca código, es un cambio de DATOS (así funciona el
-- catálogo: interpretarPedido.ts arma su prompt para la IA a partir de lo
-- que hay en producto_sinonimos y terminos_ambiguos, ver catalogo.ts):
--   1) Sacamos la palabra suelta "asado" de los sinónimos del producto
--      específico "asado" (dejamos las frases más específicas como "tira
--      de asado", "asado de tira", "asado con hueso", etc., que sí
--      identifican inequívocamente ese corte puntual).
--   2) Agregamos "asado" a terminos_ambiguos: cuando el cliente lo
--      menciona solo, la IA tiene que preguntar y listar TODOS los
--      nombres de cortes de la familia vacuno_parrilla (sin kilos ni
--      cantidades), para que el cliente elija.
do $$
declare
  v_carniceria_id uuid;
  v_asado_id uuid;
begin
  select id into v_carniceria_id
  from carnicerias
  where telefono_whatsapp = 'whatsapp:+14155238886';

  if v_carniceria_id is null then
    raise notice 'No se encontró la carnicería piloto (whatsapp:+14155238886) — no se aplican cambios.';
    return;
  end if;

  select id into v_asado_id from productos where carniceria_id = v_carniceria_id and codigo = 'asado';

  if v_asado_id is null then
    raise notice 'No se encontró el producto "asado" — no se aplican cambios.';
    return;
  end if;

  -- 1) La palabra suelta "asado" deja de apuntar directo al corte específico.
  delete from producto_sinonimos
  where producto_id = v_asado_id and texto = 'asado';

  -- 2) "asado" ahora es un término ambiguo: hay que preguntar cuál corte
  --    de la familia vacuno_parrilla quiere (nombres, sin cantidades).
  insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos)
    values (
      v_carniceria_id,
      'asado',
      '¿Qué corte para el asado querés? Tenemos: Vacío, Costilla, Asado (tira), Matambre, Entraña, Tapa de asado, Falda y Pecho. Contame cuál o cuáles.',
      array['vacio', 'costilla', 'asado', 'matambre', 'entrana', 'tapa_de_asado', 'falda', 'pecho']
    )
    on conflict (carniceria_id, texto) do update set
      pregunta = excluded.pregunta, opciones_codigos = excluded.opciones_codigos;
end $$;
