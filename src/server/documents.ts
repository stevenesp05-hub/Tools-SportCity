import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import type { JSONContent } from '@tiptap/react'
import { authMiddleware } from '#/server/auth'
import { assertPermission, hasPermission, ROLES } from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { DOC_THEMES, themeOf } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { extractText } from '#/lib/document-text'
import {
  builtinValues,
  extractVariables,
  fillHtml,
  fillJson,
  normalizeVariable,
  variableLabel,
} from '#/lib/template-variables'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import type { SupabaseServerClient } from '#/lib/supabase/server'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export type FolderRow = {
  id: string
  name: string
  parent_id: string | null
  visible_roles: Role[] | null
}

export const listFolders = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<FolderRow[]> => {
    const { data, error } = await context.supabase
      .from('folders')
      .select('id, name, parent_id, visible_roles')
      .is('record_id', null)
      .order('name')
    if (error) throw new Error(error.message)
    return data
  })

export const createFolder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().trim().min(1).max(200),
      parentId: z.string().min(1).nullable(),
      visibleRoles: z.array(z.enum(ROLES)).nullable().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.crear')
    const canSetVisibility = hasPermission(
      context.user.role,
      'tools.admin.gestionar_acceso',
    )
    // Quien no gestiona accesos no elige la audiencia: la subcarpeta hereda la de su carpeta.
    let visibleRoles: Role[] | null = null
    if (canSetVisibility) {
      visibleRoles = data.visibleRoles ?? null
    } else if (data.parentId) {
      const { data: parent } = await context.supabase
        .from('folders')
        .select('visible_roles')
        .eq('id', data.parentId)
        .maybeSingle()
      visibleRoles = (parent?.visible_roles as Role[] | null) ?? null
    }
    const { data: folder, error } = await context.supabase
      .from('folders')
      .insert({
        name: data.name,
        parent_id: data.parentId,
        created_by: context.user.id,
        visible_roles: visibleRoles,
      })
      .select('id, name, parent_id, visible_roles')
      .single()
    if (error) throw new Error(error.message)
    return folder
  })

export const renameFolder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(200),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { error } = await context.supabase
      .from('folders')
      .update({ name: data.name })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const deleteFolder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.eliminar')

    const [{ count: subfolders }, { count: documents }] = await Promise.all([
      context.supabase
        .from('folders')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', data.id),
      context.supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('folder_id', data.id)
        .is('deleted_at', null),
    ])
    if ((subfolders ?? 0) > 0 || (documents ?? 0) > 0) {
      throw new Error(
        'La carpeta no está vacía. Mueve o elimina primero su contenido.',
      )
    }

    const { error } = await context.supabase
      .from('folders')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const DOC_STATUSES = [
  'borrador',
  'aprobado',
  'vigente',
  'vencido',
] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

export type DocumentSummary = {
  id: string
  title: string
  folder_id: string
  updated_at: string
  status: DocStatus
  due_date: string | null
  tags: string[]
  visible_roles: Role[] | null
  is_favorite: boolean
  /** Destacado por un administrador: aparece en el inicio de todo el mundo. */
  featured: boolean
  /** Quién guardó la versión actual. */
  author: string | null
}

export const listDocuments = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ folderId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<DocumentSummary[]> => {
    // Los favoritos del usuario (pocos) se piden a la vez que los documentos, sin esperar a sus ids.
    const [{ data: documents, error }, { data: favorites }] = await Promise.all(
      [
        (async () => {
          const select = (columns: string) =>
            context.supabase
              .from('documents')
              .select(columns)
              .eq('folder_id', data.folderId)
              .is('deleted_at', null)
              .order('title')
          // Sin la migración 0023 no existe `featured`: se reintenta sin ella.
          const withFeatured = await select(
            'id, title, folder_id, updated_at, status, due_date, tags, visible_roles, featured, version:document_versions!documents_current_version_id_fkey(profiles(full_name, email))',
          )
          return withFeatured.error &&
            isMissingColumn(withFeatured.error.message)
            ? select(
                'id, title, folder_id, updated_at, status, due_date, tags, visible_roles, version:document_versions!documents_current_version_id_fkey(profiles(full_name, email))',
              )
            : withFeatured
        })(),
        context.supabase
          .from('favorites')
          .select('document_id')
          .eq('user_id', context.user.id),
      ],
    )
    if (error) throw new Error(error.message)

    const favoriteIds = new Set(
      (favorites ?? []).map((f: { document_id: string }) => f.document_id),
    )

    type Person = { full_name: string | null; email: string }
    type Raw = Omit<DocumentSummary, 'is_favorite' | 'author' | 'featured'> & {
      featured?: boolean
      version:
        | { profiles: Person | Person[] | null }
        | Array<{ profiles: Person | Person[] | null }>
        | null
    }
    return (documents as unknown as Raw[]).map(({ version, ...d }) => {
      const v = Array.isArray(version) ? version[0] : version
      const person = Array.isArray(v?.profiles) ? v.profiles[0] : v?.profiles
      return {
        ...d,
        featured: d.featured === true,
        author: person?.full_name ?? person?.email ?? null,
        is_favorite: favoriteIds.has(d.id),
      }
    })
  })

