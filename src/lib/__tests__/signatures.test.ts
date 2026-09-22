import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/html/server'
import { getSchema } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { buildDocx } from '../docx.server'
import { convertStyledHtml } from '../import-html'
import { sanitizeContentHtml } from '../sanitize.server'
import { SCHEMA_EXTENSIONS, signaturesContent } from '../editor-extensions'

const html =
  '<p>Antes</p><div data-signatures><div data-signature><p>Firma del jugador</p><p>Nombre y cédula</p></div><div data-signature><p>Firma del capitán</p><p>Nombre completo</p></div></div><p>Después</p>'

const kinds = (node: { type?: string; content?: unknown[] }): string[] => [
  node.type ?? '',
  ...(
    (node.content ?? []) as Array<{ type?: string; content?: unknown[] }>
  ).flatMap(kinds),
]

describe('bloque de firmas', () => {
  it('el HTML guardado vuelve a ser un bloque de firmas con sus firmantes', () => {
    const json = generateJSON(sanitizeContentHtml(html), SCHEMA_EXTENSIONS)
    const types = kinds(json)
    expect(types.filter((t) => t === 'signatures')).toHaveLength(1)
    expect(types.filter((t) => t === 'signature')).toHaveLength(2)
  })

  it('el saneado conserva el marcado del bloque', () => {
    const clean = sanitizeContentHtml(html)
    expect(clean).toContain('data-signatures')
    expect(clean).toContain('data-signature')
    expect(clean).toContain('Firma del jugador')
  })

  it('lo que inserta el menú «/» es válido para el esquema (1 a 3 firmantes)', () => {
    const schema = getSchema(SCHEMA_EXTENSIONS)
    for (const labels of [
      [['Firma']],
      [['Firma A', 'Nombre'], ['Firma B']],
      [['A'], ['B'], ['C']],
    ]) {
      const doc = PMNode.fromJSON(schema, {
        type: 'doc',
        content: [signaturesContent(labels), { type: 'paragraph' }],
      })
      expect(() => doc.check()).not.toThrow()
    }
    // Más de tres firmantes no cabe en una fila.
    expect(() =>
      PMNode.fromJSON(schema, {
        type: 'doc',
        content: [signaturesContent([['1'], ['2'], ['3'], ['4']])],
      }).check(),
    ).toThrow()
  })

  it('se importa desde un HTML con ese marcado', () => {
    const { html: out } = convertStyledHtml(`<body>${html}</body>`)
    expect(out).toContain('<div data-signatures>')
    expect(out.match(/<div data-signature>/g)).toHaveLength(2)
    expect(out).toContain('<p>Firma del capitán</p>')
  })

  it('Word: cada firmante sale con su línea y su leyenda', async () => {
    const buffer = await buildDocx({
      title: 'Compromiso',
      folderName: 'Pruebas',
      contentHtml: sanitizeContentHtml(html),
      headings: [],
      versionNumber: 1,
      updatedAt: '2026-09-21T12:00:00Z',
      authorName: 'X',
      status: 'vigente' as const,
      approvedBy: null,
      approvedAt: null,
    })
    const { value } = await mammoth.extractRawText({ buffer })
    expect(value).toContain('Firma del jugador')
    expect(value).toContain('Firma del capitán')
    expect(value).toContain('______')
  }, 60_000)
})

describe('carta de compromiso del jugador', () => {
  it('se importa con sus dos puntos de firma y su texto', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../../../material/compromiso-jugador.html', import.meta.url),
      'utf8',
    )
    const { html: out } = convertStyledHtml(source)
    expect(out.match(/<div data-signature>/g)).toHaveLength(2)
    expect(out).toContain('Firma del jugador')
    expect(out).toContain('Firma del capitán o director técnico')
    for (const frase of [
      'Participar bajo mi propio riesgo',
      'Respetar y asumir las sanciones',
      'me comprometo a',
    ])
      expect(out).toContain(frase)
  })
})
