import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Target } from 'lucide-react'
import { toast } from 'sonner'
import { deleteKeyResult, deleteObjective } from '#/server/okr'
import type { OkrKeyResult, OkrObjective } from '#/server/okr'
import { daysLeft, periodLabel } from '#/lib/okr'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import { EmptyState } from '#/components/documents/EmptyState'
import { ObjectiveCard } from '#/components/okr/ObjectiveCard'
import {
  CheckinDialog,
  KeyResultDialog,
  ObjectiveDialog,
} from '#/components/okr/OkrDialogs'
import { PageHeader, PeriodSelect } from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'

export const Route = createFileRoute('/_authed/gestion/okr')({
  component: OkrPage,
})

function OkrPage() {
  const { data, canManage, canRegister, refresh, setPeriod } = useGestion()
  const { okr } = data
  const { confirm } = useDialogs()

  const [objectiveDialog, setObjectiveDialog] = useState<{
    objective: OkrObjective | null
  } | null>(null)
  const [krDialog, setKrDialog] = useState<{
    objectiveId: string
    keyResult: OkrKeyResult | null
  } | null>(null)
  const [checkin, setCheckin] = useState<OkrKeyResult | null>(null)

  async function removeObjective(o: OkrObjective) {
    const ok = await confirm({
      title: 'Eliminar objetivo',
      description: `Se elimina «${o.title}» con sus resultados clave y todo su historial de avances.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteObjective({ data: { id: o.id } })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  async function removeKeyResult(kr: OkrKeyResult) {
    const ok = await confirm({
      title: 'Eliminar resultado clave',
      description: `Se elimina «${kr.title}» y su historial de avances.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteKeyResult({ data: { id: kr.id } })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  const left = daysLeft(okr.period, new Date())

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="blue"
        icon={Target}
        title="OKR del proyecto"
        subtitle={`Objetivos y resultados clave · ${periodLabel(okr.period)}${left > 0 ? ` · quedan ${left} días` : ' · periodo terminado'}`}
      >
        <PeriodSelect
          period={okr.period}
          periods={okr.periods}
          onChange={setPeriod}
        />
        {canManage && (
          <Button
            size="sm"
            onClick={() => setObjectiveDialog({ objective: null })}
          >
            <Plus className="size-4" />
            Nuevo objetivo
          </Button>
        )}
      </PageHeader>

      {okr.objectives.length === 0 ? (
        <EmptyState icon={Target}>
          {canManage
            ? 'Aún no hay objetivos en este periodo. Crea el primero y añade los resultados clave que dirán si se cumple.'
            : 'Aún no hay objetivos en este periodo.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {okr.objectives.map((objective, i) => (
            <ObjectiveCard
              key={objective.id}
              index={i + 1}
              objective={objective}
              people={okr.people}
              canRegister={canRegister}
              canManage={canManage}
              onEdit={() => setObjectiveDialog({ objective })}
              onDelete={() => void removeObjective(objective)}
              onAddKeyResult={() =>
                setKrDialog({ objectiveId: objective.id, keyResult: null })
              }
              onEditKeyResult={(keyResult) =>
                setKrDialog({ objectiveId: objective.id, keyResult })
              }
              onDeleteKeyResult={(kr) => void removeKeyResult(kr)}
              onCheckin={setCheckin}
            />
          ))}
        </div>
      )}

      <ObjectiveDialog
        open={objectiveDialog !== null}
        period={okr.period}
        objective={objectiveDialog?.objective ?? null}
        people={okr.people}
        onClose={() => setObjectiveDialog(null)}
        onSaved={() => {
          setObjectiveDialog(null)
          void refresh()
        }}
      />
      <KeyResultDialog
        open={krDialog !== null}
        objectiveId={krDialog?.objectiveId ?? ''}
        keyResult={krDialog?.keyResult ?? null}
        people={okr.people}
        onClose={() => setKrDialog(null)}
        onSaved={() => {
          setKrDialog(null)
          void refresh()
        }}
      />
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
