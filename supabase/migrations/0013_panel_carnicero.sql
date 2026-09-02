-- Carnicom — Etapa 4: esquema del panel de gestión del carnicero.
-- Correr en Supabase → SQL Editor → New query → Run.
-- Requiere haber corrido antes hasta 0012 inclusive.
--
-- Agrega lo que el panel necesita y el esquema todavía no tenía:
--   1. Precio y umbral de stock bajo en `productos`, más de dónde vino el
--      último cambio de stock (audio vs panel).
--   2. Datos del negocio y estado de la conexión de WhatsApp en `carnicerias`.
--   3. Horarios de atención por día, con dos turnos, y días especiales.
--   4. Conversaciones (agrupador de `mensajes_whatsapp`) para el módulo de
--      mensajería del panel, con la ventana de 24 horas de Meta.
--   5. Notificaciones (la campanita).
--   6. Plantillas de Meta.
--
-- Criterio de RLS, igual que en todo el esquema: cada carnicería ve SOLO sus
-- propias filas. Se crean policies de SELECT para el rol autenticado (el panel
-- lee con la anon key + sesión del usuario, nunca con la service_role). Toda
-- escritura de negocio la sigue haciendo el backend con la service_role, tras
-- verificar a mano que el usuario es dueño de la carnicería — por eso no se
-- crean policies de INSERT/UPDATE/DELETE, misma decisión que en 0002 y 0008.

-- ============================================================
-- 1. PRODUCTOS — precio, umbral de stock bajo, origen del cambio
-- ============================================================

alter table productos
  add column if not exists precio numeric(12, 2),
  add column if not exists precio_actualizado_at timestamptz,
  add column if not exists umbral_stock_bajo numeric(10, 2),
  add column if not exists stock_origen text,
  add column if not exists notas_panel text;

comment on column productos.precio is
  'Precio por la unidad del producto (`unidad`: kg o unidad). Es un precio de LISTA: el total real de un pedido se define al pesar en el local, así que todo número que salga de acá es estimativo. Null = sin precio cargado.';

comment on column productos.umbral_stock_bajo is
  'Por debajo de este valor el producto se muestra como "poco" y genera aviso. Null = usar `carnicerias.umbral_stock_bajo_default`.';

comment on column productos.stock_origen is
  'De dónde vino el último cambio de `stock_actual`: audio (carga por voz del carnicero), panel (edición manual), pedido (descuento automático al aprobar un pedido).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'productos_stock_origen_check'
  ) then
    alter table productos
      add constraint productos_stock_origen_check
      check (stock_origen is null or stock_origen in ('audio', 'panel', 'pedido'));
  end if;
end $$;

create index if not exists productos_carniceria_activo_idx
  on productos (carniceria_id, activo);

-- ============================================================
-- 2. CARNICERIAS — datos del negocio, conexión de WhatsApp, preferencias
-- ============================================================

