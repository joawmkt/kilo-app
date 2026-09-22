-- ============================================================
-- 0026 — Catálogo de cerdo: el pernil y sus cinco hijos
-- ============================================================
--
-- DOS COSAS QUE HAY QUE SABER ANTES DE LEER ESTO.
--
-- 1. NO EXISTE NOMENCLADOR OFICIAL DE CORTES PORCINOS EN ARGENTINA.
--    Vacuno tiene el del IPCVA; ovino tiene el suyo desde 2019 (Disposición
--    3/2019); porcino no tiene. Lo más cercano es un glosario del MAGyP:
--    multilingüe, sin códigos, sin pesos y sin carácter normativo.
--    Por eso NINGÚN producto de acá lleva `codigo_ipcva`: no hay códigos que
--    copiar, y uno inventado se leería como oficial. Es la misma regla de 0022.
--
-- 2. EL PERNIL SE ABRE EN LOS MISMOS CINCO NOMBRES QUE EL VACUNO.
--    Bola de lomo, cuadrada, cuadril, nalga y peceto. Los frigoríficos los
--    venden sueltos así. Eso es exactamente la estructura padre/hijo que ya
--    existe desde 0022 — no hay código nuevo, hay filas nuevas — pero trae el
--    problema de que son CINCO NOMBRES IDÉNTICOS EN DOS ESPECIES. Se resuelve
--    con `terminos_ambiguos`, que ya existe desde 0002 y que `catalogo.ts` solo
--    activa cuando quedan 2+ candidatos ACTIVOS: la carnicería que no vende
--    peceto de cerdo no se come ninguna repregunta.
--
-- Esta migración es defensiva a propósito: el catálogo base se cargó fuera de
-- las migraciones, así que acá nada asume que un producto exista.

-- ------------------------------------------------------------
-- 1. Marcar como porcino lo que ya está en el catálogo
-- ------------------------------------------------------------

update productos set especie = 'porcino'
 where especie is null
   and codigo in (
     'bondiola', 'carre', 'costeleta_de_cerdo', 'pechito_de_cerdo',
     'matambre_de_cerdo', 'vacio_de_cerdo', 'solomillo', 'pulpa_de_cerdo',
     'paleta_de_cerdo', 'pata_de_cerdo', 'panceta', 'chorizo_de_cerdo',
     'milanesa_de_cerdo', 'hamburguesa_de_cerdo', 'medallon_de_cerdo',
     'tocino', 'codillo', 'manitos', 'patitas_de_cerdo', 'cuerito'
   );

-- ------------------------------------------------------------
-- 2. El pernil y sus cinco hijos + los subproductos de la media res
-- ------------------------------------------------------------
--
-- La media res de cerdo trae cabeza, patita, cuerito y huesito. El vacuno no
-- tiene este problema. No son descarte —el cuerito se come y la patita se
-- vende— pero tampoco son un corte del mostrador con precio por kilo en la
-- mayoría de las carnicerías, y no se encontró qué hace con ellos el carnicero
-- argentino. La bandera de subproducto es exactamente el lugar donde algo
-- espera a que se sepa qué es: está contado, está pesado, y el día que se
-- decida venderlo se le pone precio sin migrar nada.

do $$
declare
  v_carniceria record;
  v_producto_id uuid;
  v_pernil_id uuid;
  v_nuevo record;
  v_conflicto int;
