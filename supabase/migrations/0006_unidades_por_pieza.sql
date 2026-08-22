-- Corrige productos que se cuentan por unidad y estaban cargados en kg
-- (confirmado con el fundador, 22/08/2026):
--   - chorizo (todas las variantes menos "bife de chorizo", que es un
--     corte de carne y no tiene nada que ver con el embutido) -> unidad
--   - hamburguesas (todas las variantes) -> unidad
--   - salchicha viena -> unidad (salchicha parrillera se queda en kg)
--
-- Las milanesas se dejan en kg a propósito: el carnicero las carga por kg,
-- aunque el cliente después las pueda pedir por unidad — eso es un tema de
-- conversión kg<->unidad para resolver en la Etapa 3 (bot de pedidos), no
-- algo que tenga que ver con cómo se carga el stock.
update productos
set unidad = 'unidad'
where carniceria_id = (select id from carnicerias where telefono_whatsapp = 'whatsapp:+14155238886')
  and codigo in (
    'chorizo',
    'chorizo_de_cerdo',
    'chorizo_bombon',
    'chorizo_colorado',
    'chorizo_saborizado',
    'hamburguesa_de_pollo',
    'hamburguesa_de_carne',
    'hamburguesa_de_cerdo',
    'hamburguesa_rellena',
    'salchicha_viena'
  );
