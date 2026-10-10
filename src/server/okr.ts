import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '#/server/auth'
import { assertPermission } from '#/lib/permissions'
import { assertNameCase } from '#/lib/name-rules'
import {
  PERIOD_RE,
  checkinSchema,
  elapsedFraction,
  healthOf,
  incomeSchema,
  incomeSeries,
  isAutoMetric,
  keyResultSchema,
  krProgress,
  monthStart,
  objectiveProgress,
  objectiveSchema,
  periodOf,
  periodOptions,
  periodRange,
  targetSchema,
} from '#/lib/okr'
import type { AutoMetricId, Health, IncomePoint } from '#/lib/okr'

// ---------- Tipos ----------

export type OkrCheckin = {
  id: string
  value: number
  note: string
  createdAt: string
  author: string | null
}

export type OkrKeyResult = {
  id: string
  title: string
  /** Nombre del indicador (KPI) que mide este resultado clave. */
  kpiName: string
  unit: string
  startValue: number
  targetValue: number
  current: number
  source: 'manual' | 'auto'
  autoMetric: AutoMetricId | null
  ownerId: string | null
  dueOn: string | null
  progress: number
  health: Health
  /** Último check-in (el más reciente primero), para ver la evolución sin otra consulta. */
  checkins: OkrCheckin[]
}

export type OkrObjective = {
  id: string
  title: string
  description: string
  ownerId: string | null
  progress: number
  health: Health
  keyResults: OkrKeyResult[]
}

export type OkrPerson = { id: string; name: string }

export type OkrOverview = {
  period: string
  periods: string[]
  today: string
  elapsed: number
  target: { amount: number; unit: string }
  income: IncomePoint[]
  /** Ingreso anotado del mes en curso, si lo hay. */
  incomeNote: string
  objectives: OkrObjective[]
  people: OkrPerson[]
}

// ---------- Lectura ----------

const todayUtc = () => new Date()

/** Fin del periodo en el siguiente día, para filtrar por fechas con `lt`. */
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Cliente de Supabase de la petición; solo se usa para contar filas. */
export type Supabase = {
  from: (table: string) => any
}

/** Valor de una métrica automática: cuántos hay en el periodo (en hora UTC; a escala de trimestre da igual). */
async function autoValue(
  supabase: Supabase,
  metric: AutoMetricId,
  range: { start: string; end: string },
): Promise<number> {
  const from = `${range.start}T00:00:00Z`
  const to = `${nextDay(range.end)}T00:00:00Z`
  const count = async (
    table: string,
    column: string,
    extra?: (q: any) => any,
  ) => {
    let q = supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .gte(column, from)
      .lt(column, to)
    if (extra) q = extra(q)
    const { count: n } = await q
    return n ?? 0
  }
  switch (metric) {
    case 'documents.created':
      return count('documents', 'created_at', (q) => q.is('deleted_at', null))
    case 'documents.approved':
      return count('documents', 'approved_at', (q) => q.is('deleted_at', null))
  }
}

