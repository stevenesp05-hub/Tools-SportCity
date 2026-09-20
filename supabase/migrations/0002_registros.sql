-- Motor de Registros: colecciones configurables tipo Airtable/Notion.

-- El campo tipo "persona" necesita poder listar a todo el staff para el selector,
-- no solo el propio perfil (la policy de 0001 solo permitía verse a uno mismo).
create policy "profiles: ver a todos si estás logueado" on public.profiles
  for select using (auth.uid() is not null);

create type public.field_type as enum (
  'text', 'textarea', 'number', 'currency', 'date', 'select', 'checkbox', 'relation', 'person'
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  icon text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.collection_fields (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  key text not null,
  label text not null,
  type public.field_type not null,
  -- select: [{ "value": "x", "label": "X" }]; relation: { "collectionKey": "empresas" }
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  is_title boolean not null default false,
  position int not null default 0,
  unique (collection_id, key)
);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index records_collection_id_idx on public.records (collection_id) where deleted_at is null;

alter table public.collections enable row level security;
alter table public.collection_fields enable row level security;
alter table public.records enable row level security;

create policy "collections: ver si estás logueado" on public.collections
  for select using (auth.uid() is not null);

create policy "collection_fields: ver si estás logueado" on public.collection_fields
  for select using (auth.uid() is not null);

create policy "records: ver si estás logueado" on public.records
  for select using (auth.uid() is not null);

create policy "records: crear admin/gestor" on public.records
  for insert with check (public.auth_role() in ('admin', 'gestor_general'));

create policy "records: editar admin/gestor" on public.records
  for update using (public.auth_role() in ('admin', 'gestor_general'));

create policy "records: eliminar admin" on public.records
  for delete using (public.auth_role() = 'admin');

-- ---------- Seeds: colecciones iniciales ----------

insert into public.collections (key, name, icon, position) values
  ('proveedores', 'Proveedores', 'truck', 1),
  ('empresas', 'Empresas', 'building', 2),
  ('presupuestos', 'Presupuestos', 'wallet', 3),
  ('costos', 'Costos', 'circle-dollar-sign', 4),
  ('cuentas-por-pagar', 'Cuentas por pagar', 'wallet', 5),
  ('facturas', 'Facturas', 'receipt', 6),
  ('organigrama', 'Organigrama', 'network', 7);

-- Proveedores
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'nombre', 'Nombre', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'proveedores'
union all
select id, 'ruc_cedula', 'RUC / Cédula', 'text'::field_type, '[]'::jsonb, false, false, 2 from public.collections where key = 'proveedores'
union all
select id, 'contacto', 'Persona de contacto', 'text'::field_type, '[]'::jsonb, false, false, 3 from public.collections where key = 'proveedores'
union all
select id, 'telefono', 'Teléfono', 'text'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'proveedores'
union all
select id, 'correo', 'Correo', 'text'::field_type, '[]'::jsonb, false, false, 5 from public.collections where key = 'proveedores'
union all
select id, 'categoria', 'Categoría', 'select'::field_type, '[{"value":"insumos","label":"Insumos"},{"value":"servicios","label":"Servicios"},{"value":"mantenimiento","label":"Mantenimiento"},{"value":"otro","label":"Otro"}]'::jsonb, false, false, 6 from public.collections where key = 'proveedores'
union all
select id, 'estado', 'Estado', 'select'::field_type, '[{"value":"activo","label":"Activo"},{"value":"inactivo","label":"Inactivo"}]'::jsonb, false, false, 7 from public.collections where key = 'proveedores';

-- Empresas
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'nombre', 'Nombre', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'empresas'
union all
select id, 'ruc', 'RUC', 'text'::field_type, '[]'::jsonb, false, false, 2 from public.collections where key = 'empresas'
union all
select id, 'tipo', 'Tipo', 'select'::field_type, '[{"value":"cliente","label":"Cliente"},{"value":"aliado","label":"Aliado"},{"value":"proveedor_externo","label":"Proveedor externo"}]'::jsonb, false, false, 3 from public.collections where key = 'empresas'
union all
select id, 'telefono', 'Teléfono', 'text'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'empresas'
union all
select id, 'correo', 'Correo', 'text'::field_type, '[]'::jsonb, false, false, 5 from public.collections where key = 'empresas'
union all
select id, 'notas', 'Notas', 'textarea'::field_type, '[]'::jsonb, false, false, 6 from public.collections where key = 'empresas';

-- Presupuestos
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'nombre', 'Nombre', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'presupuestos'
union all
select id, 'monto', 'Monto', 'currency'::field_type, '[]'::jsonb, true, false, 2 from public.collections where key = 'presupuestos'
union all
select id, 'categoria', 'Categoría', 'text'::field_type, '[]'::jsonb, false, false, 3 from public.collections where key = 'presupuestos'
union all
select id, 'responsable', 'Responsable', 'person'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'presupuestos'
union all
select id, 'fecha', 'Fecha', 'date'::field_type, '[]'::jsonb, false, false, 5 from public.collections where key = 'presupuestos'
union all
select id, 'estado', 'Estado', 'select'::field_type, '[{"value":"pendiente","label":"Pendiente"},{"value":"aprobado","label":"Aprobado"},{"value":"rechazado","label":"Rechazado"}]'::jsonb, true, false, 6 from public.collections where key = 'presupuestos';

-- Costos
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'concepto', 'Concepto', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'costos'
union all
select id, 'monto', 'Monto', 'currency'::field_type, '[]'::jsonb, true, false, 2 from public.collections where key = 'costos'
union all
select id, 'categoria', 'Categoría', 'text'::field_type, '[]'::jsonb, false, false, 3 from public.collections where key = 'costos'
union all
select id, 'fecha', 'Fecha', 'date'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'costos'
union all
select id, 'responsable', 'Responsable', 'person'::field_type, '[]'::jsonb, false, false, 5 from public.collections where key = 'costos';

-- Cuentas por pagar
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'concepto', 'Concepto', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'cuentas-por-pagar'
union all
select id, 'proveedor', 'Proveedor', 'relation'::field_type, '{"collectionKey":"proveedores"}'::jsonb, false, false, 2 from public.collections where key = 'cuentas-por-pagar'
union all
select id, 'monto', 'Monto', 'currency'::field_type, '[]'::jsonb, true, false, 3 from public.collections where key = 'cuentas-por-pagar'
union all
select id, 'fecha_vencimiento', 'Fecha de vencimiento', 'date'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'cuentas-por-pagar'
union all
select id, 'estado', 'Estado', 'select'::field_type, '[{"value":"pendiente","label":"Pendiente"},{"value":"aprobado","label":"Aprobado"},{"value":"pagado","label":"Pagado"}]'::jsonb, true, false, 5 from public.collections where key = 'cuentas-por-pagar';

-- Facturas
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'numero', 'Número', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'facturas'
union all
select id, 'empresa', 'Empresa', 'relation'::field_type, '{"collectionKey":"empresas"}'::jsonb, false, false, 2 from public.collections where key = 'facturas'
union all
select id, 'monto', 'Monto', 'currency'::field_type, '[]'::jsonb, true, false, 3 from public.collections where key = 'facturas'
union all
select id, 'fecha', 'Fecha', 'date'::field_type, '[]'::jsonb, false, false, 4 from public.collections where key = 'facturas'
union all
select id, 'estado', 'Estado', 'select'::field_type, '[{"value":"pendiente","label":"Pendiente"},{"value":"pagada","label":"Pagada"},{"value":"vencida","label":"Vencida"}]'::jsonb, true, false, 5 from public.collections where key = 'facturas';

-- Organigrama
insert into public.collection_fields (collection_id, key, label, type, options, required, is_title, position)
select id, 'puesto', 'Puesto', 'text'::field_type, '[]'::jsonb, true, true, 1 from public.collections where key = 'organigrama'
union all
select id, 'area', 'Área', 'text'::field_type, '[]'::jsonb, false, false, 2 from public.collections where key = 'organigrama'
union all
select id, 'persona', 'Persona', 'person'::field_type, '[]'::jsonb, false, false, 3 from public.collections where key = 'organigrama'
union all
select id, 'reporta_a', 'Reporta a', 'relation'::field_type, '{"collectionKey":"organigrama"}'::jsonb, false, false, 4 from public.collections where key = 'organigrama';
