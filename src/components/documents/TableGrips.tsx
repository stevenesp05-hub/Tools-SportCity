import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  applyColumnWidth,
  applyRowHeight,
  freezeColumnWidths,
  tableRowPositions,
} from '#/components/documents/editor-extras'
import { PAGE_CONTENT_PX } from '#/components/documents/pagination'
import { cn } from '#/lib/utils'

type Layout = {
  table: HTMLTableElement
  rect: DOMRect
  /** Zona visible del documento: los agarres no se pintan fuera de ella (p. ej. bajo la barra de herramientas). */
  clip: DOMRect
  columns: number[] // borde derecho de cada columna (x)
  rows: number[] // borde inferior de cada fila (y)
}

const GRIP = 12 // zona de agarre en px
const MIN_COL = 30
const MIN_ROW = 18

/**
 * Agarres visibles sobre los bordes de la tabla (barras de color): arrastrar uno cambia el ancho de esa columna
 * o el alto de esa fila. Son elementos reales con eventos de puntero, así que funcionan igual en cualquier
 * navegador (no dependen de que el cursor «acierte» un borde invisible).
 */
export function TableGrips({ editor }: { editor: Editor }) {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const hovered = useRef<HTMLTableElement | null>(null)
  const overGrips = useRef(false)
  const dragging = useRef(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const measure = useCallback(() => {
    if (editor.isDestroyed || !editor.isEditable) return setLayout(null)
    let table = hovered.current
    if (!table?.isConnected) {
      // Sin ratón encima: la tabla donde está el cursor, si lo está.
      const { from } = editor.state.selection
      const node = editor.view.domAtPos(from).node
      const el = node instanceof HTMLElement ? node : node.parentElement
      table = (el?.closest('table') as HTMLTableElement | null) ?? null
    }
    if (!table?.isConnected) return setLayout(null)
    const first = table.rows.item(0)
    if (!first) return setLayout(null)
    setLayout({
      table,
      rect: table.getBoundingClientRect(),
      clip: (
        editor.view.dom.closest('.overflow-auto') ?? document.body
      ).getBoundingClientRect(),
      columns: [...first.cells].map((c) => c.getBoundingClientRect().right),
      rows: [...table.rows].map((r) => r.getBoundingClientRect().bottom),
    })
  }, [editor])

  useEffect(() => {
    const dom = editor.view.dom
    const over = (event: MouseEvent) => {
      const table = (event.target as HTMLElement | null)?.closest('table')
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
      if (table && dom.contains(table)) {
        hovered.current = table
        measure()
      }
    }
    const leave = () => {
      leaveTimer.current = setTimeout(() => {
        if (overGrips.current || dragging.current) return
        hovered.current = null
        measure()
      }, 250)
    }
    dom.addEventListener('mouseover', over)
    dom.addEventListener('mouseleave', leave)
    editor.on('update', measure)
    editor.on('selectionUpdate', measure)
    window.addEventListener('resize', measure)
    document.addEventListener('scroll', measure, true)
    return () => {
      dom.removeEventListener('mouseover', over)
      dom.removeEventListener('mouseleave', leave)
      editor.off('update', measure)
      editor.off('selectionUpdate', measure)
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [editor, measure])

  function startColumn(event: React.PointerEvent, index: number) {
    if (!layout) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    const { table } = layout
    dragging.current = true
    setActive(`c${index}`)
    // Se fijan los anchos de todas antes de empezar: solo se mueve esta columna (y, si aplica, su vecina).
    freezeColumnWidths(editor.view, table)
    const positions = tableRowPositions(editor, table)
    const cols = table.querySelectorAll<HTMLElement>('colgroup > col')
    const startX = event.clientX
    const widths = [...table.rows[0].cells].map(
      (c) => c.getBoundingClientRect().width,
    )
    const startWidth = widths[index]
    const isOuterEdge = index === widths.length - 1

    if (!isOuterEdge) {
      // Borde interior: como en cualquier tabla, comprime una columna y amplía la vecina en la misma
      // medida, dejando el ancho total (y por tanto los bordes izquierdo/derecho de la tabla) igual.
      const neighborWidth = widths[index + 1]
      const pairWidth = startWidth + neighborWidth
      const maxWidth = Math.max(MIN_COL, pairWidth - MIN_COL)
      let width = startWidth
      const move = (e: PointerEvent) => {
        width = Math.max(
          MIN_COL,
          Math.min(maxWidth, startWidth + e.clientX - startX),
        )
        cols.item(index).style.width = `${Math.round(width)}px`
        cols.item(index + 1).style.width = `${Math.round(pairWidth - width)}px`
        // El total no cambia, pero se reafirma explícitamente: si quedara desajustado respecto a la
        // suma de columnas, con table-layout:fixed el navegador reparte el espacio a su aire y la
        // tabla se ve mal (o se sale de la hoja).
        let total = 0
        cols.forEach((c) => (total += Number.parseFloat(c.style.width) || 0))
        if (total) table.style.width = `${total}px`
        measure()
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        dragging.current = false
        setActive(null)
        if (positions) {
          applyColumnWidth(editor, positions.tablePos, index, Math.round(width))
          applyColumnWidth(
            editor,
            positions.tablePos,
            index + 1,
            Math.round(pairWidth - width),
          )
        }
        requestAnimationFrame(measure)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
      return
    }

    // Borde derecho de la tabla: no hay vecina a la que quitarle o darle espacio, así que aquí sí
    // cambia el ancho total de la tabla (limitado a los márgenes de la hoja).
    const others = widths.reduce(
      (sum, w, i) => (i === index ? sum : sum + w),
      0,
    )
    const pageWidth = editor.view.dom.getBoundingClientRect().width
    const room = Math.floor(pageWidth - others)
    // Si la tabla ya se pasaba de los márgenes, esta columna puede encogerse pero no crecer más.
    const maxWidth = Math.max(MIN_COL, room >= startWidth ? room : startWidth)
    let width = startWidth
    const move = (e: PointerEvent) => {
      width = Math.max(
        MIN_COL,
        Math.min(maxWidth, startWidth + e.clientX - startX),
      )
      const col = cols.item(index)
      col.style.width = `${Math.round(width)}px`
      let total = 0
      cols.forEach((c) => (total += Number.parseFloat(c.style.width) || 0))
      if (total) table.style.width = `${total}px`
      measure()
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      dragging.current = false
      setActive(null)
      if (positions)
        applyColumnWidth(editor, positions.tablePos, index, Math.round(width))
      requestAnimationFrame(measure)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  function startRow(event: React.PointerEvent, index: number) {
    if (!layout) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    const { table } = layout
    const row = table.rows[index]
    dragging.current = true
    setActive(`r${index}`)
    const positions = tableRowPositions(editor, row)
    const startY = event.clientY
    const startHeight = row.getBoundingClientRect().height
    let height = startHeight
    const move = (e: PointerEvent) => {
      // Una fila no puede ser más alta que el área de una hoja.
      height = Math.max(
        MIN_ROW,
        Math.min(PAGE_CONTENT_PX - 24, startHeight + e.clientY - startY),
      )
      row.style.height = `${Math.round(height)}px`
      measure()
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      dragging.current = false
      setActive(null)
      if (positions?.rowPos != null)
        applyRowHeight(editor, positions.rowPos, Math.round(height))
      requestAnimationFrame(measure)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  function resetRow(index: number) {
    if (!layout) return
    const positions = tableRowPositions(editor, layout.table.rows[index])
    if (positions?.rowPos != null)
      applyRowHeight(editor, positions.rowPos, null)
    requestAnimationFrame(measure)
  }

  if (!layout) return null
  const { rect, clip } = layout
  const colTop = Math.max(rect.top, clip.top)
  const colBottom = Math.min(rect.bottom, clip.bottom)
  return createPortal(
    <div
      aria-hidden
      onPointerEnter={() => {
        overGrips.current = true
        if (leaveTimer.current) clearTimeout(leaveTimer.current)
      }}
      onPointerLeave={() => {
        overGrips.current = false
      }}
    >
      {colBottom > colTop &&
        layout.columns.map((x, index) => (
          <div
            key={`c${index}`}
            onPointerDown={(event) => startColumn(event, index)}
            title="Arrastra para cambiar el ancho de la columna"
            style={{
              left: x - GRIP / 2,
              top: colTop,
              width: GRIP,
              height: colBottom - colTop,
            }}
            className="group fixed z-30 flex cursor-col-resize touch-none justify-center"
          >
            <span
              className={cn(
                'h-full w-[3px] rounded-full bg-transparent transition-colors group-hover:bg-primary',
                active === `c${index}` && 'bg-primary',
              )}
            />
          </div>
        ))}
      {layout.rows.map((y, index) =>
        y < clip.top || y > clip.bottom ? null : (
          <div
            key={`r${index}`}
            onPointerDown={(event) => startRow(event, index)}
            onDoubleClick={() => resetRow(index)}
            title="Arrastra para cambiar el alto de la fila (doble clic: automático)"
            style={{
              left: rect.left,
              top: y - GRIP / 2,
              width: rect.width,
              height: GRIP,
            }}
            className="group fixed z-20 flex cursor-row-resize touch-none flex-col justify-center"
          >
            <span
              className={cn(
                'h-[3px] w-full rounded-full bg-transparent transition-colors group-hover:bg-primary',
                active === `r${index}` && 'bg-primary',
              )}
            />
          </div>
        ),
      )}
    </div>,
    document.body,
  )
}
