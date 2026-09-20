import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html/server'
import { SCHEMA_EXTENSIONS } from '../editor-extensions'
import { sanitizeContentHtml } from '../sanitize.server'
import { buildDocx } from '../docx.server'
import { renderDocumentPdf } from '../pdf.server'
import { encodeAttr } from '../diagrams'
import {
  CHART_KINDS,
  chartLegend,
  chartSpecOf,
  chartTableRows,
  chartTree,
  formatChartValue,
  hasChartData,
  isSvgTag,
  legacyChartToSpec,
  normalizeChartSpec,
  parsePastedGrid,
} from '../charts'
import type { ChartNode, ChartSpec } from '../charts'

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Serializa el árbol igual que lo haría el editor al guardar (getHTML). */
function toHtml(node: ChartNode | string): string {
  if (typeof node === 'string') return escape(node)
  const attrs = Object.entries(node.a ?? {})
    .map(([k, v]) => ` ${k}="${escape(String(v)).replace(/"/g, '&quot;')}"`)
    .join('')
  const inner = (node.kids ?? []).map(toHtml).join('')
  return isSvgTag(node.tag) && !node.kids?.length && node.tag !== 'text'
    ? `<${node.tag}${attrs}></${node.tag}>`
    : `<${node.tag}${attrs}>${inner}</${node.tag}>`
}

const multi = normalizeChartSpec({
  title: 'Ingresos',
  subtitle: 'Primer trimestre',
  note: 'Fuente: caja',
  categories: ['Enero', 'Febrero', 'Marzo', 'Abril'],
  series: [
    { name: 'Canchas', values: [120, 180, 150, 210] },
    { name: 'Academia', values: [80, null, 95, 120] },
  ],
  format: 'usd',
})
const withKind = (kind: ChartSpec['kind'], extra: Partial<ChartSpec> = {}) =>
  normalizeChartSpec({ ...multi, kind, ...extra })

describe('gráficos: modelo', () => {
  it('normaliza entradas incompletas o dañadas', () => {
    const spec = normalizeChartSpec({
      kind: 'no-existe',
      palette: 'x',
      categories: ['A', 'B'],
      series: [{ name: 'S', values: [1, 'texto', 3] }],
    })
    expect(spec.kind).toBe('columns')
    expect(spec.palette).toBe('tema')
    expect(spec.series[0].values).toEqual([1, null])
    expect(normalizeChartSpec(null).series).toHaveLength(1)
    expect(hasChartData(normalizeChartSpec(null))).toBe(false)
  })

  it('lee los gráficos antiguos (items) y los nuevos (spec)', () => {
    const old = chartSpecOf({
      kind: 'columns',
      title: 'Monto',
      items: [
        { label: 'Balones', value: 1250.5 },
        { label: 'Redes', value: 800 },
      ],
    })
    expect(old.kind).toBe('columns')
    expect(old.categories).toEqual(['Balones', 'Redes'])
    expect(old.series[0].values).toEqual([1250.5, 800])
    expect(legacyChartToSpec({ kind: 'bars', items: [] }).kind).toBe('bars')
    expect(chartSpecOf({ spec: multi }).series).toHaveLength(2)
  })

  it('formatea valores', () => {
    expect(formatChartValue(1250.5, 'number')).toBe('1,250.5')
    expect(formatChartValue(1250, 'nio')).toBe('C$ 1,250')
    expect(formatChartValue(12.5, 'percent')).toBe('12.5%')
    expect(formatChartValue(2_500_000, 'usd', true)).toBe('$ 2.5M')
    expect(formatChartValue(15_000, 'number', true)).toBe('15K')
  })

  it('separa texto pegado desde Excel o listas', () => {
    expect(parsePastedGrid('Ene\t10\t5\nFeb\t20\t7\n')).toEqual([
      ['Ene', '10', '5'],
      ['Feb', '20', '7'],
    ])
    expect(parsePastedGrid('Enero: 1,250.50\nFebrero: 3')).toEqual([
      ['Enero', '1,250.50'],
      ['Febrero', '3'],
    ])
  })

  it('leyenda: series, o partes en circulares; nada con una sola serie', () => {
    expect(chartLegend(withKind('columns')).map((l) => l.label)).toEqual([
      'Canchas',
      'Academia',
    ])
    const pie = chartLegend(withKind('pie'))
    expect(pie).toHaveLength(4)
    expect(pie[0].detail).toContain('%')
    const single = normalizeChartSpec({
      categories: ['A', 'B'],
      series: [{ name: 'V', values: [1, 2] }],
    })
    expect(chartLegend(single)).toEqual([])
    expect(chartLegend({ ...multi, showLegend: false })).toEqual([])
  })
})

