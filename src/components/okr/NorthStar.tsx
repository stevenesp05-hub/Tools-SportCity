import { Pencil, Plus, Target } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  formatPercent,
  formatValue,
  monthLabel,
  monthsToReach,
} from '#/lib/okr'
import type { IncomePoint } from '#/lib/okr'

/** La estrella del norte: ingreso del mes frente a la meta, y los últimos 12 meses. */
export function NorthStar({
  income,
  target,
  unit,
  canRegister,
  canManage,
  onRegister,
  onEditTarget,
}: {
  income: IncomePoint[]
  target: number
  unit: string
  canRegister: boolean
  canManage: boolean
  onRegister: () => void
  onEditTarget: () => void
}) {
  const last = income.at(-1)
  const current = last?.amount ?? 0
  const fraction = target > 0 ? Math.min(1, current / target) : 0
  const scaleMax = Math.max(target, ...income.map((p) => p.amount), 1)
  const eta = monthsToReach(income, target)

  return (
    <section
      aria-label="Meta de ingresos mensuales"
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <Target className="size-4" />
            Estrella del norte
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-3xl font-bold text-foreground">
              {formatValue(current, unit)}
            </span>
            <span className="text-sm text-muted-foreground">
              de {formatValue(target, unit)} al mes
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {last ? monthLabel(last.month) : ''}
            {current === 0 && ' · aún sin ingresos anotados'}
            {current > 0 && ` · ${formatPercent(fraction)} de la meta`}
            {eta !== null && eta > 0 && ` · a este ritmo, unos ${eta} meses`}
            {eta === 0 && ' · meta alcanzada'}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" size="sm" onClick={onEditTarget}>
              <Pencil className="size-4" />
              Meta
            </Button>
          )}
          {canRegister && (
            <Button size="sm" onClick={onRegister}>
              <Plus className="size-4" />
              Anotar ingresos
            </Button>
          )}
        </div>
      </div>

      <div
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-label="Avance del mes frente a la meta"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <div className="mt-6">
        <div className="relative flex h-28 items-end gap-1.5 sm:gap-2">
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-primary/40"
            style={{ bottom: `${(target / scaleMax) * 100}%` }}
          />
          {income.map((p) => (
            <div
              key={p.month}
              className="group relative flex h-full flex-1 items-end"
              title={`${monthLabel(p.month)}: ${formatValue(p.amount, unit)}`}
            >
              <div
                className="w-full rounded-t-md bg-accent transition-colors group-hover:bg-primary/70"
                style={{
                  height: `${Math.max(p.amount > 0 ? 3 : 0, (p.amount / scaleMax) * 100)}%`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-2">
          {income.map((p) => (
            <span
              key={p.month}
              className="flex-1 text-center text-2xs capitalize text-muted-foreground"
            >
              {monthLabel(p.month).split(' ')[0]}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
