-- Plantillas de documentos: documentos "libres" siguen funcionando igual
-- (contenido vacío por defecto); esto agrega la opción de arrancar desde una
-- plantilla guardada. Una plantilla puede ser global (folder_id null, aparece
-- en cualquier carpeta) o específica de una carpeta.
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  folder_id uuid references public.folders (id) on delete cascade,
  content jsonb not null,
  content_html text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.document_templates enable row level security;

create policy "document_templates: ver si estás logueado" on public.document_templates
  for select using (auth.uid() is not null);

create policy "document_templates: crear admin/gestor" on public.document_templates
  for insert with check (public.auth_role() in ('admin', 'gestor_general'));

create policy "document_templates: eliminar admin" on public.document_templates
  for delete using (public.auth_role() = 'admin');
