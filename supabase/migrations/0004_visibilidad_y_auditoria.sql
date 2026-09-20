-- Fase 4: permisos finos por carpeta/colección + historial de auditoría unificado.

-- ---------- Visibilidad por rol (carpetas y colecciones) ----------
-- null = visible para todos los roles logueados (comportamiento actual).
-- Un array restringe qué roles pueden siquiera VER la carpeta/colección (y su contenido).
alter table public.folders add column visible_roles public.app_role[];
alter table public.collections add column visible_roles public.app_role[];

drop policy "folders: ver si estás logueado" on public.folders;
create policy "folders: ver según visibilidad" on public.folders
  for select using (
    auth.uid() is not null
    and (visible_roles is null or public.auth_role() = any(visible_roles))
  );

drop policy "documents: ver si estás logueado" on public.documents;
create policy "documents: ver según visibilidad de carpeta" on public.documents
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.folders f
      where f.id = documents.folder_id
        and (f.visible_roles is null or public.auth_role() = any(f.visible_roles))
    )
  );

drop policy "versions: ver si estás logueado" on public.document_versions;
create policy "versions: ver según visibilidad de carpeta" on public.document_versions
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.documents d
      join public.folders f on f.id = d.folder_id
      where d.id = document_versions.document_id
        and (f.visible_roles is null or public.auth_role() = any(f.visible_roles))
    )
  );

drop policy "collections: ver si estás logueado" on public.collections;
create policy "collections: ver según visibilidad" on public.collections
  for select using (
    auth.uid() is not null
    and (visible_roles is null or public.auth_role() = any(visible_roles))
  );

drop policy "records: ver si estás logueado" on public.records;
create policy "records: ver según visibilidad de colección" on public.records
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.collections c
      where c.id = records.collection_id
        and (c.visible_roles is null or public.auth_role() = any(c.visible_roles))
    )
  );

-- ---------- Historial de auditoría unificado ----------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null, -- 'insert' | 'update' | 'delete'
  table_name text not null,
  record_id uuid not null,
  summary text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy "audit_log: ver admin/gestor" on public.audit_log
  for select using (public.auth_role() in ('admin', 'gestor_general'));

create function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_summary text;
begin
  if TG_OP = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if TG_TABLE_NAME = 'documents' then
    v_summary := v_row.title;
  elsif TG_TABLE_NAME = 'folders' then
    v_summary := v_row.name;
  elsif TG_TABLE_NAME = 'collections' then
    v_summary := v_row.name;
  elsif TG_TABLE_NAME = 'document_versions' then
    v_summary := 'versión ' || v_row.version_number::text;
  else
    v_summary := v_row.id::text;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, summary)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_row.id, v_summary);

  return v_row;
end;
$$;

create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function public.audit_trigger();

create trigger audit_document_versions after insert on public.document_versions
  for each row execute function public.audit_trigger();

create trigger audit_folders after insert or update or delete on public.folders
  for each row execute function public.audit_trigger();

create trigger audit_collections after insert or update or delete on public.collections
  for each row execute function public.audit_trigger();

create trigger audit_records after insert or update or delete on public.records
  for each row execute function public.audit_trigger();
