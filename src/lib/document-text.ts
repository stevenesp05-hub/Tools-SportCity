import type { JSONContent } from '@tiptap/react'

/** Texto plano de un documento TipTap, para indexar y buscar. */
export function extractText(node: JSONContent | null | undefined): string {
  if (!node) return ''
  const parts: string[] = []
  const walk = (n: JSONContent) => {
    if (typeof n.text === 'string') parts.push(n.text)
    if (n.content) {
      for (const child of n.content) walk(child)
      // separa bloques (párrafos, celdas, títulos…) con un espacio
      if (n.type && n.type !== 'text') parts.push(' ')
    }
  }
  walk(node)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** Texto plano desde HTML (sin DOM, apto para servidor y cliente). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
}

/** Encabezados (h2) de un HTML, para el índice de la portada. */
export function extractHeadings(html: string, max = 10): string[] {
  const headings: string[] = []
  for (const match of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const text = htmlToText(match[1])
    if (text) headings.push(text)
    if (headings.length >= max) break
  }
  return headings
}
