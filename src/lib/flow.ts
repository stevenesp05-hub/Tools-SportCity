import type { ChartNode } from '#/lib/charts'

/**
 * Diagramas de flujo escritos como texto. La sintaxis es un subconjunto de la de Mermaid (así se puede
 * copiar y pegar un diagrama de ejemplo): se dibujan como SVG ya hecho, igual que los gráficos y los
 * organigramas, de modo que salen idénticos en el editor, el PDF y el Word sin cargar nada al abrirlos.
 *
 *   flowchart TD            ← opcional: TD (arriba a abajo) o LR (izquierda a derecha)
 *   A([Llega el cliente]) --> B{¿Tiene reserva?}
 *   B -->|Sí| C[Confirmar la cancha]
 *   B -->|No| D[Ofrecer horarios]
 *   D --> C
 *
 * Formas: [texto] paso, (texto) paso redondeado, ([texto]) inicio o fin, {texto} decisión.
 * Flechas: `-->`, `---` (sin punta), con etiqueta: `-->|texto|` o `-- texto -->`.
 */

export const MAX_FLOW_NODES = 40
export const MAX_FLOW_EDGES = 80

export type FlowShape = 'step' | 'round' | 'terminal' | 'decision'
export type FlowDirection = 'TD' | 'LR'
export type FlowNode = { id: string; label: string; shape: FlowShape }
export type FlowEdge = {
  from: string
  to: string
  label: string
  arrow: boolean
}
export type ParsedFlow = {
  direction: FlowDirection
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Líneas que no se entendieron o límites superados: se muestran junto a la vista previa. */
  problems: string[]
}

const ID = '[A-Za-z_][A-Za-z0-9_]*'
// Un nodo: id seguido (opcional) de su forma. El texto no puede llevar los cierres de su propia forma.
const NODE = new RegExp(
  `^(${ID})(?:\\(\\[([^\\]]*)\\]\\)|\\[([^\\]]*)\\]|\\(([^)]*)\\)|\\{([^}]*)\\})?`,
)

const clean = (value: string) =>
  value
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, ' ')

/** Lee el texto. Nunca lanza: lo que no entiende queda en `problems` y se sigue con el resto. */
export function parseFlow(input: string): ParsedFlow {
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  const problems: string[] = []
  let direction: FlowDirection = 'TD'

  const touch = (rest: string): { id: string; rest: string } | null => {
    const m = NODE.exec(rest)
    if (!m) return null
    const [whole, id] = m as unknown as [string, string]
    const [, , terminal, step, round, decision] = m as unknown as Array<
      string | undefined
    >
    const label = terminal ?? step ?? round ?? decision
    const shape: FlowShape =
      terminal !== undefined
        ? 'terminal'
        : decision !== undefined
          ? 'decision'
          : round !== undefined
            ? 'round'
            : 'step'
    const known = nodes.get(id)
    if (label !== undefined) {
      if (known) {
        known.label = clean(label) || id
        known.shape = shape
      } else if (nodes.size < MAX_FLOW_NODES)
        nodes.set(id, { id, label: clean(label) || id, shape })
    } else if (!known && nodes.size < MAX_FLOW_NODES)
      nodes.set(id, { id, label: id, shape: 'step' })
    return { id, rest: rest.slice(whole.length).trimStart() }
  }

  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/%%.*$/, '').trim()
    if (!line) continue
    const head = /^(?:flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/i.exec(line)
    if (head) {
      direction = /LR|RL/i.test(head[1]) ? 'LR' : 'TD'
      continue
    }
    // Una línea puede encadenar: A --> B --> C
    let cursor = touch(line)
    if (!cursor) {
      problems.push(`No se entiende: «${line.slice(0, 40)}»`)
      continue
    }
    while (cursor.rest) {
      const link =
        /^(?:(-->|---|-\.->|==>)\s*(?:\|([^|]*)\|)?|--\s+([^-]+?)\s+(-->|---))\s*/.exec(
          cursor.rest,
        )
      if (!link) {
        problems.push(`No se entiende: «${cursor.rest.slice(0, 40)}»`)
        break
      }
      const groups = link as unknown as Array<string | undefined>
      const arrowToken = groups[1] ?? groups[4]
      const label = clean(groups[2] ?? groups[3] ?? '')
      const next = touch(cursor.rest.slice(link[0].length))
      if (!next) {
        problems.push(`Falta el paso al que llega: «${line.slice(0, 40)}»`)
        break
      }
      if (nodes.has(cursor.id) && nodes.has(next.id)) {
        if (edges.length < MAX_FLOW_EDGES)
          edges.push({
            from: cursor.id,
            to: next.id,
            label,
            arrow: arrowToken !== '---',
          })
        else if (!problems.includes('Hay demasiadas flechas.'))
          problems.push('Hay demasiadas flechas.')
      }
      cursor = next
    }
  }
  if (nodes.size >= MAX_FLOW_NODES)
    problems.push(`Se muestran solo los primeros ${MAX_FLOW_NODES} pasos.`)
  return { direction, nodes: [...nodes.values()], edges, problems }
}

