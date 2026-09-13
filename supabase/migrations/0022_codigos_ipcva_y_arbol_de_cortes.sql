-- ============================================================
-- 0022 — Los códigos del IPCVA como columna vertebral del catálogo
-- ============================================================
--
-- El nomenclador oficial del IPCVA no es una lista de cortes: es un ÁRBOL con
-- códigos numéricos. Y ese árbol resuelve dos problemas que veníamos arrastrando.
--
-- PROBLEMA 1 — Los nombres son ambiguos y las fuentes se contradicen.
--   "Vacío" son 6,20 kg en el INAC y ~3 kg en los catálogos argentinos, y
--   ninguno está mal: son cortes distintos con el mismo nombre. Peor todavía:
--   existe "Tapa de Aguja - Asado de Carnicero" (2310), que es del DELANTERO y
--   no tiene nada que ver con la tapa de asado. Con nombres se confunden; con
--   códigos, no.
--
-- PROBLEMA 2 — La misma carne se vende con distinto nombre según cómo se cortó.
--   La tapa de asado a veces se separa y a veces va con el costillar. Lo mismo
--   la colita de cuadril y la tapa de nalga. El IPCVA ya tiene esa relación
--   definida, y encima con la resta escrita en la norma: el cuadril sin tapa
--   (2457) "se obtiene del cuadril (ítem 2456) y a partir de éste se retira el
--   músculo bíceps femoral" — que es la picaña (2460).
--
-- Por eso `producto_padre_id`: un corte hijo puede estar separado (es una pieza
-- aparte) o no estarlo (sus kilos siguen adentro del padre). El sistema sabe que
-- son la misma carne, así que nunca los cuenta dos veces.
--
-- IMPORTANTE SOBRE LOS CÓDIGOS DE ESTA MIGRACIÓN
-- Solo se cargan los códigos que se pudieron verificar contra el nomenclador
-- publicado (carneargentina.org.ar/nomenclador-de-cortes y argentinebeef.org.ar).
-- Los demás quedan en NULL a propósito: un código inventado sería peor que
-- ninguno, porque se leería como oficial. Completar con la fuente a la vista.

-- ------------------------------------------------------------
-- 1. Las columnas nuevas
-- ------------------------------------------------------------

alter table productos
  add column if not exists codigo_ipcva text,
  add column if not exists producto_padre_id uuid references productos(id) on delete set null,
  add column if not exists separable boolean not null default false;

comment on column productos.codigo_ipcva is
  'Código del nomenclador oficial del IPCVA. NULL = todavía no verificado contra '
  'la fuente. Nunca completar de memoria: un código inventado se lee como oficial.';

comment on column productos.producto_padre_id is
  'De qué corte más grande sale éste. Ej: tapa de asado -> asado. Si el carnicero '
  'no lo separa, sus kilos viven adentro del padre y este producto no tiene stock.';

comment on column productos.separable is
  'true = el carnicero puede separarlo del padre o dejarlo adentro, y cambia de '
  'criterio de una media res a otra. Es lo que obliga a soportar las dos formas.';

create index if not exists productos_padre_idx
  on productos (producto_padre_id) where producto_padre_id is not null;

create index if not exists productos_ipcva_idx
  on productos (carniceria_id, codigo_ipcva) where codigo_ipcva is not null;

-- ------------------------------------------------------------
-- 2. Chingolo — el único corte de la tabla de rendimiento que faltaba
-- ------------------------------------------------------------

do $$
declare
  v_carniceria record;
  v_producto_id uuid;
begin
  for v_carniceria in select id from carnicerias loop
    insert into productos (carniceria_id, codigo, nombre_display, familia, unidad, activo, stock_actual)
    values (v_carniceria.id, 'chingolo', 'Chingolo', 'vacuno_guiso', 'kg', true, 0)
    on conflict (carniceria_id, codigo) do nothing
    returning id into v_producto_id;

    if v_producto_id is not null then
      insert into producto_sinonimos (producto_id, texto) values
        (v_producto_id, 'chingolo'),
        (v_producto_id, 'lomillo'),
        (v_producto_id, 'chingolito')
      on conflict (producto_id, texto) do nothing;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Códigos del IPCVA — solo los verificados
-- ------------------------------------------------------------

