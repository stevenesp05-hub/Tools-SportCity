import { describe, expect, it } from 'vitest'
import {
  PAGE_CHROME_PX,
  PAGE_CONTENT_PX,
  planPageBreaks,
} from '../../components/documents/pagination'
import type { Unit } from '../../components/documents/pagination'

const block = (i: number, extra: Partial<Unit> = {}): Unit => ({
  pos: i,
  tag: 'div',
  cols: 1,
  top: i * 60,
  bottom: i * 60 + 50,
  keepNext: false,
  head: null,
  headH: 0,
  ...extra,
})

describe('planPageBreaks', () => {
  it('todas las hojas admiten el mismo contenido (la primera y las siguientes)', () => {
    const units = Array.from({ length: 160 }, (_, i) => block(i))
    const { breaks, pages } = planPageBreaks(units)
    expect(pages).toBeGreaterThan(3)
    // Contenido (en coordenadas sin huecos) que cabe en cada hoja: distancia entre saltos.
    const tops = breaks.map((b) => units[b.pos].top)
    const sizes = tops.map((t, i) => t - (i === 0 ? 0 : tops[i - 1]))
    const first = sizes[0]
    for (const size of sizes) {
      // Cada hoja admite PAGE_CONTENT_PX con un margen de un bloque (60px).
      expect(size).toBeGreaterThan(PAGE_CONTENT_PX - 60)
      expect(size).toBeLessThanOrEqual(PAGE_CONTENT_PX)
      expect(Math.abs(size - first)).toBeLessThanOrEqual(60)
    }
  })

  it('un salto manual no encoge las hojas siguientes', () => {
    const units = Array.from({ length: 80 }, (_, i) => block(i))
    // El salto manual mide poco: lo que ocupa su propia marca va a la hoja siguiente.
    units[5] = block(5, { forced: true, bottom: 5 * 60 + 2 })
    const { breaks } = planPageBreaks(units)
    const next = breaks.find((b) => b.pos > 5)!
    const content = units[next.pos].top - units[6].top
    expect(content).toBeGreaterThan(PAGE_CONTENT_PX - 130)
  })

  it('el hueco de cada salto no supera lo que queda de hoja', () => {
    const units = Array.from({ length: 80 }, (_, i) => block(i))
    for (const b of planPageBreaks(units).breaks)
      expect(b.fill).toBeLessThan(PAGE_CONTENT_PX + PAGE_CHROME_PX)
  })
})
