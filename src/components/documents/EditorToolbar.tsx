import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Redo2,
  Plus,
  Printer,
  Type,
  TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  X,
  BarChart3,
  Check,
  ChevronDown,
  Sigma,
  Columns3,
  Grid3x3,
  PaintBucket,
  Rows3,
  TableCellsMerge,
  Trash2,
} from 'lucide-react'
import { LINK_EVENT } from '#/components/documents/SelectionBubble'
import { insertImageFiles } from '#/lib/image-upload'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  BORDER_COLORS,
  BORDER_WIDTHS,
  CELL_COLORS,
  HIGHLIGHT_COLORS,
  IMAGE_ALIGNS,
  IMAGE_WIDTHS,
  TEXT_COLORS,
} from '#/lib/editor-extensions'
import {
  currentCell,
  formulaAvgAbove,
  formulaSumAbove,
  formulaSumLeft,
  openBlockDialog,
  tableChartData,
  replaceAll,
  replaceCurrent,
  searchKey,
  setSearchQuery,
  stepSearch,
} from '#/components/documents/editor-extras'
import { normalizeChartSpec } from '#/lib/charts'
import { FORMULA_FORMATS } from '#/lib/formulas'
import type { FormulaFormat } from '#/lib/formulas'
import { useDialogs } from '#/components/ui/dialogs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

export const CALLOUT_TONES = [
  { tone: 'info', label: 'Información', dot: 'bg-[oklch(0.7_0.1_240)]' },
  { tone: 'warn', label: 'Advertencia', dot: 'bg-[oklch(0.75_0.14_70)]' },
  { tone: 'ok', label: 'Correcto', dot: 'bg-[oklch(0.7_0.12_150)]' },
  { tone: 'key', label: 'Dato destacado', dot: 'bg-[oklch(0.83_0.08_240)]' },
  { tone: 'summary', label: 'Resumen', dot: 'bg-[oklch(0.85_0.02_275)]' },
  { tone: 'kpi', label: 'Cifra principal', dot: 'bg-[oklch(0.3_0.14_275)]' },
] as const

export const ALIGNS = [
  { value: 'left', label: 'Izquierda', icon: AlignLeft },
  { value: 'center', label: 'Centrar', icon: AlignCenter },
  { value: 'right', label: 'Derecha', icon: AlignRight },
  { value: 'justify', label: 'Justificar', icon: AlignJustify },
] as const

function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: typeof Bold
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-8', active && 'bg-secondary text-primary')}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      <Icon className="size-4" />
    </Button>
  )
}

function Swatches({
  icon: Icon,
  label,
  colors,
  onPick,
  onClear,
  active,
}: {
  icon: typeof Bold
  label: string
  colors: ReadonlyArray<{ value: string; label: string }>
  onPick: (color: string) => void
  onClear: () => void
  active?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8', active && 'bg-secondary text-primary')}
          title={label}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="mb-1.5 px-1 text-2xs font-display uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="flex items-center gap-1.5">
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              onClick={() => {
                onPick(c.value)
                setOpen(false)
              }}
              className="size-6 rounded-full border border-border ring-offset-1 hover:ring-2 hover:ring-primary/40"
              style={{ backgroundColor: c.value }}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 h-6 px-2 text-xs"
            onClick={() => {
              onClear()
              setOpen(false)
            }}
          >
            Quitar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const value = searchKey.getState(e.state)
      return { count: value?.matches.length ?? 0, index: value?.index ?? 0 }
    },
  })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => setSearchQuery(editor, '')
  }, [editor])

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-3 py-1.5">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSearchQuery(editor, e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') stepSearch(editor, e.shiftKey ? -1 : 1)
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Buscar en el documento…"
        className="h-8 w-56 text-sm"
        aria-label="Buscar"
      />
      <span className="min-w-16 text-xs text-muted-foreground">
        {query
          ? state.count === 0
            ? 'Sin resultados'
            : `${state.index + 1} de ${state.count}`
          : ''}
      </span>
      <IconButton
        icon={ArrowUp}
        label="Anterior"
        onClick={() => stepSearch(editor, -1)}
        disabled={state.count === 0}
      />
      <IconButton
        icon={ArrowDown}
        label="Siguiente"
        onClick={() => stepSearch(editor, 1)}
        disabled={state.count === 0}
      />
      <Separator orientation="vertical" className="h-5" />
      <Input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Reemplazar por…"
        className="h-8 w-48 text-sm"
        aria-label="Reemplazar por"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={state.count === 0}
        onClick={() => {
          replaceCurrent(editor, replacement)
          stepSearch(editor, 1)
        }}
      >
        Reemplazar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={state.count === 0}
        onClick={() => {
          const n = replaceAll(editor, replacement)
          toast.success(`${n} reemplazos`)
        }}
      >
        Reemplazar todo
      </Button>
      <IconButton icon={X} label="Cerrar" onClick={onClose} />
    </div>
  )
}

