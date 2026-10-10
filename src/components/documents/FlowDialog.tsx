import { useEffect, useMemo, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { FLOW_EXAMPLE, FLOW_EXAMPLES, flowTree, parseFlow } from '#/lib/flow'
import { ChartTreeView } from '#/components/documents/ChartView'
import type { BlockDialogRequest } from '#/components/documents/editor-extras'

/** Editor de diagramas de flujo: se escribe como texto y se ve el dibujo al instante. */
export function FlowDialog({
  request,
  onClose,
  onSave,
}: {
  request: BlockDialogRequest
  onClose: () => void
  onSave: (attrs: Record<string, unknown>) => void
}) {
  const [text, setText] = useState(FLOW_EXAMPLE)

  useEffect(() => {
    setText((request.attrs?.text as string | undefined) ?? FLOW_EXAMPLE)
  }, [request])

  const parsed = useMemo(() => parseFlow(text), [text])
  const tree = useMemo(() => flowTree(text), [text])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Diagrama de flujo</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="flow-text">Pasos</Label>
            <Textarea
              id="flow-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-64 font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Cada línea une pasos con una flecha: <code>A --&gt; B</code>.
              Formas: <code>[paso]</code>, <code>([inicio o fin])</code>,{' '}
              <code>{'{¿decisión?}'}</code>. Etiqueta una flecha con{' '}
              <code>{'-->|Sí|'}</code>. Empieza con <code>flowchart TD</code>{' '}
              (vertical) o <code>flowchart LR</code> (horizontal).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FLOW_EXAMPLES.map((example) => (
                <Button
                  key={example.name}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setText(example.text)}
                >
                  {example.name}
                </Button>
              ))}
            </div>
            {parsed.problems.length > 0 && (
              <ul className="space-y-0.5 text-xs text-amber-700">
                {parsed.problems.slice(0, 4).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label>Vista previa</Label>
            <div className="doc-sheet max-h-96 overflow-auto rounded-lg border border-border bg-white p-3">
              <div className="ProseMirror">
                <div className="sc-flow">
                  <ChartTreeView tree={tree} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={parsed.nodes.length === 0}
            onClick={() => onSave({ text })}
          >
            {request.pos === null ? 'Insertar' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