begin
  for v_carniceria in select id from carnicerias loop

    -- Los productos nuevos. `es_propio` queda en false: vienen del catálogo
    -- base, así que se desactivan pero no se borran.
    for v_nuevo in
      -- Ojo: la bandera de subproducto NO vive en `productos` sino en cada
      -- pieza (`piezas_stock.es_subproducto`), porque es una propiedad de lo
      -- que entró, no del producto. La pone el motor al crear la pieza.
      select * from (values
        ('pernil',                'Pernil',                'cerdo', 'kg'),
        ('bola_de_lomo_de_cerdo', 'Bola de lomo de cerdo', 'cerdo', 'kg'),
        ('cuadrada_de_cerdo',     'Cuadrada de cerdo',     'cerdo', 'kg'),
        ('cuadril_de_cerdo',      'Cuadril de cerdo',      'cerdo', 'kg'),
        ('nalga_de_cerdo',        'Nalga de cerdo',        'cerdo', 'kg'),
        ('peceto_de_cerdo',       'Peceto de cerdo',       'cerdo', 'kg'),
        ('cuerito',               'Cuerito',               'cerdo', 'kg'),
        ('patitas_de_cerdo',      'Patitas de cerdo',      'cerdo', 'kg'),
        ('cabeza_de_cerdo',       'Cabeza de cerdo',       'cerdo', 'kg'),
        ('huesito_de_cerdo',      'Huesito de cerdo',      'cerdo', 'kg')
      ) as t(codigo, nombre, familia, unidad)
    loop
      insert into productos (carniceria_id, codigo, nombre_display, familia, unidad,
                             especie, activo, stock_actual, es_propio)
      values (v_carniceria.id, v_nuevo.codigo, v_nuevo.nombre, v_nuevo.familia,
              v_nuevo.unidad, 'porcino', true, 0, false)
      on conflict (carniceria_id, codigo) do nothing;
    end loop;

    -- Sinónimos. NO se cargan los que chocarían con un corte vacuno existente
    -- ("peceto" a secas, "cuadrada" a secas): para eso están los términos
    -- ambiguos del paso 3.
    select id into v_pernil_id from productos
     where carniceria_id = v_carniceria.id and codigo = 'pernil';

    if v_pernil_id is not null then
      insert into producto_sinonimos (producto_id, texto) values
        (v_pernil_id, 'pernil'),
        (v_pernil_id, 'jamon fresco'),
        (v_pernil_id, 'jamón fresco')
      on conflict (producto_id, texto) do nothing;
    end if;

    for v_nuevo in
      select * from (values
        ('bola_de_lomo_de_cerdo', 'bola de lomo de cerdo'),
        ('cuadrada_de_cerdo',     'cuadrada de cerdo'),
        ('cuadril_de_cerdo',      'cuadril de cerdo'),
        ('nalga_de_cerdo',        'nalga de cerdo'),
        ('peceto_de_cerdo',       'peceto de cerdo'),
        ('peceto_de_cerdo',       'peceto de chancho'),
        ('cuerito',               'cuerito'),
        ('cuerito',               'cuero de cerdo'),
        ('patitas_de_cerdo',      'patitas de cerdo'),
        ('patitas_de_cerdo',      'manitos'),
        ('cabeza_de_cerdo',       'cabeza de cerdo'),
        ('huesito_de_cerdo',      'huesito de cerdo')
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

    -- El árbol: los cinco salen del pernil, y son separables porque el
    -- carnicero a veces vende el pernil entero y a veces lo abre.
    update productos h set producto_padre_id = p.id, separable = true
      from productos p
     where h.carniceria_id = v_carniceria.id and p.carniceria_id = v_carniceria.id
       and p.codigo = 'pernil'
       and h.codigo in ('bola_de_lomo_de_cerdo', 'cuadrada_de_cerdo',
                        'cuadril_de_cerdo', 'nalga_de_cerdo', 'peceto_de_cerdo');

    -- Aviso, no corrección automática: si la carnicería ya venía usando
    -- `pata_de_cerdo` para la misma pieza que `pernil`, son dos productos
    -- activos para la misma carne y hay que desactivar uno. Esa decisión es
    -- del carnicero, desde la pantalla de catálogo — no de una migración.
    select count(*) into v_conflicto from productos
     where carniceria_id = v_carniceria.id
       and codigo in ('pernil', 'pata_de_cerdo') and activo;
    if v_conflicto > 1 then
      raise notice 'Carnicería %: tiene "pernil" y "pata_de_cerdo" activos. Si son la misma pieza, desactivá uno desde /panel/catalogo.', v_carniceria.id;
    end if;

  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Los cinco nombres compartidos con el vacuno
-- ------------------------------------------------------------
--
-- Decisión del fundador (20/09): el bot PREGUNTA siempre de qué especie.
-- El costo se paga solo cuando existe: `catalogo.ts` descarta el término
-- ambiguo si no quedan 2+ opciones activas.
--
-- "Peceto" es el caso claro. El de "roast beef" / "aguja" que se discutió es
-- distinto y NO se resuelve acá: ahí los dos productos son vacunos y puede que
-- para ese carnicero sean el mismo corte, en cuyo caso corresponde desactivar
-- uno, no volverlo ambiguo. Eso lo decide él en el panel.

do $$
declare
  v_carniceria record;
  v_termino record;
begin
  for v_carniceria in select id from carnicerias loop
    for v_termino in
      select * from (values
        ('peceto',       '¿Peceto vacuno o de cerdo?',       array['peceto', 'peceto_de_cerdo']),
        ('cuadrada',     '¿Cuadrada vacuna o de cerdo?',     array['cuadrada', 'cuadrada_de_cerdo']),
        ('cuadril',      '¿Cuadril vacuno o de cerdo?',      array['cuadril', 'cuadril_de_cerdo']),
        ('nalga',        '¿Nalga vacuna o de cerdo?',        array['nalga', 'nalga_de_cerdo']),
        ('bola de lomo', '¿Bola de lomo vacuna o de cerdo?', array['bola_de_lomo', 'bola_de_lomo_de_cerdo'])
      ) as t(texto, pregunta, opciones)
    loop
      insert into terminos_ambiguos (carniceria_id, texto, pregunta, opciones_codigos, activo)
      values (v_carniceria.id, v_termino.texto, v_termino.pregunta, v_termino.opciones, true)
      on conflict (carniceria_id, texto) do nothing;
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Vida útil y subproductos
-- ------------------------------------------------------------
--
-- [SIN DATO] el CAA no tiene un artículo de temperatura específico para carne
-- porcina fresca como el 256 para aves. Lo razonable es que aplique el régimen
-- general de carnes frescas, pero NO se verificó — así que el cerdo queda sin
-- vida útil cargada en vez de con un número inventado.

update productos set vida_util_dias = null
 where especie = 'porcino' and vida_util_dias is not null;
