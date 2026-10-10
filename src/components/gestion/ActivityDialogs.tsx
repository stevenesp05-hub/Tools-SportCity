import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { Checkbox } from '#/components/ui/checkbox'
import { ChoiceSelect } from '#/components/ui/choice-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABEL,
  MONTH_NAMES,
  slotMonth,
  slotOf,
  slotRangeLabel,
  slotWeek,
} from '#/lib/okr'
import type { ActivityStatus } from '#/lib/okr'
import { saveActivity, setActivityStatus } from '#/server/gestion'
import type { Activity, Strategy } from '#/server/gestion'
import { colorOf } from '#/components/gestion/parts'
import { cn } from '#/lib/utils'

const NO_STRATEGY = '__none__'
const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'No se pudo guardar'

const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({
  value: String(i),
  label: name,
}))
const WEEK_OPTIONS = [1, 2, 3, 4].map((w) => ({
  value: String(w),
  label: `Semana ${w}`,
}))

function SlotPicker({
  label,
  slot,
  onChange,
}: {
  label: string
  slot: number
  onChange: (slot: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceSelect
          value={String(slotMonth(slot))}
          onChange={(m) => onChange(slotOf(Number(m), slotWeek(slot)))}
          ariaLabel={`${label}: mes`}
          className="h-9 w-full text-sm"
          options={MONTH_OPTIONS}
        />
        <ChoiceSelect
          value={String(slotWeek(slot))}
          onChange={(w) => onChange(slotOf(slotMonth(slot), Number(w)))}
          ariaLabel={`${label}: semana`}
          className="h-9 w-full text-sm"
          options={WEEK_OPTIONS}
        />
      </div>
    </div>
  )
}

// ---------- Crear / editar actividad ----------

export function ActivityDialog({
  open,
  year,
  activity,
  strategies,
  initialSlot,
  onClose,
  onSaved,
}: {
  open: boolean
  year: number
  activity: Activity | null
  strategies: Strategy[]
  initialSlot: number
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [strategyId, setStrategyId] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(1)
  const [status, setStatus] = useState<ActivityStatus>('pendiente')
  const [milestone, setMilestone] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(activity?.title ?? '')
    setStrategyId(activity?.strategyId ?? null)
    setOwnerName(activity?.ownerName ?? '')
    setStart(activity?.startSlot ?? initialSlot)
    setEnd(activity?.endSlot ?? initialSlot)
    setStatus(activity?.status ?? 'pendiente')
    setMilestone(activity?.milestone ?? false)
    setNotes(activity?.notes ?? '')
  }, [open, activity, initialSlot])

  const endOk = milestone || end >= start

  async function submit() {
    setBusy(true)
    try {
      await saveActivity({
        data: {
          id: activity?.id,
          year,
          strategyId,
          title,
          ownerName,
          startSlot: start,
          endSlot: milestone ? start : end,
          status,
          milestone,
          notes,
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
            {activity ? 'Editar actividad' : 'Nueva actividad'}
          </DialogTitle>
          <DialogDescription>
            Qué se hace, quién lo lleva y en qué semanas del año.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="act-title">Actividad</Label>
            <Input
              id="act-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Por ejemplo: Campaña de inscripciones de verano"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estrategia</Label>
              <ChoiceSelect
                value={strategyId ?? NO_STRATEGY}
                onChange={(v) => setStrategyId(v === NO_STRATEGY ? null : v)}
                ariaLabel="Estrategia"
                className="h-9 w-full text-sm"
                options={[
                  { value: NO_STRATEGY, label: 'Sin estrategia' },
                  ...strategies.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="act-owner">Responsable</Label>
              <Input
                id="act-owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={milestone}
              onCheckedChange={(v) => setMilestone(v === true)}
            />
            Es un hito (una fecha clave, no un periodo)
          </label>

          <div className={cn('grid gap-3', !milestone && 'sm:grid-cols-2')}>
            <SlotPicker
              label={milestone ? 'Cuándo' : 'Desde'}
              slot={start}
              onChange={(s) => {
                setStart(s)
                if (end < s) setEnd(s)
              }}
            />
            {!milestone && (
              <SlotPicker label="Hasta" slot={end} onChange={setEnd} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <ChoiceSelect
              value={status}
              onChange={setStatus}
              ariaLabel="Estado"
              className="h-9 w-full text-sm"
              options={ACTIVITY_STATUSES.map((s) => ({
                value: s,
                label: ACTIVITY_STATUS_LABEL[s],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-notes">Notas (opcional)</Label>
            <Textarea
              id="act-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-16"
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !title.trim() || !endOk}
            onClick={() => void submit()}
          >
            {activity ? 'Guardar cambios' : 'Añadir actividad'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Ver una actividad (y su estrategia) ----------

export function ActivityDetail({
  activity,
  strategy,
  canManage,
  canRegister,
  onClose,
  onOpenStrategy,
  onEdit,
  onDelete,
  onChanged,
}: {
  activity: Activity | null
  strategy: Strategy | null
  canManage: boolean
  canRegister: boolean
  onClose: () => void
  onOpenStrategy: () => void
  onEdit: () => void
  onDelete: () => void
  onChanged: () => void
}) {
  async function change(status: ActivityStatus) {
    if (!activity) return
    try {
      await setActivityStatus({ data: { id: activity.id, status } })
      onChanged()
    } catch (err) {
      toast.error(errorText(err))
    }
  }

  return (
    <Dialog open={activity !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {activity && (
          <>
            <DialogHeader>
              <DialogTitle>{activity.title}</DialogTitle>
              <DialogDescription>
                {slotRangeLabel(activity.startSlot, activity.endSlot)}
                {activity.ownerName && ` · ${activity.ownerName}`}
                {activity.milestone && ' · Hito'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {strategy && (
                <button
                  type="button"
                  onClick={onOpenStrategy}
                  className="flex w-full items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span
                    className={cn(
                      'size-3 flex-none rounded-full',
                      colorOf(strategy.color).dot,
                    )}
                  />
                  <span className="flex-1">
                    Estrategia: <strong>{strategy.name}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground">Ver</span>
                </button>
              )}
              {activity.notes && (
                <p className="text-sm text-muted-foreground">
                  {activity.notes}
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Estado</Label>
                {canRegister ? (
                  <ChoiceSelect
                    value={activity.status}
                    onChange={(v) => void change(v)}
                    ariaLabel="Estado"
                    className="h-9 w-full text-sm"
                    options={ACTIVITY_STATUSES.map((s) => ({
                      value: s,
                      label: ACTIVITY_STATUS_LABEL[s],
                    }))}
                  />
                ) : (
                  <p className="text-sm">
                    {ACTIVITY_STATUS_LABEL[activity.status]}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              {canManage && (
                <>
                  <Button variant="ghost" onClick={onDelete}>
                    <Trash2 className="size-4" />
                    Eliminar
                  </Button>
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
