-- Costos y Cuentas por pagar pasan a ser subcarpetas de Proveedores
-- (con todo su contenido) y dejan de ser espacios propios del menú.
update public.folders c
set parent_id = p.id
from public.folders p
where p.name = 'Proveedores' and p.parent_id is null and p.record_id is null
  and c.name in ('Costos', 'Cuentas por pagar') and c.parent_id is null and c.record_id is null;

-- El comparativo de proveedores deja de ser global: solo aparece dentro de Proveedores
-- (y de sus subcarpetas).
update public.document_templates t
set folder_id = p.id
from public.folders p
where t.name = 'Comparativo de proveedores' and t.folder_id is null
  and p.name = 'Proveedores' and p.parent_id is null and p.record_id is null;

-- La solicitud de pago también vive en todo Proveedores, no solo en Cuentas por pagar.
update public.document_templates t
set folder_id = p.id
from public.folders p
where t.name = 'Solicitud de pago'
  and p.name = 'Proveedores' and p.parent_id is null and p.record_id is null;
