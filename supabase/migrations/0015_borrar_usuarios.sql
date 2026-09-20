-- Permite borrar usuarios desde Supabase (Authentication → Users).
-- Antes, casi todas las claves foráneas hacia public.profiles no tenían regla de borrado
-- y bloqueaban el borrado con "Database error deleting user".
-- Regla nueva: si la columna admite null, el rastro del autor se conserva sin él (set null);
-- si es obligatoria (comentarios, revisiones, enlaces compartidos), se borra junto al usuario.
do $$
declare
  fk record;
  nullable boolean;
begin
  for fk in
    select
      c.conname,
      c.conrelid::regclass as tbl,
      a.attname as col,
      a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype = 'a'          -- "no action": la que bloquea el borrado
      and array_length(c.conkey, 1) = 1
  loop
    nullable := not fk.notnull;
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete %s',
      fk.tbl, fk.conname, fk.col,
      case when nullable then 'set null' else 'cascade' end
    );
  end loop;
end $$;