function MenuButton({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Bold
  label: string
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-card px-2.5 text-xs"
        >
          <Icon className="size-3.5" />
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Selector para `useEditorState` que reutiliza el resultado anterior mientras el documento, la
 * selección y las marcas guardadas sean los mismos (transacciones de meta, como la paginación):
 * así no se repite el rosario de `isActive` / `getAttributes` sin necesidad. El re-render sigue
 * dependiendo de la igualdad del resultado, como antes.
 */
function useStateMemo<T>(compute: (editor: Editor) => T) {
  const last = useRef<{
    doc: unknown
    selection: unknown
    marks: unknown
    value: T
  } | null>(null)
  return ({ editor: e }: { editor: Editor }): T => {
    const { doc, selection, storedMarks } = e.state
    const prev = last.current
    if (
      prev &&
      prev.doc === doc &&
      prev.selection === selection &&
      prev.marks === storedMarks
    )
      return prev.value
    const value = compute(e)
    last.current = { doc, selection, marks: storedMarks, value }
    return value
  }
}

function TableBar({ editor }: { editor: Editor }) {
  const attrs = useEditorState({
    editor,
    selector: useStateMemo((e) => {
      const t = e.getAttributes('table') as {
        borderWidth?: string | null
        borderColor?: string | null
      }
      return { width: t.borderWidth ?? null, color: t.borderColor ?? null }
    }),
  })
  const chain = () => editor.chain().focus()
  const { prompt } = useDialogs()
  const cell = useEditorState({
    editor,
    selector: useStateMemo<ReturnType<typeof currentCell>>((e) =>
      currentCell(e.state),
    ),
    equalityFn: (a, b) =>
      a?.row === b?.row &&
      a?.col === b?.col &&
      a?.formula === b?.formula &&
      a?.format === b?.format &&
      a?.tablePos === b?.tablePos,
  })

  const setFormula = (formula: string | null) =>
    chain().setCellAttribute('formula', formula).run()
  const setFormat = (format: FormulaFormat) =>
    chain().setCellAttribute('formulaFormat', format).run()
  async function writeFormula() {
    const value = await prompt({
      title: 'Fórmula',
      label: 'Empieza con = (ejemplo: =SUMA(B2:B6) o =B2*C2)',
      defaultValue: cell?.formula ?? '=',
      confirmLabel: 'Aplicar',
    })
    if (value === null) return
    const formula = value.trim()
    if (formula.length < 2 || !formula.startsWith('=')) {
      toast.error('La fórmula debe empezar con = y tener contenido.')
      return
    }
    setFormula(formula)
  }
  function makeChart() {
    const data = tableChartData(editor.state)
    if (!data) {
      toast.error(
        'La tabla necesita una primera columna de nombres y otra con números (al menos dos filas).',
      )
      return
    }
    openBlockDialog({
      type: 'chart',
      pos: null,
      insertAt: data.insertAt,
      attrs: {
        spec: normalizeChartSpec({
          kind: data.series.length > 1 ? 'columns' : 'bars',
          title: data.title,
          categories: data.categories,
          series: data.series,
        }),
      },
    })
  }

  return (
    <div className="sc-toolbar-row flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-3 py-2">
      <span className="flex items-center gap-1.5 pr-1 text-2xs font-display uppercase tracking-wide text-muted-foreground">
        <TableIcon className="size-3.5" />
        Tabla
      </span>

      <MenuButton icon={Rows3} label="Filas">
        <DropdownMenuItem onSelect={() => chain().addRowBefore().run()}>
          Insertar fila arriba
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => chain().addRowAfter().run()}>
          Insertar fila debajo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => chain().toggleHeaderRow().run()}>
          Fila de encabezado (on/off)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => chain().deleteRow().run()}
        >
          Eliminar fila
        </DropdownMenuItem>
      </MenuButton>

      <MenuButton icon={Columns3} label="Columnas">
        <DropdownMenuItem onSelect={() => chain().addColumnBefore().run()}>
          Insertar columna a la izquierda
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => chain().addColumnAfter().run()}>
          Insertar columna a la derecha
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => chain().toggleHeaderColumn().run()}>
          Columna de encabezado (on/off)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => chain().deleteColumn().run()}
        >
          Eliminar columna
        </DropdownMenuItem>
      </MenuButton>

      <MenuButton icon={TableCellsMerge} label="Celdas">
        <DropdownMenuItem onSelect={() => chain().mergeCells().run()}>
          Combinar celdas seleccionadas
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => chain().splitCell().run()}>
          Dividir celda
        </DropdownMenuItem>
        <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
          Arrastra sobre varias celdas para seleccionarlas.
        </DropdownMenuLabel>
      </MenuButton>

      <MenuButton icon={Grid3x3} label="Líneas">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
          Grosor
        </DropdownMenuLabel>
        {BORDER_WIDTHS.map((w) => (
          <DropdownMenuItem
            key={w.value}
            onSelect={() =>
              chain().updateAttributes('table', { borderWidth: w.value }).run()
            }
          >
            <span className="flex w-full items-center gap-3">
              <span
                className="w-8 flex-none bg-foreground"
                style={{
                  height: w.value === 'none' ? 0 : `${Number(w.value)}px`,
                  borderTop: w.value === 'none' ? '1px dashed #999' : undefined,
                  background: w.value === 'none' ? 'transparent' : undefined,
                }}
              />
              <span className="flex-1">{w.label}</span>
              {attrs.width === w.value && <Check className="size-4" />}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onSelect={() =>
            chain()
              .updateAttributes('table', {
                borderWidth: null,
                borderColor: null,
              })
              .run()
          }
        >
          <span className="flex w-full items-center gap-3">
            <span className="w-8 flex-none text-center text-xs text-muted-foreground">
              ↺
            </span>
            <span className="flex-1">Estilo de Sport City</span>
            {attrs.width === null && <Check className="size-4" />}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
          Color de las líneas
        </DropdownMenuLabel>
        {BORDER_COLORS.map((c) => (
          <DropdownMenuItem
            key={c.value}
            onSelect={() =>
              chain()
                .updateAttributes('table', {
                  borderColor: c.value,
                  borderWidth: attrs.width ?? '1',
                })
                .run()
            }
          >
            <span className="flex w-full items-center gap-3">
              <span
                className="size-4 flex-none rounded-full border border-border"
                style={{ backgroundColor: c.swatch }}
              />
              <span className="flex-1">{c.label}</span>
              {(attrs.color ?? 'gray') === c.value && attrs.width !== null && (
                <Check className="size-4" />
              )}
            </span>
          </DropdownMenuItem>
        ))}
      </MenuButton>

      <MenuButton icon={Sigma} label="Fórmula">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
          En la celda donde está el cursor
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!cell || cell.row <= cell.firstDataRow}
          onSelect={() => cell && setFormula(formulaSumAbove(cell))}
        >
          Suma de la columna (encima)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!cell || cell.row <= cell.firstDataRow}
          onSelect={() => cell && setFormula(formulaAvgAbove(cell))}
        >
          Promedio de la columna (encima)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!cell || cell.col < 1}
          onSelect={() => cell && setFormula(formulaSumLeft(cell))}
        >
          Suma de la fila (a la izquierda)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void writeFormula()}>
          Escribir fórmula…
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!cell?.formula}
          onSelect={() => setFormula(null)}
        >
          Quitar fórmula
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">
          Formato del resultado
        </DropdownMenuLabel>
        {FORMULA_FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} onSelect={() => setFormat(f.value)}>
            <span className="flex w-full items-center gap-2">
              <span className="flex-1">{f.label}</span>
              {cell?.format === f.value && <Check className="size-4" />}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
          Ejemplos: =SUMA(B2:B6) · =B2*C2 · =(B2+B3)/2
        </DropdownMenuLabel>
      </MenuButton>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 bg-card px-2.5 text-xs"
        onClick={makeChart}
      >
        <BarChart3 className="size-3.5" />
        Gráfico de la tabla
      </Button>

      <Swatches
        icon={PaintBucket}
        label="Fondo de la celda"
        colors={CELL_COLORS}
        onPick={(c) => chain().setCellAttribute('backgroundColor', c).run()}
        onClear={() => chain().setCellAttribute('backgroundColor', null).run()}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-8 gap-1.5 px-2.5 text-xs text-destructive hover:text-destructive"
        onClick={() => chain().deleteTable().run()}
      >
        <Trash2 className="size-3.5" />
        Eliminar tabla
      </Button>
    </div>
  )
}

