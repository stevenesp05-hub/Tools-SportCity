-- Enlaces compartidos sin autor ni aprobador.
-- El administrador puede crear un enlace que, en el PDF que descarga quien lo recibe, no muestre quién
-- escribió el documento ni quién lo aprobó (formato corporativo, sin nombres).
-- Es "if not exists": se puede ejecutar más de una vez sin problema.
alter table public.document_shares
  add column if not exists hide_authorship boolean not null default false;
