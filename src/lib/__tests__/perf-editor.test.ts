import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { SCHEMA_EXTENSIONS, countWords } from '../editor-extensions'
import { makeNatural } from '../../components/documents/pagination'

describe('countWords', () => {
  const old = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
  it('cuenta igual que split(/\\s+/).filter(Boolean)', () => {
    const samples = [
      '',
      '   ',
      'hola',
      ' hola  mundo ',
      'uno\n\ndos\ttres cuatro cinco',
      'Título\n\nPárrafo con ñ y tildes, 12,5 y (paréntesis).\n\n',
      'a\r\nb c﻿d',
    ]
    for (const text of samples) expect(countWords(text)).toBe(old(text))
    const long = Array.from({ length: 5000 }, (_, i) => `palabra${i}`).join(' ')
    expect(countWords(long)).toBe(5000)
  })
})

describe('makeNatural (suma acumulada de huecos)', () => {
  const naive = (
    gaps: Array<{ top: number; height: number }>,
    regionTop: number,
  ) => {
    return (y: number) => {
      let sub = 0
      for (const g of gaps) if (g.top < y - 0.5) sub += g.height
      return y - regionTop - sub
    }
  }
  it('coincide con el recorrido lineal de siempre', () => {
    const gaps = [
      { top: 900, height: 250 },
      { top: 2100.25, height: 250.5 },
      { top: 3300, height: 300 },
      { top: 4400, height: 250 },
    ]
    const fast = makeNatural(gaps, 120)
    const slow = naive(gaps, 120)
    for (const y of [
      0, 120, 899.4, 899.5, 900, 900.5, 1500, 2100.75, 3299, 3300.5, 9999,
    ])
      expect(fast(y)).toBe(slow(y))
  })
  it('sin huecos solo resta la cabecera de la región', () => {
    expect(makeNatural([], 50)(300)).toBe(250)
  })
  it('tolera huecos desordenados', () => {
    const gaps = [
      { top: 3000, height: 200 },
      { top: 1000, height: 100 },
    ]
    const sorted = [...gaps].sort((a, b) => a.top - b.top)
    const fast = makeNatural(gaps, 0)
    const slow = naive(sorted, 0)
    for (const y of [500, 1200, 3500]) expect(fast(y)).toBe(slow(y))
  })
})

describe('recorrido podado de tablas', () => {
  const schema = getSchema(SCHEMA_EXTENSIONS)
  it('encuentra las mismas tablas que el recorrido completo', () => {
    const cell = (text: string) =>
      schema.nodes.tableCell.create(
        null,
        schema.nodes.paragraph.create(null, schema.text(text)),
      )
    const table = () =>
      schema.nodes.table.create(null, [
        schema.nodes.tableRow.create(null, [cell('a'), cell('1')]),
      ])
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text('texto')),
      table(),
      schema.nodes.callout.create(null, [
        schema.nodes.paragraph.create(null, schema.text('dentro')),
        table(),
      ]),
    ])
    const full: number[] = []
    doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true
      full.push(pos)
      return false
    })
    const pruned: number[] = []
    doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return !node.isTextblock
      pruned.push(pos)
      return false
    })
    expect(full).toHaveLength(2)
    expect(pruned).toEqual(full)
  })
})
