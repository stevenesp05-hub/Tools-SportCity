import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { buildDocx, prepareHtmlForDocx } from '../docx.server'

const input = {
  title: 'Reglamento de prueba',
  folderName: 'Reglamentos',
  contentHtml:
    '<h2>Sanciones</h2><p style="text-align:center"><span style="color:#c2542b">Rojo</span> y <mark style="background-color:#fff3b0">marcado</mark></p>' +
    '<table data-border="3" data-border-color="navy"><tbody><tr><th><p>Falta</p></th><th><p>Multa</p></th></tr><tr><td><p>Amarilla</p></td><td><p>C$ 50</p></td></tr></tbody></table>' +
    '<ul data-type="taskList"><li data-checked="true"><div><p>Hecho</p></div></li></ul>' +
    '<div data-page-break></div><h2>Segunda hoja</h2><p>Fin.</p>',
  headings: ['Sanciones'],
  versionNumber: 2,
  updatedAt: '2026-09-19T12:00:00Z',
  authorName: 'Ana',
  status: 'vigente' as const,
  approvedBy: 'Luis',
  approvedAt: '2026-09-19T12:00:00Z',
}

describe('exportación a .docx', () => {
  it('adapta figuras, marcas, tareas, saltos y líneas de tabla', () => {
    const out = prepareHtmlForDocx(
      '<figure class="sc-figure" data-align="right" style="width: 50%"><img src="data:image/png;base64,AAAA"><figcaption>Pie</figcaption></figure>' +
        input.contentHtml,
    )
    expect(out).toContain('<p style="text-align:right"><img')
    expect(out).toContain('<em>Pie</em>')
    expect(out).toContain('<span style="background-color:#fff3b0">')
    expect(out).toContain('☑ Hecho')
    expect(out).toContain('page-break-after: always')
    expect(out).toContain('border:3px solid #1e1a6b')
  })

  it('genera un .docx válido con el contenido', async () => {
    const buffer = await buildDocx(input)
    const zip = await JSZip.loadAsync(buffer)
    expect(Object.keys(zip.files)).toContain('word/document.xml')
    const { value } = await mammoth.extractRawText({ buffer })
    expect(value).toContain('Reglamento de prueba')
    expect(value).toContain('Sanciones')
    expect(value).toContain('Amarilla')
    expect(value).toContain('Segunda hoja')
  }, 60_000)
})

describe('despliegue serverless', () => {
  it('PDF y Word no dependen del directorio actual (en Vercel no existe public/)', async () => {
    const { renderDocumentPdf } = await import('../pdf.server')
    const original = process.cwd()
    process.chdir('/tmp')
    try {
      const pdf = await renderDocumentPdf(input, { cover: true })
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
      const docx = await buildDocx(input)
      expect(docx.length).toBeGreaterThan(1000)
    } finally {
      process.chdir(original)
    }
  }, 90_000)
})

describe('validación de imágenes', () => {
  it('reconoce las firmas reales y rechaza lo demás', async () => {
    const { hasImageSignature } = await import('../../server/images.server')
    expect(
      hasImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10])),
    ).toBe(true)
    expect(hasImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    )
    expect(
      hasImageSignature(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39])),
    ).toBe(true)
    expect(
      hasImageSignature(
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe(true)
    expect(
      hasImageSignature(new TextEncoder().encode('<svg onload=alert(1)>')),
    ).toBe(false)
    expect(hasImageSignature(new Uint8Array(0))).toBe(false)
  })
})

describe('descarga directa', () => {
  it('genera un attachment con nombre ASCII y UTF-8 con tildes', async () => {
    const { attachment } = await import('../content-disposition')
    const header = attachment('Reglamento: Liga "2026" / Ñandú', 'pdf')
    expect(
      header.startsWith(
        'attachment; filename="Reglamento Liga 2026 Nandu.pdf"',
      ),
    ).toBe(true)
    expect(header).toContain(
      "filename*=UTF-8''Reglamento%20Liga%202026%20%C3%91and%C3%BA.pdf",
    )
    expect(attachment('   ', 'zip')).toContain('documento.zip')
  })
})
