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
import { parseOrg } from '#/lib/diagrams'
import type { OrgNode } from '#/lib/diagrams'
import { ChartDialog } from '#/components/documents/ChartDialog'
import type { BlockDialogRequest } from '#/components/documents/editor-extras'

const ORG_EXAMPLE = `Dirección | Gerente general
  Operaciones | Jefe de operaciones
    Canchas | Encargado de canchas
    Mantenimiento | Técnico
  Administración | Contadora
  Deportes | Coordinador deportivo
    Academia | Director de academia`

function OrgPreview({ nodes }: { nodes: OrgNode[] }) {
  return (
    <ul>
      {nodes.map((n, i) => (
        <li key={`${n.name}-${i}`}>
          <span className="sc-org-node">
            <strong>{n.name}</strong>
            {n.role && <small>{n.role}</small>}
          </span>
          {n.children.length > 0 && <OrgPreview nodes={n.children} />}
        </li>
      ))}
    </ul>
  )
}

/** Editor de organigramas: se escribe como lista con sangría y se ve el resultado al instante. Los gráficos tienen su propio diálogo. */
export function BlockDialog({
  request,
  onClose,
  onSave,
}: {
  request: BlockDialogRequest | null
  onClose: () => void
  onSave: (attrs: Record<string, unknown>) => void
}) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (request?.type === 'org')
      setText((request.attrs?.text as string | undefined) ?? ORG_EXAMPLE)
  }, [request])

  const org = useMemo(() => parseOrg(text), [text])

  if (request?.type === 'chart')
    return <ChartDialog request={request} onClose={onClose} onSave={onSave} />

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Organigrama</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="block-text">Estructura</Label>
            <Textarea
              id="block-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-56 font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Una línea por persona: "Nombre | Cargo". Sangra con dos espacios
              para ponerla debajo de otra.
            </p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label>Vista previa</Label>
            <div className="doc-sheet max-h-80 overflow-auto rounded-lg border border-border bg-white p-3">
              <div className="ProseMirror">
                <div className="sc-org">
                  <OrgPreview nodes={org} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={org.length === 0} onClick={() => onSave({ text })}>
            {request?.pos === null ? 'Insertar' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
