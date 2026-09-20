import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html/server'
import { buildDocx } from '../docx.server'
import { SCHEMA_EXTENSIONS } from '../editor-extensions'
import { sanitizeContentHtml } from '../sanitize.server'
import {
  markdownToHtml,
  normalizeHeadings,
  textToHtml,
} from '../import-convert'

const nodeTypes = (json: { type?: string; content?: unknown[] }): string[] => [
  json.type ?? '',
  ...(
    (json.content ?? []) as Array<{ type?: string; content?: unknown[] }>
  ).flatMap(nodeTypes),
]

describe('importación de documentos', () => {
  it('convierte markdown y texto a HTML del editor', () => {
    const md = markdownToHtml(
      '# Título\n\nUn **párrafo** con *énfasis*.\n\n- uno\n- dos\n\n1. a\n2. b',
    )
    expect(md).toContain('<h2>Título</h2>')
    expect(md).toContain('<strong>párrafo</strong>')
    expect(md).toContain('<ul><li><p>uno</p></li>')
    expect(md).toContain('<ol>')
    expect(textToHtml('Uno\ndos\n\nTres')).toBe('<p>Uno<br>dos</p><p>Tres</p>')
    expect(normalizeHeadings('<h1>A</h1><h5>B</h5>')).toBe(
      '<h2>A</h2><h3>B</h3>',
    )
  })

  it('un .docx exportado se puede volver a importar con su estructura', async () => {
    const docx = await buildDocx({
      title: 'Manual',
      folderName: 'Manuales',
      contentHtml:
        '<h2>Sección</h2><p>Texto <strong>fuerte</strong></p><table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table><ul><li><p>uno</p></li></ul>',
      headings: [],
      versionNumber: 1,
      updatedAt: '2026-09-19T00:00:00Z',
      authorName: null,
      status: 'borrador',
      approvedBy: null,
      approvedAt: null,
    })
    const { value } = await mammoth.convertToHtml({ buffer: docx })
    const clean = sanitizeContentHtml(normalizeHeadings(value))
    const json = generateJSON(clean, SCHEMA_EXTENSIONS)
    const types = nodeTypes(json)
    expect(types).toContain('table')
    expect(types).toContain('tableRow')
    expect(types).toContain('bulletList')
    expect(types).toContain('heading')
  }, 60_000)
})

describe('importación de HTML con diseño', () => {
  it('traduce banner, etiquetas, tarjetas, avisos y llamada a la acción sin perder contenido', async () => {
    const { readFileSync } = await import('node:fs')
    const { convertStyledHtml } = await import('../import-html')
    const source = readFileSync(
      new URL('./fixtures/styled-doc.html', import.meta.url),
      'utf8',
    )
    const { html, campaign } = convertStyledHtml(source)
    expect(campaign).toBe(true)
    expect(html).toContain('data-tone="hero"')
    expect(html).toContain('<em>Todo el año.</em>')
    expect(html).toContain('data-tone="eyebrow"')
    expect(html).toContain('data-tone="ok"')
    expect(html).toContain('data-tone="cta"')
    // tarjetas: dos celdas con fondo propio y la cifra grande conservada
    expect(html).toContain('background-color:#d7e9fb')
    expect(html).toContain('background-color:#1e1a6b')
    expect(html).toContain('font-size:30px')
    // texto en negrita del original
    expect(html).toContain('<strong>Sport City Club</strong>')
    // nada del contenido se pierde
    for (const phrase of [
      'Su lealtad, premiada',
      'C$ 1,620',
      'sportcitynic.com',
      'C$ 5,400',
    ])
      expect(html).toContain(phrase)
  })

  it('un HTML sencillo sin estilos sigue funcionando', async () => {
    const { convertStyledHtml } = await import('../import-html')
    const { html, campaign } = convertStyledHtml(
      '<html><body><h1>Título</h1><p>Hola <b>mundo</b></p><ul><li>Uno</li></ul></body></html>',
    )
    expect(campaign).toBe(false)
    expect(html).toBe(
      '<h2>Título</h2><p>Hola <strong>mundo</strong></p><ul><li><p>Uno</p></li></ul>',
    )
  })
})

describe('importación de HTML con portada', () => {
  it('reconoce la portada con degradado, la ficha, las cifras y los pasos; descarta el pie fijo', async () => {
    const { readFileSync } = await import('node:fs')
    const { convertStyledHtml } = await import('../import-html')
    const { html, campaign } = convertStyledHtml(
      readFileSync(
        new URL('./fixtures/cover-doc.html', import.meta.url),
        'utf8',
      ),
    )
    expect(campaign).toBe(true)
    // portada → banner con etiqueta, titular con palabra destacada y subtítulo
    expect(html).toMatch(
      /^<div data-callout data-tone="hero"><p>Procedimiento operativo<\/p>/,
    )
    expect(html).toContain('<em>proveedores.</em>')
    expect(html).not.toContain('data-page-break')
    // datos de la portada → tabla de ficha
    expect(html).toContain('<th colspan="1" rowspan="1"><p>Versión</p></th>')
    expect(html).toContain('<p>Septiembre 2026</p>')
    // cifras → bloques KPI
    expect((html.match(/data-tone="kpi"/g) ?? []).length).toBe(3)
    // pasos → lista numerada con el título en negrita
    expect(html).toContain(
      '<ol><li><p><strong>Solicitar cotizaciones.</strong>',
    )
    // pie colocado a mano en la página: fuera
    expect(html).not.toContain('Sport City Club · Procedimiento')
  })
})
