import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { buildDocx } from '../../lib/docx.server'
import {
  STYLE_MAP,
  looksLikeLegacyDoc,
  looksLikeZip,
} from '../../server/import'

const base = {
  title: 'Prueba',
  folderName: 'Carpeta',
  headings: [] as string[],
  versionNumber: 1,
  updatedAt: '2026-09-19T12:00:00Z',
  authorName: null,
  status: 'borrador' as const,
  approvedBy: null,
  approvedAt: null,
}

describe('detección de .doc antiguo y de .docx dañados', () => {
  it('reconoce la firma OLE2 de un .doc 97-2003', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])
    expect(looksLikeLegacyDoc(ole)).toBe(true)
    expect(looksLikeZip(ole)).toBe(false)
  })

  it('reconoce la firma "PK" de un .docx (zip) real', async () => {
    const docx = await buildDocx({ ...base, contentHtml: '<p>Hola</p>' })
    expect(looksLikeZip(docx)).toBe(true)
    expect(looksLikeLegacyDoc(docx)).toBe(false)
  })

  it('un archivo vacío o basura no es ni lo uno ni lo otro', () => {
    expect(looksLikeZip(Buffer.from('no es un docx'))).toBe(false)
    expect(looksLikeLegacyDoc(Buffer.alloc(0))).toBe(false)
  })
})

describe('STYLE_MAP: conserva más formato al importar un .docx', () => {
  it('el subrayado sobrevive (mammoth lo ignora si no se le pide)', async () => {
    const docx = await buildDocx({
      ...base,
      contentHtml: '<p><u>subrayado</u> normal</p>',
    })
    const sinMapa = await mammoth.convertToHtml({ buffer: docx })
    expect(sinMapa.value).not.toContain('<u>')

    const conMapa = await mammoth.convertToHtml(
      { buffer: docx },
      { styleMap: STYLE_MAP },
    )
    expect(conMapa.value).toContain('<u>subrayado</u>')
  })

  it('los encabezados de Word siguen entrando como encabezado, no como párrafo suelto', async () => {
    const docx = await buildDocx({
      ...base,
      contentHtml: '<h2>Un título</h2><p>Cuerpo.</p>',
    })
    const { value } = await mammoth.convertToHtml(
      { buffer: docx },
      { styleMap: STYLE_MAP },
    )
    expect(value).toMatch(/<h[23]>Un título<\/h[23]>/)
  })
})
