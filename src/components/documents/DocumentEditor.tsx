import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent, Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, ListTree, MessageSquarePlus } from 'lucide-react'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { Link, useRouter } from '@tanstack/react-router'
import { THEME_INFO, sheetThemeVars } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { SCHEMA_EXTENSIONS, countWords } from '#/lib/editor-extensions'
import { cn } from '#/lib/utils'
import {
  PAGE_CHROME_PX,
  PAGE_CONTENT_PX,
  Pagination,
  refreshPagination,
} from '#/components/documents/pagination'
import {
  BlockEditing,
  BlockMove,
  PageBreakShortcut,
  SearchReplace,
  TableFormulas,
  TableSemantics,
  RowResize,
  createDocLinkMenu,
  createSlashMenu,
} from '#/components/documents/editor-extras'
import { BlockDialog } from '#/components/documents/BlockDialog'
import type { DocumentLinkTarget } from '#/server/library'
import type {
  BlockDialogRequest,
  SlashState,
} from '#/components/documents/editor-extras'
import { imageFilesFrom, insertImageFiles } from '#/lib/image-upload'
import { TableGrips } from '#/components/documents/TableGrips'
import { BlockPicker } from '#/components/documents/BlockPicker'
import { SelectionBubble } from '#/components/documents/SelectionBubble'
import { SlashMenuView } from '#/components/documents/SlashMenuView'

// Objeto estable: si cambiara en cada render, el asa volvería a registrar su plugin y cancelaría el menú "/" a mitad de carga.
const DRAG_POSITION = { placement: 'left-start' } as const

type OutlineItem = { pos: number; level: number; text: string }

/** Pausa antes de recalcular índice y contador tras editar: no hace falta hacerlo en cada pulsación. */
const OUTLINE_DEBOUNCE_MS = 350

/** Contador de palabras y páginas: tiene su propio estado para que teclear no repinte todo el editor. */
const WordCount = memo(function WordCount({
  editor,
  pages,
}: {
  editor: Editor
  pages: number
}) {
  const [words, setWords] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const count = () => {
      timer = null
      if (!editor.isDestroyed) setWords(countWords(editor.getText()))
    }
    const later = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(count, OUTLINE_DEBOUNCE_MS)
    }
    count()
    editor.on('update', later)
    return () => {
      editor.off('update', later)
      if (timer) clearTimeout(timer)
    }
  }, [editor])
  return (
    <>
      {words.toLocaleString('es-NI')} {words === 1 ? 'palabra' : 'palabras'} ·{' '}
      {pages} {pages === 1 ? 'página' : 'páginas'}
    </>
  )
})

