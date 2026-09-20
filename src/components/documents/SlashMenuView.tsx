import { useEffect, useRef } from 'react'
import type { SlashState } from '#/components/documents/editor-extras'
import { cn } from '#/lib/utils'

const MENU_W = 380
const MENU_H = 380

/** Menú "/" al estilo Notion: secciones, iconos, descripción y atajo de Markdown. */
export function SlashMenuView({ slash }: { slash: SlashState | null }) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [slash?.index])

  if (!slash?.rect) return null
  const { rect, items } = slash

  const above = rect.bottom + MENU_H > window.innerHeight && rect.top > MENU_H
  const style = {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 12)),
    ...(above
      ? { bottom: window.innerHeight - rect.top + 8 }
      : { top: rect.bottom + 8 }),
    width: MENU_W,
  }

  return (
    <div
      role="listbox"
      aria-label="Insertar bloque"
      style={style}
      className="fixed z-50 flex max-h-[23.5rem] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nada coincide. Sigue escribiendo o pulsa Esc.
          </p>
        ) : (
          items.map((item, i) => {
            const newGroup = i === 0 || items[i - 1].group !== item.group
            const active = i === slash.index
            const Icon = item.icon
            return (
              <div key={`${item.group}:${item.title}`}>
                {newGroup && (
                  <div className="px-2.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground/80 first:pt-1">
                    {item.group}
                  </div>
                )}
                <button
                  ref={active ? activeRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    slash.choose(item)
                  }}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors',
                    active ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 flex-none items-center justify-center',
                      item.tint ?? 'text-muted-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="flex-none text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  {item.shortcut && (
                    <kbd className="flex-none rounded-sm border border-border bg-card px-1.5 py-px font-mono text-2xs text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>
      <div className="flex flex-none items-center gap-3 border-t border-border bg-card/60 px-3 py-1.5 text-2xs text-muted-foreground">
        <span>
          <kbd className="font-mono">↑↓</kbd> moverte
        </span>
        <span>
          <kbd className="font-mono">↵</kbd> elegir
        </span>
        <span>
          <kbd className="font-mono">esc</kbd> cerrar
        </span>
      </div>
    </div>
  )
}