alter table carnicerias
  add column if not exists nombre_visible text,
  add column if not exists direccion text,
  add column if not exists telefono_contacto text,
  add column if not exists email_contacto text,
  add column if not exists umbral_stock_bajo_default numeric(10, 2) not null default 3,
  -- Proveedor de WhatsApp de ESTA carnicería. Permite migrar de Twilio a la
  -- API de Meta carnicería por carnicería, sin un corte global.
  add column if not exists whatsapp_proveedor text not null default 'twilio',
  -- Identificadores de la Cloud API de Meta. `phone_number_id` es lo que se
  -- usa en las llamadas a la API (NO el número telefónico) — un ID viejo
  -- apuntado en la config es la causa más común de "dejó de andar sin que
  -- nadie lo toque". Ver claude/meta_whatsapp_api_referencia.md.
  add column if not exists whatsapp_phone_number_id text,
  add column if not exists whatsapp_waba_id text,
  -- Coexistencia: la sincronización se corta si nadie abre la app de WhatsApp
  -- en el celular al menos una vez cada 14 días. Esta columna guarda cuándo se
  -- vio actividad por última vez en ese número, para poder avisar ANTES de que
  -- se corte. Es la falla más probable en producción y la más silenciosa.
  add column if not exists whatsapp_ultima_actividad_at timestamptz,
  add column if not exists whatsapp_conectado_at timestamptz,
  -- Qué hacen los horarios de atención con un pedido fuera de hora.
  --   hibrido      — el bot toma el pedido pero avisa que está fuera de horario
  --                  y ofrece los horarios disponibles (decisión del fundador,
  --                  30/08/2026).
  --   bloquea      — el bot no acepta horas de retiro fuera de horario.
  --   informativo  — los horarios son solo un dato que el bot menciona.
  add column if not exists horarios_modo text not null default 'hibrido';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carnicerias_whatsapp_proveedor_check') then
    alter table carnicerias
      add constraint carnicerias_whatsapp_proveedor_check
      check (whatsapp_proveedor in ('twilio', 'meta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'carnicerias_horarios_modo_check') then
    alter table carnicerias
      add constraint carnicerias_horarios_modo_check
      check (horarios_modo in ('hibrido', 'bloquea', 'informativo'));
  end if;
end $$;

comment on column carnicerias.whatsapp_phone_number_id is
  'Phone Number ID de la Cloud API de Meta. Se usa para enrutar el webhook entrante Y para mandar mensajes salientes. Es el identificador interno de Meta, no el número telefónico.';

-- ============================================================
-- 3. HORARIOS DE ATENCIÓN Y DÍAS ESPECIALES
-- ============================================================

-- Un día de la semana por fila, con hasta dos turnos — así trabaja la mayoría
-- de las carnicerías (mañana y tarde, con el mediodía cerrado).
-- dia_semana: 0=domingo ... 6=sábado (mismo criterio que Date.getDay()).
create table if not exists horarios_atencion (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  cerrado boolean not null default false,
  turno1_desde time,
  turno1_hasta time,
  turno2_desde time,
  turno2_hasta time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carniceria_id, dia_semana),
  -- Un turno está completo o no está: nunca a medias.
  constraint horarios_turno1_completo check (
    (turno1_desde is null and turno1_hasta is null)
    or (turno1_desde is not null and turno1_hasta is not null)
  ),
  constraint horarios_turno2_completo check (
    (turno2_desde is null and turno2_hasta is null)
    or (turno2_desde is not null and turno2_hasta is not null)
  ),
  -- No se puede tener turno tarde sin turno mañana.
  constraint horarios_turno2_requiere_turno1 check (
    turno2_desde is null or turno1_desde is not null
  )
);

-- Feriados y cierres puntuales. Pisan al horario semanal para esa fecha.
create table if not exists dias_especiales (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  fecha date not null,
  cerrado boolean not null default true,
  turno1_desde time,
  turno1_hasta time,
  turno2_desde time,
  turno2_hasta time,
  motivo text,
  created_at timestamptz not null default now(),
  unique (carniceria_id, fecha)
);

create index if not exists dias_especiales_fecha_idx
  on dias_especiales (carniceria_id, fecha);

-- ============================================================
-- 4. CONVERSACIONES — agrupador de `mensajes_whatsapp`
-- ============================================================
--
-- `mensajes_whatsapp` ya guarda todos los mensajes, pero sueltos. El módulo de
-- mensajería necesita agruparlos por interlocutor y, sobre todo, saber si la
-- ventana de 24 horas de Meta sigue abierta: dentro de ella se puede escribir
-- texto libre; fuera de ella SOLO se puede mandar una plantilla aprobada.
-- Si el panel deja escribir sin saber esto, el mensaje falla en el envío y el
-- carnicero cree que salió.
--
-- ⚠️ Nota honesta sobre los no leídos: con coexistencia el carnicero sigue
-- usando su app de WhatsApp en el celular. Un mensaje que él ya leyó ahí no
-- necesariamente se marca como leído acá. `no_leidos` es una aproximación útil,
-- no la verdad — la interfaz tiene que presentarlo como tal.
create table if not exists conversaciones (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  telefono text not null,                 -- mismo formato que mensajes_whatsapp.telefono_origen
  cliente_id uuid references clientes(id) on delete set null,
  es_carnicero boolean not null default false, -- true si el interlocutor es un número autorizado (numeros_carnicero)
  ultimo_mensaje_at timestamptz,
  ultimo_mensaje_direccion text check (ultimo_mensaje_direccion in ('entrante', 'saliente')),
  ultimo_mensaje_preview text,
  -- Se recalcula con cada mensaje ENTRANTE del interlocutor: created_at + 24h.
  ventana_24h_vence_at timestamptz,
  no_leidos integer not null default 0,
  leido_hasta_at timestamptz,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carniceria_id, telefono)
);

create index if not exists conversaciones_recientes_idx
  on conversaciones (carniceria_id, ultimo_mensaje_at desc);

