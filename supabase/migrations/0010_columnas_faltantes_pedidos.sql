-- Carnicom — Etapa 3, fix post-Paso 9: agrega a `pedidos` dos columnas que
-- el código (flujoPedidos.ts) ya escribía pero que 0008_pedidos_etapa3.sql
-- nunca creó. Bug mío: copié el patrón de flujoStock.ts (que guarda
-- `transcripcion` y `updated_at` en `operaciones_stock`, ver
-- 0002_catalogo_etapa2.sql líneas 120 y 126) sin agregar esas mismas
-- columnas a la tabla nueva de pedidos. Resultado en producción: error
-- PGRST204 "Could not find the 'transcripcion' column of 'pedidos' in the
-- schema cache" apenas un cliente real mandó un pedido.
-- Correr en Supabase → SQL Editor → New query → Run.

alter table pedidos
  add column if not exists transcripcion text,       -- último texto/audio del cliente para este pedido (debug/auditoría, igual que en operaciones_stock)
  add column if not exists updated_at timestamptz not null default now();
