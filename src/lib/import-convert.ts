const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
}

/** Texto plano → párrafos (una línea en blanco separa párrafos). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Markdown básico (títulos, listas, negrita, cursiva, enlaces) → HTML. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length === 1 ? 2 : 3
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (bullet || numbered) {
      flushParagraph()
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li><p>${inline((bullet ?? numbered)?.[1] ?? '')}</p></li>`)
    } else if (line.trim() === '') {
      flushParagraph()
      closeList()
    } else if (/^---+$/.test(line.trim())) {
      flushParagraph()
      closeList()
      out.push('<hr>')
    } else {
      closeList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  closeList()
  return out.join('')
}

/** Nos quedamos con el contenido de <body> y descartamos scripts y estilos. */
export function extractHtmlBody(html: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html
  return body
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/** Los títulos importados usan los dos niveles del editor: H1 → título, H2–H6 → subtítulo. */
export function normalizeHeadings(html: string): string {
  return html
    .replace(/<h1(\s[^>]*)?>/gi, '<h2>')
    .replace(/<\/h1>/gi, '</h2>')
    .replace(/<h([4-6])(\s[^>]*)?>/gi, '<h3>')
    .replace(/<\/h[4-6]>/gi, '</h3>')
}
