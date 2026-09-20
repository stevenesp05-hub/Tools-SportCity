import type { JSONContent } from '@tiptap/react'
import { extractText } from '#/lib/document-text'
import { parseNumber } from '#/lib/formulas'

export type CheckLevel = 'error' | 'warn' | 'info' | 'ok'

export type DocCheck = {
  level: CheckLevel
  title: string
  detail?: string
  /** Texto del documento al que saltar al pulsar la comprobación. */
  reveal?: string
}

const TOTAL_LABEL = /^\s*(sub)?\s*total\b/i
const PLACEHOLDER = /\[[^\]\n]{2,60}\]|\{\{[^}\n]{1,60}\}\}/g

function walk(node: JSONContent, visit: (n: JSONContent) => void) {
  visit(node)
  node.content?.forEach((child) => walk(child, visit))
}

/**
 * Comprobaciones automáticas de un documento (sin IA): campos sin rellenar, totales que no cuadran,
 * tablas a medio completar y estructura. Solo lee el contenido; nunca lo modifica.
 */
export function checkDocument(doc: JSONContent): DocCheck[] {
  const checks: DocCheck[] = []

  // 1) Campos sin rellenar: [Nombre del destinatario], {{cliente.nombre}}…
  const placeholders: string[] = []
  walk(doc, (node) => {
    if (typeof node.text === 'string')
      for (const match of node.text.matchAll(PLACEHOLDER))
        placeholders.push(match[0])
  })
  if (placeholders.length > 0) {
    const unique = [...new Set(placeholders)]
    checks.push({
      level: 'warn',
      title: `${placeholders.length} ${placeholders.length === 1 ? 'campo sin rellenar' : 'campos sin rellenar'}`,
      detail: unique.slice(0, 6).join(' · ') + (unique.length > 6 ? ' …' : ''),
      reveal: unique[0],
    })
  }

  // 2) Tablas: celdas vacías y totales que no cuadran.
  let tableCount = 0
  walk(doc, (node) => {
    if (node.type !== 'table') return
    tableCount += 1
    const rows = (node.content ?? []).map((row) =>
      (row.content ?? []).map((cell) => extractText(cell)),
    )
    const body = rows.filter((_, i) => i > 0)
    const cells = body.flat()
    const empty = cells.filter((text) => text === '').length
    if (cells.length >= 4 && empty / cells.length > 0.4)
      checks.push({
        level: 'info',
        title: `Tabla ${tableCount}: ${empty} de ${cells.length} celdas vacías`,
        detail: rows[0]?.filter(Boolean).slice(0, 4).join(' · ') || undefined,
        reveal: rows[0]?.find(Boolean),
      })

    rows.forEach((row, rowIndex) => {
      if (!TOTAL_LABEL.test(row[0] ?? '')) return
      // Recorre las columnas numéricas de la fila de total y compara con la suma de las filas de arriba.
      let startRow = 1
      for (let r = rowIndex - 1; r >= 1; r -= 1)
        if (TOTAL_LABEL.test(rows[r][0] ?? '')) {
          startRow = r + 1
          break
        }
      row.forEach((text, col) => {
        if (col === 0) return
        const declared = parseNumber(text)
        if (declared === null) return
        const above = rows
          .slice(startRow, rowIndex)
          .map((r) => parseNumber(r[col] ?? ''))
          .filter((n): n is number => n !== null)
        if (above.length < 2) return
        const sum = above.reduce((a, b) => a + b, 0)
        const label = (row[0] ?? '').trim()
        if (Math.abs(sum - declared) > 0.01)
          checks.push({
            level: 'error',
            title: `«${label}» no coincide con la suma`,
            detail: `Tabla ${tableCount}: la suma de las líneas es ${sum.toLocaleString('en-US', { maximumFractionDigits: 2 })} y el total dice ${text.trim()}.`,
            reveal: text.trim(),
          })
        else
          checks.push({
            level: 'ok',
            title: `«${label}» coincide con la suma`,
            detail: `Tabla ${tableCount}: ${above.length} líneas suman ${text.trim()}.`,
          })
      })
    })
  })

  // 3) Estructura.
  const words = extractText(doc).split(/\s+/).filter(Boolean).length
  let headings = 0
  let emptyHeadings = 0
  walk(doc, (node) => {
    if (node.type !== 'heading') return
    headings += 1
    if (extractText(node) === '') emptyHeadings += 1
  })
  if (emptyHeadings > 0)
    checks.push({
      level: 'warn',
      title: `${emptyHeadings} ${emptyHeadings === 1 ? 'título vacío' : 'títulos vacíos'}`,
    })
  if (words > 350 && headings < 2)
    checks.push({
      level: 'info',
      title: 'Documento largo sin apartados',
      detail:
        'Con títulos (H2/H3) el índice lateral y la portada del PDF se generan solos.',
    })

  let images = 0
  walk(doc, (node) => {
    if (node.type === 'image') images += 1
  })

  if (!checks.some((c) => c.level === 'error' || c.level === 'warn'))
    checks.unshift({
      level: 'ok',
      title: 'Sin problemas detectados',
      detail: `${words.toLocaleString('es-NI')} palabras, ${tableCount} ${tableCount === 1 ? 'tabla' : 'tablas'} y ${images} ${images === 1 ? 'imagen' : 'imágenes'} revisadas.`,
    })
  const order: Record<CheckLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    ok: 3,
  }
  return checks.sort((a, b) => order[a.level] - order[b.level])
}
