import { THEME_INFO, themeOf } from '#/lib/doc-themes'
import { LOGO_MARK } from '#/lib/brand-assets'
import type { DocumentPdfInput } from '#/lib/pdf-template'
import { decodeAttr, parseOrg } from '#/lib/diagrams'
import type { ChartItem, OrgNode } from '#/lib/diagrams'
import {
  chartTableRows,
  legacyChartToSpec,
  normalizeChartSpec,
} from '#/lib/charts'
import type { ChartSpec } from '#/lib/charts'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const BORDER_COLORS: Record<string, string> = {
  gray: '#9aa0b8',
  navy: '#1e1a6b',
  ink: '#1b1b3a',
}

/** Sustituye cada <div …> que cumple `open` (con sus divs anidados) por lo que devuelva `replace`. */
function replaceDivBlocks(
  html: string,
  open: RegExp,
  replace: (openTag: string, inner: string) => string,
): string {
  let out = ''
  let cursor = 0
  const re = new RegExp(open.source, 'g')
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index < cursor) continue
    let depth = 1
    const tags = /<div\b|<\/div>/g
    tags.lastIndex = m.index + m[0].length
    let end = -1
    let innerEnd = -1
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      depth += t[0] === '</div>' ? -1 : 1
      if (depth === 0) {
        innerEnd = t.index
        end = t.index + t[0].length
        break
      }
    }
    if (end === -1) break
    out +=
      html.slice(cursor, m.index) +
      replace(m[0], html.slice(m.index + m[0].length, innerEnd))
    cursor = end
    re.lastIndex = end
  }
  return out + html.slice(cursor)
}

const orgToList = (nodes: OrgNode[]): string =>
  `<ul>${nodes
    .map(
      (n) =>
        `<li><p><strong>${escapeHtml(n.name)}</strong>${n.role ? ` — ${escapeHtml(n.role)}` : ''}</p>${n.children.length ? orgToList(n.children) : ''}</li>`,
    )
    .join('')}</ul>`

/** Firmas → tabla sin bordes: espacio para firmar, una línea y la leyenda debajo de cada firmante. */
function signaturesToWordHtml(inner: string): string {
  const signers = [
    ...inner.matchAll(
      /<div[^>]*data-signature(?:="")?[^>]*>([\s\S]*?)<\/div>/g,
    ),
  ]
  if (signers.length === 0) return ''
  const cells = signers
    .map(
      (m) =>
        `<td><p>&nbsp;</p><p>&nbsp;</p><p style="text-align:center">______________________________</p>${m[1].replace(
          /<p>/g,
          '<p style="text-align:center">',
        )}</td>`,
    )
    .join('')
  return `<table data-border="none"><tbody><tr>${cells}</tr></tbody></table>`
}

