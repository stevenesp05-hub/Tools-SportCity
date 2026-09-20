import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '#/server/auth'
import { DOC_STATUSES } from '#/server/documents'
import type { DocStatus } from '#/server/documents'
import { buildSnippet, normalizeText } from '#/lib/search-utils'
import type { Snippet } from '#/lib/search-utils'
import type { SupabaseServerClient } from '#/lib/supabase/server'

export type DocumentHit = {
  id: string
  title: string
  folder_id: string
  folder_path: string
  status: DocStatus
  due_date: string | null
  tags: string[]
  updated_at: string
  snippet: Snippet | null
}

export type FolderHit = { id: string; name: string }

type RawDoc = {
  id: string
  title: string
  folder_id: string
  status: DocStatus
  due_date: string | null
  tags: string[]
  updated_at: string
}

// Sin search_text (texto completo del documento): solo se pide para los resultados finales, para el fragmento.
const DOC_COLUMNS = 'id, title, folder_id, status, due_date, tags, updated_at'

async function loadFolderIndex(supabase: SupabaseServerClient) {
  const { data } = await supabase
    .from('folders')
    .select('id, name, parent_id, record_id')
  const folders = (data ?? []) as Array<{
    id: string
    name: string
    parent_id: string | null
    record_id: string | null
  }>
  const byId = new Map(folders.map((f) => [f.id, f]))

  const pathOf = (id: string) => {
    const names: string[] = []
    let cursor = byId.get(id)
    while (cursor) {
      names.unshift(cursor.name)
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
    }
    return names.join(' / ')
  }

  // Mapa padre → hijos, para recorrer el árbol una sola vez.
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (!f.parent_id) continue
    const siblings = childrenOf.get(f.parent_id)
    if (siblings) siblings.push(f.id)
    else childrenOf.set(f.parent_id, [f.id])
  }

  const descendantsOf = (rootId: string) => {
    const result = new Set<string>([rootId])
    const pending = [rootId]
    while (pending.length > 0) {
      for (const child of childrenOf.get(pending.pop()!) ?? []) {
        if (!result.has(child)) {
          result.add(child)
          pending.push(child)
        }
      }
    }
    return result
  }

  return { folders, pathOf, descendantsOf }
}

async function runSearch(
  supabase: SupabaseServerClient,
  input: {
    query: string
    folderId?: string
    status?: DocStatus
    tag?: string
    limit: number
  },
): Promise<{ documents: DocumentHit[]; folders: FolderHit[] }> {
  const query = input.query.trim()
  const plain = normalizeText(query)
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // El índice de carpetas se pide a la vez que los documentos; solo hay que esperarlo antes
  // si se filtra por carpeta (hace falta para calcular sus descendientes).
  const indexPromise = loadFolderIndex(supabase)
  let scope: string[] | null = null
  if (input.folderId) {
    const early = await indexPromise
    const all = early.descendantsOf(input.folderId)
    // Si la carpeta abarca todas las demás, el filtro no aporta nada y solo alarga la consulta.
    scope = all.size >= early.folders.length ? null : [...all]
  }

  const apply = (
    builder: ReturnType<ReturnType<SupabaseServerClient['from']>['select']>,
  ) => {
    let q = builder.is('deleted_at', null)
    if (scope) q = q.in('folder_id', scope)
    if (input.status) q = q.eq('status', input.status)
    if (input.tag) q = q.contains('tags', [input.tag])
    return q
  }

  const collected = new Map<string, RawDoc>()
  const titleFirst = new Set<string>()

  const fetchDocuments = async () => {
    if (query) {
      const [titleMatches, textMatches] = await Promise.all([
        apply(supabase.from('documents').select(DOC_COLUMNS))
          .ilike('title', `%${query}%`)
          .limit(input.limit),
        plain
          ? apply(supabase.from('documents').select(DOC_COLUMNS))
              .textSearch('fts', plain, {
                type: 'websearch',
                config: 'spanish',
              })
              .limit(input.limit)
          : Promise.resolve({ data: [] }),
      ])
      for (const doc of (titleMatches.data ?? []) as unknown as RawDoc[]) {
        collected.set(doc.id, doc)
        titleFirst.add(doc.id)
      }
      for (const doc of (textMatches.data ?? []) as unknown as RawDoc[])
        collected.set(doc.id, doc)
    } else {
      const { data } = await apply(
        supabase.from('documents').select(DOC_COLUMNS),
      )
        .order('updated_at', { ascending: false })
        .limit(input.limit)
      for (const doc of (data ?? []) as unknown as RawDoc[])
        collected.set(doc.id, doc)
    }
  }

  const [index] = await Promise.all([indexPromise, fetchDocuments()])

  const ordered = [
    ...titleFirst,
    ...[...collected.keys()].filter((id) => !titleFirst.has(id)),
  ].slice(0, input.limit)

  // El texto completo solo se descarga para los resultados que se muestran, y solo si hay búsqueda.
  const texts = new Map<string, string>()
  if (query && ordered.length > 0) {
    const { data } = await supabase
      .from('documents')
      .select('id, search_text')
      .in('id', ordered)
    for (const row of (data ?? []) as unknown as Array<{
      id: string
      search_text: string
    }>)
      texts.set(row.id, row.search_text)
  }

  const documents: DocumentHit[] = ordered.map((id) => {
    const doc = collected.get(id)!
    return {
      id: doc.id,
      title: doc.title,
      folder_id: doc.folder_id,
      folder_path: index.pathOf(doc.folder_id),
      status: doc.status,
      due_date: doc.due_date,
      tags: doc.tags,
      updated_at: doc.updated_at,
      snippet: query ? buildSnippet(texts.get(id) ?? '', query) : null,
    }
  })

  const scopeSet = scope ? new Set(scope) : null
  const needle = normalizeText(query)
  const folders: FolderHit[] =
    query && !input.status && !input.tag
      ? index.folders
          .filter(
            (f) =>
              f.record_id === null && normalizeText(f.name).includes(needle),
          )
          .filter((f) => !scopeSet || scopeSet.has(f.id))
          .slice(0, 8)
          .map((f) => ({ id: f.id, name: f.name }))
      : []

  return { documents, folders }
}

export const searchDocuments = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      query: z.string().max(200),
      folderId: z.string().min(1).optional(),
      status: z.enum(DOC_STATUSES).optional(),
      tag: z.string().min(1).max(40).optional(),
    }),
  )
  .handler(async ({ context, data }) =>
    runSearch(context.supabase, { ...data, limit: 50 }),
  )

/** Búsqueda rápida del buscador superior. */
export const quickSearch = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ query: z.string().max(200) }))
  .handler(async ({ context, data }) => {
    if (data.query.trim().length < 2) return { documents: [], folders: [] }
    const result = await runSearch(context.supabase, {
      query: data.query,
      limit: 6,
    })
    return { documents: result.documents, folders: result.folders.slice(0, 3) }
  })
