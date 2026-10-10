/**
 * Hojas de cálculo y Word antiguo al importar: CSV y Excel pasan a tablas del documento, y el texto de un
 * .doc a párrafos. Todo lo de aquí es puro (sin red ni librerías de lectura de archivos), así que se
 * prueba aparte; quien lee el .xlsx o el .doc de verdad es `src/server/import.ts`.
 */

/** Filas y columnas máximas que entran: más allá, un documento deja de ser el sitio para esos datos. */
export const MAX_SHEET_ROWS = 3000
export const MAX_SHEET_COLS = 30

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// ---------- CSV ----------

/** Un CSV de Excel en español usa «;» y a veces se guarda en Windows-1252 en vez de UTF-8. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Separador más probable: el que más veces aparece fuera de comillas en la primera línea. */
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '\n') break
    else if (!quoted && ch in counts) counts[ch] += 1
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return best[1] === 0 ? ',' : best[0]
}

/** CSV (RFC 4180: comillas, comillas dobles escapadas, saltos de línea dentro de una celda) a filas. */
export function parseCsv(input: string): string[][] {
  const text = (
    input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  ).replace(/\r\n?/g, '\n')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// ---------- Celdas y tablas ----------

// Caracteres de control (salvo tabulador y saltos de línea): no tienen cabida en un documento.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g

const pad = (n: number) => String(n).padStart(2, '0')

/** Texto de una celda de Excel o CSV: las fechas como dd/mm/aaaa, los números sin notación científica. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const day = `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`
    const hasTime = value.getUTCHours() !== 0 || value.getUTCMinutes() !== 0
    return hasTime
      ? `${day} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
      : day
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number')
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toPrecision(12)))
  return String(value).replace(CONTROL_CHARS, '').trim()
}

export type TableResult = {
  html: string
  /** Filas de datos que hay en la tabla (sin la de encabezados). */
  rows: number
  truncated: boolean
}

/**
 * Filas → tabla HTML. La primera fila no vacía es el encabezado. Quita filas y columnas vacías del
 * final, completa las filas cortas y corta lo que pase de los máximos (avisando de ello).
 */
export function rowsToTable(
  raw: ReadonlyArray<ReadonlyArray<unknown>>,
): TableResult | null {
  const grid = raw.map((r) => r.map(cellText))
  while (grid.length > 0 && grid[grid.length - 1].every((c) => c === ''))
    grid.pop()
  while (grid.length > 0 && grid[0].every((c) => c === '')) grid.shift()
  if (grid.length === 0) return null

  let cols = 0
  for (const r of grid)
    for (let c = r.length - 1; c >= 0; c -= 1)
      if (r[c] !== '') {
        cols = Math.max(cols, c + 1)
        break
      }
  if (cols === 0) return null
  const truncated = grid.length - 1 > MAX_SHEET_ROWS || cols > MAX_SHEET_COLS
  const width = Math.min(cols, MAX_SHEET_COLS)
  const body = grid.slice(1, MAX_SHEET_ROWS + 1)

  const cell = (tag: 'th' | 'td', value: string) =>
    `<${tag}><p>${escapeHtml(value)}</p></${tag}>`
  const header = Array.from({ length: width }, (_, i) =>
    cell('th', grid[0][i] || `Columna ${i + 1}`),
  ).join('')
  const lines = body
    .map(
      (r) =>
        `<tr>${Array.from({ length: width }, (_, i) => cell('td', r[i] ?? '')).join('')}</tr>`,
    )
    .join('')
  return {
    html: `<table><tr>${header}</tr>${lines}</table>`,
    rows: body.length,
    truncated,
  }
}

/** Varias hojas → un título por hoja con su tabla (una sola hoja no lleva título). */
export function sheetsToHtml(
  sheets: ReadonlyArray<{
    name: string
    data: ReadonlyArray<ReadonlyArray<unknown>>
  }>,
): { html: string; truncated: boolean } {
  const tables = sheets
    .map((s) => ({ name: s.name, table: rowsToTable(s.data) }))
    .filter((s): s is { name: string; table: TableResult } => s.table !== null)
  const truncated = tables.some((t) => t.table.truncated)
  const html = tables
    .map((t) =>
      tables.length > 1
        ? `<h2>${escapeHtml(t.name)}</h2>${t.table.html}`
        : t.table.html,
    )
    .join('')
  return {
    html: truncated
      ? `${html}<p>Solo se importaron las primeras ${MAX_SHEET_ROWS} filas y ${MAX_SHEET_COLS} columnas de cada hoja.</p>`
      : html,
    truncated,
  }
}

// ---------- Word antiguo (.doc) ----------

/**
 * Texto de un .doc a párrafos: Word separa los párrafos con un salto de línea simple. (Las celdas de
 * una tabla llegan separadas por tabuladores, en una línea por fila.) Se pierde el formato; el
 * contenido, no.
 */
export function docTextToHtml(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .split('\n')
      .map((line) => line.replace(/\t+$/, '').trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line.replace(/\t+/g, '   '))}</p>`)
      .join('')
  )
}
