import { encodeAttr } from '#/lib/diagrams'
import { parseNumber } from '#/lib/formulas'

/**
 * Gráficos del editor. Todo se dibuja como SVG + HTML simple (sin librerías ni canvas) para que
 * el editor, la vista previa y el PDF muestren exactamente lo mismo. Los colores salen de clases
 * (`s0`…`s7`) y de la paleta elegida, así que siguen el tema del documento.
 */

export const CHART_KINDS = [
  { value: 'columns', label: 'Columnas' },
  { value: 'bars', label: 'Barras' },
  { value: 'stacked', label: 'Apiladas' },
  { value: 'line', label: 'Líneas' },
  { value: 'area', label: 'Área' },
  { value: 'pie', label: 'Circular' },
  { value: 'donut', label: 'Anillo' },
] as const
export type ChartKind = (typeof CHART_KINDS)[number]['value']

export const CHART_PALETTES = [
  {
    value: 'tema',
    label: 'Del documento',
    swatches: ['#1e1a6b', '#6e83bc', '#6a70a0', '#7793b2'],
  },
  {
    value: 'vivo',
    label: 'Vivos',
    swatches: ['#4f46e5', '#0891b2', '#d97706', '#e11d48'],
  },
  {
    value: 'frio',
    label: 'Fríos',
    swatches: ['#1e3a8a', '#2563eb', '#0284c7', '#0f766e'],
  },
  {
    value: 'calido',
    label: 'Cálidos',
    swatches: ['#9a3412', '#c2410c', '#d97706', '#be123c'],
  },
  {
    value: 'gris',
    label: 'Grises',
    swatches: ['#1f2937', '#4b5563', '#64748b', '#94a3b8'],
  },
] as const
export type ChartPalette = (typeof CHART_PALETTES)[number]['value']

export const CHART_FORMATS = [
  { value: 'number', label: 'Número' },
  { value: 'nio', label: 'Córdobas (C$)' },
  { value: 'usd', label: 'Dólares ($)' },
  { value: 'percent', label: 'Porcentaje' },
] as const
export type ChartFormat = (typeof CHART_FORMATS)[number]['value']

export const CHART_HEIGHTS = [
  { value: 'sm', label: 'Bajo' },
  { value: 'md', label: 'Medio' },
  { value: 'lg', label: 'Alto' },
] as const
export type ChartHeight = (typeof CHART_HEIGHTS)[number]['value']

export type ChartSeries = { name: string; values: Array<number | null> }

export type ChartSpec = {
  kind: ChartKind
  title: string
  subtitle: string
  /** Fuente o nota al pie. */
  note: string
  categories: string[]
  series: ChartSeries[]
  palette: ChartPalette
  format: ChartFormat
  height: ChartHeight
  showValues: boolean
  showLegend: boolean
  showGrid: boolean
  /** Un color distinto por categoría (solo con una serie de barras o columnas). */
  varyColors: boolean
}

export const MAX_CATEGORIES = 60
export const MAX_SERIES = 8

export const SAMPLE_CHART: ChartSpec = {
  kind: 'columns',
  title: '',
  subtitle: '',
  note: '',
  categories: ['Enero', 'Febrero', 'Marzo'],
  series: [{ name: 'Valor', values: [120, 180, 150] }],
  palette: 'tema',
  format: 'number',
  height: 'md',
  showValues: true,
  showLegend: true,
  showGrid: true,
  varyColors: false,
}

const oneOf = <T extends string>(
  list: ReadonlyArray<{ value: T }>,
  value: unknown,
  fallback: T,
): T => (list.some((o) => o.value === value) ? (value as T) : fallback)

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : ''
const flag = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Deja cualquier entrada (JSON viejo, pegado, a medio editar) como un gráfico válido. */
export function normalizeChartSpec(input: unknown): ChartSpec {
  const o = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >
  const categories = (Array.isArray(o.categories) ? o.categories : [])
    .slice(0, MAX_CATEGORIES)
    .map((c) => text(c, 60))
  const series = (Array.isArray(o.series) ? o.series : [])
    .slice(0, MAX_SERIES)
    .map((s): ChartSeries => {
      const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
      const values = Array.isArray(r.values) ? r.values : []
      return {
        name: text(r.name, 40),
        values: categories.map((_, i) => num(values[i])),
      }
    })
  return {
    kind: oneOf(CHART_KINDS, o.kind, 'columns'),
    title: text(o.title, 120),
    subtitle: text(o.subtitle, 160),
    note: text(o.note, 200),
    categories,
    series:
      series.length > 0
        ? series
        : [{ name: 'Valor', values: categories.map(() => null) }],
    palette: oneOf(CHART_PALETTES, o.palette, 'tema'),
    format: oneOf(CHART_FORMATS, o.format, 'number'),
    height: oneOf(CHART_HEIGHTS, o.height, 'md'),
    showValues: flag(o.showValues, true),
    showLegend: flag(o.showLegend, true),
    showGrid: flag(o.showGrid, true),
    varyColors: flag(o.varyColors, false),
  }
}

