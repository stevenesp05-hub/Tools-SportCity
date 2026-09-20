import { memo, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { checkDocument } from '#/lib/doc-checks'
import type { CheckLevel } from '#/lib/doc-checks'
import { revealText } from '#/components/documents/editor-extras'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'

const LEVELS: Record<CheckLevel, { icon: typeof Info; tone: string }> = {
  error: { icon: XCircle, tone: 'text-destructive' },
  warn: { icon: AlertTriangle, tone: 'text-warning' },
  info: { icon: Info, tone: 'text-info' },
  ok: { icon: CheckCircle2, tone: 'text-success' },
}

/** Comprobaciones automáticas del documento abierto: campos sin rellenar, totales que no cuadran, tablas a medias. */
export const DocumentChecksDialog = memo(function DocumentChecksDialog({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editor: Editor | null
}) {
  const checks = useMemo(
    () => (open && editor ? checkDocument(editor.getJSON()) : []),
    [open, editor],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comprobar documento</DialogTitle>
          <DialogDescription>
            Revisión automática del contenido actual. No modifica nada.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {checks.map((check, index) => {
            const { icon: Icon, tone } = LEVELS[check.level]
            const jump = Boolean(check.reveal && editor)
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={!jump}
                  onClick={() => {
                    if (!editor || !check.reveal) return
                    onOpenChange(false)
                    revealText(editor, check.reveal)
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left',
                    jump && 'hover:bg-secondary/60',
                  )}
                >
                  <Icon className={cn('mt-0.5 size-4 flex-none', tone)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {check.title}
                    </span>
                    {check.detail && (
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {check.detail}
                      </span>
                    )}
                    {jump && (
                      <span className="mt-1 block text-2xs text-primary">
                        Ir al punto del documento
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
})