// ---------- Disposición ----------

const FS = 10.5
const LINE_H = 13.5
const CHAR_W = FS * 0.58
const MAX_CHARS = 24
const PAD = 14

type Box = {
  id: string
  w: number
  h: number
  lines: string[]
  shape: FlowShape
}

/** Parte el texto de un paso en líneas de unos 24 caracteres, sin cortar palabras. */
export function wrapLabel(label: string): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of label.split(' ')) {
    if (current && `${current} ${word}`.length > MAX_CHARS) {
      lines.push(current)
      current = word
    } else current = current ? `${current} ${word}` : word
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function measure(node: FlowNode): Box {
  const lines = wrapLabel(node.label)
  const textW = Math.max(...lines.map((l) => l.length)) * CHAR_W
  const textH = lines.length * LINE_H
  if (node.shape === 'decision')
    return {
      id: node.id,
      shape: node.shape,
      lines,
      w: Math.max(textW * 1.5 + 30, 96),
      h: Math.max(textH * 1.6 + 22, 58),
    }
  return {
    id: node.id,
    shape: node.shape,
    lines,
    w: Math.max(textW + PAD * 2, 88),
    h: Math.max(textH + PAD, 34),
  }
}

type Placed = Box & { x: number; y: number }
type Pt = [number, number]
/** Una flecha ya dibujada: los puntos son la línea completa (solo tramos horizontales y verticales). */
type Route = {
  points: Pt[]
  edge: FlowEdge
  /** La punta va al principio (flecha que vuelve atrás por un lateral). */
  reversed: boolean
  /** Dónde sale de su paso: por la salida normal o por un lado (decisiones y vueltas atrás). */
  exit: 'main' | 'side-a' | 'side-b' | 'loop'
}

export type FlowLayout = {
  width: number
  height: number
  boxes: Placed[]
  routes: Route[]
}

const r1 = (v: number) => Math.round(v * 10) / 10
const MARGIN = 14
const LOOP_STEP = 12

/**
 * Disposición por capas: cada paso baja a la capa siguiente a la de sus predecesores, se ordenan los
 * pasos de cada capa para que las flechas se crucen poco, las flechas que saltan capas pasan por puntos
 * intermedios para no atravesar otros pasos, las salidas de un mismo paso parten de puntos distintos
 * (las de una decisión, por los lados) y las flechas que vuelven atrás rodean el diagrama por un lateral.
 * Es suficiente para procesos de hasta unas decenas de pasos, no un motor de grafos general.
 */
export function layoutFlow(flow: ParsedFlow): FlowLayout {
  const ids = flow.nodes.map((n) => n.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const boxes = new Map(flow.nodes.map((n) => [n.id, measure(n)]))
  const lr = flow.direction === 'LR'

  // 1. Quitar ciclos: una flecha que vuelve a un paso del recorrido actual se invierte para calcular capas.
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of flow.edges) out.get(e.from)?.push(e.to)
  const state = new Map<string, 0 | 1 | 2>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}>${to}`)
      else if (!state.get(to)) visit(to)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!state.get(id)) visit(id)

  type Link = { from: string; to: string; edge: FlowEdge; loop: boolean }
  const links: Link[] = flow.edges
    .filter((e) => e.from !== e.to)
    .map((e) =>
      back.has(`${e.from}>${e.to}`)
        ? { from: e.to, to: e.from, edge: e, loop: true }
        : { from: e.from, to: e.to, edge: e, loop: false },
    )

  // 2. Capas por camino más largo (las vueltas atrás cuentan en su sentido hacia delante).
  const layer = new Map<string, number>(ids.map((id) => [id, 0]))
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false
    for (const l of links) {
      const want = (layer.get(l.from) ?? 0) + 1
      if (want > (layer.get(l.to) ?? 0)) {
        layer.set(l.to, want)
        changed = true
      }
    }
    if (!changed) break
  }

  // 3. Pasos de verdad y puntos intermedios (id que empieza por «~») en cada capa.
  type Slot = { id: string; w: number; h: number }
  const layers: Slot[][] = []
  const addSlot = (id: string, l: number, w: number, h: number) => {
    while (layers.length <= l) layers.push([])
    layers[l].push({ id, w, h })
  }
  for (const id of ids) {
    const b = boxes.get(id)
    if (b) addSlot(id, layer.get(id) ?? 0, b.w, b.h)
  }
  type Chain = { link: Link; path: string[] }
  const chains: Chain[] = []
  links.forEach((link, i) => {
    if (link.loop) return
    const a = layer.get(link.from) ?? 0
    const b = layer.get(link.to) ?? 0
    const path = [link.from]
    for (let l = a + 1; l < b; l += 1) {
      const dummy = `~${i}_${l}`
      addSlot(dummy, l, 0, 0)
      path.push(dummy)
    }
    path.push(link.to)
    chains.push({ link, path })
  })

  // 4. Ordenar cada capa por el promedio de posiciones de sus vecinos (tres pasadas arriba y abajo).
  const neighbours = new Map<string, { up: string[]; down: string[] }>()
  const nb = (id: string) => {
    let v = neighbours.get(id)
    if (!v) neighbours.set(id, (v = { up: [], down: [] }))
    return v
  }
  for (const c of chains)
    for (let i = 0; i + 1 < c.path.length; i += 1) {
      nb(c.path[i]).down.push(c.path[i + 1])
      nb(c.path[i + 1]).up.push(c.path[i])
    }
  const slotIndex = new Map<string, number>()
  // Orden inicial: el del texto, para que el resultado se parezca a como se escribió.
  for (const l of layers)
    l.sort(
      (a, b) =>
        (index.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (index.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  layers.forEach((l) => l.forEach((s, i) => slotIndex.set(s.id, i)))
  const sweep = (l: number, dir: 'up' | 'down') => {
    const mean = (s: Slot) => {
      const ns = nb(s.id)[dir]
      return ns.length === 0
        ? (slotIndex.get(s.id) ?? 0)
        : ns.reduce((sum, n) => sum + (slotIndex.get(n) ?? 0), 0) / ns.length
    }
    layers[l] = layers[l]
      .map((s, i) => ({ s, k: mean(s), i }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.s)
    layers[l].forEach((s, i) => slotIndex.set(s.id, i))
  }
  for (let round = 0; round < 3; round += 1) {
    for (let l = 1; l < layers.length; l += 1) sweep(l, 'up')
    for (let l = layers.length - 2; l >= 0; l -= 1) sweep(l, 'down')
  }

  // 5. Coordenadas. `along` es el eje de las capas (en TD, vertical); `across`, dentro de la capa.
  const GAP_ACROSS = 34
  const GAP_ALONG = 56
  const alongSize = (s: Slot) => (lr ? s.w : s.h)
  const acrossSize = (s: Slot) => (lr ? s.h : s.w)
  const layerAlong = layers.map((l) => Math.max(0, ...l.map(alongSize)))
  const layerAcross = layers.map(
    (l) =>
      l.reduce((sum, s) => sum + acrossSize(s), 0) +
      Math.max(0, l.length - 1) * GAP_ACROSS,
  )
  const maxAcross = Math.max(0, ...layerAcross)
  const alongStart: number[] = []
  let along = 0
  layerAlong.forEach((size, i) => {
    alongStart[i] = along
    along += size + GAP_ALONG
  })
  const totalAlong = Math.max(0, along - GAP_ALONG)
  const centre = new Map<string, { along: number; across: number }>()
  layers.forEach((l, i) => {
    let across = (maxAcross - layerAcross[i]) / 2
    for (const s of l) {
      centre.set(s.id, {
        along: alongStart[i] + layerAlong[i] / 2,
        across: across + acrossSize(s) / 2,
      })
      across += acrossSize(s) + GAP_ACROSS
    }
  })

  const loops = links.filter((l) => l.loop)
  const loopRoom = loops.length > 0 ? MARGIN + loops.length * LOOP_STEP : 0
  const MIN_W = 520
  const baseWidth = (lr ? totalAlong : maxAcross) + MARGIN * 2
  // Un diagrama estrecho se centra en un ancho mínimo: así no se agranda de más al ocupar la página.
  const shift = baseWidth < MIN_W ? (MIN_W - baseWidth) / 2 : 0
  const toXY = (id: string): Pt => {
    const c = centre.get(id) ?? { along: 0, across: 0 }
    return lr
      ? [MARGIN + c.along + shift, MARGIN + c.across]
      : [MARGIN + c.across + shift, MARGIN + c.along]
  }
  const width = Math.max(baseWidth, MIN_W) + (lr ? 0 : loopRoom)
  const height =
    (lr ? maxAcross : totalAlong) + MARGIN * 2 + (lr ? loopRoom : 0)

  const placed = new Map<string, Placed>()
  for (const id of ids) {
    const b = boxes.get(id)
    if (!b) continue
    const [x, y] = toXY(id)
    placed.set(id, { ...b, x, y })
  }

  // 6. Puertos: las salidas de un paso (y las entradas) no parten del mismo punto. Una decisión con
  // varias salidas usa los lados; el resto se reparte a lo largo del borde.
  type Port = { across: number; side: 'main' | 'side-a' | 'side-b' }
  const exitPort = new Map<Chain, Port>()
  const entryOffset = new Map<Chain, number>()
  const acrossOf = (id: string) => {
    const [x, y] = toXY(id)
    return lr ? y : x
  }
  const byFrom = new Map<string, Chain[]>()
  const byTo = new Map<string, Chain[]>()
  for (const c of chains) {
    ;(
      byFrom.get(c.link.from) ?? byFrom.set(c.link.from, []).get(c.link.from)!
    ).push(c)
    ;(byTo.get(c.link.to) ?? byTo.set(c.link.to, []).get(c.link.to)!).push(c)
  }
  for (const [id, list] of byFrom) {
    const box = placed.get(id)
    if (!box) continue
    const mine = acrossOf(id)
    const sorted = [...list].sort(
      (a, b) => acrossOf(a.path[1]) - acrossOf(b.path[1]),
    )
    if (box.shape === 'decision' && sorted.length >= 2) {
      // La salida más alineada con el paso sigue recta; las demás salen por el lado al que caen.
      const straight = sorted.reduce((best, c) =>
        Math.abs(acrossOf(c.path[1]) - mine) <
        Math.abs(acrossOf(best.path[1]) - mine)
          ? c
          : best,
      )
      for (const c of sorted) {
        const dx = acrossOf(c.path[1]) - mine
        exitPort.set(
          c,
          c === straight && sorted.length > 2
            ? { across: 0, side: 'main' }
            : dx < 0 || (dx === 0 && c === sorted[0])
              ? { across: 0, side: 'side-a' }
              : { across: 0, side: 'side-b' },
        )
      }
    } else {
      const room = lr ? box.h : box.w
      const step = Math.min(22, (room - 22) / Math.max(sorted.length, 1))
      sorted.forEach((c, i) =>
        exitPort.set(c, {
          across: (i - (sorted.length - 1) / 2) * step,
          side: 'main',
        }),
      )
    }
  }
  for (const [id, list] of byTo) {
    const box = placed.get(id)
    if (!box) continue
    const sorted = [...list].sort(
      (a, b) =>
        acrossOf(a.path[a.path.length - 2]) -
        acrossOf(b.path[b.path.length - 2]),
    )
    const room = lr ? box.h : box.w
    const step = Math.min(22, (room - 22) / Math.max(sorted.length, 1))
    sorted.forEach((c, i) =>
      entryOffset.set(c, (i - (sorted.length - 1) / 2) * step),
    )
  }

  // 7. Rutas ortogonales: tramo por capa con el codo a mitad del hueco entre capas.
  const routes: Route[] = []
  const elbow = (a: Pt, b: Pt): Pt[] => {
    if (lr) {
      const mx = (a[0] + b[0]) / 2
      return [
        [mx, a[1]],
        [mx, b[1]],
      ]
    }
    const my = (a[1] + b[1]) / 2
    return [
      [a[0], my],
      [b[0], my],
    ]
  }
  for (const chain of chains) {
    const { link, path } = chain
    const port = exitPort.get(chain) ?? { across: 0, side: 'main' as const }
    const from = placed.get(link.from)
    const to = placed.get(link.to)
    if (!from || !to) continue
    const pts: Pt[] = []
    // Salida
    if (port.side === 'main')
      pts.push(
        lr
          ? [from.x + from.w / 2, from.y + port.across]
          : [from.x + port.across, from.y + from.h / 2],
      )
    else {
      const sign = port.side === 'side-a' ? -1 : 1
      pts.push(
        lr
          ? [from.x, from.y + sign * (from.h / 2)]
          : [from.x + sign * (from.w / 2), from.y],
      )
    }
    // Puntos intermedios (capas que se saltan) y llegada
    const way: Pt[] = path.slice(1, -1).map(toXY)
    const entry: Pt = lr
      ? [to.x - to.w / 2, to.y + (entryOffset.get(chain) ?? 0)]
      : [to.x + (entryOffset.get(chain) ?? 0), to.y - to.h / 2]
    const stops = [...way, entry]
    let prev = pts[0]
    stops.forEach((q, i) => {
      if (i === 0 && port.side !== 'main') {
        // Por un lado: primero se sale en horizontal (en vertical, en LR) hasta la columna del destino.
        pts.push(lr ? [prev[0], q[1]] : [q[0], prev[1]])
      } else pts.push(...elbow(prev, q))
      pts.push(q)
      prev = q
    })
    routes.push({
      points: pts,
      edge: link.edge,
      reversed: false,
      exit: port.side,
    })
  }
  // Vueltas atrás: salen por el lado del paso, rodean el diagrama y entran por el lado del destino.
  let loopIndex = 0
  for (const link of loops) {
    const src = placed.get(link.to) // el paso del que sale la flecha original
    const dst = placed.get(link.from) // al que vuelve
    if (!src || !dst) continue
    const lane = MARGIN / 2 + (loopIndex += 1) * LOOP_STEP
    const pts: Pt[] = lr
      ? (() => {
          const my =
            Math.max(...[...placed.values()].map((b) => b.y + b.h / 2)) + lane
          return [
            [src.x, src.y + src.h / 2],
            [src.x, my],
            [dst.x, my],
            [dst.x, dst.y + dst.h / 2],
          ] as Pt[]
        })()
      : (() => {
          const mx =
            Math.max(...[...placed.values()].map((b) => b.x + b.w / 2)) + lane
          return [
            [src.x + src.w / 2, src.y],
            [mx, src.y],
            [mx, dst.y],
            [dst.x + dst.w / 2, dst.y],
          ] as Pt[]
        })()
    routes.push({ points: pts, edge: link.edge, reversed: false, exit: 'loop' })
  }

  return {
    width: r1(width),
    height: r1(height),
    boxes: [...placed.values()].map((p) => ({ ...p, x: r1(p.x), y: r1(p.y) })),
    routes: routes.map((r) => ({
      ...r,
      points: r.points.map(([x, y]): Pt => [r1(x), r1(y)]),
    })),
  }
}

// ---------- Dibujo (SVG como árbol, igual que los gráficos) ----------

const polyline = (points: Pt[]): string =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`).join('')