-- Columnas nuevas en el log de mensajes, para poder armar el hilo.
alter table mensajes_whatsapp
  add column if not exists conversacion_id uuid references conversaciones(id) on delete set null,
  add column if not exists pedido_id uuid references pedidos(id) on delete set null,
  -- Quién originó el mensaje saliente. Con coexistencia, un mensaje puede
  -- salir del bot, del panel, o de la app de WhatsApp del propio carnicero
  -- (Meta lo espeja al webhook). Distinguirlos es lo que hace legible el hilo.
  add column if not exists origen text,
  add column if not exists estado_envio text,
  add column if not exists error_mensaje text,
  -- ID del mensaje del lado del proveedor (wamid de Meta, SID de Twilio).
  -- Sirve para enganchar los avisos de estado (entregado/leído) que llegan
  -- después por el webhook.
  add column if not exists proveedor_mensaje_id text,
  add column if not exists plantilla_nombre text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensajes_whatsapp_origen_check') then
    alter table mensajes_whatsapp
      add constraint mensajes_whatsapp_origen_check
      check (origen is null or origen in ('cliente', 'bot', 'panel', 'app_whatsapp'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensajes_whatsapp_estado_envio_check') then
    alter table mensajes_whatsapp
      add constraint mensajes_whatsapp_estado_envio_check
      check (estado_envio is null or estado_envio in ('pendiente', 'enviado', 'entregado', 'leido', 'fallido'));
  end if;
end $$;

-- El tipo de mensaje venía limitado a texto/audio/otro. Con la API de Meta
-- llegan también imágenes, documentos y stickers, y el panel manda plantillas.
alter table mensajes_whatsapp drop constraint if exists mensajes_whatsapp_tipo_check;
alter table mensajes_whatsapp
  add constraint mensajes_whatsapp_tipo_check
  check (tipo in ('texto', 'audio', 'imagen', 'documento', 'video', 'sticker', 'ubicacion', 'plantilla', 'otro'));

create index if not exists mensajes_whatsapp_hilo_idx
  on mensajes_whatsapp (conversacion_id, created_at);

create index if not exists mensajes_whatsapp_proveedor_id_idx
  on mensajes_whatsapp (proveedor_mensaje_id)
  where proveedor_mensaje_id is not null;

-- ============================================================
-- 5. NOTIFICACIONES (la campanita)
-- ============================================================
--
-- Regla de producto: cada aviso lleva a la pantalla donde SE RESUELVE, y no se
-- satura. Un centro de notificaciones con cincuenta avisos irrelevantes se
-- vuelve invisible en una semana — por eso hay `clave_unicidad`, que evita
-- generar el mismo aviso dos veces (ej. "sin stock de asado" una sola vez por
-- vez que el producto se queda sin stock, no en cada consulta del bot).
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  tipo text not null check (tipo in (
    'pedido_pendiente',      -- pedido nuevo esperando aprobación
    'stock_agotado',         -- un producto se quedó sin stock
    'stock_bajo',            -- un producto quedó por debajo del umbral
    'cliente_no_retiro',     -- un cliente no retiró un pedido
    'whatsapp_desconectado', -- la coexistencia se cortó
    'whatsapp_por_vencer',   -- faltan pocos días para que se corte
    'plantilla_aprobada',
    'plantilla_rechazada'
  )),
  titulo text not null,
  cuerpo text,
  enlace text,               -- ruta del panel donde se resuelve, ej "/panel/pedidos/<id>"
  entidad_tipo text,         -- 'pedido' | 'producto' | 'cliente' | 'plantilla'
  entidad_id uuid,
  -- Evita duplicados del mismo aviso. Ej: "stock_agotado:<producto_id>".
  clave_unicidad text,
  leida_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notificaciones_no_leidas_idx
  on notificaciones (carniceria_id, created_at desc)
  where leida_at is null;

create unique index if not exists notificaciones_clave_unicidad_idx
  on notificaciones (carniceria_id, clave_unicidad)
  where clave_unicidad is not null and leida_at is null;

-- ============================================================
-- 6. PLANTILLAS DE META
-- ============================================================
--
-- Modelo CENTRALIZADO para v1 (decisión pendiente 4.3 del brief): las
-- plantillas del sistema las crea y mantiene la plataforma, iguales para todas
-- las carnicerías, y el panel solo MUESTRA cuáles hay y en qué estado de
-- aprobación están. Por eso `carniceria_id` puede ser null: una fila con
-- carniceria_id null es una plantilla del sistema, visible para todas.
--
-- ⚠️ Si más adelante se habilita que cada carnicería escriba las suyas, hace
-- falta validar la categoría antes de mandarla a aprobar: una plantilla con
-- lenguaje promocional enviada como "utility" la recategoriza Meta como
-- marketing y pasa a costar cinco veces más.
create table if not exists plantillas_meta (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid references carnicerias(id) on delete cascade, -- null = plantilla del sistema
  nombre text not null,          -- nombre en Meta, minúsculas y guiones bajos
  idioma text not null default 'es_AR',
  categoria text not null check (categoria in ('utility', 'marketing', 'authentication')),
  encabezado text,
  cuerpo text not null,
  pie text,
  -- Descripción de los parámetros {{1}}, {{2}}... para poder mostrar la vista
  -- previa con valores de ejemplo: [{ "posicion": 1, "descripcion": "hora de retiro", "ejemplo": "18:30" }]
  variables jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in (
    'borrador', 'pendiente', 'aprobada', 'rechazada', 'pausada', 'deshabilitada'
  )),
  motivo_rechazo text,
  meta_template_id text,
  es_del_sistema boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carniceria_id, nombre, idioma)
);

