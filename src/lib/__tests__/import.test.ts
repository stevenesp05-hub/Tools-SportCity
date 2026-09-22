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

describe('importación: colores modernos', () => {
  it('lee oklch() (el azul de marca y sus variantes)', async () => {
    const { toHex } = await import('../import-html')
    // Los valores de marca de Sport City: azul marino y celeste.
    expect(toHex('oklch(0.24 0.14 275)')).toMatch(/^#[0-9a-f]{6}$/)
    expect(toHex('oklch(0.83 0.08 240.12)')).toMatch(/^#[0-9a-f]{6}$/)
    expect(toHex('oklch(1 0 0)')).toBe('#ffffff')
    expect(toHex('oklch(0 0 0)')).toBe('#000000')
    // Con transparencia casi total no cuenta como color.
    expect(toHex('oklch(0.5 0.1 200 / 0.05)')).toBeNull()
    expect(toHex('oklch(no es un color)')).toBeNull()
  })
})

describe('importación: HTML de marca con variables CSS y oklch', () => {
  it('resuelve var(--x) y convierte oklch() antes de leer los estilos', async () => {
    const { resolveModernCss } = await import('../import-html')
    const out = resolveModernCss(
      '<style>:root{--navy:oklch(0.24 0.14 275);--main:var(--navy)}.a{background:var(--main)}.b{color:var(--falta,#123456)}</style>',
    )
    expect(out).not.toContain('var(')
    expect(out).not.toContain('oklch(')
    expect(out).toMatch(/\.a\{background:#[0-9a-f]{6}\}/)
    expect(out).toContain('.b{color:#123456}')
  })

  it('la normativa de la liga conserva el azul de marca, las tarjetas y su texto', async () => {
    const { readFileSync } = await import('node:fs')
    const { convertStyledHtml } = await import('../import-html')
    const source = readFileSync(
      new URL('../../../material/normativa.html', import.meta.url),
      'utf8',
    )
    const { html, campaign } = convertStyledHtml(source)
    expect(campaign).toBe(true)
    // El azul marino (oklch en el original) llega como color real al banner y a las cabeceras.
    expect(html.toLowerCase()).toContain('#14065f')
    for (const frase of [
      'Cuido de instalaciones',
      'Juego ganado',
      'Forfait',
      'C$ 100',
    ])
      expect(html).toContain(frase)
  })
})

describe('importación: listas numeradas', () => {
  it('una lista que continúa la anterior conserva su número inicial', async () => {
    const { convertStyledHtml } = await import('../import-html')
    const { sanitizeContentHtml } = await import('../sanitize.server')
    const { html } = convertStyledHtml(
      '<ol><li>Uno</li><li>Dos</li></ol><p>Otro capítulo</p><ol start="3"><li>Tres</li><li>Cuatro</li></ol>',
    )
    expect(html).toContain('<ol start="3">')
    // El saneado (al importar, guardar o exportar a PDF) no debe quitar el número inicial.
    expect(sanitizeContentHtml(html)).toContain('<ol start="3">')
    const json = generateJSON(sanitizeContentHtml(html), SCHEMA_EXTENSIONS)
    const lists = (json.content ?? []).filter(
      (n: { type?: string }) => n.type === 'orderedList',
    ) as Array<{ attrs?: { start?: number } }>
    expect(lists[1].attrs?.start).toBe(3)
  })
})

describe('importación: normativa formal', () => {
  it('conserva capítulos, tablas de marca y la numeración de cláusulas de corrido', async () => {
    const { readFileSync } = await import('node:fs')
    const { convertStyledHtml } = await import('../import-html')
    const source = readFileSync(
      new URL('../../../material/normativa-formal.html', import.meta.url),
      'utf8',
    )
    const { html, campaign } = convertStyledHtml(source)
    expect(campaign).toBe(true)
    for (const inicio of ['11', '15', '18', '20'])
      expect(html).toContain(`<ol start="${inicio}">`)
    for (const frase of [
      'Disposiciones generales',
      'Formato de protesta oficial',
      'Juego ganado',
      'C$100',
      'C$1,680',
    ])
      expect(html).toContain(frase)
    // Las tablas de datos llevan el azul de marca en su cabecera.
    expect(html.toLowerCase()).toContain('#1e1a6b')
  })
})

describe('importación: avisos y resolución de partido', () => {
  it('conserva los avisos del editor con su tono y descarta tonos desconocidos', async () => {
    const { convertStyledHtml } = await import('../import-html')
    const { html } = convertStyledHtml(
      '<body><div data-callout data-tone="warn"><p>Cuidado</p></div><div data-callout data-tone="raro"><p>Otro</p></div></body>',
    )
    expect(html).toContain(
      '<div data-callout data-tone="warn"><p>Cuidado</p></div>',
    )
    expect(html).toContain(
      '<div data-callout data-tone="info"><p>Otro</p></div>',
    )
  })

  it('la resolución de partido se importa con el modelo corporativo (sin activar «Campaña»)', async () => {
    const { readFileSync } = await import('node:fs')
    const { convertStyledHtml } = await import('../import-html')
    const source = readFileSync(
      new URL(
        '../../../material/Resolución de partido jornada 2.html',
        import.meta.url,
      ),
      'utf8',
    )
    const { html, campaign } = convertStyledHtml(source)
    // Tema Corporativo: no debe detectarse como banner de campaña.
    expect(campaign).toBe(false)
    for (const frase of [
      'Datos del partido',
      'Suspensión del encuentro',
      'Nica Sport vs Óptima Cargo',
      'Miguel Barquero',
      'José Carlos Meza',
      'tres (3) fechas',
      'cumplimiento obligatorio',
    ])
      expect(html).toContain(frase)
    expect(html).toContain('<div data-callout data-tone="warn">')
    expect(html).toContain('<div data-signatures>')
  })
})
