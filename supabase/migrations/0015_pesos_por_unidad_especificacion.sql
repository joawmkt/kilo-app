-- Pesos aproximados por unidad — especificación del bot, sección 6.
--
-- Reemplaza las estimaciones provisorias de la migración 0009 (que estaban
-- marcadas como "mías, sin confirmar") por los valores definidos con el
-- negocio el 09/09/2026:
--
--   Milanesa de carne / pollo / cerdo ... 150 g por unidad
--   Hamburguesa ......................... 120 g por unidad
--   Medallón ............................ 120 g por unidad
--
-- Por qué importa: sin este número, un pedido como "dame 4 milanesas" no se
-- puede convertir a kilos y el bot tiene que pedirle al cliente que lo diga
-- en kilos — fricción evitable. Hamburguesas y medallones hoy NO tienen valor
-- cargado, así que hasta esta migración no se podían pedir por unidad.
--
-- Deliberadamente NO se les pone valor a los rellenos (hamburguesa_rellena,
-- medallon_relleno) ni a productos muy variables como patitas, brochettes o
-- albóndigas: la sección 6 dice que esos quedan sin valor por defecto hasta
-- que el carnicero los configure. Poner un número inventado ahí sería
-- exactamente lo que la sección 1.3 prohíbe.
--
-- Aplica a TODAS las carnicerías (no filtra por una), porque son pesos del
-- producto, no una decisión de un local puntual. Si alguna carnicería corta
-- distinto, se corrige desde el panel.
update productos
set peso_aproximado_unidad_kg = case
  when codigo like 'milanesa%' then 0.150
  when codigo in (
    'hamburguesa_de_carne',
    'hamburguesa_de_pollo',
    'hamburguesa_de_cerdo',
    'medallon_de_carne',
    'medallon_de_pollo',
    'medallon_de_cerdo'
  ) then 0.120
  else peso_aproximado_unidad_kg
end
where codigo like 'milanesa%'
   or codigo in (
     'hamburguesa_de_carne',
     'hamburguesa_de_pollo',
     'hamburguesa_de_cerdo',
     'medallon_de_carne',
     'medallon_de_pollo',
     'medallon_de_cerdo'
   );
