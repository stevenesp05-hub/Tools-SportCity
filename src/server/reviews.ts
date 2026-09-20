import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '#/server/auth'
import { PERMISSIONS, assertPermission } from '#/lib/permissions'

type Person = { full_name: string | null; email: string }

const unwrap = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
const personName = (p: Person | null) => p?.full_name ?? p?.email ?? 'Alguien'

export type ReviewStatus =
  'pending' | 'approved' | 'changes_requested' | 'cancelled'

export type DocumentReview = {
  id: string
  status: ReviewStatus
  note: string | null
  decisionNote: string | null
  requestedAt: string
  decidedAt: string | null
  requestedBy: string
  requestedById: string
  reviewer: string
  reviewerId: string
  /** ¿La revisión se pidió sobre la versión que hoy es la actual? */
  onCurrentVersion: boolean
}

export const listReviewers = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')
    const { data, error } = await context.supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', [...PERMISSIONS['tools.documentos.aprobar']])
      .order('full_name')
    if (error) throw new Error(error.message)
    return (data as unknown as Array<{ id: string } & Person>)
      .filter((p) => p.id !== context.user.id)
      .map((p) => ({ id: p.id, name: personName(p) }))
  })

export const listReviews = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      // Si la página ya conoce la versión actual, se evita releerla del documento.
      currentVersionId: z.string().min(1).nullable().optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<DocumentReview[]> => {
    const [{ data: rows, error }, currentVersionId] = await Promise.all([
      context.supabase
        .from('document_reviews')
        .select(
          'id, status, note, decision_note, requested_at, decided_at, version_id, requested_by, reviewer_id, requester:profiles!document_reviews_requested_by_fkey(full_name, email), reviewer:profiles!document_reviews_reviewer_id_fkey(full_name, email)',
        )
        .eq('document_id', data.documentId)
        .order('requested_at', { ascending: false })
        .limit(10),
      data.currentVersionId !== undefined
        ? Promise.resolve(data.currentVersionId)
        : context.supabase
            .from('documents')
            .select('current_version_id')
            .eq('id', data.documentId)
            .maybeSingle()
            .then(
              ({ data: doc }) =>
                (doc?.current_version_id as string | null | undefined) ?? null,
            ),
    ])
    // Si la migración de revisiones aún no está aplicada, simplemente no hay revisiones que mostrar.
    if (error) return []
    return (
      rows as unknown as Array<{
        id: string
        status: ReviewStatus
        note: string | null
        decision_note: string | null
        requested_at: string
        decided_at: string | null
        version_id: string | null
        requested_by: string
        reviewer_id: string
        requester: Person | Person[] | null
        reviewer: Person | Person[] | null
      }>
    ).map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      decisionNote: r.decision_note,
      requestedAt: r.requested_at,
      decidedAt: r.decided_at,
      requestedBy: personName(unwrap(r.requester)),
      requestedById: r.requested_by,
      reviewer: personName(unwrap(r.reviewer)),
      reviewerId: r.reviewer_id,
      onCurrentVersion: r.version_id === currentVersionId,
    }))
  })

export const requestReview = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      documentId: z.string().min(1),
      reviewerId: z.string().min(1),
      note: z.string().trim().max(1000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.editar')

    const [{ data: reviewer }, { data: doc }, { data: pending }] =
      await Promise.all([
        context.supabase
          .from('profiles')
          .select('role')
          .eq('id', data.reviewerId)
          .maybeSingle(),
        context.supabase
          .from('documents')
          .select('current_version_id')
          .eq('id', data.documentId)
          .maybeSingle(),
        context.supabase
          .from('document_reviews')
          .select('id')
          .eq('document_id', data.documentId)
          .eq('reviewer_id', data.reviewerId)
          .eq('status', 'pending')
          .maybeSingle(),
      ])
    const allowed: ReadonlyArray<string> =
      PERMISSIONS['tools.documentos.aprobar']
    if (!reviewer || !allowed.includes(reviewer.role as string))
      throw new Error('Esa persona no puede aprobar documentos.')
    if (pending)
      throw new Error('Ya hay una revisión pendiente con esa persona.')

    const { error } = await context.supabase.from('document_reviews').insert({
      document_id: data.documentId,
      version_id:
        (doc?.current_version_id as string | null | undefined) ?? null,
      requested_by: context.user.id,
      reviewer_id: data.reviewerId,
      note: data.note || null,
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const decideReview = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      decision: z.enum(['approved', 'changes_requested']),
      note: z.string().trim().max(1000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.documentos.aprobar')

    const { data: review, error } = await context.supabase
      .from('document_reviews')
      .select('id, document_id, version_id, reviewer_id, status')
      .eq('id', data.id)
      .single()
    if (error) throw new Error(error.message)
    if (review.reviewer_id !== context.user.id)
      throw new Error('Esta revisión no te corresponde.')
    if (review.status !== 'pending')
      throw new Error('Esta revisión ya se resolvió.')

    const { data: doc } = await context.supabase
      .from('documents')
      .select('current_version_id')
      .eq('id', review.document_id)
      .single()
    if (doc?.current_version_id !== review.version_id)
      throw new Error(
        'El documento cambió desde que se pidió la revisión. Pide una nueva.',
      )
    if (data.decision === 'changes_requested' && !data.note)
      throw new Error('Indica qué cambios hay que hacer.')

    const now = new Date().toISOString()
    const { error: updateError } = await context.supabase
      .from('document_reviews')
      .update({
        status: data.decision,
        decision_note: data.note || null,
        decided_at: now,
      })
      .eq('id', data.id)
    if (updateError) throw new Error(updateError.message)

    if (data.decision === 'approved') {
      const { error: docError } = await context.supabase
        .from('documents')
        .update({
          status: 'aprobado',
          approved_by: context.user.id,
          approved_at: now,
        })
        .eq('id', review.document_id)
      if (docError) throw new Error(docError.message)
    }
    return { ok: true as const }
  })

export const cancelReview = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from('document_reviews')
      .update({ status: 'cancelled', decided_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })
