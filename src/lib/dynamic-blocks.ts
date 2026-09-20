/**
 * Bloques que se calculan al exportar (PDF, Word, ZIP, enlace público): el índice automático.
 * Se aplican sobre HTML ya saneado.
 */

const stripTags = (value: string) => value.replace(/<[^>]+>/g, '').trim()

export function tocItems(html: string): Array<{ level: number; text: string }> {
  const items: Array<{ level: number; text: string }> = []
  for (const m of html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const text = stripTags(m[2])
    if (text) items.push({ level: Number(m[1]), text })
  }
  return items
}

export function expandDynamicBlocks(html: string): string {
  let out = html

  // Índice automático
  out = out.replace(/<div[^>]*data-toc[^>]*>\s*<\/div>/g, () => {
    const items = tocItems(out)
    if (items.length === 0) return ''
    return `<div class="sc-toc"><div class="sc-toc-title">Contenido</div>${items
      .map(
        (i) =>
          `<div class="sc-toc-item${i.level === 3 ? ' sc-toc-l3' : ''}">${i.text}</div>`,
      )
      .join('')}</div>`
  })

  return out
}
