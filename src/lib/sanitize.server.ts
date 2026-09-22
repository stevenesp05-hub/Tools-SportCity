import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'div',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
  'span',
  'mark',
  'figure',
  'figcaption',
  'small',
  // Solo lo que dibuja un gráfico: sin scripts, enlaces, estilos en línea ni imágenes externas.
  'svg',
  'g',
  'rect',
  'line',
  'path',
  'circle',
  'text',
  'polyline',
]

const CHART_SHAPE_CLASSES = [
  'grid',
  'axis',
  'tick',
  'lbl',
  'val',
  'in',
  'ctr',
  'ctr-sub',
  'ta-m',
  'ta-e',
  'ta-s',
  'bar',
  'line',
  'area',
  'dot',
  'slice',
  'c-svg',
  ...Array.from({ length: 8 }, (_, i) => `s${i}`),
]

/** Las imágenes antiguas terminaban en .png/.jpg; se sirven igual sin la extensión (ver images.server.ts). */
const legacyImageUrls = (html: string) =>
  html.replace(
    /\/api\/imagenes\/([A-Za-z0-9_-]+)\.(?:png|jpe?g|webp|gif)/g,
    '/api/imagenes/$1',
  )

/**
 * Limpia el HTML que produce el editor antes de guardarlo o renderizarlo
 * (vista previa y PDF): sin scripts, manejadores de eventos ni URLs peligrosas.
 */
export function sanitizeContentHtml(html: string): string {
  return legacyImageUrls(
    sanitizeHtml(html, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: {
        a: ['href', 'target', 'rel'],
        div: [
          'data-callout',
          'data-tone',
          'data-page-break',
          'data-signatures',
          'data-signature',
          'data-toc',
          'data-org',
          'data-chart',
          'data-chart-items',
          'data-chart-spec',
          {
            name: 'data-palette',
            values: ['tema', 'vivo', 'frio', 'calido', 'gris'],
          },
        ],
        svg: ['class', 'viewbox', 'viewBox', 'role', 'aria-label'],
        rect: ['class', 'x', 'y', 'width', 'height', 'rx'],
        line: ['class', 'x1', 'y1', 'x2', 'y2'],
        path: ['class', 'd'],
        circle: ['class', 'cx', 'cy', 'r'],
        polyline: ['class', 'points'],
        text: ['class', 'x', 'y'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        table: [
          { name: 'data-border', values: ['none', '1', '2', '3'] },
          {
            name: 'data-border-color',
            values: ['gray', 'navy', 'ink', 'paper'],
          },
        ],
        tr: ['style'],
        th: ['colspan', 'rowspan', 'colwidth', 'style'],
        td: ['colspan', 'rowspan', 'colwidth', 'style'],
        col: ['style', 'span'],
        p: ['style'],
        h1: ['style'],
        h2: ['style'],
        h3: ['style'],
        h4: ['style'],
        span: ['style'],
        mark: ['style', 'data-color'],
        figure: ['class', 'data-align', 'style'],
        ul: ['data-type'],
        ol: ['start'],
        li: ['data-type', 'data-checked'],
      },
      allowedClasses: {
        figure: ['sc-figure'],
        div: [
          'sc-org',
          'sc-chart',
          'c-row',
          'c-track',
          'c-fill',
          'c-cols',
          'c-col',
          'c-bar',
          'c-title',
          'c-sub',
          'c-legend',
          'c-note',
        ],
        span: [
          'sc-org-node',
          'c-label',
          'c-val',
          'c-key',
          'c-sw',
          'c-lv',
          ...CHART_SHAPE_CLASSES.filter((c) => /^s\d$/.test(c)),
        ],
        svg: CHART_SHAPE_CLASSES,
        rect: CHART_SHAPE_CLASSES,
        line: CHART_SHAPE_CLASSES,
        path: CHART_SHAPE_CLASSES,
        circle: CHART_SHAPE_CLASSES,
        polyline: CHART_SHAPE_CLASSES,
        text: CHART_SHAPE_CLASSES,
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: { img: ['http', 'https', 'data'] },
      allowProtocolRelative: false,
      // Solo los estilos que genera el editor: anchos, colores de marca y alineación.
      allowedStyles: {
        '*': {
          width: [/^\d+(\.\d+)?(px|%)$/],
          height: [/^\d+(\.\d+)?(px|%)$/],
          'min-width': [/^\d+(\.\d+)?(px|%)$/],
          color: [/^#[0-9a-fA-F]{6}$/, /^inherit$/],
          'background-color': [/^#[0-9a-fA-F]{6}$/],
          'text-align': [/^(left|right|center|justify)$/],
          'font-size': [/^\d+(\.\d+)?(px|pt)$/],
          'line-height': [/^\d+(\.\d+)?$/],
        },
      },
      transformTags: {
        a: (tagName, attribs) =>
          // Los enlaces a otros documentos del sistema (relativos) se abren en la misma pestaña.
          /^https?:\/\//i.test(attribs.href)
            ? {
                tagName,
                attribs: {
                  ...attribs,
                  rel: 'noopener noreferrer',
                  target: '_blank',
                },
              }
            : { tagName, attribs },
      },
    }),
  )
}