-- La restricción unique de arriba no alcanza para las plantillas del sistema:
-- en Postgres dos NULL se consideran distintos entre sí, así que
-- (null, 'recordatorio_retiro', 'es_AR') no choca con otra fila igual y la
-- migración correría dos veces sin quejarse. Este índice parcial cubre ese caso.
create unique index if not exists plantillas_meta_sistema_idx
  on plantillas_meta (nombre, idioma)
  where carniceria_id is null;

-- ============================================================
-- 7. PEDIDOS — total estimado y origen
-- ============================================================
--
-- El módulo de caja necesita un total. Como los precios de lista cambian, se
-- congela el total al momento de aprobar el pedido: si mañana sube el precio
-- del asado, el pedido de ayer no cambia de valor retroactivamente.
--
-- ⚠️ Es un ESTIMADO: el precio final se determina al pesar en el local. Toda
-- pantalla que muestre este número tiene que decirlo.
alter table pedidos
  add column if not exists total_estimado numeric(12, 2),
  add column if not exists origen text not null default 'bot',
  add column if not exists nota_interna text,
  add column if not exists decidido_por uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_origen_check') then
    alter table pedidos
      add constraint pedidos_origen_check check (origen in ('bot', 'panel'));
  end if;
end $$;

comment on column pedidos.total_estimado is
  'Suma de cantidad * precio de lista al momento de aprobar. ESTIMADO: el total real se define al pesar. Null = algún producto no tenía precio cargado.';

