-- Objetivos y Resultados Clave (OKR) y seguimiento de ingresos mensuales.
--
-- Quién hace qué (lo vuelve a comprobar el servidor):
--   - Administración crea y edita objetivos, resultados clave y la meta de ingresos.
--   - Recepción ve todo y registra avances (check-ins) e ingresos del mes.
--   - El profesor no ve nada de esto.
--
-- El valor actual de un resultado clave no se guarda en él: es el del último check-in (o el valor
-- inicial si aún no hay). Así recepción solo necesita poder insertar check-ins.
--
-- Se puede ejecutar más de una vez.

create table if not exists public.okr_objectives (
  id uuid primary key default gen_random_uuid(),
  -- Periodo: trimestre «2026-T4» o año «2026».
  period text not null check (period ~ '^\d{4}(-T[1-4])?$'),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  owner_id uuid references public.profiles (id) on delete set null,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.okr_key_results (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.okr_objectives (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  -- Unidad que se muestra: «C$», «%», «alumnos»…
  unit text not null default '' check (char_length(unit) <= 20),
  start_value numeric not null default 0,
  target_value numeric not null,
  -- 'manual': se anota con check-ins. 'auto': se calcula con datos de Tools (ver okr.ts AUTO_METRICS).
  source text not null default 'manual' check (source in ('manual', 'auto')),
  auto_metric text check (auto_metric is null or char_length(auto_metric) <= 60),
  owner_id uuid references public.profiles (id) on delete set null,
  due_on date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists okr_key_results_objective_idx
  on public.okr_key_results (objective_id, position);

create table if not exists public.okr_checkins (
  id uuid primary key default gen_random_uuid(),
  key_result_id uuid not null references public.okr_key_results (id) on delete cascade,
  value numeric not null,
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists okr_checkins_kr_idx
  on public.okr_checkins (key_result_id, created_at desc);

-- Ingresos reales por mes (primer día del mes). La meta mensual vive en okr_settings.
create table if not exists public.okr_income (
  month date primary key check (extract(day from month) = 1),
  amount numeric not null check (amount >= 0),
  note text not null default '' check (char_length(note) <= 500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.okr_settings (
  key text primary key check (char_length(key) <= 60),
  value jsonb not null check (octet_length(value::text) <= 4000)
);

alter table public.okr_objectives enable row level security;
alter table public.okr_key_results enable row level security;
alter table public.okr_checkins enable row level security;
alter table public.okr_income enable row level security;
alter table public.okr_settings enable row level security;

-- Objetivos y resultados clave: ven admin y recepción; solo admin escribe.
drop policy if exists "okr_objectives: ver" on public.okr_objectives;
create policy "okr_objectives: ver" on public.okr_objectives
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_objectives: escribir admin" on public.okr_objectives;
create policy "okr_objectives: escribir admin" on public.okr_objectives
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

drop policy if exists "okr_key_results: ver" on public.okr_key_results;
create policy "okr_key_results: ver" on public.okr_key_results
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_key_results: escribir admin" on public.okr_key_results;
create policy "okr_key_results: escribir admin" on public.okr_key_results
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- Check-ins: ven y registran admin y recepción; solo admin los borra (corregir un error).
drop policy if exists "okr_checkins: ver" on public.okr_checkins;
create policy "okr_checkins: ver" on public.okr_checkins
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_checkins: registrar" on public.okr_checkins;
create policy "okr_checkins: registrar" on public.okr_checkins
  for insert with check (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_checkins: borrar admin" on public.okr_checkins;
create policy "okr_checkins: borrar admin" on public.okr_checkins
  for delete using (public.auth_role() = 'admin');

-- Ingresos: ven y anotan admin y recepción (el mes se corrige sobrescribiéndolo).
drop policy if exists "okr_income: ver" on public.okr_income;
create policy "okr_income: ver" on public.okr_income
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_income: insertar" on public.okr_income;
create policy "okr_income: insertar" on public.okr_income
  for insert with check (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_income: actualizar" on public.okr_income;
create policy "okr_income: actualizar" on public.okr_income
  for update using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_income: borrar admin" on public.okr_income;
create policy "okr_income: borrar admin" on public.okr_income
  for delete using (public.auth_role() = 'admin');

-- Ajustes (meta mensual de ingresos): ven admin y recepción; solo admin cambia.
drop policy if exists "okr_settings: ver" on public.okr_settings;
create policy "okr_settings: ver" on public.okr_settings
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_settings: escribir admin" on public.okr_settings;
create policy "okr_settings: escribir admin" on public.okr_settings
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- Meta inicial: 1.000.000 C$ de ingresos al mes.
insert into public.okr_settings (key, value)
values ('ingresos_meta', '{"target": 1000000, "unit": "C$"}'::jsonb)
on conflict (key) do nothing;
