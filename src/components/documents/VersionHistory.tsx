import { memo, useEffect, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { GitCompare, History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { htmlToText } from '#/lib/document-text'
import {
  VERSIONS_PAGE,
  getDocumentVersion,
  listVersions,
  restoreVersion,
} from '#/server/documents'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

type VersionRow = {
  id: string
  version_number: number
  created_at: string
  profiles: { full_name: string | null; email: string } | null
}

type View =
  | { kind: 'preview'; versionNumber: number; html: string }
  | {
      kind: 'diff'
      versionNumber: number
      currentNumber: number
      olderText: string
      latestText: string
    }

/** Diferencia palabra a palabra; solo se calcula (y solo se descarga `diff`) cuando se abre una comparación. */
function DiffView({
  olderText,
  latestText,
}: {
  olderText: string
  latestText: string
}) {
  const [parts, setParts] = useState<Array<{
    value: string
    added?: boolean
    removed?: boolean
  }> | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('diff').then(({ diffWords }) => {
      if (!cancelled) setParts(diffWords(olderText, latestText))
    })
    return () => {
      cancelled = true
    }
  }, [olderText, latestText])

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      <p className="mb-3 text-xs text-muted-foreground">
        <span className="rounded-md bg-[oklch(0.93_0.06_150)] px-1">
          añadido
        </span>{' '}
        <span className="rounded-md bg-[oklch(0.94_0.07_40)] px-1 line-through">
          eliminado
        </span>
      </p>
      {parts === null && <p className="text-muted-foreground">Comparando…</p>}
      {parts?.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? 'rounded-md bg-[oklch(0.93_0.06_150)]'
              : part.removed
                ? 'rounded-md bg-[oklch(0.94_0.07_40)] line-through'
                : undefined
          }
        >
          {part.value}
        </span>
      ))}
    </div>
  )
}

export const VersionHistory = memo(function VersionHistory({
  documentId,
  versions,
  currentVersionId,
  canEdit,
  onRestored,
  open: controlledOpen,
  onOpenChange,
}: {
  documentId: string
  versions: VersionRow[]
  currentVersionId: string | null
  canEdit: boolean
  onRestored: (content: JSONContent, versionId: string) => void
  /** Si se pasan, el diálogo lo abre quien lo controla (p. ej. la barra lateral) y no hay botón propio. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { confirm } = useDialogs()
  const [innerOpen, setInnerOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : innerOpen
  const setOpen = (value: boolean) => {
    if (controlled) onOpenChange?.(value)
    else setInnerOpen(value)
  }
  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState(false)

  // La página trae las últimas versiones; «Cargar más» pide las más antiguas por tandas.
  const [older, setOlder] = useState<VersionRow[]>([])
  const [exhausted, setExhausted] = useState(false)
  const newestId = versions[0]?.id
  useEffect(() => {
    setOlder([])
    setExhausted(false)
  }, [newestId, documentId])
  const allVersions = useMemo(() => {
    const seen = new Set(versions.map((v) => v.id))
    return [...versions, ...older.filter((v) => !seen.has(v.id))]
  }, [versions, older])
  const canLoadMore = !exhausted && allVersions.length >= VERSIONS_PAGE

  async function loadMore() {
    const last = allVersions[allVersions.length - 1]
    setBusy(true)
    try {
      const page = await listVersions({
        data: { documentId, before: last.version_number },
      })
      setOlder((prev) => [...prev, ...page])
      if (page.length < VERSIONS_PAGE) setExhausted(true)
    } catch {
      toast.error('No se pudieron cargar más versiones')
    } finally {
      setBusy(false)
    }
  }

  const current = allVersions.find((v) => v.id === currentVersionId)

  async function openPreview(v: VersionRow) {
    setBusy(true)
    try {
      const version = await getDocumentVersion({ data: { id: v.id } })
      setView({
        kind: 'preview',
        versionNumber: v.version_number,
        html: version.content_html,
      })
    } finally {
      setBusy(false)
    }
  }

  async function openDiff(v: VersionRow) {
    if (!currentVersionId || !current) return
    setBusy(true)
    try {
      const [olderVersion, latest] = await Promise.all([
        getDocumentVersion({ data: { id: v.id } }),
        getDocumentVersion({ data: { id: currentVersionId } }),
      ])
      setView({
        kind: 'diff',
        versionNumber: v.version_number,
        currentNumber: current.version_number,
        olderText: htmlToText(olderVersion.content_html),
        latestText: htmlToText(latest.content_html),
      })
    } finally {
      setBusy(false)
    }
  }

  async function restore(v: VersionRow) {
    const ok = await confirm({
      title: `¿Restaurar la versión ${v.version_number}?`,
      description:
        'Se guardará como una versión nueva; las demás versiones se conservan.',
      confirmLabel: 'Restaurar',
    })
    if (!ok) return
    setBusy(true)
    try {
      const saved = await restoreVersion({
        data: { documentId, versionId: v.id },
      })
      const version = await getDocumentVersion({ data: { id: v.id } })
      onRestored(version.content as JSONContent, saved.versionId)
      toast.success(`Versión ${v.version_number} restaurada`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo restaurar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!controlled && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <History className="size-4" />
          Historial
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Historial de versiones</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-80 pr-3">
            <ul className="divide-y divide-border">
              {allVersions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">
                      Versión {v.version_number}
                      {v.id === currentVersionId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (actual)
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {v.profiles?.full_name ??
                        v.profiles?.email ??
                        'Desconocido'}{' '}
                      · {new Date(v.created_at).toLocaleString('es-NI')}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => openPreview(v)}
                    >
                      Ver
                    </Button>
                    {v.id !== currentVersionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => openDiff(v)}
                        title="Comparar con la versión actual"
                      >
                        <GitCompare className="size-4" />
                      </Button>
                    )}
                    {canEdit && v.id !== currentVersionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => restore(v)}
                        title="Restaurar esta versión"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {canLoadMore && (
              <div className="py-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void loadMore()}
                >
                  Cargar versiones anteriores
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={view !== null} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {view?.kind === 'diff'
                ? `Versión ${view.versionNumber} → versión ${view.currentNumber} (actual)`
                : `Versión ${view?.versionNumber} — solo lectura`}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[65vh] pr-3">
            {view?.kind === 'preview' && (
              <div
                className="prose prose-sm max-w-none prose-headings:font-display prose-headings:text-primary"
                dangerouslySetInnerHTML={{ __html: view.html }}
              />
            )}
            {view?.kind === 'diff' && (
              <DiffView
                olderText={view.olderText}
                latestText={view.latestText}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
})
