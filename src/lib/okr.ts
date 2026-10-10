/**
 * OKR (objetivos y resultados clave) e ingresos mensuales. Todo lo de aquí es puro (sin base de datos
 * ni red) para poder probarlo aparte: periodos, avance, semáforo y formato de cifras.
 */
import { z } from 'zod'

// ---------- Periodos ----------

/** `2026-T4` (trimestre) o `2026` (año). */
export const PERIOD_RE = /^\d{4}(-T[1-4])?$/

const pad = (n: number) => String(n).padStart(2, '0')
const MS_DAY = 86_400_000

export function periodOf(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return `${date.getUTCFullYear()}-T${quarter}`
}

/** Primer y último día del periodo (`YYYY-MM-DD`). */
export function periodRange(period: string): { start: string; end: string } {
  const [year, q] = period.split('-T')
  const y = Number(year)
  if (!q) return { start: `${y}-01-01`, end: `${y}-12-31` }
  const firstMonth = (Number(q) - 1) * 3 + 1
  const lastMonth = firstMonth + 2
  const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate()
  return {
    start: `${y}-${pad(firstMonth)}-01`,
    end: `${y}-${pad(lastMonth)}-${pad(lastDay)}`,
  }
}

export function periodLabel(period: string): string {
  const [year, q] = period.split('-T')
  return q ? `${q}.º trimestre de ${year}` : `Año ${year}`
}

/** Periodos que se ofrecen al elegir: del trimestre anterior a los próximos, más el año en curso. */
export function periodOptions(today: Date): string[] {
  const year = today.getUTCFullYear()
  const quarter = Math.floor(today.getUTCMonth() / 3) + 1
  const out: string[] = [String(year)]
  for (let offset = -1; offset <= 3; offset += 1) {
    const index = year * 4 + quarter - 1 + offset
    out.push(`${Math.floor(index / 4)}-T${(index % 4) + 1}`)
  }
  return out
}

/** Qué parte del periodo ha pasado (0 al empezar, 1 al terminar). */
export function elapsedFraction(period: string, today: Date): number {
  const { start, end } = periodRange(period)
  const from = Date.parse(`${start}T00:00:00Z`)
  const to = Date.parse(`${end}T23:59:59Z`)
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    12,
  )
  return Math.min(1, Math.max(0, (now - from) / (to - from)))
}

export function daysLeft(period: string, today: Date): number {
  const { end } = periodRange(period)
  const to = Date.parse(`${end}T00:00:00Z`)
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  return Math.max(0, Math.round((to - now) / MS_DAY))
}

// ---------- Avance y semáforo ----------

export type ProgressInput = { start: number; target: number; current: number }

/** Avance de un resultado clave entre 0 y 1; sirve tanto si hay que subir como si hay que bajar. */
export function krProgress({ start, target, current }: ProgressInput): number {
  if (!Number.isFinite(current)) return 0
  if (target === start) return current === target ? 1 : 0
  const ratio = (current - start) / (target - start)
  return Math.min(1, Math.max(0, ratio))
}

export function objectiveProgress(progresses: ReadonlyArray<number>): number {
  if (progresses.length === 0) return 0
  return progresses.reduce((sum, p) => sum + p, 0) / progresses.length
}

export type Health = 'completado' | 'en_ritmo' | 'en_riesgo' | 'atrasado'

export const HEALTH_LABEL: Record<Health, string> = {
  completado: 'Completado',
  en_ritmo: 'En ritmo',
  en_riesgo: 'En riesgo',
  atrasado: 'Atrasado',
}

/** Compara el avance con el tiempo que ha pasado del periodo. */
export function healthOf(progress: number, elapsed: number): Health {
  if (progress >= 1) return 'completado'
  const gap = elapsed - progress
  if (gap <= 0.1) return 'en_ritmo'
  if (gap <= 0.25) return 'en_riesgo'
  return 'atrasado'
}

// ---------- Métricas automáticas (datos de Tools) ----------

export const AUTO_METRICS = [
  {
    id: 'documents.created',
    label: 'Documentos creados',
    help: 'Documentos nuevos creados en el periodo.',
  },
  {
    id: 'documents.approved',
    label: 'Documentos aprobados',
    help: 'Documentos aprobados en el periodo.',
  },
] as const

export type AutoMetricId = (typeof AUTO_METRICS)[number]['id']

