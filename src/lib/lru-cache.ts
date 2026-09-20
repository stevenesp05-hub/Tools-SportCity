/**
 * Caché en memoria con tope de entradas y de bytes, caducidad (TTL) y expulsión de la menos usada (LRU).
 * Vive en la memoria del proceso: en serverless cada instancia tiene la suya y se pierde al enfriarse.
 */
export type LruCacheOptions<TValue> = {
  maxEntries: number
  /** Tope de bytes sumando `sizeOf` de cada valor. Sin él, solo cuenta el nº de entradas. */
  maxBytes?: number
  ttlMs: number
  sizeOf?: (value: TValue) => number
  /** Reloj inyectable para las pruebas. */
  now?: () => number
}

export type LruCache<TValue> = {
  get: (key: string) => TValue | undefined
  set: (key: string, value: TValue) => void
  delete: (key: string) => void
  clear: () => void
  readonly size: number
  readonly bytes: number
}

export function createLruCache<TValue>(
  options: LruCacheOptions<TValue>,
): LruCache<TValue> {
  const { maxEntries, maxBytes, ttlMs } = options
  const sizeOf = options.sizeOf ?? (() => 0)
  const now = options.now ?? Date.now
  // Un Map conserva el orden de inserción: la primera clave es la menos usada.
  const entries = new Map<
    string,
    { value: TValue; size: number; expires: number }
  >()
  let bytes = 0

  const remove = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return
    bytes -= entry.size
    entries.delete(key)
  }

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expires <= now()) {
        remove(key)
        return undefined
      }
      // Se reinserta para marcarla como la más reciente.
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    set(key, value) {
      const size = sizeOf(value)
      remove(key)
      // Un valor que por sí solo no cabe no se guarda (no vale la pena vaciar la caché por él).
      if (maxBytes !== undefined && size > maxBytes) return
      entries.set(key, { value, size, expires: now() + ttlMs })
      bytes += size
      while (
        entries.size > maxEntries ||
        (maxBytes !== undefined && bytes > maxBytes)
      ) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        remove(oldest.value)
      }
    },
    delete: remove,
    clear() {
      entries.clear()
      bytes = 0
    },
    get size() {
      return entries.size
    },
    get bytes() {
      return bytes
    },
  }
}
