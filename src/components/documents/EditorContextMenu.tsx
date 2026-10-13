import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import { misspelledAt, dropWord } from '#/components/documents/spellcheck'
import { addToDictionary, suggestionsFor } from '#/lib/spellcheck/client'
import { cn } from '#/lib/utils'

type Spell = { from: number; to: number; word: string }
type MenuState = {
  x: number
  y: number
  spell: Spell | null
  suggestions: string[] | null
  hasSelection: boolean
  inTable: boolean
  inLink: boolean
}

function Item({
  children,
  onSelect,
  shortcut,
  strong,
}: {
  children: ReactNode
  onSelect: () => void
  shortcut?: string
  strong?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      // mousedown evita que el editor pierda la selección antes de aplicar la acción.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-6 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none',
        strong && 'font-semibold',
      )}
    >
      <span>{children}</span>
      {shortcut && (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      )}
    </button>
  )
}

const Sep = () => <div role="separator" className="-mx-1 my-1 h-px bg-border" />

/** Clic derecho propio del editor: ortografía, portapapeles, formato y tabla. Mayús + clic derecho abre el del navegador. */
export function EditorContextMenu({
  editor,
  editable,
}: {
  editor: Editor
  editable: boolean
}) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  // Se mide el menú real (cambia con las sugerencias y la tabla) y se recoloca para que quepa
  // siempre entero en la ventana; si no cabe, se abre hacia arriba o hacia la izquierda.
  useLayoutEffect(() => {
    if (!menu || !panel.current) return setPlace(null)
    const { width, height } = panel.current.getBoundingClientRect()
    const gap = 8
    const left = Math.max(
      gap,
      Math.min(menu.x, window.innerWidth - width - gap),
    )
    let top = menu.y
    if (top + height > window.innerHeight - gap)
      top = Math.max(
        gap,
        menu.y - height > gap
          ? menu.y - height
          : window.innerHeight - height - gap,
      )
    setPlace({ left, top })
  }, [menu])

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    const onContext = (event: MouseEvent) => {
      if (event.shiftKey || !editable) return
      event.preventDefault()
      const pos = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })?.pos
      const { from, to } = editor.state.selection
      const spell = pos != null ? misspelledAt(editor.view, pos) : null
      // Clic derecho sobre una palabra: la selecciona, como hacen Word y Docs.
      if (spell)
        editor.commands.setTextSelection({ from: spell.from, to: spell.to })
      else if (pos != null && (pos < from || pos > to))
        editor.commands.setTextSelection(pos)
      setMenu({
        x: event.clientX,
        y: event.clientY,
        spell,
        suggestions: null,
        hasSelection: spell ? true : from !== to,
        inTable: editor.isActive('table'),
        inLink: editor.isActive('link'),
      })
      if (spell)
        void suggestionsFor(spell.word).then((list) =>
          setMenu((m) =>
            m && m.spell?.word === spell.word ? { ...m, suggestions: list } : m,
          ),
        )
    }
    dom.addEventListener('contextmenu', onContext)
    return () => dom.removeEventListener('contextmenu', onContext)
  }, [editor, editable])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menu])

  if (!menu) return null
  const run = (fn: () => void) => () => {
    fn()
    setMenu(null)
  }
  const chain = () => editor.chain().focus()
  const cap = (word: string, suggestion: string) =>
    word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
      ? suggestion[0].toUpperCase() + suggestion.slice(1)
      : suggestion

  async function paste() {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text()
          editor.view.focus()
          editor.view.pasteHTML(html)
          return
        }
      }
      editor.view.focus()
      editor.view.pasteText(await navigator.clipboard.readText())
    } catch {
      toast.error('El navegador no permite pegar desde aquí: usa Ctrl+V.')
    }
  }
  const native = (cmd: 'copy' | 'cut') => () => {
    editor.view.focus()
    document.execCommand(cmd)
  }

  return createPortal(
    <div
      ref={panel}
      role="menu"
      aria-label="Menú contextual"
      style={{
        left: place?.left ?? menu.x,
        top: place?.top ?? menu.y,
        visibility: place ? 'visible' : 'hidden',
      }}
      className="fixed z-50 max-h-[calc(100dvh-1rem)] w-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {menu.spell && (
        <>
          {menu.suggestions === null && (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
              Buscando sugerencias…
            </div>
          )}
          {menu.suggestions?.length === 0 && (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
              Sin sugerencias
            </div>
          )}
          {menu.suggestions?.map((s) => (
            <Item
              key={s}
              strong
              onSelect={run(() => {
                const text = cap(menu.spell!.word, s)
                editor.view.dispatch(
                  editor.state.tr.insertText(
                    text,
                    menu.spell!.from,
                    menu.spell!.to,
                  ),
                )
                editor.view.focus()
              })}
            >
              {s}
            </Item>
          ))}
          <Item onSelect={run(() => dropWord(editor.view, menu.spell!.word))}>
            Ignorar
          </Item>
          <Item
            onSelect={run(() => {
              addToDictionary(menu.spell!.word)
              dropWord(editor.view, menu.spell!.word)
              toast.success(`«${menu.spell!.word}» añadida a tu diccionario`)
            })}
          >
            Añadir al diccionario
          </Item>
          <Sep />
        </>
      )}
      <Item onSelect={run(native('cut'))} shortcut="Ctrl+X">
        Cortar
      </Item>
      <Item onSelect={run(native('copy'))} shortcut="Ctrl+C">
        Copiar
      </Item>
      <Item onSelect={run(() => void paste())} shortcut="Ctrl+V">
        Pegar
      </Item>
      <Item onSelect={run(() => chain().selectAll().run())} shortcut="Ctrl+A">
        Seleccionar todo
      </Item>
      <Sep />
      <Item onSelect={run(() => chain().toggleBold().run())} shortcut="Ctrl+B">
        Negrita
      </Item>
      <Item
        onSelect={run(() => chain().toggleItalic().run())}
        shortcut="Ctrl+I"
      >
        Cursiva
      </Item>
      <Item
        onSelect={run(() => chain().toggleUnderline().run())}
        shortcut="Ctrl+U"
      >
        Subrayado
      </Item>
      <Item onSelect={run(() => chain().unsetAllMarks().clearNodes().run())}>
        Borrar formato
      </Item>
      {menu.inLink && (
        <>
          <Sep />
          <Item
            onSelect={run(() =>
              chain().extendMarkRange('link').unsetLink().run(),
            )}
          >
            Quitar enlace
          </Item>
        </>
      )}
      {menu.inTable && (
        <>
          <Sep />
          <Item onSelect={run(() => chain().addRowBefore().run())}>
            Insertar fila arriba
          </Item>
          <Item onSelect={run(() => chain().addRowAfter().run())}>
            Insertar fila abajo
          </Item>
          <Item onSelect={run(() => chain().addColumnBefore().run())}>
            Insertar columna a la izquierda
          </Item>
          <Item onSelect={run(() => chain().addColumnAfter().run())}>
            Insertar columna a la derecha
          </Item>
          <Item onSelect={run(() => chain().mergeOrSplit().run())}>
            Combinar o dividir celdas
          </Item>
          <Item onSelect={run(() => chain().deleteRow().run())}>
            Eliminar fila
          </Item>
          <Item onSelect={run(() => chain().deleteColumn().run())}>
            Eliminar columna
          </Item>
          <Item onSelect={run(() => chain().deleteTable().run())}>
            Eliminar tabla
          </Item>
        </>
      )}
    </div>,
    document.body,
  )
}
