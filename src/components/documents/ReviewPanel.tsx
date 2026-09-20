import { memo, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquareWarning,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelReview,
  decideReview,
  listReviewers,
  requestReview,
} from '#/server/reviews'
import type { DocumentReview } from '#/server/reviews'
import { Button } from '#/components/ui/button'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { useDialogs } from '#/components/ui/dialogs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

const fmt = (iso: string) => new Date(iso).toLocaleString('es-NI')

/** Avisos de revisión del documento: pendiente, aprobada o con cambios pedidos. */
export const ReviewBanners = memo(function ReviewBanners({
  reviews,
  currentUserId,
  canApprove,
  onChanged,
}: {
  reviews: DocumentReview[]
  currentUserId: string
  canApprove: boolean
  /** Tras aprobar, pedir cambios o cancelar: la página recarga las revisiones (y el estado del documento). */
  onChanged: () => Promise<void>
}) {
  const { confirm, prompt } = useDialogs()
  const [busy, setBusy] = useState(false)

  const pending = reviews.filter((r) => r.status === 'pending')
  const latestDecided = reviews.find(
    (r) => r.status !== 'pending' && r.status !== 'cancelled',
  )

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      await onChanged()
      toast.success(success)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo completar la acción',
      )
    } finally {
      setBusy(false)
    }
  }

  async function approve(review: DocumentReview) {
    const ok = await confirm({
      title: '¿Aprobar este documento?',
      description:
        'Quedará marcado como aprobado por ti, con la fecha de hoy. Aparecerá en el PDF.',
      confirmLabel: 'Aprobar',
    })
    if (!ok) return
    await run(
      () => decideReview({ data: { id: review.id, decision: 'approved' } }),
      'Documento aprobado',
    )
  }

  async function requestChanges(review: DocumentReview) {
    const note = await prompt({
      title: 'Pedir cambios',
      label: '¿Qué hay que cambiar?',
      confirmLabel: 'Enviar',
    })
    if (!note?.trim()) return
    await run(
      () =>
        decideReview({
          data: {
            id: review.id,
            decision: 'changes_requested',
            note: note.trim(),
          },
        }),
      'Cambios solicitados',
    )
  }

  if (pending.length === 0 && !latestDecided) return null

  return (
    <div className="flex flex-none flex-col gap-2">
      {pending.map((review) => {
        const mine = review.reviewerId === currentUserId && canApprove
        return (
          <div
            key={review.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-soft px-4 py-2 text-sm text-info"
          >
            <ClipboardCheck className="size-4 flex-none" />
            <span className="min-w-0 flex-1">
              {mine ? (
                <>
                  <strong>{review.requestedBy}</strong> te pide que revises este
                  documento
                  {review.note ? `: "${review.note}"` : '.'}
                  {!review.onCurrentVersion &&
                    ' El documento cambió desde la solicitud; pide una nueva.'}
                </>
              ) : (
                <>
                  Revisión pendiente con <strong>{review.reviewer}</strong>{' '}
                  (pedida por {review.requestedBy} el {fmt(review.requestedAt)}
                  ).
                </>
              )}
            </span>
            {mine && review.onCurrentVersion && (
              <>
                <Button
                  size="sm"
                  className="h-7"
                  disabled={busy}
                  onClick={() => approve(review)}
                >
                  Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-info-line bg-white text-info"
                  disabled={busy}
                  onClick={() => requestChanges(review)}
                >
                  Pedir cambios
                </Button>
              </>
            )}
            {review.requestedById === currentUserId && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-info"
                disabled={busy}
                onClick={() =>
                  run(
                    () => cancelReview({ data: { id: review.id } }),
                    'Solicitud cancelada',
                  )
                }
              >
                Cancelar solicitud
              </Button>
            )}
          </div>
        )
      })}

      {pending.length === 0 &&
        latestDecided &&
        latestDecided.onCurrentVersion && (
          <div
            className={
              latestDecided.status === 'approved'
                ? 'flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-4 py-2 text-sm text-success'
                : 'flex items-center gap-2 rounded-lg border border-warning-line bg-warning-soft px-4 py-2 text-sm text-warning'
            }
          >
            {latestDecided.status === 'approved' ? (
              <CheckCircle2 className="size-4 flex-none" />
            ) : (
              <MessageSquareWarning className="size-4 flex-none" />
            )}
            <span>
              {latestDecided.status === 'approved' ? (
                <>
                  <strong>{latestDecided.reviewer}</strong> aprobó este
                  documento el{' '}
                  {fmt(latestDecided.decidedAt ?? latestDecided.requestedAt)}.
                </>
              ) : (
                <>
                  <strong>{latestDecided.reviewer}</strong> pide cambios:{' '}
                  &ldquo;{latestDecided.decisionNote}&rdquo;
                </>
              )}
            </span>
          </div>
        )}
    </div>
  )
})

export function RequestReviewDialog({
  documentId,
  open,
  onOpenChange,
  onRequested,
}: {
  documentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** La página recarga las revisiones para mostrar el aviso de la nueva solicitud. */
  onRequested: () => Promise<void>
}) {
  const [reviewers, setReviewers] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [reviewerId, setReviewerId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setReviewerId('')
    setNote('')
    listReviewers()
      .then(setReviewers)
      .catch(() => setReviewers([]))
  }, [open])

  async function send() {
    if (!reviewerId) return
    setSending(true)
    try {
      await requestReview({
        data: { documentId, reviewerId, note: note.trim() || undefined },
      })
      await onRequested()
      toast.success('Revisión solicitada')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo pedir la revisión',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir revisión</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          La persona elegida verá un aviso y podrá aprobar el documento o
          pedirte cambios. Se revisa la versión que tienes guardada ahora.
        </p>
        <div className="space-y-1.5">
          <Label>Quién lo revisa</Label>
          <ChoiceSelect
            ariaLabel="Quién lo revisa"
            className="h-9 w-full text-sm"
            value={reviewerId}
            onChange={setReviewerId}
            placeholder={
              reviewers.length === 0
                ? 'No hay más personas que puedan aprobar'
                : 'Elige a una persona'
            }
            options={reviewers.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-note">Nota (opcional)</Label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Qué debe mirar, para cuándo lo necesitas…"
            maxLength={1000}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={!reviewerId || sending}>
            {sending ? 'Enviando…' : 'Pedir revisión'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
