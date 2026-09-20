import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowLeftRight,
  ArrowUpNarrowWide,
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  ClipboardPaste,
  LifeBuoy,
  Plus,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { ChartView } from '#/components/documents/ChartView'
import type { BlockDialogRequest } from '#/components/documents/editor-extras'
import {
  CHART_FORMATS,
  CHART_HEIGHTS,
  CHART_KINDS,
  CHART_PALETTES,
  MAX_CATEGORIES,
  MAX_SERIES,
  SAMPLE_CHART,
  chartSpecOf,
  hasChartData,
  isNumericCell,
  normalizeChartSpec,
  parsePastedGrid,
} from '#/lib/charts'
import type { ChartFormat, ChartKind, ChartSpec } from '#/lib/charts'
import { parseNumber } from '#/lib/formulas'
import { cn } from '#/lib/utils'

const KIND_ICONS: Record<ChartKind, LucideIcon> = {
  columns: ChartColumn,
  bars: ChartBar,
  stacked: ChartColumnStacked,
  line: ChartLine,
  area: ChartArea,
  pie: ChartPie,
  donut: LifeBuoy,
}

type Options = Omit<ChartSpec, 'categories' | 'series'>
type Grid = { cats: string[]; names: string[]; cells: string[][] }

const KIND_HINTS: Record<ChartKind, string> = {
  columns: 'Compara valores entre categorías.',
  bars: 'Ideal para nombres largos o muchas categorías.',
  stacked: 'Cada columna suma sus series. Los negativos se ignoran.',
  line: 'Muestra cómo cambia algo en el tiempo.',
  area: 'Como las líneas, con el área rellena.',
  pie: 'Reparte un total en partes. Usa solo la primera serie.',
  donut: 'Como el circular, con el total al centro. Usa solo la primera serie.',
}

const gridOf = (spec: ChartSpec): Grid => ({
  cats: spec.categories,
  names: spec.series.map((s) => s.name),
  cells: spec.categories.map((_, i) =>
    spec.series.map((s) => (s.values[i] === null ? '' : String(s.values[i]))),
  ),
})

function buildSpec(options: Options, grid: Grid): ChartSpec {
  const rows = grid.cats
    .map((_, i) => i)
    .filter((i) => grid.cats[i].trim() || grid.cells[i].some((c) => c.trim()))
  const values = (j: number) =>
    rows.map((i) => {
      const cell = grid.cells[i][j] ?? ''
      return cell.trim() ? parseNumber(cell) : null
    })
  let keep = grid.names
    .map((_, j) => j)
    .filter((j) => values(j).some((v) => v !== null))
  if (keep.length === 0) keep = [0]
  return normalizeChartSpec({
    ...options,
    title: options.title.trim(),
    subtitle: options.subtitle.trim(),
    note: options.note.trim(),
    categories: rows.map((i, n) => grid.cats[i].trim() || `Dato ${n + 1}`),
    series: keep.map((j) => ({
      name:
        grid.names[j]?.trim() || (keep.length > 1 ? `Serie ${j + 1}` : 'Valor'),
      values: values(j),
    })),
  })
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg bg-muted p-[3px]"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-3 text-xs transition-colors',
            value === o.value
              ? 'bg-card font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
      />
      {label}
    </label>
  )
}

