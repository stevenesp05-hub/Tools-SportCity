-- Documentos "destacados para todos": el administrador marca un documento y aparece en el inicio de
-- todo el mundo, sin que cada persona tenga que marcarlo como favorito por su cuenta.
-- Se puede ejecutar más de una vez.

alter table public.documents add column if not exists featured boolean not null default false;

-- Consulta del inicio: documentos destacados, vivos, ordenados por actividad reciente.
create index if not exists documents_featured_idx
  on public.documents (updated_at desc)
  where featured = true and deleted_at is null;

-- Solo el administrador puede fijar o quitar el destacado, igual que el resto de campos de gobierno
-- (visibilidad, estado, aprobación). Se añade al trigger que ya protegía esos campos (migración 0021).
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
       or new.status <> 'borrador'
       or new.featured is true then
      raise exception 'No autorizado: solo un administrador puede fijar el estado, la aprobación, la visibilidad o el destacado de un documento.';
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
  if new.featured is distinct from old.featured then
    raise exception 'No autorizado: solo un administrador puede destacar un documento para todos.';
  end if;
  return new;
end;
$$;