const text = (cls: string, x: number, y: number, value: string): ChartNode => ({
  tag: 'text',
  a: { class: cls, x: r1(x), y: r1(y) },
  kids: [value],
})

function shapeNodes(b: Placed): ChartNode[] {
  const left = b.x - b.w / 2
  const top = b.y - b.h / 2
  let shape: ChartNode
  if (b.shape === 'decision')
    shape = {
      tag: 'path',
      a: {
        class: 'fl-decision',
        d: `M${r1(b.x)} ${r1(top)}L${r1(b.x + b.w / 2)} ${r1(b.y)}L${r1(b.x)} ${r1(top + b.h)}L${r1(left)} ${r1(b.y)}Z`,
      },
    }
  else
    shape = {
      tag: 'rect',
      a: {
        class: b.shape === 'terminal' ? 'fl-terminal' : 'fl-step',
        x: r1(left),
        y: r1(top),
        width: r1(b.w),
        height: r1(b.h),
        rx: b.shape === 'terminal' ? r1(b.h / 2) : b.shape === 'round' ? 10 : 4,
      },
    }
  const firstY = b.y - ((b.lines.length - 1) * LINE_H) / 2 + 3.6
  return [
    shape,
    ...b.lines.map((line, i) =>
      text(
        b.shape === 'terminal' ? 'fl-text fl-inv ta-m' : 'fl-text ta-m',
        b.x,
        firstY + i * LINE_H,
        line,
      ),
    ),
  ]
}

