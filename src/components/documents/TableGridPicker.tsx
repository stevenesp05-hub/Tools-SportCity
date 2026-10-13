import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Table as TableIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'

const MAX_COLS = 8
const MAX_ROWS = 8

/** Cuadrícula de tamaño (se usa en el botón de la barra y en el menú Tabla). */
export function TableGrid({
  onPick,
}: {
  onPick: (rows: number, cols: number) => void
}) {
  const [size, setSize] = useState({ rows: 0, cols: 0 })
  return (
    <div>
      <div
        role="grid"
        aria-label="Tamaño de la tabla"
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1.35rem)` }}
        onMouseLeave={() => setSize({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
          const row = Math.floor(i / MAX_COLS) + 1
          const col = (i % MAX_COLS) + 1
          const on = row <= size.rows && col <= size.cols
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={`${row} × ${col}`}
              onMouseEnter={() => setSize({ rows: row, cols: col })}
              onFocus={() => setSize({ rows: row, cols: col })}
              onClick={() => onPick(row, col)}
              className={cn(
                'size-[1.35rem] rounded-[3px] border transition-colors',
                on
                  ? 'border-primary bg-primary/20'
                  : 'border-border bg-background',
              )}
            />
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {size.rows > 0 ? `${size.cols} × ${size.rows}` : 'Elige el tamaño'}
      </p>
    </div>
  )
}

/** Selector de tamaño de tabla como el de Google Docs: se pasa el ratón por la cuadrícula y se pulsa. */
export function TableGridPicker({
  editor,
  active,
}: {
  editor: Editor
  active?: boolean
}) {
  const [open, setOpen] = useState(false)
  function insert(rows: number, cols: number) {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8', active && 'bg-primary/10 text-primary')}
          title="Insertar tabla"
          aria-label="Insertar tabla"
        >
          <TableIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <TableGrid onPick={insert} />
      </PopoverContent>
    </Popover>
  )
}
