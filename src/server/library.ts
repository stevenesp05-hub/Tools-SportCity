import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { JSONContent } from '@tiptap/react'
import { authMiddleware } from '#/server/auth'
import { DOC_STATUSES } from '#/server/documents'
import type { DocStatus } from '#/server/documents'
import { assertPermission, ROLES } from '#/lib/permissions'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import { expandDynamicBlocks } from '#/lib/dynamic-blocks'
import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'
import type { SupabaseServerClient } from '#/lib/supabase/server'

// ---------- Mover / renombrar / duplicar ----------

export const moveDocuments = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(200),
      folderId: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { error } = await context.supabase
      .from('documents')
      .update({ folder_id: data.folderId })
      .in('id', data.ids)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const renameDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      title: z.string().trim().min(1).max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { error } = await context.supabase
      .from('documents')
      .update({ title: data.title })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const duplicateDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    assertPermission(context.user.role, 'tools.documentos.crear')

    const { data: original, error } = await context.supabase
      .from('documents')
      .select(
        'title, folder_id, tags, search_text, current_version:document_versions!documents_current_version_id_fkey(content, content_html)',
      )
      .eq('id', data.id)
      .single()
    if (error) throw new Error(error.message)
    const version = original.current_version as unknown as {
      content: JSONContent
      content_html: string
    } | null

    const { data: copy, error: copyError } = await context.supabase
      .from('documents')
      .insert({
        folder_id: original.folder_id,
        title: `Copia de ${original.title as string}`,
        tags: original.tags,
        search_text: original.search_text,
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (copyError) throw new Error(copyError.message)

    const { data: newVersion, error: versionError } = await context.supabase
      .from('document_versions')
      .insert({
        document_id: copy.id,
        version_number: 1,
        content: version?.content ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
        content_html: version?.content_html ?? '<p></p>',
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (versionError) throw new Error(versionError.message)

    await context.supabase
      .from('documents')
      .update({ current_version_id: newVersion.id })
      .eq('id', copy.id)
    return { id: copy.id as string }
  })

export const moveFolder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({ id: z.string().min(1), parentId: z.string().min(1).nullable() }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')

    if (data.parentId) {
      // Evita meter una carpeta dentro de sí misma o de una descendiente.
      const { data: folders, error } = await context.supabase
        .from('folders')
        .select('id, parent_id')
      if (error) throw new Error(error.message)
      const parentOf = new Map(
        (folders as Array<{ id: string; parent_id: string | null }>).map(
          (f) => [f.id, f.parent_id],
        ),
      )
      let cursor: string | null | undefined = data.parentId
      while (cursor) {
        if (cursor === data.id)
          throw new Error('No puedes mover una carpeta dentro de sí misma.')
        cursor = parentOf.get(cursor)
      }
    }

    const { error } = await context.supabase
      .from('folders')
      .update({ parent_id: data.parentId })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

// ---------- Metadatos: estado, vencimiento, etiquetas, acceso ----------

export const updateDocumentMeta = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      status: z.enum(DOC_STATUSES).optional(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')

    const update: Record<string, unknown> = {}
    if (data.dueDate !== undefined) update.due_date = data.dueDate
    if (data.tags !== undefined) update.tags = [...new Set(data.tags)]

    if (data.status !== undefined) {
      const status: DocStatus = data.status
      if (status !== 'borrador')
        assertPermission(context.user.role, 'tools.documentos.aprobar')
      update.status = status
      if (status === 'aprobado' || status === 'vigente') {
        update.approved_by = context.user.id
        update.approved_at = new Date().toISOString()
      } else if (status === 'borrador') {
        update.approved_by = null
        update.approved_at = null
      }
    }

    if (Object.keys(update).length === 0) return { ok: true as const }
    const { error } = await context.supabase
      .from('documents')
      .update(update)
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

/** Cambia quién ve una carpeta y, si se pide, también sus subcarpetas (las carpetas nuevas heredan la de su padre). */
export const updateFolderAccess = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      visibleRoles: z.array(z.enum(ROLES)).nullable(),
      includeSubfolders: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_acceso')

    const ids = [data.id]
    if (data.includeSubfolders) {
      const { data: folders, error } = await context.supabase
        .from('folders')
        .select('id, parent_id')
      if (error) throw new Error(error.message)
      const children = new Map<string, string[]>()
      for (const f of folders as Array<{
        id: string
        parent_id: string | null
      }>)
        if (f.parent_id) {
          const list = children.get(f.parent_id) ?? []
          list.push(f.id)
          children.set(f.parent_id, list)
        }
      // Recorre también lo que se va añadiendo: así llega a los descendientes de cualquier nivel.
      for (const id of ids) ids.push(...(children.get(id) ?? []))
    }

    const { error } = await context.supabase
      .from('folders')
      .update({ visible_roles: data.visibleRoles })
      .in('id', ids)
    if (error) throw new Error(error.message)
    return { ok: true as const, updated: ids.length }
  })

export const updateDocumentAccess = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      visibleRoles: z.array(z.enum(ROLES)).nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_acceso')
    const { error } = await context.supabase
      .from('documents')
      .update({ visible_roles: data.visibleRoles })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

/**
 * Destaca (o quita de destacado) un documento para todo el mundo: aparece en el inicio de cualquiera
 * que lo vea, sin que cada persona tenga que marcarlo como favorito por su cuenta. Solo el administrador.
 */
export const setFeatured = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), featured: z.boolean() }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.admin.gestionar_acceso')
    const { error } = await context.supabase
      .from('documents')
      .update({ featured: data.featured })
      .eq('id', data.id)
    if (error)
      throw new Error(
        /featured/.test(error.message) &&
          /does not exist|schema cache|could not find/i.test(error.message)
          ? 'Falta ejecutar la migración 0023_documentos_destacados.sql en Supabase.'
          : error.message,
      )
    return { ok: true as const }
  })