/** Word no dibuja el gráfico: se entrega su título, su tabla de datos y la nota. */
function chartToWordHtml(spec: ChartSpec): string {
  const [header, ...rows] = chartTableRows(spec)
  const cell = (tag: 'th' | 'td', value: string) =>
    `<${tag}><p>${escapeHtml(value)}</p></${tag}>`
  return (
    (spec.title ? `<p><strong>${escapeHtml(spec.title)}</strong></p>` : '') +
    (spec.subtitle ? `<p>${escapeHtml(spec.subtitle)}</p>` : '') +
    `<table><tbody><tr>${header.map((h) => cell('th', h)).join('')}</tr>${rows
      .map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`)
      .join('')}</tbody></table>` +
    (spec.note
      ? `<p><span style="font-size:9pt;color:#6a70a0"><em>${escapeHtml(spec.note)}</em></span></p>`
      : '')
  )
}

/**
 * Adapta el HTML del editor a lo que entiende el conversor a .docx: figuras como imagen con pie,
 * marcas como texto con fondo, tareas con casilla, saltos de página y líneas de tabla con grosor.
 */
export function prepareHtmlForDocx(html: string): string {
  let out = html

  // Gráficos → tabla de datos; organigrama → lista con sangría (Word no dibuja ninguno de los dos).
  out = replaceDivBlocks(
    out,
    /<div[^>]*data-chart-spec="([^"]*)"[^>]*>/,
    (tag) => {
      const encoded = /data-chart-spec="([^"]*)"/.exec(tag)?.[1] ?? null
      return chartToWordHtml(
        normalizeChartSpec(decodeAttr<unknown>(encoded, null)),
      )
    },
  )
  out = replaceDivBlocks(
    out,
    /<div[^>]*data-chart-items="([^"]*)"[^>]*>/,
    (tag) => {
      const encoded = /data-chart-items="([^"]*)"/.exec(tag)?.[1] ?? null
      const data = decodeAttr<{ title: string; items: ChartItem[] }>(encoded, {
        title: '',
        items: [],
      })
      return chartToWordHtml(
        legacyChartToSpec({
          kind: 'bars',
          title: data.title,
          items: data.items,
        }),
      )
    },
  )
  out = replaceDivBlocks(
    out,
    /<div[^>]*data-signatures(?:="")?[^>]*>/,
    (_tag, inner) => signaturesToWordHtml(inner),
  )
  out = replaceDivBlocks(out, /<div[^>]*data-org="([^"]*)"[^>]*>/, (tag) => {
    const encoded = /data-org="([^"]*)"/.exec(tag)?.[1] ?? null
    return orgToList(parseOrg(decodeAttr<string>(encoded, '')))
  })

  out = out.replace(
    /<figure[^>]*data-align="(\w+)"[^>]*style="[^"]*?width:\s*(\d+)%[^"]*"[^>]*>\s*<img([^>]*?)\/?>\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g,
    (_m, align: string, width: string, imgAttrs: string, caption?: string) => {
      const px = Math.round((Number(width) / 100) * 600)
      const img = `<img${imgAttrs} width="${px}" />`
      const cap = caption
        ? `<br><span style="font-size:9pt;color:#6a70a0"><em>${caption}</em></span>`
        : ''
      return `<p style="text-align:${align}">${img}${cap}</p>`
    },
  )

  out = out
    .replace(/<mark([^>]*)>/g, '<span$1>')
    .replace(/<\/mark>/g, '</span>')

  out = out.replace(
    /<li([^>]*)data-checked="(true|false)"([^>]*)>\s*<div>\s*<p>/g,
    (_m, a: string, checked: string, b: string) =>
      `<li${a}${b}><p>${checked === 'true' ? '☑' : '☐'} `,
  )
  out = out.replace(/<\/p>\s*<\/div>\s*<\/li>/g, '</p></li>')

  out = out.replace(
    /<div data-page-break(?:="")?><\/div>/g,
    '<div style="page-break-after: always"></div>',
  )

  out = out.replace(
    /<table([^>]*)>([\s\S]*?)<\/table>/g,
    (whole, attrs: string, inner: string) => {
      const width = /data-border="(none|1|2|3)"/.exec(attrs)?.[1]
      if (!width) return whole
      const color =
        BORDER_COLORS[/data-border-color="(\w+)"/.exec(attrs)?.[1] ?? 'gray'] ??
        BORDER_COLORS.gray
      const border =
        width === 'none' ? 'border:none' : `border:${width}px solid ${color}`
      const cells = inner.replace(
        /<(td|th)([^>]*?)(?:\s+style="([^"]*)")?>/g,
        (_c, tag: string, a: string, style?: string) =>
          `<${tag}${a} style="${border};${style ?? ''}">`,
      )
      return `<table${attrs}>${cells}</table>`
    },
  )

  // Encabezados de tabla como en la marca: fondo azul marino y texto blanco.
  out = out.replace(
    /<th([^>]*?)(?:\s+style="([^"]*)")?>([\s\S]*?)<\/th>/g,
    (_m, attrs: string, style: string | undefined, inner: string) =>
      `<th${attrs} style="background-color:#e9ecf6;${style ?? ''}">${inner.replace(
        /<p([^>]*)>([\s\S]*?)<\/p>/g,
        '<p$1><span style="color:#1e1a6b"><strong>$2</strong></span></p>',
      )}</th>`,
  )

  return out
}

const logoDataUri = () => LOGO_MARK

/** Genera un .docx real (editable en Word) con cabecera de marca, título y el contenido del documento. */
export async function buildDocx(input: DocumentPdfInput): Promise<Buffer> {
  const HTMLtoDOCX = (await import('html-to-docx')).default
  const statusLabel = input.status === 'borrador' ? 'Borrador' : input.status
  const approval =
    input.approvedBy && input.approvedAt && input.status !== 'borrador'
      ? `<p style="font-size:9pt;color:#6a70a0">Aprobado por ${escapeHtml(input.approvedBy)} el ${new Date(input.approvedAt).toLocaleDateString('es-NI')}</p>`
      : ''

  const body = `
    <p style="font-size:8pt;color:#3f78b5"><strong>${escapeHtml(input.folderName.toUpperCase())}</strong></p>
    <h1 style="color:#1e1a6b">${escapeHtml(input.title)}</h1>
    <p style="font-size:9pt;color:#6a70a0">Versión ${input.versionNumber} · ${escapeHtml(statusLabel)}</p>
    ${approval}
    ${prepareHtmlForDocx(input.contentHtml)}
  `
  const header = `<p><img src="${logoDataUri()}" width="26" height="26" /> <strong style="color:#1e1a6b">Sport City</strong> <span style="color:#6a70a0;font-size:7pt">CLUB</span> <span style="color:#6a70a0;font-size:8pt">· ${escapeHtml(input.title)}</span></p>`
  const footer =
    '<p style="text-align:center;font-size:8pt;color:#6a70a0">Sport City Club · carretera norte, Km 8.5, Managua · 5865-1010 · info@sportcityclub.com · www.sportcitynic.com</p>'

  // El HTML se escribe con la paleta corporativa; se cambia por la del tema del documento.
  const colors = THEME_INFO[themeOf(input.theme)].colors
  const themed = (html: string) =>
    html
      .replaceAll('#1e1a6b', colors.navy)
      .replaceAll('#6a70a0', colors.gray)
      .replaceAll('#9aa0b8', colors.rule)
      .replaceAll('#3f78b5', colors.navy)

  const result = await HTMLtoDOCX(
    themed(body),
    themed(header),
    {
      title: input.title,
      creator: 'Sport City Tools',
      font: 'Calibri',
      fontSize: 22,
      pageNumber: true,
      footer: true,
      header: true,
      table: { row: { cantSplit: true } },
      margins: { top: 1500, bottom: 1300, left: 1300, right: 1300 },
    },
    themed(footer),
  )
  if (Buffer.isBuffer(result)) return result
  if (result instanceof ArrayBuffer) return Buffer.from(result)
  return Buffer.from(await result.arrayBuffer())
}
