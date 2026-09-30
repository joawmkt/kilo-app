-- ============================================================
-- 0031 — ASADO = COSTILLA, y el nombre a secas es el vacuno
-- ============================================================
--
-- Decisión del fundador (01/10/2026), textual: "ASADO proviene de ASAR, que
-- son cortes para la parrilla. EL ASADO NO ES UN CORTE DE CARNE ESPECÍFICO. Y
-- en todo caso si se lo asocia a un corte debe ser COSTILLA. ASADO = COSTILLA".
--
-- Hasta hoy había DOS productos: "Asado" (el que nace de la tabla de
-- rendimiento al cargar una media res, 6,86 % del novillo) y "Costilla" (el
-- que se cargaba a mano). Para el mostrador son lo mismo. Esta migración los
-- une en COSTILLA, sin perder nada:
--   1. las piezas de stock de "asado" pasan a "costilla" (el stock se suma);
--   2. en las tablas de rendimiento, el % de "asado" pasa a "costilla", así
--      cada media res nueva ya carga costilla;
--   3. sustitutos, árbol de cortes y recomendaciones que apuntaban a
--      "asado" pasan a "costilla";
--   4. las palabras "asado", "asado con hueso", "asado del medio"... pasan
--      a ser sinónimos de costilla (quien pide "2 kg de asado" pide costilla,
--      y el bot le contesta "asado", con su palabra);
--   5. "asado" queda APAGADO (no se borra: los pedidos viejos lo nombran).
--
-- Y la regla del mismo día para los términos ambiguos: un corte nombrado a
-- secas es el VACUNO ("nalga" es nalga, "peceto" es peceto) y "chorizo" es el
-- chorizo común. El cerdo se nombra. Se apagan las preguntas "¿vacuna o de
-- cerdo?" y "¿qué chorizo?", que eran preguntas de más: el fundador marcó
-- "¿Nalga vacuna o de cerdo?" como una pregunta tonta (30/09).
--
-- Vale para todas las carnicerías que tengan los dos productos.

do $$
declare
  r record;
begin
  for r in
    select a.id as asado_id, c.id as costilla_id, a.carniceria_id
    from productos a
    join productos c on c.carniceria_id = a.carniceria_id and c.codigo = 'costilla'
    where a.codigo = 'asado'
  loop
    -- 1. Stock
    update piezas_stock set producto_id = r.costilla_id where producto_id = r.asado_id;

    -- 2. Tablas de rendimiento: se suma el % si la tabla ya tenía costilla.
    update rendimiento_cortes rc
       set pct_central = rc.pct_central + a.pct_central
      from rendimiento_cortes a
     where rc.producto_id = r.costilla_id
       and a.producto_id = r.asado_id
       and a.tabla_id = rc.tabla_id;
    delete from rendimiento_cortes a
     where a.producto_id = r.asado_id
       and exists (select 1 from rendimiento_cortes c where c.tabla_id = a.tabla_id and c.producto_id = r.costilla_id);
    update rendimiento_cortes set producto_id = r.costilla_id where producto_id = r.asado_id;

    -- 3. Lo que apuntaba a asado
    delete from sustitutos_autorizados s
     where s.producto_id = r.asado_id
       and exists (select 1 from sustitutos_autorizados x
                    where x.carniceria_id = s.carniceria_id and x.producto_id = r.costilla_id and x.sustituto_id = s.sustituto_id);
    update sustitutos_autorizados set producto_id = r.costilla_id where producto_id = r.asado_id;
    delete from sustitutos_autorizados s
     where s.sustituto_id = r.asado_id
       and exists (select 1 from sustitutos_autorizados x
                    where x.carniceria_id = s.carniceria_id and x.producto_id = s.producto_id and x.sustituto_id = r.costilla_id);
    update sustitutos_autorizados set sustituto_id = r.costilla_id where sustituto_id = r.asado_id;
    delete from sustitutos_autorizados where producto_id = sustituto_id;
    update productos set producto_padre_id = r.costilla_id where producto_padre_id = r.asado_id;
    delete from recomendaciones_ocasion o
     where o.producto_id = r.asado_id
       and exists (select 1 from recomendaciones_ocasion x where x.carniceria_id = o.carniceria_id and x.ocasion = o.ocasion and x.producto_id = r.costilla_id);
    update recomendaciones_ocasion set producto_id = r.costilla_id where producto_id = r.asado_id;

    -- 4. Sinónimos
    insert into producto_sinonimos (producto_id, texto)
    select r.costilla_id, s.texto from producto_sinonimos s
     where s.producto_id = r.asado_id
    on conflict (producto_id, texto) do nothing;
    insert into producto_sinonimos (producto_id, texto) values (r.costilla_id, 'asado')
    on conflict (producto_id, texto) do nothing;
    delete from producto_sinonimos where producto_id = r.asado_id;

    -- 5. Asado apagado
    update productos set activo = false where id = r.asado_id;

    -- Términos ambiguos: "asado" ya no se pregunta, y ninguno ofrece "asado".
    update terminos_ambiguos set activo = false where carniceria_id = r.carniceria_id and texto = 'asado';
    update terminos_ambiguos set opciones_codigos = array_remove(opciones_codigos, 'asado') where carniceria_id = r.carniceria_id;

    perform recalcular_stock_de_producto(r.costilla_id);
    perform recalcular_stock_de_producto(r.asado_id);
  end loop;

  -- El nombre a secas es el vacuno; "chorizo" es el común.
  update terminos_ambiguos
     set activo = false
   where texto in ('nalga', 'cuadrada', 'cuadril', 'bola de lomo', 'peceto', 'chorizo', 'chori');
end $$;
