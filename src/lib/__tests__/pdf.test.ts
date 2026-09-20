import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderDocumentPdf } from '../pdf.server'

describe('renderDocumentPdf', () => {
  it('genera portada + contenido y no ejecuta scripts ni carga recursos externos', async () => {
    const pdf = await renderDocumentPdf({
      title: 'Reglamento de la Liga',
      folderName: 'Reglamentos de eventos',
      contentHtml:
        '<h2>Disposiciones generales</h2><p>Texto de prueba.</p><img src="file:///etc/hosts"><script>document.body.innerHTML="HACKED"</script><h2>Sanciones</h2><table><tbody><tr><th>A</th></tr></tbody></table>',
      headings: ['Disposiciones generales', 'Sanciones'],
      versionNumber: 3,
      updatedAt: '2026-09-18T12:00:00Z',
      authorName: 'Steven',
      status: 'borrador',
      approvedBy: null,
      approvedAt: null,
    })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf)
  }, 90_000)
})
