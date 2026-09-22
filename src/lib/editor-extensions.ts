import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/core'
import type { DOMOutputSpec, Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { decodeAttr, encodeAttr, parseOrg } from '#/lib/diagrams'
import type { ChartItem, OrgNode } from '#/lib/diagrams'
import {
  chartSpecOf,
  chartTree,
  isSvgTag,
  normalizeChartSpec,
} from '#/lib/charts'
import type { ChartNode, ChartSpec } from '#/lib/charts'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import {
  Color,
  FontSize,
  LineHeight,
  TextStyle,
} from '@tiptap/extension-text-style'
import { TaskItem, TaskList } from '@tiptap/extension-list'

/** Colores de marca disponibles para texto, resaltado y celdas. */
export const TEXT_COLORS = [
  { value: '#1b1b3a', label: 'Tinta' },
  { value: '#1e1a6b', label: 'Azul marino' },
  { value: '#3f78b5', label: 'Azul' },
  { value: '#c2542b', label: 'Rojo' },
  { value: '#2f9a5d', label: 'Verde' },
  { value: '#b7791f', label: 'Ámbar' },
  { value: '#6a70a0', label: 'Gris' },
  { value: '#ffffff', label: 'Blanco' },
  { value: '#9fc4ee', label: 'Celeste de marca' },
  { value: '#e0a91b', label: 'Dorado' },
] as const

export const HIGHLIGHT_COLORS = [
  { value: '#fff3b0', label: 'Amarillo' },
  { value: '#d7e9fb', label: 'Celeste' },
  { value: '#d5f0e0', label: 'Verde' },
  { value: '#fbdcd0', label: 'Rosa' },
  { value: '#e4e2f5', label: 'Lila' },
] as const

export const CELL_COLORS = [
  { value: '#e9ecf6', label: 'Gris azulado' },
  { value: '#d7e9fb', label: 'Celeste' },
  { value: '#d5f0e0', label: 'Verde' },
  { value: '#fff3b0', label: 'Amarillo' },
  { value: '#fbdcd0', label: 'Rosa' },
  { value: '#fdeeb8', label: 'Dorado suave' },
  { value: '#1e1a6b', label: 'Azul marino' },
  { value: '#f3f4fb', label: 'Campo de formulario' },
] as const

const HEX = /^#[0-9a-fA-F]{6}$/

/** Bloque de aviso con los colores de marca (info / advertencia / correcto). */
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-tone') ?? 'info',
        renderHTML: (attributes) => ({
          'data-tone': attributes.tone as string,
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0]
  },
})

/**
 * Puntos de firma: una fila de 1 a 3 firmantes. Cada uno lleva su línea para firmar (el espacio de arriba se
 * imprime en blanco) y una leyenda editable debajo, por ejemplo «Firma del jugador» y «Nombre y cédula».
 */
const SignatureItem = Node.create({
  name: 'signature',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-signature]' }]
  },
  renderHTML() {
    return ['div', { 'data-signature': '' }, 0]
  },
})

const Signatures = Node.create({
  name: 'signatures',
  group: 'block',
  content: 'signature{1,3}',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-signatures]' }]
  },
  renderHTML() {
    return ['div', { 'data-signatures': '' }, 0]
  },
})

/** Contenido de un bloque de firmas con las leyendas dadas (una por firmante). */
export function signaturesContent(
  labels: ReadonlyArray<readonly string[]>,
): JSONContent {
  return {
    type: 'signatures',
    content: labels.map((lines) => ({
      type: 'signature',
      content: lines.map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
    })),
  }
}

/** Salto de página manual: lo que sigue empieza en la hoja siguiente. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },
  renderHTML() {
    return ['div', { 'data-page-break': '' }]
  },
})

/**
 * Transacción que inserta un salto de página como en Google Docs: lo que hay después del cursor pasa a la
 * hoja nueva y el cursor queda al principio de ella. Dentro de listas, tablas o avisos el salto va después
 * de ese bloque. Devuelve null dentro de un bloque de código (allí Ctrl+Enter conserva su función).
 */
