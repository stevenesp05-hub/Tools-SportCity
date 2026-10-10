import { describe, expect, it } from 'vitest'
import {
  FLOW_EXAMPLES,
  flowSteps,
  flowTree,
  layoutFlow,
  parseFlow,
  wrapLabel,
} from '../flow'
import { isSvgTag } from '../charts'
import type { ChartNode } from '../charts'
import { generateHTML, generateJSON } from '@tiptap/html/server'
import { SCHEMA_EXTENSIONS } from '../editor-extensions'
import { prepareHtmlForDocx } from '../docx.server'
import { sanitizeContentHtml } from '../sanitize.server'

const EJEMPLO = `flowchart TD
inicio([Llega el cliente]) --> A[Recibir al cliente]
A --> B{¿Tiene reserva?}
B -->|Sí| C[Confirmar la cancha]
B -- No --> D[Ofrecer horarios disponibles]
D --> C
C --> fin([Cobrar y despedir])`

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toHtml = (n: ChartNode | string): string => {
  if (typeof n === 'string') return esc(n)
  const attrs = Object.entries(n.a ?? {})
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('')
  const inner = (n.kids ?? []).map(toHtml).join('')
  return `<${n.tag}${attrs}>${inner}</${n.tag}>`
}

describe('leer el texto', () => {
  const flow = parseFlow(EJEMPLO)

  it('entiende formas, flechas con etiqueta (las dos maneras) y cadenas', () => {
    expect(flow.problems).toEqual([])
    expect(flow.direction).toBe('TD')
    expect(flow.nodes.map((n) => [n.id, n.shape])).toEqual([
      ['inicio', 'terminal'],
      ['A', 'step'],
      ['B', 'decision'],
      ['C', 'step'],
      ['D', 'step'],
      ['fin', 'terminal'],
    ])
    expect(flow.edges.find((e) => e.from === 'B' && e.to === 'C')?.label).toBe(
      'Sí',
    )
    expect(flow.edges.find((e) => e.from === 'B' && e.to === 'D')?.label).toBe(
      'No',
    )
    expect(parseFlow('A --> B --> C').edges).toHaveLength(2)
  })

  it('LR cambia la dirección; --- es una línea sin punta; %% es un comentario', () => {
    const f = parseFlow('graph LR\n%% nota\nA --- B')
    expect(f.direction).toBe('LR')
    expect(f.edges[0].arrow).toBe(false)
  })

  it('un paso reutilizado conserva el texto con el que se definió', () => {
    const f = parseFlow('A[Primero] --> B[Segundo]\nB --> A')
    expect(f.nodes.find((n) => n.id === 'B')?.label).toBe('Segundo')
    expect(f.nodes).toHaveLength(2)
  })

  it('lo que no entiende no rompe nada: queda como aviso y el resto se dibuja', () => {
    const f = parseFlow('A --> B\n¿¿¿\nB --> ')
    expect(f.nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(f.problems.length).toBeGreaterThan(0)
  })

  it('respeta el máximo de pasos', () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `N${i} --> N${i + 1}`,
    ).join('\n')
    const f = parseFlow(many)
    expect(f.nodes.length).toBeLessThanOrEqual(40)
    expect(f.problems.some((p) => p.includes('primeros'))).toBe(true)
  })

  it('parte las etiquetas largas sin cortar palabras', () => {
    expect(
      wrapLabel('Confirmar la cancha con el cliente por teléfono'),
    ).toEqual(['Confirmar la cancha con', 'el cliente por teléfono'])
  })
})

