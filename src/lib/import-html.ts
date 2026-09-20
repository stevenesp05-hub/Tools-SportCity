import { Window } from 'happy-dom'
import type { Element as HElement, Node as HNode } from 'happy-dom'

/**
 * Importación de HTML con diseño: lee los estilos del propio archivo (<style>, clases, estilos en línea) y
 * traduce lo reconocible a los bloques del editor (banner, etiquetas, tarjetas, avisos, llamada a la acción,
 * tablas con colores). Lo que el editor no puede representar (rejillas, degradados, posiciones) se
 * simplifica a texto ordenado, nunca se pierde el contenido.
 */

export type StyledImport = {
  html: string
  /** Se detectó un banner o tarjetas: el documento se ve mejor con el tema «Campaña». */
  campaign: boolean
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  'ul',
  'ol',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  'figure',
  'dl',
  'pre',
  'form',
  'details',
  'summary',
])

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** "#abc", "#aabbcc" o "rgb(a)(…)" → "#aabbcc"; null si es transparente o no se entiende. */
export function toHex(color: string | undefined): string | null {
  if (!color) return null
  const value = color.trim().toLowerCase()
  if (!value || value === 'transparent' || value === 'inherit') return null
  const short = /^#([0-9a-f]{3})$/.exec(value)
  if (short) return `#${[...short[1]].map((c) => c + c).join('')}`
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  const rgb =
    /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(
      value,
    )
  if (rgb) {
    if (rgb[4] && Number(rgb[4]) < 0.2) return null
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
      .join('')}`
  }
  const named: Record<string, string> = { white: '#ffffff', black: '#000000' }
  return named[value] ?? null
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const isDark = (hex: string) => luminance(hex) < 0.35
const isWhitish = (hex: string) => luminance(hex) > 0.985

function hue(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return -1
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

type Ctx = { win: Window; campaign: boolean }

const style = (ctx: Ctx, el: HElement) => ctx.win.getComputedStyle(el)
const isElement = (n: HNode): n is HElement => n.nodeType === 1
const tag = (el: HElement) => el.tagName.toLowerCase()
const px = (value: string | undefined) => Number.parseFloat(value ?? '') || 0

function bgOf(ctx: Ctx, el: HElement): string | null {
  const cs = style(ctx, el)
  let hex = toHex(cs.backgroundColor)
  // Degradados: se toma el primer color (ya con las variables CSS resueltas).
  if (!hex) {
    const image = cs.backgroundImage || cs.background
    const first = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(image)
    if (first)
      hex = toHex(first[0].length === 9 ? first[0].slice(0, 7) : first[0])
  }
  return hex && !isWhitishOrPaper(hex) ? hex : null
}
const isWhitishOrPaper = (hex: string) => isWhitish(hex)

function textOf(el: HElement | HNode): string {
  return el.textContent.replace(/\s+/g, ' ').trim()
}

/** Contenido en línea: negrita, cursiva, enlaces, saltos y colores/tamaños que difieren del contexto. */
function inline(
  ctx: Ctx,
  node: HNode,
  parent: HElement,
  forceColor: boolean,
): string {
  if (node.nodeType === 3) {
    const raw = node.textContent.replace(/\s+/g, ' ')
    if (!raw.trim() && !raw.includes(' ')) return ''
    const text = escapeHtml(raw)
    if (!forceColor) return text
    const color = toHex(style(ctx, parent).color)
    return color ? `<span style="color:${color}">${text}</span>` : text
  }
  if (!isElement(node)) return ''
  const name = tag(node)
  if (name === 'br') return '<br>'
  if (name === 'script' || name === 'style') return ''
  if (name === 'img') return ''
  const cs = style(ctx, node)
  const inner = [...node.childNodes]
    .map((child) => inline(ctx, child, node, forceColor))
    .join('')
  if (!inner.trim()) return inner
  if (name === 'a') {
    const href = node.getAttribute('href')
    return href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner
  }
  let out = inner
  // happy-dom no trae la hoja de estilos del navegador: <b> y <strong> cuentan como negrita aunque no lo diga el cálculo.
  const weightOf = (el: HElement) => {
    const w = style(ctx, el).fontWeight
    const numeric = w === 'bold' ? 700 : px(w) || 0
    return numeric || (['b', 'strong', 'th'].includes(tag(el)) ? 700 : 400)
  }
  if (weightOf(node) >= 600 && weightOf(parent) < 600)
    out = `<strong>${out}</strong>`
  const italic = (el: HElement) =>
    style(ctx, el).fontStyle === 'italic' || ['i', 'em'].includes(tag(el))
  if (italic(node) && !italic(parent)) out = `<em>${out}</em>`
  const parentColor = toHex(style(ctx, parent).color)
  const color = toHex(cs.color)
  const size = px(cs.fontSize)
  const parentSize = px(style(ctx, parent).fontSize)
  const styles: string[] = []
  if (!forceColor && color && color !== parentColor)
    styles.push(`color:${color}`)
  if (size && parentSize && Math.abs(size - parentSize) >= 2)
    styles.push(`font-size:${Math.round(size)}px`)
  return styles.length ? `<span style="${styles.join(';')}">${out}</span>` : out
}

const inlineChildren = (ctx: Ctx, el: HElement, forceColor = false) =>
  [...el.childNodes]
    .map((n) => inline(ctx, n, el, forceColor))
    .join('')
    .trim()

/** ¿Solo tiene contenido en línea (texto, b, span, br…)? */
function isInlineOnly(el: HElement) {
  return [...el.childNodes].every(
    (n) =>
      n.nodeType === 3 ||
      (isElement(n) && !BLOCK_TAGS.has(tag(n)) && tag(n) !== 'img'),
  )
}

function isSmallLabel(ctx: Ctx, el: HElement) {
  const cs = style(ctx, el)
  const text = textOf(el)
  return (
    text.length > 0 &&
    text.length <= 90 &&
    isInlineOnly(el) &&
    px(cs.fontSize) > 0 &&
    px(cs.fontSize) <= 11 &&
    (cs.textTransform === 'uppercase' || px(cs.letterSpacing) >= 1)
  )
}

function calloutTone(bg: string): 'ok' | 'warn' | 'info' | 'summary' {
  const h = hue(bg)
  if (h >= 80 && h < 170) return 'ok'
  if ((h >= 0 && h < 60) || h >= 340) return 'warn'
  if (h >= 190 && h < 260) return 'info'
  return 'summary'
}

function convertTable(ctx: Ctx, table: HElement): string {
  const rows = [...table.querySelectorAll('tr')]
  const out = rows.map((row) => {
    const cells = [...row.children].filter(
      (c): c is HElement =>
        isElement(c) && (tag(c) === 'td' || tag(c) === 'th'),
    )
    const html = cells
      .map((cell) => {
        const t = tag(cell)
        const bg = bgOf(ctx, cell)
        // El encabezado oscuro ya lo pone el tema del documento; solo se conservan los colores que distinguen.
        const keepBg = bg && !(t === 'th' && isDark(bg))
        const attrs = [
          cell.getAttribute('colspan')
            ? ` colspan="${cell.getAttribute('colspan')}"`
            : '',
          cell.getAttribute('rowspan')
            ? ` rowspan="${cell.getAttribute('rowspan')}"`
            : '',
          keepBg ? ` style="background-color:${bg}"` : '',
        ].join('')
        // Un encabezado con fondo claro conserva el color de texto del original (el tema pone texto blanco).
        const body = inlineChildren(ctx, cell, t === 'th' && Boolean(keepBg))
        const bold = t === 'td' && px(style(ctx, cell).fontWeight) >= 600
        return `<${t}${attrs}><p>${bold && body ? `<strong>${body}</strong>` : body}</p></${t}>`
      })
      .join('')
    return `<tr>${html}</tr>`
  })
  return `<table><tbody>${out.join('')}</tbody></table>`
}

function convertList(ctx: Ctx, list: HElement): string {
  const name = tag(list)
  const items = [...list.children]
    .filter((c): c is HElement => isElement(c) && tag(c) === 'li')
    .map((li) => `<li><p>${inlineChildren(ctx, li)}</p></li>`)
  return items.length ? `<${name}>${items.join('')}</${name}>` : ''
}

/** Bloques de un contenedor, en orden. */
function blocks(ctx: Ctx, parent: HElement): string[] {
  const out: string[] = []
  const children = [...parent.childNodes]
  let run: HNode[] = []
  let steps: string[] = []
  const flushSteps = () => {
    if (steps.length > 0) out.push(`<ol>${steps.join('')}</ol>`)
    steps = []
  }
  const flush = () => {
    if (run.length === 0) return
    const html = run
      .map((n) => inline(ctx, n, parent, false))
      .join('')
      .trim()
    if (html) out.push(`<p>${html}</p>`)
    run = []
  }
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i]
    if (node.nodeType === 3) {
      run.push(node)
      continue
    }
    if (!isElement(node)) continue
    const name = tag(node)
    if (name === 'script' || name === 'style' || name === 'head') continue
    if (!BLOCK_TAGS.has(name) && name !== 'img') {
      run.push(node)
      continue
    }
    flush()
    if (isStepRow(ctx, node)) {
      const kids = [...node.children] as HElement[]
      steps.push(`<li><p>${inlineChildren(ctx, kids[1])}</p></li>`)
      continue
    }
    flushSteps()
    const nextElement =
      children.slice(i + 1).find((n): n is HElement => isElement(n)) ?? null
    out.push(...convertBlock(ctx, node, nextElement))
  }
  flush()
  flushSteps()
  return out
}

/** Fila «1 | texto» (número y descripción lado a lado): un paso de una lista numerada. */
function isStepRow(ctx: Ctx, el: HElement) {
  if (tag(el) !== 'div' && tag(el) !== 'li') return false
  const display = style(ctx, el).display
  if (display !== 'flex' && display !== 'grid') return false
  const kids = [...el.children] as HElement[]
  return (
    kids.length === 2 &&
    /^\d{1,2}[.)]?$/.test(textOf(kids[0])) &&
    textOf(kids[1]).length > 0
  )
}

function convertBlock(ctx: Ctx, el: HElement, next: HNode | null): string[] {
  const name = tag(el)
  if (name === 'img') {
    const src = el.getAttribute('src')
    return src ? [`<img src="${escapeHtml(src)}">`] : []
  }
  if (name === 'hr') return ['<hr>']
  if (/^h[1-6]$/.test(name)) {
    const level = name === 'h1' ? 2 : name === 'h2' ? 2 : 3
    const html = inlineChildren(ctx, el)
    return html ? [`<h${level}>${html}</h${level}>`] : []
  }
  if (name === 'p') {
    if (isSmallLabel(ctx, el)) return [eyebrow(el)]
    const html = inlineChildren(ctx, el)
    return html ? [`<p>${html}</p>`] : []
  }
  if (name === 'ul' || name === 'ol')
    return [convertList(ctx, el)].filter(Boolean)
  if (name === 'table') return [convertTable(ctx, el)]
  if (name === 'dl') return [convertDefinitions(ctx, el)]
  if (name === 'blockquote') {
    const inner = blocks(ctx, el).join('')
    return inner ? [`<blockquote>${inner}</blockquote>`] : []
  }
  // Contenedores: reconocer diseños; si no, se abren.
  if (isSmallLabel(ctx, el)) {
    const following = next && isElement(next) ? next : null
    if (following && /^h[1-3]$/.test(tag(following))) return [eyebrow(el)]
    return [`<p>${inlineChildren(ctx, el)}</p>`]
  }
  const cs = style(ctx, el)
  // Pies y cabeceras colocados a mano sobre la página: el documento ya pone los suyos.
  if (
    (cs.position === 'absolute' || cs.position === 'fixed') &&
    cs.bottom &&
    !cs.top
  )
    return []
  const bg = bgOf(ctx, el)
  const kids = [...el.children] as HElement[]

  // Fila de tarjetas: contenedor flex/grid con varios hijos que tienen fondo propio.
  if (
    (cs.display === 'flex' || cs.display === 'grid') &&
    kids.length >= 2 &&
    kids.length <= 4 &&
    kids.every((k) => bgOf(ctx, k))
  ) {
    ctx.campaign = true
    const cells = kids
      .map((kid) => {
        const kidBg = bgOf(ctx, kid) as string
        const body = cardBody(ctx, kid)
        return `<td colspan="1" rowspan="1" style="background-color:${kidBg}">${body}</td>`
      })
      .join('')
    return [
      `<table data-border="none"><tbody><tr>${cells}</tr></tbody></table>`,
    ]
  }

  // Filas de datos sin fondo: cifras grandes (KPI) o columnas de texto.
  if (
    (cs.display === 'flex' || cs.display === 'grid') &&
    kids.length >= 2 &&
    kids.length <= 4 &&
    !bg
  ) {
    const kpis = kids.map((kid) => kpiOf(ctx, kid))
    if (kpis.every(Boolean)) {
      ctx.campaign = true
      return kpis as string[]
    }
    if (kids.every((kid) => textOf(kid))) {
      const cells = kids
        .map(
          (kid) =>
            `<td colspan="1" rowspan="1">${blocks(ctx, kid).join('')}</td>`,
        )
        .join('')
      return [
        `<table data-border="none"><tbody><tr>${cells}</tr></tbody></table>`,
      ]
    }
  }

  if (bg) {
    const heading = el.querySelector('h1, h2')
    // Banner: fondo de color con un título dentro.
    if (heading && isDark(bg)) {
      ctx.campaign = true
      const extras = [...el.querySelectorAll('dl')].map((dl) =>
        convertDefinitions(ctx, dl as HElement),
      )
      return [hero(ctx, el, heading), ...extras]
    }
    // Franja de color con texto: llamada a la acción (oscura) o aviso (clara).
    const text = textOf(el)
    if (text) {
      const paras = boxParagraphs(ctx, el)
      if (isDark(bg)) {
        ctx.campaign = true
        return [`<div data-callout data-tone="cta">${paras}</div>`]
      }
      return [`<div data-callout data-tone="${calloutTone(bg)}">${paras}</div>`]
    }
  }
  return blocks(ctx, el)
}

function eyebrow(el: HElement) {
  return `<div data-callout data-tone="eyebrow"><p>${escapeHtml(textOf(el))}</p></div>`
}

/** Contenido de una caja (aviso o llamada a la acción): sus bloques interiores, en orden. */
function boxParagraphs(ctx: Ctx, el: HElement): string {
  const inner = blocks(ctx, el).join('')
  return inner || `<p>${inlineChildren(ctx, el)}</p>`
}

/** Tarjeta: sus hijos como párrafos, con colores y tamaños explícitos (el texto claro sobre fondo oscuro). */
function cardBody(ctx: Ctx, card: HElement): string {
  const kids = [...card.children] as HElement[]
  const source = kids.length > 0 ? kids : [card]
  const paragraphs = source
    .map((kid) => {
      const html = inlineChildren(ctx, kid, true)
      const size = px(style(ctx, kid).fontSize)
      const bold = px(style(ctx, kid).fontWeight) >= 600
      if (!html) return ''
      const sized =
        size && Math.abs(size - px(style(ctx, card).fontSize)) >= 2
          ? `<span style="font-size:${Math.round(size)}px">${bold ? `<strong>${html}</strong>` : html}</span>`
          : bold
            ? `<strong>${html}</strong>`
            : html
      return `<p>${sized}</p>`
    })
    .filter(Boolean)
  return paragraphs.join('')
}

/** Lista de definiciones (etiqueta + dato) en fila → tabla de dos filas; si son muchas, líneas «Etiqueta: dato». */
function convertDefinitions(ctx: Ctx, dl: HElement): string {
  const terms = [...dl.querySelectorAll('dt')] as HElement[]
  const details = [...dl.querySelectorAll('dd')] as HElement[]
  const pairs = terms.map(
    (dt, i) =>
      [
        inlineChildren(ctx, dt),
        inlineChildren(ctx, (details[i] as HElement | undefined) ?? dt),
      ] as const,
  )
  if (pairs.length >= 2 && pairs.length <= 6)
    return `<table><tbody><tr>${pairs.map(([t]) => `<th colspan="1" rowspan="1"><p>${t}</p></th>`).join('')}</tr><tr>${pairs.map(([, d]) => `<td colspan="1" rowspan="1"><p>${d}</p></td>`).join('')}</tr></tbody></table>`
  return pairs.map(([t, d]) => `<p><strong>${t}:</strong> ${d}</p>`).join('')
}

/** Cifra principal con su descripción → bloque KPI; null si el elemento no tiene ese aspecto. */
function kpiOf(ctx: Ctx, kid: HElement): string | null {
  const big = ([...kid.querySelectorAll('*')] as HElement[]).find(
    (e) =>
      px(style(ctx, e).fontSize) >= 20 &&
      textOf(e).length > 0 &&
      textOf(e).length <= 16,
  )
  if (!big) return null
  const label = textOf(kid).replace(textOf(big), '').trim()
  return `<div data-callout data-tone="kpi"><p>${escapeHtml(textOf(big))}</p>${label ? `<p>${escapeHtml(label)}</p>` : ''}</div>`
}

function hero(ctx: Ctx, box: HElement, heading: HElement): string {
  const headingColor = toHex(style(ctx, heading).color)
  const title = [...heading.childNodes]
    .map((n) => {
      if (n.nodeType === 3)
        return escapeHtml(n.textContent.replace(/\s+/g, ' '))
      if (!isElement(n)) return ''
      const text = escapeHtml(textOf(n))
      const color = toHex(style(ctx, n).color)
      // Las palabras con otro color en el título pasan a «destacadas» (cursiva = color de acento).
      return color && color !== headingColor ? `<em>${text}</em>` : text
    })
    .join('')
    .trim()
  const all = [...box.querySelectorAll('*')] as HElement[]
  const headingIndex = all.indexOf(heading)
  const before = all
    .slice(0, headingIndex)
    .filter((e) => textOf(e) && isInlineOnly(e) && !heading.contains(e))
    .map((e) => textOf(e))
    .filter((t) => t.length > 0)
  const kicker = before.filter((t) => t.length <= 120).slice(-1)[0] ?? ''
  const after = all
    .slice(headingIndex + 1)
    .filter(
      (e) =>
        !heading.contains(e) && textOf(e) && isInlineOnly(e) && tag(e) === 'p',
    )
    .map((e) => inlineChildren(ctx, e))
  const subtitle = after[0] ?? ''
  return `<div data-callout data-tone="hero"><p>${escapeHtml(kicker)}</p><p>${title}</p>${subtitle ? `<p>${subtitle}</p>` : ''}</div>`
}

/** Convierte un documento HTML completo (con <style>) en HTML del editor. */
export function convertStyledHtml(source: string): StyledImport {
  const win = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableCSSFileLoading: true,
    },
  })
  try {
    win.document.write(source)
    const ctx: Ctx = { win, campaign: false }
    const body = win.document.body as unknown as HElement
    const marker = '<div data-callout data-tone="hero">'
    // Cada portada o cabecera de página que aparece después de otro contenido empieza en hoja nueva.
    const parts = blocks(ctx, body).join('').split(marker)
    let html = parts[0]
    for (let i = 1; i < parts.length; i += 1)
      html +=
        (html.trim() ? '<div data-page-break></div>' : '') + marker + parts[i]
    return { html, campaign: ctx.campaign }
  } finally {
    void win.happyDOM.close()
  }
}
