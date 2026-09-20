import { parseNumber } from '#/lib/formulas'

export type OrgNode = { name: string; role: string; children: OrgNode[] }
export type ChartItem = { label: string; value: number }

/**
 * Organigrama a partir de texto con sangría: cada nivel se sangra con dos espacios.
 * Cada línea es "Nombre | Cargo" (o "Nombre - Cargo").
 */
export function parseOrg(text: string): OrgNode[] {
  const roots: OrgNode[] = []
  const stack: Array<{ depth: number; node: OrgNode }> = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const indent = /^[ \t]*/.exec(raw)?.[0].replace(/\t/g, '  ').length ?? 0
    const depth = Math.floor(indent / 2)
    const content = raw.trim().replace(/^[-•*]\s+/, '')
    const [name, ...rest] = content.split(/\s*[|–—]\s*|\s+-\s+/)
    const node: OrgNode = {
      name: name.trim(),
      role: rest.join(' · ').trim(),
      children: [],
    }
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth)
      stack.pop()
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].node.children.push(node)
    stack.push({ depth, node })
  }
  return roots
}

/** "Etiqueta: valor" por línea → datos de gráfico. Las líneas sin número se ignoran. */
export function parseChartItems(text: string): ChartItem[] {
  const items: ChartItem[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^(.*?)[:;\t]\s*([^:;\t]+)$/.exec(line.trim())
    if (!match) continue
    const value = parseNumber(match[2])
    if (value !== null && match[1].trim())
      items.push({ label: match[1].trim(), value })
  }
  return items
}

export const chartItemsToText = (items: ChartItem[]) =>
  items.map((i) => `${i.label}: ${i.value}`).join('\n')

export const encodeAttr = (value: unknown) =>
  encodeURIComponent(JSON.stringify(value))

export function decodeAttr<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(decodeURIComponent(value)) as T
  } catch {
    return fallback
  }
}