// ---------- Favoritos, recientes, vencimientos ----------

export const toggleFavorite = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1), favorite: z.boolean() }))
  .handler(async ({ context, data }) => {
    if (data.favorite) {
      const { error } = await context.supabase
        .from('favorites')
        .upsert({ user_id: context.user.id, document_id: data.documentId })
      if (error) throw new Error(error.message)
    } else {
      const { error } = await context.supabase
        .from('favorites')
        .delete()
        .eq('user_id', context.user.id)
        .eq('document_id', data.documentId)
      if (error) throw new Error(error.message)
    }
    return { ok: true as const }
  })

export const recordView = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    await context.supabase.from('document_views').upsert({
      user_id: context.user.id,
      document_id: data.documentId,
      viewed_at: new Date().toISOString(),
    })
    return { ok: true as const }
  })

export type HomeDocument = {
  id: string
  title: string
  folder_id: string
  status: DocStatus
  due_date: string | null
  updated_at: string
}

type RawHomeDoc = HomeDocument & { deleted_at: string | null }
const HOME_DOC_FIELDS =
  'id, title, folder_id, status, due_date, updated_at, deleted_at'

function unwrapEmbedded<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function toHomeDocuments(
  rows: Array<{ document: RawHomeDoc | RawHomeDoc[] | null }>,
): HomeDocument[] {
  return rows
    .map((row) => unwrapEmbedded(row.document))
    .filter((doc): doc is RawHomeDoc => doc !== null && doc.deleted_at === null)
    .map(({ deleted_at: _deleted, ...doc }) => doc)
}

