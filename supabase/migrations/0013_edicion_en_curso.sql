-- Aviso de edición: quién tiene un documento abierto en modo edición.
-- Cada editor renueva su fila cada pocos segundos; una fila con más de ~45 s se considera caducada.
create table public.document_editing (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

alter table public.document_editing enable row level security;

create policy "document_editing: ver si estás logueado" on public.document_editing
  for select using (auth.uid() is not null);
create policy "document_editing: gestionar la propia" on public.document_editing
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
