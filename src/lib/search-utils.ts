/** Minúsculas y sin tildes, para comparar texto sin distinguir acentos. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export type Snippet = { before: string; match: string; after: string }

/** Fragmento del texto alrededor de la primera coincidencia de cualquier palabra de la búsqueda. */
export function buildSnippet(
  text: string,
  query: string,
  radius = 70,
): Snippet | null {
  const words = normalizeText(query)
    .split(/\s+/)
    .filter((w) => w.length > 1)
  if (!text || words.length === 0) return null
  // normalizeText conserva la longitud 1:1 salvo casos raros; se busca sobre el texto normalizado.
  const haystack = normalizeText(text)
  if (haystack.length !== text.length) return null

  let bestIndex = -1
  let bestLength = 0
  for (const word of words) {
    const index = haystack.indexOf(word)
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index
      bestLength = word.length
    }
  }
  if (bestIndex === -1) return null

  const start = Math.max(0, bestIndex - radius)
  const end = Math.min(text.length, bestIndex + bestLength + radius)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, bestIndex),
    match: text.slice(bestIndex, bestIndex + bestLength),
    after:
      text.slice(bestIndex + bestLength, end) + (end < text.length ? '…' : ''),
  }
}