describe('gráficos: dibujo', () => {
  for (const { value: kind } of CHART_KINDS) {
    it(`dibuja «${kind}» con datos, con un solo dato y vacío`, () => {
      const full = toHtml(chartTree(withKind(kind)))
      expect(full).toContain('<svg')
      expect(full).toContain('data-chart="' + kind + '"')
      expect(full).not.toContain('NaN')
      expect(full).not.toContain('Infinity')

      const one = normalizeChartSpec({
        kind,
        categories: ['Solo'],
        series: [{ name: 'V', values: [5] }],
      })
      expect(toHtml(chartTree(one))).not.toContain('NaN')

      const empty = toHtml(chartTree(normalizeChartSpec({ kind })))
      expect(empty).toContain('Añade datos')
    })
  }

  it('acepta valores negativos y ceros sin romper la escala', () => {
    const spec = normalizeChartSpec({
      kind: 'columns',
      categories: ['A', 'B', 'C'],
      series: [{ name: 'V', values: [-40, 0, 25] }],
    })
    const html = toHtml(chartTree(spec))
    expect(html).not.toContain('NaN')
    expect(html).toContain('-40')
  })

  it('el circular con un solo valor dibuja un círculo completo', () => {
    const spec = normalizeChartSpec({
      kind: 'pie',
      categories: ['A', 'B'],
      series: [{ name: 'V', values: [10, 0] }],
    })
    expect(toHtml(chartTree(spec))).toContain('<circle')
  })

  it('cada serie usa su color (s0, s1…) y la paleta va en el contenedor', () => {
    const html = toHtml(chartTree(withKind('line', { palette: 'vivo' })))
    expect(html).toContain('data-palette="vivo"')
    expect(html).toContain('bar s0'.replace('bar', 'line'))
    expect(html).toContain('line s1')
  })

  it('la tabla para Word incluye una columna por serie y el % del circular', () => {
    expect(chartTableRows(withKind('columns'))[0]).toEqual([
      'Concepto',
      'Canchas',
      'Academia',
    ])
    const pie = chartTableRows(withKind('donut'))
    expect(pie[0]).toEqual(['Concepto', 'Canchas', '%'])
    expect(pie[1][2]).toMatch(/%$/)
  })
})

const wrap = (spec: ChartSpec) => toHtml(chartTree(spec))

describe('gráficos: saneado, editor y exportación', () => {
  it('el saneado conserva el SVG del gráfico y quita lo peligroso', () => {
    const clean = sanitizeContentHtml(wrap(withKind('columns')))
    expect(clean).toContain('<svg')
    expect(clean.toLowerCase()).toContain('viewbox="0 0 560')
    expect(clean).toContain('class="bar s0"')
    expect(clean).toContain('data-palette="tema"')
    expect(clean).toContain('c-legend')

    const evil = sanitizeContentHtml(
      '<div data-chart="bars" data-palette="x"><svg onload="alert(1)"><script>alert(1)</script>' +
        '<rect class="bar s0" x="1" y="2" width="3" height="4" style="fill:red" onclick="x()"/>' +
        '<a href="javascript:alert(1)"><text>hola</text></a></svg></div>',
    )
    expect(evil).not.toContain('onload')
    expect(evil).not.toContain('onclick')
    expect(evil).not.toContain('<script')
    expect(evil).not.toContain('javascript:')
    expect(evil).not.toContain('style=')
    expect(evil).not.toContain('data-palette="x"')
  })

  for (const { value: kind } of CHART_KINDS) {
    it(`«${kind}»: el HTML guardado vuelve a ser el mismo nodo del editor`, () => {
      const spec = withKind(kind, { palette: 'calido', varyColors: false })
      const json = generateJSON(
        sanitizeContentHtml('<p>Antes</p>' + wrap(spec)),
        SCHEMA_EXTENSIONS,
      )
      const node = json.content?.find(
        (n: { type?: string }) => n.type === 'chart',
      )
      expect(node?.attrs?.spec).toEqual(spec)
    })
  }

  it('los gráficos antiguos siguen abriéndose tras el saneado', () => {
    const items = [
      { label: 'Balones', value: 1250.5 },
      { label: 'Redes', value: 800 },
    ]
    const html = `<div class="sc-chart" data-chart="bars" data-chart-items="${encodeAttr({ title: 'Monto', items })}"><div class="c-title">Monto</div><div class="c-row"><span class="c-label">Balones</span><div class="c-track"><div class="c-fill" style="width: 100%;"></div></div><span class="c-val">1,250.5</span></div></div>`
    const json = generateJSON(sanitizeContentHtml(html), SCHEMA_EXTENSIONS)
    const node = json.content?.[0]
    expect(node?.type).toBe('chart')
    expect(node?.attrs?.spec).toBeNull()
    const spec = chartSpecOf(node?.attrs ?? {})
    expect(spec.title).toBe('Monto')
    expect(spec.series[0].values).toEqual([1250.5, 800])
  })

  const input = (html: string) => ({
    title: 'Gráficos',
    folderName: 'Pruebas',
    contentHtml: sanitizeContentHtml(html),
    headings: [],
    versionNumber: 1,
    updatedAt: '2026-09-20T12:00:00Z',
    authorName: 'X',
    status: 'vigente' as const,
    approvedBy: null,
    approvedAt: null,
  })

  it('Word: el gráfico pasa a título, tabla con todas las series y nota', async () => {
    const buffer = await buildDocx(input(wrap(withKind('columns'))))
    const { value } = await mammoth.extractRawText({ buffer })
    expect(value).toContain('Ingresos')
    expect(value).toContain('Primer trimestre')
    expect(value).toContain('Canchas')
    expect(value).toContain('Academia')
    expect(value).toContain('$ 210')
    expect(value).toContain('Fuente: caja')
  }, 60_000)

  it('PDF con todos los tipos de gráfico', async () => {
    const html = CHART_KINDS.map((k) => wrap(withKind(k.value))).join('')
    const pdf = await renderDocumentPdf(input(html), { cover: false })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf)
  }, 120_000)
})
