-- ============================================================
-- 0027 — Pollo: el cajón, el vencimiento y el PERFIL TROZADO v1
-- ============================================================
--
-- DE DÓNDE SALEN ESTOS NÚMEROS, Y QUÉ NO SON
--
-- Son UNA medición real: un carnicero trozando un cajón de 6, pesando presa por
-- presa (video, transcripto por el fundador el 20/09/2026). No es un promedio
-- de nada: es n = 1.
--
--   supremas (12)            5,750 kg
--   pata y muslo (6 pares)   8,100 kg
--   alitas (6 pares)         2,975 kg
--   menudos                  1,200 kg
--   piel                     1,165 kg
--   carcasa                  0,570 kg
--   ------------------------------- suma  19,760 kg sobre un cajón de 20 kg
--
-- SE SUMÓ LA COLUMNA ANTES DE CREERLA, que es la regla del proyecto: cierra al
-- 98,80 %, con 1,20 % de merma. Creíble para pollo fresco cortado en el momento.
--
-- Y VALIDA POR CONVERGENCIA, igual que el INAC contra los catálogos en vacuno:
-- las supremas dan 28,75 % del ave, y una descomposición independiente (otra
-- fuente, otro país, otra metodología) daba carne blanca 29,41 % sobre la
-- carcasa. 0,66 puntos de diferencia, justo en el número que manda la economía.
--
-- LAS DEFINICIONES DE CORTE SON LAS DE ESE CARNICERO, Y LA TABLA LO DELATA:
-- la carcasa da 95 g por ave (poquísimo para un esqueleto entero) y las alitas
-- 496 g el par (mucho). La lectura más probable es que sus alitas lleven
-- caballete y su pata y muslo se lleve parte del espinazo. Si el piloto corta
-- distinto, TRES FILAS DE ESTA TABLA CAMBIAN. Es el caso del vacío del vacuno
-- otra vez: el nombre no alcanza, hay que fijar dónde empieza y dónde termina
-- la presa.
--
-- EL REDONDEO. A dos decimales los seis porcentajes suman 100,01. El 0,01 se le
-- saca a las alitas (14,875 -> 14,87 en vez de 14,88), que es justo donde la
-- medición original tiene la ambigüedad del caballete. Se deja escrito para que
-- nadie lo "arregle" moviéndolo a otra fila.
--
-- CÓMO SE USA: `uso = 'precarga_trozado'`. Esta tabla NO crea stock. Precarga el
-- formulario de trozado y el carnicero corrige lo que no dio. Si creara stock,
-- un trozado mal estimado metería presas fantasma en la vitrina; precargando,
-- el peor caso es que tenga que corregir un número. Cada corrección suya es una
-- medición que reemplaza a la del video.

-- ------------------------------------------------------------
-- 1. Marcar como aviar lo que ya está, y agregar lo que falta
-- ------------------------------------------------------------

update productos set especie = 'aviar'
 where especie is null
   and codigo in (
     'pollo_entero', 'pata', 'muslo', 'pata_y_muslo', 'rancho',
     'pechuga_desosada', 'alitas', 'menudos', 'patitas_rebozadas',
     'milanesa_de_pollo', 'hamburguesa_de_pollo', 'medallon_de_pollo',
     'nuggets_de_pollo', 'brochette_de_pollo', 'pollo_relleno'
   );

do $$
declare
  v_carniceria record;
  v_producto_id uuid;
  v_nuevo record;
begin
  for v_carniceria in select id from carnicerias loop

    for v_nuevo in
      select * from (values
        ('piel_de_pollo',    'Piel de pollo',    'pollo', 'kg'),
        ('carcasa_de_pollo', 'Carcasa de pollo', 'pollo', 'kg')
      ) as t(codigo, nombre, familia, unidad)
    loop
      insert into productos (carniceria_id, codigo, nombre_display, familia, unidad,
                             especie, activo, stock_actual, es_propio)
      values (v_carniceria.id, v_nuevo.codigo, v_nuevo.nombre, v_nuevo.familia,
              v_nuevo.unidad, 'aviar', true, 0, false)
      on conflict (carniceria_id, codigo) do nothing;
    end loop;

    -- "Suprema" es como se llama la pechuga deshuesada y sin piel, que es
    -- justo lo que pesó el carnicero del video.
    select id into v_producto_id from productos
     where carniceria_id = v_carniceria.id and codigo = 'pechuga_desosada';
    if v_producto_id is not null then
      insert into producto_sinonimos (producto_id, texto) values
        (v_producto_id, 'suprema'),
        (v_producto_id, 'supremas')
      on conflict (producto_id, texto) do nothing;
    end if;

    for v_nuevo in
      select * from (values
        ('piel_de_pollo',    'piel de pollo'),
        ('carcasa_de_pollo', 'carcasa de pollo'),
        ('carcasa_de_pollo', 'esqueleto de pollo')
      ) as t(codigo, sinonimo)
    loop
      select id into v_producto_id from productos
       where carniceria_id = v_carniceria.id and codigo = v_nuevo.codigo;
      if v_producto_id is not null then
        insert into producto_sinonimos (producto_id, texto)
        values (v_producto_id, v_nuevo.sinonimo)
        on conflict (producto_id, texto) do nothing;
      end if;
    end loop;

  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Vida útil: 4 días, no 6