update productos set codigo_ipcva = '2456'  where codigo = 'cuadril';
update productos set codigo_ipcva = '2460'  where codigo = 'tapa_de_cuadril';
update productos set codigo_ipcva = '2461'  where codigo = 'colita_de_cuadril';
update productos set codigo_ipcva = '2464'  where codigo = 'nalga';
update productos set codigo_ipcva = '2465'  where codigo = 'tapa_de_nalga';
update productos set codigo_ipcva = '2307A' where codigo = 'carnaza_de_paleta';
update productos set codigo_ipcva = '2309'  where codigo = 'marucha';
update productos set codigo_ipcva = '2308'  where codigo = 'chingolo';
update productos set codigo_ipcva = '2311'  where codigo = 'brazuelo';
update productos set codigo_ipcva = '2304'  where codigo = 'bife_ancho';
update productos set codigo_ipcva = '2316'  where codigo = 'falda';
update productos set codigo_ipcva = '2317'  where codigo = 'matambre';

-- Sin código verificado todavía (dejar en NULL, NO completar de memoria):
--   asado, tapa_de_asado, vacio, entrana, pecho, cogote, aguja, paleta,
--   palomita, bife_angosto, bife_de_chorizo, lomo, cuadrada, peceto,
--   bola_de_lomo, tortuguita, osobuco, espinazo.
--
-- Ojo con dos de esos:
--   - "cogote" y "aguja" aparecen en el nomenclador dentro del compuesto
--     2301 "Cogote, Aguja y Paleta", no como cortes sueltos.
--   - "tapa de asado" NO es 2310: ese código es "Tapa de Aguja - Asado de
--     Carnicero", un corte del delantero que no tiene nada que ver.

-- ------------------------------------------------------------
-- 4. El árbol: qué corte sale de qué corte
-- ------------------------------------------------------------
--
-- Cada par de acá es una pregunta que hay que hacerle al carnicero piloto:
-- "¿esto lo separás o lo vendés con el otro?". La respuesta no cambia el árbol
-- —la relación anatómica es la que es— cambia si en su carnicería el hijo
-- tiene stock propio o vive adentro del padre.

do $$
declare
  v_carniceria record;
begin
  for v_carniceria in select id from carnicerias loop

    -- Confirmado por fuente: la tapa de asado "se vende aparte, o sin sacarla,
    -- con el costillar" (Sitio Argentino de Producción Animal, ficha 73).
    update productos h set producto_padre_id = p.id, separable = true
      from productos p
     where h.carniceria_id = v_carniceria.id and p.carniceria_id = v_carniceria.id
       and h.codigo = 'tapa_de_asado' and p.codigo = 'asado';

    -- Cadena oficial del IPCVA: 2456 Cuadril -> 2457 sin tapa -> 2459 corazón,
    -- con 2460 (picaña) y 2461 (colita) como hijos que se retiran.
    update productos h set producto_padre_id = p.id, separable = true
      from productos p
     where h.carniceria_id = v_carniceria.id and p.carniceria_id = v_carniceria.id
       and h.codigo in ('tapa_de_cuadril', 'colita_de_cuadril') and p.codigo = 'cuadril';

    -- 2465 Tapa de Nalga: "constituido por los músculos removidos en la
    -- preparación de la nalga de adentro sin tapa (ítem 2464)".
    update productos h set producto_padre_id = p.id, separable = true
      from productos p
     where h.carniceria_id = v_carniceria.id and p.carniceria_id = v_carniceria.id
       and h.codigo = 'tapa_de_nalga' and p.codigo = 'nalga';

    -- Marucha, palomita y chingolo salen de la paleta.
    --
    -- SIMPLIFICACIÓN DELIBERADA: el IPCVA tiene un nivel intermedio (2307
    -- "Carnaza de Paleta con Marucha" -> 2307A "Carnaza de Paleta"), así que en
    -- rigor la marucha sale de la carnaza y la carnaza de la paleta. Acá se
    -- colapsa a un solo nivel porque la carnaza no tiene fila propia en la tabla
    -- de rendimiento: si la marucha colgara de ella, sus kilos no tendrían dónde
    -- ir cuando el carnicero no la separa. Un árbol de dos niveles con el del
    -- medio vacío es peor que uno de un nivel.
    update productos h set producto_padre_id = p.id, separable = true
      from productos p
     where h.carniceria_id = v_carniceria.id and p.carniceria_id = v_carniceria.id
       and h.codigo in ('marucha', 'palomita', 'chingolo') and p.codigo = 'paleta';

  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Una contradicción que tiene que resolver el carnicero
-- ------------------------------------------------------------
--
-- LA MARUCHA. El IPCVA la ubica en la paleta (2307/2309). El Sitio Argentino de
-- Producción Animal dice que es "la tapa que cubre la parte de los bifes
-- anchos", o sea en el costillar. Son dos carnes distintas con el mismo nombre.
--
-- Acá se cargó la versión del IPCVA porque es la fuente oficial, pero si el
-- carnicero piloto llama "marucha" a la del costillar, hay que cambiar el padre
-- a `bife_ancho` y corregir el porcentaje de la tabla de rendimiento.