export const FONT_SIZES = [
  '10',
  '11',
  '12',
  '14',
  '16',
  '18',
  '24',
  '30',
] as const
export const LINE_HEIGHTS = [
  { value: '1', label: 'Sencillo' },
  { value: '1.15', label: '1,15' },
  { value: '1.5', label: '1,5' },
  { value: '2', label: 'Doble' },
] as const

function StyleMenu({ editor, label }: { editor: Editor; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-32 justify-between gap-1 px-2 text-xs"
          title="Estilo del párrafo"
          aria-label="Estilo del párrafo"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().setParagraph().run()}
        >
          <Type className="size-4" />
          Texto normal
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().setHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
          <span className="font-display font-bold">Título</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => editor.chain().focus().setHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" />
          <span className="font-display font-bold">Subtítulo</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FontSizeMenu({
  editor,
  current,
}: {
  editor: Editor
  current: string | null | undefined
}) {
  const active = current ? current.replace('px', '') : '12'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs tabular-nums"
          title="Tamaño de letra"
          aria-label="Tamaño de letra"
        >
          {active}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-24">
        {FONT_SIZES.map((size) => (
          <DropdownMenuItem
            key={size}
            onSelect={() =>
              size === '12'
                ? editor.chain().focus().unsetFontSize().run()
                : editor.chain().focus().setFontSize(`${size}px`).run()
            }
          >
            <span className="flex w-full items-center justify-between gap-3 tabular-nums">
              {size}
              {active === size && <Check className="size-4" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SHORTCUTS: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: 'Texto',
    items: [
      ['Negrita', 'Ctrl + B'],
      ['Cursiva', 'Ctrl + I'],
      ['Subrayado', 'Ctrl + U'],
      ['Deshacer / Rehacer', 'Ctrl + Z / Ctrl + Mayús + Z'],
      ['Borrar formato', 'Ctrl + \\'],
    ],
  },
  {
    group: 'Bloques',
    items: [
      ['Menú de bloques', '/'],
      ['Enlazar un documento', '@'],
      ['Título', '## + espacio'],
      ['Lista con viñetas', '- + espacio'],
      ['Lista numerada', '1. + espacio'],
      ['Lista de tareas', '[ ] + espacio'],
      ['Subir / bajar bloque', 'Alt + Mayús + ↑ / ↓'],
      ['Salto de página (hoja nueva)', 'Ctrl + Enter'],
      ['Salto de línea', 'Mayús + Enter'],
    ],
  },
  {
    group: 'Documento',
    items: [
      ['Guardar', 'Ctrl + S'],
      ['Buscar y reemplazar', 'Ctrl + F'],
      ['Este panel', 'Ctrl + /'],
    ],
  },
]

function ShortcutsDialog() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('sc:shortcuts', show)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('sc:shortcuts', show)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {SHORTCUTS.map((group) => (
            <section key={group.group}>
              <h3 className="mb-1.5 text-xs font-display uppercase tracking-wide text-muted-foreground">
                {group.group}
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {group.items.map(([label, keys]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-foreground">{label}</span>
                    <kbd className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Toolbar({ editor }: { editor: Editor }) {
  const { prompt } = useDialogs()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [findOpen, setFindOpen] = useState(false)

  useEffect(() => {
    const pick = () => fileInputRef.current?.click()
    document.addEventListener('sc:pick-image', pick)
    return () => document.removeEventListener('sc:pick-image', pick)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // La barra de menús (Insertar → Imagen, Editar → Buscar) pide estas acciones por evento.
  useEffect(() => {
    const pickImage = () => fileInputRef.current?.click()
    const openFind = () => setFindOpen(true)
    document.addEventListener('sc:insert-image', pickImage)
    document.addEventListener('sc:find', openFind)
    return () => {
      document.removeEventListener('sc:insert-image', pickImage)
      document.removeEventListener('sc:find', openFind)
    }
  }, [])

  async function handleImageSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await insertImageFiles(editor, [file])
  }

  const state = useEditorState({
    editor,
    selector: useStateMemo((e) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      table: e.isActive('table'),
      callout: e.isActive('callout'),
      link: e.isActive('link'),
      image: e.isActive('image'),
      colored: Boolean(e.getAttributes('textStyle').color),
      highlighted: e.isActive('highlight'),
      align:
        ALIGNS.find((a) => e.isActive({ textAlign: a.value }))?.value ?? 'left',
      imageAttrs: e.isActive('image')
        ? (e.getAttributes('image') as {
            width: string
            align: string
            caption: string | null
          })
        : null,
      style: e.isActive('heading', { level: 2 })
        ? 'Título'
        : e.isActive('heading', { level: 3 })
          ? 'Subtítulo'
          : 'Texto normal',
      fontSize: (e.getAttributes('textStyle') as { fontSize?: string | null })
        .fontSize,
      lineHeight: (
        e.getAttributes('textStyle') as { lineHeight?: string | null }
      ).lineHeight,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    })),
  })

  const CurrentAlign =
    ALIGNS.find((a) => a.value === state.align)?.icon ?? AlignLeft

  return (
    <div>
      <ShortcutsDialog />
      <div className="sc-toolbar-row flex flex-wrap items-center gap-0.5 px-3 py-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleImageSelected}
        />
        <IconButton
          icon={Undo2}
          label="Deshacer"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!state.canUndo}
        />
        <IconButton
          icon={Redo2}
          label="Rehacer"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!state.canRedo}
        />
        <IconButton
          icon={Plus}
          label="Insertar bloque"
          onClick={() =>
            document.dispatchEvent(new CustomEvent('sc:block-picker'))
          }
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton
          icon={Printer}
          label="Imprimir (Ctrl+P)"
          onClick={() => document.dispatchEvent(new CustomEvent('sc:print'))}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <StyleMenu editor={editor} label={state.style} />
        <FontSizeMenu editor={editor} current={state.fontSize} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton
          icon={Bold}
          label="Negrita"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={state.bold}
        />
        <IconButton
          icon={Italic}
          label="Cursiva"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={state.italic}
        />
        <IconButton
          icon={UnderlineIcon}
          label="Subrayado"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={state.underline}
        />
        <Swatches
          icon={Palette}
          label="Color del texto"
          colors={TEXT_COLORS}
          active={state.colored}
          onPick={(c) => editor.chain().focus().setColor(c).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        />
        <Swatches
          icon={Highlighter}
          label="Resaltar"
          colors={HIGHLIGHT_COLORS}
          active={state.highlighted}
          onPick={(c) =>
            editor.chain().focus().setHighlight({ color: c }).run()
          }
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title="Alineación"
              aria-label="Alineación"
            >
              <CurrentAlign className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ALIGNS.map((a) => (
              <DropdownMenuItem
                key={a.value}
                onSelect={() =>
                  editor.chain().focus().setTextAlign(a.value).run()
                }
              >
                <a.icon className="size-4" />
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton
          icon={List}
          label="Lista"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={state.bulletList}
        />
        <IconButton
          icon={ListOrdered}
          label="Lista numerada"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={state.orderedList}
        />
        <IconButton
          icon={ListChecks}
          label="Lista de tareas"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={state.taskList}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <IconButton
          icon={TableIcon}
          label="Insertar tabla"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          active={state.table}
        />
        <IconButton
          icon={ImageIcon}
          label="Insertar imagen"
          onClick={() => fileInputRef.current?.click()}
        />
        <IconButton
          icon={LinkIcon}
          label="Enlace (Ctrl+K)"
          active={state.link}
          onClick={() => document.dispatchEvent(new CustomEvent(LINK_EVENT))}
        />
        <span className="ml-2 hidden text-2xs text-muted-foreground xl:inline">
          Escribe <kbd className="rounded-md border border-border px-1">/</kbd>{' '}
          para insertar bloques
        </span>
      </div>

      {findOpen && (
        <FindBar editor={editor} onClose={() => setFindOpen(false)} />
      )}

      {state.image && state.imageAttrs && (
        <div className="sc-toolbar-row flex flex-wrap items-center gap-1 border-t border-border bg-secondary/40 px-3 py-1.5">
          <span className="mr-1 text-2xs font-display uppercase tracking-wide text-muted-foreground">
            Imagen
          </span>
          <Separator orientation="vertical" className="mr-1 h-4" />
          {IMAGE_WIDTHS.map((w) => (
            <Button
              key={w}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-2 text-xs',
                state.imageAttrs?.width === w && 'bg-secondary text-primary',
              )}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('image', { width: w })
                  .run()
              }
            >
              {w}
            </Button>
          ))}
          <Separator orientation="vertical" className="mx-1 h-4" />
          {IMAGE_ALIGNS.map((a) => {
            const Icon = ALIGNS.find((x) => x.value === a)?.icon ?? AlignLeft
            return (
              <IconButton
                key={a}
                icon={Icon}
                label={`Alinear ${a === 'left' ? 'a la izquierda' : a === 'right' ? 'a la derecha' : 'al centro'}`}
                active={state.imageAttrs?.align === a}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { align: a })
                    .run()
                }
              />
            )
          })}
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              void prompt({
                title: 'Pie de foto',
                label: 'Texto bajo la imagen',
                defaultValue: state.imageAttrs?.caption ?? '',
                confirmLabel: 'Guardar',
              }).then((caption) => {
                if (caption !== null)
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { caption: caption || null })
                    .run()
              })
            }
          >
            {state.imageAttrs.caption
              ? 'Editar pie de foto'
              : 'Añadir pie de foto'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            Quitar imagen
          </Button>
        </div>
      )}

      {state.table && <TableBar editor={editor} />}
    </div>
  )
}