/** Gráficos antiguos: una sola serie de pares "etiqueta: valor". */
export function legacyChartToSpec(attrs: Record<string, unknown>): ChartSpec {
  const items = (Array.isArray(attrs.items) ? attrs.items : []) as Array<{
    label?: unknown
    value?: unknown
  }>
  return normalizeChartSpec({
    kind: attrs.kind === 'columns' ? 'columns' : 'bars',
    title: attrs.title,
    categories: items.map((i) => i.label),
    series: [{ name: 'Valor', values: items.map((i) => i.value) }],
  })
}

/** Datos del gráfico de un nodo: el formato nuevo (`spec`) o, si no existe, el antiguo. */
export function chartSpecOf(attrs: Record<string, unknown>): ChartSpec {
  return attrs.spec && typeof attrs.spec === 'object'
    ? normalizeChartSpec(attrs.spec)
    : legacyChartToSpec(attrs)
}

export const hasChartData = (spec: ChartSpec) =>
  spec.categories.length > 0 &&
  spec.series.some((s) => s.values.some((v) => v !== null))

// ---------- Formato de números ----------

export function formatChartValue(
  value: number,
  format: ChartFormat,
  compact = false,
): string {
  const abs = Math.abs(value)
  const plain = (n: number, max = 2) =>
    n.toLocaleString('en-US', { maximumFractionDigits: max })
  let body: string
  if (compact && abs >= 1_000_000) body = `${plain(value / 1_000_000, 1)}M`
  else if (compact && abs >= 10_000) body = `${plain(value / 1_000, 1)}K`
  else if (format === 'nio' || format === 'usd')
    body = value.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  else body = plain(value)
  if (format === 'nio') return `C$ ${body}`
  if (format === 'usd') return `$ ${body}`
  if (format === 'percent') return `${body}%`
  return body
}

// ---------- Estructura de salida ----------

/** Árbol neutro que se convierte a DOM de ProseMirror, a React o a texto HTML. */
export type ChartNode = {
  tag: string
  a?: Record<string, string | number>
  kids?: Array<ChartNode | string>
}

const SVG_TAGS = new Set([
  'svg',
  'g',
  'rect',
  'line',
  'path',
  'circle',
  'text',
  'polyline',
])
export const isSvgTag = (tag: string) => SVG_TAGS.has(tag)

export const CHART_W = 560
const FS = 10
const PALETTE_SIZE = 8
const tw = (s: string) => s.length * FS * 0.56
const r1 = (v: number) => Math.round(v * 10) / 10
const cls = (i: number) => `s${i % PALETTE_SIZE}`

function fit(s: string, max: number): string {
  if (tw(s) <= max) return s
  const chars = Math.max(1, Math.floor(max / (FS * 0.56)) - 1)
  return `${s.slice(0, chars).trimEnd()}…`
}

const el = (
  tag: string,
  a: Record<string, string | number>,
  ...kids: Array<ChartNode | string>
): ChartNode => ({ tag, a, kids })
const rect = (
  c: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 1.5,
) =>
  el('rect', {
    class: c,
    x: r1(x),
    y: r1(y),
    width: r1(Math.max(w, 0)),
    height: r1(Math.max(h, 0)),
    rx,
  })
const label = (c: string, x: number, y: number, s: string) =>
  el('text', { class: c, x: r1(x), y: r1(y) }, s)
const seg = (c: string, x1: number, y1: number, x2: number, y2: number) =>
  el('line', { class: c, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) })

