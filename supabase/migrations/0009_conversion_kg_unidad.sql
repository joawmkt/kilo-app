-- Carnicom — Etapa 3, Paso 2: factor de conversión kg <-> unidad.
-- Correr en Supabase → SQL Editor → New query → Run.
--
-- El carnicero carga milanesas por kg (así se pesan y se cargan en stock),
-- pero un cliente las puede pedir por unidad ("dame 4 milanesas"). Para
-- poder convertir el pedido del cliente a kg y descontar el stock real,
-- cada producto que se vende por unidad pero se stockea en kg necesita un
-- peso aproximado por pieza.
alter table productos
  add column if not exists peso_aproximado_unidad_kg numeric(6, 3);

comment on column productos.peso_aproximado_unidad_kg is
  'Solo aplica a productos con unidad=kg que el cliente puede pedir por unidad (ej. milanesas). Null = no aplica / no se pide por unidad.';

-- ============================================================
-- VALORES PROVISORIOS — están puestos para no bloquear el desarrollo,
-- pero son estimaciones mías, no confirmadas por el fundador (pregunta 6
-- del Bloque A de claude/etapa3_roadmap_detallado.md sigue abierta).
-- Ajustar estos números (o directamente los productos a los que aplica)
-- en cuanto haya una respuesta real de la carnicería piloto:
--   UPDATE productos SET peso_aproximado_unidad_kg = 0.XXX
--   WHERE carniceria_id = '...' AND codigo = '...';
-- ============================================================
update productos
set peso_aproximado_unidad_kg = case codigo
  when 'milanesa_de_pollo' then 0.150
  when 'milanesa_de_cerdo' then 0.150
  when 'milanesa_de_carne' then 0.180
  when 'milanesa_de_nalga' then 0.180
  when 'milanesa_de_cuadrada' then 0.180
  when 'milanesa_de_bola' then 0.180
  else peso_aproximado_unidad_kg
end
where codigo in (
  'milanesa_de_pollo',
  'milanesa_de_cerdo',
  'milanesa_de_carne',
  'milanesa_de_nalga',
  'milanesa_de_cuadrada',
  'milanesa_de_bola'
);