/** Crea un documento con su primera versión (usado al crear desde plantilla y al importar). */
export async function insertDocumentWithContent(
  supabase: SupabaseServerClient,
  userId: string,
  input: {
    folderId: string
    title: string
    content: JSONContent
    contentHtml: string
    /** Tema visual; el corporativo es el de por defecto y no se escribe. */
    theme?: DocTheme
  },
): Promise<{ id: string }> {
  const { data: document, error: documentError } = await supabase
    .from('documents')
    .insert({
      folder_id: input.folderId,
      title: input.title,
      created_by: userId,
      search_text: extractText(input.content),
      // Tolerante: sin la migración 0016 no hay columna de tema, así que solo se envía si no es el corporativo.
      ...(input.theme && input.theme !== 'corporate'
        ? { theme: input.theme }
        : {}),
    })
    .select('id')
    .single()
  if (documentError) throw new Error(documentError.message)

  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: document.id,
      version_number: 1,
      content: input.content,
      content_html: input.contentHtml,
      created_by: userId,
    })
    .select('id')
    .single()
  if (versionError) throw new Error(versionError.message)

  const { error: updateError } = await supabase
    .from('documents')
    .update({ current_version_id: version.id })
    .eq('id', document.id)
  if (updateError) throw new Error(updateError.message)

  return { id: document.id as string }
}

export const createDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      folderId: z.string().min(1),
      title: z.string().trim().min(1).max(300),
      templateId: z.string().min(1).nullable().optional(),
      variables: z.record(z.string(), z.string().max(300)).optional(),
      theme: z.enum(DOC_THEMES).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.crear')

    let content: JSONContent = EMPTY_DOC
    let contentHtml = '<p></p>'
    if (data.templateId) {
      const { data: template, error: templateError } = await context.supabase
        .from('document_templates')
        .select('content, content_html')
        .eq('id', data.templateId)
        .single()
      if (templateError) throw new Error(templateError.message)
      const rawHtml = template.content_html as string

      const [{ data: profile }, { data: folder }] = await Promise.all([
        context.supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', context.user.id)
          .maybeSingle(),
        context.supabase
          .from('folders')
          .select('name')
          .eq('id', data.folderId)
          .maybeSingle(),
      ])
      const values: Record<string, string> = {
        ...builtinValues({
          userName:
            (profile?.full_name as string | null) ??
            (profile?.email as string | undefined) ??
            context.user.email,
          folderName: (folder?.name as string | undefined) ?? '',
        }),
      }
      for (const name of extractVariables(rawHtml)) {
        const given = data.variables?.[name]
        values[name] = given?.trim() ? given.trim() : `[${variableLabel(name)}]`
      }
      for (const [name, value] of Object.entries(data.variables ?? {}))
        if (!(normalizeVariable(name) in values) && value.trim())
          values[normalizeVariable(name)] = value.trim()

      content = fillJson(template.content as JSONContent, values)
      contentHtml = sanitizeContentHtml(fillHtml(rawHtml, values))
    }

    const created = await insertDocumentWithContent(
      context.supabase,
      context.user.id,
      {
        folderId: data.folderId,
        title: data.title,
        content,
        contentHtml,
        theme: data.theme,
      },
    )
    return created
  })

export const deleteDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.eliminar')
    const { error } = await context.supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

/** Elimina varios documentos a la vez (papelera): un solo UPDATE, con los mismos permisos que deleteDocument. */
export const deleteDocuments = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.eliminar')
    const { error } = await context.supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', data.ids)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export type DocumentTemplate = {
  id: string
  name: string
  folder_id: string | null
  description: string | null
}

