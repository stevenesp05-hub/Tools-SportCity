/**
 * Temas visuales de documento. Un tema cambia la paleta y la composición del papel (editor, PDF y Word) sin tocar el contenido:
 * el mismo documento puede verse «Corporativo» hoy y «Propuesta» mañana.
 */
export const DOC_THEMES = [
  'corporate',
  'report',
  'proposal',
  'event',
  'internal',
  'campaign',
] as const
export type DocTheme = (typeof DOC_THEMES)[number]

export type ThemeColors = {
  /** Color principal: títulos, franja del pie, encabezados de tabla. */
  navy: string
  /** Color de acento: kicker, líneas destacadas, textos sobre el pie. */
  accent: string
  /** Texto secundario. */
  gray: string
  /** Fondo suave de celdas y avisos. */
  tint: string
  /** Bordes finos. */
  rule: string
  /** Texto claro sobre el color principal. */
  onNavy: string
}

/**
 * Cómo se compone el documento con cada tema. La paleta cambia poco (todos son Sport City);
 * lo que distingue a una propuesta de un procedimiento es la composición.
 */
export type ThemeStyle = {
  /** Portada: a sangre completa, limpia (blanca), dividida en dos, con diagonal, o sin portada. */
  cover: 'full' | 'clean' | 'split' | 'diagonal' | 'none'
  /** Bloque de título automático (etiqueta + título) sobre el contenido; en campañas lo pone el banner del propio documento. */
  titleBlock: 'show' | 'hide'
  /** Pie: franja de color, línea fina o solo texto (apto para imprimir). */
  footer: 'strip' | 'line' | 'minimal' | 'label'
  /** Títulos de sección: versalitas con línea, barra de acento o simples con filete. */
  heading: 'rule' | 'bar' | 'plain' | 'display'
  /** Tablas: cabecera subrayada, rellena de color o solo líneas finas. */
  table: 'underline' | 'filled' | 'lines'
  /** Filas alternas con fondo tenue. */
  zebra: boolean
  /** Papel: crema (identidad Sport City) o blanco puro (para imprimir). */
  paper: 'cream' | 'white'
}

export const THEME_INFO: Record<
  DocTheme,
  {
    label: string
    description: string
    colors: ThemeColors
    style: ThemeStyle
  }
> = {
  corporate: {
    label: 'Corporativo',
    description: 'Cartas, comunicados y documentos oficiales. Sobrio y blanco.',
    colors: {
      navy: '#1e1a6b',
      accent: '#9fc4ee',
      gray: '#6a70a0',
      tint: '#eef0f8',
      rule: '#9aa0b8',
      onNavy: '#dfe3f5',
    },
    style: {
      titleBlock: 'show',
      cover: 'clean',
      footer: 'strip',
      heading: 'rule',
      table: 'underline',
      zebra: false,
      paper: 'cream',
    },
  },
  report: {
    label: 'Informe',
    description: 'Informes y manuales con portada a sangre completa.',
    colors: {
      navy: '#1e1a6b',
      accent: '#9fc4ee',
      gray: '#6a70a0',
      tint: '#eef0f8',
      rule: '#9aa0b8',
      onNavy: '#dfe3f5',
    },
    style: {
      titleBlock: 'show',
      cover: 'full',
      footer: 'strip',
      heading: 'rule',
      table: 'underline',
      zebra: true,
      paper: 'cream',
    },
  },
  proposal: {
    label: 'Propuesta',
    description: 'Presupuestos, propuestas y presentaciones comerciales.',
    colors: {
      navy: '#14284b',
      accent: '#d9b25f',
      gray: '#66707f',
      tint: '#f3efe4',
      rule: '#b9b3a2',
      onNavy: '#e7ebf3',
    },
    style: {
      titleBlock: 'show',
      cover: 'split',
      footer: 'strip',
      heading: 'bar',
      table: 'filled',
      zebra: false,
      paper: 'cream',
    },
  },
  event: {
    label: 'Evento',
    description: 'Fichas de evento, torneos y propuestas de celebración.',
    colors: {
      navy: '#0f3f8f',
      accent: '#ffb547',
      gray: '#5f7396',
      tint: '#e9f1fb',
      rule: '#9db3d4',
      onNavy: '#e2ecfa',
    },
    style: {
      titleBlock: 'show',
      cover: 'diagonal',
      footer: 'strip',
      heading: 'bar',
      table: 'filled',
      zebra: true,
      paper: 'cream',
    },
  },
  internal: {
    label: 'Interno',
    description:
      'Procedimientos, solicitudes y registros. Limpio y fácil de imprimir.',
    colors: {
      navy: '#26343f',
      accent: '#8fc5b7',
      gray: '#65757f',
      tint: '#edf2f2',
      rule: '#a3b1b5',
      onNavy: '#e0e8e8',
    },
    style: {
      titleBlock: 'show',
      cover: 'none',
      footer: 'minimal',
      heading: 'plain',
      table: 'lines',
      zebra: false,
      paper: 'white',
    },
  },
  campaign: {
    label: 'Campaña',
    description:
      'Comunicación comercial: banner de portada, bloques de impacto y formularios.',
    colors: {
      navy: '#1e1a6b',
      accent: '#9fc4ee',
      gray: '#6a70a0',
      tint: '#eef0f8',
      rule: '#9aa0b8',
      onNavy: '#dfe3f5',
    },
    style: {
      titleBlock: 'hide',
      cover: 'none',
      footer: 'label',
      heading: 'display',
      table: 'filled',
      zebra: true,
      paper: 'white',
    },
  },
}

