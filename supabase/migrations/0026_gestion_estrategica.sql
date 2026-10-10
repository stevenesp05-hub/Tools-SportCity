-- Gestión estratégica: KPI, estrategias, plan de acción (Gantt), presupuesto y ROI, junto a los OKR
-- de 0025_okr.sql.
--
-- Quién hace qué (lo vuelve a comprobar el servidor):
--   - Administración crea y edita todo.
--   - Recepción ve todo y cambia el estado de las actividades (pendiente / en progreso / completada).
--   - El profesor no ve nada de esto.
--
-- Se puede ejecutar más de una vez.

-- Nombre del indicador (KPI) de cada resultado clave, p. ej. «Nº de reuniones comerciales conseguidas».
alter table public.okr_key_results
  add column if not exists kpi_name text not null default ''
    check (char_length(kpi_name) <= 200);

create table if not exists public.okr_strategies (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'planificada'
    check (status in ('planificada', 'preparacion', 'en_desarrollo', 'activa', 'pausada', 'completada')),
  -- Solo se usa si la estrategia no tiene actividades; con actividades el avance se calcula de ellas.
  progress integer not null default 0 check (progress between 0 and 100),
  team text[] not null default '{}' check (cardinality(team) <= 12),
  -- Posición en la paleta de colores (0 a 7).
  color integer not null default 0 check (color between 0 and 7),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists okr_strategies_year_idx on public.okr_strategies (year, position);

-- Actividades del plan de acción. El año se divide en 48 casillas: 12 meses × 4 semanas (S1–S4).
create table if not exists public.okr_activities (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  strategy_id uuid references public.okr_strategies (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  owner_name text not null default '' check (char_length(owner_name) <= 100),
  start_slot integer not null check (start_slot between 1 and 48),
  end_slot integer not null check (end_slot between 1 and 48),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_progreso', 'completada')),
  milestone boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_slot >= start_slot)
);

create index if not exists okr_activities_year_idx on public.okr_activities (year, start_slot);

create table if not exists public.okr_budget_items (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  concept text not null check (char_length(concept) between 1 and 200),
  amount numeric not null default 0 check (amount >= 0),
  -- Lo gastado hasta ahora, para comparar con lo presupuestado.
  spent numeric not null default 0 check (spent >= 0),
  group_name text not null default '' check (char_length(group_name) <= 100),
  strategy_id uuid references public.okr_strategies (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists okr_budget_items_year_idx on public.okr_budget_items (year, position);

alter table public.okr_strategies enable row level security;
alter table public.okr_activities enable row level security;
alter table public.okr_budget_items enable row level security;

-- Estrategias y presupuesto: ven admin y recepción; solo admin escribe.
drop policy if exists "okr_strategies: ver" on public.okr_strategies;
create policy "okr_strategies: ver" on public.okr_strategies
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_strategies: escribir admin" on public.okr_strategies;
create policy "okr_strategies: escribir admin" on public.okr_strategies
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

drop policy if exists "okr_budget_items: ver" on public.okr_budget_items;
create policy "okr_budget_items: ver" on public.okr_budget_items
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_budget_items: escribir admin" on public.okr_budget_items;
create policy "okr_budget_items: escribir admin" on public.okr_budget_items
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- Actividades: ven admin y recepción; admin escribe y recepción solo actualiza (el servidor limita
-- ese cambio al estado).
drop policy if exists "okr_activities: ver" on public.okr_activities;
create policy "okr_activities: ver" on public.okr_activities
  for select using (public.auth_role() in ('admin', 'recepcion'));
drop policy if exists "okr_activities: escribir admin" on public.okr_activities;
create policy "okr_activities: escribir admin" on public.okr_activities
  for all using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
drop policy if exists "okr_activities: estado recepción" on public.okr_activities;
create policy "okr_activities: estado recepción" on public.okr_activities
  for update using (public.auth_role() = 'recepcion');
