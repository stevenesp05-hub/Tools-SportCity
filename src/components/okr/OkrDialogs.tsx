import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { DatePicker } from '#/components/ui/date-picker'
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
  AUTO_METRICS,
  formatValue,
  isAutoMetric,
  monthLabel,
  parseNumberInput,
} from '#/lib/okr'
import type { AutoMetricId } from '#/lib/okr'
import {
  addCheckin,
  saveIncome,
  saveIncomeTarget,
  saveKeyResult,
  saveObjective,
} from '#/server/okr'
import type { OkrKeyResult, OkrObjective, OkrPerson } from '#/server/okr'

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'No se pudo guardar'

const NO_OWNER = '__none__'

function OwnerSelect({
  value,
  onChange,
  people,
}: {
  value: string | null
  onChange: (id: string | null) => void
  people: OkrPerson[]
}) {
  return (
    <ChoiceSelect
      value={value ?? NO_OWNER}
      onChange={(v) => onChange(v === NO_OWNER ? null : v)}
      ariaLabel="Responsable"
      className="h-9 w-full text-sm"
      options={[
        { value: NO_OWNER, label: 'Sin responsable' },
        ...people.map((p) => ({ value: p.id, label: p.name })),
      ]}
    />
  )
}

// ---------- Objetivo ----------

