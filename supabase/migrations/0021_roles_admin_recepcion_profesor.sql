-- Roles de Sport City Tools: admin, recepción y profesor.
--
--   admin      Todo. Además ve siempre todo, aunque una carpeta o documento restrinja roles.
--   recepcion  Trabaja con los documentos: crea, edita, comparte, pide revisión y comenta.
--              No aprueba, no elimina, no gestiona plantillas base, accesos ni usuarios.
--   profesor   Solo lectura, y solo de las carpetas donde se le da acceso de forma expresa
--              (su nombre debe estar en `visible_roles`). Una carpeta sin restricción
--              (`visible_roles` nulo) la ven admin y recepción, nunca el profesor.
--
-- Los valores 'gestor_general' y 'usuario' siguen existiendo en el tipo `app_role` (Postgres no
-- permite quitar valores de un enum sin recrearlo), pero ya no se usan: sus cuentas pasan a
-- recepción y profesor y ninguna política los menciona.
--
-- Esta migración también corrige dos cosas de las políticas anteriores:
--   1. El admin no tenía acceso garantizado: si una carpeta restringía a otros roles, él no la veía.
--   2. La app pedía más permisos que la base de datos (eliminar, aprobar, cambiar visibilidad),
--      así que llamando a Supabase directamente se podían saltar. Ahora los impone un trigger.
--
-- Se puede ejecutar más de una vez.

-- ---------- 1. Datos: cuentas y visibilidades existentes ----------

update public.profiles set role = 'recepcion' where role = 'gestor_general';
update public.profiles set role = 'profesor' where role = 'usuario';

-- Una cuenta nueva parte con el mínimo acceso; el admin le asigna el rol al crearla.
alter table public.profiles alter column role set default 'profesor';

-- gestor_general pasa a recepción y usuario desaparece de las listas. Si una lista se queda vacía,
-- se deja solo al admin (nunca en nulo, que abriría el acceso).
update public.folders
set visible_roles = coalesce(
  nullif(
    array(
      select distinct r
      from unnest(array_replace(visible_roles, 'gestor_general'::public.app_role, 'recepcion'::public.app_role)) as r
      where r <> 'usuario'::public.app_role
      order by r
    ),
    '{}'::public.app_role[]
  ),
  array['admin']::public.app_role[]
)
where visible_roles && array['gestor_general', 'usuario']::public.app_role[];

update public.documents
set visible_roles = coalesce(
  nullif(
    array(
      select distinct r
      from unnest(array_replace(visible_roles, 'gestor_general'::public.app_role, 'recepcion'::public.app_role)) as r
      where r <> 'usuario'::public.app_role
      order by r
    ),
    '{}'::public.app_role[]
  ),
  array['admin']::public.app_role[]
)
where visible_roles && array['gestor_general', 'usuario']::public.app_role[];

update public.collections
set visible_roles = coalesce(
  nullif(
    array(
      select distinct r
      from unnest(array_replace(visible_roles, 'gestor_general'::public.app_role, 'recepcion'::public.app_role)) as r
      where r <> 'usuario'::public.app_role
      order by r
    ),
    '{}'::public.app_role[]
  ),
  array['admin']::public.app_role[]
)
where visible_roles && array['gestor_general', 'usuario']::public.app_role[];

-- ---------- 2. Funciones de visibilidad ----------

-- Carpetas y colecciones: admin ve todo; el profesor solo lo que lo nombra; el resto, lo que no
-- restringe roles o los incluye.
create or replace function public.role_can_see(visible public.app_role[])
returns boolean
language sql
stable
as $$
  select case public.auth_role()::text
    when 'admin' then true
    when 'profesor' then visible is not null and 'profesor'::public.app_role = any(visible)
    when 'usuario' then visible is not null and 'usuario'::public.app_role = any(visible)
    else visible is null or public.auth_role() = any(visible)
  end
$$;

-- Documentos: dentro de una carpeta visible, un documento sin restricción propia hereda esa
-- visibilidad (por eso aquí el nulo sí significa "cualquiera que vea la carpeta").
create or replace function public.role_can_see_document(visible public.app_role[])
returns boolean
language sql
stable
as $$
  select public.auth_role() = 'admin'
    or visible is null
    or public.auth_role() = any(visible)
$$;

-- ---------- 3. Lectura: carpetas, documentos y todo lo que cuelga de ellos ----------

drop policy if exists "folders: ver según visibilidad" on public.folders;
create policy "folders: ver según visibilidad" on public.folders
  for select using (
    auth.uid() is not null
    and public.role_can_see(visible_roles)
  );

