import { memo, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

/** Comentario sobre un fragmento del texto: muestra la cita y pide el mensaje. */
export const CommentDialog = memo(function CommentDialog({
  quote,
  onClose,
  onSend,
}: {
  quote: string | null
  onClose: () => void
  onSend: (body: string) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (quote !== null) setBody('')
  }, [quote])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    try {
      await onSend(body.trim())
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo enviar el comentario',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={quote !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comentar este fragmento</DialogTitle>
        </DialogHeader>
        {quote && (
          <blockquote className="max-h-28 overflow-y-auto rounded-md border-l-4 border-[var(--sc-accent)] bg-secondary/50 px-3 py-2 text-sm italic text-muted-foreground">
            {quote}
          </blockquote>
        )}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe tu comentario…"
          maxLength={2000}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={!body.trim() || sending}>
            {sending ? 'Enviando…' : 'Comentar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