/** Punta de flecha en el extremo al que apunta, orientada según el último tramo de la línea. */
function arrowHead(route: Route): ChartNode | null {
  if (!route.edge.arrow || route.points.length < 2) return null
  const pts = route.points
  const tip = pts[pts.length - 1]
  const ref = pts[pts.length - 2]
  const dx = tip[0] - ref[0]
  const dy = tip[1] - ref[1]
  const [x, y] = tip
  const horizontal = Math.abs(dx) > Math.abs(dy)
  const sign = (horizontal ? dx : dy) < 0 ? -1 : 1
  const d = horizontal
    ? `M${r1(x - 7 * sign)} ${r1(y - 3.6)}L${r1(x)} ${r1(y)}L${r1(x - 7 * sign)} ${r1(y + 3.6)}Z`
    : `M${r1(x - 3.6)} ${r1(y - 7 * sign)}L${r1(x)} ${r1(y)}L${r1(x + 3.6)} ${r1(y - 7 * sign)}Z`
  return { tag: 'path', a: { class: 'fl-arrow', d } }
}

/** Etiqueta de una flecha, junto a su salida (o en el lateral, si es una vuelta atrás). */
function edgeLabel(route: Route, lr: boolean): ChartNode | null {
  const label = route.edge.label
  if (!label) return null
  const p = route.points
  if (route.exit === 'loop') {
    const [a, b] = lr ? [p[1], p[2]] : [p[1], p[2]]
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    return lr
      ? text('fl-label ta-m', mx, my + 11, label)
      : text('fl-label ta-s', mx + 5, my + 3, label)
  }
  const [x, y] = p[0]
  if (route.exit === 'side-a')
    return lr
      ? text('fl-label ta-s', x + 5, y - 5, label)
      : text('fl-label ta-e', x - 5, y - 5, label)
  if (route.exit === 'side-b')
    return lr
      ? text('fl-label ta-s', x + 5, y + 13, label)
      : text('fl-label ta-s', x + 5, y - 5, label)
  return lr
    ? text('fl-label ta-s', x + 6, y - 5, label)
    : text('fl-label ta-s', x + 6, y + 14, label)
}

