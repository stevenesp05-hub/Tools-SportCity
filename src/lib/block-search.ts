/** Búsqueda y orden de bloques para el menú «/», el selector de bloques y los menús de insertar. */

export type Searchable = { title: string; keywords: string; group: string }

export const normalizeQuery = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** ¿Están las letras de `query` en `text`, en orden? («tbl» → «tabla»). */
function isSubsequence(query: string, text: string) {
  let i = 0
  for (const ch of text) if (ch === query[i]) i += 1
  return i === query.length
}

/** Puntuación de una coincidencia: el título pesa más que las palabras clave; 0 = no coincide. */
export function scoreBlock(item: Searchable, rawQuery: string): number {
  const query = normalizeQuery(rawQuery)
  if (!query) return 1
  const title = normalizeQuery(item.title)
  const keywords = normalizeQuery(item.keywords)
  if (title === query) return 120
  if (title.startsWith(query)) return 100
  if (title.split(/\s+/).some((word) => word.startsWith(query))) return 80
  if (title.includes(query)) return 60
  if (keywords.split(/\s+/).some((word) => word.startsWith(query))) return 45
  if (keywords.includes(query)) return 35
  if (query.length >= 3 && isSubsequence(query, title)) return 20
  return 0
}

const RECENT_KEY = 'sc-blocks-recent'
const MAX_RECENT = 5

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

export function recordRecent(title: string) {
  try {
    const next = [title, ...readRecent().filter((t) => t !== title)].slice(
      0,
      MAX_RECENT,
    )
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* preferencia no persistida */
  }
}

/**
 * Ordena los bloques para mostrarlos. Sin búsqueda: los recientes primero (grupo «Recientes») y luego el resto
 * en su orden natural. Con búsqueda: por puntuación, sin agrupar por recientes.
 */
export function rankBlocks<T extends Searchable>(
  items: T[],
  query: string,
  recent: string[] = readRecent(),
): T[] {
  if (normalizeQuery(query)) {
    return items
      .map((item, index) => ({ item, index, score: scoreBlock(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.item)
  }
  const recents = recent
    .map((title) => items.find((item) => item.title === title))
    .filter((item): item is T => Boolean(item))
    .map((item) => ({ ...item, group: 'Recientes' }))
  const rest = items.filter((item) => !recent.includes(item.title))
  return [...recents, ...rest]
}