/** Carga los objetivos de un periodo con sus resultados clave. La usan el servidor de OKR y el de gestión. */
export async function loadOkrOverview(
  sb: Supabase,
  requestedPeriod: string | undefined,
): Promise<OkrOverview> {
  const now = todayUtc()
  const period = requestedPeriod ?? periodOf(now)
  const range = periodRange(period)
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  )
    .toISOString()
    .slice(0, 10)

  const [objectives, income, settings, people] = await Promise.all([
    sb
      .from('okr_objectives')
      .select('id, title, description, owner_id, position')
      .eq('period', period)
      .is('archived_at', null)
      .order('position')
      .order('created_at'),
    sb
      .from('okr_income')
      .select('month, amount, note')
      .gte('month', since)
      .order('month'),
    sb
      .from('okr_settings')
      .select('value')
      .eq('key', 'ingresos_meta')
      .maybeSingle(),
    sb
      .from('profiles')
      .select('id, email, full_name')
      .in('role', ['admin', 'recepcion']),
  ])
  for (const r of [objectives, income]) {
    if (r.error)
      throw new Error(
        /does not exist|schema cache/i.test(r.error.message)
          ? 'Falta ejecutar la migración 0025_okr.sql en Supabase.'
          : r.error.message,
      )
  }

  const objectiveRows = (objectives.data ?? []) as unknown as Array<{
    id: string
    title: string
    description: string
    owner_id: string | null
  }>
  const ids = objectiveRows.map((o) => o.id)
  const krRows = (ids.length
    ? (
        await sb
          .from('okr_key_results')
          .select(
            'id, objective_id, title, kpi_name, unit, start_value, target_value, source, auto_metric, owner_id, due_on',
          )
          .in('objective_id', ids)
          .order('position')
          .order('created_at')
      ).data
    : []) as unknown as Array<{
    id: string
    objective_id: string
    title: string
    kpi_name: string
    unit: string
    start_value: number
    target_value: number
    source: 'manual' | 'auto'
    auto_metric: string | null
    owner_id: string | null
    due_on: string | null
  }>
  const krIds = krRows.map((k) => k.id)
  const checkinRows = (krIds.length
    ? (
        await sb
          .from('okr_checkins')
          .select('id, key_result_id, value, note, created_at, created_by')
          .in('key_result_id', krIds)
          .order('created_at', { ascending: false })
          .limit(2000)
      ).data
    : []) as unknown as Array<{
    id: string
    key_result_id: string
    value: number
    note: string
    created_at: string
    created_by: string | null
  }>

  const nameOf = new Map<string, string>()
  const peopleList: OkrPerson[] = (
    (people.data ?? []) as unknown as Array<{
      id: string
      email: string
      full_name: string | null
    }>
  ).map((p) => {
    const name = p.full_name?.trim() || p.email
    nameOf.set(p.id, name)
    return { id: p.id, name }
  })

  const byKr = new Map<string, OkrCheckin[]>()
  for (const c of checkinRows) {
    const list = byKr.get(c.key_result_id) ?? []
    list.push({
      id: c.id,
      value: Number(c.value),
      note: c.note,
      createdAt: c.created_at,
      author: c.created_by ? (nameOf.get(c.created_by) ?? null) : null,
    })
    byKr.set(c.key_result_id, list)
  }

  const elapsed = elapsedFraction(period, now)
  const autoCache = new Map<AutoMetricId, number>()
  const keyResults = new Map<string, OkrKeyResult[]>()
  for (const k of krRows) {
    const metric = isAutoMetric(k.auto_metric) ? k.auto_metric : null
    const checkins = byKr.get(k.id) ?? []
    let current = checkins[0]?.value ?? Number(k.start_value)
    if (k.source === 'auto' && metric) {
      if (!autoCache.has(metric))
        autoCache.set(metric, await autoValue(sb, metric, range))
      current = autoCache.get(metric) ?? 0
    }
    const progress = krProgress({
      start: Number(k.start_value),
      target: Number(k.target_value),
      current,
    })
    const list = keyResults.get(k.objective_id) ?? []
    list.push({
      id: k.id,
      title: k.title,
      kpiName: k.kpi_name,
      unit: k.unit,
      startValue: Number(k.start_value),
      targetValue: Number(k.target_value),
      current,
      source: k.source,
      autoMetric: metric,
      ownerId: k.owner_id,
      dueOn: k.due_on,
      progress,
      health: healthOf(progress, elapsed),
      checkins: checkins.slice(0, 8),
    })
    keyResults.set(k.objective_id, list)
  }

  const target = ((settings.data as { value?: unknown } | null)?.value ??
    {}) as { target?: number; unit?: string }
  const incomeRows = (
    (income.data ?? []) as unknown as Array<{
      month: string
      amount: number
      note: string
    }>
  ).map((r) => ({ month: r.month, amount: Number(r.amount) }))
  const thisMonth = monthStart(now)
  const incomeNote =
    (
      (income.data ?? []) as unknown as Array<{
        month: string
        note: string
      }>
    ).find((r) => r.month === thisMonth)?.note ?? ''

  return {
    period,
    periods: [...new Set([period, ...periodOptions(now)])].sort(),
    today: now.toISOString().slice(0, 10),
    elapsed,
    target: {
      amount: Number(target.target ?? 1_000_000),
      unit: target.unit ?? 'C$',
    },
    income: incomeSeries(incomeRows, now, 12),
    incomeNote,
    objectives: objectiveRows.map((o) => {
      const krs = keyResults.get(o.id) ?? []
      const progress = objectiveProgress(krs.map((k) => k.progress))
      return {
        id: o.id,
        title: o.title,
        description: o.description,
        ownerId: o.owner_id,
        progress,
        health: healthOf(progress, elapsed),
        keyResults: krs,
      }
    }),
    people: peopleList,
  }
}

