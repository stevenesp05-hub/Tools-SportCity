-- 1) Documentos/carpetas adjuntos a un registro (ej. la carpeta de un proveedor).
-- Una carpeta con record_id es la "raíz de adjuntos" de ese registro; se oculta
-- del listado raíz de Documentos y vive dentro de la ficha del registro.
alter table public.folders add column record_id uuid;
alter table public.folders
  add constraint folders_record_id_fkey
  foreign key (record_id) references public.records (id) on delete cascade;
create index folders_record_id_idx on public.folders (record_id) where record_id is not null;

-- 2) Personalización de módulos: el admin puede crear colecciones y editar sus campos.
create policy "collections: crear admin" on public.collections
  for insert with check (public.auth_role() = 'admin');
create policy "collections: editar admin" on public.collections
  for update using (public.auth_role() = 'admin');

create policy "collection_fields: crear admin" on public.collection_fields
  for insert with check (public.auth_role() = 'admin');
create policy "collection_fields: editar admin" on public.collection_fields
  for update using (public.auth_role() = 'admin');
create policy "collection_fields: eliminar admin" on public.collection_fields
  for delete using (public.auth_role() = 'admin');

-- 3) Imágenes dentro de documentos (bucket privado; se sirven vía /api/imagenes con sesión).
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "documentos: subir admin/gestor" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.auth_role() in ('admin', 'gestor_general'));

create policy "documentos: leer logueados" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos');
