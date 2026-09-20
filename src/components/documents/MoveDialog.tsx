import { useMemo, useState } from 'react'
import { Folder } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'
import type { FolderRow } from '#/server/documents'

type Option = { id: string | null; name: string; depth: number }

export function MoveDialog({
  open,
  onOpenChange,
  title,
  folders,
  excludeIds = [],
  allowRoot = false,
  currentId = null,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  folders: FolderRow[]
  /** Carpetas que no pueden ser destino (la propia carpeta y sus descendientes). */
  excludeIds?: string[]
  allowRoot?: boolean
  currentId?: string | null
  onConfirm: (folderId: string | null) => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const options = useMemo(() => {
    const visible = folders
    const excluded = new Set(excludeIds)
    // también se excluyen los descendientes de las carpetas excluidas
    let changed = true
    while (changed) {
      changed = false
      for (const f of visible) {
        if (f.parent_id && excluded.has(f.parent_id) && !excluded.has(f.id)) {
          excluded.add(f.id)
          changed = true
        }
      }
    }
    const result: Option[] = allowRoot
      ? [{ id: null, name: 'Documentos (raíz)', depth: 0 }]
      : []
    const walk = (parentId: string | null, depth: number) => {
      for (const f of visible
        .filter((x) => x.parent_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
        if (excluded.has(f.id)) continue
        result.push({ id: f.id, name: f.name, depth })
        walk(f.id, depth + 1)
      }
    }
    walk(null, allowRoot ? 1 : 0)
    return result
  }, [folders, excludeIds, allowRoot])

  async function confirm() {
    if (selected === undefined) return
    setSaving(true)
    try {
      await onConfirm(selected)
      onOpenChange(false)
      setSelected(undefined)
    } catch {
      /* el llamador ya muestra el error; el diálogo se queda abierto */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="max-h-72 overflow-auto rounded-lg border border-border py-1">
          {options.map((option) => (
            <li key={option.id ?? 'root'}>
              <button
                type="button"
                disabled={option.id === currentId && option.id !== null}
                onClick={() => setSelected(option.id)}
                style={{ paddingLeft: 12 + option.depth * 16 }}
                className={cn(
                  'flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm hover:bg-secondary disabled:opacity-40',
                  selected === option.id &&
                    'bg-secondary font-medium text-primary',
                )}
              >
                <Folder className="size-4 flex-none" />
                <span className="truncate">{option.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={confirm} disabled={saving || selected === undefined}>
            Mover aquí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
