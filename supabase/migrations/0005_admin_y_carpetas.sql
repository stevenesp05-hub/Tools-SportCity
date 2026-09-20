-- Panel de administración: admin puede cambiar el rol de cualquier usuario.
create policy "profiles: admin actualiza roles" on public.profiles
  for update using (public.auth_role() = 'admin')
  with check (public.auth_role() = 'admin');

-- Estructura de carpetas inicial por módulo — punto de partida, se puede
-- renombrar/reorganizar libremente desde la interfaz (Documentos soporta
-- carpetas anidadas).
insert into public.folders (name, parent_id)
select sub.name, f.id
from public.folders f
join (values
  ('Manuales', 'Reservas'),
  ('Manuales', 'Academia'),
  ('Manuales', 'Bar'),
  ('Manuales', 'CRM'),
  ('Reglamentos de eventos', 'Liga Sport City'),
  ('Reglamentos de eventos', 'Torneos y amistosos'),
  ('Alcances', 'Proyectos internos'),
  ('Alcances', 'Alianzas y eventos externos'),
  ('Documentación', 'Políticas internas'),
  ('Documentación', 'Procesos operativos'),
  ('Documentación', 'Recursos Humanos')
) as sub(parent_name, name) on f.name = sub.parent_name
where f.parent_id is null;
