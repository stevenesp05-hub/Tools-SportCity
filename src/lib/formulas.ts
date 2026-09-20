/** Fórmulas de tabla estilo hoja de cálculo: =SUMA(B2:B5), =B2*C2, =PROMEDIO(A1:A4)… */

export type FormulaFormat = 'number' | 'nio' | 'usd' | 'percent'

export const FORMULA_FORMATS: ReadonlyArray<{
  value: FormulaFormat
  label: string
}> = [
  { value: 'number', label: 'Número' },
  { value: 'nio', label: 'Córdobas (C$)' },
  { value: 'usd', label: 'Dólares ($)' },
  { value: 'percent', label: 'Porcentaje' },
]

/** Lee un número de una celda: "C$ 1,250.50" → 1250.5. Devuelve null si no hay número. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(cleaned)) return null
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // El último separador es el decimal.
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
  } else if (cleaned.includes(',')) {
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(',', '.')
      : cleaned.replace(/,/g, '')
  }
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatResult(value: number, format: FormulaFormat): string {
  const round = (n: number, max: number) =>
    n.toLocaleString('en-US', { maximumFractionDigits: max })
  const money = (n: number) =>
    n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  if (format === 'nio') return `C$ ${money(value)}`
  if (format === 'usd') return `$ ${money(value)}`
  if (format === 'percent') return `${round(value * 100, 1)}%`
  return round(value, 2)
}

export const columnLetter = (index: number) => {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

const columnIndex = (letters: string) =>
  letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) -
  1

/** Celda a partir de su referencia: "B3" → fila 2, columna 1 (base 0). */
export function parseRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!match) return null
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) }
}

export const cellRef = (row: number, col: number) =>
  `${columnLetter(col)}${row + 1}`

type Token =
  | { t: 'num'; v: number }
  | { t: 'ref'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = []
  const re =
    /\s*(?:(\d+(?:\.\d+)?)|([A-Za-zÁÉÍÓÚáéíóú]+\d+)|([A-Za-zÁÉÍÓÚáéíóú]+)|([-+*/():;,]))/y
  let index = 0
  while (index < source.length) {
    re.lastIndex = index
    const found = re.exec(source)
    if (!found) return source.slice(index).trim() === '' ? tokens : null
    index = re.lastIndex
    const m = found as Array<string | undefined>
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined)
      tokens.push({ t: 'ref', v: m[2].toUpperCase() })
    else if (m[3] !== undefined) tokens.push({ t: 'fn', v: m[3].toUpperCase() })
    else tokens.push({ t: 'op', v: m[4] ?? '' })
  }
  return tokens
}

const FUNCTIONS: Record<string, (values: number[]) => number> = {
  SUMA: (v) => v.reduce((a, b) => a + b, 0),
  SUM: (v) => v.reduce((a, b) => a + b, 0),
  PROMEDIO: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  AVG: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  CONTAR: (v) => v.length,
  COUNT: (v) => v.length,
}

export type CellValue = number | null | { error: string }

/**
 * Evalúa una fórmula. `get(row, col)` devuelve el valor de una celda (número, vacío o error).
 * Resultado: número o un texto de error como "#DIV/0!".
 */
export function evaluateFormula(
  formula: string,
  get: (row: number, col: number) => CellValue,
): number | string {
  const tokens = tokenize(formula.replace(/^\s*=/, ''))
  if (!tokens || tokens.length === 0) return '#ERROR'
  let pos = 0
  const fail = (message: string): never => {
    throw new Error(message)
  }

  const peek = () => tokens[pos] as Token | undefined
  const take = () => tokens[pos++]
  const isOp = (value: string) => {
    const t = peek()
    return t?.t === 'op' && t.v === value
  }

  const cellNumber = (row: number, col: number): number => {
    const value = get(row, col)
    if (value !== null && typeof value === 'object') return fail(value.error)
    return value ?? 0
  }

  // Un rango A1:B3 o una referencia suelta, como lista de números (las celdas vacías se ignoran).
  const readRange = (start: string): number[] => {
    const a = parseRef(start)
    if (!a) return fail('#REF!')
    let b = a
    if (isOp(':')) {
      take()
      const next = take()
      const parsed = next.t === 'ref' ? parseRef(next.v) : null
      if (!parsed) return fail('#REF!')
      b = parsed
    }
    const values: number[] = []
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1)
      for (
        let c = Math.min(a.col, b.col);
        c <= Math.max(a.col, b.col);
        c += 1
      ) {
        const value = get(r, c)
        if (value !== null && typeof value === 'object') fail(value.error)
        else if (value !== null) values.push(value)
      }
    return values
  }

  function expression(): number {
    let value = term()
    while (isOp('+') || isOp('-')) {
      const op = take() as Token & { t: 'op' }
      const rhs = term()
      value = op.v === '+' ? value + rhs : value - rhs
    }
    return value
  }
  function term(): number {
    let value = factor()
    while (isOp('*') || isOp('/')) {
      const op = take() as Token & { t: 'op' }
      const rhs = factor()
      if (op.v === '/' && rhs === 0) return fail('#DIV/0!')
      value = op.v === '*' ? value * rhs : value / rhs
    }
    return value
  }
  function factor(): number {
    const t = take()
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '-') return -factor()
    if (t.t === 'op' && t.v === '(') {
      const value = expression()
      if (!isOp(')')) return fail('#ERROR')
      take()
      return value
    }
    if (t.t === 'ref') {
      if (isOp(':')) {
        // Un rango fuera de una función: se suma.
        pos -= 1
        return FUNCTIONS.SUMA(readRange((take() as { v: string }).v))
      }
      const ref = parseRef(t.v)
      return ref ? cellNumber(ref.row, ref.col) : fail('#REF!')
    }
    if (t.t === 'fn') {
      const fn = FUNCTIONS[t.v] as ((values: number[]) => number) | undefined
      if (!fn || !isOp('(')) return fail('#NOMBRE?')
      take()
      const values: number[] = []
      while (!isOp(')')) {
        const next = peek()
        if (!next) return fail('#ERROR')
        if (next.t === 'ref') {
          take()
          values.push(...readRange(next.v))
        } else {
          values.push(expression())
        }
        if (isOp(',') || isOp(';')) take()
      }
      take()
      return fn(values)
    }
    return fail('#ERROR')
  }

  try {
    const value = expression()
    if (pos < tokens.length) return '#ERROR'
    return Number.isFinite(value) ? value : '#ERROR'
  } catch (err) {
    return err instanceof Error && err.message.startsWith('#')
      ? err.message
      : '#ERROR'
  }
}
