-- Tanda 4 — el pedido deja de ser una foto y pasa a ser algo vivo.
-- Especificación del bot, secciones 8, 9, 10, 11, 12, 22, 25, 26, 27, 35 y 51.
--
-- Hasta acá un pedido era casi inmutable: se armaba, se mandaba al carnicero y
-- ahí terminaba. Si el cliente quería agregar algo, el bot le contestaba que su
-- pedido ya estaba esperando y no se podía hacer nada más. La especificación
-- pide lo contrario: que se pueda modificar, cancelar, reprogramar, y que todo
-- eso quede registrado y notificado.

-- ============================================================
-- 1. VERSIONADO (sección 51)
-- ============================================================
--
-- "También debe existir versionado para impedir aprobar versiones antiguas."
--
-- El caso real que esto evita: el carnicero abre el pedido en el panel, se
-- distrae, y mientras tanto el cliente le agrega dos kilos de chorizo. Si el
-- carnicero aprieta "aprobar" sobre la pantalla vieja, aprobaría un pedido que
-- ya no existe — y prepararía lo que decía la versión anterior.
--
-- Se resuelve con un número que sube en cada cambio: quien aprueba dice qué
-- versión estaba viendo, y si no coincide se rechaza la aprobación y se le
-- muestra la nueva. Es más simple que guardar una fila por versión, y alcanza
-- porque lo que importa no es el historial de los items (para eso está
-- `pedido_eventos`) sino que nadie apruebe a ciegas.
alter table pedidos
  add column if not exists version integer not null default 1;

comment on column pedidos.version is
  'Sube en cada cambio del pedido. Quien aprueba tiene que enviar la versión que vio (sección 51).';

-- ============================================================
-- 2. ESTADOS NUEVOS (sección 51)
-- ============================================================
--
-- `modificacion_pendiente` — el cliente pidió un cambio sobre un pedido que ya
--   estaba esperando aprobación: la versión vieja quedó invalidada y se está
--   rearmando la nueva (sección 35).
-- `en_espera` — al cierre, el carnicero dijo que el pedido sigue en pie para el
--   día siguiente (sección 7.5). Se agrega acá, junto con el resto de los
--   estados, para no volver a tocar esta restricción en la tanda siguiente.
alter table pedidos drop constraint if exists pedidos_estado_check;
alter table pedidos
  add constraint pedidos_estado_check check (estado in (
    'borrador',
    'pendiente_aclaracion',
    'pendiente_confirmacion_cliente',
    'pendiente_aprobacion',
    'modificacion_pendiente',
    'aprobado',
    'en_espera',
    'rechazado',
    'cancelado',
    'vencido',
    'retirado',
    'no_show'
  ));

drop index if exists pedidos_pendientes_idx;
create index if not exists pedidos_pendientes_idx
  on pedidos (carniceria_id, telefono, estado)
  where estado in (
    'borrador',
    'pendiente_aclaracion',
    'pendiente_confirmacion_cliente',
    'pendiente_aprobacion',
    'modificacion_pendiente'
  );

-- Varios pedidos a la vez para fechas distintas (sección 9): el bot necesita
-- poder listar rápido los pedidos vivos de un cliente para preguntarle a cuál
-- se refiere cuando hay más de uno.
create index if not exists pedidos_vivos_cliente_idx
  on pedidos (carniceria_id, telefono, hora_retiro)
  where estado in ('aprobado', 'en_espera');

-- ============================================================
-- 3. HISTORIAL DE EVENTOS (sección 27)
-- ============================================================
--
-- Cada cosa que le pasa a un pedido queda registrada. Sirve para tres cosas
-- muy concretas, y ninguna es "por si acaso":
--
--   1. El carnicero abre un pedido y entiende por qué está como está, sin
--      tener que leer toda la conversación.
--   2. Cuando un cliente reclama ("yo pedí 2 kilos"), hay un registro de qué
--      se pidió, cuándo cambió y quién lo cambió.
--   3. La sección 53 pide notificar TODO cambio al carnicero; esta tabla es la
--      que permite saber qué cambió sin comparar filas a mano.
--
-- `actor` dice quién lo hizo: 'cliente', 'carnicero', 'bot' o 'sistema' (los
-- automáticos, como un vencimiento). `detalle` queda jsonb libre a propósito:
-- cada tipo de evento guarda lo suyo sin necesitar una columna nueva.
create table if not exists pedido_eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  tipo text not null,
  actor text not null default 'sistema' check (actor in ('cliente', 'carnicero', 'bot', 'sistema')),
  descripcion text,
  detalle jsonb not null default '{}'::jsonb,
  version integer,
  created_at timestamptz not null default now()
);

create index if not exists pedido_eventos_pedido_idx
  on pedido_eventos (pedido_id, created_at desc);

alter table pedido_eventos enable row level security;

drop policy if exists "pedido_eventos_select_own" on pedido_eventos;
create policy "pedido_eventos_select_own" on pedido_eventos
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- ============================================================
-- 4. REPROGRAMACIONES (secciones 11, 25 y 26)
-- ============================================================
--
-- Cuando se mueve la hora de retiro hay que volver a mandar el recordatorio
-- para la hora nueva. `recordatorio_enviado_at` se limpia en la reprogramación,
-- así que no hace falta una columna nueva — pero sí conviene dejar registrado
-- el pedido original para poder mirar después cuánto se corren en la práctica.
alter table pedidos
  add column if not exists hora_retiro_original timestamptz;

comment on column pedidos.hora_retiro_original is
  'Primera hora de retiro acordada, si después se reprogramó (secciones 25 y 26).';

-- ============================================================
-- 5. AVISOS NUEVOS AL CARNICERO (sección 53)
-- ============================================================
--
-- "Todo cambio de un pedido debe notificarse al carnicero." Hasta ahora la
-- campanita del panel solo sabía de pedidos nuevos y de clientes que no
-- retiraron; los cambios (modificación, reprogramación, cancelación) no
-- aparecían en ningún lado y el carnicero se enteraba —o no— por WhatsApp.
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones
  add constraint notificaciones_tipo_check check (tipo in (
    'pedido_pendiente',
    'pedido_modificado',
    'pedido_reprogramado',
    'pedido_cancelado',
    'pedidos_del_dia',
    'pedidos_sin_cerrar',
    'cierre_con_pedidos',
    'decision_requerida',
    'stock_agotado',
    'stock_bajo',
    'cliente_no_retiro',
    'whatsapp_desconectado',
    'whatsapp_por_vencer',
    'plantilla_aprobada',
    'plantilla_rechazada'
  ));
