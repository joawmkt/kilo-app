-- ============================================================
-- 0021 — "Tu pedido ya está listo"
-- ============================================================
--
-- Pedido del fundador (10/09/2026): un botón para avisarle al cliente que su
-- pedido ya está armado, por si lo quiere pasar a buscar antes de la hora que
-- había acordado.
--
-- Por qué un timestamp y NO un estado nuevo
-- ------------------------------------------------------------
-- Es tentador agregar 'listo' a `pedidos.estado`, pero el estado ya significa
-- otra cosa: dónde está el pedido en el circuito de decisión (lo aprobó el
-- carnicero, se retiró, no se retiró...). "Listo" no cambia nada de eso — el
-- stock sigue reservado, el recordatorio sigue teniendo sentido, el pedido se
-- puede seguir dejando en espera o marcando como retirado exactamente igual.
--
-- Si lo hiciéramos un estado, habría que revisar TODOS los `.in(['aprobado',
-- ...])` que hay repartidos por el código (el cron, el resumen del día, los
-- índices de pedidos vivos, el panel) y alcanzaría con olvidarse de uno para
-- que un pedido marcado como listo desapareciera de la agenda del día o dejara
-- de contar para el no-show. El timestamp no rompe nada de eso: es información
-- que se agrega, no un cambio de carril.
--
-- El panel lo muestra como si fuera un estado ("Listo para retirar"), que es lo
-- único que le importa al carnicero.

alter table pedidos
  add column if not exists listo_at timestamptz;

comment on column pedidos.listo_at is
  'Cuándo el carnicero avisó que el pedido está armado y se puede retirar. '
  'Null = todavía no se avisó. Se setea una sola vez: el aviso al cliente sale '
  'con el update, así que un segundo toque del botón no le manda un WhatsApp '
  'repetido.';

-- Para la lista del día: los pedidos listos van primero, que son los que el
-- cliente puede venir a buscar en cualquier momento.
create index if not exists pedidos_listos_idx
  on pedidos (carniceria_id, listo_at)
  where listo_at is not null and estado in ('aprobado', 'en_espera');
