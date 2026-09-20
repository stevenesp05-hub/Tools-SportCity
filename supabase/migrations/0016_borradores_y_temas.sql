-- Autoguardado en servidor (borrador por usuario, sin ensuciar el historial de versiones) y tema visual por documento.

alter table public.documents
  add column if not exists theme text not null default 'corporate'
  check (theme in ('corporate', 'report', 'proposal', 'event', 'internal', 'campaign'));

create table if not exists public.document_drafts (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  base_version_id uuid,
  title text not null,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

alter table public.document_drafts enable row level security;

create policy "document_drafts: propios ver" on public.document_drafts
  for select using (user_id = auth.uid());
create policy "document_drafts: propios crear" on public.document_drafts
  for insert with check (
    user_id = auth.uid() and public.auth_role() in ('admin', 'gestor_general')
  );
create policy "document_drafts: propios actualizar" on public.document_drafts
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "document_drafts: propios borrar" on public.document_drafts
  for delete using (user_id = auth.uid());
