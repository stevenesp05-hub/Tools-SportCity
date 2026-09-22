import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import {
  BarChart3,
  Braces,
  Columns2,
  CalendarDays,
  FileText,
  ListTree,
  Network,
  CircleCheck,
  ClipboardList,
  Heading2,
  Heading3,
  ImageIcon,
  Info,
  List,
  ListChecks,
  ListOrdered,
  Gauge,
  Megaphone,
  Minus,
  PanelTop,
  SquareCheck,
  Tag,
  TextCursorInput,
  PenLine,
  Quote,
  SeparatorHorizontal,
  Signature,
  Star,
  Table as TableIcon,
  TriangleAlert,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import { insertPageBreak, signaturesContent } from '#/lib/editor-extensions'
import type { EditorView } from '@tiptap/pm/view'
import { TableMap, columnResizingPluginKey } from '@tiptap/pm/tables'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  cellRef,
  evaluateFormula,
  formatResult,
  parseNumber,
} from '#/lib/formulas'
import type { CellValue, FormulaFormat } from '#/lib/formulas'
import { rankBlocks, recordRecent } from '#/lib/block-search'
import { TOTAL_ROW, numericColumns } from '#/lib/table-semantics'
import { searchDocumentsForLink } from '#/server/library'

// ---------- Buscar y reemplazar ----------

export type SearchMatch = { from: number; to: number }
export type SearchState = {
  query: string
  index: number
  matches: SearchMatch[]
}

export const searchKey = new PluginKey<SearchState>('sc-search')

function findMatches(state: EditorState, query: string): SearchMatch[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const matches: SearchMatch[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const text = node
      .textBetween(0, node.content.size, undefined, '￼')
      .toLowerCase()
    let at = text.indexOf(needle)
    while (at !== -1) {
      matches.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length })
      at = text.indexOf(needle, at + needle.length)
    }
  })
  return matches
}

export const SearchReplace = Extension.create({
  name: 'scSearchReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', index: 0, matches: [] }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchKey) as
              { query?: string; index?: number } | undefined
            if (!meta && !tr.docChanged) return value
            const query = meta?.query ?? value.query
            const matches = findMatches(newState, query)
            const index =
              matches.length === 0
                ? 0
                : Math.min(meta?.index ?? value.index, matches.length - 1)
            return { query, index, matches }
          },
        },
        props: {
          decorations(state) {
            const value = searchKey.getState(state)
            if (!value || value.matches.length === 0) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              value.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class:
                    i === value.index
                      ? 'search-match search-current'
                      : 'search-match',
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})

/** Lleva al lector hasta un fragmento citado y lo resalta unos segundos. */
export function revealText(editor: Editor, quote: string): boolean {
  const needle = quote.replace(/\s+/g, ' ').trim().slice(0, 80)
  const matches = findMatches(editor.state, needle)
  if (matches.length === 0) return false
  const match = matches[0]
  editor.view.dispatch(
    editor.state.tr
      .setMeta(searchKey, { query: needle, index: 0 })
      .setSelection(
        TextSelection.create(editor.state.doc, match.from, match.to),
      ),
  )
  const { node } = editor.view.domAtPos(match.from)
  const element = node instanceof HTMLElement ? node : node.parentElement
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => {
    if (!editor.isDestroyed) setSearchQuery(editor, '')
  }, 3500)
  return true
}

export function setSearchQuery(editor: Editor, query: string) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, index: 0 }))
}

export function stepSearch(editor: Editor, direction: 1 | -1) {
  const value = searchKey.getState(editor.state)
  if (!value || value.matches.length === 0) return
  const index =
    (value.index + direction + value.matches.length) % value.matches.length
  const match = value.matches[index]
  const tr = editor.state.tr
    .setMeta(searchKey, { index })
    .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
    .scrollIntoView()
  editor.view.dispatch(tr)
}

export function replaceCurrent(editor: Editor, replacement: string) {
  const value = searchKey.getState(editor.state)
  if (!value || value.matches.length === 0) return
  const match = value.matches[value.index]
  editor.view.dispatch(
    editor.state.tr.insertText(replacement, match.from, match.to),
  )
}

export function replaceAll(editor: Editor, replacement: string): number {
  const value = searchKey.getState(editor.state)
  if (!value || value.matches.length === 0) return 0
  const tr = editor.state.tr
  for (const m of [...value.matches].reverse())
    tr.insertText(replacement, m.from, m.to)
  editor.view.dispatch(tr)
  return value.matches.length
}

// ---------- Mover bloques ----------

/** Sube o baja el bloque de primer nivel donde está el cursor. */
export function moveBlock(editor: Editor, direction: -1 | 1): boolean {
  const { state, view } = editor
  const { doc } = state
  const index = state.selection.$from.index(0)
  const target = index + direction
  if (target < 0 || target >= doc.childCount) return false

  let start = 0
  for (let i = 0; i < index; i += 1) start += doc.child(i).nodeSize
  const node = doc.child(index)
  const end = start + node.nodeSize
  const other = doc.child(target)

  const tr = state.tr
  let newPos: number
  if (direction === -1) {
    newPos = start - other.nodeSize
    tr.delete(start, end)
    tr.insert(newPos, node)
  } else {
    tr.insert(end + other.nodeSize, node)
    tr.delete(start, end)
    newPos = start + other.nodeSize
  }
  tr.setSelection(
    node.isAtom
      ? NodeSelection.create(tr.doc, newPos)
      : TextSelection.near(tr.doc.resolve(newPos + 1)),
  )
  view.dispatch(tr.scrollIntoView())
  return true
}

export const BlockMove = Extension.create({
  name: 'scBlockMove',
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-Shift-ArrowDown': () => moveBlock(this.editor, 1),
    }
  },
})

// ---------- Fórmulas en tablas ----------

export const formulaKey = new PluginKey('sc-formula')

