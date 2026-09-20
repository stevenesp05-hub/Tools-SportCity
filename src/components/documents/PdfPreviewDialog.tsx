import { memo, useCallback, useEffect, useState } from 'react'
import {
  Download,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { downloadFile, printDocument } from '#/lib/download'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'

/**
 * Vista previa exacta: es el mismo PDF que se descarga (misma paginación, cabecera, pie y portada),
 * no una aproximación. Sirve para revisar saltos de página, tablas, imágenes y márgenes antes de exportar.
 */
export const PdfPreviewDialog = memo(function PdfPreviewDialog({
  docId,
  getTitle,
  open,
  onOpenChange,
  dirty,
  defaultCover,
}: {
  docId: string
  /** Título actual del documento: se lee al pintar, así escribir el título no repinta el diálogo. */
  getTitle: () => string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Hay cambios sin guardar: la vista previa muestra la última versión guardada. */
  dirty: boolean
  defaultCover: boolean
}) {
  const [cover, setCover] = useState(defaultCover)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const load = useCallback(async () => {
    setState('loading')
    setUrl(null)
    try {
      const response = await fetch(
        `/api/documentos/${docId}/pdf?portada=${cover ? 1 : 0}`,
        { credentials: 'same-origin' },
      )
      if (!response.ok) throw new Error(`Error ${response.status}`)
      setUrl(URL.createObjectURL(await response.blob()))
      setState('idle')
    } catch {
      setState('error')
    }
  }, [docId, cover])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  // Libera el PDF anterior al cambiar de vista o cerrar.
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  useEffect(() => {
    if (open) setCover(defaultCover)
  }, [open, defaultCover])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="flex-none gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:pr-14">
          <div className="min-w-0">
            <DialogTitle className="truncate font-display text-base">
              Vista previa · {getTitle()}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Así saldrá el PDF: mismas páginas, márgenes, cabecera y pie.
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Portada"
              className="flex rounded-md border border-border p-0.5 text-sm"
            >
              {[
                [true, 'Con portada'],
                [false, 'Sin portada'],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={cover === value}
                  onClick={() => setCover(Boolean(value))}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    cover === value
                      ? 'bg-secondary font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                void downloadFile(
                  `/api/documentos/${docId}/pdf?portada=${cover ? 1 : 0}`,
                  {
                    fallbackName: `${getTitle()}.pdf`,
                    loading: 'Generando el PDF…',
                  },
                )
              }
            >
              <Download className="size-4" />
              Descargar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void printDocument(docId, { cover })}
            >
              <Printer className="size-4" />
              Imprimir
            </Button>
          </div>
        </DialogHeader>

        {dirty && (
          <div className="flex-none border-b border-warning-line bg-warning-soft px-5 py-2 text-xs text-warning">
            Tienes cambios sin guardar: esta vista muestra la última versión
            guardada. Guarda el documento para incluirlos.
          </div>
        )}

        <div className="relative min-h-0 flex-1 bg-[var(--doc-desk)]">
          {state === 'loading' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-6 animate-spin" />
              Generando PDF…
            </div>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm">
              <p className="text-foreground">
                No se pudo generar la vista previa.
              </p>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
            </div>
          )}
          {url && (
            <>
              <iframe
                src={`${url}#toolbar=0&navpanes=0`}
                title={`Vista previa de ${getTitle()}`}
                className="size-full border-0"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm hover:bg-secondary sm:hidden"
              >
                <ExternalLink className="size-3.5" />
                Abrir en pestaña
              </a>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
