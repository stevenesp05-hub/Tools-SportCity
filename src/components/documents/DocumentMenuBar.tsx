import { memo } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  ClipboardCheck,
  Download,
  Eraser,
  Eye,
  FileText,
  Highlighter,
  History,
  Keyboard,
  Link as LinkIcon,
  Pencil,
  Printer,
  Redo2,
  RemoveFormatting,
  Save,
  ScanSearch,
  Search,
  Share2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  Menu,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '#/components/ui/menubar'
import {
  ALIGNS,
  CALLOUT_TONES,
  FONT_SIZES,
  LINE_HEIGHTS,
} from '#/components/documents/EditorToolbar'
import { LINK_EVENT } from '#/components/documents/SelectionBubble'
import {
  ALL_BLOCKS,
  insertTableColumn,
  moveBlock,
} from '#/components/documents/editor-extras'
import { DOC_THEMES, THEME_INFO } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { downloadFile } from '#/lib/download'
import { cn } from '#/lib/utils'

/** Eventos con los que la barra de menús pide cosas a piezas que viven en otro sitio. */
export const MENU_EVENTS = {
  find: 'sc:find',
  insertImage: 'sc:insert-image',
  panel: 'sc:panel',
  print: 'sc:print',
  shortcuts: 'sc:shortcuts',
} as const

const emit = (name: string) => document.dispatchEvent(new CustomEvent(name))

type Props = {
  editor: Editor | null
  docId: string
  /** Título actual: se lee al descargar, así escribirlo no repinta la barra de menús. */
  getTitle: () => string
  theme: DocTheme
  editing: boolean
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onHistory: () => void
  onShare: () => void
  onReview: () => void
  onTemplate: () => void
  onChecks: () => void
  onDelete: () => void
  onTheme: (theme: DocTheme) => void
  focus: boolean
  onFocus: () => void
  onPreview: () => void
  continuous: boolean
  onContinuous: () => void
  showComments: boolean
  onShowComments: () => void
}

/**
 * Barra de menús del documento, como la de un editor de escritorio: todo lo que no cabe (ni hace falta)
 * en la barra de herramientas vive aquí, agrupado por lo que hace.
 */