export function isDocTheme(value: unknown): value is DocTheme {
  return (DOC_THEMES as readonly string[]).includes(value as string)
}

export function themeOf(value: unknown): DocTheme {
  return isDocTheme(value) ? value : 'corporate'
}

/** Variables CSS del tema, listas para un bloque `:root { … }` o un `style` en línea. */
export function themeCssVars(theme: DocTheme): Record<string, string> {
  const c = THEME_INFO[theme].colors
  return {
    '--t-navy': c.navy,
    '--t-accent': c.accent,
    '--t-gray': c.gray,
    '--t-tint': c.tint,
    '--t-rule': c.rule,
    '--t-on-navy': c.onNavy,
  }
}

/** Variables para el papel del editor: además de las `--t-*`, redefine las `--sc-*` que usa la hoja. */
export function sheetThemeVars(theme: DocTheme): Record<string, string> {
  const c = THEME_INFO[theme].colors
  return {
    ...themeCssVars(theme),
    '--sc-navy': c.navy,
    '--sc-accent': c.accent,
    '--sc-gray': c.gray,
    '--sc-line': `color-mix(in srgb, ${c.navy} 14%, transparent)`,
    ...(paperColor(theme) ? { '--sc-paper': paperColor(theme) as string } : {}),
  }
}

/** Tema sugerido al crear un documento, a partir de la plantilla o la carpeta. */
export function suggestTheme(
  ...names: Array<string | null | undefined>
): DocTheme {
  const text = names
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/evento|torneo|cumplean|campeonato|celebrac|liga/.test(text))
    return 'event'
  if (
    /presupuest|propuesta|cotiz|comercial|factur|oferta|precio|tarifa/.test(
      text,
    )
  )
    return 'proposal'
  if (
    /informe|reporte|manual|analisis|auditoria|memoria|diagnostico/.test(text)
  )
    return 'report'
  if (
    /procedimiento|solicitud|checklist|lista|registro|protocolo|inventario|bitacora|control|acta|orden|formato|ficha/.test(
      text,
    )
  )
    return 'internal'
  return 'corporate'
}

/** Variables para el papel: el internal usa papel blanco puro. */
export const paperColor = (theme: DocTheme) =>
  THEME_INFO[theme].style.paper === 'white' ? '#ffffff' : null