drop policy if exists "documents: ver según visibilidad" on public.documents;
create policy "documents: ver según visibilidad" on public.documents
  for select using (
    auth.uid() is not null
    and public.role_can_see_document(visible_roles)
    and exists (
      select 1 from public.folders f
      where f.id = documents.folder_id
        and public.role_can_see(f.visible_roles)
    )
  );

-- Versiones, comentarios, revisiones, presencia y enlaces: se ven si se ve el documento (la
-- política de `documents` se aplica dentro de la subconsulta).
drop policy if exists "versions: ver según visibilidad" on public.document_versions;
create policy "versions: ver según visibilidad" on public.document_versions
  for select using (
    exists (select 1 from public.documents d where d.id = document_versions.document_id)
  );

drop policy if exists "document_reviews: ver si estás logueado" on public.document_reviews;
drop policy if exists "document_reviews: ver si ves el documento" on public.document_reviews;
create policy "document_reviews: ver si ves el documento" on public.document_reviews
  for select using (
    exists (select 1 from public.documents d where d.id = document_reviews.document_id)
  );

drop policy if exists "document_editing: ver si estás logueado" on public.document_editing;
drop policy if exists "document_editing: ver si ves el documento" on public.document_editing;
create policy "document_editing: ver si ves el documento" on public.document_editing
  for select using (
    exists (select 1 from public.documents d where d.id = document_editing.document_id)
  );

drop policy if exists "collections: ver según visibilidad" on public.collections;
create policy "collections: ver según visibilidad" on public.collections
  for select using (
    auth.uid() is not null
    and public.role_can_see(visible_roles)
  );

drop policy if exists "records: ver según visibilidad de colección" on public.records;
create policy "records: ver según visibilidad de colección" on public.records
  for select using (
    exists (select 1 from public.collections c where c.id = records.collection_id)
  );

-- Las plantillas solo hacen falta a quien crea documentos.
drop policy if exists "document_templates: ver si estás logueado" on public.document_templates;
drop policy if exists "document_templates: ver admin/recepción" on public.document_templates;
create policy "document_templates: ver admin/recepción" on public.document_templates
  for select using (public.auth_role() in ('admin', 'recepcion'));

-- La auditoría es solo del admin.
drop policy if exists "audit_log: ver admin/gestor" on public.audit_log;
drop policy if exists "audit_log: ver admin" on public.audit_log;
create policy "audit_log: ver admin" on public.audit_log
  for select using (public.auth_role() = 'admin');

-- ---------- 4. Escritura: recepción ocupa el lugar del antiguo gestor general ----------

