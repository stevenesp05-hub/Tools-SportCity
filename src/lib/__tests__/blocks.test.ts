import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html/server'
import { SCHEMA_EXTENSIONS } from '../editor-extensions'
import { sanitizeContentHtml } from '../sanitize.server'
import { expandDynamicBlocks } from '../dynamic-blocks'
import { buildDocx } from '../docx.server'
import { renderDocumentPdf } from '../pdf.server'
import {
  chartItemsToText,
  encodeAttr,
  parseChartItems,
  parseOrg,
} from '../diagrams'

const items = [
  { label: 'Balones', value: 1250.5 },
  { label: 'Redes', value: 800 },
  { label: 'Conos', value: 300 },
]
const org =
  'Dirección | Gerente general\n  Operaciones | Jefe\n    Canchas | Encargado\n  Administración | Contadora'

const chartHtml = `<div class="sc-chart" data-chart="bars" data-chart-items="${encodeAttr({ title: 'Monto', items })}"><div class="c-title">Monto</div><div class="c-row"><span class="c-label">Balones</span><div class="c-track"><div class="c-fill" style="width: 100%;"></div></div><span class="c-val">1,250.5</span></div></div>`
const orgHtml = `<div class="sc-org" data-org="${encodeAttr(org)}"><ul><li><span class="sc-org-node"><strong>Dirección</strong><small>Gerente general</small></span><ul><li><span class="sc-org-node"><strong>Operaciones</strong></span></li></ul></li></ul></div>`
const html =
  '<h2>Sección uno</h2><p>Texto.</p><h3>Detalle</h3><div data-toc=""></div>' +
  chartHtml +
  orgHtml

const input = {
  title: 'Bloques',
  folderName: 'Pruebas',
  contentHtml: expandDynamicBlocks(sanitizeContentHtml(html)),
  headings: ['Sección uno'],
  versionNumber: 1,
  updatedAt: '2026-09-19T12:00:00Z',
  authorName: 'X',
  status: 'vigente' as const,
  approvedBy: null,
  approvedAt: null,
}

describe('bloques: gráficos, organigrama e índice', () => {
  it('parsea organigramas y datos de gráficos', () => {
    const tree = parseOrg(org)
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.name)).toEqual([
      'Operaciones',
      'Administración',
    ])
    expect(tree[0].children[0].children[0]).toMatchObject({
      name: 'Canchas',
      role: 'Encargado',
    })
    expect(parseChartItems(chartItemsToText(items))).toEqual(items)
    expect(parseChartItems('Sin número: abc\nA: 1,5')).toEqual([
      { label: 'A', value: 1.5 },
    ])
  })

  it('el saneado conserva los bloques y el índice se genera al exportar', () => {
    const clean = sanitizeContentHtml(html)
    expect(clean).toContain('data-chart="bars"')
    expect(clean).toContain('class="c-fill"')
    expect(clean).toContain('sc-org-node')
    const out = expandDynamicBlocks(clean)
    expect(out).toContain('class="sc-toc-title">Contenido')
    expect(out).toContain('sc-toc-item">Sección uno')
    expect(out).toContain('sc-toc-l3">Detalle')
    expect(out).not.toContain('data-toc')
  })

  it('el HTML vuelve a ser nodos del editor', () => {
    const json = generateJSON(sanitizeContentHtml(html), SCHEMA_EXTENSIONS)
    const types = (json.content ?? []).map((n: { type?: string }) => n.type)
    expect(types).toContain('chart')
    expect(types).toContain('orgChart')
    expect(types).toContain('tocBlock')
    const chart = json.content?.find(
      (n: { type?: string }) => n.type === 'chart',
    )
    expect(chart?.attrs?.items).toEqual(items)
    expect(
      json.content?.find((n: { type?: string }) => n.type === 'orgChart')?.attrs
        ?.text,
    ).toBe(org)
  })

  it('Word: el gráfico pasa a tabla de datos y el organigrama a lista', async () => {
    const buffer = await buildDocx(input)
    const { value } = await mammoth.extractRawText({ buffer })
    expect(value).toContain('Balones')
    expect(value).toContain('1,250.5')
    expect(value).toContain('Dirección')
    expect(value).toContain('Gerente general')
  }, 60_000)

  it('PDF con bloques', async () => {
    const pdf = await renderDocumentPdf(input, { cover: false })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf)
  }, 90_000)
})