function niceScale(min: number, max: number, target = 5) {
  const lo = Math.min(0, min)
  let hi = Math.max(0, max)
  if (hi === lo) hi = lo + 1
  const raw = (hi - lo) / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
  const start = Math.floor(lo / step + 1e-9) * step
  const end = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 1e6; v += step)
    ticks.push(Number(v.toPrecision(12)))
  return { lo: start, hi: end, ticks }
}

const HEIGHTS: Record<ChartHeight, number> = { sm: 190, md: 250, lg: 330 }
const PIE_HEIGHTS: Record<ChartHeight, number> = { sm: 170, md: 220, lg: 280 }

/** Etiquetas del eje horizontal: se acortan y, si no caben, se salta alguna. */
function categoryLabels(cats: string[], step: number): string[] {
  const budget = step - 4
  const longest = Math.max(...cats.map(tw), 0)
  if (longest <= budget) return cats
  if (budget >= 30) return cats.map((c) => fit(c, budget))
  const every = Math.ceil(Math.min(longest, 50) / Math.max(step, 1))
  return cats.map((c, i) => (i % every === 0 ? fit(c, every * step - 4) : ''))
}

function valueText(
  v: number,
  format: ChartFormat,
  room: number,
): string | null {
  const full = formatChartValue(v, format)
  if (tw(full) <= room) return full
  const short = formatChartValue(v, format, true)
  return tw(short) <= room ? short : null
}

type Layout = { height: number; shapes: ChartNode[] }

function layoutColumnar(spec: ChartSpec): Layout {
  const { categories: cats, series, kind, format } = spec
  const n = cats.length
  const m = series.length
  const stacked = kind === 'stacked'
  const height = HEIGHTS[spec.height]

  let min = 0
  let max = 0
  if (stacked) {
    for (let i = 0; i < n; i += 1) {
      const total = series.reduce(
        (sum, s) => sum + Math.max(0, s.values[i] ?? 0),
        0,
      )
      max = Math.max(max, total)
    }
  } else {
    for (const s of series)
      for (const v of s.values)
        if (v !== null) {
          min = Math.min(min, v)
          max = Math.max(max, v)
        }
  }
  const scale = niceScale(min, max)
  const tickText = scale.ticks.map((t) => formatChartValue(t, format, true))
  const left = Math.max(28, Math.max(...tickText.map(tw)) + 12)
  const top = spec.showValues ? 18 : 10
  const plotW = CHART_W - left - 10
  const plotH = height - top - 24
  const span = scale.hi - scale.lo
  const y = (v: number) => top + ((scale.hi - v) / span) * plotH
  const y0 = y(0)
  const step = plotW / n
  const center = (i: number) => left + (i + 0.5) * step

  const shapes: ChartNode[] = []
  scale.ticks.forEach((t, i) => {
    if (spec.showGrid) shapes.push(seg('grid', left, y(t), CHART_W - 10, y(t)))
    shapes.push(label('tick ta-e', left - 6, y(t) + 3.5, tickText[i]))
  })
  shapes.push(seg('axis', left, y0, CHART_W - 10, y0))

  const names = categoryLabels(cats, step)
  names.forEach((name, i) => {
    if (name) shapes.push(label('lbl ta-m', center(i), top + plotH + 15, name))
  })

  const colorOf = (s: number, i: number) =>
    spec.varyColors && m === 1 ? cls(i) : cls(s)

  if (kind === 'columns' || stacked) {
    const groupW = stacked
      ? Math.min(step * 0.62, 56)
      : Math.min(step * 0.74, (m === 1 ? 48 : 30) * m)
    const barW = stacked ? groupW : groupW / m
    for (let i = 0; i < n; i += 1) {
      let base = 0
      series.forEach((s, k) => {
        const v = s.values[i]
        if (v === null) return
        if (stacked) {
          if (v <= 0) return
          const top1 = y(base + v)
          const h = y(base) - top1
          shapes.push(
            rect(`bar ${cls(k)}`, center(i) - barW / 2, top1, barW, h, 0),
          )
          if (spec.showValues && h >= 13) {
            const t = valueText(v, format, barW)
            if (t)
              shapes.push(
                label('val in ta-m', center(i), top1 + h / 2 + 3.5, t),
              )
          }
          base += v
        } else {
          const x = center(i) - groupW / 2 + k * barW
          const yv = y(v)
          const h = Math.max(Math.abs(yv - y0), v === 0 ? 0 : 1)
          const by = v >= 0 ? yv : y0
          shapes.push(rect(`bar ${colorOf(k, i)}`, x + 0.75, by, barW - 1.5, h))
          if (spec.showValues) {
            const t = valueText(v, format, barW + 16)
            if (t)
              shapes.push(
                label(
                  'val ta-m',
                  x + barW / 2,
                  v >= 0 ? by - 4 : by + h + 11,
                  t,
                ),
              )
          }
        }
      })
      if (stacked && spec.showValues && base > 0) {
        const t = valueText(base, format, step)
        if (t) shapes.push(label('val ta-m', center(i), y(base) - 4, t))
      }
    }
    return { height, shapes }
  }

  // Líneas y área: los huecos (sin dato) cortan la línea.
  const areas: ChartNode[] = []
  const lines: ChartNode[] = []
  const dots: ChartNode[] = []
  const values: ChartNode[] = []
  series.forEach((s, k) => {
    const runs: Array<Array<[number, number]>> = []
    let run: Array<[number, number]> = []
    s.values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run)
        run = []
        return
      }
      run.push([center(i), y(v)])
      dots.push(
        el('circle', {
          class: `dot ${cls(k)}`,
          cx: r1(center(i)),
          cy: r1(y(v)),
          r: 3,
        }),
      )
      if (spec.showValues) {
        const t = valueText(v, format, step)
        if (t) values.push(label('val ta-m', center(i), y(v) - 8, t))
      }
    })
    if (run.length) runs.push(run)
    for (const r of runs) {
      const points = r.map(([px, py]) => `${r1(px)},${r1(py)}`)
      if (r.length > 1)
        lines.push(
          el('polyline', { class: `line ${cls(k)}`, points: points.join(' ') }),
        )
      if (kind === 'area')
        areas.push(
          el('path', {
            class: `area ${cls(k)}`,
            d: `M ${points.join(' L ')} L ${r1(r[r.length - 1][0])},${r1(y0)} L ${r1(r[0][0])},${r1(y0)} Z`,
          }),
        )
    }
  })
  shapes.push(...areas, ...lines, ...dots, ...values)
  return { height, shapes }
}