/** Árbol SVG del diagrama. Sin pasos, un aviso en texto. */
export function flowTree(input: string): ChartNode {
  const flow = parseFlow(input)
  if (flow.nodes.length === 0)
    return {
      tag: 'svg',
      a: {
        class: 'c-svg',
        viewBox: '0 0 300 40',
        role: 'img',
        'aria-label': 'Diagrama vacío',
      },
      kids: [text('fl-label ta-m', 150, 24, 'Escribe los pasos del proceso')],
    }
  const layout = layoutFlow(flow)
  const lr = flow.direction === 'LR'
  const kids: ChartNode[] = []
  for (const route of layout.routes)
    kids.push({
      tag: 'path',
      a: { class: 'fl-edge', d: polyline(route.points) },
    })
  for (const route of layout.routes) {
    const head = arrowHead(route)
    if (head) kids.push(head)
  }
  for (const box of layout.boxes) kids.push(...shapeNodes(box))
  for (const route of layout.routes) {
    const label = edgeLabel(route, lr)
    if (label) kids.push(label)
  }
  const label = flow.nodes.map((n) => n.label).join(' → ')
  return {
    tag: 'svg',
    a: {
      class: 'c-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: 'img',
      'aria-label': `Diagrama de flujo: ${label}`.slice(0, 300),
    },
    kids,
  }
}

