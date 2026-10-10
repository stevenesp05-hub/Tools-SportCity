import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '#/server/auth'
import { loadOkrOverview } from '#/server/okr'
import type { OkrOverview } from '#/server/okr'
import { assertPermission } from '#/lib/permissions'
import { assertNameCase } from '#/lib/name-rules'
import {
  ACTIVITY_STATUSES,
  PERIOD_RE,
  activitySchema,
  budgetItemSchema,
  incomeOfYear,
  parseRoiConfig,
  roiConfigSchema,
  strategyProgress,
  strategySchema,
} from '#/lib/okr'
import type {
  ActivityStatus,
  IncomePoint,
  RoiConfig,
  StrategyStatus,
} from '#/lib/okr'

// ---------- Tipos ----------

export type Strategy = {
  id: string
  name: string
  description: string
  status: StrategyStatus
  color: number
  team: string[]
  /** Porcentaje anotado a mano; solo cuenta si la estrategia no tiene actividades. */
  manualProgress: number
  /** 0 a 1: de las actividades si las hay, si no el manual. */
  progress: number
  activityCount: number
}

export type Activity = {
  id: string
  strategyId: string | null
  title: string
  ownerName: string
  startSlot: number
  endSlot: number
  status: ActivityStatus
  milestone: boolean
  notes: string
}

export type BudgetItem = {
  id: string
  concept: string
  amount: number
  spent: number
  groupName: string
  strategyId: string | null
}

export type RecentUpdate = {
  id: string
  title: string
  detail: string
  /** Texto corto del estado (p. ej. «Completada», «Avance registrado»). */
  badge: string
  at: string
}

export type GestionData = {
  year: number
  years: number[]
  okr: OkrOverview
  strategies: Strategy[]
  activities: Activity[]
  budget: BudgetItem[]
  budgetNotes: string[]
  roi: RoiConfig
  incomeYear: IncomePoint[]
  updates: RecentUpdate[]
}

const SETUP_MESSAGE =
  'Falta ejecutar las migraciones 0025_okr.sql y 0026_gestion_estrategica.sql en Supabase.'

const failure = (message: string) =>
  new Error(
    /does not exist|schema cache/i.test(message) ? SETUP_MESSAGE : message,
  )

// ---------- Lectura ----------

export const getGestion = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        anio: z.number().int().min(2000).max(2100).optional(),
        periodo: z.string().regex(PERIOD_RE).optional(),
      })
      .optional(),
  )
  .handler(async ({ context, data }): Promise<GestionData> => {
    assertPermission(context.user.role, 'tools.okr.ver')
    const sb = context.supabase
    const now = new Date()
    const year = data?.anio ?? now.getUTCFullYear()

    const [okr, strategies, activities, budget, settings, income, checkins] =
      await Promise.all([
        loadOkrOverview(sb, data?.periodo),
        sb
          .from('okr_strategies')
          .select('id, name, description, status, progress, team, color')
          .eq('year', year)
          .order('position')
          .order('created_at'),
        sb
          .from('okr_activities')
          .select(
            'id, strategy_id, title, owner_name, start_slot, end_slot, status, milestone, notes, updated_at',
          )
          .eq('year', year)
          .order('start_slot')
          .order('position')
          .order('created_at'),
        sb
          .from('okr_budget_items')
          .select('id, concept, amount, spent, group_name, strategy_id')
          .eq('year', year)
          .order('position')
          .order('created_at'),
        sb
          .from('okr_settings')
          .select('key, value')
          .in('key', ['presupuesto_notas', `roi_${year}`]),
        sb
          .from('okr_income')
          .select('month, amount')
          .gte('month', `${year}-01-01`)
          .lte('month', `${year}-12-01`),
        sb
          .from('okr_checkins')
          .select(
            'id, key_result_id, value, created_at, okr_key_results(title, unit)',
          )
          .order('created_at', { ascending: false })
          .limit(6),
      ])
    for (const r of [strategies, activities, budget, settings, income]) {
      if (r.error) throw failure(r.error.message)
    }

    const activityRows = (activities.data ?? []) as unknown as Array<{
      id: string
      strategy_id: string | null
      title: string
      owner_name: string
      start_slot: number
      end_slot: number
      status: ActivityStatus
      milestone: boolean
      notes: string
      updated_at: string
    }>
    const byStrategy = new Map<string, ActivityStatus[]>()
    for (const a of activityRows) {
      if (!a.strategy_id) continue
      const list = byStrategy.get(a.strategy_id) ?? []
      list.push(a.status)
      byStrategy.set(a.strategy_id, list)
    }

    const strategyList: Strategy[] = (
      (strategies.data ?? []) as unknown as Array<{
        id: string
        name: string
        description: string
        status: StrategyStatus
        progress: number
        team: string[]
        color: number
      }>
    ).map((s) => {
      const statuses = byStrategy.get(s.id) ?? []
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        color: s.color,
        team: s.team,
        manualProgress: s.progress,
        progress: strategyProgress(
          statuses.map((status) => ({ status })),
          s.progress,
        ),
        activityCount: statuses.length,
      }
    })

    const settingRows = (settings.data ?? []) as unknown as Array<{
      key: string
      value: unknown
    }>
    const notesValue = settingRows.find((r) => r.key === 'presupuesto_notas')
      ?.value as { notes?: unknown } | undefined
    const budgetNotes = Array.isArray(notesValue?.notes)
      ? (notesValue.notes as unknown[]).filter(
          (n): n is string => typeof n === 'string',
        )
      : []

    const incomeRows = (
      (income.data ?? []) as unknown as Array<{ month: string; amount: number }>
    ).map((r) => ({ month: r.month, amount: Number(r.amount) }))

    const checkinRows = (
      (checkins.data ?? []) as unknown as Array<{
        id: string
        value: number
        created_at: string
        okr_key_results: { title: string; unit: string } | null
      }>
    ).filter((c) => c.okr_key_results !== null)

    const updates: RecentUpdate[] = [
      ...checkinRows.map((c) => ({
        id: `c-${c.id}`,
        title: c.okr_key_results?.title ?? '',
        detail: 'Avance registrado',
        badge:
          `${new Intl.NumberFormat('es', { useGrouping: 'always' as unknown as boolean }).format(Number(c.value))} ${c.okr_key_results?.unit ?? ''}`.trim(),
        at: c.created_at,
      })),
      ...[...activityRows]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6)
        .map((a) => ({
          id: `a-${a.id}`,
          title: a.title,
          detail: a.milestone ? 'Hito' : 'Actividad',
          badge:
            a.status === 'completada'
              ? 'Completada'
              : a.status === 'en_progreso'
                ? 'En progreso'
                : 'Pendiente',
          at: a.updated_at,
        })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)

    return {
      year,
      years: [year - 1, year, year + 1, year + 2]
        .filter((y, i, all) => all.indexOf(y) === i)
        .sort(),
      okr,
      strategies: strategyList,
      activities: activityRows.map((a) => ({
        id: a.id,
        strategyId: a.strategy_id,
        title: a.title,
        ownerName: a.owner_name,
        startSlot: a.start_slot,
        endSlot: a.end_slot,
        status: a.status,
        milestone: a.milestone,
        notes: a.notes,
      })),
      budget: (
        (budget.data ?? []) as unknown as Array<{
          id: string
          concept: string
          amount: number
          spent: number
          group_name: string
          strategy_id: string | null
        }>
      ).map((b) => ({
        id: b.id,
        concept: b.concept,
        amount: Number(b.amount),
        spent: Number(b.spent),
        groupName: b.group_name,
        strategyId: b.strategy_id,
      })),
      budgetNotes,
      roi: parseRoiConfig(
        settingRows.find((r) => r.key === `roi_${year}`)?.value,
      ),
      incomeYear: incomeOfYear(incomeRows, year),
      updates,
    }
  })

// ---------- Estrategias ----------

export const saveStrategy = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(strategySchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    assertNameCase(data.name)
    const values = {
      year: data.year,
      name: data.name,
      description: data.description,
      status: data.status,
      progress: data.progress,
      team: data.team,
      color: data.color,
      updated_at: new Date().toISOString(),
    }
    if (data.id) {
      const { error } = await context.supabase
        .from('okr_strategies')
        .update(values)
        .eq('id', data.id)
      if (error) throw failure(error.message)
      return { id: data.id }
    }
    const { data: row, error } = await context.supabase
      .from('okr_strategies')
      .insert(values)
      .select('id')
      .single()
    if (error) throw failure(error.message)
    return { id: (row).id }
  })

export const deleteStrategy = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_strategies')
      .delete()
      .eq('id', data.id)
    if (error) throw failure(error.message)
    return { ok: true as const }
  })

// ---------- Plan de acción ----------

export const saveActivity = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(activitySchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const values = {
      year: data.year,
      strategy_id: data.strategyId,
      title: data.title,
      owner_name: data.ownerName,
      start_slot: data.startSlot,
      end_slot: data.milestone ? data.startSlot : data.endSlot,
      status: data.status,
      milestone: data.milestone,
      notes: data.notes,
      updated_at: new Date().toISOString(),
    }
    if (data.id) {
      const { error } = await context.supabase
        .from('okr_activities')
        .update(values)
        .eq('id', data.id)
      if (error) throw failure(error.message)
      return { id: data.id }
    }
    const { data: row, error } = await context.supabase
      .from('okr_activities')
      .insert(values)
      .select('id')
      .single()
    if (error) throw failure(error.message)
    return { id: (row).id }
  })

/** Recepción y administración cambian solo el estado de una actividad. */
export const setActivityStatus = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({ id: z.string().min(1), status: z.enum(ACTIVITY_STATUSES) }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.registrar')
    const { error } = await context.supabase
      .from('okr_activities')
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq('id', data.id)
    if (error) throw failure(error.message)
    return { ok: true as const }
  })

export const deleteActivity = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_activities')
      .delete()
      .eq('id', data.id)
    if (error) throw failure(error.message)
    return { ok: true as const }
  })

// ---------- Presupuesto ----------

export const saveBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(budgetItemSchema)
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const values = {
      year: data.year,
      concept: data.concept,
      amount: data.amount,
      spent: data.spent,
      group_name: data.groupName,
      strategy_id: data.strategyId,
      updated_at: new Date().toISOString(),
    }
    if (data.id) {
      const { error } = await context.supabase
        .from('okr_budget_items')
        .update(values)
        .eq('id', data.id)
      if (error) throw failure(error.message)
      return { id: data.id }
    }
    const { data: row, error } = await context.supabase
      .from('okr_budget_items')
      .insert(values)
      .select('id')
      .single()
    if (error) throw failure(error.message)
    return { id: (row).id }
  })

export const deleteBudgetItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase
      .from('okr_budget_items')
      .delete()
      .eq('id', data.id)
    if (error) throw failure(error.message)
    return { ok: true as const }
  })

export const saveBudgetNotes = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      notes: z.array(z.string().trim().min(1).max(300)).max(12),
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase.from('okr_settings').upsert({
      key: 'presupuesto_notas',
      value: { notes: data.notes },
    })
    if (error) throw failure(error.message)
    return { ok: true as const }
  })

// ---------- ROI ----------

export const saveRoi = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      year: z.number().int().min(2000).max(2100),
      config: roiConfigSchema,
    }),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context.user.role, 'tools.okr.gestionar')
    const { error } = await context.supabase.from('okr_settings').upsert({
      key: `roi_${data.year}`,
      value: data.config,
    })
    if (error) throw failure(error.message)
    return { ok: true as const }
  })
