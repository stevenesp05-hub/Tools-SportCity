import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import {
  budgetByGroup,
  budgetTotal,
  formatPercent,
  formatValue,
  shareOf,
} from '#/lib/okr'
import { deleteBudgetItem } from '#/server/gestion'
import type { BudgetItem } from '#/server/gestion'
import { Button } from '#/components/ui/button'
import { useDialogs } from '#/components/ui/dialogs'
import { EmptyState } from '#/components/documents/EmptyState'
import {
  Card,
  PageHeader,
  ProgressBar,
  STRATEGY_COLORS,
  YearSelect,
} from '#/components/gestion/parts'
import { useGestion } from '#/components/gestion/useGestion'
import {
  BudgetItemDialog,
  NotesDialog,
} from '#/components/gestion/BudgetDialogs'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/gestion/presupuesto')({
  component: PresupuestoPage,
})

function PresupuestoPage() {
  const { data, canManage, refresh, setYear } = useGestion()
  const { confirm } = useDialogs()
  const unit = data.okr.target.unit
  const [edit, setEdit] = useState<{ item: BudgetItem | null } | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const total = budgetTotal(data.budget)
  const spentTotal = data.budget.reduce((n, b) => n + b.spent, 0)
  const groups = budgetByGroup(
    data.budget.map((b) => ({
      amount: b.amount,
      spent: b.spent,
      group: b.groupName,
    })),
  )

  async function remove(item: BudgetItem) {
    const ok = await confirm({
      title: 'Eliminar partida',
      description: `Se elimina «${item.concept}» del presupuesto.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteBudgetItem({ data: { id: item.id } })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        tint="teal"
        icon={Wallet}
        title="Presupuesto"
        subtitle={`Distribución de recursos para el proyecto ${data.year}`}
      >
        <YearSelect year={data.year} years={data.years} onChange={setYear} />
        {canManage && (
          <Button size="sm" onClick={() => setEdit({ item: null })}>
            <Plus className="size-4" />
            Nueva partida
          </Button>
        )}
      </PageHeader>

      <section className="rounded-2xl bg-primary px-6 py-7 text-center text-primary-foreground">
        <div className="text-sm text-primary-foreground/70">
          Presupuesto total
        </div>
        <div className="mt-1 font-display text-4xl font-bold">
          {formatValue(total, unit)}
        </div>
        {total > 0 && (
          <div className="mt-2 text-sm text-primary-foreground/70">
            Gastado {formatValue(spentTotal, unit)} (
            {formatPercent(shareOf(spentTotal, total))})
          </div>
        )}
      </section>

      {data.budget.length === 0 ? (
        <EmptyState icon={Wallet}>
          {canManage
            ? 'Aún no hay partidas este año. Añade la primera: por ejemplo, material deportivo, publicidad o mantenimiento.'
            : 'Aún no hay partidas este año.'}
        </EmptyState>
      ) : (
        <>
          <Card className="overflow-hidden">
            <h2 className="border-b border-border px-5 py-4 font-display text-sm font-bold">
              Desglose por categoría
            </h2>
            <ul className="divide-y divide-border">
              {data.budget.map((b, i) => {
                const color = STRATEGY_COLORS[i % STRATEGY_COLORS.length]
                const share = shareOf(b.amount, total)
                return (
                  <li key={b.id} className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'size-3 flex-none rounded-full',
                          color.dot,
                        )}
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                        {b.concept}
                      </span>
                      <span className="font-display text-sm font-bold">
                        {formatValue(b.amount, unit)}
                      </span>
                      {canManage && (
                        <span className="flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Editar ${b.concept}`}
                            onClick={() => setEdit({ item: b })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Eliminar ${b.concept}`}
                            onClick={() => void remove(b)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar
                        value={share}
                        barClassName={color.bar}
                        className="flex-1"
                        label={`Parte del presupuesto: ${b.concept}`}
                      />
                      <span className="w-14 text-right text-xs text-muted-foreground">
                        {(share * 100).toFixed(1).replace('.', ',')} %
                      </span>
                    </div>
                    {b.spent > 0 && (
                      <p
                        className={cn(
                          'mt-1.5 text-xs',
                          b.spent > b.amount
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        Gastado {formatValue(b.spent, unit)} de{' '}
                        {formatValue(b.amount, unit)}
                        {b.spent > b.amount && ' · te has pasado'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          {groups.length > 1 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {groups.slice(0, 6).map((g) => (
                <Card key={g.group} className="p-5">
                  <div className="text-sm text-muted-foreground">{g.group}</div>
                  <div className="mt-1 font-display text-xl font-bold">
                    {formatValue(g.amount, unit)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatPercent(shareOf(g.amount, total))} del total
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-sm font-bold">
            Notas sobre el presupuesto
          </h2>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotesOpen(true)}
            >
              <Pencil className="size-4" />
              Editar
            </Button>
          )}
        </div>
        {data.budgetNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin notas. Aquí van los criterios: cómo se reparte, cuándo se revisa
            y qué se prioriza.
          </p>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
            {data.budgetNotes.map((n, i) => (
              <li key={`${i}-${n}`}>{n}</li>
            ))}
          </ul>
        )}
      </Card>

      <BudgetItemDialog
        open={edit !== null}
        year={data.year}
        item={edit?.item ?? null}
        unit={unit}
        groups={groups.map((g) => g.group).filter((g) => g !== 'Sin grupo')}
        strategies={data.strategies}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null)
          void refresh()
        }}
      />
      <NotesDialog
        open={notesOpen}
        notes={data.budgetNotes}
        onClose={() => setNotesOpen(false)}
        onSaved={() => {
          setNotesOpen(false)
          void refresh()
        }}
      />
    </div>
  )
}