-- ------------------------------------------------------------
--
-- La fuente da 4 a 6 días a 4 °C en envase aeróbico. Se toma el extremo BAJO
-- por la misma asimetría que fijó el vendible en 70 % para el novillo: pasarse
-- para arriba hace que el bot ofrezca pollo que ya no está bueno, que es un
-- cliente perjudicado; pasarse para abajo es una alerta de más.
--
-- Y el CAA (art. 256) exige entre -2 y 2 °C para ave refrigerada, que es más
-- frío que la refrigeración comercial habitual de 3-7 °C: si la cámara está a
-- 5 °C, estos 4 días ya son optimistas.

update productos set vida_util_dias = 4
 where especie = 'aviar' and vida_util_dias is null
   and codigo in ('pollo_entero', 'pata', 'muslo', 'pata_y_muslo', 'rancho',
                  'pechuga_desosada', 'alitas', 'menudos', 'piel_de_pollo',
                  'carcasa_de_pollo');

-- ------------------------------------------------------------
-- 3. PERFIL POLLO TROZADO v1
-- ------------------------------------------------------------

do $$
declare
  v_carniceria record;
  v_tabla_id uuid;
  v_producto_id uuid;
  v_fila record;
  v_cierre numeric;
  v_faltan text;
begin
  for v_carniceria in select id from carnicerias loop

    -- Si ya existe una tabla de pollo vigente, no se toca: puede ser una
    -- calibrada con despostes reales, que siempre vale más que ésta.
    select id into v_tabla_id from tablas_rendimiento
     where carniceria_id = v_carniceria.id and especie = 'aviar' and vigente_hasta is null
     limit 1;

    if v_tabla_id is not null then
      raise notice 'Carnicería %: ya tiene una tabla de pollo vigente, no se pisa.', v_carniceria.id;
      continue;
    end if;

    -- Antes de crear nada: si falta alguno de los seis productos, no se carga
    -- una tabla a medias. Una tabla que no cierra es peor que ninguna tabla.
    select string_agg(c, ', ') into v_faltan
      from unnest(array['pata_y_muslo','pechuga_desosada','alitas','menudos',
                        'piel_de_pollo','carcasa_de_pollo']) as c
     where not exists (
       select 1 from productos p
        where p.carniceria_id = v_carniceria.id and p.codigo = c
     );

    if v_faltan is not null then
      raise notice 'Carnicería %: faltan productos de pollo (%), no se carga el perfil.', v_carniceria.id, v_faltan;
      continue;
    end if;

    insert into tablas_rendimiento (
      carniceria_id, especie, categoria, proveedor, version,
      uso, pct_hueso, pct_grasa, pct_merma, notas
    ) values (
      v_carniceria.id, 'aviar', null, null, 1,
      'precarga_trozado',
      -- Hueso y grasa van en CERO y no es que no existan: en este trozado no
      -- se separaron. El hueso se fue adentro de la pata y muslo y de las
      -- alitas, y lo poco que quedó suelto es la carcasa, que sí tiene fila.
      -- Poner un número acá sería inventar una separación que no ocurrió.
      0.00, 0.00, 1.20,
      'PERFIL POLLO TROZADO v1 — una sola medición real (cajón de 6, 20/09/2026). '
      'Cierra al 98,80 % con 1,20 % de merma. NO crea stock: precarga el trozado. '
      'Las definiciones de corte son las de ese carnicero (alitas con caballete, '
      'pata y muslo con parte del espinazo): si el piloto corta distinto, cambian '
      'tres filas. Se reemplaza sola con los primeros 10 trozados propios.'
    ) returning id into v_tabla_id;

    for v_fila in
      select * from (values
        ('pata_y_muslo',     40.50),
        ('pechuga_desosada', 28.75),
        ('alitas',           14.87),   -- 14,875 bajado a 14,87: ver el encabezado
        ('menudos',           6.00),
        ('piel_de_pollo',     5.83),
        ('carcasa_de_pollo',  2.85)
      ) as t(codigo, pct)
    loop
      select id into v_producto_id from productos
       where carniceria_id = v_carniceria.id and codigo = v_fila.codigo;

      insert into rendimiento_cortes (tabla_id, producto_id, pct_central, origen, muestras)
      values (v_tabla_id, v_producto_id, v_fila.pct, 'referencia', 1)
      on conflict (tabla_id, producto_id) do nothing;
    end loop;

    -- El mismo control que en 0024, y por el mismo motivo: el error es
    -- invisible a ojo. Falla a propósito si no cierra.
    v_cierre := verificar_cierre_tabla_rendimiento(v_tabla_id);
    if abs(v_cierre - 100.00) > 0.01 then
      raise exception 'El PERFIL POLLO TROZADO v1 no cierra: suma % en vez de 100.', v_cierre;
    end if;

  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. El cajón: el formato que se precarga
-- ------------------------------------------------------------
--
-- 20 kg es el formato dominante (tres proveedores distintos, el mismo cajón),
-- pero NO se clava en el código: también apareció el cajón de 10 kg. Se guarda
-- como preferencia de la carnicería y se puede corregir en cada carga.

alter table carnicerias
  add column if not exists peso_cajon_pollo_kg numeric(6,2) not null default 20;

comment on column carnicerias.peso_cajon_pollo_kg is
  'Peso del cajón de pollo con el que trabaja esta carnicería. El cajón es un '
  'formato cerrado: el peso es dato y las CABEZAS son la incógnita (6 a 12), '
  'justo al revés que una media res.';
