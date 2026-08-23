-- Carnicom — Etapa 3, Paso 0: separar "el carnicero" de "cualquier otro número".
-- Correr en Supabase → SQL Editor → New query → Run.
--
-- Hoy CUALQUIER número que le escriba al WhatsApp de la carnicería entra al
-- flujo de stock (procesarAudioDeStock / procesarTextoEntrante). Antes de
-- exponer ese mismo número a clientes reales (Etapa 3), hace falta poder
-- distinguir "es el carnicero" de "es un cliente".
--
-- Se eligió una tabla de números autorizados (en vez de un único campo en
-- `carnicerias`) para soportar más de un empleado por carnicería sin
-- rediseñar esto de nuevo más adelante — el roadmap detallado de Etapa 3
-- dejaba abierta esta pregunta y esta es la opción que no cierra puertas.
create table if not exists numeros_carnicero (
  id uuid primary key default gen_random_uuid(),
  carniceria_id uuid not null references carnicerias(id) on delete cascade,
  telefono text not null, -- mismo formato que mensajes_whatsapp.telefono_origen, ej "whatsapp:+549XXXXXXXXXX"
  nombre text,            -- opcional, para identificar de un vistazo si hay varios empleados
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (carniceria_id, telefono)
);

alter table numeros_carnicero enable row level security;

create policy "numeros_carnicero_select_own" on numeros_carnicero
  for select using (
    carniceria_id in (select id from carnicerias where owner_user_id = auth.uid())
  );

-- ============================================================
-- CARGAR EL NÚMERO REAL DEL CARNICERO — REEMPLAZAR ANTES DE CORRER
-- ============================================================
-- Reemplazá 'whatsapp:+549XXXXXXXXXX' por el número real desde el que
-- probás/cargás stock (con el prefijo "whatsapp:" tal como lo guarda
-- mensajes_whatsapp.telefono_origen — podés confirmarlo mirando esa tabla
-- o el endpoint /api/debug/twilio-logs).
--
-- Sin esta fila, TODOS los mensajes entrantes (incluido el tuyo) van a
-- caer en el flujo de PEDIDOS a partir de este cambio, no en el de stock.
insert into numeros_carnicero (carniceria_id, telefono, nombre)
select id, 'whatsapp:+549XXXXXXXXXX', 'Carnicero'
from carnicerias
where telefono_whatsapp = 'whatsapp:+14155238886'
on conflict (carniceria_id, telefono) do nothing;
