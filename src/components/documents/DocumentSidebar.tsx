import { memo, useEffect, useState } from 'react'
import {
  BookmarkPlus,
  ClipboardCheck,
  Download,
  FileText,
  History,
  PanelRightClose,
  PanelRightOpen,
  Eye,
  Printer,
  ScanSearch,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { DOC_THEMES, THEME_INFO } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { downloadFile, printDocument } from '#/lib/download'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

const STORAGE_KEY = 'sc-docpanel'

/** Abierta por defecto en pantallas anchas; en portátiles pequeños empieza plegada para dar sitio a la hoja. */
function useSidebarOpen() {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setOpen(saved === 'open')
      else setOpen(window.innerWidth >= 1360)
    } catch {
      setOpen(window.innerWidth >= 1360)
    }
  }, [])
  function toggle(next: boolean) {
    setOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed')
    } catch {
      /* preferencia no persistida */
    }
  }
  return [open, toggle] as const
}

type Props = {
  docId: string
  /** Título actual: se lee al descargar, así escribirlo no repinta el panel. */
  getTitle: () => string
  editing: boolean
  canEdit: boolean
  canDelete: boolean
  onCancel: () => void
  onHistory: () => void
  onShare: () => void
  onReview: () => void
  onTemplate: () => void
  onChecks: () => void
  onPreview: () => void
  onDelete: () => void
  /** En móvil el panel es un cajón que se abre desde la cabecera. */
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  theme: DocTheme
  onTheme: (theme: DocTheme) => void
  /** Contenido de «Detalles» (estado, vencimiento, etiquetas…). */
  details: React.ReactNode
  /** Recibe el contenedor donde el editor pinta el índice. */
  outlineHostRef: (node: HTMLDivElement | null) => void
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const sync = () => setMobile(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return mobile
}

export const DocumentSidebar = memo(function DocumentSidebar(rawProps: Props) {
  const [open, toggle] = useSidebarOpen()
  const isMobile = useIsMobile()
  // «Ver → Mostrar u ocultar el panel» de la barra de menús.
  useEffect(() => {
    const onPanel = () =>
      isMobile
        ? rawProps.onMobileOpenChange(!rawProps.mobileOpen)
        : toggle(!open)
    document.addEventListener('sc:panel', onPanel)
    return () => document.removeEventListener('sc:panel', onPanel)
  })
  // En el cajón móvil, tocar una acción lo cierra (casi todas abren un diálogo).
  const close = () => {
    if (isMobile) rawProps.onMobileOpenChange(false)
  }
  const props: Props = {
    ...rawProps,
    onCancel: () => {
      close()
      rawProps.onCancel()
    },
    onHistory: () => {
      close()
      rawProps.onHistory()
    },
    onShare: () => {
      close()
      rawProps.onShare()
    },
    onReview: () => {
      close()
      rawProps.onReview()
    },
    onTemplate: () => {
      close()
      rawProps.onTemplate()
    },
    onChecks: () => {
      close()
      rawProps.onChecks()
    },
    onPreview: () => {
      close()
      rawProps.onPreview()
    },
    onDelete: () => {
      close()
      rawProps.onDelete()
    },
  }
  const { docId, getTitle } = props

  const downloads = [
    {
      label: 'PDF con portada de marca',
      url: `/api/documentos/${docId}/pdf`,
      name: (): string => `${getTitle()}.pdf`,
      loading: 'Generando el PDF…',
    },
    {
      label: 'PDF sin portada',
      url: `/api/documentos/${docId}/pdf?portada=0`,
      name: (): string => `${getTitle()}.pdf`,
      loading: 'Generando el PDF…',
    },
    {
      label: 'Word (.docx)',
      url: `/api/documentos/${docId}/word`,
      name: (): string => `${getTitle()}.docx`,
      loading: 'Generando el Word…',
    },
  ]

  const downloadMenu = (trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {downloads.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={() =>
              void downloadFile(item.url, {
                fallbackName: item.name(),
                loading: item.loading,
              })
            }
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (isMobile && !props.mobileOpen) return null

  if (!open && !isMobile) {
    const rail =
      'size-9 text-muted-foreground hover:bg-secondary hover:text-foreground'
    return (
      <aside
        aria-label="Panel del documento"
        className="flex w-12 flex-none flex-col items-center gap-1 border-l border-border bg-card py-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={() => toggle(true)}
          aria-label="Mostrar el panel"
          title="Mostrar el panel"
        >
          <PanelRightOpen className="size-4" />
        </Button>
        <div className="my-1 h-px w-6 bg-border" />
        {props.editing && props.canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className={rail}
            onClick={props.onCancel}
            aria-label="Cancelar la edición"
            title="Cancelar la edición"
          >
            <X className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={props.onHistory}
          aria-label="Historial"
          title="Historial"
        >
          <History className="size-4" />
        </Button>
        {downloadMenu(
          <Button
            variant="ghost"
            size="icon"
            className={rail}
            aria-label="Descargar"
            title="Descargar"
          >
            <Download className="size-4" />
          </Button>,
        )}
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={props.onPreview}
          aria-label="Vista previa del PDF"
          title="Vista previa del PDF"
        >
          <Eye className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={props.onChecks}
          aria-label="Comprobar documento"
          title="Comprobar documento"
        >
          <ScanSearch className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={() => void printDocument(docId)}
          aria-label="Imprimir"
          title="Imprimir"
        >
          <Printer className="size-4" />
        </Button>
        {props.canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={rail}
              onClick={props.onShare}
              aria-label="Compartir"
              title="Compartir"
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={rail}
              onClick={props.onReview}
              aria-label="Revisión"
              title="Revisión"
            >
              <ClipboardCheck className="size-4" />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={rail}
          onClick={() => toggle(true)}
          aria-label="Detalles e índice"
          title="Detalles e índice"
        >
          <FileText className="size-4" />
        </Button>
      </aside>
    )
  }

  const row =
    'h-9 w-full justify-start gap-2.5 px-2.5 text-sm font-normal text-foreground hover:bg-secondary'

  const panel = (
    <aside
      aria-label="Panel del documento"
      className={cn(
        'flex flex-none flex-col border-l border-border bg-card',
        isMobile
          ? 'fixed inset-y-0 right-0 z-50 w-[min(20rem,92vw)] shadow-lg'
          : 'w-72',
      )}
    >
      <div className="flex h-11 flex-none items-center justify-between border-b border-border px-4">
        <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
          Documento
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() =>
            isMobile ? props.onMobileOpenChange(false) : toggle(false)
          }
          aria-label="Ocultar el panel"
          title="Ocultar el panel"
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="space-y-0.5 p-3">
          {props.editing && props.canEdit && (
            <Button
              variant="ghost"
              className={cn(row, 'text-destructive hover:text-destructive')}
              onClick={props.onCancel}
            >
              <X className="size-4" />
              Cancelar la edición
            </Button>
          )}
          <Button variant="ghost" className={row} onClick={props.onHistory}>
            <History className="size-4 text-muted-foreground" />
            Historial de versiones
          </Button>
          {downloadMenu(
            <Button variant="ghost" className={row}>
              <Download className="size-4 text-muted-foreground" />
              Descargar
            </Button>,
          )}
          <Button variant="ghost" className={row} onClick={props.onPreview}>
            <Eye className="size-4 text-muted-foreground" />
            Vista previa del PDF
          </Button>
          <Button variant="ghost" className={row} onClick={props.onChecks}>
            <ScanSearch className="size-4 text-muted-foreground" />
            Comprobar documento
          </Button>
          <Button
            variant="ghost"
            className={row}
            onClick={() => void printDocument(docId)}
          >
            <Printer className="size-4 text-muted-foreground" />
            Imprimir
          </Button>
          {props.canEdit && (
            <>
              <Button variant="ghost" className={row} onClick={props.onShare}>
                <Share2 className="size-4 text-muted-foreground" />
                Compartir
              </Button>
              <Button variant="ghost" className={row} onClick={props.onReview}>
                <ClipboardCheck className="size-4 text-muted-foreground" />
                Pedir revisión
              </Button>
              <Button
                variant="ghost"
                className={row}
                onClick={props.onTemplate}
              >
                <BookmarkPlus className="size-4 text-muted-foreground" />
                Guardar como plantilla
              </Button>
            </>
          )}
          {props.canDelete && (
            <Button
              variant="ghost"
              className={cn(row, 'text-destructive hover:text-destructive')}
              onClick={props.onDelete}
            >
              <Trash2 className="size-4" />
              Enviar a la papelera
            </Button>
          )}
        </section>

        <section className="border-t border-border p-4">
          {props.details}
        </section>

        <section className="border-t border-border p-4">
          <div className="mb-1.5 font-display text-2xs uppercase tracking-wide text-muted-foreground">
            Tema del documento
          </div>
          <ChoiceSelect<DocTheme>
            ariaLabel="Tema del documento"
            className="w-full"
            value={props.theme}
            onChange={props.onTheme}
            options={DOC_THEMES.map((value) => ({
              value,
              label: THEME_INFO[value].label,
              disabled: !props.canEdit,
            }))}
          />
          <div className="mt-2 flex items-start gap-2">
            <span className="mt-0.5 flex flex-none gap-1">
              {[
                THEME_INFO[props.theme].colors.navy,
                THEME_INFO[props.theme].colors.accent,
              ].map((color) => (
                <span
                  key={color}
                  className="size-3.5 rounded-full border border-black/10"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">
              {THEME_INFO[props.theme].description}
            </span>
          </div>
        </section>

        <section className="border-t border-border p-4">
          <div ref={props.outlineHostRef} />
        </section>
      </div>
    </aside>
  )

  if (!isMobile) return panel
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => props.onMobileOpenChange(false)}
        aria-hidden
      />
      {panel}
    </>
  )
})
