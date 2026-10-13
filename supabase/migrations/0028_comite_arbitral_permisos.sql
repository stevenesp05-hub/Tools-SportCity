-- Rol «Comité arbitral»: permisos y acceso. (Antes hay que haber ejecutado 0027.)
--
--   - Redacta comunicados: crea, edita y comparte documentos, y sube imágenes a ellos.
--   - Solo ve y toca las carpetas que lo nombran en `visible_roles` (como el profesor): una carpeta
--     sin restricción no la ve. Aquí se le da acceso a «Ligas», «Torneos» y, dentro de «Manuales»,
--     a «Academia» (ver el último bloque).
--   - Sus documentos quedan aprobados directamente (la aplicación lo hace al crear y guardar; aquí
--     solo se le deja hacerlo a él y únicamente a su nombre).
--   - No ve nada de la gestión (OKR, KPI…): esas políticas ya excluían a cualquier otro rol.
--   - No elimina, no cambia quién ve un documento o carpeta, no gestiona plantillas ni usuarios.
--
-- Se puede ejecutar más de una vez.

-- ---------- 1. Visibilidad: el comité solo ve lo que lo nombra ----------

create or replace function public.role_can_see(visible public.app_role[])
returns boolean
language sql
stable
as $$
  select case public.auth_role()::text
    when 'admin' then true
    when 'profesor' then visible is not null and 'profesor'::public.app_role = any(visible)
    when 'comite_arbitral' then visible is not null and 'comite_arbitral'::public.app_role = any(visible)
    when 'usuario' then visible is not null and 'usuario'::public.app_role = any(visible)
    else visible is null or public.auth_role() = any(visible)
  end
$$;

-- ---------- 2. Escritura: documentos y versiones (solo en carpetas que ve) ----------

drop policy if exists "documents: crear admin/recepción" on public.documents;
drop policy if exists "documents: crear admin/recepción/comité" on public.documents;
create policy "documents: crear admin/recepción/comité" on public.documents
  for insert with check (
    public.auth_role() in ('admin', 'recepcion')
    or (
      public.auth_role() = 'comite_arbitral'
      and exists (
        select 1 from public.folders f
        where f.id = documents.folder_id and public.role_can_see(f.visible_roles)
      )
    )
  );

drop policy if exists "documents: editar admin/recepción" on public.documents;
drop policy if exists "documents: editar admin/recepción/comité" on public.documents;
create policy "documents: editar admin/recepción/comité" on public.documents
  for update using (
    public.auth_role() in ('admin', 'recepcion')
    or (
      public.auth_role() = 'comite_arbitral'
      and public.role_can_see_document(visible_roles)
      and exists (
        select 1 from public.folders f
        where f.id = documents.folder_id and public.role_can_see(f.visible_roles)
      )
    )
  );

drop policy if exists "versions: crear admin/recepción" on public.document_versions;
drop policy if exists "versions: crear admin/recepción/comité" on public.document_versions;
create policy "versions: crear admin/recepción/comité" on public.document_versions
  for insert with check (
    public.auth_role() in ('admin', 'recepcion')
    or (
      public.auth_role() = 'comite_arbitral'
      and exists (select 1 from public.documents d where d.id = document_versions.document_id)
    )
  );

-- Plantillas: las ve (para crear un comunicado desde una), no las edita.
drop policy if exists "document_templates: ver admin/recepción" on public.document_templates;
drop policy if exists "document_templates: ver personal y comité" on public.document_templates;
create policy "document_templates: ver personal y comité" on public.document_templates
  for select using (public.auth_role() in ('admin', 'recepcion', 'comite_arbitral'));

-- Imágenes dentro de los documentos.
drop policy if exists "documentos: subir admin/recepción" on storage.objects;
drop policy if exists "documentos: subir admin/recepción/comité" on storage.objects;
create policy "documentos: subir admin/recepción/comité" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.auth_role() in ('admin', 'recepcion', 'comite_arbitral')
  );

-- Borradores de autoguardado (solo los propios).
drop policy if exists "document_drafts: propios crear" on public.document_drafts;
create policy "document_drafts: propios crear" on public.document_drafts
  for insert with check (
    user_id = auth.uid()
    and public.auth_role() in ('admin', 'recepcion', 'comite_arbitral')
  );

