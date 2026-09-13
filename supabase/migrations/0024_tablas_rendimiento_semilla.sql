-- ============================================================
-- 0024 — Tablas de rendimiento semilla: novillo y vaca
-- ============================================================
--
-- DE DÓNDE SALEN ESTOS NÚMEROS
--
-- La FORMA (qué proporción tiene cada corte respecto de los otros) sale del
-- "Manual de Cortes Bovinos para Abasto" del INAC de Uruguay (2008), que es la
-- única tabla institucional de rendimiento por corte de la región y está
-- referida a una media res de 100 kg — o sea, los kilos SON porcentajes.
--
-- La ESCALA (cuánto suma el vendible) la decidió el fundador en 70 % para
-- novillo. Ninguna fuente la resuelve: hay 68 %, 75 % y 65-72 % según a quién se
-- le pregunte. La decisión es asimétrica a propósito: pasarse para arriba hace
-- que el bot prometa carne que no hay (un cliente perjudicado), pasarse para
-- abajo es una sorpresa agradable.
--
-- CÓMO SE LLEGÓ A TENER TODOS LOS CORTES SIN CONTAR KILOS DOS VECES
--
-- No se suman tablas: se SUBDIVIDEN filas. Sumarle al INAC los cortes argentinos
-- que le faltan daría 79 % de vendible, más que cualquier fuente, porque las
-- definiciones se solapan. En cambio cada fila del INAC se parte en los cortes
-- argentinos que contiene, sumando exacto al padre:
--
--   Asado 9,85          -> asado 7,35 + tapa de asado 2,50
--   Vacío c/hueso 6,20  -> vacío + matambre + entraña (proporcional)
--   Nalga 6,10          -> nalga sin tapa + tapa de nalga (proporcional)
--   Cuadril 3,90        -> cuadril + colita de cuadril (proporcional)
--   Pulpa de paleta 3,30-> paleta + palomita (proporcional)
--
-- Se agregan dos filas que el INAC no tiene: BOLA DE LOMO (de los catálogos
-- argentinos; es el único corte que los carniceros venden todos los días y que
-- el INAC no lista) y RECORTES PARA PICADA (que es una salida real del
-- desposte, no un misterio).
--
-- QUÉ ES DATO Y QUÉ ES INFERENCIA
--
-- El total de cada grupo es dato del INAC. **El reparto adentro del grupo es
-- inferencia**, hecha con las proporciones de los catálogos argentinos. Por eso
-- `origen = 'referencia'` en todas las filas: ninguna de éstas es todavía un
-- número de esta carnicería. Se vuelven 'calibrado' cuando haya despostes reales.
--
-- LAS BANDAS P10-P90 TAMPOCO SON DATO
--
-- Son una construcción operativa: ±15 % en piezas anatómicamente estables (las
-- chicas), ±20 % en las medianas, ±25 % en las grandes y compuestas. Se
-- reemplazan por percentiles observados apenas haya 10 despostes.

do $$
declare
  v_carniceria record;
  v_tabla_id uuid;
  v_producto_id uuid;
  v_corte record;
  v_escala numeric;
  v_suma numeric;
  v_dif numeric;
  v_cierre numeric;

  -- La forma, tal como quedó al escalar el INAC a 70 %. Cambiar la escala de
  -- una categoría NO obliga a tocar esta lista: el bloque de abajo la reescala.
  c_cortes constant text[][] := array[
    ['asado',             '6.86'],  -- subdividido de Asado (INAC 9,85)
    ['picada_comun',      '4.66'],  -- recortes del desposte
    ['cogote',            '4.38'],  -- INAC
    ['nalga',             '4.16'],  -- subdividido de Nalga (INAC 6,10)
    ['vacio',             '3.61'],  -- subdividido de Vacío c/hueso (INAC 6,20)
    ['bife_ancho',        '3.35'],  -- INAC (costilla redonda sin hueso)
    ['cuadrada',          '3.35'],  -- INAC
    ['bola_de_lomo',      '3.26'],  -- catálogos argentinos; ausente del INAC
    ['aguja',             '3.17'],  -- INAC
    ['pecho',             '3.17'],  -- INAC
    ['bife_angosto',      '3.07'],  -- INAC
    ['brazuelo',          '2.61'],  -- INAC
    ['cuadril',           '2.52'],  -- subdividido de Cuadril (INAC 3,90)
    ['tapa_de_asado',     '2.33'],  -- subdividido de Asado
    ['falda',             '2.33'],  -- INAC (el "hueso" de la falda es CARTÍLAGO,
                                    -- por eso va entera a vendible: ARCA la
                                    -- clasifica como corte sin hueso)
    ['paleta',            '2.14'],  -- subdividido de Pulpa de paleta (INAC 3,30)
    ['lomo',              '1.58'],  -- INAC
    ['peceto',            '1.58'],  -- INAC
    ['matambre',          '1.56'],  -- subdividido de Vacío c/hueso
    ['tapa_de_nalga',     '1.52'],  -- subdividido de Nalga
    ['tortuguita',        '1.49'],  -- INAC
    ['osobuco',           '1.40'],  -- INAC (garrón)
    ['marucha',           '1.30'],  -- INAC
    ['tapa_de_cuadril',   '1.21'],  -- INAC (picaña)
    ['colita_de_cuadril', '1.11'],  -- subdividido de Cuadril
    ['palomita',          '0.93'],  -- subdividido de Pulpa de paleta
    ['chingolo',          '0.75'],  -- INAC (lomillo)
    ['entrana',           '0.60']   -- subdividido de Vacío c/hueso
  ];

  -- categoria, vendible, hueso, grasa, merma
  c_categorias constant text[][] := array[
    ['novillo', '70.00', '18.00', '8.00', '4.00'],
    -- VACA: HIPÓTESIS DECLARADA, no dato.
    -- No existe ninguna fuente pública con rendimiento por corte de vaca. La
    -- vaca no es un novillo más chico: tiene más grasa de cobertura y menos
    -- pulpa. Se arranca con la misma forma, menos vendible y más grasa. Que sea
    -- hipótesis no es problema mientras el sistema lo diga: las piezas nacen
    -- 'estimado', con 15 % de reserva, y el carnicero aprueba cada pedido. Las
    -- primeras 10 vacas la corrigen.
    ['vaca',    '67.00', '18.00', '11.00', '4.00']
  ];
