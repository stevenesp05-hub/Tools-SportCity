import { describe, expect, it } from 'vitest'
import {
  assertNameCase,
  hasShoutedWord,
  nameCaseError,
  toNameCase,
} from '../name-rules'

describe('regla de nombres: solo la primera letra de cada palabra en mayúscula', () => {
  it('admite los nombres normales', () => {
    for (const ok of [
      'Reunión de equipo',
      'Manual De Uso',
      'liga empresarial',
      'Torneo 2026',
      'Liga Empresarial V',
      'Pre-Torneo',
      "O'Brien",
      'Ñandú',
      'Q&A',
      'C$ 50',
    ])
      expect(hasShoutedWord(ok), ok).toBe(false)
  })

  it('rechaza las palabras con mayúsculas después de la primera letra', () => {
    for (const bad of [
      'REUNIÓN DE EQUIPO',
      'Reunión DE equipo',
      'NORMATIVA',
      'SC-MET-001',
      'iPhone',
      'McDonald',
      'Liga IV',
    ])
      expect(hasShoutedWord(bad), bad).toBe(true)
  })

  it('da un mensaje que explica cómo escribirlo, y lanza al verificar', () => {
    expect(nameCaseError('Reunión')).toBeNull()
    expect(nameCaseError('REUNIÓN')).toContain('Reunión de equipo')
    expect(() => assertNameCase('REUNIÓN')).toThrow(/primera letra/)
    expect(() => assertNameCase('Reunión')).not.toThrow()
  })

  it('corrige un nombre gritado conservando la primera letra de cada palabra', () => {
    expect(toNameCase('NORMATIVA LIGA EMPRESARIAL')).toBe(
      'Normativa Liga Empresarial',
    )
    expect(toNameCase('CV STEVEN ESPINOZA 2026')).toBe(
      'Cv Steven Espinoza 2026',
    )
    expect(toNameCase('Reunión ÁREA')).toBe('Reunión Área')
    expect(hasShoutedWord(toNameCase('SC-MET-001 METODOLOGÍA'))).toBe(false)
  })
})
