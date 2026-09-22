import type { FolderRow } from '#/server/documents'

/**
 * Carpetas desde la raíz hasta `id` (incluida), en ese orden. Vacío si `id` es nulo o no existe.
 * Protegido ante un ciclo accidental en los datos (no debería darse: `moveFolder` ya lo impide al mover).
 */
export function folderChainOf(
  folders: ReadonlyArray<FolderRow>,
  id: string | null,
): FolderRow[] {
  if (!id) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain: FolderRow[] = []
  const seen = new Set<string>()
  let cursor = byId.get(id)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.unshift(cursor)
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
  }
  return chain
}