export const DocumentMenuBar = memo(function DocumentMenuBar(props: Props) {
  const { editor, editing } = props
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inTable: e?.isActive('table') ?? false,
      hasCallout: e?.isActive('callout') ?? false,
    }),
  })
  const inTable = state?.inTable ?? false
  const hasCallout = state?.hasCallout ?? false
  // Los menús de edición solo tienen sentido con el documento abierto para editar.
  const off = !editing || !editor
  const run = (fn: (e: Editor) => unknown) => () => {
    if (editor) fn(editor)
  }
  const chain = (e: Editor) => e.chain().focus()

  const groups = ALL_BLOCKS.reduce<Record<string, typeof ALL_BLOCKS>>(
    (acc, item) => {
      ;(acc[item.group] ??= []).push(item)
      return acc
    },
    {},
  )

  const downloads = [
    ['PDF con portada de marca', `/api/documentos/${props.docId}/pdf`, 'pdf'],
    ['PDF sin portada', `/api/documentos/${props.docId}/pdf?portada=0`, 'pdf'],
    ['Word (.docx)', `/api/documentos/${props.docId}/word`, 'docx'],
  ] as const

  return (
    <Menubar aria-label="Menús del documento" className="-ml-1">
      <Menu>
        <MenubarTrigger>Archivo</MenubarTrigger>
        <MenubarContent className="w-64">
          {props.canEdit && editing && (
            <MenubarItem onSelect={props.onSave}>
              <Save /> Guardar
              <MenubarShortcut>Ctrl+S</MenubarShortcut>
            </MenubarItem>
          )}
          {props.canEdit && !editing && (
            <MenubarItem onSelect={props.onEdit}>
              <Pencil /> Editar documento
            </MenubarItem>
          )}
          {props.canEdit && editing && (
            <MenubarItem onSelect={props.onCancel}>
              <X /> Cancelar la edición
            </MenubarItem>
          )}
          <MenubarSeparator />
          <MenubarItem onSelect={props.onHistory}>
            <History /> Historial de versiones
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>
              <Download /> Descargar
            </MenubarSubTrigger>
            <MenubarSubContent>
              {downloads.map(([label, url, ext]) => (
                <MenubarItem
                  key={label}
                  onSelect={() =>
                    void downloadFile(url, {
                      fallbackName: `${props.getTitle()}.${ext}`,
                      loading:
                        ext === 'pdf'
                          ? 'Generando el PDF…'
                          : 'Generando el Word…',
                    })
                  }
                >
                  {label}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onSelect={props.onPreview}>
            <Eye /> Vista previa del PDF
          </MenubarItem>
          <MenubarItem onSelect={() => emit(MENU_EVENTS.print)}>
            <Printer /> Imprimir
            <MenubarShortcut>Ctrl+P</MenubarShortcut>
          </MenubarItem>
          {props.canEdit && (
            <>
              <MenubarSeparator />
              <MenubarItem onSelect={props.onShare}>
                <Share2 /> Compartir
              </MenubarItem>
              <MenubarItem onSelect={props.onReview}>
                <ClipboardCheck /> Pedir revisión
              </MenubarItem>
              <MenubarItem onSelect={props.onTemplate}>
                <BookmarkPlus /> Guardar como plantilla
              </MenubarItem>
            </>
          )}
          {props.canDelete && (
            <>
              <MenubarSeparator />
              <MenubarItem variant="destructive" onSelect={props.onDelete}>
                <Trash2 /> Enviar a la papelera
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Editar</MenubarTrigger>
        <MenubarContent className="w-64">
          <MenubarItem
            disabled={off}
            onSelect={run((e) => chain(e).undo().run())}
          >
            <Undo2 /> Deshacer
            <MenubarShortcut>Ctrl+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={off}
            onSelect={run((e) => chain(e).redo().run())}
          >
            <Redo2 /> Rehacer
            <MenubarShortcut>Ctrl+Mayús+Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={off}
            onSelect={run((e) => e.commands.selectAll())}
          >
            Seleccionar todo
            <MenubarShortcut>Ctrl+A</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={off} onSelect={() => emit(MENU_EVENTS.find)}>
            <Search /> Buscar y reemplazar
            <MenubarShortcut>Ctrl+F</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={off}
            onSelect={run((e) => chain(e).unsetAllMarks().clearNodes().run())}
          >
            <RemoveFormatting /> Borrar formato
          </MenubarItem>
          <MenubarItem disabled={off} onSelect={run((e) => moveBlock(e, -1))}>
            <ArrowUp /> Subir bloque
            <MenubarShortcut>Alt+Mayús+↑</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={off} onSelect={run((e) => moveBlock(e, 1))}>
            <ArrowDown /> Bajar bloque
            <MenubarShortcut>Alt+Mayús+↓</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Ver</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarCheckboxItem
            checked={editing}
            disabled={!props.canEdit}
            onCheckedChange={(checked) =>
              checked ? props.onEdit() : props.onCancel()
            }
          >
            Modo edición
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={props.focus}
            onCheckedChange={props.onFocus}
          >
            Modo enfoque
            <MenubarShortcut>Ctrl+Mayús+F</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={props.continuous}
            onCheckedChange={props.onContinuous}
          >
            Vista continua
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={props.showComments}
            onCheckedChange={props.onShowComments}
          >
            Comentarios
          </MenubarCheckboxItem>
          <MenubarItem onSelect={() => emit(MENU_EVENTS.panel)}>
            <FileText /> Mostrar u ocultar el panel
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            onSelect={() =>
              document
                .querySelector('.doc-sheet')
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }
          >
            <ArrowUp /> Ir al principio
          </MenubarItem>
          <MenubarItem
            onSelect={() =>
              document
                .querySelector('.doc-sheet')
                ?.scrollIntoView({ block: 'end', behavior: 'smooth' })
            }
          >
            <ArrowDown /> Ir al final
          </MenubarItem>
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Insertar</MenubarTrigger>
        <MenubarContent className="w-[min(48rem,94vw)] p-2">
          <MenubarItem disabled={off} onSelect={() => emit('sc:block-picker')}>
            <Search /> Buscar bloque…
            <MenubarShortcut>/ o botón +</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          {/* Todo a la vista: cada grupo de bloques en su columna, sin submenús que abrir */}
          <div className="gap-x-3 sm:columns-2 lg:columns-3">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group} className="mb-2 break-inside-avoid">
                <MenubarLabel>{group}</MenubarLabel>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <MenubarItem
                      key={item.title}
                      disabled={off}
                      title={item.description}
                      onSelect={run((e) => item.run(e))}
                    >
                      <Icon className={item.tint} />
                      <span className="truncate">{item.title}</span>
                      {item.shortcut && (
                        <MenubarShortcut>{item.shortcut}</MenubarShortcut>
                      )}
                    </MenubarItem>
                  )
                })}
              </div>
            ))}
            <div className="mb-2 break-inside-avoid">
              <MenubarLabel>Enlaces</MenubarLabel>
              <MenubarItem disabled={off} onSelect={() => emit(LINK_EVENT)}>
                <LinkIcon /> Enlace web
                <MenubarShortcut>Ctrl+K</MenubarShortcut>
              </MenubarItem>
            </div>
          </div>
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Formato</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>Texto</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onSelect={run((e) => chain(e).toggleBold().run())}>
                Negrita <MenubarShortcut>Ctrl+B</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={run((e) => chain(e).toggleItalic().run())}>
                Cursiva <MenubarShortcut>Ctrl+I</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).toggleUnderline().run())}
              >
                Subrayado <MenubarShortcut>Ctrl+U</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onSelect={run((e) => chain(e).toggleStrike().run())}>
                Tachado
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).toggleHighlight().run())}
              >
                <Highlighter /> Resaltar
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>
              Estilo de párrafo
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onSelect={run((e) => chain(e).setParagraph().run())}>
                Texto normal
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).setHeading({ level: 2 }).run())}
              >
                <span className="font-display font-bold">Título</span>
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).setHeading({ level: 3 }).run())}
              >
                <span className="font-display font-bold">Subtítulo</span>
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>
              Tamaño de letra
            </MenubarSubTrigger>
            <MenubarSubContent className="min-w-28">
              {FONT_SIZES.map((size) => (
                <MenubarItem
                  key={size}
                  onSelect={run((e) =>
                    size === '12'
                      ? chain(e).unsetFontSize().run()
                      : chain(e).setFontSize(`${size}px`).run(),
                  )}
                >
                  {size}
                  {size === '12' && <MenubarShortcut>normal</MenubarShortcut>}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>
              <AlignLeft /> Alinear
            </MenubarSubTrigger>
            <MenubarSubContent>
              {ALIGNS.map((a) => (
                <MenubarItem
                  key={a.value}
                  onSelect={run((e) => chain(e).setTextAlign(a.value).run())}
                >
                  <a.icon /> {a.label}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>Interlineado</MenubarSubTrigger>
            <MenubarSubContent>
              {LINE_HEIGHTS.map((h) => (
                <MenubarItem
                  key={h.value}
                  onSelect={run((e) => chain(e).setLineHeight(h.value).run())}
                >
                  {h.label}
                </MenubarItem>
              ))}
              <MenubarSeparator />
              <MenubarItem
                onSelect={run((e) => chain(e).unsetLineHeight().run())}
              >
                Predeterminado
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>
              Listas y sangría
            </MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem
                onSelect={run((e) => chain(e).toggleBulletList().run())}
              >
                Lista con viñetas
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).toggleOrderedList().run())}
              >
                Lista numerada
              </MenubarItem>
              <MenubarItem
                onSelect={run((e) => chain(e).toggleTaskList().run())}
              >
                Lista de tareas
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onSelect={run(
                  (e) =>
                    chain(e).sinkListItem('listItem').run() ||
                    chain(e).sinkListItem('taskItem').run(),
                )}
              >
                Aumentar sangría
              </MenubarItem>
              <MenubarItem
                onSelect={run(
                  (e) =>
                    chain(e).liftListItem('listItem').run() ||
                    chain(e).liftListItem('taskItem').run(),
                )}
              >
                Reducir sangría
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem
            disabled={off}
            onSelect={run((e) => chain(e).toggleBlockquote().run())}
          >
            Cita
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger disabled={off}>Aviso</MenubarSubTrigger>
            <MenubarSubContent>
              {CALLOUT_TONES.map((t) => (
                <MenubarItem
                  key={t.tone}
                  onSelect={run((e) =>
                    chain(e).wrapIn('callout', { tone: t.tone }).run(),
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', t.dot)} />
                  {t.label}
                </MenubarItem>
              ))}
              {hasCallout && (
                <>
                  <MenubarSeparator />
                  <MenubarItem
                    onSelect={run((e) => chain(e).lift('callout').run())}
                  >
                    Quitar aviso
                  </MenubarItem>
                </>
              )}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem
            disabled={off}
            onSelect={run((e) => chain(e).unsetAllMarks().clearNodes().run())}
          >
            <Eraser /> Borrar formato
          </MenubarItem>
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Tabla</MenubarTrigger>
        <MenubarContent className="w-60">
          <MenubarItem
            disabled={off}
            onSelect={run((e) =>
              chain(e)
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            )}
          >
            Insertar tabla 3 × 3
          </MenubarItem>
          <MenubarSeparator />
          <MenubarLabel>Filas</MenubarLabel>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).addRowBefore().run())}
          >
            Insertar fila arriba
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).addRowAfter().run())}
          >
            Insertar fila abajo
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).deleteRow().run())}
          >
            Eliminar fila
          </MenubarItem>
          <MenubarLabel>Columnas</MenubarLabel>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => insertTableColumn(e, 'before'))}
          >
            Insertar columna a la izquierda
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => insertTableColumn(e, 'after'))}
          >
            Insertar columna a la derecha
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).deleteColumn().run())}
          >
            Eliminar columna
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).mergeCells().run())}
          >
            Combinar celdas
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).splitCell().run())}
          >
            Dividir celda
          </MenubarItem>
          <MenubarItem
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).toggleHeaderRow().run())}
          >
            Fila de encabezado
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            variant="destructive"
            disabled={off || !inTable}
            onSelect={run((e) => chain(e).deleteTable().run())}
          >
            <Trash2 /> Eliminar tabla
          </MenubarItem>
        </MenubarContent>
      </Menu>

      <Menu>
        <MenubarTrigger>Herramientas</MenubarTrigger>
        <MenubarContent className="w-64">
          <MenubarItem onSelect={props.onChecks}>
            <ScanSearch /> Comprobar documento
          </MenubarItem>
          <MenubarItem onSelect={() => emit(MENU_EVENTS.shortcuts)}>
            <Keyboard /> Atajos de teclado
            <MenubarShortcut>Ctrl+/</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarLabel>Tema del documento</MenubarLabel>
          {DOC_THEMES.map((value) => (
            <MenubarCheckboxItem
              key={value}
              checked={props.theme === value}
              disabled={!props.canEdit}
              onCheckedChange={() => props.onTheme(value)}
            >
              {THEME_INFO[value].label}
            </MenubarCheckboxItem>
          ))}
        </MenubarContent>
      </Menu>
    </Menubar>
  )
})