/** Editor de gráficos: datos en tabla (con pegado desde Excel), diseño y vista previa en vivo. */
export function ChartDialog({
  request,
  onClose,
  onSave,
}: {
  request: BlockDialogRequest | null
  onClose: () => void
  onSave: (attrs: Record<string, unknown>) => void
}) {
  const [tab, setTab] = useState('datos')
  const [options, setOptions] = useState<Options>(SAMPLE_CHART)
  const [grid, setGrid] = useState<Grid>(gridOf(SAMPLE_CHART))
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!request) return
    const existing = chartSpecOf(request.attrs ?? {})
    const spec = hasChartData(existing) ? existing : SAMPLE_CHART
    setOptions(spec)
    setGrid(gridOf(spec))
    setTab('datos')
  }, [request])

  const spec = useMemo(() => buildSpec(options, grid), [options, grid])
  const set = <TKey extends keyof Options>(key: TKey, value: Options[TKey]) =>
    setOptions((prev) => ({ ...prev, [key]: value }))

  const pie = options.kind === 'pie' || options.kind === 'donut'
  const oneSeries = spec.series.length === 1
  const editing = request?.pos !== null && request?.pos !== undefined

  // ---------- Datos ----------
  const focusCell = (row: number, col: number) =>
    setTimeout(() => {
      gridRef.current
        ?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)
        ?.focus()
    }, 0)

  function addRow() {
    if (grid.cats.length >= MAX_CATEGORIES) {
      toast.error(`Máximo ${MAX_CATEGORIES} filas.`)
      return
    }
    setGrid((g) => ({
      ...g,
      cats: [...g.cats, ''],
      cells: [...g.cells, g.names.map(() => '')],
    }))
  }
  function removeRow(index: number) {
    setGrid((g) =>
      g.cats.length <= 1
        ? g
        : {
            ...g,
            cats: g.cats.filter((_, i) => i !== index),
            cells: g.cells.filter((_, i) => i !== index),
          },
    )
  }
  function addSeries() {
    if (grid.names.length >= MAX_SERIES) {
      toast.error(`Máximo ${MAX_SERIES} series.`)
      return
    }
    setGrid((g) => ({
      ...g,
      names: [...g.names, ''],
      cells: g.cells.map((r) => [...r, '']),
    }))
  }
  function removeSeries(index: number) {
    setGrid((g) =>
      g.names.length <= 1
        ? g
        : {
            ...g,
            names: g.names.filter((_, j) => j !== index),
            cells: g.cells.map((r) => r.filter((_, j) => j !== index)),
          },
    )
  }
  function transpose() {
    if (grid.cats.length > MAX_SERIES) {
      toast.error(
        `Para intercambiar filas y columnas, la tabla puede tener como máximo ${MAX_SERIES} filas.`,
      )
      return
    }
    if (grid.names.length > MAX_CATEGORIES) return
    setGrid((g) => ({
      cats: g.names.map((n, j) => n || `Serie ${j + 1}`),
      names: g.cats.map((c) => c),
      cells: g.names.map((_n, j) => g.cats.map((_c, i) => g.cells[i][j] ?? '')),
    }))
  }
  function sortRows(direction: 'desc' | 'asc') {
    setGrid((g) => {
      const value = (i: number) =>
        parseNumber(g.cells[i][0] ?? '') ??
        (direction === 'desc' ? -Infinity : Infinity)
      const order = g.cats
        .map((_, i) => i)
        .sort((a, b) =>
          direction === 'desc' ? value(b) - value(a) : value(a) - value(b),
        )
      return {
        ...g,
        cats: order.map((i) => g.cats[i]),
        cells: order.map((i) => g.cells[i]),
      }
    })
  }

  function setCat(row: number, value: string) {
    setGrid((g) => ({
      ...g,
      cats: g.cats.map((c, i) => (i === row ? value : c)),
    }))
  }
  function setCell(row: number, col: number, value: string) {
    setGrid((g) => ({
      ...g,
      cells: g.cells.map((r, i) =>
        i === row ? r.map((c, j) => (j === col ? value : c)) : r,
      ),
    }))
  }
  function setName(col: number, value: string) {
    setGrid((g) => ({
      ...g,
      names: g.names.map((n, j) => (j === col ? value : n)),
    }))
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) {
    const matrix = parsePastedGrid(event.clipboardData.getData('text'))
    if (matrix.length <= 1 && (matrix[0]?.length ?? 0) <= 1) return
    event.preventDefault()

    const body = (r: string[]) => r.slice(1).some(isNumericCell)
    const hasHeader =
      row === 0 &&
      col === 0 &&
      matrix.length > 1 &&
      matrix[0].length > 1 &&
      !body(matrix[0]) &&
      body(matrix[1])
    const rows = hasHeader ? matrix.slice(1) : matrix

    const cats = [...grid.cats]
    const names = [...grid.names]
    const cells = grid.cells.map((r) => [...r])
    const ensureSeries = (j: number) => {
      while (names.length <= j && names.length < MAX_SERIES) {
        names.push('')
        cells.forEach((r) => r.push(''))
      }
      return j < names.length
    }
    const ensureRow = (i: number) => {
      while (cats.length <= i && cats.length < MAX_CATEGORIES) {
        cats.push('')
        cells.push(names.map(() => ''))
      }
      return i < cats.length
    }
    if (hasHeader)
      matrix[0].slice(1).forEach((name, j) => {
        if (ensureSeries(j)) names[j] = name
      })
    rows.forEach((line, i) =>
      line.forEach((value, j) => {
        const r = row + i
        const c = col + j
        if (!ensureRow(r)) return
        if (c === 0) cats[r] = value
        else if (ensureSeries(c - 1)) cells[r][c - 1] = value
      }),
    )
    setGrid({ cats, names, cells })
    toast.success('Datos pegados')
  }

  function handleKey(
    event: KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) {
    if (event.key === 'ArrowUp' && row > 0) {
      event.preventDefault()
      focusCell(row - 1, col)
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      if (row + 1 < grid.cats.length) focusCell(row + 1, col)
      else if (event.key === 'Enter') {
        addRow()
        focusCell(row + 1, col)
      }
    }
  }

  const template = `minmax(96px,1.4fr) repeat(${grid.names.length}, minmax(88px,1fr)) 28px`
  const valid = hasChartData(spec)

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gráfico</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="datos">Datos</TabsTrigger>
                <TabsTrigger value="diseno">Diseño</TabsTrigger>
              </TabsList>

              <TabsContent value="datos" className="space-y-3">
                <div className="overflow-x-auto pb-1">
                  <div ref={gridRef} className="min-w-fit space-y-1.5">
                    <div
                      className="grid items-center gap-1.5"
                      style={{ gridTemplateColumns: template }}
                    >
                      <span className="px-1 text-2xs font-display uppercase tracking-wide text-muted-foreground">
                        Categoría
                      </span>
                      {grid.names.map((name, j) => (
                        <div key={j} className="relative">
                          <Input
                            aria-label={`Nombre de la serie ${j + 1}`}
                            value={name}
                            placeholder={
                              grid.names.length > 1 ? `Serie ${j + 1}` : 'Valor'
                            }
                            onChange={(e) => setName(j, e.target.value)}
                            className={cn(
                              'h-8 min-w-0 px-2 text-xs font-medium',
                              grid.names.length > 1 && 'pr-6',
                            )}
                          />
                          {grid.names.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Quitar la serie ${j + 1}`}
                              className="absolute top-1/2 right-1 size-5 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSeries(j)}
                            >
                              <X />
                            </Button>
                          )}
                        </div>
                      ))}
                      <span />
                    </div>

                    {grid.cats.map((cat, i) => (
                      <div
                        key={i}
                        className="grid items-center gap-1.5"
                        style={{ gridTemplateColumns: template }}
                      >
                        <Input
                          data-cell={`${i}-0`}
                          aria-label={`Categoría de la fila ${i + 1}`}
                          value={cat}
                          placeholder={`Dato ${i + 1}`}
                          onChange={(e) => setCat(i, e.target.value)}
                          onPaste={(e) => handlePaste(e, i, 0)}
                          onKeyDown={(e) => handleKey(e, i, 0)}
                          className="h-8 px-2 text-xs"
                        />
                        {grid.names.map((_, j) => {
                          const cell = grid.cells[i][j] ?? ''
                          const bad = cell.trim() !== '' && !isNumericCell(cell)
                          return (
                            <Input
                              key={j}
                              data-cell={`${i}-${j + 1}`}
                              aria-label={`Valor de la fila ${i + 1}, serie ${j + 1}`}
                              aria-invalid={bad || undefined}
                              inputMode="decimal"
                              value={cell}
                              onChange={(e) => setCell(i, j, e.target.value)}
                              onPaste={(e) => handlePaste(e, i, j + 1)}
                              onKeyDown={(e) => handleKey(e, i, j + 1)}
                              className="h-8 px-2 text-right text-xs tabular-nums"
                            />
                          )
                        })}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Quitar la fila ${i + 1}`}
                          disabled={grid.cats.length <= 1}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(i)}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={addRow}
                  >
                    <Plus className="size-3.5" />
                    Fila
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={addSeries}
                  >
                    <Plus className="size-3.5" />
                    Serie
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    title="Intercambiar filas y columnas"
                    onClick={transpose}
                  >
                    <ArrowLeftRight className="size-3.5" />
                    Intercambiar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Ordenar de mayor a menor"
                    title="Ordenar de mayor a menor (primera serie)"
                    onClick={() => sortRows('desc')}
                  >
                    <ArrowDownWideNarrow className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Ordenar de menor a mayor"
                    title="Ordenar de menor a mayor (primera serie)"
                    onClick={() => sortRows('asc')}
                  >
                    <ArrowUpNarrowWide className="size-3.5" />
                  </Button>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ClipboardPaste className="mt-0.5 size-3.5 flex-none" />
                  <span>
                    Copia una tabla de Excel o Google Sheets y pégala en
                    cualquier celda: se rellena desde ahí. Si la primera fila
                    son nombres, se usan como series. Flechas y Enter mueven el
                    cursor entre celdas.
                  </span>
                </p>
              </TabsContent>

              <TabsContent value="diseno" className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tipo de gráfico</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CHART_KINDS.map((k) => {
                      const Icon = KIND_ICONS[k.value]
                      const active = options.kind === k.value
                      return (
                        <button
                          key={k.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => set('kind', k.value)}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs transition-colors',
                            active
                              ? 'border-primary bg-primary/5 font-medium text-foreground'
                              : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          <Icon className="size-5" />
                          {k.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {KIND_HINTS[options.kind]}
                    {pie && grid.names.length > 1 && (
                      <span className="text-amber-700">
                        {' '}
                        Ahora hay {grid.names.length} series: solo se dibuja «
                        {spec.series[0].name}».
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="chart-title">Título</Label>
                    <Input
                      id="chart-title"
                      value={options.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="Ingresos por mes"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="chart-subtitle">Subtítulo</Label>
                    <Input
                      id="chart-subtitle"
                      value={options.subtitle}
                      onChange={(e) => set('subtitle', e.target.value)}
                      placeholder="Primer trimestre de 2026"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="chart-note">Fuente o nota al pie</Label>
                  <Input
                    id="chart-note"
                    value={options.note}
                    onChange={(e) => set('note', e.target.value)}
                    placeholder="Fuente: sistema de caja"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Colores</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CHART_PALETTES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        aria-pressed={options.palette === p.value}
                        onClick={() => set('palette', p.value)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                          options.palette === p.value
                            ? 'border-primary bg-primary/5 font-medium text-foreground'
                            : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <span className="flex">
                          {p.swatches.map((c) => (
                            <span
                              key={c}
                              className="-ml-1 size-3.5 rounded-full border border-white first:ml-0"
                              style={{ background: c }}
                            />
                          ))}
                        </span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Formato de los valores</Label>
                    <ChoiceSelect<ChartFormat>
                      ariaLabel="Formato de los valores"
                      className="h-9 w-full text-sm"
                      value={options.format}
                      onChange={(v) => set('format', v)}
                      options={CHART_FORMATS.map((f) => ({
                        value: f.value,
                        label: f.label,
                      }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Altura</Label>
                    <div>
                      <Segmented
                        ariaLabel="Altura del gráfico"
                        value={options.height}
                        onChange={(v) => set('height', v)}
                        options={CHART_HEIGHTS}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle
                    label="Mostrar valores"
                    checked={options.showValues}
                    onChange={(v) => set('showValues', v)}
                  />
                  <Toggle
                    label="Mostrar leyenda"
                    checked={options.showLegend}
                    onChange={(v) => set('showLegend', v)}
                  />
                  <Toggle
                    label="Líneas guía"
                    checked={options.showGrid}
                    disabled={pie}
                    onChange={(v) => set('showGrid', v)}
                  />
                  <Toggle
                    label="Un color por dato"
                    checked={options.varyColors}
                    disabled={
                      !oneSeries ||
                      !(options.kind === 'columns' || options.kind === 'bars')
                    }
                    onChange={(v) => set('varyColors', v)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="min-w-0 space-y-1.5 md:sticky md:top-0 md:self-start">
            <Label>Vista previa</Label>
            <div className="doc-sheet max-h-[28rem] overflow-auto rounded-lg border border-border bg-white p-3">
              <div className="ProseMirror">
                <ChartView spec={spec} />
              </div>
            </div>
            {!valid && (
              <p className="text-xs text-amber-700">
                Escribe al menos un valor numérico para poder insertar el
                gráfico.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onSave({ spec, kind: spec.kind, title: spec.title, items: [] })
            }
          >
            {editing ? 'Guardar cambios' : 'Insertar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
