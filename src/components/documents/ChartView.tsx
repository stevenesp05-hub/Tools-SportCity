import { createElement } from 'react'
import type { ReactNode } from 'react'
import { chartTree } from '#/lib/charts'
import type { ChartNode, ChartSpec } from '#/lib/charts'

function toReact(node: ChartNode | string, key?: number): ReactNode {
  if (typeof node === 'string') return node
  const { class: className, 'data-chart-spec': _spec, ...rest } = node.a ?? {}
  return createElement(
    node.tag,
    { key, className, ...rest },
    ...(node.kids ?? []).map((kid, i) => toReact(kid, i)),
  )
}

/** Dibuja un gráfico con el mismo árbol que usa el editor y el PDF. Va dentro de `.doc-sheet .ProseMirror`. */
export function ChartView({ spec }: { spec: ChartSpec }) {
  return <>{toReact(chartTree(spec))}</>
}
