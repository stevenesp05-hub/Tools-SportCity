import { useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownRight,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

type Row = { id: number; depth: number; name: string; role: string }

const clean = (value: string) =>
  value.replace(/\s*[|–—]\s*|\s+-\s+/g, ' / ').replace(/\n/g, ' ')

/** Texto "Nombre | Cargo" con sangría de 2 espacios (formato guardado) → filas planas. */
function fromText(text: string, nextId: () => number): Row[] {
  const rows: Row[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const indent = /^[ \t]*/.exec(raw)?.[0].replace(/\t/g, '  ').length ?? 0
    const content = raw.trim().replace(/^[-•*]\s+/, '')
    const [name, ...rest] = content.split(/\s*[|–—]\s*|\s+-\s+/)
    rows.push({
      id: nextId(),
      depth: Math.floor(indent / 2),
      name: name.trim(),
      role: rest.join(' · ').trim(),
    })
  }
  return rows
}

export function orgToText(rows: Row[]): string {
  return rows
    .filter((r) => r.name.trim() || r.role.trim())
    .map(
      (r) =>
        `${'  '.repeat(r.depth)}${clean(r.name.trim()) || 'Sin nombre'}${
          r.role.trim() ? ` | ${clean(r.role.trim())}` : ''
        }`,
    )
    .join('\n')
}

/** Fin del subárbol que empieza en `i` (índice exclusivo). */
function subtreeEnd(rows: Row[], i: number) {
  let end = i + 1
  while (end < rows.length && rows[end].depth > rows[i].depth) end += 1
  return end
}

/**
 * Editor visual de organigramas: una fila por persona, con botones para añadir subordinados,
 * subir/bajar y cambiar de nivel. Guarda el mismo formato de texto de siempre.
 */
export function OrgTreeEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (text: string) => void
}) {
  const counter = useRef(0)
  const nextId = () => (counter.current += 1)
  const [rows, setRows] = useState<Row[]>(() => fromText(value, nextId))
  const focusId = useRef<number | null>(null)

  function commit(next: Row[], focus?: number) {
    focusId.current = focus ?? null
    setRows(next)
    onChange(orgToText(next))
  }
  const patch = (id: number, p: Partial<Row>) =>
    commit(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))

  function addAfter(i: number, depth: number) {
    const row: Row = { id: nextId(), depth, name: '', role: '' }
    const at = subtreeEnd(rows, i)
    commit([...rows.slice(0, at), row, ...rows.slice(at)], row.id)
  }
  function addChild(i: number) {
    const row: Row = {
      id: nextId(),
      depth: rows[i].depth + 1,
      name: '',
      role: '',
    }
    const at = subtreeEnd(rows, i)
    commit([...rows.slice(0, at), row, ...rows.slice(at)], row.id)
  }
  function remove(i: number) {
    const end = subtreeEnd(rows, i)
    commit([...rows.slice(0, i), ...rows.slice(end)])
  }
  function shiftDepth(i: number, delta: number) {
    const end = subtreeEnd(rows, i)
    if (delta < 0 && rows[i].depth === 0) return
    // No puede quedar más de un nivel por debajo de la fila anterior.
    if (delta > 0 && (i === 0 || rows[i].depth > rows[i - 1].depth)) return
    commit(
      rows.map((r, j) =>
        j >= i && j < end ? { ...r, depth: r.depth + delta } : r,
      ),
    )
  }
  function move(i: number, dir: -1 | 1) {
    const end = subtreeEnd(rows, i)
    const block = rows.slice(i, end)
    if (dir === -1) {
      let j = i - 1
      while (j >= 0 && rows[j].depth > rows[i].depth) j -= 1
      if (j < 0 || rows[j].depth !== rows[i].depth) return
      commit([
        ...rows.slice(0, j),
        ...block,
        ...rows.slice(j, i),
        ...rows.slice(end),
      ])
    } else {
      if (end >= rows.length || rows[end].depth !== rows[i].depth) return
      const nextEnd = subtreeEnd(rows, end)
      commit([
        ...rows.slice(0, i),
        ...rows.slice(end, nextEnd),
        ...block,
        ...rows.slice(nextEnd),
      ])
    }
  }

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li
            key={row.id}
            className="flex items-center gap-1"
            style={{ paddingLeft: `${row.depth * 1.25}rem` }}
          >
            {row.depth > 0 && (
              <CornerDownRight className="size-3.5 flex-none text-muted-foreground" />
            )}
            <Input
              autoFocus={focusId.current === row.id}
              value={row.name}
              placeholder="Nombre o área"
              aria-label="Nombre o área"
              onChange={(e) => patch(row.id, { name: e.target.value })}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Input
              value={row.role}
              placeholder="Cargo o responsable"
              aria-label="Cargo o responsable"
              onChange={(e) => patch(row.id, { role: e.target.value })}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <div className="flex flex-none items-center">
              <RowButton label="Añadir subordinado" onClick={() => addChild(i)}>
                <Plus className="size-3.5" />
              </RowButton>
              <RowButton
                label="Añadir al mismo nivel"
                onClick={() => addAfter(i, row.depth)}
              >
                <ArrowDown className="size-3.5 rotate-[-45deg]" />
              </RowButton>
              <RowButton
                label="Subir de nivel"
                onClick={() => shiftDepth(i, -1)}
              >
                <ArrowLeft className="size-3.5" />
              </RowButton>
              <RowButton
                label="Bajar de nivel"
                onClick={() => shiftDepth(i, 1)}
              >
                <ArrowRight className="size-3.5" />
              </RowButton>
              <RowButton label="Mover arriba" onClick={() => move(i, -1)}>
                <ArrowUp className="size-3.5" />
              </RowButton>
              <RowButton label="Mover abajo" onClick={() => move(i, 1)}>
                <ArrowDown className="size-3.5" />
              </RowButton>
              <RowButton
                label="Eliminar (y su equipo)"
                onClick={() => remove(i)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </RowButton>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const row: Row = { id: nextId(), depth: 0, name: '', role: '' }
          commit([...rows, row], row.id)
        }}
      >
        <Plus className="size-4" /> Añadir persona o área
      </Button>
    </div>
  )
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
