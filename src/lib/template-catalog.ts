import type { DocTheme } from '#/lib/doc-themes'

/**
 * Cómo se organizan las plantillas en la galería: por propósito (para qué sirve el documento),
 * a partir del nombre real de cada plantilla. Ninguna categoría se inventa: todas tienen plantillas.
 */
export const TEMPLATE_CATEGORIES = [
  {
    id: 'corporativo',
    label: 'Corporativo',
    hint: 'Cartas, comunicados, actas, políticas y convenios',
  },
  {
    id: 'comercial',
    label: 'Comercial',
    hint: 'Propuestas, cotizaciones y alcances',
  },
  {
    id: 'finanzas',
    label: 'Administración y finanzas',
    hint: 'Presupuestos, compras, facturas y proveedores',
  },
  {
    id: 'operaciones',
    label: 'Operaciones',
    hint: 'Manuales, procedimientos, checklists e inventarios',
  },
  {
    id: 'personas',
    label: 'Personas y estructura',
    hint: 'Puestos, funciones, evaluación y asistencia',
  },
  {
    id: 'eventos',
    label: 'Eventos y ligas',
    hint: 'Reglamentos, bases, inscripciones y actas de partido',
  },
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['id']

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const CATEGORY_RULES: Array<[RegExp, TemplateCategory]> = [
  [
    /evento|liga|torneo|convocatoria|protesta|inscripcion de equipo|acta de partido|codigo de conducta/,
    'eventos',
  ],
  [
    /propuesta|cotizacion|alcance|patrocinio|plan de proyecto|terminos de referencia/,
    'comercial',
  ],
  [
    /presupuesto|requisicion de compra|orden de compra|gastos|factura|conciliacion|pago|proveedor|recepcion de bienes|contrato/,
    'finanzas',
  ],
  [
    /puesto|estructura de area|funciones|desempeno|asistencia|bienvenida/,
    'personas',
  ],
  [
    /manual|guia|procedimiento|instructivo|protocolo|checklist|incidente|mantenimiento|inventario|kardex|activo|conteo|faltantes|baja de|prestamo|entrada de|salida o|atencion/,
    'operaciones',
  ],
]

export function categoryOf(name: string): TemplateCategory {
  const text = normalize(name)
  return CATEGORY_RULES.find(([rule]) => rule.test(text))?.[1] ?? 'corporativo'
}

const THEME_RULES: Array<[RegExp, DocTheme]> = [
  [/propuesta|cotizacion|presupuesto|comparativo|patrocinio/, 'proposal'],
  [
    /informe|manual de|plan de proyecto|terminos de referencia|alcance/,
    'report',
  ],
  [
    /evento|liga|torneo|convocatoria|codigo de conducta|acta de partido|protesta|inscripcion/,
    'event',
  ],
  [
    /checklist|registro|ficha|inventario|kardex|acta|planilla|formato|orden|requisicion|control|solicitud|instructivo|procedimiento|protocolo|mantenimiento|asistencia|conciliacion|evaluacion|estructura|funciones|conteo|faltantes|baja|prestamo|entrada|salida|recepcion|guia/,
    'internal',
  ],
]

/** Tema visual con el que sale cada plantilla: una propuesta no se ve como un procedimiento interno. */
export function themeForTemplate(name: string): DocTheme {
  const text = normalize(name)
  return THEME_RULES.find(([rule]) => rule.test(text))?.[1] ?? 'corporate'
}
