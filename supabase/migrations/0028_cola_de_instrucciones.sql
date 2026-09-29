-- ============================================================
-- 0028 — Cola de instrucciones del carnicero
-- ============================================================
--
-- Pedido del fundador (29/09/2026): "le cuesta mucho entender cuando debe
-- cargar varias cosas juntas o recibe varias instrucciones al mismo tiempo".
--
-- El carnicero manda en UN audio "llegó una media res de 104, un cajón de
-- pollo de 8 y piqué 5 kilos de nalga". Son tres cosas distintas, y cada una
-- se confirma por separado (una media res se reparte en cortes, un cajón en
-- pollos, la picada es un movimiento de stock). El bot solo puede tener UNA
-- operación pendiente a la vez por carnicero — así su "sí" nunca es ambiguo —,
-- entonces las otras dos esperan en fila acá.
--
-- Cómo se usa (ver src/lib/whatsapp/entrante.ts, `atenderCarniceroConCola`):
--   1. El mensaje se parte en instrucciones (src/lib/instrucciones.ts).
--   2. La primera se atiende como siempre.
--   3. Las demás se guardan en `cola_instrucciones` de la operación que quedó
--      pendiente.
--   4. Cuando esa operación se cierra (confirmada o cancelada), se atiende la
--      siguiente de la fila, sin que el carnicero tenga que repetir nada.
--
-- Es una columna nueva y opcional: el código anterior la ignora, así que esta
-- migración se puede correr antes de subir el código sin romper nada.

alter table operaciones_stock
  add column if not exists cola_instrucciones text[] not null default '{}';

comment on column operaciones_stock.cola_instrucciones is
  'Instrucciones del mismo mensaje que esperan su turno hasta que esta operación se cierre (0028).';
