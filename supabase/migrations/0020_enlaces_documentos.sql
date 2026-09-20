-- Enlaces entre documentos: qué documento enlaza a cuál (por /documentos/doc/<id>).
-- Antes, los «enlaces entrantes» se buscaban con un ilike sobre el HTML de todas las versiones;
-- ahora se consultan aquí por índice. El servidor mantiene la tabla al guardar cada versión.
-- Se puede ejecutar más de una vez sin problema.

create table if not exists public.document_links (
  source_document_id uuid not null references public.documents (id) on delete cascade,
  target_document_id uuid not null references public.documents (id) on delete cascade,
  primary key (source_document_id, target_document_id)
);

-- Enlaces entrantes: «¿quién enlaza a este documento?».
create index if not exists document_links_target_idx
  on public.document_links (target_document_id);

alter table public.document_links enable row level security;

-- Se ve el enlace si se ve el documento de origen (las políticas de documents aplican en la subconsulta).
drop policy if exists "document_links: ver si ves el origen" on public.document_links;
create policy "document_links: ver si ves el origen" on public.document_links
  for select using (
    exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

-- Los escribe quien puede guardar versiones (admin/gestor), y solo sobre documentos que ve.
drop policy if exists "document_links: crear admin/gestor" on public.document_links;
create policy "document_links: crear admin/gestor" on public.document_links
  for insert with check (
    public.auth_role() in ('admin', 'gestor_general')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

drop policy if exists "document_links: borrar admin/gestor" on public.document_links;
create policy "document_links: borrar admin/gestor" on public.document_links
  for delete using (
    public.auth_role() in ('admin', 'gestor_general')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

-- Relleno inicial: enlaces de la versión ACTUAL de cada documento (los ids salen del HTML).
insert into public.document_links (source_document_id, target_document_id)
select distinct d.id, t.target_id::uuid
from public.documents d
join public.document_versions v on v.id = d.current_version_id
cross join lateral (
  select m[1] as target_id
  from regexp_matches(
    v.content_html,
    '/documentos/doc/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
    'g'
  ) as m
) t
where t.target_id::uuid <> d.id
  and exists (select 1 from public.documents x where x.id = t.target_id::uuid)
on conflict do nothing;