function layoutBars(spec: ChartSpec): Layout {
  const { categories: cats, series, format } = spec
  const n = cats.length
  const m = series.length
  const scaleH = { sm: 0.8, md: 1, lg: 1.3 }[spec.height]
  const thick = Math.round(14 * scaleH)
  const rowH = m * thick + Math.round(9 * scaleH)
  const top = 6

  let min = 0
  let max = 0
  for (const s of series)
    for (const v of s.values)
      if (v !== null) {
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
  const scale = niceScale(min, max)
  const left = Math.min(160, Math.max(44, Math.max(...cats.map(tw)) + 12))
  const valueRoom = spec.showValues
    ? Math.max(
        ...series.flatMap((s) =>
          s.values.map((v) =>
            v === null ? 0 : tw(formatChartValue(v, format)),
          ),
        ),
        0,
      ) + 10
    : 0
  const right = Math.max(14, valueRoom)
  const plotW = CHART_W - left - right
  const height = top + n * rowH + 22
  const span = scale.hi - scale.lo
  const x = (v: number) => left + ((v - scale.lo) / span) * plotW
  const x0 = x(0)

  const shapes: ChartNode[] = []
  scale.ticks.forEach((t) => {
    if (spec.showGrid) shapes.push(seg('grid', x(t), top, x(t), top + n * rowH))
    shapes.push(
      label(
        'tick ta-m',
        x(t),
        top + n * rowH + 14,
        formatChartValue(t, format, true),
      ),
    )
  })
  shapes.push(seg('axis', x0, top, x0, top + n * rowH))

  cats.forEach((cat, i) => {
    const rowTop = top + i * rowH
    shapes.push(
      label('lbl ta-e', left - 7, rowTop + rowH / 2 + 3.5, fit(cat, left - 12)),
    )
    series.forEach((s, k) => {
      const v = s.values[i]
      if (v === null) return
      const xv = x(v)
      const by = rowTop + (rowH - m * thick) / 2 + k * thick
      const c = spec.varyColors && m === 1 ? cls(i) : cls(k)
      shapes.push(
        rect(
          `bar ${c}`,
          Math.min(x0, xv),
          by + 0.75,
          Math.abs(xv - x0) || (v === 0 ? 0 : 1),
          thick - 1.5,
        ),
      )
      if (spec.showValues)
        shapes.push(
          label(
            v >= 0 ? 'val ta-s' : 'val ta-e',
            v >= 0 ? xv + 5 : xv - 5,
            by + thick / 2 + 3.5,
            formatChartValue(v, format),
          ),
        )
    })
  })
  return { height, shapes }
}

const polar = (cx: number, cy: number, r: number, a: number) =>
  `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`

function layoutPie(spec: ChartSpec): Layout {
  const donut = spec.kind === 'donut'
  const height = PIE_HEIGHTS[spec.height]
  const values = spec.categories.map((_, i) =>
    Math.max(0, spec.series[0].values[i] ?? 0),
  )
  const total = values.reduce((a, b) => a + b, 0)
  const cx = CHART_W / 2
  const cy = height / 2
  const R = Math.min(height / 2 - 8, CHART_W / 2 - 20)
  const inner = R * 0.58
  const shapes: ChartNode[] = []

  const full = values.filter((v) => v > 0).length === 1
  let angle = -Math.PI / 2
  values.forEach((v, i) => {
    if (v <= 0) return
    const frac = v / total
    const a0 = angle
    const a1 = angle + frac * Math.PI * 2
    angle = a1
    const c = `slice ${cls(i)}`
    if (full) {
      shapes.push(
        donut
          ? el('path', {
              class: c,
              d: `M ${r1(cx - R)},${r1(cy)} A ${r1(R)} ${r1(R)} 0 1 1 ${r1(cx + R)},${r1(cy)} A ${r1(R)} ${r1(R)} 0 1 1 ${r1(cx - R)},${r1(cy)} Z M ${r1(cx - inner)},${r1(cy)} A ${r1(inner)} ${r1(inner)} 0 1 0 ${r1(cx + inner)},${r1(cy)} A ${r1(inner)} ${r1(inner)} 0 1 0 ${r1(cx - inner)},${r1(cy)} Z`,
            })
          : el('circle', { class: c, cx: r1(cx), cy: r1(cy), r: r1(R) }),
      )
    } else {
      const large = a1 - a0 > Math.PI ? 1 : 0
      const d = donut
        ? `M ${polar(cx, cy, R, a0)} A ${r1(R)} ${r1(R)} 0 ${large} 1 ${polar(cx, cy, R, a1)} L ${polar(cx, cy, inner, a1)} A ${r1(inner)} ${r1(inner)} 0 ${large} 0 ${polar(cx, cy, inner, a0)} Z`
        : `M ${r1(cx)},${r1(cy)} L ${polar(cx, cy, R, a0)} A ${r1(R)} ${r1(R)} 0 ${large} 1 ${polar(cx, cy, R, a1)} Z`
      shapes.push(el('path', { class: c, d }))
    }
    if (spec.showValues && frac >= 0.06) {
      const mid = (a0 + a1) / 2
      const r = donut ? (R + inner) / 2 : R * 0.68
      shapes.push(
        label(
          'val in ta-m',
          cx + r * Math.cos(mid),
          cy + r * Math.sin(mid) + 3.5,
          `${Math.round(frac * 100)}%`,
        ),
      )
    }
  })
  if (donut) {
    shapes.push(
      label('ctr ta-m', cx, cy + 3, formatChartValue(total, spec.format, true)),
      label('ctr-sub ta-m', cx, cy + 17, 'Total'),
    )
  }
  return { height, shapes }
}

export type LegendItem = { label: string; color: number; detail?: string }

export function chartLegend(spec: ChartSpec): LegendItem[] {
  if (!spec.showLegend) return []
  const pie = spec.kind === 'pie' || spec.kind === 'donut'
  let items: LegendItem[] = []
  if (pie) {
    const values = spec.categories.map((_, i) =>
      Math.max(0, spec.series[0].values[i] ?? 0),
    )
    const total = values.reduce((a, b) => a + b, 0)
    items = spec.categories.flatMap((c, i) =>
      values[i] > 0
        ? [
            {
              label: c,
              color: i,
              detail: `${formatChartValue(values[i], spec.format)} · ${Math.round((values[i] / total) * 100)}%`,
            },
          ]
        : [],
    )
  } else if (spec.series.length > 1) {
    items = spec.series.map((s, i) => ({
      label: s.name || `Serie ${i + 1}`,
      color: i,
    }))
  } else if (
    spec.varyColors &&
    (spec.kind === 'columns' || spec.kind === 'bars')
  ) {
    items = spec.categories.map((c, i) => ({ label: c, color: i }))
  }
  return items.length > 1 ? items : []
}

const KIND_LABEL = Object.fromEntries(
  CHART_KINDS.map((k) => [k.value, k.label]),
)

/** Árbol completo del gráfico: título, dibujo SVG, leyenda y nota. */
export function chartTree(input: ChartSpec): ChartNode {
  const spec = normalizeChartSpec(input)
  const empty = !hasChartData(spec)
  const pie = spec.kind === 'pie' || spec.kind === 'donut'
  const built: Layout = empty
    ? {
        height: HEIGHTS[spec.height] / 2,
        shapes: [
          label(
            'lbl ta-m',
            CHART_W / 2,
            HEIGHTS[spec.height] / 4,
            'Añade datos para ver el gráfico',
          ),
        ],
      }
    : pie
      ? layoutPie(spec)
      : spec.kind === 'bars'
        ? layoutBars(spec)
        : layoutColumnar(spec)

  const legend = empty ? [] : chartLegend(spec)
  const kids: Array<ChartNode | string> = []
  if (spec.title) kids.push(el('div', { class: 'c-title' }, spec.title))
  if (spec.subtitle) kids.push(el('div', { class: 'c-sub' }, spec.subtitle))
  kids.push(
    el(
      'svg',
      {
        class: 'c-svg',
        viewBox: `0 0 ${CHART_W} ${Math.round(built.height)}`,
        role: 'img',
        'aria-label': `${spec.title || 'Gráfico'} (${KIND_LABEL[spec.kind]})`,
      },
      ...built.shapes,
    ),
  )
  if (legend.length > 0)
    kids.push(
      el(
        'div',
        { class: 'c-legend' },
        ...legend.map((item) =>
          el(
            'span',
            { class: 'c-key' },
            el('span', { class: `c-sw ${cls(item.color)}` }),
            item.label,
            ...(item.detail
              ? [el('span', { class: 'c-lv' }, item.detail)]
              : []),
          ),
        ),
      ),
    )
  if (spec.note) kids.push(el('div', { class: 'c-note' }, spec.note))

  return {
    tag: 'div',
    a: {
      class: 'sc-chart',
      'data-chart': spec.kind,
      'data-chart-spec': encodeAttr(spec),
      'data-palette': spec.palette,
    },
    kids,
  }
}

// ---------- Texto plano y tabla (Word, resumen) ----------

/** Cabecera y filas del gráfico como tabla de texto, para Word. */
export function chartTableRows(input: ChartSpec): string[][] {
  const spec = normalizeChartSpec(input)
  const pie = spec.kind === 'pie' || spec.kind === 'donut'
  const series = pie ? spec.series.slice(0, 1) : spec.series
  const total = pie
    ? series[0].values.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0)
    : 0
  const header = [
    'Concepto',
    ...series.map((s, i) => s.name || `Serie ${i + 1}`),
    ...(pie ? ['%'] : []),
  ]
  const rows = spec.categories.map((c, i) => [
    c,
    ...series.map((s) => {
      const v = s.values[i]
      return v === null ? '' : formatChartValue(v, spec.format)
    }),
    ...(pie
      ? [
          total > 0
            ? `${Math.round((Math.max(0, series[0].values[i] ?? 0) / total) * 100)}%`
            : '',
        ]
      : []),
  ])
  return [header, ...rows]
}

// ---------- Texto → datos (pegado desde Excel o listas) ----------

/** Divide texto pegado en filas y columnas: tabulaciones (Excel), punto y coma o "Etiqueta: valor". */
export function parsePastedGrid(input: string): string[][] {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => {
      if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
      if (line.includes(';')) return line.split(';').map((c) => c.trim())
      const pair = /^(.*?):\s*([^:]+)$/.exec(line.trim())
      return pair ? [pair[1].trim(), pair[2].trim()] : [line.trim()]
    })
}

export const isNumericCell = (value: string) => parseNumber(value) !== null
