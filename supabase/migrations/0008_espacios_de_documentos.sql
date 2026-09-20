-- Los módulos (Proveedores, Empresas, Presupuestos…) pasan a ser espacios de
-- documentos: una carpeta raíz por módulo, con carpetas y documentos dentro.
-- Los listados en tabla (Registros) siguen disponibles en "Listados".
insert into public.folders (name)
select v.name
from (values
  ('Proveedores'), ('Empresas'), ('Presupuestos'), ('Costos'),
  ('Cuentas por pagar'), ('Facturas'), ('Organigrama')
) as v(name)
where not exists (
  select 1 from public.folders f
  where f.name = v.name and f.parent_id is null and f.record_id is null
);

-- Subcarpetas de arranque (editables, renombrables y eliminables desde la interfaz).
insert into public.folders (name, parent_id)
select sub.name, f.id
from public.folders f
join (values
  ('Proveedores', 'Balones'),
  ('Proveedores', 'Uniformes'),
  ('Proveedores', 'Mantenimiento e instalaciones'),
  ('Presupuestos', 'Eventos'),
  ('Presupuestos', 'Compras y mantenimiento'),
  ('Costos', 'Eventos'),
  ('Costos', 'Operación'),
  ('Facturas', 'Emitidas'),
  ('Facturas', 'Recibidas')
) as sub(parent_name, name) on f.name = sub.parent_name
where f.parent_id is null and f.record_id is null
  and not exists (
    select 1 from public.folders c where c.parent_id = f.id and c.name = sub.name
  );

-- Plantilla global: comparativo de proveedores de un producto.
insert into public.document_templates (name, folder_id, content, content_html)
select
  'Comparativo de proveedores',
  null,
  $json${
    "type": "doc",
    "content": [
      {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Producto: "}]},
      {"type": "paragraph", "content": [{"type": "text", "text": "Comparativo de los proveedores que ofrecen este producto."}]},
      {"type": "table", "content": [
        {"type": "tableRow", "content": [
          {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Proveedor"}]}]},
          {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Contacto"}]}]},
          {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Modelo / producto"}]}]},
          {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Precio"}]}]},
          {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Notas"}]}]}
        ]},
        {"type": "tableRow", "content": [
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]}
        ]},
        {"type": "tableRow", "content": [
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]}
        ]},
        {"type": "tableRow", "content": [
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]},
          {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1, "colwidth": null}, "content": [{"type": "paragraph"}]}
        ]}
      ]},
      {"type": "paragraph"}
    ]
  }$json$::jsonb,
  '<h2>Producto: </h2><p>Comparativo de los proveedores que ofrecen este producto.</p><table><tbody><tr><th colspan="1" rowspan="1"><p>Proveedor</p></th><th colspan="1" rowspan="1"><p>Contacto</p></th><th colspan="1" rowspan="1"><p>Modelo / producto</p></th><th colspan="1" rowspan="1"><p>Precio</p></th><th colspan="1" rowspan="1"><p>Notas</p></th></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p></p>'
where not exists (
  select 1 from public.document_templates where name = 'Comparativo de proveedores' and folder_id is null
);
