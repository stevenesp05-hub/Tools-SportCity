import { describe, expect, it } from 'vitest'
import {
  evaluateFormula,
  formatResult,
  parseNumber,
  parseRef,
} from '../formulas'

const grid = [
  ['Concepto', 'Monto'],
  ['Balones', 'C$ 1,250.50'],
  ['Redes', '800'],
  ['Conos', ''],
]
const get = (row: number, col: number) => {
  const text = grid[row]?.[col] ?? ''
  return parseNumber(text)
}

describe('fórmulas de tabla', () => {
  it('lee números con moneda y separadores', () => {
    expect(parseNumber('C$ 1,250.50')).toBe(1250.5)
    expect(parseNumber('1.250,50')).toBe(1250.5)
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('abc')).toBeNull()
    expect(parseRef('B3')).toEqual({ row: 2, col: 1 })
  })

  it('suma, promedio y aritmética con referencias', () => {
    expect(evaluateFormula('=SUMA(B2:B4)', get)).toBe(2050.5)
    expect(evaluateFormula('=PROMEDIO(B2:B4)', get)).toBe(1025.25)
    expect(evaluateFormula('=B2+B3*2', get)).toBe(2850.5)
    expect(evaluateFormula('=(B2+B3)/2', get)).toBe(1025.25)
    expect(evaluateFormula('=MAX(B2:B4)-MIN(B2:B4)', get)).toBe(450.5)
    expect(evaluateFormula('=CONTAR(B2:B4)', get)).toBe(2)
    expect(evaluateFormula('=B2:B3', get)).toBe(2050.5)
  })

  it('devuelve errores claros', () => {
    expect(evaluateFormula('=B2/0', get)).toBe('#DIV/0!')
    expect(evaluateFormula('=FOO(B2)', get)).toBe('#NOMBRE?')
    expect(evaluateFormula('=2+', get)).toBe('#ERROR')
    expect(evaluateFormula('=B2 B3', get)).toBe('#ERROR')
  })

  it('da formato al resultado', () => {
    expect(formatResult(2050.5, 'nio')).toBe('C$ 2,050.50')
    expect(formatResult(2050.5, 'number')).toBe('2,050.5')
    expect(formatResult(0.256, 'percent')).toBe('25.6%')
  })
})