export const getHome = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
    }): Promise<{
      featured: HomeDocument[]
      favorites: HomeDocument[]
      recents: HomeDocument[]
      due: HomeDocument[]
      /** Revisiones pendientes asignadas a mí: para la cifra rápida del inicio. */
      pendingReviews: number
    }> => {
      const inThirtyDays = new Date(Date.now() + 30 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10)

      const [featured, favorites, recents, due, pendingReviews] =
        await Promise.all([
          // Sin la migración 0023 la columna no existe: el error deja `data` en null y aquí queda vacío.
          context.supabase
            .from('documents')
            .select(HOME_DOC_FIELDS)
            .is('deleted_at', null)
            .eq('featured', true)
            .order('updated_at', { ascending: false })
            .limit(12),
          context.supabase
            .from('favorites')
            .select(`document:documents(${HOME_DOC_FIELDS})`)
            .eq('user_id', context.user.id)
            .order('created_at', { ascending: false })
            .limit(12),
          context.supabase
            .from('document_views')
            .select(`document:documents(${HOME_DOC_FIELDS})`)
            .eq('user_id', context.user.id)
            .order('viewed_at', { ascending: false })
            .limit(10),
          context.supabase
            .from('documents')
            .select(HOME_DOC_FIELDS)
            .is('deleted_at', null)
            .not('due_date', 'is', null)
            .lte('due_date', inThirtyDays)
            .order('due_date')
            .limit(10),
          context.supabase
            .from('document_reviews')
            .select('id', { count: 'exact', head: true })
            .eq('reviewer_id', context.user.id)
            .eq('status', 'pending'),
        ])

      return {
        featured: ((featured.data ?? []) as unknown as RawHomeDoc[]).map(
          ({ deleted_at: _deleted, ...doc }) => doc,
        ),
        favorites: toHomeDocuments(favorites.data ?? []),
        recents: toHomeDocuments(recents.data ?? []),
        due: ((due.data ?? []) as unknown as RawHomeDoc[]).map(
          ({ deleted_at: _deleted, ...doc }) => doc,
        ),
        pendingReviews: pendingReviews.count ?? 0,
      }
    },
  )

// ---------- Papelera ----------

export type TrashedDocument = {
  id: string
  title: string
  folder_id: string
  deleted_at: string
  folder_name: string | null
}

/** Días que un documento eliminado permanece en la papelera antes de borrarse definitivamente. */
export const TRASH_DAYS = 30

const TRASH_PURGE_INTERVAL_MS = 3_600_000
let lastTrashPurge = 0

export const listTrash = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TrashedDocument[]> => {
    assertPermission(context.user.role, 'tools.documentos.editar')

    // Limpieza perezosa: al abrir la papelera se borran los documentos que llevan más de TRASH_DAYS días,
    // pero como mucho una vez por hora en cada instancia del servidor.
    if (Date.now() - lastTrashPurge > TRASH_PURGE_INTERVAL_MS) {
      lastTrashPurge = Date.now()
      try {
        const cutoff = new Date(
          Date.now() - TRASH_DAYS * 86_400_000,
        ).toISOString()
        await getSupabaseAdminClient()
          .from('documents')
          .delete()
          .not('deleted_at', 'is', null)
          .lt('deleted_at', cutoff)
      } catch {
        /* sin clave de servicio: se omite la limpieza automática */
      }
    }

    const { data, error } = await context.supabase
      .from('documents')
      .select('id, title, folder_id, deleted_at, folder:folders(name)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return (
      data as unknown as Array<
        Omit<TrashedDocument, 'folder_name'> & {
          folder: { name: string } | Array<{ name: string }> | null
        }
      >
    ).map(({ folder, ...doc }) => ({
      ...doc,
      folder_name: unwrapEmbedded(folder)?.name ?? null,
    }))
  })

export const restoreDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { error } = await context.supabase
      .from('documents')
      .update({ deleted_at: null })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const purgeDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.eliminar')
    const { error } = await context.supabase
      .from('documents')
      .delete()
      .eq('id', data.id)
      .not('deleted_at', 'is', null)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

// ---------- Comentarios ----------

export type DocumentComment = {
  id: string
  body: string
  resolved: boolean
  quote: string | null
  created_at: string
  author_id: string
  author: { full_name: string | null; email: string } | null
}

