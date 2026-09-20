-- Índices para las consultas más frecuentes (listados de carpetas, inicio, notificaciones, papelera).
-- Todos son "if not exists": se puede ejecutar más de una vez sin problema.

-- Documentos de una carpeta (listados, borrar carpeta, ZIP, políticas de visibilidad y cascadas).
create index if not exists documents_folder_id_idx on public.documents (folder_id);

-- Enlaces entrantes y versión actual (join documents ↔ document_versions).
create index if not exists documents_current_version_id_idx
  on public.documents (current_version_id);

-- Inicio y notificaciones: documentos con fecha límite que siguen vivos.
create index if not exists documents_due_date_idx
  on public.documents (due_date)
  where deleted_at is null and due_date is not null;

-- Papelera y purga: solo las filas borradas.
create index if not exists documents_deleted_at_idx
  on public.documents (deleted_at)
  where deleted_at is not null;

-- Subcarpetas (borrado de carpetas, árbol de la barra lateral).
create index if not exists folders_parent_id_idx on public.folders (parent_id);

-- Notificaciones: revisiones que yo pedí y ya fueron decididas.
create index if not exists document_reviews_requested_by_status_idx
  on public.document_reviews (requested_by, status);

-- "Recientes" y "Favoritos" ordenados por fecha.
create index if not exists document_views_user_recent_idx
  on public.document_views (user_id, viewed_at desc);
create index if not exists favorites_user_recent_idx
  on public.favorites (user_id, created_at desc);
