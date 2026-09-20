/** Reglas comunes (editor y PDF) para cuidar cifras y totales de las tablas. */
export const NUMERIC_CELL =
  /^\s*[-+−]?\s*(?:C\$|US\$|\$|€)?\s*[-+−]?\d[\d.,\s]*\s*(?:%|C\$|\$|€)?\s*$/
export const TOTAL_ROW = /^\s*(sub)?\s*total\b/i

/** Columnas (desde la segunda) donde la mayoría de celdas con contenido son cifras. */
export function numericColumns(rows: string[][]): Set<number> {
  const columns = Math.max(0, ...rows.map((r) => r.length))
  const found = new Set<number>()
  for (let c = 1; c < columns; c += 1) {
    const values = rows.map((r) => r[c]).filter((v) => v)
    const numbers = values.filter((v) => NUMERIC_CELL.test(v))
    // La cabecera es texto: se descuenta una celda del total.
    if (
      numbers.length >= 2 &&
      numbers.length / Math.max(1, values.length - 1) >= 0.6
    )
      found.add(c)
  }
  return found
}
