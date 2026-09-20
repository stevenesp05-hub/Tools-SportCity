import { useEffect, useRef, useState } from 'react'
import { THEME_INFO, sheetThemeVars } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { cn } from '#/lib/utils'

const PAGE_W = 8.5 * 96
const PAGE_H = 11 * 96

/**
 * Primera página de un documento tal y como saldrá: papel, cabecera, título, contenido y pie
 * con la composición de su tema. Se escala al ancho disponible.
 */
export function PaperPreview({
  theme,
  title,
  kicker,
  html,
  loading = false,
  emptyNote,
  className,
}: {
  theme: DocTheme
  title: string
  kicker: string
  /** HTML ya saneado del contenido. */
  html: string | null
  loading?: boolean
  emptyNote?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      setScale(el.clientWidth / PAGE_W || 0.3),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const style = THEME_INFO[theme].style

  return (
    <div
      ref={ref}
      style={{
        aspectRatio: `${PAGE_W} / ${PAGE_H}`,
        ...(sheetThemeVars(theme) as React.CSSProperties),
      }}
      data-h={style.heading}
      data-t={style.table}
      data-z={style.zebra ? 1 : 0}
      data-f={style.footer === 'label' ? 'minimal' : style.footer}
      data-tb={style.titleBlock}
      className={cn(
        'doc-sheet pointer-events-none relative w-full select-none overflow-hidden bg-[var(--sc-paper)]',
        className,
      )}
      aria-hidden
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: PAGE_W,
          height: PAGE_H,
          transform: `scale(${scale})`,
        }}
      >
        <div className="sheet-run-head absolute inset-x-[0.85in] top-[0.36in] flex items-center justify-between border-b border-[var(--sc-line)] pb-2">
          {style.footer === 'minimal' ? (
            <span className="font-display text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--sc-navy)]">
              Sport City Club
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[var(--sc-navy)]">
              <img src="/brand/logo-mark.png" alt="" className="h-6" />
              <span className="flex flex-col leading-none">
                <span className="font-display text-[13px] font-bold tracking-tight">
                  Sport City
                </span>
                <span className="mt-[3px] text-[7.5px] font-medium uppercase tracking-[0.18em] opacity-70">
                  Club
                </span>
              </span>
            </span>
          )}
          <span className="max-w-[3.8in] truncate text-[8.5px] text-[var(--sc-gray)]">
            {title}
          </span>
        </div>

        <div style={{ padding: '1.05in 0.85in 0.85in' }}>
          <div className="sheet-head">
            <div className="sheet-kicker">{kicker}</div>
            <h1 className="sheet-title">{title || 'Documento sin título'}</h1>
          </div>
          {html ? (
            <div
              className="ProseMirror"
              // HTML saneado en el servidor (sanitizeContentHtml).
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-[12px] text-[var(--sc-gray)]">
              {loading ? 'Cargando vista previa…' : emptyNote}
            </p>
          )}
        </div>

        <div className="sheet-run-foot absolute inset-x-0 bottom-0 flex h-[0.62in] items-center justify-between bg-[var(--sc-navy)] px-[0.85in] text-white">
          <div className="min-w-0">
            <div className="max-w-[3.6in] truncate font-display text-[7.5px] uppercase tracking-[0.16em] text-[var(--sc-accent)]">
              {title}
            </div>
            <div className="run-foot-club mt-1 font-display text-[12px]">
              Sport City Club
            </div>
          </div>
          <div className="text-right text-[8.5px] leading-[1.6] text-[#dfe3f5]">
            <div>5865-1010 · info@sportcityclub.com</div>
            <div>www.sportcitynic.com · Página 1 de 1</div>
          </div>
        </div>
      </div>
    </div>
  )
}