create index if not exists pedidos_historial_idx
  on pedidos (carniceria_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY — toda tabla nueva, desde el momento de crearla
-- ============================================================

alter table horarios_atencion enable row level security;
alter table dias_especiales enable row level security;
alter table conversaciones enable row level security;
alter table notificaciones enable row level security;
alter table plantillas_meta enable row level security;

drop policy if exists "horarios_atencion_select_own" on horarios_atencion;
create policy "horarios_atencion_select_own" on horarios_atencion
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "dias_especiales_select_own" on dias_especiales;
create policy "dias_especiales_select_own" on dias_especiales
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "conversaciones_select_own" on conversaciones;
create policy "conversaciones_select_own" on conversaciones
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

drop policy if exists "notificaciones_select_own" on notificaciones;
create policy "notificaciones_select_own" on notificaciones
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- Plantillas: las del sistema (carniceria_id null) las ve cualquier carnicería
-- autenticada; las propias, solo su dueño.
drop policy if exists "plantillas_meta_select_own" on plantillas_meta;
create policy "plantillas_meta_select_own" on plantillas_meta
  for select using (
    carniceria_id is null
    or carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- `numeros_carnicero` ya tenía RLS y policy de select desde 0007 — el panel la
-- usa para mostrar quién está autorizado a cargar stock por audio.

-- ============================================================
-- 8. HORARIOS POR DEFECTO PARA LAS CARNICERÍAS QUE YA EXISTEN
-- ============================================================
--
-- Sin filas en `horarios_atencion` el panel no tiene nada que mostrar. Se
-- siembra un horario típico de carnicería de barrio (mañana y tarde, domingo
-- cerrado) que el carnicero después corrige desde Configuración. Son valores
-- por defecto razonables, NO datos confirmados de la carnicería piloto.
insert into horarios_atencion (carniceria_id, dia_semana, cerrado, turno1_desde, turno1_hasta, turno2_desde, turno2_hasta)
select c.id, d.dia,
       d.dia = 0,                                          -- domingo cerrado
       case when d.dia = 0 then null else time '08:00' end,
       case when d.dia = 0 then null else time '13:00' end,
       case when d.dia = 0 then null else time '17:00' end,
       case when d.dia = 0 then null else time '20:30' end
from carnicerias c
cross join (select generate_series(0, 6) as dia) d
on conflict (carniceria_id, dia_semana) do nothing;

-- Nombre visible por defecto = el nombre que ya tenía la carnicería.
update carnicerias set nombre_visible = nombre where nombre_visible is null;

-- ============================================================
-- 9. CONVERSACIONES PARA LOS MENSAJES QUE YA ESTÁN GUARDADOS
-- ============================================================
--
-- `mensajes_whatsapp` ya tiene historial de las pruebas de las Etapas 1 a 3.
-- Se arman las conversaciones a partir de él para que el módulo de mensajería
-- no arranque vacío. El interlocutor de un mensaje es el origen si es
-- entrante, y el destino si es saliente.
insert into conversaciones (carniceria_id, telefono, ultimo_mensaje_at, ultimo_mensaje_direccion, ultimo_mensaje_preview)
select
  m.carniceria_id,
  m.interlocutor,
  max(m.created_at),
  (array_agg(m.direccion order by m.created_at desc))[1],
  left((array_agg(coalesce(m.cuerpo, '') order by m.created_at desc))[1], 120)
from (
  select
    carniceria_id,
    case when direccion = 'entrante' then telefono_origen else telefono_destino end as interlocutor,
    direccion,
    cuerpo,
    created_at
  from mensajes_whatsapp
  where carniceria_id is not null
) m
group by m.carniceria_id, m.interlocutor
on conflict (carniceria_id, telefono) do nothing;

update mensajes_whatsapp m
set conversacion_id = c.id
from conversaciones c
where m.conversacion_id is null
  and m.carniceria_id = c.carniceria_id
  and c.telefono = case when m.direccion = 'entrante' then m.telefono_origen else m.telefono_destino end;

-- Marcar como conversaciones del carnicero las que corresponden a un número
-- autorizado — en el panel se muestran aparte de las de clientes.
update conversaciones c
set es_carnicero = true
where exists (
  select 1 from numeros_carnicero n
  where n.carniceria_id = c.carniceria_id
    and n.telefono = c.telefono
);

-- Enganchar cada conversación de cliente con su ficha de cliente.
update conversaciones c
set cliente_id = cl.id
from clientes cl
where c.cliente_id is null
  and cl.carniceria_id = c.carniceria_id
  and cl.telefono = c.telefono;

-- ============================================================
-- 10. PLANTILLAS DEL SISTEMA (modelo centralizado)
-- ============================================================
--
-- Se cargan como 'borrador': todavía no están creadas en Meta. Cuando se
-- manden a aprobar, el estado pasa a 'pendiente' y después a 'aprobada' o
-- 'rechazada' según responda Meta.
insert into plantillas_meta (carniceria_id, nombre, idioma, categoria, cuerpo, variables, estado, es_del_sistema)
select null::uuid, v.nombre, v.idioma, v.categoria, v.cuerpo, v.variables, 'borrador', true
from (
  values
    (
      'recordatorio_retiro',
      'es_AR',
      'utility',
      'Hola {{1}}, te recordamos que tu pedido te espera hoy a las {{2}}hs para que lo retires. ¡Gracias!',
      '[{"posicion":1,"descripcion":"nombre del cliente","ejemplo":"Joaquín"},{"posicion":2,"descripcion":"hora de retiro","ejemplo":"18:30"}]'::jsonb
    ),
    (
      'pedido_confirmado',
      'es_AR',
      'utility',
      'Tu pedido en {{1}} quedó confirmado. Te esperamos a las {{2}}hs para que lo retires.',
      '[{"posicion":1,"descripcion":"nombre de la carnicería","ejemplo":"Carnicería del Centro"},{"posicion":2,"descripcion":"hora de retiro","ejemplo":"18:30"}]'::jsonb
    ),
    (
      'pedido_listo',
      'es_AR',
      'utility',
      'Hola {{1}}, tu pedido ya está listo para retirar.',
      '[{"posicion":1,"descripcion":"nombre del cliente","ejemplo":"Joaquín"}]'::jsonb
    )
) as v(nombre, idioma, categoria, cuerpo, variables)
where not exists (
  select 1 from plantillas_meta p
  where p.carniceria_id is null and p.nombre = v.nombre and p.idioma = v.idioma
);