export const isAutoMetric = (value: unknown): value is AutoMetricId =>
  AUTO_METRICS.some((m) => m.id === value)

// ---------- Cifras ----------

const nf = new Intl.NumberFormat('es', {
  // «always»: sin él, el español no agrupa los números de cuatro cifras (1000).
  useGrouping: 'always' as unknown as boolean,
  maximumFractionDigits: 2,
})

const PREFIX_UNITS = new Set(['C$', '€', '$', 'US$'])

/** `1000000, 'C$'` → «C$ 1.000.000»; `60, '%'` → «60 %»; `12, 'alumnos'` → «12 alumnos». */
export function formatValue(value: number, unit: string): string {
  const n = nf.format(value)
  const u = unit.trim()
  if (!u) return n
  return PREFIX_UNITS.has(u) ? `${u} ${n}` : `${n} ${u}`
}

/**
 * Número escrito a mano en español: «1.000.000», «1.500,5», «12,5» o «80». Devuelve null si no es un
 * número (vacío o letras).
 */
export function parseNumberInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, '')
  if (!t) return null
  let normal = t
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** 0.6 → «60 %». */
export const formatPercent = (fraction: number) =>
  `${Math.round(fraction * 100)} %`

// ---------- Ingresos mensuales ----------

export type IncomePoint = { month: string; amount: number }

/** Primer día del mes de una fecha (`YYYY-MM-01`). */
export const monthStart = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`

/** Los últimos `count` meses, el actual el último, con 0 donde no hay dato. */
export function incomeSeries(
  rows: ReadonlyArray<IncomePoint>,
  today: Date,
  count = 6,
): IncomePoint[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.amount]))
  const out: IncomePoint[] = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1),
    )
    const key = monthStart(d)
    out.push({ month: key, amount: byMonth.get(key) ?? 0 })
  }
  return out
}

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/** `2026-10-01` → «oct 2026». */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTHS[Number(m) - 1]} ${year}`
}

/** Meses completos que faltan para llegar a la meta al ritmo medio de crecimiento de la serie, o null. */
export function monthsToReach(
  series: ReadonlyArray<IncomePoint>,
  target: number,
): number | null {
  const withData = series.filter((p) => p.amount > 0)
  const last = withData.at(-1)
  const first = withData.at(0)
  if (!last || !first) return null
  if (last.amount >= target) return 0
  if (withData.length < 2) return null
  const gaps = series.indexOf(last) - series.indexOf(first)
  const perMonth = (last.amount - first.amount) / gaps
  if (perMonth <= 0) return null
  return Math.ceil((target - last.amount) / perMonth)
}

// ---------- Validación (compartida por servidor y pantalla) ----------

const text = (max: number) => z.string().trim().max(max)

export const objectiveSchema = z.object({
  id: z.string().min(1).optional(),
  period: z.string().regex(PERIOD_RE),
  title: text(200).min(1, 'Escribe el objetivo'),
  description: text(2000),
  ownerId: z.string().min(1).nullable(),
})

export const keyResultSchema = z
  .object({
    id: z.string().min(1).optional(),
    objectiveId: z.string().min(1),
    title: text(200).min(1, 'Escribe el resultado clave'),
    kpiName: text(200),
    unit: text(20),
    startValue: z.number().finite(),
    targetValue: z.number().finite(),
    source: z.enum(['manual', 'auto']),
    autoMetric: z.string().max(60).nullable(),
    ownerId: z.string().min(1).nullable(),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .superRefine((kr, ctx) => {
    if (kr.source === 'auto' && !isAutoMetric(kr.autoMetric))
      ctx.addIssue({
        code: 'custom',
        path: ['autoMetric'],
        message: 'Elige qué dato de Tools se mide',
      })
    if (kr.startValue === kr.targetValue)
      ctx.addIssue({
        code: 'custom',
        path: ['targetValue'],
        message: 'La meta tiene que ser distinta del valor inicial',
      })
  })

export const checkinSchema = z.object({
  keyResultId: z.string().min(1),
  value: z.number().finite(),
  note: text(1000),
})

export const incomeSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amount: z.number().finite().min(0).max(1_000_000_000_000),
  note: text(500),
})

export const targetSchema = z.object({
  target: z.number().finite().positive().max(1_000_000_000_000),
})

