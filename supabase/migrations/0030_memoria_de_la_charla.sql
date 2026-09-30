-- ============================================================
-- 0030 — Memoria de la charla con cada cliente
-- ============================================================
--
-- Pedido del fundador (30/09/2026): "NO QUIERO QUE NUNCA MÁS SE OLVIDE UN
-- DATO. Si hacemos que retenga los datos va a dejar de hacer preguntas
-- pelotudas todo el tiempo".
--
-- Hasta ahora lo que el cliente decía vivía SOLO en el pedido que se estaba
-- armando. Pero el pedido cambia de estado (sale al carnicero, vuelve por
-- falta de stock, se confirma) y en cada cambio se limpiaba su estado
-- interno. Caso real: el cliente dijo "asado para 15 personas" al empezar;
-- el carnicero avisó que no había vacío; el cliente pidió cambiarlo por
-- matambre... y el bot volvió a preguntar "¿para cuántas personas es?".
--
-- Esta columna guarda lo que vale para TODA la charla del día, pase lo que
-- pase con el pedido: para cuántos es, qué producto faltó y en qué cantidad
-- (para poder cambiarlo por otro sin volver a preguntar), para qué ocasión
-- estaba comprando. Se lee al principio de cada mensaje y se usa cuando el
-- pedido no lo tiene. Vale por el día: mañana es otra charla (src/lib/memoriaCharla.ts).

alter table conversaciones
  add column if not exists memoria jsonb not null default '{}'::jsonb;

comment on column conversaciones.memoria is
  'Lo que el cliente dijo y vale para toda la charla del día (personas, faltantes, ocasión). Ver memoriaCharla.ts (0030).';
