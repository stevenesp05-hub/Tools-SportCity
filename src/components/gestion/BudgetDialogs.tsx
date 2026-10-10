import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { ChoiceSelect } from '#/components/ui/choice-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { parseNumberInput } from '#/lib/okr'
import type { RoiConfig } from '#/lib/okr'
import { saveBudgetItem, saveBudgetNotes, saveRoi } from '#/server/gestion'
import type { BudgetItem, Strategy } from '#/server/gestion'

const NO_STRATEGY = '__none__'
const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'No se pudo guardar'

const toText = (n: number) => (n === 0 ? '' : String(n).replace('.', ','))

// ---------- Partida de presupuesto ----------

export function BudgetItemDialog({
  open,
  year,
  item,
  unit,
  groups,
  strategies,
  onClose,
  onSaved,
}: {
  open: boolean
  year: number
  item: BudgetItem | null
  unit: string
  groups: string[]
  strategies: Strategy[]
  onClose: () => void
  onSaved: () => void
}) {
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [spent, setSpent] = useState('')
  const [group, setGroup] = useState('')
  const [strategyId, setStrategyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setConcept(item?.concept ?? '')
    setAmount(toText(item?.amount ?? 0))
    setSpent(toText(item?.spent ?? 0))
    setGroup(item?.groupName ?? '')
    setStrategyId(item?.strategyId ?? null)
  }, [open, item])

  const amountValue = amount.trim() === '' ? 0 : parseNumberInput(amount)
  const spentValue = spent.trim() === '' ? 0 : parseNumberInput(spent)
  const valid =
    concept.trim() !== '' &&
    amountValue !== null &&
    amountValue >= 0 &&
    spentValue !== null &&
    spentValue >= 0

  async function submit() {
    if (amountValue === null || spentValue === null) return
    setBusy(true)
    try {
      await saveBudgetItem({
        data: {
          id: item?.id,
          year,
          concept,
          amount: amountValue,
          spent: spentValue,
          groupName: group,
          strategyId,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Editar partida' : 'Nueva partida de presupuesto'}
          </DialogTitle>
          <DialogDescription>
            Lo que se reserva para algo concreto y lo que ya se ha gastado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bg-concept">Concepto</Label>
            <Input
              id="bg-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Por ejemplo: Material deportivo"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bg-amount">Presupuestado ({unit})</Label>
              <Input
                id="bg-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bg-spent">Gastado ({unit})</Label>
              <Input
                id="bg-spent"
                inputMode="decimal"
                value={spent}
                onChange={(e) => setSpent(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bg-group">Grupo</Label>
            <Input
              id="bg-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Por ejemplo: Marketing"
              maxLength={100}
            />
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Estrategia (opcional)</Label>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !valid} onClick={() => void submit()}>
            {item ? 'Guardar cambios' : 'Añadir partida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Notas del presupuesto ----------

export function NotesDialog({
  open,
  notes,
  onClose,
  onSaved,
}: {
  open: boolean
  notes: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [list, setList] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setList(notes)
    setDraft('')
  }, [open, notes])

  function add() {
    const v = draft.trim()
    if (!v || list.length >= 12) return
    setList([...list, v])
    setDraft('')
  }

  async function submit() {
    setBusy(true)
    try {
      const final = draft.trim() ? [...list, draft.trim()] : list
      await saveBudgetNotes({ data: { notes: final } })
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
          <DialogTitle>Notas sobre el presupuesto</DialogTitle>
          <DialogDescription>
            Criterios y reglas: cómo se reparte, cuándo se revisa, qué se
            prioriza.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {list.map((n, i) => (
              <li
                key={`${i}-${n}`}
                className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm"
              >
                <span className="flex-1">{n}</span>
                <button
                  type="button"
                  aria-label="Quitar nota"
                  onClick={() => setList(list.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
              placeholder="Escribe una nota y pulsa Enter"
              maxLength={300}
              aria-label="Nueva nota"
            />
            <Button
              type="button"
              variant="outline"
              onClick={add}
              disabled={!draft.trim()}
            >
              <Plus className="size-4" />
              Añadir
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            Guardar notas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Parámetros del ROI ----------

export function RoiDialog({
  open,
  year,
  config,
  unit,
  onClose,
  onSaved,
}: {
  open: boolean
  year: number
  config: RoiConfig
  unit: string
  onClose: () => void
  onSaved: () => void
}) {
  const [annual, setAnnual] = useState('')
  const [rows, setRows] = useState<
    Array<{ customers: string; upsell: string }>
  >([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAnnual(toText(config.annualValue))
    setRows(
      config.projection.map((r) => ({
        customers: toText(r.customers),
        upsell: toText(r.upsell),
      })),
    )
  }, [open, config])

  const annualValue = annual.trim() === '' ? 0 : parseNumberInput(annual)
  const parsedRows = rows.map((r) => ({
    customers: r.customers.trim() === '' ? 0 : parseNumberInput(r.customers),
    upsell: r.upsell.trim() === '' ? 0 : parseNumberInput(r.upsell),
  }))
  const valid =
    annualValue !== null &&
    annualValue >= 0 &&
    parsedRows.every(
      (r) =>
        r.customers !== null &&
        Number.isInteger(r.customers) &&
        r.customers >= 0 &&
        r.upsell !== null &&
        r.upsell >= 0,
    )

  async function submit() {
    if (!valid) return
    setBusy(true)
    try {
      await saveRoi({
        data: {
          year,
          config: {
            annualValue,
            projection: parsedRows.map((r) => ({
              customers: r.customers ?? 0,
              upsell: r.upsell ?? 0,
            })),
          },
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
          <DialogTitle>Parámetros del ROI</DialogTitle>
          <DialogDescription>
            Con cuántos clientes se cuenta y cuánto deja cada uno. La inversión
            sale sola del presupuesto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roi-annual">
              Valor de un cliente al año ({unit})
            </Label>
            <Input
              id="roi-annual"
              inputMode="decimal"
              value={annual}
              onChange={(e) => setAnnual(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Proyección por año</Label>
            {rows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[3rem_1fr_1fr_2rem] items-center gap-2"
              >
                <span className="text-sm text-muted-foreground">
                  Año {i + 1}
                </span>
                <Input
                  inputMode="numeric"
                  aria-label={`Clientes del año ${i + 1}`}
                  placeholder="Clientes"
                  value={row.customers}
                  onChange={(e) =>
                    setRows(
                      rows.map((r, j) =>
                        j === i ? { ...r, customers: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Input
                  inputMode="decimal"
                  aria-label={`Venta adicional del año ${i + 1}`}
                  placeholder={`Venta adicional (${unit})`}
                  value={row.upsell}
                  onChange={(e) =>
                    setRows(
                      rows.map((r, j) =>
                        j === i ? { ...r, upsell: e.target.value } : r,
                      ),
                    )
                  }
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Quitar el año ${i + 1}`}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {rows.length < 5 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRows([...rows, { customers: '', upsell: '' }])
                }
              >
                <Plus className="size-4" />
                Añadir año
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !valid} onClick={() => void submit()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
