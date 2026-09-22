import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { authMiddleware } from '#/server/auth'
import { assertPermission } from '#/lib/permissions'
import { getSupabaseAdminClient } from '#/lib/supabase/admin.server'
import { clearShareCache, resolveShareToken } from '#/server/sharing.server'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import { expandDynamicBlocks } from '#/lib/dynamic-blocks'

export type ShareLink = {
  id: string
  token: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  active: boolean
  /** El PDF de este enlace no muestra autor ni aprobador. */
  hideAuthorship: boolean
}

export const listShares = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ShareLink[]> => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const query = (columns: string) =>
      context.supabase
        .from('document_shares')
        .select(columns)
        .eq('document_id', data.documentId)
        .order('created_at', { ascending: false })
    // Sin la migración 0022 no existe hide_authorship: se lee igual, sin esa columna.
    let { data: rows, error } = await query(
      'id, token, created_at, expires_at, revoked_at, hide_authorship',
    )
    if (error)
      ({ data: rows, error } = await query(
        'id, token, created_at, expires_at, revoked_at',
      ))
    if (error) return []
    const now = Date.now()
    return (
      rows as unknown as Array<{
        id: string
        token: string
        created_at: string
        expires_at: string | null
        revoked_at: string | null
        hide_authorship?: boolean
      }>
    ).map((r) => ({
      id: r.id,
      token: r.token,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      hideAuthorship: r.hide_authorship === true,
      active:
        !r.revoked_at &&
        (!r.expires_at || new Date(r.expires_at).getTime() > now),
    }))
  })

export const createShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      days: z.number().int().min(1).max(365).nullable(),
      hideAuthorship: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    // Ocultar autor y aprobador es decisión del administrador.
    if (data.hideAuthorship)
      assertPermission(context.user.role, 'tools.admin.gestionar_acceso')
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const token = Buffer.from(bytes).toString('base64url')
    const expiresAt = data.days
      ? new Date(Date.now() + data.days * 86_400_000).toISOString()
      : null
    const { error } = await context.supabase.from('document_shares').insert({
      document_id: data.documentId,
      token,
      created_by: context.user.id,
      expires_at: expiresAt,
      // Solo se envía si se pide: así crear enlaces normales no depende de la migración 0022.
      ...(data.hideAuthorship ? { hide_authorship: true } : {}),
    })
    if (error)
      throw new Error(
        /hide_authorship/.test(error.message)
          ? 'Falta ejecutar la migración 0022_compartir_sin_autoria.sql en Supabase.'
          : error.message,
      )
    return { token }
  })

export const revokeShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { error } = await context.supabase
      .from('document_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    clearShareCache()
    return { ok: true as const }
  })

export type SharedDocument = {
  title: string
  folderName: string
  status: string
  html: string
  updatedAt: string
  versionNumber: number
}

/** Sin sesión: la seguridad es el enlace secreto (192 bits), su caducidad y que se pueda revocar. */
export const getSharedDocument = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<SharedDocument> => {
    const documentId = await resolveShareToken(data.token)
    if (!documentId) throw notFound()

    const admin = getSupabaseAdminClient()
    const { data: doc } = await admin
      .from('documents')
      .select(
        'title, status, updated_at, deleted_at, folder:folders(name), version:document_versions!documents_current_version_id_fkey(version_number, content_html)',
      )
      .eq('id', documentId)
      .maybeSingle()
    const raw = doc as unknown as {
      title: string
      status: string
      updated_at: string
      deleted_at: string | null
      folder: { name: string } | Array<{ name: string }> | null
      version:
        | { version_number: number; content_html: string }
        | Array<{ version_number: number; content_html: string }>
        | null
    } | null
    if (!raw || raw.deleted_at) throw notFound()
    const version = Array.isArray(raw.version) ? raw.version[0] : raw.version
    const folder = Array.isArray(raw.folder) ? raw.folder[0] : raw.folder
    if (!version) throw notFound()
    return {
      title: raw.title,
      folderName: folder?.name ?? 'Documento',
      status: raw.status,
      html: expandDynamicBlocks(
        sanitizeContentHtml(version.content_html),
      ).replace(
        /\/api\/imagenes\/([A-Za-z0-9._-]+)/g,
        `/api/compartido/${data.token}/imagenes/$1`,
      ),
      updatedAt: raw.updated_at,
      versionNumber: version.version_number,
    }
  })
