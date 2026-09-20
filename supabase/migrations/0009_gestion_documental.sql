-- Gestión documental estilo Drive (sin subida de archivos ni IA):
-- estados, vencimientos, etiquetas, visibilidad por documento, búsqueda de
-- contenido, favoritos, recientes y comentarios.

-- ---------- Metadatos de documento ----------
alter table public.documents
  add column status text not null default 'borrador'
    check (status in ('borrador', 'aprobado', 'vigente', 'vencido')),
  add column approved_by uuid references public.profiles (id),
  add column approved_at timestamptz,
  add column due_date date,
  add column tags text[] not null default '{}',
  add column visible_roles public.app_role[],
  add column search_text text not null default '';

-- ---------- Búsqueda de contenido (español, sin distinguir tildes) ----------
create extension if not exists unaccent;

create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$ select unaccent($1) $$;

alter table public.documents
  add column fts tsvector generated always as (
    to_tsvector(
      'spanish',
      public.immutable_unaccent(coalesce(title, '') || ' ' || coalesce(search_text, ''))
    )
  ) stored;

create index documents_fts_idx on public.documents using gin (fts);

-- Rellena el texto de los documentos existentes a partir de su versión actual.
update public.documents d
set search_text = regexp_replace(coalesce(v.content_html, ''), '<[^>]+>', ' ', 'g')
from public.document_versions v
where v.id = d.current_version_id;

-- ---------- Visibilidad por documento (además de la de la carpeta) ----------
drop policy "documents: ver según visibilidad de carpeta" on public.documents;
create policy "documents: ver según visibilidad" on public.documents
  for select using (
    auth.uid() is not null
    and (visible_roles is null or public.auth_role() = any(visible_roles))
    and exists (
      select 1 from public.folders f
      where f.id = documents.folder_id
        and (f.visible_roles is null or public.auth_role() = any(f.visible_roles))
    )
  );

drop policy "versions: ver según visibilidad de carpeta" on public.document_versions;
create policy "versions: ver según visibilidad" on public.document_versions
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.documents d
      join public.folders f on f.id = d.folder_id
      where d.id = document_versions.document_id
        and (d.visible_roles is null or public.auth_role() = any(d.visible_roles))
        and (f.visible_roles is null or public.auth_role() = any(f.visible_roles))
    )
  );

-- ---------- Favoritos y recientes (por usuario) ----------
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create table public.document_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

alter table public.favorites enable row level security;
alter table public.document_views enable row level security;

create policy "favorites: propios" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "document_views: propios" on public.document_views
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Comentarios ----------
create table public.document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index document_comments_document_id_idx on public.document_comments (document_id, created_at);

alter table public.document_comments enable row level security;

-- Ve los comentarios quien puede ver el documento (las policies de documents aplican en la subconsulta).
create policy "comments: ver si ves el documento" on public.document_comments
  for select using (exists (select 1 from public.documents d where d.id = document_comments.document_id));

create policy "comments: crear si ves el documento" on public.document_comments
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_comments.document_id)
  );

create policy "comments: resolver admin/gestor o autor" on public.document_comments
  for update using (author_id = auth.uid() or public.auth_role() in ('admin', 'gestor_general'));

create policy "comments: eliminar autor o admin" on public.document_comments
  for delete using (author_id = auth.uid() or public.auth_role() = 'admin');
