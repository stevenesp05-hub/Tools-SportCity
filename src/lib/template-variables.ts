import type { JSONContent } from '@tiptap/react'

/** Campos que el sistema rellena solo al crear un documento desde una plantilla. */
export const BUILTIN_VARIABLES = ['fecha', 'usuario', 'carpeta'] as const

const TOKEN = /\{\{\s*([\p{L}\p{N}_. ]{1,40}?)\s*\}\}/gu

export const normalizeVariable = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, '_')

/** "razon_social" → "Razon social", para mostrarlo como etiqueta. */
export const variableLabel = (name: string) => {
  // Los campos con punto agrupan datos por entidad: {{cliente.nombre}} → «Cliente · nombre».
  const spaced = name.replace(/_/g, ' ').replace(/\./g, ' · ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Nombres de los campos personalizados ({{proveedor}}, {{monto}}…) que aparecen en el HTML de una plantilla. */
export function extractVariables(html: string): string[] {
  const found: string[] = []
  for (const match of html.matchAll(TOKEN)) {
    const name = normalizeVariable(match[1])
    if (
      !found.includes(name) &&
      !(BUILTIN_VARIABLES as readonly string[]).includes(name)
    )
      found.push(name)
  }
  return found
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function replaceTokens(text: string, values: Record<string, string>) {
  return text.replace(TOKEN, (whole, name: string) => {
    const key = normalizeVariable(name)
    return key in values ? values[key] : whole
  })
}

/** Sustituye los {{campos}} en un HTML de plantilla (los valores se escapan). */
export function fillHtml(html: string, values: Record<string, string>) {
  return replaceTokens(
    html,
    Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, escapeHtml(v)]),
    ),
  )
}

/** Sustituye los {{campos}} en el contenido JSON del editor, conservando el formato del texto. */
export function fillJson(
  node: JSONContent,
  values: Record<string, string>,
): JSONContent {
  const next: JSONContent = { ...node }
  if (typeof node.text === 'string')
    next.text = replaceTokens(node.text, values)
  if (node.content) next.content = node.content.map((c) => fillJson(c, values))
  return next
}

/** Valores de los campos del sistema para un documento nuevo. */
export function builtinValues(input: {
  userName: string
  folderName: string
  now?: Date
}): Record<string, string> {
  return {
    fecha: (input.now ?? new Date()).toLocaleDateString('es-NI', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    usuario: input.userName,
    carpeta: input.folderName,
  }
}