export function ObjectiveDialog({
  open,
  period,
  objective,
  people,
  onClose,
  onSaved,
}: {
  open: boolean
  period: string
  objective: OkrObjective | null
  people: OkrPerson[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(objective?.title ?? '')
    setDescription(objective?.description ?? '')
    setOwnerId(objective?.ownerId ?? null)
  }, [open, objective])

  const problem = title.trim() ? nameCaseError(title) : null

  async function submit() {
    setBusy(true)
    try {
      await saveObjective({
        data: {
          id: objective?.id,
          period,
          title,
          description,
          ownerId,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {objective ? 'Editar objetivo' : 'Nuevo objetivo'}
          </DialogTitle>
          <DialogDescription>
            Lo que queremos conseguir en este periodo, escrito en una frase
            clara y que inspire.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="okr-title">Objetivo</Label>
            <Input
              id="okr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Por ejemplo: Llegar a un ingreso mensual de 1.000.000"
              maxLength={200}
            />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="okr-desc">Por qué importa (opcional)</Label>
            <Textarea
              id="okr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <OwnerSelect
              value={ownerId}
              onChange={setOwnerId}
              people={people}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !title.trim() || problem !== null}
            onClick={() => void submit()}
          >
            {objective ? 'Guardar cambios' : 'Crear objetivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Resultado clave ----------

export function KeyResultDialog({
  open,
  objectiveId,
  keyResult,
  people,
  onClose,
  onSaved,
}: {
  open: boolean
  objectiveId: string
  keyResult: OkrKeyResult | null
  people: OkrPerson[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [kpiName, setKpiName] = useState('')
  const [unit, setUnit] = useState('')
  const [start, setStart] = useState('0')
  const [target, setTarget] = useState('')
  const [source, setSource] = useState<'manual' | 'auto'>('manual')
  const [metric, setMetric] = useState<AutoMetricId | ''>('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [dueOn, setDueOn] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(keyResult?.title ?? '')
    setKpiName(keyResult?.kpiName ?? '')
    setUnit(keyResult?.unit ?? '')
    setStart(String(keyResult?.startValue ?? 0).replace('.', ','))
    setTarget(keyResult ? String(keyResult.targetValue).replace('.', ',') : '')
    setSource(keyResult?.source ?? 'manual')
    setMetric(keyResult?.autoMetric ?? '')
    setOwnerId(keyResult?.ownerId ?? null)
    setDueOn(keyResult?.dueOn ?? null)
  }, [open, keyResult])

  const startValue = parseNumberInput(start)
  const targetValue = parseNumberInput(target)
  const problem = title.trim() ? nameCaseError(title) : null
  const sameValues =
    startValue !== null && targetValue !== null && startValue === targetValue
  const valid =
    title.trim() !== '' &&
    problem === null &&
    startValue !== null &&
    targetValue !== null &&
    !sameValues &&
    (source === 'manual' || isAutoMetric(metric))

  async function submit() {
    if (startValue === null || targetValue === null) return
    setBusy(true)
    try {
      await saveKeyResult({
        data: {
          id: keyResult?.id,
          objectiveId,
          title,
          kpiName,
          unit,
          startValue,
          targetValue,
          source,
          autoMetric: source === 'auto' && isAutoMetric(metric) ? metric : null,
          ownerId,
          dueOn,
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
            {keyResult ? 'Editar resultado clave' : 'Nuevo resultado clave'}
          </DialogTitle>
          <DialogDescription>
            Algo que se pueda medir con un número y que diga si el objetivo se
            está cumpliendo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kr-title">Resultado clave</Label>
            <Input
              id="kr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Por ejemplo: Alcanzar 120 alumnos en la academia"
              maxLength={200}
            />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kr-kpi">Indicador (KPI)</Label>
            <Input
              id="kr-kpi"
              value={kpiName}
              onChange={(e) => setKpiName(e.target.value)}
              placeholder="Por ejemplo: Nº de alumnos activos"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Cómo se llama lo que se mide. Aparece en la sección KPI.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kr-start">Valor inicial</Label>
              <Input
                id="kr-start"
                inputMode="decimal"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kr-target">Meta</Label>
              <Input
                id="kr-target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="120"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kr-unit">Unidad</Label>
              <Input
                id="kr-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="C$, %, alumnos"
                maxLength={20}
              />
            </div>
          </div>
          {sameValues && (
            <p className="-mt-2 text-xs text-destructive">
              La meta tiene que ser distinta del valor inicial.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Cómo se mide</Label>
            <ChoiceSelect
              value={source}
              onChange={setSource}
              ariaLabel="Cómo se mide"
              className="h-9 w-full text-sm"
              options={[
                { value: 'manual', label: 'Lo anoto yo con avances' },
                { value: 'auto', label: 'Se calcula con datos de Tools' },
              ]}
            />
            {source === 'auto' && (
              <>
                <ChoiceSelect
                  value={metric}
                  onChange={setMetric}
                  placeholder="Elige el dato"
                  ariaLabel="Dato de Tools"
                  className="mt-2 h-9 w-full text-sm"
                  options={AUTO_METRICS.map((m) => ({
                    value: m.id,
                    label: m.label,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  {AUTO_METRICS.find((m) => m.id === metric)?.help ??
                    'Se cuenta solo, dentro de las fechas del periodo.'}
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <OwnerSelect
                value={ownerId}
                onChange={setOwnerId}
                people={people}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha límite</Label>
              <DatePicker
                value={dueOn}
                onChange={setDueOn}
                className="h-9 w-full justify-start text-sm"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !valid} onClick={() => void submit()}>
            {keyResult ? 'Guardar cambios' : 'Añadir resultado clave'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Avance (check-in) ----------

export function CheckinDialog({
  keyResult,
  onClose,
  onSaved,
}: {
  keyResult: OkrKeyResult | null
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!keyResult) return
    setValue(String(keyResult.current).replace('.', ','))
    setNote('')
  }, [keyResult])

  const parsed = parseNumberInput(value)

  async function submit() {
    if (!keyResult || parsed === null) return
    setBusy(true)
    try {
      await addCheckin({
        data: { keyResultId: keyResult.id, value: parsed, note },
      })
      toast.success('Avance registrado')
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={keyResult !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar avance</DialogTitle>
          <DialogDescription>{keyResult?.title}</DialogDescription>
        </DialogHeader>
        {keyResult && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="checkin-value">
                Valor actual ({keyResult.unit || 'número'})
              </Label>
              <Input
                id="checkin-value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Antes: {formatValue(keyResult.current, keyResult.unit)}. Meta:{' '}
                {formatValue(keyResult.targetValue, keyResult.unit)}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkin-note">Qué ha pasado (opcional)</Label>
              <Textarea
                id="checkin-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-20"
                maxLength={1000}
                placeholder="Por ejemplo: entraron 6 alumnos nuevos con la promoción"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || parsed === null}
            onClick={() => void submit()}
          >
            Guardar avance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Ingresos del mes y meta ----------

export function IncomeDialog({
  open,
  month,
  initialAmount,
  initialNote,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean
  month: string
  initialAmount: number
  initialNote: string
  unit: string
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount(initialAmount > 0 ? String(initialAmount).replace('.', ',') : '')
    setNote(initialNote)
  }, [open, initialAmount, initialNote])

  const parsed = parseNumberInput(amount)

  async function submit() {
    if (parsed === null || parsed < 0) return
    setBusy(true)
    try {
      await saveIncome({ data: { month, amount: parsed, note } })
      toast.success('Ingresos guardados')
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresos de {monthLabel(month)}</DialogTitle>
          <DialogDescription>
            Suma de lo cobrado en el mes. Puedes volver a anotarlo cuando
            cambie: queda el último valor.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="income-amount">Ingresos ({unit})</Label>
            <Input
              id="income-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="550.000"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="income-note">Nota (opcional)</Label>
            <Input
              id="income-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Por ejemplo: incluye torneo de agosto"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || parsed === null || parsed < 0}
            onClick={() => void submit()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TargetDialog({
  open,
  current,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean
  current: number
  unit: string
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setValue(String(current))
  }, [open, current])

  const parsed = parseNumberInput(value)

  async function submit() {
    if (parsed === null || parsed <= 0) return
    setBusy(true)
    try {
      await saveIncomeTarget({ data: { target: parsed } })
      onSaved()
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meta de ingresos mensuales</DialogTitle>
          <DialogDescription>
            Lo que queremos ingresar cada mes. Es la estrella del norte: todos
            los objetivos deberían acercarnos a esta cifra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="target-value">Meta mensual ({unit})</Label>
          <Input
            id="target-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || parsed === null || parsed <= 0}
            onClick={() => void submit()}
          >
            Guardar meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