export const listTemplates = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ folderId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<DocumentTemplate[]> => {
    // Aplican las plantillas globales y las de esta carpeta o de cualquiera de sus carpetas superiores.
    // Ambas lecturas van a la vez; el filtro por carpeta se aplica después, en memoria.
    const [{ data: folders }, { data: templates, error }] = await Promise.all([
      context.supabase.from('folders').select('id, parent_id'),
      context.supabase
        .from('document_templates')
        .select('id, name, folder_id, description')
        .order('name'),
    ])
    if (error) throw new Error(error.message)
    const parentOf = new Map(
      ((folders ?? []) as Array<{ id: string; parent_id: string | null }>).map(
        (f) => [f.id, f.parent_id],
      ),
    )
    const chain = new Set<string>()
    let cursor: string | null | undefined = data.folderId
    while (cursor && !chain.has(cursor)) {
      chain.add(cursor)
      cursor = parentOf.get(cursor)
    }
    return (templates as DocumentTemplate[]).filter(
      (t) => t.folder_id === null || chain.has(t.folder_id),
    )
  })

export const getTemplatePreview = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { data: template, error } = await context.supabase
      .from('document_templates')
      .select('content_html')
      .eq('id', data.id)
      .single()
    if (error) throw new Error(error.message)
    const html = sanitizeContentHtml(template.content_html as string)
    return { html, variables: extractVariables(html) }
  })

/** Vistas previas de varias plantillas a la vez (la galería las pide en lote al ir apareciendo en pantalla). */
export const getTemplatePreviews = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ ids: z.array(z.string().min(1)).min(1).max(24) }))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from('document_templates')
      .select('id, content_html')
      .in('id', data.ids)
    if (error) throw new Error(error.message)
    const result: Record<string, { html: string; variables: string[] }> = {}
    for (const row of rows as Array<{
      id: string
      content_html: string
    }>) {
      const html = sanitizeContentHtml(row.content_html)
      result[row.id] = { html, variables: extractVariables(html) }
    }
    return result
  })