-- Enlaces entre documentos: solo desde documentos que ve.
drop policy if exists "document_links: crear admin/recepción" on public.document_links;
create policy "document_links: crear admin/recepción" on public.document_links
  for insert with check (
    public.auth_role() in ('admin', 'recepcion', 'comite_arbitral')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

drop policy if exists "document_links: borrar admin/recepción" on public.document_links;
create policy "document_links: borrar admin/recepción" on public.document_links
  for delete using (
    public.auth_role() in ('admin', 'recepcion', 'comite_arbitral')
    and exists (select 1 from public.documents d where d.id = document_links.source_document_id)
  );

-- Enlaces para compartir un documento (un comunicado, por ejemplo): admin y recepción como siempre;
-- el comité solo los de documentos que ve.
drop policy if exists "document_shares: ver admin/recepción" on public.document_shares;
create policy "document_shares: ver admin/recepción" on public.document_shares
  for select using (
    public.auth_role() in ('admin', 'recepcion')
    or (
      public.auth_role() = 'comite_arbitral'
      and exists (select 1 from public.documents d where d.id = document_shares.document_id)
    )
  );

drop policy if exists "document_shares: crear admin/recepción" on public.document_shares;
create policy "document_shares: crear admin/recepción" on public.document_shares
  for insert with check (
    created_by = auth.uid()
    and (
      public.auth_role() in ('admin', 'recepcion')
      or (
        public.auth_role() = 'comite_arbitral'
        and exists (select 1 from public.documents d where d.id = document_shares.document_id)
      )
    )
  );

drop policy if exists "document_shares: revocar admin/recepción" on public.document_shares;
create policy "document_shares: revocar admin/recepción" on public.document_shares
  for update using (
    public.auth_role() in ('admin', 'recepcion')
    or (
      public.auth_role() = 'comite_arbitral'
      and exists (select 1 from public.documents d where d.id = document_shares.document_id)
    )
  );

-- ---------- 3. Campos de gobierno del documento: el comité solo puede aprobar a su nombre ----------

create or replace function public.guard_document_admin_fields()
returns trigger
language plpgsql
as $$
declare
  trusted boolean := false;
begin
  if auth.uid() is null or public.auth_role() = 'admin' then
    return new;
  end if;

  -- Aprobación directa: solo el comité arbitral, y siempre a su propio nombre.
  trusted := public.auth_role() = 'comite_arbitral';

  if tg_op = 'INSERT' then
    if new.visible_roles is not null
       or new.deleted_at is not null
       or new.featured is true then
      raise exception 'No autorizado: solo un administrador puede fijar la visibilidad o el destacado de un documento.';
    end if;
    if trusted
       and new.status in ('borrador', 'aprobado')
       and (new.approved_by is null or new.approved_by = auth.uid()) then
      return new;
    end if;
    if new.approved_by is not null or new.status <> 'borrador' then
      raise exception 'No autorizado: solo un administrador puede fijar el estado o la aprobación de un documento.';
    end if;
    return new;
  end if;

  if new.visible_roles is distinct from old.visible_roles then
    raise exception 'No autorizado: solo un administrador puede cambiar quién ve un documento.';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'No autorizado: solo un administrador puede eliminar un documento.';
  end if;
  if new.featured is distinct from old.featured then
    raise exception 'No autorizado: solo un administrador puede destacar un documento para todos.';
  end if;

  if trusted and new.status = 'aprobado' and new.approved_by = auth.uid() then
    return new;
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

-- ---------- 4. Acceso inicial a carpetas ----------
-- «Ligas» y «Torneos» (carpetas raíz, con todo lo que contienen) y «Manuales > Academia» (con lo
-- que contiene). «Manuales» queda visible para que se pueda llegar a «Academia», pero el resto de
-- sus subcarpetas no cambian: siguen ocultas para el comité. Se busca por nombre; si alguna carpeta
-- se llama distinto, no se toca y se asigna a mano en Documentos > carpeta > ¿Quién la ve?
-- Quien ya tenía lista de roles la conserva y se le suma el comité; la que no tenía restricción
-- (nulo = admin y recepción) pasa a esa lista explícita más el comité.

with recursive seed as (
  select f.id
  from public.folders f
  where f.parent_id is null and lower(f.name) in ('ligas', 'torneos')
  union
  select a.id
  from public.folders a
  join public.folders m on a.parent_id = m.id
  where m.parent_id is null and lower(m.name) = 'manuales' and lower(a.name) = 'academia'
), tree as (
  select id from seed
  union
  select c.id from public.folders c join tree t on c.parent_id = t.id
), container as (
  select id from public.folders where parent_id is null and lower(name) = 'manuales'
)
update public.folders f
set visible_roles = array(
  select distinct r
  from unnest(
    coalesce(f.visible_roles, array['admin', 'recepcion']::public.app_role[])
    || array['comite_arbitral']::public.app_role[]
  ) as r
  order by r
)
where f.id in (select id from tree union select id from container)
  and not ('comite_arbitral'::public.app_role = any(coalesce(f.visible_roles, '{}'::public.app_role[])));
