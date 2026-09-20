import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Check,
  ExternalLink,
  Highlighter,
  Italic,
  Link as LinkIcon,
  MessageSquarePlus,
  Pencil,
  Strikethrough,
  Underline,
  Unlink,
  X,
} from 'lucide-react'
import { cn } from '#/lib/utils'

/** Evento para abrir el editor de enlace (Ctrl/Cmd + K y el botón de la barra). */
export const LINK_EVENT = 'sc:link'

type Anchor = { left: number; top: number; below: number }

/** Añade https:// a lo que parece un dominio y descarta esquemas peligrosos. */
export function normalizeUrl(input: string): string | null {
  const url = input.trim()
  if (!url) return null
  if (/^(javascript|data|vbscript|file):/i.test(url)) return null
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(url)) return url
  if (/^[\w.-]+@[\w-]+\.[\w.-]+$/.test(url)) return `mailto:${url}`
  return `https://${url}`
}

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // mouseDown evita que el editor pierda la selección antes de aplicar el formato.
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary [@media(pointer:coarse)]:size-10',
        active && 'bg-secondary text-primary',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Barra contextual sobre el texto seleccionado (formato rápido, enlace y comentario) y editor de enlaces.
 * Ctrl/Cmd + K abre el campo del enlace; si el cursor está en un enlace aparecen sus acciones.
 */
export function SelectionBubble({
  editor,
  onComment,
}: {
  editor: Editor
  onComment?: (quote: string) => void
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const linkRange = useRef<{ from: number; to: number } | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    // Lo que el pintado lee del editor además de la posición (formatos activos, enlace): si no cambia,
    // basta con mover la barra y no hace falta repintarla entera.
    let lastView = ''
    const viewKey = () =>
      ['bold', 'italic', 'underline', 'strike', 'highlight', 'link']
        .map((name) => (editor.isActive(name) ? 1 : 0))
        .join('') +
      (editor.state.selection.empty ? 'e' : 's') +
      ((editor.getAttributes('link') as { href?: string }).href ?? '')
    const same = (a: Anchor | null, b: Anchor | null) =>
      a === b ||
      (!!a &&
        !!b &&
        a.left === b.left &&
        a.top === b.top &&
        a.below === b.below)
    const measure = () => {
      if (editor.isDestroyed) return
      const { from, to, empty } = editor.state.selection
      const inLink = editor.isActive('link')
      if (!linkMode && (!editor.isEditable || (empty && !inLink))) {
        setAnchor(null)
        return
      }
      if (!linkMode && !empty) {
        // Solo texto: una selección de bloque (imagen, tabla) tiene su propia barra.
        const text = editor.state.doc.textBetween(from, to, ' ').trim()
        if (text.length === 0) {
          setAnchor(null)
          return
        }
      }
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      const next = {
        left: Math.round((start.left + end.left) / 2),
        top: Math.round(start.top),
        below: Math.round(end.bottom),
      }
      // Misma posición (redondeada) = mismo estado: no se repinta en cada scroll o pulsación.
      setAnchor((prev) => (same(prev, next) ? prev : next))
      const key = viewKey()
      if (key !== lastView) {
        lastView = key
        force((n) => n + 1)
      }
    }
    // Un solo cálculo por fotograma aunque lleguen varios eventos (scroll en captura, update, selección…).
    let frame = 0
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          measure()
        })
    }
    measure()
    editor.on('selectionUpdate', schedule)
    editor.on('update', schedule)
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      editor.off('selectionUpdate', schedule)
      editor.off('update', schedule)
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor, linkMode])

  function openLink() {
    if (!editor.isEditable) return
    const attrs = editor.getAttributes('link') as { href?: string }
    if (editor.isActive('link'))
      editor.chain().focus().extendMarkRange('link').run()
    linkRange.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    }
    setUrl(attrs.href ?? '')
    setLinkMode(true)
  }

  useEffect(() => {
    const open = () => openLink()
    document.addEventListener(LINK_EVENT, open)
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        editor.isFocused
      ) {
        event.preventDefault()
        openLink()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener(LINK_EVENT, open)
      window.removeEventListener('keydown', onKey)
    }
  })

  useEffect(() => {
    if (linkMode) inputRef.current?.focus()
  }, [linkMode])

  function closeLink() {
    setLinkMode(false)
    setUrl('')
    editor.commands.focus()
  }

  function applyLink() {
    const href = normalizeUrl(url)
    if (!href) {
      closeLink()
      return
    }
    const { empty } = editor.state.selection
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: url.trim(),
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run()
    } else {
      editor.chain().focus().setLink({ href }).run()
    }
    setLinkMode(false)
    setUrl('')
  }

  if (!anchor) return null

  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  const top = coarse ? anchor.below + 14 : Math.max(8, anchor.top - 52)
  const left = Math.min(
    Math.max(anchor.left, 130),
    (typeof window === 'undefined' ? 1200 : window.innerWidth) - 130,
  )
  const inLink = editor.isActive('link')
  const empty = editor.state.selection.empty

  return (
    <div
      role="toolbar"
      aria-label="Formato del texto seleccionado"
      style={{ left, top, transform: 'translateX(-50%)' }}
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      {linkMode ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            applyLink()
          }}
        >
          <LinkIcon className="ml-1.5 size-4 flex-none text-muted-foreground" />
          <input
            ref={inputRef}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeLink()
              }
            }}
            placeholder="Pega o escribe la dirección"
            aria-label="Dirección del enlace"
            inputMode="url"
            className="h-8 w-56 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Tool label="Aplicar enlace" onClick={applyLink}>
            <Check className="size-4" />
          </Tool>
          <Tool label="Cancelar" onClick={closeLink}>
            <X className="size-4" />
          </Tool>
        </form>
      ) : empty && inLink ? (
        <>
          <a
            href={(editor.getAttributes('link') as { href?: string }).href}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-56 truncate px-2 text-sm text-primary underline-offset-2 hover:underline"
          >
            {(editor.getAttributes('link') as { href?: string }).href}
          </a>
          <Tool label="Abrir enlace" onClick={() => undefined}>
            <a
              href={(editor.getAttributes('link') as { href?: string }).href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir enlace en otra pestaña"
              className="flex size-full items-center justify-center"
            >
              <ExternalLink className="size-4" />
            </a>
          </Tool>
          <Tool label="Editar enlace" onClick={openLink}>
            <Pencil className="size-4" />
          </Tool>
          <Tool
            label="Quitar enlace"
            onClick={() =>
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
            }
          >
            <Unlink className="size-4" />
          </Tool>
        </>
      ) : (
        <>
          <Tool
            label="Negrita (Ctrl+B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </Tool>
          <Tool
            label="Cursiva (Ctrl+I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </Tool>
          <Tool
            label="Subrayado (Ctrl+U)"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="size-4" />
          </Tool>
          <Tool
            label="Tachado"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </Tool>
          <Tool
            label="Resaltar"
            active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter className="size-4" />
          </Tool>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <Tool label="Enlace (Ctrl+K)" active={inLink} onClick={openLink}>
            <LinkIcon className="size-4" />
          </Tool>
          {onComment && (
            <Tool
              label="Comentar"
              onClick={() => {
                const { from, to } = editor.state.selection
                const text = editor.state.doc.textBetween(from, to, '\n').trim()
                onComment(text.split('\n')[0].slice(0, 300))
              }}
            >
              <MessageSquarePlus className="size-4" />
            </Tool>
          )}
        </>
      )}
    </div>
  )
}