// ---------- Estado de un indicador (KPI) ----------

export type KpiStatus = 'completado' | 'en_progreso' | 'iniciado' | 'pendiente'

export const KPI_STATUS_LABEL: Record<KpiStatus, string> = {
  completado: 'Completado',
  en_progreso: 'En progreso',
  iniciado: 'Iniciado',
  pendiente: 'Pendiente',
}

/** Sin avance = pendiente; menos de la mitad = iniciado; desde la mitad = en progreso; meta = completado. */
export function kpiStatusOf(progress: number): KpiStatus {
  if (progress >= 1) return 'completado'
  if (progress >= 0.5) return 'en_progreso'
  if (progress > 0) return 'iniciado'
  return 'pendiente'
}

// ---------- Plan de acción: el año en 48 casillas (12 meses × 4 semanas) ----------

export const SLOTS_PER_YEAR = 48

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export const QUARTER_LABELS = [
  'Q1 - Primer trimestre (enero - marzo)',
  'Q2 - Segundo trimestre (abril - junio)',
  'Q3 - Tercer trimestre (julio - septiembre)',
  'Q4 - Cuarto trimestre (octubre - diciembre)',
]

/** Mes (0 a 11) de una casilla (1 a 48). */
export const slotMonth = (slot: number) => Math.floor((slot - 1) / 4)
/** Semana dentro del mes (1 a 4). */
export const slotWeek = (slot: number) => ((slot - 1) % 4) + 1
export const slotOf = (month: number, week: number) => month * 4 + week

/** «S2 de marzo». */
export const slotLabel = (slot: number) =>
  `S${slotWeek(slot)} de ${MONTH_NAMES[slotMonth(slot)].toLowerCase()}`

/** Casilla de una fecha: los días 1-7 son S1, 8-14 S2, 15-21 S3 y del 22 en adelante S4. */
export function slotOfDate(date: Date): number {
  const week = Math.min(4, Math.floor((date.getUTCDate() - 1) / 7) + 1)
  return slotOf(date.getUTCMonth(), week)
}

/** «S2 de marzo» o «de S2 de marzo a S1 de abril». */
export function slotRangeLabel(start: number, end: number): string {
  return start === end
    ? slotLabel(start)
    : `de ${slotLabel(start)} a ${slotLabel(end)}`
}

export const ACTIVITY_STATUSES = [
  'pendiente',
  'en_progreso',
  'completada',
] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
}

const ACTIVITY_WEIGHT: Record<ActivityStatus, number> = {
  pendiente: 0,
  en_progreso: 0.5,
  completada: 1,
}

/** Avance de una estrategia: el de sus actividades si las tiene; si no, el número que se anotó a mano. */
export function strategyProgress(
  activities: ReadonlyArray<{ status: ActivityStatus }>,
  manualPercent: number,
): number {
  if (activities.length === 0)
    return Math.min(1, Math.max(0, manualPercent / 100))
  const sum = activities.reduce((n, a) => n + ACTIVITY_WEIGHT[a.status], 0)
  return sum / activities.length
}

export const STRATEGY_STATUSES = [
  'planificada',
  'preparacion',
  'en_desarrollo',
  'activa',
  'pausada',
  'completada',
] as const
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number]

export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
  planificada: 'Planificada',
  preparacion: 'En preparación',
  en_desarrollo: 'En desarrollo',
  activa: 'Activa',
  pausada: 'Pausada',
  completada: 'Completada',
}

/** Colores de las estrategias en el Gantt (un matiz por posición; los estilos viven en la interfaz). */
export const STRATEGY_COLOR_COUNT = 8

// ---------- Presupuesto ----------

export type BudgetLine = { amount: number; spent: number; group: string }

export const budgetTotal = (items: ReadonlyArray<{ amount: number }>) =>
  items.reduce((n, i) => n + i.amount, 0)

/** Parte del total (0 a 1); 0 si el total es 0. */
export const shareOf = (amount: number, total: number) =>
  total > 0 ? amount / total : 0