type FormulaEdit = { from: number; to: number; text: string }

/** «Esta tabla tiene alguna celda con fórmula», por nodo: una tabla que no cambió no se vuelve a recorrer. */
const formulaTables = new WeakMap<PMNode, boolean>()
function hasFormulas(table: PMNode): boolean {
  let found = formulaTables.get(table)
  if (found === undefined) {
    let any = false
    table.forEach((row) =>
      row.forEach((cell) => {
        if (cell.attrs.formula) any = true
      }),
    )
    found = any
    formulaTables.set(table, found)
  }
  return found
}

function computeTable(table: PMNode, tablePos: number): FormulaEdit[] {
  if (!hasFormulas(table)) return []
  const map = TableMap.get(table)
  const offsets = [...new Set(map.map)]

  const at = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= map.height || col >= map.width) return null
    return table.nodeAt(map.map[row * map.width + col])
  }
  const cache = new Map<string, CellValue>()
  const visiting = new Set<string>()
  const value = (row: number, col: number): CellValue => {
    const cell = at(row, col)
    if (!cell) return null
    const key = `${row}:${col}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const formula = cell.attrs.formula as string | null
    let result: CellValue
    if (formula) {
      if (visiting.has(key)) return { error: '#CICLO' }
      visiting.add(key)
      const evaluated = evaluateFormula(formula, value)
      visiting.delete(key)
      result = typeof evaluated === 'number' ? evaluated : { error: evaluated }
    } else {
      result = parseNumber(cell.textContent)
    }
    cache.set(key, result)
    return result
  }

  const edits: FormulaEdit[] = []
  for (const offset of offsets) {
    const cell = table.nodeAt(offset)
    if (!cell?.attrs.formula) continue
    const rect = map.findCell(offset)
    const result = value(rect.top, rect.left)
    const text =
      result === null
        ? '0'
        : typeof result === 'number'
          ? formatResult(
              result,
              (cell.attrs.formulaFormat as FormulaFormat | null) ?? 'number',
            )
          : result.error
    if (cell.textContent === text) continue
    const cellStart = tablePos + 1 + offset
    edits.push({ from: cellStart + 1, to: cellStart + cell.nodeSize - 1, text })
  }
  return edits
}

/** Recalcula las celdas con fórmula de cada tabla cada vez que cambia el documento. */
export const TableFormulas = Extension.create({
  name: 'scTableFormulas',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: formulaKey,
        appendTransaction(transactions, _old, state) {
          if (
            !transactions.some((t) => t.docChanged) ||
            transactions.some((t) => t.getMeta(formulaKey))
          )
            return null
          const edits: FormulaEdit[] = []
          state.doc.descendants((node, pos) => {
            // Las tablas van entre bloques: no se entra en los bloques de texto.
            if (node.type.name !== 'table') return !node.isTextblock
            edits.push(...computeTable(node, pos))
            return false
          })
          if (edits.length === 0) return null
          const tr = state.tr
          for (const edit of edits.sort((a, b) => b.from - a.from)) {
            const paragraph = state.schema.nodes.paragraph
            tr.replaceWith(
              edit.from,
              edit.to,
              paragraph.create(
                null,
                edit.text ? state.schema.text(edit.text) : null,
              ),
            )
          }
          return tr.setMeta(formulaKey, true)
        },
      }),
    ]
  },
})

export type CellContext = {
  row: number
  col: number
  rows: number
  cols: number
  firstDataRow: number
  tablePos: number
  tableEnd: number
  formula: string | null
  format: FormulaFormat
}

/** Celda donde está el cursor: posición en la tabla y fórmula actual. */
export function currentCell(state: EditorState): CellContext | null {
  const { $from } = state.selection
  let cellDepth = -1
  let tableDepth = -1
  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d).type.name
    if (cellDepth < 0 && (name === 'tableCell' || name === 'tableHeader'))
      cellDepth = d
    if (name === 'table') {
      tableDepth = d
      break
    }
  }
  if (cellDepth < 0 || tableDepth < 0) return null
  const table = $from.node(tableDepth)
  const map = TableMap.get(table)
  const rect = map.findCell($from.before(cellDepth) - $from.start(tableDepth))
  const cell = $from.node(cellDepth)
  const headerRow = table.firstChild?.firstChild?.type.name === 'tableHeader'
  return {
    row: rect.top,
    col: rect.left,
    rows: map.height,
    cols: map.width,
    firstDataRow: headerRow ? 1 : 0,
    tablePos: $from.before(tableDepth),
    tableEnd: $from.after(tableDepth),
    formula: (cell.attrs.formula as string | null) ?? null,
    format: (cell.attrs.formulaFormat as FormulaFormat | null) ?? 'number',
  }
}

export const formulaSumAbove = (c: CellContext) =>
  `=SUMA(${cellRef(c.firstDataRow, c.col)}:${cellRef(c.row - 1, c.col)})`
export const formulaAvgAbove = (c: CellContext) =>
  `=PROMEDIO(${cellRef(c.firstDataRow, c.col)}:${cellRef(c.row - 1, c.col)})`
export const formulaSumLeft = (c: CellContext) =>
  `=SUMA(${cellRef(c.row, c.col > 1 ? 1 : 0)}:${cellRef(c.row, c.col - 1)})`

/**
 * Datos de la tabla donde está el cursor: la primera columna son las categorías y cada columna
 * numérica, una serie (con el encabezado como nombre). Se saltan las filas de totales.
 */
export function tableChartData(state: EditorState): {
  title: string
  categories: string[]
  series: Array<{ name: string; values: Array<number | null> }>
  insertAt: number
} | null {
  const cell = currentCell(state)
  if (!cell) return null
  const table = state.doc.nodeAt(cell.tablePos)
  if (!table) return null
  const map = TableMap.get(table)
  const at = (row: number, col: number) =>
    table.nodeAt(map.map[row * map.width + col])
  const text = (row: number, col: number) =>
    at(row, col)?.textContent.trim() ?? ''

  // Una fila de totales (por su nombre, o la última si todo son fórmulas) desequilibra el gráfico.
  const isTotal = (row: number) => {
    if (/^(total|suma|promedio)\b/i.test(text(row, 0))) return true
    if (row !== map.height - 1) return false
    let formulas = 0
    let numbers = 0
    for (let col = 1; col < map.width; col += 1) {
      if (parseNumber(text(row, col)) === null) continue
      numbers += 1
      if (at(row, col)?.attrs.formula) formulas += 1
    }
    return numbers > 0 && formulas === numbers
  }

  const rows: number[] = []
  for (let row = cell.firstDataRow; row < map.height; row += 1)
    if (text(row, 0) && !isTotal(row)) rows.push(row)
  if (rows.length < 2) return null

  const series: Array<{ name: string; values: Array<number | null> }> = []
  for (let col = 1; col < map.width && series.length < 6; col += 1) {
    const values = rows.map((row) => parseNumber(text(row, col)))
    if (values.filter((v) => v !== null).length < 2) continue
    series.push({
      name:
        cell.firstDataRow === 1 ? text(0, col) : `Serie ${series.length + 1}`,
      values,
    })
  }
  if (series.length === 0) return null
  return {
    title: series.length === 1 && cell.firstDataRow === 1 ? series[0].name : '',
    categories: rows.map((row) => text(row, 0)),
    series,
    insertAt: cell.tableEnd,
  }
}

// ---------- Organigramas y gráficos ----------

export type BlockDialogRequest = {
  type: 'org' | 'chart'
  /** Posición del bloque que se edita; null si es uno nuevo. */
  pos: number | null
  attrs?: Record<string, unknown>
  /** Dónde insertar un bloque nuevo (por defecto, en la posición del cursor). */
  insertAt?: number
}

export function openBlockDialog(request: BlockDialogRequest) {
  document.dispatchEvent(
    new CustomEvent('sc:block-dialog', { detail: request }),
  )
}

/**
 * Ctrl+Enter inserta un salto de página, como en Google Docs. El salto de línea sigue siendo Mayús+Enter.
 * Va con prioridad alta para pasar por delante del salto de línea que Tiptap asocia a Ctrl+Enter.
 */
export const PageBreakShortcut = Extension.create({
  name: 'scPageBreakShortcut',
  priority: 1000,
  addKeyboardShortcuts() {
    const run = () => insertPageBreak(this.editor)
    // En Mac «Mod» es Cmd: se enlaza también Control, que es la tecla que se usa en Windows y la que se anuncia.
    return { 'Mod-Enter': run, 'Ctrl-Enter': run }
  },
})

/** Clic sobre un organigrama o gráfico en modo edición: abre su editor. */
export const BlockEditing = Extension.create({
  name: 'scBlockEditing',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos) {
            if (!view.editable) return false
            if (node.type.name === 'orgChart' || node.type.name === 'chart') {
              openBlockDialog({
                type: node.type.name === 'orgChart' ? 'org' : 'chart',
                pos: nodePos,
                attrs: node.attrs,
              })
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})

// ---------- Menú "/" ----------

export type SlashItem = {
  group: string
  icon: LucideIcon
  /** Color del icono (clase de texto de Tailwind). */
  tint?: string
  title: string
  description: string
  keywords: string
  /** Atajo de Markdown que hace lo mismo, como pista. */
  shortcut?: string
  run: (editor: Editor) => void
}

export type SlashState = {
  items: SlashItem[]
  index: number
  rect: { left: number; top: number; bottom: number } | null
  choose: (item: SlashItem) => void
}

const cell = (text: string, header = false) => ({
  type: header ? 'tableHeader' : 'tableCell',
  content: [
    {
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : undefined,
    },
  ],
})
const row = (cells: string[], header = false) => ({
  type: 'tableRow',
  content: cells.map((c) => cell(c, header)),
})

// ---------- Bloques de comunicación (campañas, programas, formularios) ----------

const styled = (
  text: string,
  style: { size?: string; color?: string; bold?: boolean; italic?: boolean },
) => ({
  type: 'text',
  text,
  marks: [
    ...(style.bold ? [{ type: 'bold' }] : []),
    ...(style.italic ? [{ type: 'italic' }] : []),
    {
      type: 'textStyle',
      attrs: { fontSize: style.size ?? null, color: style.color ?? null },
    },
  ],
})
const para = (...content: object[]) => ({ type: 'paragraph', content })
const plain = (text: string) => ({ type: 'text', text })
const bgCell = (backgroundColor: string, content: object[]) => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: null, backgroundColor },
  content,
})

/** Tarjeta de beneficio: etiqueta, cifra grande y dos líneas de detalle. */
const benefitCard = (dark: boolean) => {
  const ink = dark ? '#ffffff' : '#1b1b3a'
  return bgCell(dark ? '#1e1a6b' : '#d7e9fb', [
    para(
      styled('ETIQUETA · PRECIO', {
        size: '9px',
        color: dark ? '#e0a91b' : '#3f78b5',
        bold: true,
      }),
    ),
    para(
      styled('10 %', {
        size: '30px',
        color: dark ? '#e0a91b' : '#1e1a6b',
        bold: true,
      }),
      styled(' de descuento', { size: '12px', color: ink }),
    ),
    para(
      styled('Concepto: ', { size: '11px', color: ink, bold: true }),
      styled('detalle', { size: '11px', color: ink }),
    ),
    para(
      styled('Otro concepto: ', { size: '11px', color: ink, bold: true }),
      styled('detalle', { size: '11px', color: ink }),
    ),
  ])
}

const formField = (label: string) =>
  bgCell('#f3f4fb', [
    para(styled(label, { size: '9px', color: '#6a70a0', bold: true })),
    { type: 'paragraph' },
  ])

export const COMMUNICATION_ITEMS: SlashItem[] = [
  {
    group: 'Comunicación',
    icon: PanelTop,
    tint: 'text-info',
    title: 'Banner de portada',
    description: 'Etiqueta, titular con palabras destacadas y subtítulo',
    keywords: 'banner portada hero cabecera titular campana',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { tone: 'hero' },
          content: [
            para(plain('Etiqueta de la campaña · Periodo')),
            para(
              plain('Titular. '),
              styled('Palabras destacadas.', { italic: true }),
            ),
            para(plain('Subtítulo de una línea que completa el titular.')),
          ],
        })
        .run(),
  },
  {
    group: 'Comunicación',
    icon: Tag,
    title: 'Título con etiqueta',
    description: 'Una etiqueta pequeña sobre el título de la sección',
    keywords: 'etiqueta titulo seccion eyebrow kicker',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent([
          {
            type: 'callout',
            attrs: { tone: 'eyebrow' },
            content: [para(plain('Etiqueta'))],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [plain('Título de la sección')],
          },
        ])
        .run(),
  },
  {
    group: 'Comunicación',
    icon: Columns2,
    tint: 'text-info',
    title: 'Tarjetas de beneficio',
    description: 'Dos niveles lado a lado, claro y oscuro, con cifra grande',
    keywords: 'tarjetas beneficio membresia planes niveles comparar cifra',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [benefitCard(false), benefitCard(true)],
            },
          ],
        })
        .updateAttributes('table', { borderWidth: 'none' })
        .run(),
  },
  {
    group: 'Comunicación',
    icon: Megaphone,
    title: 'Llamada a la acción',
    description: 'Franja de color con mensaje y datos de contacto',
    keywords: 'llamada accion cta contacto cierre franja',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { tone: 'cta' },
          content: [
            para(plain('Mensaje de cierre que invita a actuar.')),
            para(plain('Teléfono · Teléfono')),
            para(plain('correo@dominio.com')),
            para(styled('www.sitio.com', { bold: true }), plain(' · @usuario')),
          ],
        })
        .run(),
  },
  {
    group: 'Comunicación',
    icon: TextCursorInput,
    title: 'Campos de formulario',
    description: 'Una fila de tres casillas para rellenar a mano',
    keywords: 'formulario campos casillas rellenar datos solicitud',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                formField('CAMPO 1'),
                formField('CAMPO 2'),
                formField('CAMPO 3'),
              ],
            },
          ],
        })
        .updateAttributes('table', {
          borderWidth: '3',
          borderColor: 'paper',
        })
        .run(),
  },
  {
    group: 'Comunicación',
    icon: SquareCheck,
    title: 'Opciones con casilla',
    description: 'Una línea con casillas ☐ para marcar',
    keywords: 'opciones casilla checkbox marcar elegir',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent(
          para(
            styled('OPCIÓN', { size: '9px', color: '#6a70a0', bold: true }),
            plain('  ☐ Primera   ☐ Segunda   ☐ Tercera'),
          ),
        )
        .run(),
  },
]

export const SLASH_ITEMS: SlashItem[] = [
  {
    group: 'Básicos',
    icon: Type,
    title: 'Texto',
    description: 'Un párrafo normal',
    keywords: 'texto parrafo normal',
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    group: 'Básicos',
    icon: Heading2,
    title: 'Título',
    description: 'Sección principal con línea',
    keywords: 'titulo encabezado h2 seccion',
    shortcut: '##',
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    group: 'Básicos',
    icon: Heading3,
    title: 'Subtítulo',
    description: 'Apartado dentro de una sección',
    keywords: 'subtitulo h3',
    shortcut: '###',
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    group: 'Básicos',
    icon: Quote,
    title: 'Cita',
    description: 'Texto destacado con filo',
    keywords: 'cita destacado quote',
    shortcut: '>',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    group: 'Listas',
    icon: List,
    title: 'Lista con viñetas',
    description: 'Una lista sencilla',
    keywords: 'lista viñetas puntos',
    shortcut: '-',
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    group: 'Listas',
    icon: ListOrdered,
    title: 'Lista numerada',
    description: 'Reglas numeradas con titular',
    keywords: 'lista numerada reglas orden',
    shortcut: '1.',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    group: 'Listas',
    icon: ListChecks,
    title: 'Lista de tareas',
    description: 'Casillas para marcar',
    keywords: 'tareas checklist casillas',
    shortcut: '[ ]',
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    group: 'Bloques',
    icon: TableIcon,
    title: 'Tabla',
    description: 'Filas y columnas con encabezado',
    keywords: 'tabla filas columnas',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    group: 'Bloques',
    icon: Info,
    tint: 'text-info',
    title: 'Aviso informativo',
    description: 'Tarjeta con filo celeste',
    keywords: 'aviso nota info',
    run: (e) => e.chain().focus().wrapIn('callout', { tone: 'info' }).run(),
  },
  {
    group: 'Bloques',
    icon: TriangleAlert,
    tint: 'text-warning',
    title: 'Aviso de advertencia',
    description: 'Tarjeta con filo rojo',
    keywords: 'aviso advertencia alerta',
    run: (e) => e.chain().focus().wrapIn('callout', { tone: 'warn' }).run(),
  },
  {
    group: 'Bloques',
    icon: CircleCheck,
    tint: 'text-success',
    title: 'Aviso correcto',
    description: 'Tarjeta con filo verde',
    keywords: 'aviso correcto ok',
    run: (e) => e.chain().focus().wrapIn('callout', { tone: 'ok' }).run(),
  },
  {
    group: 'Bloques',
    icon: Star,
    tint: 'text-warning',
    title: 'Dato destacado',
    description: 'Una frase clave con filo de acento',
    keywords: 'dato destacado clave importante key',
    run: (e) => e.chain().focus().wrapIn('callout', { tone: 'key' }).run(),
  },
  {
    group: 'Bloques',
    icon: FileText,
    title: 'Resumen',
    description: 'Cuadro tenue para resumir una sección',
    keywords: 'resumen sintesis summary',
    run: (e) => e.chain().focus().wrapIn('callout', { tone: 'summary' }).run(),
  },
  {
    group: 'Bloques',
    icon: Gauge,
    tint: 'text-info',
    title: 'Cifra principal',
    description: 'Un dato grande con su descripción (KPI)',
    keywords: 'kpi cifra dato principal numero indicador',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'callout',
          attrs: { tone: 'kpi' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Cifra' }] },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Descripción' }],
            },
          ],
        })
        .run(),
  },
  {
    group: 'Bloques',
    icon: Minus,
    title: 'Línea separadora',
    description: 'Divide dos partes del documento',
    keywords: 'linea separador hr',
    shortcut: '---',
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    group: 'Bloques',
    icon: Signature,
    title: 'Puntos de firma',
    description: 'Dos líneas para firmar a mano (jugador y capitán)',
    keywords: 'firma firmas firmar firmante compromiso aceptacion linea',
    run: (e) => {
      e.chain()
        .focus()
        .insertContent([
          signaturesContent([
            ['Firma del jugador', 'Nombre completo y cédula'],
            [
              'Firma del capitán o director técnico',
              'Nombre completo y cédula',
            ],
          ]),
          { type: 'paragraph' },
        ])
        .run()
    },
  },
  {
    group: 'Bloques',
    icon: Signature,
    title: 'Punto de firma',
    description: 'Una sola línea para firmar a mano',
    keywords: 'firma unica una sola firmar linea',
    run: (e) => {
      e.chain()
        .focus()
        .insertContent([
          signaturesContent([['Firma', 'Nombre completo y cargo']]),
          { type: 'paragraph' },
        ])
        .run()
    },
  },
  {
    group: 'Bloques',
    icon: SeparatorHorizontal,
    title: 'Salto de página',
    description: 'Lo siguiente empieza en una hoja nueva',
    keywords: 'salto pagina hoja nueva',
    shortcut: 'Ctrl+Enter',
    run: (e) => {
      insertPageBreak(e)
    },
  },
  {
    group: 'Datos',
    icon: BarChart3,
    tint: 'text-indigo-600',
    title: 'Gráfico',
    description: 'Columnas, barras, líneas, circular y más',
    keywords:
      'grafico barras columnas lineas area circular pastel anillo donut datos estadistica',
    run: () => openBlockDialog({ type: 'chart', pos: null }),
  },
  {
    group: 'Datos',
    icon: Network,
    tint: 'text-indigo-600',
    title: 'Organigrama',
    description: 'Estructura con niveles, escrita como lista',
    keywords: 'organigrama estructura jerarquia equipo',
    run: () => openBlockDialog({ type: 'org', pos: null }),
  },
  {
    group: 'Datos',
    icon: ListTree,
    title: 'Índice automático',
    description: 'Lista de títulos que se actualiza sola',
    keywords: 'indice contenido tabla titulos',
    run: (e) => e.chain().focus().insertContent({ type: 'tocBlock' }).run(),
  },
  {
    group: 'Sport City',
    icon: ImageIcon,
    title: 'Imagen',
    description: 'Sube una imagen desde tu equipo',
    keywords: 'imagen foto logo',
    run: () => document.dispatchEvent(new CustomEvent('sc:pick-image')),
  },
  {
    group: 'Sport City',
    icon: PenLine,
    title: 'Bloque de firmas',
    description: 'Elaboró, revisó y aprobó',
    keywords: 'firmas firma aprobacion',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'table',
          content: [
            row(['Rol', 'Nombre', 'Cargo', 'Firma', 'Fecha'], true),
            row(['Elaboró', '', '', '', '']),
            row(['Revisó', '', '', '', '']),
            row(['Aprobó', '', '', '', '']),
          ],
        })
        .run(),
  },
  {
    group: 'Sport City',
    icon: ClipboardList,
    title: 'Tabla de control',
    description: 'Código, versión, fecha y área',
    keywords: 'control codigo version membrete',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: 'table',
          content: [
            row(['Código', 'Versión', 'Fecha de emisión', 'Área'], true),
            row([
              'SC-XXX-001',
              '1.0',
              new Date().toLocaleDateString('es-NI'),
              '',
            ]),
          ],
        })
        .run(),
  },
  {
    group: 'Datos',
    icon: Braces,
    title: 'Campo dinámico',
    description: 'Un dato que se rellena al usar la plantilla',
    keywords: 'campo dinamico variable dato plantilla llaves cliente evento',
    run: (e) => {
      const from = e.state.selection.from
      e.chain().focus().insertContent('{{campo}}').run()
      e.commands.setTextSelection({ from: from + 2, to: from + 7 })
    },
  },
  {
    group: 'Bloques',
    icon: Columns2,
    title: 'Dos columnas',
    description: 'Dos bloques de texto lado a lado',
    keywords: 'columnas dos lado a lado paralelo',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
        .updateAttributes('table', { borderWidth: 'none' })
        .run(),
  },
  {
    group: 'Sport City',
    icon: CalendarDays,
    title: 'Fecha de hoy',
    description: 'Inserta la fecha actual',
    keywords: 'fecha hoy',
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent(
          new Date().toLocaleDateString('es-NI', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        )
        .run(),
  },
]

/** Todos los bloques insertables: el catálogo base + los de comunicación. */
export const ALL_BLOCKS: SlashItem[] = [...SLASH_ITEMS, ...COMMUNICATION_ITEMS]

function createSuggestionMenu(options: {
  name: string
  char: string
  items: (query: string) => SlashItem[] | Promise<SlashItem[]>
  onState: (state: SlashState | null) => void
  /** Recordar el bloque elegido para ofrecerlo primero la próxima vez. */
  remember?: boolean
  /** Espera (ms) tras la última tecla antes de pedir los elementos; los pedidos viejos se descartan solos. */
  debounce?: number
}) {
  return Extension.create({
    name: options.name,
    addProseMirrorPlugins() {
      const editor = this.editor
      let items: SlashItem[] = []
      let index = 0
      let range: Range | null = null
      let clientRect: (() => DOMRect | null) | null = null

      const choose = (item: SlashItem) => {
        if (!range) return
        editor.chain().focus().deleteRange(range).run()
        if (options.remember) recordRecent(item.title)
        item.run(editor)
        options.onState(null)
      }
      const publish = () => {
        const rect = clientRect?.() ?? null
        options.onState({
          items,
          index,
          choose,
          rect: rect
            ? { left: rect.left, top: rect.top, bottom: rect.bottom }
            : null,
        })
      }

      return [
        Suggestion<SlashItem, SlashItem>({
          editor,
          pluginKey: new PluginKey(options.name),
          char: options.char,
          items: ({ query }) => options.items(query),
          debounce: options.debounce,
          command: ({ props }) => choose(props),
          render: () => ({
            onStart: (props) => {
              items = props.items
              index = 0
              range = props.range
              clientRect = props.clientRect ?? null
              publish()
            },
            onUpdate: (props) => {
              range = props.range
              clientRect = props.clientRect ?? null
              // Con espera antes de pedir, mientras carga se mantiene la lista anterior en vez de vaciarla.
              if (!(options.debounce && props.loading)) {
                items = props.items
                index = Math.min(index, Math.max(items.length - 1, 0))
              }
              publish()
            },
            onKeyDown: ({ event }) => {
              if (items.length === 0) return false
              if (event.key === 'ArrowDown') {
                index = (index + 1) % items.length
                publish()
                return true
              }
              if (event.key === 'ArrowUp') {
                index = (index - 1 + items.length) % items.length
                publish()
                return true
              }
              if (event.key === 'Enter') {
                choose(items[index])
                return true
              }
              return false
            },
            onExit: () => options.onState(null),
          }),
        }),
      ]
    },
  })
}

/** "/" abre el menú de bloques. */
export function createSlashMenu(onState: (state: SlashState | null) => void) {
  return createSuggestionMenu({
    name: 'scSlashMenu',
    char: '/',
    onState,
    remember: true,
    items: (query) => rankBlocks(ALL_BLOCKS, query),
  })
}

type DocLinkResult = Awaited<ReturnType<typeof searchDocumentsForLink>>

/** "@" abre el buscador de documentos para enlazarlos. */
export function createDocLinkMenu(onState: (state: SlashState | null) => void) {
  // Última consulta resuelta (vale unos segundos): repetirla no vuelve a pedirla al servidor.
  let last: { query: string; found: DocLinkResult; at: number } | null = null
  return createSuggestionMenu({
    name: 'scDocLinkMenu',
    char: '@',
    onState,
    // Espera 200 ms tras la última tecla; el propio Suggestion descarta las respuestas de consultas anteriores.
    debounce: 200,
    items: async (query) => {
      let found: DocLinkResult
      if (last && last.query === query && Date.now() - last.at < 30_000) {
        found = last.found
      } else {
        // Un fallo no se guarda en la caché: se reintenta en la siguiente consulta.
        const result = await searchDocumentsForLink({ data: { query } }).then(
          (list) => ({ ok: true, list }),
          () => ({ ok: false, list: [] as DocLinkResult }),
        )
        found = result.list
        if (result.ok) last = { query, found, at: Date.now() }
      }
      return found.map((doc): SlashItem => ({
        group: 'Enlazar documento',
        icon: FileText,
        title: doc.title,
        description: doc.folderName,
        keywords: '',
        run: (editor) =>
          editor
            .chain()
            .focus()
            .insertContent([
              {
                type: 'text',
                text: doc.title,
                marks: [
                  {
                    type: 'link',
                    attrs: { href: `/documentos/doc/${doc.id}` },
                  },
                ],
              },
              { type: 'text', text: ' ' },
            ])
            .run(),
      }))
    },
  })
}

/**
 * Cuida en el editor lo mismo que el PDF: las columnas de cifras se alinean a la derecha
 * y las filas «Subtotal» / «Total» se destacan. Solo añade clases; no toca el contenido.
 */
const semanticsKey = new PluginKey<DecorationSet>('sc-table-semantics')

type SemanticMark = { from: number; to: number; cls: string }

/** Marcas de cada tabla con posiciones relativas a ella: una tabla que no cambió reutiliza las suyas sin releer sus celdas. */
const semanticMarks = new WeakMap<PMNode, SemanticMark[]>()

function marksOfTable(table: PMNode): SemanticMark[] {
  const cached = semanticMarks.get(table)
  if (cached) return cached
  const marks: SemanticMark[] = []
  const rows: Array<{ node: PMNode; pos: number; texts: string[] }> = []
  table.forEach((row, offset) => {
    const texts: string[] = []
    row.forEach((cell) => texts.push(cell.textContent.trim()))
    rows.push({ node: row, pos: 1 + offset, texts })
  })
  const numeric = numericColumns(rows.map((r) => r.texts))
  rows.forEach((row) => {
    const label = row.texts[0] ?? ''
    if (TOTAL_ROW.test(label))
      marks.push({
        from: row.pos,
        to: row.pos + row.node.nodeSize,
        cls: /^\s*sub/i.test(label) ? 'is-sub' : 'is-total',
      })
    if (numeric.size === 0) return
    row.node.forEach((cell, cellOffset, index) => {
      if (numeric.has(index))
        marks.push({
          from: row.pos + 1 + cellOffset,
          to: row.pos + 1 + cellOffset + cell.nodeSize,
          cls: 'is-num',
        })
    })
  })
  semanticMarks.set(table, marks)
  return marks
}

function buildSemantics(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    // Las tablas van entre bloques: no se entra en los bloques de texto.
    if (node.type.name !== 'table') return !node.isTextblock
    for (const mark of marksOfTable(node))
      decorations.push(
        Decoration.node(pos + mark.from, pos + mark.to, { class: mark.cls }),
      )
    return false
  })
  return DecorationSet.create(doc, decorations)
}

export const TableSemantics = Extension.create({
  name: 'scTableSemantics',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: semanticsKey,
        state: {
          init: (_config, state) => buildSemantics(state.doc),
          apply: (tr, old, _previous, next) =>
            tr.docChanged ? buildSemantics(next.doc) : old,
        },
        props: {
          decorations: (state) => semanticsKey.getState(state),
        },
      }),
    ]
  },
})

// ---------- Alto de fila a mano ----------

const COLUMN_EDGE_PX = 8
const ROW_EDGE_PX = 5
const ROW_MIN_PX = 18
const ROW_MAX_PX = 900

/** La fila (tr) cuyo borde inferior está bajo el puntero, si lo está. */
function rowAtBottomEdge(event: MouseEvent): HTMLTableRowElement | null {
  const cell = (event.target as HTMLElement | null)?.closest('td, th')
  const row = cell?.closest('tr')
  if (!row) return null
  const rect = row.getBoundingClientRect()
  return Math.abs(rect.bottom - event.clientY) <= ROW_EDGE_PX ? row : null
}

/**
 * Tras arrastrar una columna, las demás quedaban «automáticas» y se reajustaban solas para llenar la tabla.
 * Se fijan con su ancho actual para que cada columna sea independiente (lo que ajustas es lo que se queda).
 */
export function freezeColumnWidths(view: EditorView, table: HTMLTableElement) {
  const first = table.querySelector('tr')
  if (!first) return
  const measured = [...first.children].map((cell) =>
    Math.round(cell.getBoundingClientRect().width),
  )
  const $inside = view.state.doc.resolve(view.posAtDOM(first, 0))
  let tablePos = -1
  for (let depth = $inside.depth; depth > 0; depth -= 1)
    if ($inside.node(depth).type.name === 'table')
      tablePos = $inside.before(depth)
  if (tablePos < 0) return
  const node = view.state.doc.nodeAt(tablePos)
  if (!node) return
  const flags = { simple: true, missing: false }
  node.forEach((rowNode) =>
    rowNode.forEach((cellNode) => {
      const spans =
        Number(cellNode.attrs.colspan) > 1 || Number(cellNode.attrs.rowspan) > 1
      if (spans) flags.simple = false
      if (!cellNode.attrs.colwidth) flags.missing = true
    }),
  )
  if (!flags.simple || !flags.missing) return
  const tr = view.state.tr
  node.forEach((rowNode, rowOffset) =>
    rowNode.forEach((cellNode, cellOffset, index) => {
      const width = measured.at(index)
      if (!cellNode.attrs.colwidth && width)
        tr.setNodeMarkup(tablePos + 1 + rowOffset + 1 + cellOffset, undefined, {
          ...cellNode.attrs,
          colwidth: [width],
        })
    }),
  )
  if (tr.docChanged) view.dispatch(tr)
}

/**
 * Arrastrar el borde inferior de una fila cambia su alto (junto al ancho de columna, que ya se arrastra
 * desde el borde derecho). El alto se guarda en la fila y se respeta en el PDF; doble clic lo restablece.
 */
export const RowResize = Extension.create({
  name: 'scRowResize',
  addProseMirrorPlugins() {
    const editor = this.editor
    /** Posición (en el documento) de la fila que contiene ese elemento: es estable aunque el navegador redibuje el DOM. */
    const rowPosition = (row: HTMLTableRowElement): number | null => {
      const { view } = editor
      const inside = view.posAtDOM(row, 0)
      if (inside < 0) return null
      const $pos = view.state.doc.resolve(inside)
      for (let depth = $pos.depth; depth > 0; depth -= 1)
        if ($pos.node(depth).type.name === 'tableRow') return $pos.before(depth)
      return null
    }
    const setHeight = (pos: number | null, height: number | null) => {
      if (pos === null) return
      const { view } = editor
      const node = view.state.doc.nodeAt(pos)
      if (node?.type.name !== 'tableRow') return
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          rowHeight: height,
        }),
      )
    }
    return [
      new Plugin({
        key: new PluginKey('sc-row-resize'),
        // Antes de que empiece el arrastre de una columna se fijan los anchos de todas: así solo se mueve la que tocas
        // y la tabla crece o se encoge con ella, en lugar de repartirse el resto sola.
        view: (view) => {
          let pending = false
          const onMove = (event: MouseEvent) => {
            if (!view.editable || pending || event.buttons !== 0) return
            if (!view.dom.classList.contains('resize-cursor')) return
            const table = (event.target as HTMLElement | null)?.closest('table')
            if (!table) return
            pending = true
            // Con el puntero ya sobre un borde de columna (y antes de pulsar) se fijan los anchos de todas;
            // fijarlos al pulsar rompería el arrastre, porque las celdas se vuelven a dibujar.
            setTimeout(() => {
              pending = false
              const handle = columnResizingPluginKey.getState(
                view.state,
              )?.activeHandle
              freezeColumnWidths(view, table)
              if (typeof handle === 'number' && handle > -1)
                view.dispatch(
                  view.state.tr.setMeta(columnResizingPluginKey, {
                    setHandle: handle,
                  }),
                )
            }, 0)
          }
          // Pulsar justo sobre un borde de columna sin haber «pasado» antes por encima (un clic rápido): se activa
          // el borde a mano y, al soltar, se fijan los anchos de todas las columnas.
          const onDown = (event: MouseEvent) => {
            if (!view.editable || event.button !== 0) return
            const cellEl = (event.target as HTMLElement | null)?.closest(
              'td, th',
            )
            const table = cellEl?.closest('table')
            if (!cellEl || !table) return
            if (!view.dom.classList.contains('resize-cursor')) {
              const rect = cellEl.getBoundingClientRect()
              const nearRight = rect.right - event.clientX <= COLUMN_EDGE_PX
              if (!nearRight) return
              const inside = view.posAtDOM(cellEl, 0)
              if (inside < 0) return
              const $inside = view.state.doc.resolve(inside)
              for (let depth = $inside.depth; depth > 0; depth -= 1) {
                const name = $inside.node(depth).type.name
                if (name === 'tableCell' || name === 'tableHeader') {
                  view.dispatch(
                    view.state.tr.setMeta(columnResizingPluginKey, {
                      setHandle: $inside.before(depth),
                    }),
                  )
                  break
                }
              }
            }
            const done = () => {
              window.removeEventListener('mouseup', done)
              setTimeout(() => freezeColumnWidths(view, table), 60)
            }
            window.addEventListener('mouseup', done)
          }
          view.dom.addEventListener('mousemove', onMove)
          view.dom.addEventListener('mousedown', onDown, true)
          return {
            destroy: () => {
              view.dom.removeEventListener('mousemove', onMove)
              view.dom.removeEventListener('mousedown', onDown, true)
            },
          }
        },
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!view.editable) return false
              // El borde derecho es de las columnas: aquí solo el inferior.
              const overColumnEdge =
                view.dom.classList.contains('resize-cursor')
              const row = overColumnEdge ? null : rowAtBottomEdge(event)
              view.dom.classList.toggle('row-resize-cursor', Boolean(row))
              return false
            },
            mouseleave: (view) => {
              view.dom.classList.remove('row-resize-cursor')
              return false
            },
            dblclick: (view, event) => {
              const row = view.editable ? rowAtBottomEdge(event) : null
              if (!row) return false
              event.preventDefault()
              setHeight(rowPosition(row), null)
              return true
            },
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false
              // El borde derecho es de las columnas (ya lo gestiona su propio arrastre).
              if (view.dom.classList.contains('resize-cursor')) return false
              const row = rowAtBottomEdge(event)
              if (!row) return false
              event.preventDefault()
              const pos = rowPosition(row)
              const startY = event.clientY
              const startHeight = row.getBoundingClientRect().height
              let height = startHeight
              const move = (e: MouseEvent) => {
                height = Math.min(
                  ROW_MAX_PX,
                  Math.max(ROW_MIN_PX, startHeight + e.clientY - startY),
                )
                // El navegador puede haber redibujado la fila al pulsar: se busca de nuevo por su posición.
                const live =
                  pos === null ? row : (view.nodeDOM(pos) as HTMLElement | null)
                if (live) live.style.height = `${Math.round(height)}px`
              }
              const up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
                document.body.style.cursor = ''
                setHeight(pos, Math.round(height))
              }
              document.body.style.cursor = 'row-resize'
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
              return true
            },
          },
        },
      }),
    ]
  },
})

// ---------- Ajuste de tablas con agarres visibles ----------

/** Fija el ancho (px) de una columna concreta de la tabla que empieza en `tablePos`. */
export function applyColumnWidth(
  editor: Editor,
  tablePos: number,
  col: number,
  requested: number,
) {
  const width = Math.round(Math.min(900, Math.max(30, requested)))
  const table = editor.state.doc.nodeAt(tablePos)
  if (table?.type.name !== 'table') return
  const tableStart = tablePos + 1
  const map = TableMap.get(table)
  const tr = editor.state.tr
  for (let row = 0; row < map.height; row += 1) {
    const index = row * map.width + col
    if (row > 0 && map.map[index] === map.map[index - map.width]) continue
    const pos = map.map[index]
    const cellNode = table.nodeAt(pos)
    if (!cellNode) continue
    const attrs = cellNode.attrs as {
      colspan: number
      colwidth: number[] | null
    }
    const inner = attrs.colspan === 1 ? 0 : col - map.colCount(pos)
    const colwidth = attrs.colwidth
      ? attrs.colwidth.slice()
      : Array<number>(attrs.colspan).fill(0)
    colwidth[inner] = width
    tr.setNodeMarkup(tableStart + pos, undefined, {
      ...cellNode.attrs,
      colwidth,
    })
  }
  if (tr.docChanged) editor.view.dispatch(tr)
}

/** Fija el alto (px) de una fila concreta (posición del nodo `tableRow`); `null` = automático. */
export function applyRowHeight(
  editor: Editor,
  rowPos: number,
  requested: number | null,
) {
  const node = editor.state.doc.nodeAt(rowPos)
  if (node?.type.name !== 'tableRow') return
  const height =
    requested === null
      ? null
      : Math.round(Math.min(900, Math.max(18, requested)))
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(rowPos, undefined, {
      ...node.attrs,
      rowHeight: height,
    }),
  )
}

/** Posición del documento de la tabla (`table`) y de la fila (`tableRow`) que contienen ese elemento. */
export function tableRowPositions(
  editor: Editor,
  element: HTMLElement,
): { tablePos: number; rowPos: number | null } | null {
  const inside = editor.view.posAtDOM(element, 0)
  if (inside < 0) return null
  const $pos = editor.state.doc.resolve(inside)
  let tablePos: number | null = null
  let rowPos: number | null = null
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === 'tableRow' && rowPos === null) rowPos = $pos.before(depth)
    if (name === 'table') {
      tablePos = $pos.before(depth)
      break
    }
  }
  return tablePos === null ? null : { tablePos, rowPos }
}
