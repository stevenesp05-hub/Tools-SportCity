-- Búsqueda por título más rápida.
-- El buscador (search.ts) y el selector de enlaces "@" (library.ts) filtran con
-- `title ilike '%texto%'`, que sin índice recorre toda la tabla. Un índice GIN de
-- trigramas (pg_trgm) permite que Postgres lo resuelva sin leer todas las filas.
-- Es "if not exists": se puede ejecutar más de una vez sin problema.

create extension if not exists pg_trgm with schema extensions;

create index if not exists documents_title_trgm_idx
  on public.documents using gin (title extensions.gin_trgm_ops);
