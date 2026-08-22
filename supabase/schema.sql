-- Carnicom — esquema inicial (Etapa 1)
-- Correr este archivo completo en Supabase → SQL Editor → New query → Run

-- ============================================================
-- EXTENSIONES
-- ============================================================
create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ============================================================
-- TABLA: carnicerias
-- Cada fila es un cliente (tenant) de la plataforma.
-- owner_user_id conecta la carnicería con su usuario de Supabase Auth
-- (el carnicero que se loguea al panel).
-- ============================================================
create table if not exists carnicerias (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  nombre text not null,
  telefono_whatsapp text unique, -- número de WhatsApp de la carnicería (sandbox o real)
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABLA: clientes
-- Clientes finales de cada carnicería (identificados por su WhatsApp).
-- ============================================================
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  telefono text not null,
  nombre text,
  no_shows int not null default 0,
  created_at timestamptz not null default now(),
  unique (carniceria_id, telefono)
);

-- ============================================================
-- TABLA: cortes_stock
-- Stock actual de cada corte, por carnicería.
-- ============================================================
create table if not exists cortes_stock (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  nombre_corte text not null,
  cantidad_kg numeric(10, 2) not null default 0,
  actualizado_at timestamptz not null default now(),
  unique (carniceria_id, nombre_corte)
);

-- ============================================================
-- TABLA: pedidos
-- Pedidos armados por el bot, pendientes de aprobación del carnicero.
-- ============================================================
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  estado text not null default 'pendiente_aprobacion'
    check (estado in ('pendiente_aprobacion', 'aprobado', 'confirmado', 'cancelado')),
  items jsonb not null default '[]'::jsonb, -- [{ corte, cantidad_kg }]
  hora_retiro timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABLA: mensajes_whatsapp
-- Log crudo de todos los mensajes entrantes/salientes de WhatsApp.
-- Para Etapa 1 esta es la tabla que prueba que el cableado funciona:
-- un mensaje de prueba tiene que aparecer acá.
-- ============================================================
create table if not exists mensajes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid references carnicerias(id) on delete cascade,
  telefono_origen text not null,
  telefono_destino text not null,
  direccion text not null default 'entrante' check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'otro')),
  cuerpo text,
  media_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Cada carnicería solo puede ver/tocar sus propios datos.
-- El backend (rutas de API de Next.js) usa la service_role key,
-- que ignora RLS — estas políticas protegen el acceso desde el
-- panel del carnicero (frontend, con la anon key + sesión de usuario).
-- ============================================================

alter table carnicerias enable row level security;
alter table clientes enable row level security;
alter table cortes_stock enable row level security;
alter table pedidos enable row level security;
alter table mensajes_whatsapp enable row level security;

-- carnicerias: el dueño ve y edita solo su propia fila
create policy "carnicerias_select_own" on carnicerias
  for select using (owner_user_id = auth.uid());

create policy "carnicerias_update_own" on carnicerias
  for update using (owner_user_id = auth.uid());

-- clientes: visibles solo para el dueño de la carnicería asociada
create policy "clientes_select_own" on clientes
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- cortes_stock: select + update para el dueño (para el panel de solo-lectura /
-- futuras ediciones manuales)
create policy "cortes_stock_select_own" on cortes_stock
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create policy "cortes_stock_update_own" on cortes_stock
  for update using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- pedidos: select + update (aprobar/rechazar) para el dueño
create policy "pedidos_select_own" on pedidos
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create policy "pedidos_update_own" on pedidos
  for update using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- mensajes_whatsapp: solo lectura para el dueño (es un log, no se edita desde el panel)
create policy "mensajes_whatsapp_select_own" on mensajes_whatsapp
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- Nota: no se agregan policies de INSERT/DELETE para el rol "authenticated" a propósito.
-- Toda escritura de negocio (nuevo pedido, actualización de stock por audio, mensajes
-- entrantes) la hace el backend con la service_role key, que no pasa por estas políticas.
-- Esto evita que, aunque haya un bug en el frontend, un usuario logueado pueda escribir
-- datos directamente sin pasar por la lógica de negocio del servidor.

-- ============================================================
-- CARNICERÍA DE PRUEBA (Etapa 1 / sandbox de Twilio)
-- OJO: cada cuenta de Twilio recibe un número de sandbox propio
-- (Console → Messaging → Overview → Try out WhatsApp). Reemplazá
-- el número de abajo por el tuyo antes de correr este archivo.
-- ============================================================
insert into carnicerias (nombre, telefono_whatsapp)
values ('Carnicería de prueba', 'whatsapp:+17372508034')
on conflict (telefono_whatsapp) do nothing;
