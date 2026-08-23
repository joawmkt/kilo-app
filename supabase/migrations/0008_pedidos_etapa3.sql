-- Carnicom — Etapa 3, Paso 1: alinear `pedidos` con el catálogo real y con
-- la máquina de estados del bot de pedidos asistido.
-- Correr en Supabase → SQL Editor → New query → Run.
-- Requiere haber corrido antes 0002_catalogo_etapa2.sql (tabla `productos`)
-- y 0007_numeros_carnicero.sql.
--
-- `pedidos` quedó de la Etapa 1 con `items jsonb` pensado como
-- `{ corte, cantidad_kg }`, referenciando el viejo `cortes_stock` (dado de
-- baja en la Etapa 2). No tiene datos reales todavía, así que no hace
-- falta migrar filas — se recrean la forma de `items` y los estados.

-- ============================================================
-- Nueva forma de `items` (documentación, jsonb no tiene esquema propio):
-- [{
--   producto_id: uuid,
--   producto_codigo: text,
--   nombre_display: text,
--   cantidad: number,       -- en la unidad real del producto (kg o unidad)
--   unidad: text,
--   disponible: boolean,    -- false si en el momento de armarlo no había stock
--   sustituye_a_producto_id: uuid | null -- si es una alternativa ofrecida por falta de stock
-- }]
-- ============================================================

alter table pedidos drop constraint if exists pedidos_estado_check;

alter table pedidos
  add column if not exists telefono text,
  add column if not exists mensaje_whatsapp_id uuid references mensajes_whatsapp(id) on delete set null,
  add column if not exists interpretacion jsonb,
  add column if not exists pregunta_pendiente text,
  add column if not exists item_parcial jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists aprobado_at timestamptz,
  add column if not exists rechazado_at timestamptz,
  add column if not exists confirmado_at timestamptz,
  add column if not exists recordatorio_enviado_at timestamptz,
  add column if not exists retirado_at timestamptz,
  add column if not exists carnicero_telefono text;

-- `telefono` identifica la conversación igual que en `operaciones_stock`
-- (más simple que resolver siempre a través de `clientes`). Se completa a
-- partir de acá para pedidos nuevos; no hay filas viejas que migrar.
update pedidos set telefono = '' where telefono is null;
alter table pedidos alter column telefono set not null;

-- Estados de la Etapa 3:
--   pendiente_aclaracion   — armando el pedido con el cliente (falta un
--                             dato: producto, cantidad, o la hora de retiro).
--   pendiente_aprobacion   — pedido completo, esperando que el carnicero
--                             apruebe/rechace/pida modificar.
--   aprobado                — el carnicero aprobó: stock ya descontado y
--                             cliente ya avisado (`confirmado_at` registra
--                             ese aviso).
--   rechazado                — el carnicero rechazó el pedido.
--   cancelado                — el cliente decidió no seguir antes de que
--                             el carnicero lo vea.
--   vencido                  — el cliente dejó de responder a medio armar
--                             el pedido (expiración perezosa, mismo patrón
--                             que `operaciones_stock`).
--   retirado                — (Paso 8) el pedido se marcó como retirado.
--   no_show                  — (Paso 8) pasó la hora de retiro + margen sin
--                             marcarse como retirado.
alter table pedidos
  add constraint pedidos_estado_check check (estado in (
    'pendiente_aclaracion',
    'pendiente_aprobacion',
    'aprobado',
    'rechazado',
    'cancelado',
    'vencido',
    'retirado',
    'no_show'
  ));

alter table pedidos alter column estado set default 'pendiente_aclaracion';

create index if not exists pedidos_pendientes_idx
  on pedidos (carniceria_id, telefono, estado)
  where estado in ('pendiente_aclaracion', 'pendiente_aprobacion');

create index if not exists pedidos_aprobados_retiro_idx
  on pedidos (carniceria_id, hora_retiro)
  where estado = 'aprobado';

-- RLS: mismo criterio que el resto (el dueño ve/actualiza sus propios
-- pedidos desde el panel; toda escritura de negocio la hace el backend
-- con la service_role key). La policy de select/update ya existía desde
-- Etapa 1 (`pedidos_select_own` / `pedidos_update_own`), no hace falta
-- recrearla.
