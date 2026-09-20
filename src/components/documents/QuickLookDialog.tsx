import { Link } from '@tanstack/react-router'
import { CalendarClock, Download, ExternalLink, Pencil } from 'lucide-react'
import { usePreview } from '#/components/documents/DocThumbnail'
import { StatusBadge, formatDueDate } from '#/components/documents/StatusBadge'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { downloadFile } from '#/lib/download'
import { timeAgo } from '#/lib/format'
import type { DocumentSummary } from '#/server/documents'

const ZOOM = 0.72
const PAGE_W = 8.5 * 96

/** Vista rápida: lee el documento sin abrirlo, con sus datos y acciones a un lado. */
export function QuickLookDialog({
  doc,
  canEdit,
  onClose,
}: {
  doc: DocumentSummary | null
  canEdit: boolean
  onClose: () => void
}) {
  const preview = usePreview(doc?.id ?? '', doc !== null)

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[88vh] w-[94vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {doc && (
          <>
            <div className="flex flex-none items-center gap-3 border-b border-border px-5 py-3 pr-12">
              <DialogTitle className="min-w-0 flex-1 truncate text-base">
                {doc.title}
              </DialogTitle>
              <StatusBadge status={doc.status} />
            </div>
            <div className="grid min-h-0 flex-1 md:grid-cols-[1fr_16rem]">
              <div className="min-h-0 overflow-auto bg-[var(--doc-desk)] p-5">
                <div
                  className="doc-sheet mx-auto bg-[var(--sc-paper)] shadow-md"
                  style={{ width: PAGE_W * ZOOM }}
                >
                  <div style={{ zoom: ZOOM, width: PAGE_W }}>
                    <div style={{ padding: '0.9in 0.85in' }}>
                      {preview ? (
                        <>
                          <div className="sheet-head">
                            <div className="sheet-kicker">
                              {preview.folderName}
                            </div>
                            <h1 className="sheet-title">{doc.title}</h1>
                          </div>
                          <div
                            className="ProseMirror"
                            // HTML saneado en el servidor (sanitizeContentHtml).
                            dangerouslySetInnerHTML={{ __html: preview.html }}
                          />
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {preview === undefined
                            ? 'Cargando…'
                            : 'No se pudo cargar la vista previa.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <aside className="flex flex-col gap-4 border-t border-border p-5 md:border-l md:border-t-0">
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-2xs font-display uppercase tracking-wide text-muted-foreground">
                      Modificado
                    </div>
                    <div className="text-foreground">
                      {timeAgo(doc.updated_at)}
                      {doc.author ? ` · ${doc.author}` : ''}
                    </div>
                  </div>
                  {doc.due_date && (
                    <div>
                      <div className="text-2xs font-display uppercase tracking-wide text-muted-foreground">
                        Vencimiento
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CalendarClock className="size-3.5" />
                        {formatDueDate(doc.due_date)}
                      </div>
                    </div>
                  )}
                  {doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <Button asChild>
                    <Link
                      to="/documentos/doc/$docId"
                      params={{ docId: doc.id }}
                    >
                      <ExternalLink className="size-4" />
                      Abrir documento
                    </Link>
                  </Button>
                  {canEdit && (
                    <Button variant="outline" asChild>
                      <Link
                        to="/documentos/doc/$docId"
                        params={{ docId: doc.id }}
                        search={{ editar: true }}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() =>
                      void downloadFile(`/api/documentos/${doc.id}/pdf`, {
                        fallbackName: `${doc.title}.pdf`,
                        loading: 'Generando el PDF…',
                      })
                    }
                  >
                    <Download className="size-4" />
                    Descargar PDF
                  </Button>
                </div>
              </aside>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