describe('disposición', () => {
  it('cada paso queda en una capa por debajo de sus predecesores y nada se solapa', () => {
    const layout = layoutFlow(parseFlow(EJEMPLO))
    const y = (id: string) => layout.boxes.find((b) => b.id === id)!.y
    expect(y('A')).toBeGreaterThan(y('inicio'))
    expect(y('B')).toBeGreaterThan(y('A'))
    expect(y('C')).toBeGreaterThan(y('B'))
    expect(y('C')).toBeGreaterThan(y('D'))
    expect(y('fin')).toBeGreaterThan(y('C'))
    const { boxes } = layout
    for (let i = 0; i < boxes.length; i += 1)
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap =
          Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
          Math.abs(a.y - b.y) < (a.h + b.h) / 2
        expect(overlap, `${a.id} se solapa con ${b.id}`).toBe(false)
      }
    for (const b of boxes) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w / 2).toBeLessThanOrEqual(layout.width)
      expect(b.y + b.h / 2).toBeLessThanOrEqual(layout.height)
    }
  })

  it('en horizontal las capas avanzan hacia la derecha', () => {
    const layout = layoutFlow(parseFlow('graph LR\nA --> B --> C'))
    const x = (id: string) => layout.boxes.find((b) => b.id === id)!.x
    expect(x('B')).toBeGreaterThan(x('A'))
    expect(x('C')).toBeGreaterThan(x('B'))
  })

  it('una flecha que salta capas pasa por puntos intermedios y no atraviesa otros pasos', () => {
    const layout = layoutFlow(parseFlow('A --> B --> C --> D\nA --> D'))
    const long = layout.routes.find(
      (r) => r.edge.from === 'A' && r.edge.to === 'D',
    )!
    expect(long.points.length).toBeGreaterThan(2)
    for (const [px, py] of long.points.slice(1, -1))
      for (const b of layout.boxes)
        expect(
          Math.abs(px - b.x) < b.w / 2 && Math.abs(py - b.y) < b.h / 2,
          `cruza ${b.id}`,
        ).toBe(false)
  })

  it('un ciclo ("volver al paso 2") no se cuelga y rodea el diagrama por un lateral', () => {
    const layout = layoutFlow(parseFlow('A --> B --> C\nC -->|Reintentar| B'))
    const back = layout.routes.find(
      (r) => r.edge.from === 'C' && r.edge.to === 'B',
    )!
    expect(back.exit).toBe('loop')
    // Rodea el diagrama por un lateral: queda más a la derecha que cualquier paso.
    const rightmost = Math.max(...layout.boxes.map((b) => b.x + b.w / 2))
    expect(Math.max(...back.points.map((p) => p[0]))).toBeGreaterThan(rightmost)
    expect(layout.width).toBeGreaterThan(rightmost)
    expect(layout.boxes).toHaveLength(3)
  })

  it('las dos salidas de una decisión parten de puntos distintos (por los lados)', () => {
    const layout = layoutFlow(
      parseFlow('A --> B{¿Ok?}\nB -->|Sí| C\nB -->|No| D'),
    )
    const starts = layout.routes
      .filter((r) => r.edge.from === 'B')
      .map((r) => r.points[0].join(','))
    expect(new Set(starts).size).toBe(2)
  })

  it('varias salidas de un paso normal se reparten a lo largo del borde', () => {
    const layout = layoutFlow(parseFlow('A --> B\nA --> C\nA --> D'))
    const starts = layout.routes
      .filter((r) => r.edge.from === 'A')
      .map((r) => r.points[0][0])
    expect(new Set(starts).size).toBe(3)
  })

  it('un paso conectado consigo mismo, o sin conexiones, no rompe el dibujo', () => {
    expect(layoutFlow(parseFlow('A --> A')).boxes).toHaveLength(1)
    expect(layoutFlow(parseFlow('A[Solo uno]')).boxes).toHaveLength(1)
  })
})

describe('dibujo', () => {
  it('solo usa etiquetas SVG que el editor y el saneado conocen', () => {
    const tags = new Set<string>()
    const walk = (n: ChartNode | string) => {
      if (typeof n === 'string') return
      tags.add(n.tag)
      n.kids?.forEach(walk)
    }
    walk(flowTree(EJEMPLO))
    for (const t of tags) expect(isSvgTag(t), t).toBe(true)
  })

  it('el saneado conserva el diagrama completo (formas, flechas, texto) y su origen', () => {
    const html = `<div class="sc-flow" data-flow="x">${toHtml(flowTree(EJEMPLO))}</div>`
    const clean = sanitizeContentHtml(html)
    const count = (h: string, re: RegExp) => h.match(re)?.length ?? 0
    for (const re of [/<path/g, /<rect/g, /<text/g])
      expect(count(clean, re)).toBe(count(html, re))
    expect(clean).toContain('class="fl-decision"')
    expect(clean).toContain('class="fl-arrow"')
    expect(clean).toContain('class="sc-flow"')
    expect(clean).toContain('data-flow')
    expect(clean).toContain('¿Tiene reserva?')
  })

  it('no hay NaN ni Infinity en las coordenadas', () => {
    for (const src of [EJEMPLO, 'graph LR\nA --> B --> C', 'A --> A', '']) {
      const html = toHtml(flowTree(src))
      expect(html).not.toMatch(/NaN|Infinity/)
    }
  })

  it('para el Word resume el proceso en pasos numerados con sus salidas', () => {
    const steps = flowSteps(EJEMPLO)
    expect(steps[2]).toBe(
      '3. ¿Tiene reserva? → Sí: Confirmar la cancha · No: Ofrecer horarios disponibles',
    )
    expect(steps).toHaveLength(6)
  })
})

describe('integración con el documento', () => {
  it('los ejemplos del diálogo se entienden sin problemas', () => {
    for (const example of FLOW_EXAMPLES)
      expect(parseFlow(example.text).problems).toEqual([])
  })
})

describe('nodo del editor', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Antes' }] },
      { type: 'flowChart', attrs: { text: EJEMPLO } },
    ],
  }

  it('el HTML guardado vuelve a ser el mismo diagrama tras el saneado', () => {
    const html = sanitizeContentHtml(generateHTML(doc, SCHEMA_EXTENSIONS))
    expect(html).toContain('<svg')
    const json = generateJSON(html, SCHEMA_EXTENSIONS)
    const node = json.content?.find(
      (n: { type?: string }) => n.type === 'flowChart',
    )
    expect(node?.attrs?.text).toBe(EJEMPLO)
  })

  it('en Word queda como lista de pasos, sin SVG', () => {
    const html = sanitizeContentHtml(generateHTML(doc, SCHEMA_EXTENSIONS))
    const out = prepareHtmlForDocx(html)
    expect(out).not.toContain('<svg')
    expect(out).toContain('<ol>')
    expect(out).toContain('Recibir al cliente')
  })
})
