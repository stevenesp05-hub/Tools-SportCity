import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { JSONContent } from '@tiptap/react'
import { authMiddleware } from '#/server/auth'
import { assertPermission } from '#/lib/permissions'
import { DOC_THEMES } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'

export type ServerDraft = {
  baseVersionId: string | null
  title: string
  content: JSONContent
  updatedAt: string
}

/** Un error de "tabla/columna inexistente" indica que la migración 0016 aún no se ha aplicado. */
const isMissingSchema = (message: string) =>
  /does not exist|schema cache|could not find/i.test(message)

/** Borrador del usuario para un documento. Tolerante: sin la migración 0016 devuelve «sin borrador». (El tema viaja con `getDocument`.) */
export const getDocumentExtras = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { data: draftRow, error } = await context.supabase
      .from('document_drafts')
      .select('base_version_id, title, content, updated_at')
      .eq('document_id', data.documentId)
      .eq('user_id', context.user.id)
      .maybeSingle()
    const draft: ServerDraft | null = draftRow
      ? {
          baseVersionId: draftRow.base_version_id,
          title: draftRow.title,
          content: draftRow.content,
          updatedAt: draftRow.updated_at,
        }
      : null
    return { draft, draftsSupported: !error }
  })

export type DraftSaveResult =
  | { ok: true; at: string }
  | { ok: false; unsupported: boolean; message: string }

/** Autoguardado: un borrador por usuario y documento, que no crea versiones en el historial. */
export const saveDraft = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      baseVersionId: z.string().min(1).nullable(),
      title: z.string().trim().min(1).max(300),
      content: z.custom<JSONContent>(),
    }),
  )
  .handler(async ({ context, data }): Promise<DraftSaveResult> => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const at = new Date().toISOString()
    const { error } = await context.supabase.from('document_drafts').upsert({
      document_id: data.documentId,
      user_id: context.user.id,
      base_version_id: data.baseVersionId,
      title: data.title,
      content: data.content,
      updated_at: at,
    })
    if (error)
      return {
        ok: false,
        unsupported: isMissingSchema(error.message),
        message: error.message,
      }
    return { ok: true, at }
  })

export const discardDraft = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ documentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    await context.supabase
      .from('document_drafts')
      .delete()
      .eq('document_id', data.documentId)
      .eq('user_id', context.user.id)
    return { ok: true as const }
  })

export const setDocumentTheme = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({ documentId: z.string().min(1), theme: z.enum(DOC_THEMES) }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const theme: DocTheme = data.theme
    const { error } = await context.supabase
      .from('documents')
      .update({ theme })
      .eq('id', data.documentId)
    if (error)
      throw new Error(
        isMissingSchema(error.message)
          ? 'Falta aplicar la migración 0016 en Supabase para guardar el tema.'
          : error.message,
      )
    return { ok: true as const }
  })
