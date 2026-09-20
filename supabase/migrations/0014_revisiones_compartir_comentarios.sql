-- Revisión con nombre, enlaces de solo lectura y comentarios sobre un fragmento del texto.

-- ---------- Revisiones ----------
create table public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version_id uuid references public.document_versions (id) on delete set null,
  requested_by uuid not null references public.profiles (id),
  reviewer_id uuid not null references public.profiles (id),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested', 'cancelled')),
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create index document_reviews_document_idx on public.document_reviews (document_id, requested_at desc);
create index document_reviews_reviewer_idx on public.document_reviews (reviewer_id, status);

alter table public.document_reviews enable row level security;

create policy "document_reviews: ver si estás logueado" on public.document_reviews
  for select using (auth.uid() is not null);
create policy "document_reviews: pedir admin/gestor" on public.document_reviews
  for insert with check (
    requested_by = auth.uid() and public.auth_role() in ('admin', 'gestor_general')
  );
create policy "document_reviews: decidir o cancelar" on public.document_reviews
  for update using (
    reviewer_id = auth.uid() or requested_by = auth.uid() or public.auth_role() = 'admin'
  );

-- ---------- Enlaces de solo lectura ----------
-- El acceso público lo resuelve el servidor con la clave de servicio; los usuarios solo gestionan sus enlaces.
create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index document_shares_document_idx on public.document_shares (document_id);

alter table public.document_shares enable row level security;

create policy "document_shares: ver admin/gestor" on public.document_shares
  for select using (public.auth_role() in ('admin', 'gestor_general'));
create policy "document_shares: crear admin/gestor" on public.document_shares
  for insert with check (
    created_by = auth.uid() and public.auth_role() in ('admin', 'gestor_general')
  );
create policy "document_shares: revocar admin/gestor" on public.document_shares
  for update using (public.auth_role() in ('admin', 'gestor_general'));

-- ---------- Comentarios sobre un fragmento ----------
alter table public.document_comments add column quote text;
