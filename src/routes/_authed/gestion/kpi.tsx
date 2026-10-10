import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import {
  KPI_STATUS_LABEL,
  formatPercent,
  formatValue,
  kpiStatusOf,
} from '#/lib/okr'
import type { KpiStatus } from '#/lib/okr'
import { EmptyState } from '#/components/documents/EmptyState'
import { CheckinDialog } from '#/components/okr/OkrDialogs'
import {
  Card,
  PageHeader,
  PeriodSelect,
  ProgressBar,
  StatTile,
} from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { OkrKeyResult } from '#/server/okr'

export const Route = createFileRoute('/_authed/gestion/kpi')({
  component: KpiPage,
})

const STATUS_TONE: Record<KpiStatus, string> = {
  completado: 'text-info',
  en_progreso: 'text-success',
  iniciado: 'text-warning',
  pendiente: 'text-muted-foreground',
}

function Trend({ status }: { status: KpiStatus }) {
  const cls = cn('size-4', STATUS_TONE[status])
  if (status === 'pendiente') return <TrendingDown className={cls} />
  if (status === 'iniciado') return <Minus className={cls} />
  return <TrendingUp className={cls} />
}

const monthYear = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null

function KpiPage() {
  const { data, canRegister, refresh, setPeriod } = useGestion()
  const { okr } = data
  const [checkin, setCheckin] = useState<OkrKeyResult | null>(null)

  const all = okr.objectives.flatMap((o) => o.keyResults)
  const counts = { en_progreso: 0, iniciado: 0, pendiente: 0, completado: 0 }
  for (const kr of all) counts[kpiStatusOf(kr.progress)] += 1

  let n = 0
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="emerald"
        icon={Gauge}
        title="KPI del proyecto"
        subtitle="Indicadores derivados de los resultados clave (OKR)"
      >
        <PeriodSelect
          period={okr.period}
          periods={okr.periods}
          onChange={setPeriod}
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={Gauge}
          tint="indigo"
          value={String(all.length)}
          label="KPI totales"
        />
        <StatTile
          icon={TrendingUp}
          tint="emerald"
          value={String(counts.en_progreso + counts.completado)}
          label="En progreso"
        />
        <StatTile
          icon={Minus}
          tint="amber"
          value={String(counts.iniciado)}
          label="Iniciados"
        />
        <StatTile
          icon={TrendingDown}
          tint="slate"
          value={String(counts.pendiente)}
          label="Pendientes"
        />
      </div>

      {okr.objectives.length === 0 ? (
        <EmptyState icon={Gauge}>
          Los KPI salen de los resultados clave. Crea objetivos en la sección
          OKR y aparecerán aquí.
        </EmptyState>
      ) : (
        okr.objectives.map((objective, oi) => (
          <Card key={objective.id} className="overflow-hidden">
            <h2 className="border-b border-border bg-secondary/60 px-5 py-3.5 font-display text-sm font-bold text-foreground">
              Objetivo {oi + 1} — {objective.title}
            </h2>
            {objective.keyResults.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Este objetivo aún no tiene resultados clave.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {objective.keyResults.map((kr) => {
                  n += 1
                  const status = kpiStatusOf(kr.progress)
                  const due = monthYear(kr.dueOn)
                  return (
                    <li key={kr.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-7 flex-none items-center justify-center rounded-full bg-secondary font-display text-xs font-bold text-foreground">
                          {n}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">
                            {kr.kpiName || kr.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {due && <span>Meta: {due}</span>}
                            <span className={STATUS_TONE[status]}>
                              {KPI_STATUS_LABEL[status]}
                            </span>
                          </div>
                        </div>
                        <Trend status={status} />
                      </div>
                      <div className="mt-3 flex items-end gap-4">
                        <div className="min-w-0 flex-1">
                          <ProgressBar
                            value={kr.progress}
                            label={`Avance de ${kr.kpiName || kr.title}`}
                          />
                        </div>
                        <div className="text-right">
                          <div className="font-display text-lg font-bold leading-none text-foreground">
                            {formatValue(kr.current, kr.unit)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            de {formatValue(kr.targetValue, kr.unit)} ·{' '}
                            {formatPercent(kr.progress)}
                          </div>
                        </div>
                      </div>
                      {canRegister && kr.source === 'manual' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => setCheckin(kr)}
                        >
                          <TrendingUp className="size-4" />
                          Registrar avance
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        ))
      )}

      <CheckinDialog
        keyResult={checkin}
        onClose={() => setCheckin(null)}
        onSaved={() => {
          setCheckin(null)
          void refresh()
        }}
      />
    </div>
  )
}