export const listComments = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<DocumentComment[]> => {
    const { data: comments, error } = await context.supabase
      .from('document_comments')
      .select(
        'id, body, resolved, quote, created_at, author_id, author:profiles(full_name, email)',
      )
      .eq('document_id', data.documentId)
      .order('created_at')
    if (error) throw new Error(error.message)
    return (
      comments as unknown as Array<
        Omit<DocumentComment, 'author'> & {
          author:
            | DocumentComment['author']
            | Array<NonNullable<DocumentComment['author']>>
        }
      >
    ).map((c) => ({ ...c, author: unwrapEmbedded(c.author) }))
  })

export const addComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      body: z.string().trim().min(1).max(2000),
      quote: z.string().trim().max(300).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.comentar')
    const { error } = await context.supabase.from('document_comments').insert({
      document_id: data.documentId,
      author_id: context.user.id,
      body: data.body,
      quote: data.quote || null,
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const setCommentResolved = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), resolved: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from('document_comments')
      .update({ resolved: data.resolved })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const deleteComment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from('document_comments')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

// ---------- Aviso de edición ----------

const EDITING_TTL_MS = 45_000

export type EditingStatus = {
  editors: string[]
  latestVersionId: string | null
}

type EditingRow = {
  updated_at: string
  profiles:
    | { full_name: string | null; email: string }
    | Array<{ full_name: string | null; email: string }>
    | null
}

/** Renueva mi marca de "editando" (si estoy editando) y devuelve quién más edita y cuál es la última versión. */
export const pingEditing = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1), editing: z.boolean() }))
  .handler(async ({ context, data }): Promise<EditingStatus> => {
    const since = new Date(Date.now() - EDITING_TTL_MS).toISOString()
    // La marca propia no afecta a la consulta (que excluye mi usuario), así que todo va en paralelo.
    // Si la migración del aviso aún no está aplicada, la consulta falla y simplemente no se avisa.
    const [, { data: rows }, { data: doc }] = await Promise.all([
      data.editing
        ? context.supabase.from('document_editing').upsert({
            document_id: data.documentId,
            user_id: context.user.id,
            updated_at: new Date().toISOString(),
          })
        : Promise.resolve(null),
      context.supabase
        .from('document_editing')
        .select('updated_at, profiles(full_name, email)')
        .eq('document_id', data.documentId)
        .neq('user_id', context.user.id)
        .gte('updated_at', since),
      context.supabase
        .from('documents')
        .select('current_version_id')
        .eq('id', data.documentId)
        .maybeSingle(),
    ])
    const editors = ((rows ?? []) as unknown as EditingRow[]).map((row) => {
      const profile = unwrapEmbedded(row.profiles)
      return profile?.full_name ?? profile?.email ?? 'Alguien'
    })
    return {
      editors,
      latestVersionId: (doc?.current_version_id as string | null) ?? null,
    }
  })

export const stopEditing = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from('document_editing')
      .delete()
      .eq('document_id', data.documentId)
      .eq('user_id', context.user.id)
    return { ok: true as const }
  })

// ---------- Enlaces entre documentos ----------

export type DocumentLinkTarget = {
  id: string
  title: string
  folderName: string
}

/** Busca documentos por título para enlazarlos con "@". Sin texto, devuelve los más recientes. */
export const searchDocumentsForLink = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ query: z.string().max(60) }))
  .handler(async ({ context, data }): Promise<DocumentLinkTarget[]> => {
    let query = context.supabase
      .from('documents')
      .select('id, title, folder:folders(name)')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(8)
    const text = data.query.trim().replace(/[%_,()]/g, ' ')
    if (text) query = query.ilike('title', `%${text}%`)
    const { data: rows, error } = await query
    if (error) return []
    return (
      rows as unknown as Array<{
        id: string
        title: string
        folder: { name: string } | Array<{ name: string }> | null
      }>
    ).map((r) => ({
      id: r.id,
      title: r.title,
      folderName: unwrapEmbedded(r.folder)?.name ?? 'Documentos',
    }))
  })

type LinkedRow = {
  id: string
  title: string
  folder: { name: string } | Array<{ name: string }> | null
}

