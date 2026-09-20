import { describe, expect, it } from 'vitest'
import { createLruCache } from '../lru-cache'
import {
  clearPdfCache,
  pdfCacheKey,
  renderDocumentPdfCached,
} from '../pdf-cache.server'
import {
  inlineInternalImages,
  mapWithConcurrency,
} from '../../server/images.server'
import type { DocumentPdfInput } from '../pdf-template'

const input = (over: Partial<DocumentPdfInput> = {}): DocumentPdfInput => ({
  title: 'Manual',
  folderName: 'Manuales',
  contentHtml: '<p>Hola</p>',
  headings: [],
  versionNumber: 1,
  updatedAt: '2026-09-18T12:00:00Z',
  authorName: null,
  status: 'borrador',
  approvedBy: null,
  approvedAt: null,
  ...over,
})

describe('createLruCache', () => {
  it('expulsa la menos usada al pasar el tope de entradas', () => {
    const cache = createLruCache<string>({ maxEntries: 2, ttlMs: 1000 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.get('a') // "a" pasa a ser la más reciente
    cache.set('c', '3')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('1')
    expect(cache.get('c')).toBe('3')
  })

  it('respeta el tope de bytes y no guarda lo que no cabe', () => {
    const cache = createLruCache<string>({
      maxEntries: 10,
      maxBytes: 10,
      ttlMs: 1000,
      sizeOf: (v) => v.length,
    })
    cache.set('a', '123456')
    cache.set('b', '123456')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.bytes).toBe(6)
    cache.set('gigante', '12345678901')
    expect(cache.get('gigante')).toBeUndefined()
    expect(cache.get('b')).toBe('123456')
  })

  it('caduca por TTL', () => {
    let now = 0
    const cache = createLruCache<string>({
      maxEntries: 5,
      ttlMs: 100,
      now: () => now,
    })
    cache.set('a', '1')
    now = 99
    expect(cache.get('a')).toBe('1')
    now = 100
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })
})

describe('caché de PDF', () => {
  it('la clave cambia con cualquier dato que cambie el PDF', () => {
    const base = pdfCacheKey('d1', input(), undefined)
    expect(pdfCacheKey('d1', input(), undefined)).toBe(base)
    for (const change of [
      { title: 'Otro' },
      { status: 'aprobado' as const },
      { approvedBy: 'Ana' },
      { theme: 'report' as const },
      { contentHtml: '<p>Hola!</p>' },
      { folderName: 'Otra' },
    ])
      expect(pdfCacheKey('d1', input(change), undefined)).not.toBe(base)
    expect(pdfCacheKey('d1', input(), false)).not.toBe(base)
    expect(pdfCacheKey('d2', input(), undefined)).not.toBe(base)
  })

  it('reutiliza el PDF y comparte la generación en curso', async () => {
    clearPdfCache()
    let calls = 0
    const render = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      return Buffer.from(`pdf-${calls}`)
    }
    const [a, b] = await Promise.all([
      renderDocumentPdfCached('d1', input(), {}, render),
      renderDocumentPdfCached('d1', input(), {}, render),
    ])
    const c = await renderDocumentPdfCached('d1', input(), {}, render)
    expect(calls).toBe(1)
    expect(a).toBe(b)
    expect(c).toBe(a)
    await renderDocumentPdfCached('d1', input({ title: 'Nuevo' }), {}, render)
    expect(calls).toBe(2)
  })
})

describe('imágenes en una pasada', () => {
  it('resuelve cada nombre una vez y sustituye todas las apariciones', async () => {
    const html =
      '<img src="/api/imagenes/aaa"><img src="/api/imagenes/bbb.png"><img src="/api/imagenes/aaa"><img src="/api/imagenes/falta">'
    const asked: string[] = []
    const out = await inlineInternalImages(html, (name) => {
      asked.push(name)
      return Promise.resolve(
        name === 'falta' ? null : `data:x;base64,${name}$&`,
      )
    })
    expect(asked.sort()).toEqual(['aaa', 'bbb.png', 'falta'])
    expect(out).toBe(
      '<img src="data:x;base64,aaa$&"><img src="data:x;base64,bbb.png$&"><img src="data:x;base64,aaa$&"><img src="/api/imagenes/falta">',
    )
  })

  it('limita la concurrencia y conserva el orden', async () => {
    let active = 0
    let peak = 0
    const out = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7, 8],
      3,
      async (n) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return n * 2
      },
    )
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
    expect(peak).toBe(3)
  })
})