export const createTemplateFromDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      name: z.string().trim().min(1).max(200),
      scope: z.enum(['folder', 'global']),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.crear')

    const { data: document, error: documentError } = await context.supabase
      .from('documents')
      .select(
        'folder_id, current_version:document_versions!documents_current_version_id_fkey(content, content_html)',
      )
      .eq('id', data.documentId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- sin tipos generados de Supabase, TS no ve que .single() puede no encontrar filas.
    if (documentError || !document) throw notFound()

    const currentVersion = document.current_version as unknown as {
      content: JSONContent
      content_html: string
    } | null
    if (!currentVersion)
      throw new Error(
        'El documento no tiene contenido para guardar como plantilla.',
      )

    const { error } = await context.supabase.from('document_templates').insert({
      name: data.name,
      folder_id: data.scope === 'folder' ? document.folder_id : null,
      content: currentVersion.content,
      content_html: currentVersion.content_html,
      created_by: context.user.id,
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export type DocumentDetail = {
  id: string
  title: string
  folder_id: string
  folder: { name: string } | null
  updated_at: string
  status: DocStatus
  due_date: string | null
  tags: string[]
  visible_roles: Role[] | null
  approved_at: string | null
  approver: { full_name: string | null; email: string } | null
  is_favorite: boolean
  /** Destacado por un administrador: aparece en el inicio de todo el mundo. */
  featured: boolean
  theme: DocTheme
  /** Sin el HTML: la página pinta el JSON del editor y el HTML solo se pide al comparar o previsualizar versiones. */
  current_version: {
    id: string
    content: JSONContent
    version_number: number
  } | null
}

/** Versiones que se envían con el documento; el resto se pide desde el historial (`listVersions`). */
export const VERSIONS_PAGE = 50

export type DocumentVersionSummary = {
  id: string
  version_number: number
  created_at: string
  profiles: { full_name: string | null; email: string } | null
}

const DETAIL_COLUMNS =
  'id, title, folder_id, folder:folders(name), updated_at, status, due_date, tags, visible_roles, approved_at, approver:profiles!documents_approved_by_fkey(full_name, email), current_version:document_versions!documents_current_version_id_fkey(id, content, version_number, created_at)'

/** Sin las migraciones 0016 (theme) o 0023 (featured) no existen esas columnas: se reintenta sin ellas. */
const isMissingColumn = (message: string) =>
  /does not exist|schema cache|could not find/i.test(message)

export const getDocument = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const fetchDocument = (columns: string) =>
      context.supabase
        .from('documents')
        .select(columns)
        .eq('id', data.id)
        .is('deleted_at', null)
        .single()

    // Las tres lecturas no dependen entre sí: van a la vez (si el documento no se ve, tampoco se ven sus versiones).
    const [documentResult, { data: versions, error: versionsError }, favorite] =
      await Promise.all([
        fetchDocument(`${DETAIL_COLUMNS}, theme, featured`).then((result) =>
          result.error && isMissingColumn(result.error.message)
            ? fetchDocument(`${DETAIL_COLUMNS}, theme`).then((retry) =>
                retry.error && isMissingColumn(retry.error.message)
                  ? fetchDocument(DETAIL_COLUMNS)
                  : retry,
              )
            : result,
        ),
        context.supabase
          .from('document_versions')
          .select(
            'id, version_number, created_at, created_by, profiles(full_name, email)',
          )
          .eq('document_id', data.id)
          .order('version_number', { ascending: false })
          .limit(VERSIONS_PAGE),
        context.supabase
          .from('favorites')
          .select('document_id')
          .eq('user_id', context.user.id)
          .eq('document_id', data.id)
          .maybeSingle(),
      ])
    const { data: document, error } = documentResult
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- sin tipos generados de Supabase, TS no ve que .single() puede no encontrar filas.
    if (error || !document) throw notFound()
    if (versionsError) throw new Error(versionsError.message)

    const row = document as unknown as Omit<
      DocumentDetail,
      'is_favorite' | 'theme' | 'featured'
    > & { theme?: unknown; featured?: boolean }
    return {
      document: {
        ...row,
        theme: themeOf(row.theme),
        featured: row.featured === true,
        is_favorite: Boolean(favorite.data),
      },
      versions: versions as unknown as Array<DocumentVersionSummary>,
    }
  })

/** Versiones más antiguas que `before`, para «Cargar más» en el historial. */
export const listVersions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      before: z.number().int().positive(),
    }),
  )
  .handler(async ({ context, data }): Promise<DocumentVersionSummary[]> => {
    const { data: versions, error } = await context.supabase
      .from('document_versions')
      .select('id, version_number, created_at, profiles(full_name, email)')
      .eq('document_id', data.documentId)
      .lt('version_number', data.before)
      .order('version_number', { ascending: false })
      .limit(VERSIONS_PAGE)
    if (error) throw new Error(error.message)
    return versions as unknown as DocumentVersionSummary[]
  })

export const getDocumentVersion = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { data: version, error } = await context.supabase
      .from('document_versions')
      .select(
        'id, document_id, version_number, content, content_html, created_at',
      )
      .eq('id', data.id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- sin tipos generados de Supabase, TS no ve que .single() puede no encontrar filas.
    if (error || !version) throw notFound()
    return {
      ...version,
      content_html: sanitizeContentHtml(version.content_html as string),
    }
  })

const DOC_LINK_PATTERN =
  /\/documentos\/doc\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/**
 * Deja en `document_links` los documentos que enlaza la versión recién guardada (los «enlaces entrantes»
 * de la página de cada destino salen de ahí). Tolerante: sin la migración 0020 la tabla no existe y no pasa nada.
 */
async function syncDocumentLinks(
  supabase: SupabaseServerClient,
  documentId: string,
  html: string,
) {
  try {
    const found = new Set<string>()
    for (const match of html.matchAll(DOC_LINK_PATTERN))
      found.add(match[1].toLowerCase())
    found.delete(documentId.toLowerCase())

    // Solo documentos que existen: un id inventado rompería la clave foránea de toda la inserción.
    const [{ error: clearError }, { data: existing }] = await Promise.all([
      supabase
        .from('document_links')
        .delete()
        .eq('source_document_id', documentId),
      found.size > 0
        ? supabase
            .from('documents')
            .select('id')
            .in('id', [...found])
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
    ])
    if (clearError) return
    const rows = ((existing ?? []) as Array<{ id: string }>).map((d) => ({
      source_document_id: documentId,
      target_document_id: d.id,
    }))
    if (rows.length > 0) await supabase.from('document_links').insert(rows)
  } catch {
    // Los enlaces son un índice de ayuda: nunca deben impedir guardar el documento.
  }
}