export function pageBreakTransaction(state: EditorState): Transaction | null {
  const { pageBreak, paragraph } = state.schema.nodes
  if (state.selection.$from.parent.type.spec.code) return null
  const tr = state.tr
  if (!state.selection.empty) tr.deleteSelection()
  const $pos = tr.selection.$from
  let at: number
  if ($pos.depth === 1 && $pos.parent.isTextblock) {
    const offset = $pos.parentOffset
    if (offset === 0) {
      // Al principio de la línea: el salto va encima y la línea pasa a la hoja nueva.
      at = $pos.before()
      tr.insert(at, pageBreak.create())
    } else if (offset === $pos.parent.content.size) {
      // Al final: el salto va debajo y el cursor queda en una línea vacía de la hoja nueva.
      at = $pos.after()
      tr.insert(at, [pageBreak.create(), paragraph.create()])
    } else {
      // En medio: se parte el párrafo y el resto del texto pasa a la hoja nueva.
      tr.split($pos.pos)
      at = $pos.pos + 1
      tr.insert(at, pageBreak.create())
    }
  } else {
    at = $pos.depth >= 1 ? $pos.after(1) : tr.selection.to
    tr.insert(at, [pageBreak.create(), paragraph.create()])
  }
  // El salto ocupa 1 posición y el párrafo siguiente abre otra: el cursor queda dentro de él.
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2)))
  return tr.scrollIntoView()
}

/** Inserta un salto de página en el cursor (Ctrl+Enter, menú Insertar y «/»). */
export function insertPageBreak(editor: Editor): boolean {
  // Se parte del estado de la vista, que es al que se aplicará la transacción.
  const tr = pageBreakTransaction(editor.view.state)
  if (!tr) return false
  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}

const cellBackground = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const match = /background-color:\s*(#[0-9a-fA-F]{6})/.exec(
        element.getAttribute('style') ?? '',
      )
      return match ? match[1] : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const color = attributes.backgroundColor
      return typeof color === 'string' && HEX.test(color)
        ? { style: `background-color: ${color}` }
        : {}
    },
  },
}

// La fórmula solo vive en el JSON del editor; en el HTML queda el resultado ya calculado.
const cellFormula = {
  formula: { default: null, renderHTML: () => ({}), parseHTML: () => null },
  formulaFormat: {
    default: 'number',
    renderHTML: () => ({}),
    parseHTML: () => 'number',
  },
}

const CellWithColor = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBackground, ...cellFormula }
  },
})

const HeaderWithColor = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellBackground, ...cellFormula }
  },
})

export const BORDER_WIDTHS = [
  { value: 'none', label: 'Sin líneas' },
  { value: '1', label: 'Fina' },
  { value: '2', label: 'Media' },
  { value: '3', label: 'Gruesa' },
] as const

export const BORDER_COLORS = [
  { value: 'gray', label: 'Gris', swatch: '#9aa0b8' },
  { value: 'navy', label: 'Azul marino', swatch: '#1e1a6b' },
  { value: 'ink', label: 'Negro', swatch: '#1b1b3a' },
  {
    value: 'paper',
    label: 'Color del papel (separa sin línea)',
    swatch: '#faf9f6',
  },
] as const

const BORDER_WIDTH_VALUES: ReadonlyArray<string> = BORDER_WIDTHS.map(
  (b) => b.value,
)
const BORDER_COLOR_VALUES: ReadonlyArray<string> = BORDER_COLORS.map(
  (b) => b.value,
)

/**
 * Tabla con grosor y color de líneas. Como la tabla redimensionable dibuja su propio DOM,
 * los atributos se aplican al contenedor con decoraciones (`data-border`, `data-border-color`).
 */
const bordersKey = new PluginKey<DecorationSet>('sc-table-borders')

function buildBorders(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') {
      // Las tablas viven entre bloques: dentro de un bloque de texto no hay nada que recorrer.
      return !node.isTextblock
    }
    const attrs: Record<string, string> = {}
    if (typeof node.attrs.borderWidth === 'string')
      attrs['data-border'] = node.attrs.borderWidth
    if (typeof node.attrs.borderColor === 'string')
      attrs['data-border-color'] = node.attrs.borderColor
    if (Object.keys(attrs).length > 0)
      decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs))
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/** Fila con alto propio (px): se ajusta arrastrando el borde inferior de la fila. */
const TableRowWithHeight = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: (element) => {
          const match = /height:\s*(\d+(?:\.\d+)?)px/.exec(
            element.getAttribute('style') ?? '',
          )
          return match ? Math.round(Number(match[1])) : null
        },
        renderHTML: (attributes) =>
          typeof attributes.rowHeight === 'number'
            ? { style: `height: ${attributes.rowHeight}px` }
            : {},
      },
    }
  },
})

const TableWithBorders = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderWidth: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-border')
          return value && BORDER_WIDTH_VALUES.includes(value) ? value : null
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.borderWidth === 'string'
            ? { 'data-border': attributes.borderWidth }
            : {},
      },
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-border-color')
          return value && BORDER_COLOR_VALUES.includes(value) ? value : null
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.borderColor === 'string'
            ? { 'data-border-color': attributes.borderColor }
            : {},
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: bordersKey,
        // Solo se reconstruye cuando cambia el documento; una selección reutiliza el conjunto anterior.
        state: {
          init: (_config, state) => buildBorders(state.doc),
          apply: (tr, old, _previous, next) =>
            tr.docChanged ? buildBorders(next.doc) : old,
        },
        props: {
          decorations: (state) => bordersKey.getState(state),
        },
      }),
    ]
  },
})

/**
 * Número de palabras de un texto (trozos separados por espacios en blanco), igual que
 * `text.trim().split(/\s+/).filter(Boolean).length` pero sin crear el array de palabras.
 */
export function countWords(text: string): number {
  const word = /\S+/g
  let count = 0
  while (word.exec(text)) count += 1
  return count
}

/** Las imágenes antiguas terminaban en .png/.jpg; ahora la URL no lleva extensión. */
export const imageSrc = (src: string | null | undefined): string =>
  (src ?? '').replace(
    /^(\/api\/imagenes\/[A-Za-z0-9_-]+)\.(?:png|jpe?g|webp|gif)$/,
    '$1',
  )

/** Anchos antiguos (64, "64") eran píxeles; los nuevos son porcentajes. */
export const cssWidth = (value: unknown): string => {
  if (typeof value === 'number') return `${value}px`
  if (typeof value !== 'string') return '100%'
  if (/^\d+$/.test(value)) return `${value}px`
  return /^\d+(\.\d+)?(px|%)$/.test(value) ? value : '100%'
}

export const IMAGE_WIDTHS = ['25%', '50%', '75%', '100%'] as const
export const IMAGE_ALIGNS = ['left', 'center', 'right'] as const

/** Imagen con tamaño, alineación y pie de foto. Se guarda como <figure>. */
const FigureImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: '100%' },
      align: { default: 'center' },
      caption: { default: null },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'figure.sc-figure',
        getAttrs: (element) => {
          const figure = element
          const img = figure.querySelector('img')
          if (!img) return false
          const width = /width:\s*(\d+%)/.exec(
            figure.getAttribute('style') ?? '',
          )
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            width: width ? width[1] : '100%',
            align: figure.getAttribute('data-align') ?? 'center',
            caption: figure.querySelector('figcaption')?.textContent ?? null,
          }
        },
      },
      { tag: 'img[src]', getAttrs: () => ({}) },
    ]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      const dom = document.createElement('figure')
      dom.className = 'sc-figure'
      const img = document.createElement('img')
      img.draggable = false
      const caption = document.createElement('figcaption')
      const left = document.createElement('span')
      left.className = 'sc-resize sc-resize-l'
      const right = document.createElement('span')
      right.className = 'sc-resize sc-resize-r'
      const badge = document.createElement('span')
      badge.className = 'sc-resize-badge'
      dom.append(img, caption, left, right, badge)

      const apply = (n: typeof node) => {
        const attrs = n.attrs as Record<string, string | null>
        dom.dataset.align = attrs.align ?? 'center'
        dom.style.width = cssWidth(attrs.width)
        // Solo se reasigna si cambió: así no se pisa el respaldo de carga (ver ImageFallback).
        const nextSrc = imageSrc(attrs.src)
        if (img.dataset.srcAttr !== nextSrc) {
          img.dataset.srcAttr = nextSrc
          img.src = nextSrc
        }
        img.alt = attrs.alt ?? ''
        caption.textContent = attrs.caption ?? ''
        caption.style.display = attrs.caption ? '' : 'none'
      }
      apply(node)

      const startResize = (event: PointerEvent, side: 'l' | 'r') => {
        event.preventDefault()
        event.stopPropagation()
        const parent = dom.parentElement
        if (!parent) return
        const parentWidth = parent.clientWidth
        const startWidth = dom.getBoundingClientRect().width
        const startX = event.clientX
        const centered = dom.dataset.align === 'center'
        let percent = Math.round((startWidth / parentWidth) * 100)
        dom.classList.add('is-resizing')

        const move = (e: PointerEvent) => {
          const delta = (side === 'r' ? 1 : -1) * (e.clientX - startX)
          const next = startWidth + delta * (centered ? 2 : 1)
          percent = Math.min(
            100,
            Math.max(10, Math.round((next / parentWidth) * 100)),
          )
          dom.style.width = `${percent}%`
          badge.textContent = `${percent}%`
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          dom.classList.remove('is-resizing')
          const pos = getPos()
          if (typeof pos !== 'number') return
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...current.attrs,
              width: `${percent}%`,
            }),
          )
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }
      left.addEventListener('pointerdown', (e) => startResize(e, 'l'))
      right.addEventListener('pointerdown', (e) => startResize(e, 'r'))

      return {
        dom,
        update(updated) {
          if (updated.type !== current.type) return false
          current = updated
          apply(updated)
          return true
        },
        selectNode() {
          dom.classList.add('ProseMirror-selectednode')
        },
        deselectNode() {
          dom.classList.remove('ProseMirror-selectednode')
        },
        stopEvent: (event) =>
          (event.target as HTMLElement).classList.contains('sc-resize'),
        ignoreMutation: () => true,
      }
    }
  },
  renderHTML({ node }) {
    const { src, alt, title, width, align, caption } = node.attrs
    const figureAttrs = {
      class: 'sc-figure',
      'data-align': align ?? 'center',
      style: `width: ${cssWidth(width)}`,
    }
    const img = ['img', { src: imageSrc(src), alt, title }] as const
    return caption
      ? ['figure', figureAttrs, img, ['figcaption', {}, caption]]
      : ['figure', figureAttrs, img]
  },
})

const orgSpec = (nodes: OrgNode[]): DOMOutputSpec => [
  'ul',
  {},
  ...nodes.map((n): DOMOutputSpec => [
    'li',
    {},
    [
      'span',
      { class: 'sc-org-node' },
      ['strong', {}, n.name],
      ...(n.role ? [['small', {}, n.role] as DOMOutputSpec] : []),
    ],
    ...(n.children.length ? [orgSpec(n.children)] : []),
  ]),
]

/** Organigrama: se edita como texto con sangría y se dibuja como árbol. */
export const OrgChart = Node.create({
  name: 'orgChart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      text: { default: 'Dirección | Gerente general\n  Área | Responsable' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-org]',
        getAttrs: (element) => ({
          text: decodeAttr<string>(element.getAttribute('data-org'), ''),
        }),
      },
    ]
  },
  renderHTML({ node }) {
    const text = node.attrs.text as string
    return [
      'div',
      { class: 'sc-org', 'data-org': encodeAttr(text) },
      orgSpec(parseOrg(text)),
    ]
  },
})

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Convierte un elemento del gráfico a la descripción de DOM de ProseMirror (SVG con su espacio de nombres). */
const chartElementSpec = (node: ChartNode): DOMOutputSpec => {
  const attrs = Object.fromEntries(
    Object.entries(node.a ?? {}).map(([key, value]) => [key, String(value)]),
  )
  return [
    isSvgTag(node.tag) ? `${SVG_NS} ${node.tag}` : node.tag,
    attrs,
    ...(node.kids ?? []).map((kid) =>
      typeof kid === 'string' ? kid : chartElementSpec(kid),
    ),
  ]
}