/** Lista de pasos para el Word (que no dibuja SVG): una línea por paso y sus salidas. */
export function flowSteps(input: string): string[] {
  const flow = parseFlow(input)
  const label = new Map(flow.nodes.map((n) => [n.id, n.label]))
  return flow.nodes.map((n, i) => {
    const outs = flow.edges
      .filter((e) => e.from === n.id)
      .map((e) => `${e.label ? `${e.label}: ` : ''}${label.get(e.to) ?? e.to}`)
    return `${i + 1}. ${n.label}${outs.length ? ` → ${outs.join(' · ')}` : ''}`
  })
}

export const FLOW_EXAMPLES: ReadonlyArray<{ name: string; text: string }> = [
  {
    name: 'Proceso con una decisión',
    text: `flowchart TD
inicio([Llega el cliente]) --> A[Recibir al cliente]
A --> B{¿Tiene reserva?}
B -->|Sí| C[Confirmar la cancha]
B -->|No| D[Ofrecer horarios disponibles]
D --> C
C --> fin([Cobrar y despedir])`,
  },
  {
    name: 'Pasos en horizontal',
    text: `flowchart LR
A[Solicitud] --> B[Revisión] --> C{¿Aprobada?}
C -->|Sí| D([Listo])
C -->|No| E[Corregir]
E --> B`,
  },
]

export const FLOW_EXAMPLE = FLOW_EXAMPLES[0].text
