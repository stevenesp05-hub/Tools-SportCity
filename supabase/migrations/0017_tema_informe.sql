-- Añade el tema «report» (Informe) a la lista de temas admitidos.
-- Solo hace falta si ya habías aplicado 0016 antes de este cambio; es seguro ejecutarla igualmente.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'theme'
  ) then
    alter table public.documents drop constraint if exists documents_theme_check;
    alter table public.documents
      add constraint documents_theme_check
      check (theme in ('corporate', 'report', 'proposal', 'event', 'internal', 'campaign'));
  end if;
end $$;
