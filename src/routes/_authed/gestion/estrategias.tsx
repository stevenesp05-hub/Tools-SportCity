import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Lightbulb, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { STRATEGY_STATUS_LABEL, formatPercent } from '#/lib/okr'
import { deleteStrategy } from '#/server/gestion'
import type { Strategy } from '#/server/gestion'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import { EmptyState } from '#/components/documents/EmptyState'
import {
  Card,
  PageHeader,
  ProgressBar,
  YearSelect,
  colorOf,
} from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'
import {
  StrategyDetail,
  StrategyDialog,
} from '#/components/gestion/StrategyDialogs'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/gestion/estrategias')({
  component: EstrategiasPage,
})

function EstrategiasPage() {
  const { data, canManage, canRegister, refresh, setYear } = useGestion()
  const { confirm } = useDialogs()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ strategy: Strategy | null } | null>(null)

  const detail = data.strategies.find((s) => s.id === detailId) ?? null
  const suggestions = useMemo(
    () =>
      [
        ...new Set([
          ...data.okr.people.map((p) => p.name),
          ...data.strategies.flatMap((s) => s.team),
          ...data.activities.map((a) => a.ownerName).filter(Boolean),
        ]),
      ].sort((a, b) => a.localeCompare(b, 'es')),
    [data],
  )

  async function remove(strategy: Strategy) {
    const ok = await confirm({
      title: 'Eliminar estrategia',
      description: `Se elimina «${strategy.name}». Sus actividades y partidas de presupuesto se conservan, pero sin estrategia.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteStrategy({ data: { id: strategy.id } })
      setDetailId(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="amber"
        icon={Lightbulb}
        title="Estrategias"
        subtitle={`${data.strategies.length} ${data.strategies.length === 1 ? 'estrategia clave' : 'estrategias clave'} para el crecimiento · ${data.year}`}
      >
        <YearSelect year={data.year} years={data.years} onChange={setYear} />
        {canManage && (
          <Button size="sm" onClick={() => setEdit({ strategy: null })}>
            <Plus className="size-4" />
            Nueva estrategia
          </Button>
        )}
      </PageHeader>

      {data.strategies.length === 0 ? (
        <EmptyState icon={Lightbulb}>
          {canManage
            ? 'Aún no hay estrategias este año. Crea la primera: por ejemplo, una campaña de inscripciones o un torneo.'
            : 'Aún no hay estrategias este año.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.strategies.map((s) => {
            const color = colorOf(s.color)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setDetailId(s.id)}
                className="text-left"
              >
                <Card className="h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className={cn('h-1.5', color.bar)} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 font-display text-2xs font-bold uppercase tracking-wide',
                          color.soft,
                        )}
                      >
                        {STRATEGY_STATUS_LABEL[s.status]}
                      </span>
                      <span className="font-display text-sm font-bold text-foreground">
                        {formatPercent(s.progress)}
                      </span>
                    </div>
                    <h2 className="mt-3 font-display text-base font-bold text-foreground">
                      {s.name}
                    </h2>
                    {s.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {s.description}
                      </p>
                    )}
                    <div className="mt-4">
                      <ProgressBar
                        value={s.progress}
                        barClassName={color.bar}
                        label={`Avance de ${s.name}`}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {s.team.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" />
                          {s.team.join(', ')}
                        </span>
                      )}
                      <span>
                        {s.activityCount}{' '}
                        {s.activityCount === 1 ? 'actividad' : 'actividades'}
                      </span>
                    </div>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      <StrategyDetail
        strategy={detail}
        activities={data.activities}
        budget={data.budget}
        unit={data.okr.target.unit}
        canManage={canManage}
        canRegister={canRegister}
        onClose={() => setDetailId(null)}
        onEdit={() => detail && setEdit({ strategy: detail })}
        onDelete={() => detail && void remove(detail)}
        onChanged={() => void refresh()}
      />
      <StrategyDialog
        open={edit !== null}
        year={data.year}
        strategy={edit?.strategy ?? null}
        suggestions={suggestions}
        usedColors={data.strategies.map((s) => s.color)}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null)
          void refresh()
        }}
      />
    </div>
  )
}
