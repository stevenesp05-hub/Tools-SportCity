-- Rol «Comité arbitral».
--
-- PASO 1 de 2: solo añade el valor al tipo `app_role`. Hay que ejecutarlo SOLO y esperar a que
-- termine antes de lanzar 0028_comite_arbitral_permisos.sql: Postgres no deja usar un valor de un
-- enum en la misma transacción en que se crea.
--
-- Se puede ejecutar más de una vez.

alter type public.app_role add value if not exists 'comite_arbitral';
