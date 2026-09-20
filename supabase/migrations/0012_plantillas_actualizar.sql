-- Permite al admin actualizar las plantillas base (el instalador las refresca por nombre).
create policy "document_templates: actualizar admin" on public.document_templates
  for update using (public.auth_role() = 'admin');
