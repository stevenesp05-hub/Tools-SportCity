import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/auth'

const unwrap = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null)

export type NotificationItem = {
  key: string
  kind: 'review' | 'decision' | 'overdue' | 'due_soon'
  documentId: string
  title: string
  detail: string
  at: string
}

export type Notifications = {
  items: NotificationItem[]
  count: number
}

const DAY = 86_400_000

/** Avisos del usuario: revisiones que le piden, respuestas a las suyas y documentos vencidos o por vencer. */
export const getNotifications = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Notifications> => {
    const today = new Date()
    const in7 = new Date(today.getTime() + 7 * DAY).toISOString().slice(0, 10)
    const since = new Date(today.getTime() - 7 * DAY).toISOString()
    const todayIso = today.toISOString().slice(0, 10)

    const [pending, decided, due] = await Promise.all([
      context.supabase
        .from('document_reviews')
        .select(
          'id, requested_at, note, document:documents(id, title, deleted_at), requester:profiles!document_reviews_requested_by_fkey(full_name, email)',
        )
        .eq('reviewer_id', context.user.id)
        .eq('status', 'pending'),
      context.supabase
        .from('document_reviews')
        .select(
          'id, status, decided_at, decision_note, document:documents(id, title, deleted_at), reviewer:profiles!document_reviews_reviewer_id_fkey(full_name, email)',
        )
        .eq('requested_by', context.user.id)
        .in('status', ['approved', 'changes_requested'])
        .gte('decided_at', since),
      context.supabase
        .from('documents')
        .select('id, title, due_date, status')
        .is('deleted_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', in7)
        .neq('status', 'vencido')
        .order('due_date')
        .limit(30),
    ])

    type Doc = { id: string; title: string; deleted_at: string | null }
    type Person = { full_name: string | null; email: string }
    const name = (p: Person | null) => p?.full_name ?? p?.email ?? 'Alguien'
    const items: NotificationItem[] = []

    // Si las migraciones de revisiones aún no están aplicadas, esas consultas fallan y solo se muestran vencimientos.
    for (const r of (pending.data ?? []) as unknown as Array<{
      id: string
      requested_at: string
      note: string | null
      document: Doc | Doc[] | null
      requester: Person | Person[] | null
    }>) {
      const doc = unwrap(r.document)
      if (!doc || doc.deleted_at) continue
      items.push({
        key: `review-${r.id}`,
        kind: 'review',
        documentId: doc.id,
        title: doc.title,
        detail: `${name(unwrap(r.requester))} te pide que lo revises${r.note ? `: "${r.note}"` : ''}`,
        at: r.requested_at,
      })
    }
    for (const r of (decided.data ?? []) as unknown as Array<{
      id: string
      status: string
      decided_at: string
      decision_note: string | null
      document: Doc | Doc[] | null
      reviewer: Person | Person[] | null
    }>) {
      const doc = unwrap(r.document)
      if (!doc || doc.deleted_at) continue
      items.push({
        key: `decision-${r.id}`,
        kind: 'decision',
        documentId: doc.id,
        title: doc.title,
        detail:
          r.status === 'approved'
            ? `${name(unwrap(r.reviewer))} lo aprobó`
            : `${name(unwrap(r.reviewer))} pide cambios: "${r.decision_note ?? ''}"`,
        at: r.decided_at,
      })
    }
    for (const d of (due.data ?? []) as unknown as Array<{
      id: string
      title: string
      due_date: string
    }>) {
      const overdue = d.due_date < todayIso
      const days = Math.round(
        (new Date(`${d.due_date}T00:00:00`).getTime() -
          new Date(`${todayIso}T00:00:00`).getTime()) /
          DAY,
      )
      items.push({
        key: `due-${d.id}`,
        kind: overdue ? 'overdue' : 'due_soon',
        documentId: d.id,
        title: d.title,
        detail: overdue
          ? `Venció hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`
          : days === 0
            ? 'Vence hoy'
            : `Vence en ${days} ${days === 1 ? 'día' : 'días'}`,
        at: d.due_date,
      })
    }

    const order = { review: 0, overdue: 1, decision: 2, due_soon: 3 } as const
    items.sort((a, b) => order[a.kind] - order[b.kind])
    return { items, count: items.length }
  })
