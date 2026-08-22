-- Carnicom — Etapa 2: catálogo real (productos + sinónimos + términos ambiguos)
-- Correr en Supabase → SQL Editor → New query → Run.
-- Requiere haber corrido antes supabase/schema.sql (Etapa 1).
--
-- Reemplaza `cortes_stock` (tabla simple de Etapa 1, sin uso real todavía)
-- por un modelo más rico que soporta sinónimos y desambiguación, tal como
-- lo pide la especificación funcional del catálogo (carnicom_catalogo_estructurado_v0.3.md).

-- ============================================================
-- Baja de cortes_stock (Etapa 1) — no tiene datos reales todavía,
-- así que no hace falta migrar filas.
-- ============================================================
drop table if exists cortes_stock;

-- ============================================================
-- TABLA: productos
-- Catálogo real de la carnicería: un producto = una fila.
-- `codigo` es el identificador estable (slug) que usa el resto del
-- sistema (interpretación por IA, panel de stock, etc.).
-- ============================================================
create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  codigo text not null,                -- slug canónico, ej "asado", "bife_ancho"
  nombre_display text not null,        -- nombre prolijo para mostrar, ej "Asado"
  familia text not null,               -- ej "vacuno_parrilla", "pollo", "embutidos"
  es_complementario boolean not null default false,
  unidad text not null default 'kg'
    check (unidad in ('kg', 'unidad', 'docena', 'bolsa')),
  activo boolean not null default true,
  stock_actual numeric(10, 2) not null default 0,
  stock_actualizado_at timestamptz,
  notas text,
  created_at timestamptz not null default now(),
  unique (carniceria_id, codigo)
);

-- ============================================================
-- TABLA: producto_sinonimos
-- Vocabulario que mapea, sin ambigüedad, a un producto puntual.
-- Ej: "tira de asado", "costilla" → producto "asado".
-- ============================================================
create table if not exists producto_sinonimos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now(),
  unique (producto_id, texto)
);

create index if not exists producto_sinonimos_texto_idx on producto_sinonimos (texto);

-- ============================================================
-- TABLA: terminos_ambiguos
-- Expresiones que el bot NO debe resolver solo (ej. "tapa", "picada",
-- "bife" dichos sin calificador) — hay que preguntar cuál de los
-- productos candidatos (`opciones_codigos`, en `productos.codigo`) es.
-- ============================================================
create table if not exists terminos_ambiguos (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  texto text not null,
  pregunta text not null,
  opciones_codigos text[] not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (carniceria_id, texto)
);

-- ============================================================
-- TABLA: operaciones_stock
-- Máquina de estados "INTERPRETAR → VALIDAR → CONFIRMAR → EJECUTAR"
-- (especificación "Botonera de confirmación por WhatsApp", 22/08/2026).
-- Como el sandbox de Twilio no soporta botones interactivos reales
-- (confirmado con el fundador — cada carnicería necesitaría su propio
-- número de WhatsApp Business verificado por Meta para tenerlos), el
-- canal de confirmación es TEXTO por ahora ("confirmar"/"modificar"),
-- con la misma máquina de estados. Migrar a botones reales más
-- adelante no debería requerir cambiar esta tabla.
--
-- Un mensaje puede mencionar más de un producto ("15 de asado y 10 de
-- vacío") — se guarda como UNA sola operación con varios `items`, y se
-- confirma/ejecuta todo junto de forma atómica (nunca parcial).
--
-- Estados:
--   pendiente_aclaracion    — falta resolver una ambigüedad o un dato
--                              (cantidad/producto) antes de poder armar
--                              el resumen. `pregunta_pendiente` tiene la
--                              pregunta hecha; `items` puede tener
--                              productos ya resueltos de ese mismo mensaje.
--   pendiente_confirmacion  — ya se armó el resumen completo, esperando
--                              que el carnicero responda "confirmar" o
--                              "modificar" (o texto libre equivalente).
--   pendiente_modificacion  — el carnicero pidió modificar; esperando
--                              que diga qué corregir.
--   confirmado / ejecutado  — el cambio de stock ya se aplicó. Se
--                              distinguen para poder auditar, pero la
--                              transición a ambos ocurre en el mismo
--                              paso atómico (ver README, sección Etapa 2).
--   cancelado                — el carnicero decidió no cargar nada.
--   vencido                  — pasó `expires_at` sin confirmarse
--                              (chequeo perezoso al leer la fila, no hay
--                              un cron corriendo en background todavía).
-- ============================================================
create table if not exists operaciones_stock (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  telefono text not null,                -- número del carnicero (identifica la conversación)
  mensaje_whatsapp_id uuid references mensajes_whatsapp(id) on delete set null, -- mensaje que originó la operación
  estado text not null default 'pendiente_aclaracion'
    check (estado in (
      'pendiente_aclaracion',
      'pendiente_confirmacion',
      'pendiente_modificacion',
      'confirmado',
      'ejecutado',
      'cancelado',
      'vencido'
    )),
  transcripcion text,                    -- último texto/audio relevante de esta operación
  interpretacion jsonb,                  -- última salida cruda de la IA (debug/auditoría)
  pregunta_pendiente text,               -- pregunta de aclaración, dato faltante, o "¿qué querés modificar?"
  items jsonb not null default '[]'::jsonb,
    -- [{ producto_id, producto_codigo, nombre_display, accion, cantidad, unidad, confidence }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz
);

create index if not exists operaciones_stock_pendientes_idx
  on operaciones_stock (carniceria_id, telefono, estado)
  where estado in ('pendiente_aclaracion', 'pendiente_confirmacion', 'pendiente_modificacion');

-- ============================================================
-- ROW LEVEL SECURITY
-- Mismo criterio que el resto del esquema: el dueño de la carnicería
-- puede leer sus propias filas desde el panel (anon key + sesión).
-- Toda escritura de negocio la hace el backend con la service_role key.
-- ============================================================

alter table productos enable row level security;
alter table producto_sinonimos enable row level security;
alter table terminos_ambiguos enable row level security;
alter table operaciones_stock enable row level security;

create policy "productos_select_own" on productos
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create policy "productos_update_own" on productos
  for update using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create policy "producto_sinonimos_select_own" on producto_sinonimos
  for select using (
    producto_id in (
      select id from productos where carniceria_id in (
        select id from carnicerias where owner_user_id = auth.uid()
      )
    )
  );

create policy "terminos_ambiguos_select_own" on terminos_ambiguos
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create policy "operaciones_stock_select_own" on operaciones_stock
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );
