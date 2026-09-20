import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

const IN = 96
/** Alto útil de una página: carta (11 in) menos márgenes superior (1.05 in) e inferior (0.85 in). */
export const PAGE_CONTENT_PX = 9.1 * IN
export const FOOT_PX = 0.85 * IN
export const HEAD_PX = 1.05 * IN
export const DESK_GAP_PX = 40
/** Lo que ocupa el "cambio de hoja" además del espacio en blanco que sobra: pie + hueco + cabecera. */
export const PAGE_CHROME_PX = FOOT_PX + DESK_GAP_PX + HEAD_PX

type BreakTag = 'div' | 'tr' | 'li'
type PageBreak = {
  pos: number
  tag: BreakTag
  cols: number
  fill: number
  page: number
  /** HTML de la fila de cabecera de la tabla, que se repite al empezar la hoja siguiente. */
  head: string | null
  headH: number
}
type PaginationState = { breaks: PageBreak[]; pages: number }

export type PaginationOptions = {
  getRegion: () => HTMLElement | null
  getTitle: () => string
  onPages: (pages: number) => void
}

const key = new PluginKey<PaginationState>('sc-pagination')
const titleSync = new WeakMap<EditorView, () => void>()

type Unit = {
  pos: number
  tag: BreakTag
  cols: number
  top: number
  bottom: number
  keepNext: boolean
  forced?: boolean
  head: string | null
  headH: number
}

function buildGap(b: PageBreak, pages: number, title: string) {
  const gap = document.createElement('div')
  gap.className = 'page-gap'
  gap.contentEditable = 'false'
  gap.style.height = `${b.fill + PAGE_CHROME_PX}px`

  const fill = document.createElement('div')
  fill.style.height = `${b.fill}px`

  const foot = document.createElement('div')
  foot.className = 'pg-foot'
  foot.style.height = `${FOOT_PX}px`
  const bar = document.createElement('div')
  bar.className = 'pg-bar'
  const left = document.createElement('div')
  const leftTitle = document.createElement('div')
  leftTitle.className = 'pg-bar-title'
  leftTitle.textContent = title
  const brand = document.createElement('div')
  brand.className = 'pg-bar-club'
  brand.textContent = 'Sport City Club'
  left.append(leftTitle, brand)
  const right = document.createElement('div')
  right.className = 'pg-bar-right'
  const line1 = document.createElement('div')
  const phone = document.createElement('b')
  phone.textContent = '5865-1010'
  line1.append(phone, document.createTextNode(' · info@sportcityclub.com'))
  const line2 = document.createElement('div')
  line2.textContent = `www.sportcitynic.com · Página ${b.page} de ${pages}`
  right.append(line1, line2)
  bar.append(left, right)
  foot.append(bar)

  const desk = document.createElement('div')
  desk.className = 'pg-desk'
  desk.style.height = `${DESK_GAP_PX}px`

  const head = document.createElement('div')
  head.className = 'pg-head'
  head.style.height = `${HEAD_PX}px`
  const headRow = document.createElement('div')
  headRow.className = 'pg-head-row'
  const logo = document.createElement('img')
  logo.src = '/brand/logo-mark.png'
  logo.alt = ''
  const name = document.createElement('span')
  name.className = 'pg-head-name'
  const nameLogo = document.createElement('img')
  nameLogo.src = '/brand/logo-mark.png'
  nameLogo.alt = ''
  const wordmark = document.createElement('span')
  wordmark.className = 'pg-wm'
  const wmTitle = document.createElement('b')
  wmTitle.textContent = 'Sport City'
  const wmSub = document.createElement('i')
  wmSub.textContent = 'Club'
  wordmark.append(wmTitle, wmSub)
  name.append(nameLogo, wordmark)
  const headTitle = document.createElement('span')
  headTitle.className = 'pg-head-title'
  headTitle.textContent = title
  headRow.append(name, headTitle)
  head.append(headRow)

  const tail = document.createElement('div')
  tail.className = 'pg-tail'
  tail.append(fill, foot)
  gap.append(tail, desk, head)

  if (b.tag === 'tr') {
    const tr = document.createElement('tr')
    tr.className = 'page-gap-row'
    const td = document.createElement('td')
    td.colSpan = b.cols
    td.className = 'page-gap-cell'
    td.append(gap)
    tr.append(td)
    return tr
  }
  if (b.tag === 'li') {
    const li = document.createElement('li')
    li.className = 'page-gap-li'
    li.append(gap)
    return li
  }
  return gap
}

function buildHeadClone(b: PageBreak) {
  if (!b.head) return document.createElement('tr')
  const template = document.createElement('template')
  template.innerHTML = `<table><tbody>${b.head}</tbody></table>`
  const tr =
    template.content.querySelector('tr') ?? document.createElement('tr')
  tr.querySelectorAll('.column-resize-handle').forEach((el) => el.remove())
  tr.classList.add('page-gap-head')
  tr.contentEditable = 'false'
  return tr
}

function collectUnits(view: EditorView, natural: (y: number) => number) {
  const units: Unit[] = []
  const rectOf = (pos: number) => {
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return null
    const r = dom.getBoundingClientRect()
    return { top: natural(r.top), bottom: natural(r.bottom) }
  }

  view.state.doc.forEach((node, offset) => {
    const name = node.type.name
    if (name === 'table') {
      const rows: Unit[] = []
      let cols = 1
      node.forEach((row, rowOffset) => {
        const pos = offset + 1 + rowOffset
        const rect = rectOf(pos)
        if (!rect) return
        if (rows.length === 0) {
          let count = 0
          row.forEach((cell) => {
            count += Number(cell.attrs.colspan ?? 1)
          })
          cols = Math.max(1, count)
        }
        rows.push({
          pos,
          tag: 'tr',
          cols,
          ...rect,
          keepNext: false,
          head: null,
          headH: 0,
        })
      })
      // La fila de cabecera nunca se queda sola al final de una página: viaja con la siguiente.
      if (
        rows.length > 1 &&
        node.firstChild?.firstChild?.type.name === 'tableHeader'
      ) {
        rows[0].keepNext = true
        // Si la tabla se corta, la cabecera se repite en la hoja siguiente.
        const headDom = view.nodeDOM(rows[0].pos)
        if (headDom instanceof HTMLElement) {
          const html = headDom.outerHTML
          const headH = rows[0].bottom - rows[0].top
          rows.slice(1).forEach((row) => {
            row.head = html
            row.headH = headH
          })
        }
      }
      units.push(...rows)
      return
    }
    if (name === 'bulletList' || name === 'orderedList') {
      node.forEach((_item, itemOffset) => {
        const pos = offset + 1 + itemOffset
        const rect = rectOf(pos)
        if (rect)
          units.push({
            pos,
            tag: 'li',
            cols: 1,
            ...rect,
            keepNext: false,
            head: null,
            headH: 0,
          })
      })
      return
    }
    const rect = rectOf(offset)
    if (rect)
      units.push({
        pos: offset,
        tag: 'div',
        cols: 1,
        ...rect,
        keepNext: name === 'heading',
        forced: name === 'pageBreak',
        head: null,
        headH: 0,
      })
  })
  return units
}

/**
 * Coordenadas "naturales": como si no hubiera huecos de cambio de hoja. Con la suma acumulada de
 * alturas y una búsqueda binaria cada consulta cuesta O(log huecos) en vez de recorrerlos todos.
 */
export function makeNatural(
  gaps: Array<{ top: number; height: number }>,
  regionTop: number,
) {
  // Los huecos salen en orden de documento (= de arriba abajo); solo se ordena si algo lo alterara.
  const sorted = gaps.every((g, i) => i === 0 || gaps[i - 1].top <= g.top)
    ? gaps
    : [...gaps].sort((a, b) => a.top - b.top)
  const tops = sorted.map((g) => g.top)
  const acc: number[] = [0]
  sorted.forEach((g, i) => acc.push(acc[i] + g.height))
  return (viewportY: number) => {
    const limit = viewportY - 0.5
    // Número de huecos con top < limit.
    let lo = 0
    let hi = tops.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tops[mid] < limit) lo = mid + 1
      else hi = mid
    }
    return viewportY - regionTop - acc[lo]
  }
}

function measure(view: EditorView, options: PaginationOptions) {
  const region = options.getRegion()
  if (!region || view.isDestroyed) return null
  const regionTop = region.getBoundingClientRect().top
  const gaps = Array.from(
    view.dom.querySelectorAll<HTMLElement>('.page-gap, tr.page-gap-head'),
  ).map((g) => {
    const r = g.getBoundingClientRect()
    return { top: r.top, height: r.height }
  })
  const natural = makeNatural(gaps, regionTop)

  const units = collectUnits(view, natural)
  const breaks: PageBreak[] = []
  let offset = 0
  let page = 0
  let limit = PAGE_CONTENT_PX

  units.forEach((unit, index) => {
    let top = unit.top + offset
    let bottom = unit.bottom + offset
    if (unit.forced) {
      // Salto manual: rellena lo que queda de la hoja y lo siguiente empieza en la próxima.
      const fill = Math.max(0, Math.round(limit - top))
      breaks.push({
        pos: unit.pos,
        tag: 'div',
        cols: 1,
        fill,
        page: page + 1,
        head: null,
        headH: 0,
      })
      offset += fill
      page += 1
      limit += PAGE_CONTENT_PX
      return
    }
    let fitBottom = bottom
    if (unit.keepNext && units[index + 1]) {
      const joined = units[index + 1].bottom + offset
      if (joined - top <= PAGE_CONTENT_PX) fitBottom = joined
    }
    if (bottom - top > PAGE_CONTENT_PX) {
      // Más alto que una página entera: no se puede evitar que la cruce.
      while (bottom > limit) {
        page += 1
        limit += PAGE_CONTENT_PX
      }
      return
    }
    while (fitBottom > limit) {
      const fill = Math.max(0, Math.round(limit - top))
      breaks.push({
        pos: unit.pos,
        tag: unit.tag,
        cols: unit.cols,
        fill,
        page: page + 1,
        head: unit.head,
        headH: unit.headH,
      })
      const shift = fill + unit.headH
      offset += shift
      top += shift
      bottom += shift
      fitBottom += shift
      page += 1
      limit += PAGE_CONTENT_PX
    }
  })

  return { breaks, pages: page + 1 }
}

const sameBreaks = (a: PageBreak[], b: PageBreak[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i]
    return (
      x.pos === y.pos &&
      x.tag === y.tag &&
      x.cols === y.cols &&
      x.page === y.page &&
      x.head === y.head &&
      Math.abs(x.fill - y.fill) < 1
    )
  })

/** Paginación real del editor: los bloques, filas de tabla y elementos de lista que no caben saltan enteros a la hoja siguiente. */
export const Pagination = Extension.create<PaginationOptions>({
  name: 'scPagination',
  addOptions() {
    return {
      getRegion: () => null,
      getTitle: () => '',
      onPages: () => undefined,
    }
  },
  addProseMirrorPlugins() {
    const options = this.options
    let cached: {
      value: PaginationState
      doc: EditorView['state']['doc']
      set: DecorationSet
    } | null = null
    return [
      new Plugin<PaginationState>({
        key,
        state: {
          init: () => ({ breaks: [], pages: 1 }),
          apply(tr, value) {
            const meta = tr.getMeta(key) as
              { breaks: PageBreak[]; pages: number } | undefined
            if (meta) return { breaks: meta.breaks, pages: meta.pages }
            if (tr.docChanged)
              return {
                ...value,
                breaks: value.breaks.map((b) => ({
                  ...b,
                  pos: tr.mapping.map(b.pos, -1),
                })),
              }
            return value
          },
        },
        props: {
          decorations(state) {
            const value = key.getState(state)
            if (!value || value.breaks.length === 0) return DecorationSet.empty
            // Sin cambios de saltos ni de documento (p. ej. solo la selección) se reutiliza el mismo conjunto.
            if (cached && cached.value === value && cached.doc === state.doc)
              return cached.set
            const widgets = value.breaks
              .filter((b) => b.pos >= 0 && b.pos <= state.doc.content.size)
              .flatMap((b) => {
                const list = [
                  Decoration.widget(
                    b.pos,
                    // El título se lee al crear el DOM y se actualiza en vivo (ver refreshPagination): no va en la clave.
                    () =>
                      buildGap(
                        b,
                        value.pages,
                        options.getTitle() || 'Documento',
                      ),
                    {
                      side: -2,
                      ignoreSelection: true,
                      key: `${b.tag}-${b.fill}-${b.page}-${value.pages}`,
                    },
                  ),
                ]
                if (b.tag === 'tr' && b.head)
                  list.push(
                    Decoration.widget(b.pos, () => buildHeadClone(b), {
                      side: -1,
                      ignoreSelection: true,
                      key: `head-${b.page}-${b.head}`,
                    }),
                  )
                return list
              })
            const set = DecorationSet.create(state.doc, widgets)
            cached = { value, doc: state.doc, set }
            return set
          },
        },
        view(view) {
          let frame = 0
          const run = () => {
            frame = 0
            const result = measure(view, options)
            if (!result) return
            const current = key.getState(view.state)
            options.onPages(result.pages)
            if (
              current &&
              current.pages === result.pages &&
              sameBreaks(current.breaks, result.breaks)
            )
              return
            view.dispatch(view.state.tr.setMeta(key, result))
          }
          // Una sola medición por fotograma: medir fuerza el layout y no compensa hacerlo en cada pulsación.
          const schedule = () => {
            if (frame) return
            frame = requestAnimationFrame(run)
          }
          const syncTitles = () => {
            const title = options.getTitle() || 'Documento'
            view.dom
              .querySelectorAll('.pg-bar-title, .pg-head-title')
              .forEach((el) => {
                if (el.textContent !== title) el.textContent = title
              })
          }
          titleSync.set(view, syncTitles)
          const resize = new ResizeObserver(schedule)
          resize.observe(view.dom)
          const onLoad = () => schedule()
          view.dom.addEventListener('load', onLoad, true)
          void document.fonts.ready.then(schedule)
          schedule()
          return {
            // Solo un cambio del documento altera la paginación; las selecciones no se miden
            // (el tamaño, las fuentes y las imágenes ya avisan por su cuenta).
            update(current, prev) {
              if (prev.doc !== current.state.doc) schedule()
            },
            destroy() {
              if (frame) cancelAnimationFrame(frame)
              titleSync.delete(view)
              resize.disconnect()
              view.dom.removeEventListener('load', onLoad, true)
            },
          }
        },
      }),
    ]
  },
})

/** Repinta el título en las cabeceras y pies de los saltos ya dibujados (sin reconstruirlos). */
export function refreshPagination(view: EditorView) {
  titleSync.get(view)?.()
}