export function DocumentEditor({
  initialContent,
  title,
  folderName,
  editable,
  onEditorReady,
  onDirty,
  onRequestEdit,
  onCommentSelection,
  backlinks,
  outlineHost,
  theme = 'corporate',
  continuous = false,
  children,
}: {
  initialContent: JSONContent
  title: string
  folderName: string
  editable: boolean
  onEditorReady?: (editor: Editor) => void
  onDirty?: () => void
  onRequestEdit?: () => void
  onCommentSelection?: (quote: string) => void
  backlinks?: DocumentLinkTarget[]
  /** Contenedor (en la barra lateral) donde se pinta el índice del documento. */
  outlineHost?: HTMLElement | null
  theme?: DocTheme
  /** Vista continua: sin cabeceras, pies ni saltos de página simulados. */
  continuous?: boolean
  children?: React.ReactNode
}) {
  const router = useRouter()
  const regionRef = useRef<HTMLDivElement>(null)
  const baselineRef = useRef<string | null>(null)
  const changedRef = useRef(false)
  const paneRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef(title)
  titleRef.current = title
  const [pages, setPages] = useState(1)
  // En pantallas estrechas (móvil/tablet) se edita en vista continua, sin marco de página ni saltos
  // simulados. Se exige además que el dispositivo sea táctil sin ratón (puntero «coarse» y sin hover):
  // el ancho de ventana por sí solo no distingue un móvil de un escritorio con zoom por encima del
  // 100%, que también reduce `innerWidth` — sin este filtro, hacer zoom en el navegador activaba por
  // error esta vista (que fuerza `table-layout: auto` en las tablas) y descuadraba las tablas.
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia(
      '(max-width: 820px) and (pointer: coarse) and (hover: none)',
    )
    const sync = () => setCompact(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [selection, setSelection] = useState<{
    left: number
    top: number
    quote: string
  } | null>(null)
  const extensions = useMemo(
    () => [
      ...SCHEMA_EXTENSIONS,
      Placeholder.configure({
        placeholder: 'Escribe el contenido o pulsa "/" para insertar bloques…',
      }),
      SearchReplace,
      BlockMove,
      TableFormulas,
      TableSemantics,
      RowResize,
      BlockEditing,
      PageBreakShortcut,
      createSlashMenu(setSlash),
      createDocLinkMenu(setSlash),
      Pagination.configure({
        getRegion: () => regionRef.current,
        getTitle: () => titleRef.current,
        onPages: setPages,
      }),
    ],
    [],
  )
  const liveEditor = useRef<Editor | null>(null)
  const editor = useEditor({
    extensions,
    editorProps: {
      // Pegar o soltar imágenes las sube y las inserta; lo demás se comporta como siempre.
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData)
        if (files.length === 0 || !liveEditor.current) return false
        event.preventDefault()
        void insertImageFiles(liveEditor.current, files)
        return true
      },
      handleDrop: (view, event) => {
        const files = imageFilesFrom(event.dataTransfer)
        if (files.length === 0 || !liveEditor.current) return false
        event.preventDefault()
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos
        void insertImageFiles(liveEditor.current, files, pos)
        return true
      },
    },
    content: initialContent,
    editable,
    immediatelyRender: false,
    // El editor añade por sí solo algún bloque final al abrir (p. ej. un párrafo tras una tabla):
    // solo cuenta como cambio lo que difiere de ese estado inicial.
    onUpdate: ({ editor: current }) => {
      // Una vez hay cambios no se vuelve a comparar: serializar el documento entero en cada pulsación
      // se nota en documentos largos.
      if (changedRef.current) {
        onDirty?.()
        return
      }
      if (baselineRef.current === null) return
      if (JSON.stringify(current.getJSON()) !== baselineRef.current) {
        changedRef.current = true
        onDirty?.()
      }
    },
  })

  liveEditor.current = editor

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor)
  }, [editor, onEditorReady])

  // Al abrir, ProseMirror deja seleccionado el primer elemento "atómico" (p. ej. el logo de la plantilla): se pasa al primer texto.
  useEffect(() => {
    if (!editor) return
    if (editor.state.selection instanceof NodeSelection) {
      const first = { pos: -1 }
      editor.state.doc.descendants((node, pos) => {
        if (first.pos < 0 && node.isTextblock) first.pos = pos + 1
        return first.pos < 0
      })
      if (first.pos >= 0)
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(editor.state.doc, first.pos),
          ),
        )
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const timer = setTimeout(() => {
      if (!editor.isDestroyed)
        baselineRef.current = JSON.stringify(editor.getJSON())
    }, 500)
    return () => clearTimeout(timer)
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
    // Se enfoca la vista directamente y sin desplazar la pantalla. `commands.focus` prepara su transacción
    // antes de enfocar; en Safari enfocar dispara al instante otra (el editor añade un párrafo final al
    // abrir un documento que acaba en tabla, firmas…) y la primera llegaba desfasada:
    // «Applying a mismatched transaction» al pulsar Editar.
    if (editable) editor.view.focus()
  }, [editor, editable])

  // El título solo cambia el texto de cabeceras y pies: se repinta tras una pausa, sin reconstruir los saltos.
  useEffect(() => {
    if (!editor) return
    const timer = setTimeout(() => {
      if (!editor.isDestroyed) refreshPagination(editor.view)
    }, 300)
    return () => clearTimeout(timer)
  }, [editor, title])

  const [headings, setHeadings] = useState<OutlineItem[]>([])
  const [activePos, setActivePos] = useState<number | null>(null)

  useEffect(() => {
    if (!editor) return
    const collect = () => {
      const items: OutlineItem[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent.trim()) {
          const level = Number(node.attrs.level)
          items.push({ pos, level, text: node.textContent.trim() })
        }
        // Los títulos son bloques de texto: dentro de un párrafo no hay más bloques que recorrer.
        return !node.isTextblock
      })
      setHeadings((prev) =>
        prev.length === items.length &&
        prev.every(
          (p, i) =>
            p.pos === items[i].pos &&
            p.text === items[i].text &&
            p.level === items[i].level,
        )
          ? prev
          : items,
      )
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const later = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (!editor.isDestroyed) collect()
      }, OUTLINE_DEBOUNCE_MS)
    }
    collect()
    editor.on('update', later)
    return () => {
      editor.off('update', later)
      if (timer) clearTimeout(timer)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || headings.length === 0) return
    let frame = 0
    const update = () => {
      frame = 0
      let current: number | null = headings[0].pos
      const limit = (paneRef.current?.getBoundingClientRect().top ?? 0) + 90
      for (const h of headings) {
        const dom = editor.view.nodeDOM(h.pos)
        if (
          dom instanceof HTMLElement &&
          dom.getBoundingClientRect().top <= limit
        )
          current = h.pos
      }
      setActivePos(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor, headings])

  useEffect(() => {
    if (!editor || !onCommentSelection || editable) {
      setSelection(null)
      return
    }
    let frame = 0
    const measure = () => {
      frame = 0
      if (editor.isDestroyed) return
      const { from, to, empty } = editor.state.selection
      if (empty || to - from < 3) {
        setSelection(null)
        return
      }
      const text = editor.state.doc.textBetween(from, to, '\n').trim()
      const quote = text.split('\n')[0].slice(0, 300)
      if (quote.length < 3) {
        setSelection(null)
        return
      }
      const end = editor.view.coordsAtPos(to)
      const left = Math.round(end.left)
      const top = Math.round(end.bottom)
      // Sin cambios (misma posición y cita) no se toca el estado: evita repintar en cada scroll.
      setSelection((prev) =>
        prev && prev.left === left && prev.top === top && prev.quote === quote
          ? prev
          : { left, top, quote },
      )
    }
    // Un solo cálculo por fotograma aunque lleguen varios eventos (scroll en captura, selección…).
    const update = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    editor.on('selectionUpdate', update)
    document.addEventListener('scroll', update, true)
    return () => {
      editor.off('selectionUpdate', update)
      document.removeEventListener('scroll', update, true)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [editor, editable, onCommentSelection])

  const [blockRequest, setBlockRequest] = useState<BlockDialogRequest | null>(
    null,
  )
  useEffect(() => {
    const open = (event: Event) =>
      setBlockRequest((event as CustomEvent<BlockDialogRequest>).detail)
    document.addEventListener('sc:block-dialog', open)
    return () => document.removeEventListener('sc:block-dialog', open)
  }, [])

  function saveBlock(attrs: Record<string, unknown>) {
    const request = blockRequest
    setBlockRequest(null)
    if (!editor || !request) return
    const type = request.type === 'org' ? 'orgChart' : 'chart'
    if (request.pos !== null) {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(request.pos, undefined, attrs),
      )
    } else if (request.insertAt !== undefined) {
      editor
        .chain()
        .focus()
        .insertContentAt(request.insertAt, { type, attrs })
        .run()
    } else {
      editor.chain().focus().insertContent({ type, attrs }).run()
    }
  }

  function goToHeading(pos: number) {
    if (!editor) return
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement)
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (editable) editor.commands.setTextSelection(pos + 1)
  }

  if (!editor) return null

  function handleSheetClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!editor) return
    // Enlaces a otros documentos: se abren al hacer clic (al editar, con Ctrl/Cmd + clic).
    const anchor = (event.target as HTMLElement).closest(
      'a[href^="/documentos/"]',
    )
    if (anchor && (!editable || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      router.history.push(anchor.getAttribute('href') ?? '/documentos')
      return
    }
    if (!editable) {
      onRequestEdit?.()
      return
    }
    // Clic fuera del texto (en el hueco de la hoja): cursor al final del documento.
    if (!(event.target as HTMLElement).closest('.ProseMirror'))
      editor.commands.focus('end')
  }

  const outlineNav = (
    <nav aria-label="Índice del documento">
      <div className="mb-2 flex items-center">
        <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wide text-muted-foreground">
          <ListTree className="size-3.5" />
          Índice
        </span>
      </div>
      {headings.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Añade títulos y subtítulos al documento y aparecerán aquí para saltar
          a cada sección.
        </p>
      ) : (
        <ul className="space-y-0.5 border-l border-border">
          {headings.map((h) => (
            <li key={h.pos}>
              <button
                type="button"
                onClick={() => goToHeading(h.pos)}
                className={cn(
                  '-ml-px block w-full border-l-2 py-1 pr-1 text-left text-xs leading-snug transition-colors hover:text-foreground',
                  h.level >= 3 ? 'pl-6' : 'pl-3',
                  activePos === h.pos
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <WordCount editor={editor} pages={pages} />
      </div>
      {backlinks && backlinks.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-1.5 text-xs font-display uppercase tracking-wide text-muted-foreground">
            Enlazado desde
          </div>
          <ul className="space-y-1">
            {backlinks.map((b) => (
              <li key={b.id}>
                <Link
                  to="/documentos/doc/$docId"
                  params={{ docId: b.id }}
                  className="block truncate text-xs text-foreground/80 hover:text-foreground hover:underline"
                  title={`${b.title} · ${b.folderName}`}
                >
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )

  return (
    <div className="flex min-h-[26rem] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-[var(--doc-desk)]">
      <div className="flex min-h-0 flex-1">
        <div ref={paneRef} className="min-w-0 flex-1 overflow-auto p-2 sm:p-4">
          <div
            data-compact={compact}
            data-continuous={continuous}
            data-h={THEME_INFO[theme].style.heading}
            data-t={THEME_INFO[theme].style.table}
            data-z={THEME_INFO[theme].style.zebra ? 1 : 0}
            data-f={
              THEME_INFO[theme].style.footer === 'label'
                ? 'minimal'
                : THEME_INFO[theme].style.footer
            }
            data-tb={THEME_INFO[theme].style.titleBlock}
            onClick={handleSheetClick}
            title={
              !editable && onRequestEdit ? 'Haz clic para editar' : undefined
            }
            className={cn(
              // Sin `max-w-full`: la hoja mide siempre 8.5in de verdad, como una hoja de papel. Antes,
              // si la ventana (o el zoom del navegador, que también reduce el ancho disponible) no
              // dejaba sitio, esto la encogía — y con eso, el ancho en px de las columnas de las tablas
              // y los saltos de página (calculados para 8.5in) dejaban de cuadrar con lo que se veía.
              // Ahora, si no cabe, el panel que la contiene (ya tiene scroll propio) se desplaza en
              // horizontal, igual que una hoja real en cualquier editor de documentos. En vista
              // compacta (móvil) esto no aplica: esa regla fuerza su propio ancho con `!important`.
              'doc-sheet relative mx-auto w-[8.5in] bg-[var(--sc-paper)] shadow-md',
              editable
                ? 'cursor-text ring-2 ring-primary/25'
                : onRequestEdit &&
                    'cursor-pointer hover:ring-2 hover:ring-primary/20',
            )}
            style={{
              padding: '1.05in 0.85in 0.85in',
              ...(sheetThemeVars(theme) as React.CSSProperties),
            }}
          >
            <div className="sheet-run-head pointer-events-none absolute inset-x-[0.85in] top-[0.36in] flex items-center justify-between border-b border-[var(--sc-line)] pb-2">
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
              <span className="max-w-[3.8in] truncate text-[8.5px] text-[var(--sc-gray)]">
                {title}
              </span>
            </div>

            <div
              ref={regionRef}
              className="relative"
              style={{
                minHeight:
                  compact || continuous
                    ? undefined
                    : `${pages * PAGE_CONTENT_PX + (pages - 1) * PAGE_CHROME_PX}px`,
              }}
            >
              <div>
                <div className="sheet-kicker">{folderName}</div>
                <h1 className="sheet-title">
                  {title || 'Documento sin título'}
                </h1>
                <EditorContent editor={editor} />
                {editable && (
                  <DragHandle
                    editor={editor}
                    computePositionConfig={DRAG_POSITION}
                  >
                    <div
                      className="sc-drag-handle"
                      title="Arrastra para mover el bloque"
                    >
                      <GripVertical className="size-4" />
                    </div>
                  </DragHandle>
                )}
              </div>
            </div>

            <div className="sheet-run-foot pointer-events-none absolute inset-x-0 bottom-0 flex h-[0.62in] items-center justify-between bg-[var(--sc-navy)] px-[0.85in] text-white">
              <div className="min-w-0">
                <div className="max-w-[3.6in] truncate font-display text-[7.5px] uppercase tracking-[0.16em] text-[var(--sc-accent)]">
                  {title}
                </div>
                <div className="run-foot-club mt-1 font-display text-[12px]">
                  Sport City Club
                </div>
              </div>
              <div className="text-right text-[8.5px] leading-[1.6] text-[#dfe3f5]">
                <div>
                  <b className="font-display text-[var(--sc-accent)]">
                    5865-1010
                  </b>{' '}
                  · info@sportcityclub.com
                </div>
                <div>
                  www.sportcitynic.com · Página {pages} de {pages}
                </div>
              </div>
            </div>
          </div>
          {children && (
            <div className="mx-auto mt-6 w-[8.5in] max-w-full rounded-lg border border-border bg-card p-5">
              {children}
            </div>
          )}
        </div>
      </div>
      {outlineHost && createPortal(outlineNav, outlineHost)}
      <SlashMenuView slash={slash} />
      {editable && <BlockPicker editor={editor} />}
      {editable && <TableGrips editor={editor} />}
      {editable && (
        <SelectionBubble editor={editor} onComment={onCommentSelection} />
      )}
      <BlockDialog
        request={blockRequest}
        onClose={() => setBlockRequest(null)}
        onSave={saveBlock}
      />
      {selection && onCommentSelection && (
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault()
            onCommentSelection(selection.quote)
            setSelection(null)
          }}
          style={{
            left: Math.min(selection.left, window.innerWidth - 150),
            top: selection.top + 8,
          }}
          className="fixed z-40 flex items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium text-foreground shadow-lg hover:bg-secondary"
        >
          <MessageSquarePlus className="size-3.5" />
          Comentar
        </button>
      )}
    </div>
  )
}
