-- Sport City Tools — esquema inicial (Fase 0 + Motor de Documentos)

create type public.app_role as enum ('admin', 'gestor_general', 'recepcion', 'profesor', 'usuario');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'usuario',
  created_at timestamptz not null default now()
);

-- Crea el profile automáticamente cuando se invita/crea un usuario en Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Resuelve el rol del usuario autenticado actual, para usar en policies.
create function public.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.folders (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders (id) on delete cascade,
  title text not null,
  current_version_id uuid,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_number int not null,
  content jsonb not null,
  content_html text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.documents
  add constraint documents_current_version_id_fkey
  foreign key (current_version_id) references public.document_versions (id);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

create policy "profiles: ver el propio" on public.profiles
  for select using (id = auth.uid());

create policy "folders: ver si estás logueado" on public.folders
  for select using (auth.uid() is not null);

create policy "folders: crear admin/gestor" on public.folders
  for insert with check (public.auth_role() in ('admin', 'gestor_general'));

create policy "folders: editar admin/gestor" on public.folders
  for update using (public.auth_role() in ('admin', 'gestor_general'));

create policy "folders: eliminar admin" on public.folders
  for delete using (public.auth_role() = 'admin');

create policy "documents: ver si estás logueado" on public.documents
  for select using (auth.uid() is not null);

create policy "documents: crear admin/gestor" on public.documents
  for insert with check (public.auth_role() in ('admin', 'gestor_general'));

create policy "documents: editar admin/gestor" on public.documents
  for update using (public.auth_role() in ('admin', 'gestor_general'));

create policy "documents: eliminar admin" on public.documents
  for delete using (public.auth_role() = 'admin');

-- document_versions es insert-only: nunca se actualiza ni se borra una versión.
create policy "versions: ver si estás logueado" on public.document_versions
  for select using (auth.uid() is not null);

create policy "versions: crear admin/gestor" on public.document_versions
  for insert with check (public.auth_role() in ('admin', 'gestor_general'));

-- Seed: carpeta raíz "Manuales" para validar el motor de Documentos.
insert into public.folders (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'Manuales');