async function insertNextVersion(
  supabase: SupabaseServerClient,
  userId: string,
  input: {
    documentId: string
    title?: string
    content: JSONContent
    contentHtml: string
  },
) {
  const cleanHtml = sanitizeContentHtml(input.contentHtml)

  const { data: last, error: lastError } = await supabase
    .from('document_versions')
    .select('version_number')
    .eq('document_id', input.documentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) throw new Error(lastError.message)
  const nextVersion = (last?.version_number ?? 0) + 1

  const { data: version, error: versionError } = await supabase
    .from('document_versions')
    .insert({
      document_id: input.documentId,
      version_number: nextVersion,
      content: input.content,
      content_html: cleanHtml,
      created_by: userId,
    })
    .select('id')
    .single()
  if (versionError) throw new Error(versionError.message)

  const update: Record<string, unknown> = {
    current_version_id: version.id,
    updated_at: new Date().toISOString(),
    search_text: extractText(input.content),
  }
  if (input.title) update.title = input.title
  const { error: updateError } = await supabase
    .from('documents')
    .update(update)
    .eq('id', input.documentId)
  if (updateError) throw new Error(updateError.message)

  await syncDocumentLinks(supabase, input.documentId, cleanHtml)

  return { versionId: version.id as string, versionNumber: nextVersion }
}

export type CurrentVersionInfo = {
  versionId: string
  versionNumber: number
  createdAt: string
  authorName: string | null
  content: JSONContent
  contentHtml: string
}

export type SaveResult =
  | { conflict: false; versionId: string; versionNumber: number }
  | { conflict: true; current: CurrentVersionInfo }

async function loadCurrentVersion(
  supabase: SupabaseServerClient,
  documentId: string,
): Promise<CurrentVersionInfo | null> {
  const { data, error } = await supabase
    .from('documents')
    .select(
      'current_version:document_versions!documents_current_version_id_fkey(id, version_number, content, content_html, created_at, profiles(full_name, email))',
    )
    .eq('id', documentId)
    .single()
  if (error) return null
  const raw = data as unknown as {
    current_version: {
      id: string
      version_number: number
      content: JSONContent
      content_html: string
      created_at: string
      profiles:
        | { full_name: string | null; email: string }
        | Array<{ full_name: string | null; email: string }>
        | null
    } | null
  }
  const v = raw.current_version
  if (!v) return null
  const author = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles
  return {
    versionId: v.id,
    versionNumber: v.version_number,
    createdAt: v.created_at,
    authorName: author?.full_name ?? author?.email ?? null,
    content: v.content,
    contentHtml: sanitizeContentHtml(v.content_html),
  }
}

export const getLatestVersion = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const current = await loadCurrentVersion(context.supabase, data.documentId)
    if (!current) throw notFound()
    return current
  })

export const saveDocumentVersion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      title: z.string().trim().min(1).max(300),
      content: z.custom<JSONContent>(),
      contentHtml: z.string(),
      // Versión sobre la que se empezó a editar. Si ya no es la actual, alguien guardó antes.
      baseVersionId: z.string().min(1).nullable(),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<SaveResult> => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    if (!data.force) {
      // Solo el id: el documento completo se descarga únicamente si hay conflicto.
      const { data: head } = await context.supabase
        .from('documents')
        .select('current_version_id')
        .eq('id', data.documentId)
        .single()
      if (
        head?.current_version_id &&
        head.current_version_id !== data.baseVersionId
      ) {
        const current = await loadCurrentVersion(
          context.supabase,
          data.documentId,
        )
        if (current) return { conflict: true, current }
      }
    }
    const saved = await insertNextVersion(context.supabase, context.user.id, {
      documentId: data.documentId,
      title: data.title,
      content: data.content,
      contentHtml: data.contentHtml,
    })
    await context.supabase
      .from('document_drafts')
      .delete()
      .eq('document_id', data.documentId)
      .eq('user_id', context.user.id)
    return { conflict: false, ...saved }
  })

export const restoreVersion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({ documentId: z.string().min(1), versionId: z.string().min(1) }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { data: version, error } = await context.supabase
      .from('document_versions')
      .select('content, content_html')
      .eq('id', data.versionId)
      .eq('document_id', data.documentId)
      .single()
    if (error) throw new Error(error.message)
    return insertNextVersion(context.supabase, context.user.id, {
      documentId: data.documentId,
      content: version.content as JSONContent,
      contentHtml: version.content_html as string,
    })
  })
