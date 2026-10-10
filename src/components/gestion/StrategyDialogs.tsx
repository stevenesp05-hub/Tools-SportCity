import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { ChoiceSelect } from '#/components/ui/choice-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { nameCaseError } from '#/lib/name-rules'
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABEL,
  STRATEGY_STATUSES,
  STRATEGY_STATUS_LABEL,
  formatPercent,
  formatValue,
  slotRangeLabel,
} from '#/lib/okr'
import type { ActivityStatus, StrategyStatus } from '#/lib/okr'
import { saveStrategy, setActivityStatus } from '#/server/gestion'
import type { Activity, BudgetItem, Strategy } from '#/server/gestion'
import {
  STRATEGY_COLORS,
  ProgressBar,
  colorOf,
} from '#/components/gestion/parts'
import { cn } from '#/lib/utils'

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'No se pudo guardar'

// ---------- Editar / crear estrategia ----------

export function StrategyDialog({
  open,
  year,
  strategy,
  suggestions,
  usedColors,
  onClose,
  onSaved,
}: {
  open: boolean
  year: number
  strategy: Strategy | null
  /** Nombres que ya se usan en el equipo, para añadirlos con un clic. */
  suggestions: string[]
  usedColors: number[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<StrategyStatus>('planificada')
  const [progress, setProgress] = useState('0')
  const [team, setTeam] = useState<string[]>([])
  const [member, setMember] = useState('')
  const [color, setColor] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(strategy?.name ?? '')
    setDescription(strategy?.description ?? '')
    setStatus(strategy?.status ?? 'planificada')
    setProgress(String(strategy?.manualProgress ?? 0))
    setTeam(strategy?.team ?? [])
    setMember('')
    const free = STRATEGY_COLORS.findIndex((_, i) => !usedColors.includes(i))
    setColor(strategy?.color ?? (free === -1 ? 0 : free))
  }, [open, strategy, usedColors])

  const problem = name.trim() ? nameCaseError(name) : null
  const manual = Math.round(Number(progress.replace(',', '.')))
  const manualOk = Number.isFinite(manual) && manual >= 0 && manual <= 100

  function addMember(value: string) {
    const v = value.trim()
    if (!v || team.includes(v) || team.length >= 12) return
    setTeam([...team, v])
    setMember('')
  }

  async function submit() {
    setBusy(true)
    try {
      await saveStrategy({
        data: {
          id: strategy?.id,
          year,
          name,
          description,
          status,
          progress: manualOk ? manual : 0,
          team,
          color,
        },
      })
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {strategy ? 'Editar estrategia' : 'Nueva estrategia'}
          </DialogTitle>
          <DialogDescription>
            Una línea de trabajo con su equipo y su avance. Las actividades del
            plan de acción cuelgan de ella.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-name">Nombre</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Por ejemplo: Campaña de inscripciones"
              maxLength={200}
            />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-desc">Qué incluye</Label>
            <Textarea
              id="st-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16"
              maxLength={1000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <ChoiceSelect
                value={status}
                onChange={setStatus}
                ariaLabel="Estado"
                className="h-9 w-full text-sm"
                options={STRATEGY_STATUSES.map((s) => ({
                  value: s,
                  label: STRATEGY_STATUS_LABEL[s],
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-progress">Avance (%)</Label>
              <Input
                id="st-progress"
                inputMode="numeric"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                disabled={(strategy?.activityCount ?? 0) > 0}
              />
              {(strategy?.activityCount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se calcula con sus actividades.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Color en el plan</Label>
            <div className="flex flex-wrap gap-2">
              {STRATEGY_COLORS.map((c, i) => (
                <button
                  key={c.dot}
                  type="button"
                  aria-label={`Color ${i + 1}`}
                  aria-pressed={color === i}
                  onClick={() => setColor(i)}
                  className={cn(
                    'size-7 rounded-full border-2 transition-transform',
                    c.dot,
                    color === i
                      ? 'scale-110 border-foreground'
                      : 'border-transparent',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-member">Equipo</Label>
            <div className="flex gap-2">
              <Input
                id="st-member"
                value={member}
                onChange={(e) => setMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMember(member)
                  }
                }}
                placeholder="Nombre y Enter"
                maxLength={100}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addMember(member)}
                disabled={!member.trim()}
              >
                <Plus className="size-4" />
                Añadir
              </Button>
            </div>
            {team.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {team.map((t) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                  >
                    {t}
                    <button
                      type="button"
                      aria-label={`Quitar a ${t}`}
                      onClick={() => setTeam(team.filter((x) => x !== t))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {suggestions.filter((s) => !team.includes(s)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions
                  .filter((s) => !team.includes(s))
                  .slice(0, 8)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addMember(s)}
                      className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !name.trim() || problem !== null || !manualOk}
            onClick={() => void submit()}
          >
            {strategy ? 'Guardar cambios' : 'Crear estrategia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Detalle de una estrategia ----------

export function StrategyDetail({
  strategy,
  activities,
  budget,
  unit,
  canManage,
  canRegister,
  onClose,
  onEdit,
  onDelete,
  onChanged,
}: {
  strategy: Strategy | null
  activities: Activity[]
  budget: BudgetItem[]
  unit: string
  canManage: boolean
  canRegister: boolean
  onClose: () => void
  onEdit: () => void
  /** Sin esta función no se ofrece eliminar (p. ej. al abrirla desde el plan de acción). */
  onDelete?: () => void
  onChanged: () => void
}) {
  async function change(id: string, status: ActivityStatus) {
    try {
      await setActivityStatus({ data: { id, status } })
      onChanged()
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  const mine = strategy
    ? activities.filter((a) => a.strategyId === strategy.id)
    : []
  const lines = strategy
    ? budget.filter((b) => b.strategyId === strategy.id)
    : []
  const color = colorOf(strategy?.color ?? 0)

  return (
    <Dialog open={strategy !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {strategy && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={cn('size-3 rounded-full', color.dot)} />
                {strategy.name}
              </DialogTitle>
              <DialogDescription>
                {STRATEGY_STATUS_LABEL[strategy.status]}
                {strategy.description && ` · ${strategy.description}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Avance</span>
                  <span className="font-display font-bold">
                    {formatPercent(strategy.progress)}
                  </span>
                </div>
                <ProgressBar
                  value={strategy.progress}
                  barClassName={color.bar}
                  label="Avance de la estrategia"
                />
                {strategy.team.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Equipo: {strategy.team.join(', ')}
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-display text-sm font-bold">
                  Actividades ({mine.length})
                </h3>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no tiene actividades en el plan de acción.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {mine.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{a.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {slotRangeLabel(a.startSlot, a.endSlot)}
                            {a.ownerName && ` · ${a.ownerName}`}
                          </div>
                        </div>
                        {canRegister ? (
                          <ChoiceSelect
                            value={a.status}
                            onChange={(v) => void change(a.id, v)}
                            ariaLabel={`Estado de ${a.title}`}
                            className="h-8 w-36"
                            options={ACTIVITY_STATUSES.map((s) => ({
                              value: s,
                              label: ACTIVITY_STATUS_LABEL[s],
                            }))}
                          />
                        ) : (
                          <span className="text-xs">
                            {ACTIVITY_STATUS_LABEL[a.status]}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {lines.length > 0 && (
                <div>
                  <h3 className="mb-2 font-display text-sm font-bold">
                    Presupuesto
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {lines.map((b) => (
                      <li key={b.id} className="flex justify-between gap-3">
                        <span>{b.concept}</span>
                        <span className="font-medium">
                          {formatValue(b.amount, unit)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              {canManage && (
                <>
                  {onDelete && (
                    <Button variant="ghost" onClick={onDelete}>
                      <Trash2 className="size-4" />
                      Eliminar
                    </Button>
                  )}
                  <Button variant="outline" onClick={onEdit}>
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                </>
              )}
              <Button onClick={onClose}>Cerrar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