drop policy if exists "folders: crear admin/gestor" on public.folders;
drop policy if exists "folders: crear admin/recepción" on public.folders;
create policy "folders: crear admin/recepción" on public.folders
  for insert with check (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "folders: editar admin/gestor" on public.folders;
drop policy if exists "folders: editar admin/recepción" on public.folders;
create policy "folders: editar admin/recepción" on public.folders
  for update using (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "documents: crear admin/gestor" on public.documents;
drop policy if exists "documents: crear admin/recepción" on public.documents;
create policy "documents: crear admin/recepción" on public.documents
  for insert with check (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "documents: editar admin/gestor" on public.documents;
drop policy if exists "documents: editar admin/recepción" on public.documents;
create policy "documents: editar admin/recepción" on public.documents
  for update using (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "versions: crear admin/gestor" on public.document_versions;
drop policy if exists "versions: crear admin/recepción" on public.document_versions;
create policy "versions: crear admin/recepción" on public.document_versions
  for insert with check (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "records: crear admin/gestor" on public.records;
drop policy if exists "records: crear admin/recepción" on public.records;
create policy "records: crear admin/recepción" on public.records
  for insert with check (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "records: editar admin/gestor" on public.records;
drop policy if exists "records: editar admin/recepción" on public.records;
create policy "records: editar admin/recepción" on public.records
  for update using (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "document_templates: crear admin/gestor" on public.document_templates;
drop policy if exists "document_templates: crear admin/recepción" on public.document_templates;
create policy "document_templates: crear admin/recepción" on public.document_templates
  for insert with check (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "documentos: subir admin/gestor" on storage.objects;
drop policy if exists "documentos: subir admin/recepción" on storage.objects;
create policy "documentos: subir admin/recepción" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.auth_role() in ('admin', 'recepcion'));

-- Comentarios: solo admin y recepción comentan; el profesor solo lee.
drop policy if exists "comments: crear si ves el documento" on public.document_comments;
create policy "comments: crear si ves el documento" on public.document_comments
  for insert with check (
    author_id = auth.uid()
    and public.auth_role() in ('admin', 'recepcion')
    and exists (select 1 from public.documents d where d.id = document_comments.document_id)
  );

drop policy if exists "comments: resolver admin/gestor o autor" on public.document_comments;
drop policy if exists "comments: resolver admin/recepción o autor" on public.document_comments;
create policy "comments: resolver admin/recepción o autor" on public.document_comments
  for update using (
    author_id = auth.uid() or public.auth_role() in ('admin', 'recepcion')
  );

drop policy if exists "document_reviews: pedir admin/gestor" on public.document_reviews;
drop policy if exists "document_reviews: pedir admin/recepción" on public.document_reviews;
create policy "document_reviews: pedir admin/recepción" on public.document_reviews
  for insert with check (
    requested_by = auth.uid() and public.auth_role() in ('admin', 'recepcion')
  );

drop policy if exists "document_shares: ver admin/gestor" on public.document_shares;
drop policy if exists "document_shares: ver admin/recepción" on public.document_shares;
create policy "document_shares: ver admin/recepción" on public.document_shares
  for select using (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "document_shares: crear admin/gestor" on public.document_shares;
drop policy if exists "document_shares: crear admin/recepción" on public.document_shares;
create policy "document_shares: crear admin/recepción" on public.document_shares
  for insert with check (
    created_by = auth.uid() and public.auth_role() in ('admin', 'recepcion')
  );

drop policy if exists "document_shares: revocar admin/gestor" on public.document_shares;
drop policy if exists "document_shares: revocar admin/recepción" on public.document_shares;
create policy "document_shares: revocar admin/recepción" on public.document_shares
  for update using (public.auth_role() in ('admin', 'recepcion'));

drop policy if exists "document_drafts: propios crear" on public.document_drafts;
create policy "document_drafts: propios crear" on public.document_drafts
  for insert with check (
    user_id = auth.uid() and public.auth_role() in ('admin', 'recepcion')
  );

drop policy if exists "document_links: crear admin/gestor" on public.document_links;
drop policy if exists "document_links: crear admin/recepción" on public.document_links;
create policy "document_links: crear admin/recepción" on public.document_links
  for insert with check (
    public.auth_role() in ('admin', 'recepcion')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

drop policy if exists "document_links: borrar admin/gestor" on public.document_links;
drop policy if exists "document_links: borrar admin/recepción" on public.document_links;
create policy "document_links: borrar admin/recepción" on public.document_links
  for delete using (
    public.auth_role() in ('admin', 'recepcion')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

-- ---------- 5. Lo que solo puede hacer el admin, aunque Recepción pueda editar la fila ----------
-- Las políticas de arriba dejan editar filas enteras; estos triggers reservan al admin los campos
-- delicados. No se aplican a tareas del servidor (sin sesión de usuario) ni a migraciones.

create or replace function public.guard_document_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.auth_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.visible_roles is not null
       or new.deleted_at is not null
       or new.approved_by is not null
       or new.status <> 'borrador' then
      raise exception 'No autorizado: solo un administrador puede fijar el estado, la aprobación o la visibilidad de un documento.';
    end if;
    return new;
  end if;

  if new.visible_roles is distinct from old.visible_roles then
    raise exception 'No autorizado: solo un administrador puede cambiar quién ve un documento.';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'No autorizado: solo un administrador puede eliminar un documento.';
  end if;
  if new.status is distinct from old.status and new.status <> 'borrador' then
    raise exception 'No autorizado: solo un administrador puede aprobar un documento.';
  end if;
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    raise exception 'No autorizado: solo un administrador puede aprobar un documento.';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_guard_admin_fields on public.documents;
create trigger documents_guard_admin_fields
  before insert or update on public.documents
  for each row execute function public.guard_document_admin_fields();

-- Carpetas: cambiar la audiencia es del admin. Al crear una subcarpeta, recepción solo puede
-- dejarla sin restricción o con la misma audiencia que la carpeta que la contiene.
create or replace function public.guard_folder_visibility()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.auth_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.visible_roles is not null
       and new.visible_roles is distinct from (
         select p.visible_roles from public.folders p where p.id = new.parent_id
       ) then
      raise exception 'No autorizado: solo un administrador puede elegir quién ve una carpeta.';
    end if;
  elsif new.visible_roles is distinct from old.visible_roles then
    raise exception 'No autorizado: solo un administrador puede cambiar quién ve una carpeta.';
  end if;
  return new;
end;
$$;

drop trigger if exists folders_guard_visibility on public.folders;
create trigger folders_guard_visibility
  before insert or update on public.folders
  for each row execute function public.guard_folder_visibility();
