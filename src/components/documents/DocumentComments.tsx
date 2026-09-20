import { memo, useState } from 'react'
import { Check, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { addComment, deleteComment, setCommentResolved } from '#/server/library'
import type { DocumentComment } from '#/server/library'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'

export const DocumentComments = memo(function DocumentComments({
  documentId,
  comments,
  onCommentsChange,
  onReload,
  currentUserId,
  canComment,
  isAdmin,
  onReveal,
}: {
  documentId: string
  /** `null` mientras llegan (se cargan después del primer pintado de la página). */
  comments: DocumentComment[] | null
  /** Cambia la lista al instante, sin esperar al servidor (resolver, eliminar). */
  onCommentsChange: (
    update: (prev: DocumentComment[]) => DocumentComment[],
  ) => void
  /** Vuelve a pedir los comentarios al servidor (tras añadir uno, o si una acción falla). */
  onReload: () => Promise<void>
  currentUserId: string
  canComment: boolean
  isAdmin: boolean
  onReveal?: (quote: string) => void
}) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  async function run(action: () => Promise<unknown>, reload = false) {
    try {
      await action()
      if (reload) await onReload()
    } catch (err) {
      // El cambio al instante ya no vale: se vuelve a lo que dice el servidor.
      void onReload()
      toast.error(
        err instanceof Error ? err.message : 'No se pudo completar la acción',
      )
    }
  }

  async function send() {
    if (!body.trim()) return
    setSending(true)
    await run(
      () => addComment({ data: { documentId, body: body.trim() } }),
      true,
    )
    setBody('')
    setSending(false)
  }

  function toggleResolved(comment: DocumentComment) {
    const resolved = !comment.resolved
    onCommentsChange((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, resolved } : c)),
    )
    void run(() => setCommentResolved({ data: { id: comment.id, resolved } }))
  }

  function remove(comment: DocumentComment) {
    onCommentsChange((prev) => prev.filter((c) => c.id !== comment.id))
    void run(() => deleteComment({ data: { id: comment.id } }))
  }

  return (
    <section className="mt-0">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-display uppercase tracking-wide text-muted-foreground">
        <MessageSquare className="size-4" />
        Comentarios{comments ? ` (${comments.length})` : ''}
      </h2>

      {comments === null && (
        <div
          className="mb-4 h-16 animate-pulse rounded-lg border border-border bg-secondary/40"
          aria-hidden
        />
      )}

      {comments && comments.length > 0 && (
        <ul className="mb-4 space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3',
                c.resolved && 'opacity-60',
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.author?.full_name ?? c.author?.email ?? 'Usuario'}
                </span>
                <span>{new Date(c.created_at).toLocaleString('es-NI')}</span>
                {c.resolved && (
                  <span className="rounded-md bg-secondary px-1.5 py-0.5">
                    Resuelto
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title={c.resolved ? 'Reabrir' : 'Marcar como resuelto'}
                    onClick={() => toggleResolved(c)}
                  >
                    {c.resolved ? (
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </Button>
                  {(c.author_id === currentUserId || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive"
                      title="Eliminar comentario"
                      onClick={() => remove(c)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </span>
              </div>
              {c.quote && (
                <button
                  type="button"
                  onClick={() => c.quote && onReveal?.(c.quote)}
                  title="Ir al fragmento en el documento"
                  className="mb-1.5 block w-full rounded-md border-l-4 border-[var(--sc-accent)] bg-secondary/50 px-3 py-1.5 text-left text-xs italic text-muted-foreground hover:bg-secondary"
                >
                  {c.quote}
                </button>
              )}
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Escribe un comentario…"
          />
          <Button size="sm" onClick={send} disabled={sending || !body.trim()}>
            Comentar
          </Button>
        </div>
      )}
    </section>
  )
})
