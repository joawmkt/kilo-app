-- Ainnova / KILO — Etapa 4b: modo simulado y datos del alta de carnicerías.
-- Correr en Supabase → SQL Editor → New query → Run.
-- Requiere haber corrido antes hasta 0013 inclusive.
--
-- Dos cosas, las dos para poder trabajar ANTES de tener la verificación de Meta:
--
--   1. Un tercer proveedor de WhatsApp, `simulado`, que no llama a ninguna API.
--      Deja probar el flujo completo — cliente escribe, el bot arma el pedido,
--      el carnicero aprueba, el cliente recibe la confirmación — con datos
--      propios y reales en la base, sin Twilio y sin Meta. El día que llegue la
--      verificación se cambia una columna y el mismo código pasa a hablar con
--      Meta de verdad.
--
--   2. Lo que devuelve el alta con Embedded Signup (token de la carnicería,
--      quién la dio de alta, cuándo), más el rol de administrador para el panel
--      del fundador.

-- ============================================================
-- 1. PROVEEDOR SIMULADO
-- ============================================================

alter table carnicerias drop constraint if exists carnicerias_whatsapp_proveedor_check;
alter table carnicerias
  add constraint carnicerias_whatsapp_proveedor_check
  check (whatsapp_proveedor in ('twilio', 'meta', 'simulado'));

comment on column carnicerias.whatsapp_proveedor is
  'Por dónde habla esta carnicería: twilio (el BSP con el que arrancó el proyecto), meta (la Cloud API, el destino) o simulado (nada sale a internet; sirve para probar el flujo entero sin trámites). Se cambia carnicería por carnicería, así la migración no es un apagón.';

-- ============================================================
-- 2. CREDENCIALES QUE DEVUELVE EL ALTA
-- ============================================================
--
-- Con Twilio había UNA credencial para todo. Con Meta cada carnicería trae la
-- suya, y el sistema tiene que saber con cuál firmar cada mensaje saliente.
--
-- ⚠️ `whatsapp_token` es un secreto y NUNCA puede llegar al navegador. No hay
-- policy de select para el rol autenticado sobre esta columna (las policies son
-- por fila, no por columna), así que el panel del carnicero JAMÁS debe hacer
-- `select *` sobre `carnicerias`: las consultas nombran las columnas una por una
-- (ver src/lib/panel/sesion.ts). El token solo se lee del lado del servidor con
-- la service_role.
alter table carnicerias
  add column if not exists whatsapp_token text,
  add column if not exists whatsapp_token_actualizado_at timestamptz,
  -- Estado del alta, para poder mostrar en qué punto quedó cada carnicería.
  add column if not exists alta_estado text not null default 'pendiente',
  add column if not exists alta_completada_at timestamptz,
  -- Si los webhooks de esa cuenta quedaron suscritos. Sin este paso los
  -- mensajes de la carnicería NUNCA llegan, aunque el alta figure exitosa —
  -- es el error más silencioso de todo el proceso de Meta.
  add column if not exists webhooks_suscritos_at timestamptz,
  add column if not exists notas_internas text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carnicerias_alta_estado_check') then
    alter table carnicerias
      add constraint carnicerias_alta_estado_check
      check (alta_estado in ('pendiente', 'conectando', 'conectada', 'error'));
  end if;
end $$;

comment on column carnicerias.whatsapp_token is
  'Token de acceso permanente DE ESTA CARNICERÍA, obtenido al canjear el código de un solo uso del Embedded Signup. Secreto: solo se lee del lado del servidor.';

-- ============================================================
-- 3. ADMINISTRADORES DE LA PLATAFORMA
-- ============================================================
--
-- El panel del carnicero muestra una carnicería. El panel de administración
-- muestra todas, así que necesita su propia autorización: no alcanza con estar
-- logueado.
--
-- Se resuelve con una tabla y no con una columna booleana en `auth.users`
-- porque esa tabla es de Supabase y conviene no tocarla.
create table if not exists administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  creado_at timestamptz not null default now()
);

alter table administradores enable row level security;

-- Un administrador puede ver su propia fila (así el panel sabe si mostrarse).
-- No puede listar a los demás desde el cliente.
drop policy if exists "administradores_select_propia" on administradores;
create policy "administradores_select_propia" on administradores
  for select using (user_id = auth.uid());

-- ============================================================
-- 4. USO POR CARNICERÍA — para el costo variable
-- ============================================================
--
-- Punto F3 del plan de producción: "instrumentar el conteo desde el primer
-- día. Sin eso el precio del tier es una adivinanza."
--
-- Se cuenta por mes y por carnicería. Los mensajes se pueden derivar de
-- `mensajes_whatsapp`, pero los minutos de audio transcriptos y los tokens de
-- interpretación no quedan en ningún lado — por eso esta tabla.
create table if not exists uso_mensual (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  -- Primer día del mes, para que la clave sea estable.
  periodo date not null,
  mensajes_enviados integer not null default 0,
  mensajes_recibidos integer not null default 0,
  plantillas_enviadas integer not null default 0,
  audios_transcriptos integer not null default 0,
  segundos_audio integer not null default 0,
  interpretaciones integer not null default 0,
  actualizado_at timestamptz not null default now(),
  unique (carniceria_id, periodo)
);

alter table uso_mensual enable row level security;

drop policy if exists "uso_mensual_select_own" on uso_mensual;
create policy "uso_mensual_select_own" on uso_mensual
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

create index if not exists uso_mensual_periodo_idx on uso_mensual (periodo desc);

-- ============================================================
-- 5. SUMAR UNA UNIDAD DE USO, SIN CARRERAS
-- ============================================================
--
-- Dos mensajes que entran a la vez no pueden pisarse el contador. Un
-- `insert ... on conflict do update` con expresión relativa lo resuelve en una
-- sola sentencia atómica, que es más barato y más seguro que leer y escribir
-- desde el código.
create or replace function sumar_uso(
  p_carniceria_id uuid,
  p_campo text,
  p_cantidad integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date;
begin
  if p_campo not in (
    'mensajes_enviados', 'mensajes_recibidos', 'plantillas_enviadas',
    'audios_transcriptos', 'segundos_audio', 'interpretaciones'
  ) then
    raise exception 'Campo de uso desconocido: %', p_campo;
  end if;

  insert into uso_mensual (carniceria_id, periodo)
  values (p_carniceria_id, v_periodo)
  on conflict (carniceria_id, periodo) do nothing;

  execute format(
    'update uso_mensual set %I = %I + $1, actualizado_at = now()
       where carniceria_id = $2 and periodo = $3',
    p_campo, p_campo
  ) using p_cantidad, p_carniceria_id, v_periodo;
end;
$$;

revoke all on function sumar_uso(uuid, text, integer) from public;
