-- Tanda 3 — conversación segura.
-- Especificación del bot, secciones 3.1, 3.2, 31, 32 y 34.
--
-- Tres cosas que necesitan lugar en la base:
--   1. Saber qué mensajes entrantes ya se procesaron, para poder agrupar los
--      que llegan seguidos (sección 34).
--   2. Un estado nuevo del pedido: el resumen que el cliente tiene que
--      confirmar antes de que el pedido llegue al carnicero (sección 31).
--   3. Marcas de tiempo para los avisos automáticos (secciones 3.1 y 32).

-- ============================================================
-- 1. VENTANA DE AGRUPACIÓN (sección 34)
-- ============================================================
--
-- El cliente casi nunca escribe todo junto: manda "quiero vacío", después "2
-- kilos", después "y 6 chorizos". Contestar cada uno por separado da una
-- conversación picada y, desde el 1/10, además cuesta plata: Meta factura cada
-- burbuja aparte.
--
-- La solución es esperar unos segundos desde el último mensaje y recién ahí
-- interpretar todo el bloque junto. Para eso hace falta saber qué mensajes
-- todavía no se consumieron: eso es `procesado_at`.
--
-- Null = todavía no se procesó. Se llena cuando el mensaje entra en un bloque
-- que ya se interpretó. Los mensajes viejos (anteriores a esta migración)
-- quedan en null pero no molestan: el agrupador solo mira los de los últimos
-- minutos, justamente para no arrastrar historia vieja.
alter table mensajes_whatsapp
  add column if not exists procesado_at timestamptz;

comment on column mensajes_whatsapp.procesado_at is
  'Cuándo este mensaje entrante fue consumido por el bot. Null = pendiente. Ver src/lib/whatsapp/ventana.ts (especificación, sección 34).';

create index if not exists mensajes_pendientes_de_procesar_idx
  on mensajes_whatsapp (conversacion_id, created_at)
  where direccion = 'entrante' and procesado_at is null;

-- ============================================================
-- 2. CONFIRMACIÓN FINAL DEL CLIENTE (sección 31)
-- ============================================================
--
-- Hasta ahora, apenas el pedido quedaba completo se le mandaba al carnicero.
-- La sección 31 mete un paso en el medio a propósito: mostrarle al cliente el
-- resumen entero y esperar que diga que sí. Suma una interacción, pero evita
-- que el carnicero prepare un pedido mal entendido — que cuesta muchísimo más.
--
-- `borrador` acompaña a la sección 32: un pedido que se empezó a armar y quedó
-- por la mitad no es lo mismo que uno esperando una aclaración puntual.
alter table pedidos drop constraint if exists pedidos_estado_check;
alter table pedidos
  add constraint pedidos_estado_check check (estado in (
    'borrador',
    'pendiente_aclaracion',
    'pendiente_confirmacion_cliente',
    'pendiente_aprobacion',
    'aprobado',
    'rechazado',
    'cancelado',
    'vencido',
    'retirado',
    'no_show'
  ));

-- Los índices de pedidos "en curso" tienen que incluir los estados nuevos: si
-- no, un pedido esperando confirmación del cliente sería invisible para el
-- bot y el cliente terminaría con dos pedidos en paralelo.
drop index if exists pedidos_pendientes_idx;
create index if not exists pedidos_pendientes_idx
  on pedidos (carniceria_id, telefono, estado)
  where estado in ('borrador', 'pendiente_aclaracion', 'pendiente_confirmacion_cliente', 'pendiente_aprobacion');

-- ============================================================
-- 3. AVISOS AUTOMÁTICOS (secciones 3.1 y 32)
-- ============================================================
--
-- Las dos columnas existen para lo mismo: que un aviso salga UNA sola vez.
-- Sin ellas, el cron que corre cada 10 minutos repetiría el mensaje en cada
-- pasada, que es exactamente lo que la sección 3.1 pide evitar ("no
-- bombardear al cliente con recordatorios adicionales").
alter table pedidos
  add column if not exists aviso_demora_enviado_at timestamptz,
  add column if not exists aviso_retomar_enviado_at timestamptz;

comment on column pedidos.aviso_demora_enviado_at is
  'Cuándo se le avisó al cliente que la aprobación se está demorando (sección 3.1). Una sola vez por pedido.';
comment on column pedidos.aviso_retomar_enviado_at is
  'Cuándo se le preguntó al cliente si lo podemos ayudar, por un borrador abandonado (sección 32). Una sola vez.';
