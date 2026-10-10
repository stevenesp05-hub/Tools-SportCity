import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import WordExtractor from 'word-extractor'
import {
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  cellText,
  decodeCsvBytes,
  docTextToHtml,
  parseCsv,
  rowsToTable,
  sheetsToHtml,
} from '../import-sheet'

describe('CSV', () => {
  it('lee comillas, comillas dobles y saltos de línea dentro de una celda', () => {
    const rows = parseCsv(
      'Nombre,Nota\n"Pérez, Ana","Dijo ""hola""\ny adiós"\nLuis,\n',
    )
    expect(rows).toEqual([
      ['Nombre', 'Nota'],
      ['Pérez, Ana', 'Dijo "hola"\ny adiós'],
      ['Luis', ''],
    ])
  })

  it('detecta el punto y coma de un Excel en español y los tabuladores', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('entiende un CSV guardado en Windows-1252 (acentos) además de UTF-8', () => {
    const latin1 = Uint8Array.from(
      [...'Reunión;Año'].map((c) => c.charCodeAt(0)),
    )
    expect(decodeCsvBytes(latin1)).toBe('Reunión;Año')
    expect(decodeCsvBytes(new TextEncoder().encode('Reunión;Año'))).toBe(
      'Reunión;Año',
    )
  })
})

describe('celdas y tablas', () => {
  it('formatea fechas, números y booleanos', () => {
    expect(cellText(new Date(Date.UTC(2026, 9, 5)))).toBe('05/10/2026')
    expect(cellText(new Date(Date.UTC(2026, 9, 5, 14, 30)))).toBe(
      '05/10/2026 14:30',
    )
    expect(cellText(1500)).toBe('1500')
    expect(cellText(0.1 + 0.2)).toBe('0.3')
    expect(cellText(true)).toBe('Sí')
    expect(cellText(null)).toBe('')
  })

  it('la primera fila es el encabezado; completa filas cortas y quita lo vacío del final', () => {
    const t = rowsToTable([
      [],
      ['Alumno', 'Grupo', ''],
      ['Ana', 'U10'],
      ['Luis'],
      [],
      ['', ''],
    ])
    expect(t?.rows).toBe(2)
    expect(t?.html).toContain(
      '<th><p>Alumno</p></th><th><p>Grupo</p></th></tr>',
    )
    expect(t?.html).toContain('<td><p>Luis</p></td><td><p></p></td>')
    expect(t?.html).not.toContain('Columna')
  })

  it('escapa el HTML de las celdas', () => {
    const t = rowsToTable([['<b>x</b>'], ['<script>alert(1)</script>']])
    expect(t?.html).not.toContain('<script>')
    expect(t?.html).toContain('&lt;script&gt;')
  })

  it('corta lo que pasa de los máximos y lo avisa', () => {
    const big = [
      ['a'],
      ...Array.from({ length: MAX_SHEET_ROWS + 5 }, (_, i) => [String(i)]),
    ]
    const t = rowsToTable(big)
    expect(t?.rows).toBe(MAX_SHEET_ROWS)
    expect(t?.truncated).toBe(true)
    const wide = [Array.from({ length: MAX_SHEET_COLS + 5 }, (_, i) => `c${i}`)]
    expect(rowsToTable(wide)?.truncated).toBe(true)
  })

  it('una hoja vacía no genera tabla; varias hojas llevan su título', () => {
    expect(rowsToTable([[''], []])).toBeNull()
    const one = sheetsToHtml([{ name: 'Hoja1', data: [['a'], ['1']] }])
    expect(one.html).not.toContain('<h2>')
    const many = sheetsToHtml([
      { name: 'Centro', data: [['a'], ['1']] },
      { name: 'Vacía', data: [] },
      { name: 'Norte', data: [['a'], ['2']] },
    ])
    expect(many.html).toContain('<h2>Centro</h2>')
    expect(many.html).toContain('<h2>Norte</h2>')
    expect(many.html).not.toContain('Vacía')
  })
})

describe('Word antiguo (.doc)', () => {
  it('lee un .doc real de Word 97 conservando acentos y una línea por párrafo', async () => {
    const buffer = readFileSync(
      new URL('./fixtures/word-97.doc', import.meta.url),
    )
    const text = (await new WordExtractor().extract(buffer)).getBody()
    const html = docTextToHtml(text)
    expect(html).toContain('<p>Reglamento de prueba</p>')
    expect(html).toContain('<p>Primer párrafo con ñ y acentos: reunión.</p>')
    expect(html).toContain('<p>Segundo párrafo.</p>')
    expect(html).toContain('<p>Falta   Multa</p>')
  })

  it('un archivo que no es un .doc no se lee (el servidor lo convierte en un aviso claro)', async () => {
    await expect(
      new WordExtractor().extract(Buffer.from('esto no es un doc')),
    ).rejects.toBeTruthy()
  })
})

describe('Excel (.xlsx) con read-excel-file', () => {
  /** .xlsx mínimo y válido, armado a mano: dos hojas, texto compartido, número y fecha. */
  async function makeXlsx() {
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    )
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    )
    zip.file(
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Centro" sheetId="1" r:id="rId1"/><sheet name="Norte" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    )
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    )
    zip.file(
      'xl/sharedStrings.xml',
      `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>Alumno</t></si><si><t>Nacimiento</t></si><si><t>Ñandú Pérez</t></si><si><t>Ana</t></si></sst>`,
    )
    zip.file(
      'xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    )
    zip.file(
      'xl/worksheets/sheet1.xml',
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Puntos</t></is></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46300</v></c><c r="C2"><v>12.5</v></c></row></sheetData></worksheet>`,
    )
    zip.file(
      'xl/worksheets/sheet2.xml',
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c></row></sheetData></worksheet>`,
    )
    return zip.generateAsync({ type: 'nodebuffer' })
  }

  it('lee todas las hojas, con texto, número y fecha, y las convierte en tablas', async () => {
    const buffer = await makeXlsx()
    const { default: readExcelFile } = await import('read-excel-file/node')
    const sheets = (await readExcelFile(buffer)) as unknown as Array<{
      sheet: string
      data: unknown[][]
    }>
    expect(sheets.map((s) => s.sheet)).toEqual(['Centro', 'Norte'])
    const { html } = sheetsToHtml(
      sheets.map((s) => ({ name: s.sheet, data: s.data })),
    )
    expect(html).toContain('<h2>Centro</h2>')
    expect(html).toContain('<h2>Norte</h2>')
    expect(html).toContain('Ñandú Pérez')
    expect(html).toContain('12.5')
    // 46300 = 2026-10-05 en el calendario de Excel
    expect(html).toMatch(/<td><p>\d{2}\/\d{2}\/2026<\/p><\/td>/)
  })
})
