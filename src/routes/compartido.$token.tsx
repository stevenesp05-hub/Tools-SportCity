import { createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { getSharedDocument } from '#/server/sharing'
import { downloadFile } from '#/lib/download'
import { STATUS_LABELS } from '#/components/documents/StatusBadge'
import type { DocStatus } from '#/server/documents'

export const Route = createFileRoute('/compartido/$token')({
  loader: ({ params }) => getSharedDocument({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex, nofollow' },
      { title: 'Documento compartido · Sport City' },
    ],
  }),
  notFoundComponent: SharedNotFound,
  errorComponent: SharedNotFound,
  component: SharedDocumentPage,
})

function SharedNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--doc-desk)] px-6 text-center">
      <img src="/brand/logo-mark.png" alt="Sport City" className="h-12" />
      <h1 className="text-xl font-display text-foreground">
        Este enlace ya no está disponible
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Puede haber caducado o haberse desactivado. Pide uno nuevo a quien te lo
        compartió.
      </p>
    </div>
  )
}

function SharedDocumentPage() {
  const doc = Route.useLoaderData()
  const { token } = Route.useParams()
  const statusLabel = STATUS_LABELS[doc.status as DocStatus]

  return (
    <div className="min-h-screen bg-[var(--doc-desk)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-8">
        <img src="/brand/logo-mark.png" alt="" className="h-8" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm text-foreground">
            {doc.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            Sport City Club · {doc.folderName} · Versión {doc.versionNumber} ·{' '}
            {statusLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            void downloadFile(`/api/compartido/${token}/pdf`, {
              fallbackName: `${doc.title}.pdf`,
              loading: 'Generando el PDF…',
            })
          }
          className="inline-flex h-9 flex-none items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download className="size-4" />
          Descargar PDF
        </button>
      </header>

      <main className="overflow-x-auto px-4 py-8">
        <div
          className="doc-sheet mx-auto w-[8.5in] max-w-full bg-[var(--sc-paper)] shadow-md"
          style={{ padding: '0.9in 0.85in' }}
        >
          <div className="sheet-head">
            <div className="sheet-kicker">{doc.folderName}</div>
            <h1 className="sheet-title">{doc.title}</h1>
          </div>
          <div
            className="ProseMirror"
            // HTML saneado en el servidor (sanitizeContentHtml).
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
        </div>
        <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
          Documento compartido en solo lectura. Última actualización:{' '}
          {new Date(doc.updatedAt).toLocaleDateString('es-NI')}.
        </p>
      </main>
    </div>
  )
}
