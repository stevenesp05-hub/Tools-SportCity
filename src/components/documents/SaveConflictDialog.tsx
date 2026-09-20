import { memo, useMemo } from 'react'
import { diffWords } from 'diff'
import { htmlToText } from '#/lib/document-text'
import type { CurrentVersionInfo } from '#/server/documents'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

export const SaveConflictDialog = memo(function SaveConflictDialog({
  current,
  mineHtml,
  busy,
  onKeepMine,
  onLoadTheirs,
  onClose,
}: {
  current: CurrentVersionInfo | null
  mineHtml: string
  busy: boolean
  onKeepMine: () => void
  onLoadTheirs: () => void
  onClose: () => void
}) {
  // Solo con el diálogo abierto (`current`) y solo cuando cambia alguna de las dos versiones.
  const parts = useMemo(
    () =>
      current
        ? diffWords(htmlToText(mineHtml), htmlToText(current.contentHtml))
        : [],
    [current, mineHtml],
  )
  const author = current?.authorName ?? 'Otra persona'

  return (
    <Dialog open={current !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alguien guardó antes que tú</DialogTitle>
        </DialogHeader>
        {current && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{author}</span>{' '}
              guardó la versión {current.versionNumber} el{' '}
              {new Date(current.createdAt).toLocaleString('es-NI')} mientras tú
              editabas. Si guardas la tuya encima, su versión se conserva en el
              historial, pero la tuya pasa a ser la actual.
            </p>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium text-foreground">Diferencias</span>
                <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-destructive">
                  solo en la tuya
                </span>
                <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-success">
                  solo en la de {author}
                </span>
              </div>
              <ScrollArea className="h-64 rounded-md border border-border bg-card p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {parts.map((part, index) => (
                    <span
                      key={index}
                      className={
                        part.removed
                          ? 'rounded-sm bg-danger-soft text-destructive line-through'
                          : part.added
                            ? 'rounded-sm bg-success-soft text-success'
                            : undefined
                      }
                    >
                      {part.value}
                    </span>
                  ))}
                </p>
              </ScrollArea>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Seguir editando
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onLoadTheirs} disabled={busy}>
              Cargar la suya (descarto la mía)
            </Button>
            <Button onClick={onKeepMine} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar la mía encima'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