export const getOkrOverview = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z.object({ period: z.string().regex(PERIOD_RE).optional() }).optional(),
  )
  .handler(async ({ context, data }): Promise<OkrOverview> => {
    assertPermission(context.user.role, 'tools.okr.ver')
    return loadOkrOverview(context.supabase, data?.period)
  })

// ---------- Escritura ----------

export const saveObjective = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(objectiveSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    assertNameCase(data.title)
    const values = {
      period: data.period,
      title: data.title,
      description: data.description,
      owner_id: data.ownerId,
      updated_at: new Date().toISOString(),
    }
    if (data.id) {
      const { error } = await context.supabase
        .from('okr_objectives')
        .update(values)
        .eq('id', data.id)
      if (error) throw new Error(error.message)
      return { id: data.id }
    }
    const { data: row, error } = await context.supabase
      .from('okr_objectives')
      .insert({ ...values, created_by: context.user.id })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { id: row.id }
  })

export const deleteObjective = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_objectives')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const saveKeyResult = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(keyResultSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    assertNameCase(data.title)
    const values = {
      objective_id: data.objectiveId,
      title: data.title,
      kpi_name: data.kpiName,
      unit: data.unit,
      start_value: data.startValue,
      target_value: data.targetValue,
      source: data.source,
      auto_metric: data.source === 'auto' ? data.autoMetric : null,
      owner_id: data.ownerId,
      due_on: data.dueOn,
      updated_at: new Date().toISOString(),
    }
    if (data.id) {
      const { error } = await context.supabase
        .from('okr_key_results')
        .update(values)
        .eq('id', data.id)
      if (error) throw new Error(error.message)
      return { id: data.id }
    }
    const { data: row, error } = await context.supabase
      .from('okr_key_results')
      .insert(values)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return { id: row.id }
  })

export const deleteKeyResult = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_key_results')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const addCheckin = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(checkinSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.registrar')
    const { data: kr } = await context.supabase
      .from('okr_key_results')
      .select('source')
      .eq('id', data.keyResultId)
      .maybeSingle()
    if ((kr as { source?: string } | null)?.source === 'auto')
      throw new Error(
        'Este resultado clave se calcula solo con datos de Tools: no admite avances a mano.',
      )
    const { error } = await context.supabase.from('okr_checkins').insert({
      key_result_id: data.keyResultId,
      value: data.value,
      note: data.note,
      created_by: context.user.id,
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const deleteCheckin = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_checkins')
      .delete()
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const saveIncome = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(incomeSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.registrar')
    const { error } = await context.supabase.from('okr_income').upsert({
      month: data.month,
      amount: data.amount,
      note: data.note,
      updated_by: context.user.id,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

export const saveIncomeTarget = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(targetSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase.from('okr_settings').upsert({
      key: 'ingresos_meta',
      value: { target: data.target, unit: 'C$' },
    })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })
