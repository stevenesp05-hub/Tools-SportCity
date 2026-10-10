import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarRange,
  Check,
  LayoutGrid,
  Plus,
  Rows3,
  Flag,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  MONTH_NAMES,
  QUARTER_LABELS,
  slotMonth,
  slotOfDate,
  slotRangeLabel,
} from '#/lib/okr'
import { deleteActivity } from '#/server/gestion'
import type { Activity, Strategy } from '#/server/gestion'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import { EmptyState } from '#/components/documents/EmptyState'
import {
  Card,
  PageHeader,
  YearSelect,
  colorOf,
} from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'
import {
  ActivityDetail,
  ActivityDialog,
} from '#/components/gestion/ActivityDialogs'
import {
  StrategyDetail,
  StrategyDialog,
} from '#/components/gestion/StrategyDialogs'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/gestion/plan')({
  component: PlanPage,
})

type View = 'gantt' | 'mensual'

const STATUS_OPACITY = {
  pendiente: 'opacity-40',
  en_progreso: 'opacity-75',
  completada: 'opacity-100',
} as const

/** Color de una actividad: el de su estrategia, o neutro; los hitos van en verde. */
function toneOf(activity: Activity, strategies: Strategy[]) {
  if (activity.milestone)
    return { bar: 'bg-emerald-600', soft: 'bg-emerald-100 text-emerald-800' }
  const s = strategies.find((x) => x.id === activity.strategyId)
  if (!s) return { bar: 'bg-slate-400', soft: 'bg-slate-200 text-slate-700' }
  const c = colorOf(s.color)
  return { bar: c.bar, soft: c.soft }
}

function PlanPage() {
  const { data, canManage, canRegister, refresh, setYear } = useGestion()
  const { confirm } = useDialogs()
  const [view, setView] = useState<View>('gantt')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [strategyId, setStrategyId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{
    activity: Activity | null
    slot: number
  } | null>(null)
  const [editStrategy, setEditStrategy] = useState<Strategy | null>(null)

  const detail = data.activities.find((a) => a.id === detailId) ?? null
  const detailStrategy =
    data.strategies.find((s) => s.id === detail?.strategyId) ?? null
  const openStrategy = data.strategies.find((s) => s.id === strategyId) ?? null

  const today = new Date()
  const currentSlot =
    today.getUTCFullYear() === data.year ? slotOfDate(today) : 0
  const defaultSlot = currentSlot || 1

  async function remove(a: Activity) {
    const ok = await confirm({
      title: 'Eliminar actividad',
      description: `Se elimina «${a.title}» del plan de acción.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteActivity({ data: { id: a.id } })
      setDetailId(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  const milestones = data.activities.filter((a) => a.milestone)
  const tasks = data.activities.filter((a) => !a.milestone)
  const used = [
    ...new Set(
      tasks
        .map((a) => data.strategies.find((s) => s.id === a.strategyId))
        .filter((s): s is Strategy => s !== undefined),
    ),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="violet"
        icon={CalendarRange}
        title={`Plan de acción ${data.year}`}
        subtitle="Calendario anual con actividades distribuidas por semanas. Toca una actividad para ver su estrategia."
      >
        <YearSelect year={data.year} years={data.years} onChange={setYear} />
        {canManage && (
          <Button
            size="sm"
            onClick={() => setEdit({ activity: null, slot: defaultSlot })}
          >
            <Plus className="size-4" />
            Nueva actividad
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {used.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className={cn('size-2.5 rounded-full', colorOf(s.color).dot)}
              />
              {s.name}
            </li>
          ))}
          {milestones.length > 0 && (
            <li className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-600" />
              Hitos
            </li>
          )}
        </ul>
        <div
          role="tablist"
          aria-label="Vista"
          className="inline-flex rounded-xl border border-border bg-card p-1"
        >
          {(
            [
              ['gantt', 'Diagrama de Gantt', Rows3],
              ['mensual', 'Vista mensual', LayoutGrid],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
                view === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.activities.length === 0 ? (
        <EmptyState icon={CalendarRange}>
          {canManage
            ? 'Aún no hay actividades en este año. Añade la primera y colócala en las semanas en que se hará.'
            : 'Aún no hay actividades en este año.'}
        </EmptyState>
      ) : view === 'gantt' ? (
        <div className="space-y-5">
          {QUARTER_LABELS.map((label, q) => {
            const from = q * 12 + 1
            const to = from + 11
            const rows = data.activities.filter(
              (a) => a.startSlot <= to && a.endSlot >= from,
            )
            return (
              <Card key={label} className="overflow-hidden">
                <h2 className="border-b border-border bg-secondary/60 px-5 py-3 font-display text-sm font-bold">
                  {label}
                </h2>
                {rows.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    Sin actividades en este trimestre.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 w-48 bg-card px-4 py-2 text-left font-medium text-muted-foreground">
                            Actividad
                          </th>
                          {[0, 1, 2].map((m) => (
                            <th
                              key={m}
                              colSpan={4}
                              className="border-l border-border px-2 py-2 text-center font-medium"
                            >
                              {MONTH_NAMES[q * 3 + m]}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th className="sticky left-0 z-10 bg-card" />
                          {Array.from({ length: 12 }, (_, i) => (
                            <th
                              key={i}
                              className={cn(
                                'px-1 py-1 text-center font-normal text-muted-foreground',
                                i % 4 === 0 && 'border-l border-border',
                                from + i === currentSlot && 'bg-info-soft',
                              )}
                            >
                              S{(i % 4) + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a) => {
                          const tone = toneOf(a, data.strategies)
                          return (
                            <tr key={a.id} className="border-t border-border">
                              <td className="sticky left-0 z-10 bg-card px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => setDetailId(a.id)}
                                  className="block text-left"
                                >
                                  <span className="flex items-center gap-1 font-medium text-foreground">
                                    {a.milestone && (
                                      <Flag className="size-3 text-emerald-600" />
                                    )}
                                    {a.title}
                                  </span>
                                  {a.ownerName && (
                                    <span className="text-muted-foreground">
                                      {a.ownerName}
                                    </span>
                                  )}
                                </button>
                              </td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const slot = from + i
                                const on =
                                  slot >= a.startSlot && slot <= a.endSlot
                                return (
                                  <td
                                    key={i}
                                    className={cn(
                                      'p-0.5',
                                      i % 4 === 0 && 'border-l border-border',
                                      slot === currentSlot && 'bg-info-soft/60',
                                    )}
                                  >
                                    {on && (
                                      <button
                                        type="button"
                                        aria-label={`${a.title}: ${slotRangeLabel(a.startSlot, a.endSlot)}`}
                                        onClick={() => setDetailId(a.id)}
                                        className={cn(
                                          'block h-5 w-full rounded-md',
                                          tone.bar,
                                          STATUS_OPACITY[a.status],
                                        )}
                                      />
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {MONTH_NAMES.map((month, m) => {
            const from = m * 4 + 1
            const rows = data.activities.filter(
              (a) => a.startSlot <= from + 3 && a.endSlot >= from,
            )
            return (
              <Card key={month} className="overflow-hidden">
                <h2 className="border-b border-border bg-secondary/60 px-5 py-3 font-display text-sm font-bold">
                  {month} {data.year}
                </h2>
                {rows.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-muted-foreground">
                    Sin actividades.
                  </p>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">
                          Actividad
                        </th>
                        {[1, 2, 3, 4].map((w) => (
                          <th
                            key={w}
                            className={cn(
                              'w-14 py-2 text-center font-normal',
                              from + w - 1 === currentSlot && 'bg-info-soft',
                            )}
                          >
                            S{w}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => {
                        const tone = toneOf(a, data.strategies)
                        return (
                          <tr key={a.id} className="border-t border-border">
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => setDetailId(a.id)}
                                className="text-left"
                              >
                                <span className="block font-medium text-foreground">
                                  {a.title}
                                </span>
                                {a.ownerName && (
                                  <span className="text-muted-foreground">
                                    {a.ownerName}
                                  </span>
                                )}
                              </button>
                            </td>
                            {[1, 2, 3, 4].map((w) => {
                              const slot = from + w - 1
                              const on =
                                slot >= a.startSlot && slot <= a.endSlot
                              return (
                                <td key={w} className="p-1 text-center">
                                  {on && (
                                    <span
                                      className={cn(
                                        'inline-flex h-6 w-full items-center justify-center rounded-full',
                                        tone.soft,
                                      )}
                                    >
                                      {a.status === 'completada' && (
                                        <Check className="size-3.5" />
                                      )}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {milestones.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
            <Flag className="size-4 text-emerald-600" />
            Hitos clave
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(a.id)}
                  className="w-full rounded-xl bg-secondary/60 p-3 text-left hover:bg-secondary"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {MONTH_NAMES[slotMonth(a.startSlot)]} {data.year}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-foreground">
                    {a.title}
                  </div>
                  {a.ownerName && (
                    <div className="text-xs text-muted-foreground">
                      Resp: {a.ownerName}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ActivityDetail
        activity={detail}
        strategy={detailStrategy}
        canManage={canManage}
        canRegister={canRegister}
        onClose={() => setDetailId(null)}
        onOpenStrategy={() =>
          detailStrategy && setStrategyId(detailStrategy.id)
        }
        onEdit={() =>
          detail && setEdit({ activity: detail, slot: detail.startSlot })
        }
        onDelete={() => detail && void remove(detail)}
        onChanged={() => void refresh()}
      />
      <ActivityDialog
        open={edit !== null}
        year={data.year}
        activity={edit?.activity ?? null}
        strategies={data.strategies}
        initialSlot={edit?.slot ?? 1}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null)
          setDetailId(null)
          void refresh()
        }}
      />
      <StrategyDetail
        strategy={openStrategy}
        activities={data.activities}
        budget={data.budget}
        unit={data.okr.target.unit}
        canManage={canManage}
        canRegister={canRegister}
        onClose={() => setStrategyId(null)}
        onEdit={() => openStrategy && setEditStrategy(openStrategy)}
        onChanged={() => void refresh()}
      />
      <StrategyDialog
        open={editStrategy !== null}
        year={data.year}
        strategy={editStrategy}
        suggestions={[]}
        usedColors={data.strategies.map((s) => s.color)}
        onClose={() => setEditStrategy(null)}
        onSaved={() => {
          setEditStrategy(null)
          void refresh()
        }}
      />
    </div>
  )
}
