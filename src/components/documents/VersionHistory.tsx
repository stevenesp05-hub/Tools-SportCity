import { memo, useEffect, useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, GitCompare, History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { initialsOf } from '#/lib/format'
import { cn } from '#/lib/utils'
import {
  VERSIONS_PAGE,
  getDocumentVersion,
  listVersions,
  restoreVersion,
} from '#/server/documents'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

type VersionRow = {
  id: string
  version_number: number
  created_at: string
  profiles: { full_name: string | null; email: string } | null
}

type Content =
  | { kind: 'preview'; html: string }
  | { kind: 'diff'; olderHtml: string; latestHtml: string }

/** Cabecera de grupo como en Google Docs: "Hoy", "Ayer" o la fecha completa. */
function dateGroupOf(iso: string, now: number = Date.now()): string {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  const d = new Date(iso)
  const today = new Date(now)
  if (sameDay(d, today)) return 'Hoy'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Ayer'
  return d.toLocaleDateString('es-NI', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-NI', {
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Divide el HTML de un documento en sus bloques de primer nivel (párrafos, encabezados, listas,
 * tablas…) conservando el marcado de cada uno intacto. Comparar por bloque entero (en vez de por
 * palabra sobre texto plano) es lo que permite pintar el comparativo como una página real, con sus
 * encabezados y tablas, en vez de una tira de texto sin formato.
 */
function splitHtmlBlocks(html: string): string[] {
  const blocks: string[] = []
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tableRe.exec(html))) {
    blocks.push(...splitSimpleBlocks(html.slice(lastIndex, match.index)))
    blocks.push(match[0])
    lastIndex = tableRe.lastIndex
  }
  blocks.push(...splitSimpleBlocks(html.slice(lastIndex)))
  return blocks
}

function splitSimpleBlocks(html: string): string[] {
  return html
    .split(/(?<=<\/(?:p|h[1-6]|li|blockquote|ul|ol)>)/gi)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Compara dos versiones bloque a bloque; solo se calcula cuando se abre la comparación. */
function DiffView({
  olderHtml,
  latestHtml,
}: {
  olderHtml: string
  latestHtml: string
}) {
  const [changes, setChanges] = useState<Array<{
    value: string[]
    added?: boolean
    removed?: boolean
  }> | null>(null)
  useEffect(() => {
    let cancelled = false
    setChanges(null)
    void import('diff').then(({ diffArrays }) => {
      if (cancelled) return
      setChanges(
        diffArrays(splitHtmlBlocks(olderHtml), splitHtmlBlocks(latestHtml)),
      )
    })
    return () => {
      cancelled = true
    }
  }, [olderHtml, latestHtml])

  return (
    <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:text-primary">
      <p className="not-prose mb-4 text-xs text-muted-foreground">
        <span className="rounded-md bg-[oklch(0.93_0.06_150)] px-1">
          añadido
        </span>{' '}
        <span className="rounded-md bg-[oklch(0.94_0.07_40)] px-1 line-through">
          eliminado
        </span>
      </p>
      {changes === null && <p className="text-muted-foreground">Comparando…</p>}
      {changes?.map((part, i) =>
        part.value.map((block, j) => (
          <div
            key={`${i}-${j}`}
            className={cn(
              part.added && 'rounded-md bg-[oklch(0.93_0.06_150)] px-2',
              part.removed &&
                'rounded-md bg-[oklch(0.94_0.07_40)] px-2 opacity-80 line-through decoration-2',
            )}
            dangerouslySetInnerHTML={{ __html: block }}
          />
        )),
      )}
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

  const groups = useMemo(() => {
    const map = new Map<string, VersionRow[]>()
    for (const v of allVersions) {
      const label = dateGroupOf(v.created_at)
      const bucket = map.get(label)
      if (bucket) bucket.push(v)
      else map.set(label, [v])
    }
    return [...map.entries()]
  }, [allVersions])

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

  const current = allVersions.find((v) => v.id === currentVersionId) ?? null

  // Panel derecho: qué versión se ve y en qué modo (previsualización o comparación con la actual).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const fallbackId = versions[0]?.id ?? null
  useEffect(() => {
    if (open) setSelectedId(currentVersionId ?? fallbackId)
  }, [open, currentVersionId, fallbackId])
  const [mode, setMode] = useState<'preview' | 'diff'>('preview')
  const selected = allVersions.find((v) => v.id === selectedId) ?? null
  const isCurrentSelected = !!selected && selected.id === current?.id

  const [content, setContent] = useState<Content | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!selected) {
      setContent(null)
      return
    }
    let cancelled = false
    setBusy(true)
    setContent(null)
    const request: Promise<Content> =
      mode === 'diff' && current && selected.id !== current.id
        ? Promise.all([
            getDocumentVersion({ data: { id: selected.id } }),
            getDocumentVersion({ data: { id: current.id } }),
          ]).then(([olderVersion, latest]) => ({
            kind: 'diff',
            olderHtml: olderVersion.content_html,
            latestHtml: latest.content_html,
          }))
        : getDocumentVersion({ data: { id: selected.id } }).then((version) => ({
            kind: 'preview',
            html: version.content_html,
          }))
    request
      .then((result) => {
        if (!cancelled) setContent(result)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, mode, current])

  async function restore(v: VersionRow) {
    const ok = await confirm({
      title: `¿Restaurar la versión del ${dateGroupOf(v.created_at).toLowerCase()} a las ${timeOf(v.created_at)}?`,
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
      toast.success('Versión restaurada')
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
        <DialogContent
          showCloseButton={false}
          className="flex h-[90vh] w-[96vw] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">Historial de versiones</DialogTitle>

          {/* Barra superior, al estilo del historial de Google Docs. */}
          <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 flex-none"
              onClick={() => setOpen(false)}
              aria-label="Volver al documento"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <History className="size-4 flex-none text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-foreground">
              Historial de versiones
            </span>
            {selected && !isCurrentSelected && (
              <>
                <Button
                  variant={mode === 'diff' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="flex-none"
                  onClick={() =>
                    setMode((m) => (m === 'diff' ? 'preview' : 'diff'))
                  }
                >
                  <GitCompare className="size-4" />
                  Comparar con la actual
                </Button>
                {canEdit && (
                  <Button
                    size="sm"
                    className="flex-none"
                    disabled={busy}
                    onClick={() => void restore(selected)}
                  >
                    <RotateCcw className="size-4" />
                    Restaurar esta versión
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Panel izquierdo: versiones agrupadas por fecha. */}
            <ScrollArea className="w-64 flex-none border-r border-border bg-secondary/30 sm:w-72">
              <div className="p-2">
                {groups.map(([label, rows]) => (
                  <div key={label} className="mb-3">
                    <div className="px-2 py-1 font-display text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {label}
                    </div>
                    <ul>
                      {rows.map((v) => {
                        const isSelected = v.id === selectedId
                        const isCurrent = v.id === current?.id
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(v.id)
                                setMode('preview')
                              }}
                              className={cn(
                                'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                                isSelected
                                  ? 'bg-primary/10'
                                  : 'hover:bg-secondary',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex size-7 flex-none items-center justify-center rounded-full font-display text-2xs font-bold',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-accent text-accent-foreground',
                                )}
                              >
                                {initialsOf(
                                  v.profiles?.full_name ?? v.profiles?.email,
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground">
                                  {timeOf(v.created_at)}
                                  {isCurrent && (
                                    <span className="ml-1.5 text-2xs font-normal text-muted-foreground">
                                      (actual)
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {v.profiles?.full_name ??
                                    v.profiles?.email ??
                                    'Desconocido'}{' '}
                                  · v{v.version_number}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
                {canLoadMore && (
                  <div className="px-1 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void loadMore()}
                    >
                      Cargar versiones anteriores
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Panel derecho: la versión seleccionada, como una página real. */}
            <ScrollArea className="min-w-0 flex-1 bg-[var(--doc-desk)]">
              <div className="mx-auto max-w-3xl px-6 py-8">
                {busy && !content && (
                  <p className="pt-10 text-center text-sm text-muted-foreground">
                    Cargando…
                  </p>
                )}
                {content?.kind === 'preview' && (
                  <div className="rounded-xl bg-[var(--sc-paper)] p-10 shadow-md">
                    <div
                      className="prose prose-sm max-w-none prose-headings:font-display prose-headings:text-primary"
                      dangerouslySetInnerHTML={{ __html: content.html }}
                    />
                  </div>
                )}
                {content?.kind === 'diff' && (
                  <div className="rounded-xl bg-[var(--sc-paper)] p-10 shadow-md">
                    <DiffView
                      olderHtml={content.olderHtml}
                      latestHtml={content.latestHtml}
                    />
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