begin
  for v_carniceria in select id from carnicerias loop
    for i in 1 .. array_length(c_categorias, 1) loop

      -- Si ya existe una tabla vigente para esta categoría, no se pisa: podría
      -- estar calibrada con despostes reales, que valen mucho más que esta semilla.
      if exists (
        select 1 from tablas_rendimiento
         where carniceria_id = v_carniceria.id
           and categoria = c_categorias[i][1]
           and proveedor is null
           and vigente_hasta is null
      ) then
        continue;
      end if;

      insert into tablas_rendimiento (
        carniceria_id, categoria, proveedor, version, vigente_desde,
        pct_hueso, pct_grasa, pct_merma, notas
      ) values (
        v_carniceria.id,
        c_categorias[i][1],
        null,
        1,
        current_date,
        c_categorias[i][3]::numeric,
        c_categorias[i][4]::numeric,
        c_categorias[i][5]::numeric,
        'Semilla. Forma del INAC (2008) escalada a ' || c_categorias[i][2] ||
        ' % de vendible. Los repartos dentro de cada grupo son inferencia, no dato. ' ||
        'Recalibrar con los primeros 10-20 despostes reales.'
      )
      returning id into v_tabla_id;

      -- La escala: lleva la forma al vendible de esta categoría.
      v_escala := c_categorias[i][2]::numeric / 70.00;

      for j in 1 .. array_length(c_cortes, 1) loop
        select id into v_producto_id
          from productos
         where carniceria_id = v_carniceria.id
           and codigo = c_cortes[j][1]
         limit 1;

        -- Si la carnicería no tiene ese corte en su catálogo, se saltea. No se
        -- crea el producto acá: el catálogo es del carnicero, no de esta tabla.
        if v_producto_id is null then
          continue;
        end if;

        insert into rendimiento_cortes (tabla_id, producto_id, pct_central, pct_p10, pct_p90, origen, muestras)
        values (
          v_tabla_id,
          v_producto_id,
          round(c_cortes[j][2]::numeric * v_escala, 2),
          -- Bandas por estabilidad anatómica: las piezas chicas varían menos.
          round(c_cortes[j][2]::numeric * v_escala *
                (case when c_cortes[j][2]::numeric < 2.0 then 0.85
                      when c_cortes[j][2]::numeric < 5.0 then 0.80
                      else 0.75 end), 2),
          round(c_cortes[j][2]::numeric * v_escala *
                (case when c_cortes[j][2]::numeric < 2.0 then 1.15
                      when c_cortes[j][2]::numeric < 5.0 then 1.20
                      else 1.25 end), 2),
          'referencia',
          0
        )
        on conflict (tabla_id, producto_id) do nothing;
      end loop;

      -- ------------------------------------------------------------
      -- Cierre exacto
      -- ------------------------------------------------------------
      -- Redondear 28 filas a dos decimales deja una diferencia de centésimas.
      -- Se la come el corte más grande, que es el que menos se nota en
      -- proporción. Sin esto la tabla no suma 100 y el control la rechaza.
      select coalesce(sum(pct_central), 0) into v_suma
        from rendimiento_cortes where tabla_id = v_tabla_id;

      v_dif := c_categorias[i][2]::numeric - v_suma;

      if v_dif <> 0 then
        update rendimiento_cortes
           set pct_central = pct_central + v_dif
         where id = (
           select id from rendimiento_cortes
            where tabla_id = v_tabla_id
            order by pct_central desc
            limit 1
         );
      end if;

      -- ------------------------------------------------------------
      -- El control: si no cierra en 100, la migración falla
      -- ------------------------------------------------------------
      -- Mejor romper acá que cargar una tabla rota. Una de las propuestas que se
      -- revisaron tenía 67,9 % en 13 filas y afirmaba que el vendible era
      -- 65-72 %: nadie lo vio hasta que se sumó.
      v_cierre := verificar_cierre_tabla_rendimiento(v_tabla_id);

      if abs(v_cierre - 100.00) > 0.01 then
        raise exception
          'La tabla de rendimiento de % no cierra: suma % en vez de 100.',
          c_categorias[i][1], v_cierre;
      end if;

    end loop;
  end loop;
end $$;
