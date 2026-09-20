import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Search } from 'lucide-react'
import { rankBlocks, recordRecent } from '#/lib/block-search'
import { ALL_BLOCKS } from '#/components/documents/editor-extras'
import type { SlashItem } from '#/components/documents/editor-extras'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'

/** Evento para abrir el selector de bloques (menú Insertar, botón «+» de la barra, atajo). */
export const BLOCK_PICKER_EVENT = 'sc:block-picker'

/**
 * Selector de bloques con búsqueda: lo mismo que el menú «/», pero abierto desde un botón
 * (imprescindible en el móvil, donde escribir «/» es incómodo). Recuerda los últimos usados.
 */
export function BlockPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const show = () => {
      setQuery('')
      setIndex(0)
      setOpen(true)
    }
    document.addEventListener(BLOCK_PICKER_EVENT, show)
    return () => document.removeEventListener(BLOCK_PICKER_EVENT, show)
  }, [])

  const items = useMemo(
    () => (open ? rankBlocks(ALL_BLOCKS, query) : []),
    [open, query],
  )

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  function choose(item: SlashItem) {
    recordRecent(item.title)
    setOpen(false)
    // Tras cerrar, el foco vuelve al documento y el bloque se inserta en el cursor.
    setTimeout(() => item.run(editor), 0)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((value) => (value + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((value) => (value - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(items[Math.min(index, items.length - 1)])
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[12%] flex max-h-[76dvh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Insertar bloque</DialogTitle>
        <DialogDescription className="sr-only">
          Busca un bloque y pulsa Intro para insertarlo en el cursor.
        </DialogDescription>
        <div className="flex flex-none items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 flex-none text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            placeholder="Buscar un bloque: tabla, aviso, firma, cifra…"
            aria-label="Buscar bloque"
            className="h-12 min-w-0 flex-1 bg-transparent pr-8 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Bloques"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Ningún bloque coincide con «{query}».
            </p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon
              const newGroup = i === 0 || items[i - 1].group !== item.group
              return (
                <div key={`${item.group}:${item.title}`}>
                  {newGroup && (
                    <div className="px-2.5 pb-1 pt-2.5 font-display text-2xs uppercase tracking-wide text-muted-foreground first:pt-1">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left',
                      i === index ? 'bg-secondary' : 'hover:bg-secondary/60',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 flex-none',
                        item.tint ?? 'text-muted-foreground',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    {item.shortcut && (
                      <kbd className="flex-none rounded-sm border border-border px-1.5 py-px font-mono text-2xs text-muted-foreground">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div className="flex flex-none gap-4 border-t border-border bg-card/60 px-4 py-2 text-2xs text-muted-foreground max-sm:hidden">
          <span>
            <kbd className="font-mono">↑↓</kbd> moverte
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> insertar
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> cerrar
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