const toLinkTargets = (rows: LinkedRow[]): DocumentLinkTarget[] =>
  rows.map((r) => ({
    id: r.id,
    title: r.title,
    folderName: unwrapEmbedded(r.folder)?.name ?? 'Documentos',
  }))

/** Documentos vivos (distintos del destino) entre los ids dados. */
async function loadLinkSources(
  supabase: SupabaseServerClient,
  column: 'id' | 'current_version_id',
  ids: string[],
  targetId: string,
): Promise<DocumentLinkTarget[]> {
  if (ids.length === 0) return []
  const { data: rows } = await supabase
    .from('documents')
    .select('id, title, folder:folders(name)')
    .in(column, ids)
    .is('deleted_at', null)
    .neq('id', targetId)
    .limit(20)
  return toLinkTargets(rows ?? [])
}

/**
 * Método antiguo, para cuando aún no está la tabla `document_links` (migración 0020):
 * busca el enlace dentro del HTML de las versiones, que es lento.
 */
async function legacyBacklinks(
  supabase: SupabaseServerClient,
  documentId: string,
): Promise<DocumentLinkTarget[]> {
  const { data: versions } = await supabase
    .from('document_versions')
    .select('id')
    .ilike('content_html', `%/documentos/doc/${documentId}%`)
    .limit(80)
  const ids = ((versions ?? []) as Array<{ id: string }>).map((v) => v.id)
  return loadLinkSources(supabase, 'current_version_id', ids, documentId)
}

/** Documentos cuya versión actual enlaza a este. */
export const listBacklinks = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<DocumentLinkTarget[]> => {
    const { data: links, error } = await context.supabase
      .from('document_links')
      .select('source_document_id')
      .eq('target_document_id', data.documentId)
      .limit(80)
    // Sin la tabla (migración 0020 sin aplicar) o con cualquier otro fallo: se cae al método antiguo.
    if (error) return legacyBacklinks(context.supabase, data.documentId)
    const ids = (links as Array<{ source_document_id: string }>).map(
      (l) => l.source_document_id,
    )
    return loadLinkSources(context.supabase, 'id', ids, data.documentId)
  })

// ---------- Miniaturas ----------

export type DocumentPreview = { html: string; folderName: string }

/** Recorta el HTML sin dejar una etiqueta cortada a medias (termina en el último ">" antes del límite). */
function cutHtml(html: string, max: number): string {
  if (html.length <= max) return html
  const head = html.slice(0, max)
  const end = head.lastIndexOf('>')
  return end === -1 ? head : head.slice(0, end + 1)
}

/** Contenido de varios documentos de una vez, para dibujar sus miniaturas (primera página). */
export const getDocumentPreviews = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(24) }))
  .handler(
    async ({ context, data }): Promise<Record<string, DocumentPreview>> => {
      const { data: rows, error } = await context.supabase
        .from('documents')
        .select(
          'id, folder:folders(name), version:document_versions!documents_current_version_id_fkey(content_html)',
        )
        .in('id', data.ids)
        .is('deleted_at', null)
      if (error) return {}
      const result: Record<string, DocumentPreview> = {}
      for (const row of rows as unknown as Array<{
        id: string
        folder: { name: string } | Array<{ name: string }> | null
        version:
          { content_html: string } | Array<{ content_html: string }> | null
      }>) {
        const version = Array.isArray(row.version)
          ? row.version[0]
          : row.version
        if (!version) continue
        // Solo hace falta el principio: se recorta antes de sanear (para no procesar documentos enteros,
        // p. ej. con imágenes en base64) y de nuevo después, ya saneado.
        const html = expandDynamicBlocks(
          sanitizeContentHtml(cutHtml(version.content_html, 48_000)),
        )
        result[row.id] = {
          html: html.length > 24_000 ? html.slice(0, 24_000) : html,
          folderName: unwrapEmbedded(row.folder)?.name ?? 'Documento',
        }
      }
      return result
    },
  )