/** Suma por grupo, de mayor a menor; sin grupo queda como «Sin grupo». */
export function budgetByGroup(
  items: ReadonlyArray<BudgetLine>,
): Array<{ group: string; amount: number; spent: number }> {
  const map = new Map<string, { amount: number; spent: number }>()
  for (const i of items) {
    const key = i.group.trim() || 'Sin grupo'
    const cur = map.get(key) ?? { amount: 0, spent: 0 }
    cur.amount += i.amount
    cur.spent += i.spent
    map.set(key, cur)
  }
  return [...map.entries()]
    .map(([group, v]) => ({ group, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

// ---------- ROI ----------

export type RoiProjectionRow = { customers: number; upsell: number }

export type RoiConfig = {
  /** Lo que paga un cliente al año por el contrato base. */
  annualValue: number
  /** Una fila por año (el primero es el año en curso). */
  projection: RoiProjectionRow[]
}

export const EMPTY_ROI: RoiConfig = {
  annualValue: 0,
  projection: [{ customers: 0, upsell: 0 }],
}

export const roiConfigSchema = z.object({
  annualValue: z.number().finite().min(0).max(1_000_000_000_000),
  projection: z
    .array(
      z.object({
        customers: z.number().int().min(0).max(1_000_000),
        upsell: z.number().finite().min(0).max(1_000_000_000_000),
      }),
    )
    .min(1)
    .max(5),
})

export const parseRoiConfig = (raw: unknown): RoiConfig => {
  const parsed = roiConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_ROI
}

export type RoiYear = {
  year: number
  customers: number
  base: number
  upsell: number
  total: number
}

export function roiProjection(config: RoiConfig): RoiYear[] {
  return config.projection.map((row, i) => {
    const base = row.customers * config.annualValue
    return {
      year: i + 1,
      customers: row.customers,
      base,
      upsell: row.upsell,
      total: base + row.upsell,
    }
  })
}

/** Retorno: (ingresos − inversión) / inversión. Null si no hay inversión. */
export function roiFraction(
  investment: number,
  revenue: number,
): number | null {
  if (investment <= 0) return null
  return (revenue - investment) / investment
}

/** +12,4 % / −3 %. */
export function formatSignedPercent(fraction: number): string {
  const n = new Intl.NumberFormat('es', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(fraction * 100)
  return `${n} %`
}

// ---------- Ingresos de un año ----------

/** Enero a diciembre del año, con 0 donde no hay dato. */
export function incomeOfYear(
  rows: ReadonlyArray<IncomePoint>,
  year: number,
): IncomePoint[] {
  const byMonth = new Map(rows.map((r) => [r.month, r.amount]))
  return Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${pad(m + 1)}-01`
    return { month: key, amount: byMonth.get(key) ?? 0 }
  })
}

export const sumIncome = (rows: ReadonlyArray<IncomePoint>) =>
  rows.reduce((n, r) => n + r.amount, 0)

// ---------- Validación de las secciones nuevas ----------

const yearSchema = z.number().int().min(2000).max(2100)
const slotSchema = z.number().int().min(1).max(SLOTS_PER_YEAR)

export const strategySchema = z.object({
  id: z.string().min(1).optional(),
  year: yearSchema,
  name: text(200).min(1, 'Escribe el nombre de la estrategia'),
  description: text(1000),
  status: z.enum(STRATEGY_STATUSES),
  progress: z.number().int().min(0).max(100),
  team: z.array(text(100).min(1)).max(12),
  color: z.number().int().min(0).max(STRATEGY_COLOR_COUNT - 1),
})

export const activitySchema = z
  .object({
    id: z.string().min(1).optional(),
    year: yearSchema,
    strategyId: z.string().min(1).nullable(),
    title: text(200).min(1, 'Escribe la actividad'),
    ownerName: text(100),
    startSlot: slotSchema,
    endSlot: slotSchema,
    status: z.enum(ACTIVITY_STATUSES),
    milestone: z.boolean(),
    notes: text(1000),
  })
  .superRefine((a, ctx) => {
    if (a.endSlot < a.startSlot)
      ctx.addIssue({
        code: 'custom',
        path: ['endSlot'],
        message: 'El final no puede ser antes del inicio',
      })
  })

export const budgetItemSchema = z.object({
  id: z.string().min(1).optional(),
  year: yearSchema,
  concept: text(200).min(1, 'Escribe el concepto'),
  amount: z.number().finite().min(0).max(1_000_000_000_000),
  spent: z.number().finite().min(0).max(1_000_000_000_000),
  groupName: text(100),
  strategyId: z.string().min(1).nullable(),
})
