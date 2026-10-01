import { memo, useEffect, useState } from 'react'
import { PanelRightClose } from 'lucide-react'
import { DOC_THEMES, THEME_INFO } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'

const STORAGE_KEY = 'sc-docpanel'

/**
 * Cerrado por defecto: el documento ocupa toda la pantalla, como al abrir Google Docs. Se abre desde
 * «Ver → Detalles del documento» (o el botón del móvil) y se recuerda la preferencia de quien sí lo usa.
 */
function useSidebarOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setOpen(saved === 'open')
    } catch {
      /* sin preferencia guardada: se queda cerrado */
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
  /** En móvil el panel es un cajón que se abre desde la cabecera. */
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  theme: DocTheme
  onTheme: (theme: DocTheme) => void
  canEdit: boolean
  /** Contenido de «Detalles» (estado, vencimiento, etiquetas, acceso…). */
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

/**
 * Panel de detalles del documento: lo único que no vive ya en la barra de menús (Archivo, Herramientas…).
 * Estado, vencimiento, etiquetas, acceso, destacado, tema e índice. Todo lo demás (historial, descargar,
 * compartir, revisión, imprimir, papelera…) se maneja desde el menú de arriba, no desde aquí.
 */
export const DocumentSidebar = memo(function DocumentSidebar(props: Props) {
  const [open, toggle] = useSidebarOpen()
  const isMobile = useIsMobile()
  // «Ver → Detalles del documento» de la barra de menús.
  useEffect(() => {
    const onPanel = () =>
      isMobile ? props.onMobileOpenChange(!props.mobileOpen) : toggle(!open)
    document.addEventListener('sc:panel', onPanel)
    return () => document.removeEventListener('sc:panel', onPanel)
  })

  if (isMobile && !props.mobileOpen) return null
  if (!open && !isMobile) return null

  const panel = (
    <aside
      aria-label="Detalles del documento"
      className={cn(
        'flex flex-none flex-col border-l border-border bg-card',
        isMobile
          ? 'fixed inset-y-0 right-0 z-50 w-[min(20rem,92vw)] shadow-lg'
          : 'w-72',
      )}
    >
      <div className="flex h-11 flex-none items-center justify-between border-b border-border px-4">
        <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
          Detalles
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
        <section className="p-4">{props.details}</section>

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