/**
 * Gráfico (columnas, barras, apiladas, líneas, área, circular o anillo) dibujado en SVG, para que
 * salga igual en el editor y en el PDF. Los gráficos antiguos (`kind`/`title`/`items`) se siguen
 * leyendo y se convierten al abrirlos; los nuevos guardan todo en `spec`.
 */
export const Chart = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      spec: { default: null as ChartSpec | null },
      kind: { default: 'bars' },
      title: { default: '' },
      items: { default: [] as ChartItem[] },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-chart]',
        getAttrs: (element) => {
          const spec = element.getAttribute('data-chart-spec')
          if (spec) {
            const parsed = decodeAttr<unknown>(spec, null)
            if (parsed) {
              const normal = normalizeChartSpec(parsed)
              return {
                spec: normal,
                kind: normal.kind,
                title: normal.title,
                items: [],
              }
            }
          }
          const data = decodeAttr<{ title: string; items: ChartItem[] }>(
            element.getAttribute('data-chart-items'),
            { title: '', items: [] },
          )
          return {
            spec: null,
            kind: element.getAttribute('data-chart') ?? 'bars',
            title: data.title,
            items: data.items,
          }
        },
      },
    ]
  },
  renderHTML({ node }) {
    return chartElementSpec(chartTree(chartSpecOf(node.attrs)))
  },
})

/** Índice automático: en el editor se actualiza solo; al exportar se genera con los títulos. */
export const TocBlock = Node.create({
  name: 'tocBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-toc]' }]
  },
  renderHTML() {
    return ['div', { 'data-toc': '' }]
  },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div')
      dom.className = 'sc-toc'
      dom.setAttribute('data-toc', '')
      type TocEntry = { text: string; l3: boolean }
      const headingsOf = () => {
        const list: TocEntry[] = []
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'heading' && node.textContent.trim())
            list.push({
              text: node.textContent.trim(),
              l3: node.attrs.level === 3,
            })
          // Los títulos son bloques de texto: no hay nada que buscar dentro.
          return !node.isTextblock
        })
        return list
      }
      let shown: TocEntry[] | null = null
      const render = () => {
        const list = headingsOf()
        // Si los títulos (texto y nivel) no cambiaron, el DOM ya está al día.
        if (
          shown &&
          shown.length === list.length &&
          shown.every((e, i) => e.text === list[i].text && e.l3 === list[i].l3)
        )
          return
        shown = list
        dom.replaceChildren()
        const title = document.createElement('div')
        title.className = 'sc-toc-title'
        title.textContent = 'Contenido'
        dom.append(title)
        for (const entry of list) {
          const item = document.createElement('div')
          item.className = 'sc-toc-item' + (entry.l3 ? ' sc-toc-l3' : '')
          item.textContent = entry.text
          dom.append(item)
        }
        if (list.length === 0) {
          const empty = document.createElement('div')
          empty.className = 'sc-toc-item'
          empty.textContent =
            'Añade títulos y subtítulos para generar el índice.'
          dom.append(empty)
        }
      }
      render()
      // Se regenera tras una pausa al editar, no en cada pulsación.
      let timer: ReturnType<typeof setTimeout> | null = null
      const later = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (!editor.isDestroyed) render()
        }, 250)
      }
      editor.on('update', later)
      return {
        dom,
        ignoreMutation: () => true,
        destroy: () => {
          editor.off('update', later)
          if (timer) clearTimeout(timer)
        },
      }
    }
  },
})

/** Esquema compartido por el editor (navegador) y la importación de documentos (servidor). */
export const SCHEMA_EXTENSIONS = [
  // Los enlaces no llevan target: el saneado añade target=_blank solo a los externos.
  StarterKit.configure({
    link: { openOnClick: false, HTMLAttributes: { target: null, rel: null } },
  }),
  TableWithBorders.configure({
    resizable: true,
    handleWidth: 8,
    cellMinWidth: 40,
    lastColumnResizable: true,
  }),
  TableRowWithHeight,
  HeaderWithColor,
  CellWithColor,
  Callout,
  PageBreak,
  Signatures,
  SignatureItem,
  FigureImage,
  TextStyle,
  Color,
  FontSize,
  LineHeight,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  OrgChart,
  Chart,
  TocBlock,
]
