import {
  INTER_FONT,
  LOGO_MARK,
  LOGO_MARK_WHITE,
  SORA_FONT,
} from '#/lib/brand-assets'
import { THEME_INFO, themeCssVars, themeOf } from '#/lib/doc-themes'
import { TOTAL_ROW, numericColumns } from '#/lib/table-semantics'
import type { DocTheme } from '#/lib/doc-themes'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Las fuentes son constantes del proceso (cientos de KB en base64): el bloque se arma una sola vez.
let fontFaces: string | undefined
const FONT_FACES = () =>
  (fontFaces ??= `
    @font-face { font-family:"Sora"; font-weight:700 800; font-style:normal; src:url("${SORA_FONT}") format("woff2"); }
    @font-face { font-family:"Inter"; font-weight:400 700; font-style:normal; src:url("${INTER_FONT}") format("woff2"); }
  `)

/** Variables de color del tema, como bloque CSS para el <style> de cada documento generado. */
function themeRoot(theme: DocTheme | undefined) {
  const vars = themeCssVars(themeOf(theme))
  return `:root { ${Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ')} }`
}

export type DocumentPdfInput = {
  theme?: DocTheme
  title: string
  folderName: string
  contentHtml: string
  headings: string[]
  versionNumber: number
  updatedAt: string
  authorName: string | null
  status: 'borrador' | 'aprobado' | 'vigente' | 'vencido'
  approvedBy: string | null
  approvedAt: string | null
}

const STATUS_LABEL: Record<DocumentPdfInput['status'], string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  vigente: 'Vigente',
  vencido: 'Vencido',
}

/** Portada a sangre completa (marca Sport City): rayas diagonales, brillo, índice de secciones y barra inferior. */
function renderFullCover(input: DocumentPdfInput) {
  const logoMark = LOGO_MARK_WHITE
  const dateLabel = new Date(input.updatedAt).toLocaleDateString('es-NI', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const eyebrow = input.status === 'borrador' ? 'Borrador' : 'Documento oficial'
  const toc = input.headings
    .slice(0, 8)
    .map(
      (heading, i) =>
        `<div class="row"><div class="num">${String(i + 1).padStart(2, '0')}</div><div class="t">${escapeHtml(heading)}</div></div>`,
    )
    .join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
${FONT_FACES()}
${themeRoot(input.theme)}
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Inter", sans-serif; -webkit-font-smoothing: antialiased; }
/* El recorte va en un contenedor (no en body): así el brillo que sobresale no hace que Chrome reduzca la escala. */
.page {
  width: 8.5in; height: 11in; position: relative; overflow: hidden; color: #fff;
  background: var(--t-navy);
}
.stripe {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 0 38%, color-mix(in srgb, var(--t-navy) 82%, white) 38% 40%, transparent 40% 41.5%, color-mix(in srgb, var(--t-navy) 82%, white) 41.5% 42.5%, transparent 42.5%);
}
.glow {
  position: absolute; top: -25%; right: -20%; width: 75%; height: 75%; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, color-mix(in srgb, color-mix(in srgb, var(--t-navy) 55%, white) 60%, transparent) 0%, transparent 70%);
}
.content { position: relative; z-index: 2; padding: 0.65in 0.75in 0 0.75in; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand img { height: 26px; }
.brand .wm { display: flex; flex-direction: column; line-height: 1; }
.brand .wm b { font-family: "Sora"; font-weight: 700; font-size: 17px; letter-spacing: -0.02em; }
.brand .wm i { font-family: "Inter"; font-style: normal; font-weight: 500; font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; margin-top: 4px; }
.hero { margin-top: 0.7in; }
.eyebrow {
  font-family: "Sora"; font-weight: 700; font-size: 12.5px; letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--t-accent);
}
h1 {
  color: #fff; font-family: "Sora"; font-weight: 800; font-size: 52px; line-height: 1.02; letter-spacing: -0.03em;
  margin: 12px 0 0 0; max-width: 6.4in;
}
.sub { color: var(--t-on-navy); font-size: 15px; line-height: 1.55; max-width: 4.7in; margin-top: 16px; }
.toc {
  position: relative; z-index: 2; margin: 0.42in 0.75in 0 0.75in;
  border-top: 1px solid oklch(1 0 0 / 0.18); padding-top: 0.2in;
}
.toc .row { display: flex; align-items: baseline; gap: 0.18in; padding: 0.075in 0; border-bottom: 1px solid oklch(1 0 0 / 0.1); }
.toc .num { font-family: "Sora"; font-weight: 800; font-size: 12.5px; color: var(--t-accent); width: 0.3in; flex: none; }
.toc .t { font-family: "Sora"; font-weight: 700; font-size: 13.5px; color: #fff; flex: 1; }
.bottom {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;
  padding: 0.3in 0.75in 0.48in 0.75in; display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid oklch(1 0 0 / 0.14); font-size: 11px; color: var(--t-on-navy);
}
.bottom b { color: var(--t-accent); font-family: "Sora"; }
</style>
</head>
<body>
<div class="page">
  <div class="glow"></div>
  <div class="stripe"></div>
  <div class="content">
    <div class="brand"><img src="${logoMark}" alt=""><span class="wm"><b>Sport City</b><i>Club</i></span></div>
    <div class="hero">
      <div class="eyebrow">${eyebrow} · ${escapeHtml(input.folderName)}</div>
      <h1>${escapeHtml(input.title)}</h1>
      <p class="sub">Versión ${input.versionNumber} · ${STATUS_LABEL[input.status]}${
        input.approvedBy && input.status !== 'borrador'
          ? ` · aprobado por ${escapeHtml(input.approvedBy)}`
          : ''
      }</p>
    </div>
  </div>
  ${toc ? `<div class="toc">${toc}</div>` : ''}
  <div class="bottom">
    <div>${dateLabel}${input.authorName ? ` · ${escapeHtml(input.authorName)}` : ''}</div>
    <div><b>Sport City Club</b> — carretera norte, Km 8.5, Managua</div>
  </div>
</div>
</body>
</html>`
}

type CoverFacts = {
  date: string
  eyebrow: string
  area: string
  title: string
  status: string
  version: number
  author: string | null
  approval: string
}

function coverFacts(input: DocumentPdfInput): CoverFacts {
  return {
    date: new Date(input.updatedAt).toLocaleDateString('es-NI', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    eyebrow: input.status === 'borrador' ? 'Borrador' : 'Documento oficial',
    area: escapeHtml(input.folderName),
    title: escapeHtml(input.title),
    status: STATUS_LABEL[input.status],
    version: input.versionNumber,
    author: input.authorName ? escapeHtml(input.authorName) : null,
    approval:
      input.approvedBy && input.status !== 'borrador'
        ? ` · aprobado por ${escapeHtml(input.approvedBy)}`
        : '',
  }
}

const COVER_BASE = `
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Inter", sans-serif; -webkit-font-smoothing: antialiased; }
.page { width: 8.5in; height: 11in; position: relative; overflow: hidden; }
.wm { display: flex; flex-direction: column; line-height: 1; }
.wm b { font-family: "Sora"; font-weight: 700; font-size: 17px; letter-spacing: -0.02em; }
.wm i { font-family: "Inter"; font-style: normal; font-weight: 500; font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; margin-top: 4px; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand img { height: 26px; }
.k { font-family: "Sora"; font-weight: 700; font-size: 10.5px; letter-spacing: 0.26em; text-transform: uppercase; }
.meta { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.25in; }
.meta dt { font-family: "Sora"; font-weight: 700; font-size: 8px; letter-spacing: 0.16em; text-transform: uppercase; }
.meta dd { margin: 4px 0 0; font-size: 12px; font-weight: 500; }
`

function coverDocument(
  css: string,
  body: string,
  theme: DocumentPdfInput['theme'],
) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
${FONT_FACES()}
${themeRoot(theme)}
${COVER_BASE}
${css}
</style></head><body>${body}</body></html>`
}

/** Portada corporativa: blanca, sobria, con la jerarquía por delante del adorno. */
function renderCleanCover(input: DocumentPdfInput) {
  const f = coverFacts(input)
  const meta = [
    ['Fecha', f.date],
    ['Área', f.area],
    ...(f.author ? [['Autor', f.author]] : []),
    ['Versión', `${f.version} · ${f.status}`],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('')
  return coverDocument(
    `
.page { background: oklch(0.985 0.004 90); color: var(--t-navy); padding: 0.8in 0.85in; }
.lines { position: absolute; right: -1.2in; top: -0.5in; width: 5.6in; height: 12in; transform: rotate(18deg); pointer-events: none;
  background: linear-gradient(90deg, transparent 0 40%, var(--t-tint) 40% 46%, transparent 46% 52%, var(--t-tint) 52% 55%, transparent 55%); }
.hero { position: absolute; left: 0.85in; right: 0.85in; top: 3.3in; }
.bar { width: 0.7in; height: 5px; background: var(--t-accent); margin-bottom: 0.28in; }
.k { color: var(--t-gray); }
h1 { font-family: "Sora"; font-weight: 800; font-size: 46px; line-height: 1.04; letter-spacing: -0.03em; margin: 14px 0 0; max-width: 6in; color: var(--t-navy); }
.sub { margin-top: 18px; font-size: 14px; color: var(--t-gray); }
.foot { position: absolute; left: 0.85in; right: 0.85in; bottom: 0.8in; }
.meta { border-top: 2px solid var(--t-navy); padding-top: 0.18in; }
.meta dt { color: var(--t-gray); }
.meta dd { color: var(--t-navy); }
.addr { margin-top: 0.4in; font-size: 9.5px; color: var(--t-gray); display: flex; justify-content: space-between; }
`,
    `<div class="page"><div class="lines"></div>
  <div class="brand"><img src="${LOGO_MARK}" alt=""><span class="wm"><b>Sport City</b><i>Club</i></span></div>
  <div class="hero"><div class="bar"></div><div class="k">${f.eyebrow}</div><h1>${f.title}</h1><p class="sub">${f.area}${f.approval}</p></div>
  <div class="foot"><dl class="meta">${meta}</dl><div class="addr"><span>Sport City Club</span><span>carretera norte, Km 8.5, Managua · www.sportcitynic.com</span></div></div>
</div>`,
    input.theme,
  )
}

/** Portada comercial: panel de color a la izquierda con los datos, título a la derecha. */
function renderSplitCover(input: DocumentPdfInput) {
  const f = coverFacts(input)
  const facts = [
    ['Fecha', f.date],
    ...(f.author ? [['Preparado por', f.author]] : []),
    ['Versión', `${f.version} · ${f.status}`],
  ]
    .map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('')
  return coverDocument(
    `
.page { background: oklch(0.985 0.004 90); color: var(--t-navy); }
.panel { position: absolute; left: 0; top: 0; bottom: 0; width: 2.9in; background: var(--t-navy); color: #fff; padding: 0.8in 0.5in; display: flex; flex-direction: column; justify-content: space-between; }
.panel::after { content: ""; position: absolute; right: 0; top: 0; bottom: 0; width: 7px; background: var(--t-accent); }
.fact { margin-top: 0.22in; }
.fact dt { font-family: "Sora"; font-weight: 700; font-size: 8px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--t-accent); }
.fact dd { margin: 4px 0 0; font-size: 12px; color: var(--t-on-navy); }
.main { position: absolute; left: 3.5in; right: 0.85in; top: 3.4in; }
.k { color: var(--t-gray); }
h1 { font-family: "Sora"; font-weight: 800; font-size: 40px; line-height: 1.06; letter-spacing: -0.03em; margin: 14px 0 0; color: var(--t-navy); }
.rule { width: 0.8in; height: 5px; background: var(--t-accent); margin: 0.3in 0 0.2in; }
.sub { font-size: 13.5px; line-height: 1.55; color: var(--t-gray); max-width: 3.6in; }
.addr { position: absolute; left: 3.5in; right: 0.85in; bottom: 0.8in; font-size: 9.5px; color: var(--t-gray); border-top: 1px solid var(--t-rule); padding-top: 0.14in; }
`,
    `<div class="page">
  <div class="panel"><div class="brand"><img src="${LOGO_MARK_WHITE}" alt=""><span class="wm"><b>Sport City</b><i>Club</i></span></div><dl>${facts}</dl></div>
  <div class="main"><div class="k">${f.eyebrow} · ${f.area}</div><h1>${f.title}</h1><div class="rule"></div><p class="sub">${f.area}${f.approval}</p></div>
  <div class="addr">Sport City Club · carretera norte, Km 8.5, Managua · 5865-1010 · www.sportcitynic.com</div>
</div>`,
    input.theme,
  )
}

/** Portada de evento: bloque de color con corte diagonal y una franja de acento. */
function renderDiagonalCover(input: DocumentPdfInput) {
  const f = coverFacts(input)
  const meta = [
    ['Fecha', f.date],
    ['Área', f.area],
    ...(f.author ? [['Responsable', f.author]] : []),
    ['Versión', `${f.version} · ${f.status}`],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('')
  return coverDocument(
    `
.page { background: oklch(0.985 0.004 90); }
.block { position: absolute; left: 0; right: 0; top: 0; height: 7.4in; background: var(--t-navy); clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%); color: #fff; }
.accent { position: absolute; left: 0; right: 0; top: 0; height: 7.9in; background: var(--t-accent); clip-path: polygon(0 97%, 100% 76%, 100% 80.5%, 0 100.5%); }
.top { position: absolute; left: 0.85in; right: 0.85in; top: 0.8in; }
.hero { position: absolute; left: 0.85in; right: 0.85in; top: 2.5in; color: #fff; }
.k { color: var(--t-accent); }
h1 { font-family: "Sora"; font-weight: 800; font-size: 54px; line-height: 1.02; letter-spacing: -0.035em; margin: 14px 0 0; max-width: 6.3in; }
.sub { margin-top: 16px; font-size: 14px; color: var(--t-on-navy); }
.foot { position: absolute; left: 0.85in; right: 0.85in; bottom: 0.8in; }
.meta dt { color: var(--t-gray); }
.meta dd { color: var(--t-navy); }
.addr { margin-top: 0.34in; font-size: 9.5px; color: var(--t-gray); border-top: 1px solid var(--t-rule); padding-top: 0.14in; display: flex; justify-content: space-between; }
`,
    `<div class="page"><div class="block"></div><div class="accent"></div>
  <div class="top brand" style="color:#fff"><img src="${LOGO_MARK_WHITE}" alt=""><span class="wm"><b>Sport City</b><i>Club</i></span></div>
  <div class="hero"><div class="k">${f.eyebrow} · ${f.area}</div><h1>${f.title}</h1><p class="sub">${f.status}${f.approval}</p></div>
  <div class="foot"><dl class="meta">${meta}</dl><div class="addr"><span>Sport City Club</span><span>carretera norte, Km 8.5, Managua · www.sportcitynic.com</span></div></div>
</div>`,
    input.theme,
  )
}

/** Portada según el tema del documento. */
export function renderCoverHtml(input: DocumentPdfInput) {
  switch (THEME_INFO[themeOf(input.theme)].style.cover) {
    case 'clean':
      return renderCleanCover(input)
    case 'split':
      return renderSplitCover(input)
    case 'diagonal':
      return renderDiagonalCover(input)
    default:
      return renderFullCover(input)
  }
}

/** Cuerpo del documento (texto del editor) con el lenguaje visual de los manuales de Sport City. Pagina de forma natural. */
/** Mueve la primera fila de encabezados (<th>) de cada tabla a <thead>, para que Chrome la repita en cada página. */
export function promoteHeaderRows(html: string) {
  return html.replace(
    /<tbody>\s*(<tr[^>]*>(?:\s*<th[\s\S]*?<\/th>)+\s*<\/tr>)/g,
    '<thead>$1</thead><tbody>',
  )
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()

function withClass(attrs: string, name: string) {
  return /class="/.test(attrs)
    ? attrs.replace(/class="([^"]*)"/, `class="$1 ${name}"`)
    : `${attrs} class="${name}"`
}

/**
 * Cuida los números y los totales de las tablas: las columnas de cifras van alineadas a la derecha
 * (cabecera incluida) y las filas «Subtotal» / «Total» se destacan.
 */
export function enhanceTables(html: string) {
  return html.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const rows = [...table.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map(
      (m) => m[0],
    )
    const cells = rows.map((row) =>
      [...row.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) =>
        plainText(m[3]),
      ),
    )
    const numeric = numericColumns(cells)
    if (numeric.size === 0 && !cells.some((r) => TOTAL_ROW.test(r[0] ?? '')))
      return table
    let rowIndex = -1
    return table.replace(
      /<tr([^>]*)>([\s\S]*?)<\/tr>/g,
      (_, trAttrs: string, inner: string) => {
        rowIndex += 1
        const label = cells[rowIndex]?.[0] ?? ''
        let attrs = trAttrs
        const total = TOTAL_ROW.test(label)
        if (total)
          attrs = withClass(attrs, /^\s*sub/i.test(label) ? 'sub' : 'tot')
        let col = -1
        const body = inner.replace(
          /<(td|th)([^>]*)>/g,
          (_m, tag: string, cellAttrs: string) => {
            col += 1
            return numeric.has(col)
              ? `<${tag}${withClass(cellAttrs, 'num')}>`
              : _m
          },
        )
        return `<tr${attrs}>${body}</tr>`
      },
    )
  })
}

export function renderContentHtml(input: DocumentPdfInput) {
  const style = THEME_INFO[themeOf(input.theme)].style
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
${FONT_FACES()}
${themeRoot(input.theme)}
:root {
  --navy: var(--t-navy); --ink: oklch(0.18 0.03 275); --paper: oklch(0.985 0.004 90);
  --line: oklch(0.24 0.14 275 / 0.14); --accent: var(--t-accent); --accent-ink: oklch(0.35 0.09 240);
  --gray: oklch(0.46 0.02 275); --warn: oklch(0.55 0.17 40); --good: oklch(0.5 0.14 150);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: "Inter", sans-serif; color: var(--ink); font-size: 12px; line-height: 1.55; -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4 { font-family: "Sora", sans-serif; font-weight: 800; letter-spacing: -0.02em; color: var(--navy); }
.doc-head { border-top: 2px solid var(--navy); padding-top: 0.13in; margin-bottom: 0.05in; }
.kicker { font-family: "Sora"; font-weight: 700; font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent-ink); }
.doc-title { font-size: 26px; margin: 5px 0 0.06in 0; line-height: 1.1; }
.approval { font-size: 10.5px; color: var(--gray); margin: 0 0 0.22in 0; }

/* Secciones: versalitas con línea, como en los manuales */
.body h2 {
  font-family: "Sora"; font-weight: 700; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--navy);
  margin: 0.26in 0 0.12in 0; display: flex; align-items: center; gap: 8px; break-after: avoid;
}
.body h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.body h3 { font-size: 13px; margin: 0.18in 0 0.06in 0; break-after: avoid; }
.body p { margin: 0 0 0.11in 0; }
.body a { color: var(--accent-ink); }
.body img { max-width: 100%; }
.body ul { margin: 0 0 0.14in 0; padding-left: 1.15em; }
.body li { margin-bottom: 0.03in; }
.body li > p { margin: 0; }

/* Listas numeradas = reglas: número, titular en negrita y descripción */
.body ol { list-style: none; padding: 0; margin: 0 0 0.2in 0; counter-reset: rule; }
.body ol > li { counter-increment: rule; display: flex; gap: 0.16in; padding: 0.09in 0; border-bottom: 1px solid var(--line); margin: 0; }
.body ol > li:last-child { border-bottom: none; }
.body ol > li::before { content: counter(rule); font-family: "Sora"; font-weight: 800; font-size: 13px; color: var(--accent-ink); width: 0.3in; flex: none; }
.body ol > li > p { flex: 1; }
.body ol > li strong { font-family: "Sora"; font-weight: 700; font-size: 12px; color: var(--navy); }

/* Tablas: cabecera azul con texto claro, filas blancas */
.body table { width: 100%; border-collapse: collapse; margin: 0.06in 0 0.2in 0; font-size: 11px; break-inside: auto; }
.body th {
  text-align: left; font-family: "Sora"; font-weight: 700; font-size: 9.5px; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--accent-ink); background: transparent; padding: 7px 10px; border-bottom: 2px solid var(--navy);
}
.body thead { display: table-header-group; }
.body td { height: 0.3in; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.body tbody tr:nth-child(even) td { background: rgba(30, 26, 107, 0.028); }
.body tr, .body li, .body p, .body h2, .body h3, .body blockquote, .body img { break-inside: avoid; }
.body th p, .body td p { margin: 0; }

/* Avisos: caja con fondo tenue y borde, como en los manuales */
.body div[data-callout] {
  background: oklch(0.965 0.02 240); border: 1px solid oklch(0.87 0.045 240); border-radius: 10px;
  padding: 0.13in 0.19in; margin: 0.12in 0 0.18in; font-size: 11px; line-height: 1.5; break-inside: avoid;
}
.body div[data-callout][data-tone='warn'] { background: oklch(0.965 0.03 70); border-color: oklch(0.87 0.08 70); }
.body div[data-callout][data-tone='ok'] { background: oklch(0.96 0.03 150); border-color: oklch(0.85 0.07 150); }
.body div[data-callout] > :first-child { margin-top: 0; } .body div[data-callout] > :last-child { margin-bottom: 0; }
.body blockquote { margin: 0.12in 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: #fff; border-radius: 0 8px 8px 0; font-size: 11.5px; }

/* Formato añadido: resaltado, imágenes con pie, tareas y salto de página manual */
.body mark { color: inherit; padding: 0 2px; border-radius: 2px; }
.body figure.sc-figure { margin: 0.12in 0; break-inside: avoid; }
.body figure.sc-figure[data-align='center'] { margin-inline: auto; }
.body figure.sc-figure[data-align='right'] { margin-left: auto; margin-right: 0; }
.body figure.sc-figure[data-align='left'] { margin-right: auto; margin-left: 0; }
.body figure.sc-figure img { display: block; width: 100%; height: auto; border-radius: 4px; }
.body figcaption { margin-top: 4px; font-size: 10px; font-style: italic; color: var(--gray); text-align: center; }
.body ul[data-type='taskList'] { list-style: none; padding-left: 0; }
.body ul[data-type='taskList'] > li { display: flex; gap: 8px; }
.body ul[data-type='taskList'] > li::before { content: '☐'; font-size: 13px; color: var(--navy); flex: none; }
.body ul[data-type='taskList'] > li[data-checked='true']::before { content: '☑'; }
.body ul[data-type='taskList'] > li[data-checked='true'] > div { color: var(--gray); text-decoration: line-through; }
.body ul[data-type='taskList'] > li > div { flex: 1; }
.body div[data-page-break] { break-after: page; height: 0; margin: 0; }

/* Tablas con grosor y color de líneas elegidos en el editor */
.body table[data-border] { --bw: 1px; --bc: var(--t-rule); border-collapse: collapse; }
.body table[data-border='1'] { --bw: 1px; }
.body table[data-border='2'] { --bw: 2px; }
.body table[data-border='3'] { --bw: 3px; }
.body table[data-border='none'] { --bw: 0px; }
.body table[data-border-color='navy'] { --bc: var(--navy); }
.body table[data-border-color='ink'] { --bc: #1b1b3a; }
.body table[data-border] td, .body table[data-border] th { border: var(--bw) solid var(--bc); border-radius: 0; }

/* Organigrama, gráficos e índice automático */
.body .sc-org { margin: 0.14in 0; text-align: center; overflow-x: auto; break-inside: avoid; }
.body .sc-org ul { display: flex; justify-content: center; position: relative; padding: 16px 0 0; margin: 0; list-style: none; }
.body .sc-org > ul { padding-top: 0; }
.body .sc-org li { position: relative; display: flex; flex-direction: column; align-items: center; padding: 16px 5px 0; margin: 0; list-style: none; }
.body .sc-org li::before, .body .sc-org li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 16px; border-top: 1.5px solid var(--t-rule); }
.body .sc-org li::after { right: auto; left: 50%; border-left: 1.5px solid var(--t-rule); }
.body .sc-org li:only-child::before, .body .sc-org li:only-child::after { display: none; }
.body .sc-org li:only-child { padding-top: 16px; }
.body .sc-org > ul > li:only-child { padding-top: 0; }
.body .sc-org li:first-child::before, .body .sc-org li:last-child::after { border: 0 none; }
.body .sc-org li:last-child::before { border-right: 1.5px solid var(--t-rule); border-radius: 0 5px 0 0; }
.body .sc-org li:first-child::after { border-radius: 5px 0 0 0; }
.body .sc-org ul ul::before { content: ''; position: absolute; top: 0; left: 50%; height: 16px; border-left: 1.5px solid var(--t-rule); }
.body .sc-org-node { display: inline-flex; flex-direction: column; min-width: 92px; padding: 6px 10px; background: #fff; border: 1.5px solid var(--t-navy); border-radius: 8px; line-height: 1.25; }
.body .sc-org-node strong { font-family: "Sora", sans-serif; font-size: 10px; color: var(--t-navy); }
.body .sc-org-node small { font-size: 8.5px; color: var(--t-gray); }

.body .sc-chart { margin: 0.14in 0; padding: 0.12in 0.16in; background: #fff; border: 1px solid rgba(30, 26, 107, 0.14); border-radius: 8px; break-inside: avoid; }
.body .sc-chart .c-title { font-family: "Sora", sans-serif; font-weight: 700; font-size: 11px; color: var(--t-navy); margin-bottom: 8px; }
.body .sc-chart .c-row { display: grid; grid-template-columns: 1.5in 1fr 0.9in; gap: 8px; align-items: center; margin: 4px 0; font-size: 10.5px; }
.body .sc-chart .c-track { height: 12px; background: var(--t-tint); border-radius: 999px; overflow: hidden; }
.body .sc-chart .c-fill { height: 100%; background: var(--t-navy); border-radius: 999px; }
.body .sc-chart .c-val { text-align: right; color: var(--t-gray); font-variant-numeric: tabular-nums; }
.body .sc-chart .c-cols { display: flex; align-items: flex-end; gap: 10px; height: 2in; }
.body .sc-chart .c-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 10px; gap: 3px; min-width: 0; }
.body .sc-chart .c-bar { flex: 1; width: 100%; display: flex; align-items: flex-end; background: var(--t-tint); border-radius: 6px 6px 0 0; }
.body .sc-chart .c-bar .c-fill { width: 100%; border-radius: 6px 6px 0 0; }
.body .sc-chart .c-col .c-label { text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

/* Gráficos nuevos (SVG): paletas y elementos. */
.body .sc-chart[data-palette='tema'] {
  --c0: var(--t-navy, #1e1a6b);
  --c1: color-mix(in srgb, var(--t-accent, #9fc4ee) 62%, var(--t-navy, #1e1a6b));
  --c2: var(--t-gray, #6a70a0);
  --c3: color-mix(in srgb, var(--t-accent, #9fc4ee) 75%, #000);
  --c4: color-mix(in srgb, var(--t-navy, #1e1a6b) 62%, #fff);
  --c5: color-mix(in srgb, var(--t-navy, #1e1a6b) 40%, var(--t-gray, #6a70a0));
  --c6: color-mix(in srgb, var(--t-accent, #9fc4ee) 40%, var(--t-navy, #1e1a6b));
  --c7: color-mix(in srgb, var(--t-gray, #6a70a0) 70%, #000);
}
.body .sc-chart[data-palette='vivo'] {
  --c0: #4f46e5; --c1: #0891b2; --c2: #d97706; --c3: #e11d48;
  --c4: #059669; --c5: #7c3aed; --c6: #ea580c; --c7: #475569;
}
.body .sc-chart[data-palette='frio'] {
  --c0: #1e3a8a; --c1: #2563eb; --c2: #0284c7; --c3: #0e7490;
  --c4: #0f766e; --c5: #4f46e5; --c6: #6366f1; --c7: #475569;
}
.body .sc-chart[data-palette='calido'] {
  --c0: #9a3412; --c1: #c2410c; --c2: #d97706; --c3: #b45309;
  --c4: #be123c; --c5: #e11d48; --c6: #a16207; --c7: #78350f;
}
.body .sc-chart[data-palette='gris'] {
  --c0: #1f2937; --c1: #4b5563; --c2: #64748b; --c3: #6b7280;
  --c4: #374151; --c5: #475569; --c6: #334155; --c7: #94a3b8;
}
.body .sc-chart .s0 { --c: var(--c0, #1e1a6b); }
.body .sc-chart .s1 { --c: var(--c1, #6e83bc); }
.body .sc-chart .s2 { --c: var(--c2, #6a70a0); }
.body .sc-chart .s3 { --c: var(--c3, #6f6dab); }
.body .sc-chart .s4 { --c: var(--c4, #9fc4ee); }
.body .sc-chart .s5 { --c: var(--c5, #4c4f7d); }
.body .sc-chart .s6 { --c: var(--c6, #4f5f9a); }
.body .sc-chart .s7 { --c: var(--c7, #4a4f70); }
.body .sc-chart .c-sub { font-size: 9.5px; color: var(--t-gray, #6a70a0); margin: -5px 0 8px; }
.body .sc-chart .c-svg { display: block; width: 100%; height: auto; overflow: visible; }
.body .sc-chart .c-svg text { font-size: 10px; font-variant-numeric: tabular-nums; }
.body .sc-chart .c-svg .ta-m { text-anchor: middle; }
.body .sc-chart .c-svg .ta-e { text-anchor: end; }
.body .sc-chart .c-svg .ta-s { text-anchor: start; }
.body .sc-chart .c-svg .tick { fill: var(--t-gray, #6a70a0); }
.body .sc-chart .c-svg .lbl { fill: currentColor; }
.body .sc-chart .c-svg .val { fill: currentColor; font-size: 9.5px; font-weight: 600; }
.body .sc-chart .c-svg .val.in { fill: #fff; }
.body .sc-chart .c-svg .grid { stroke: var(--t-rule, #c3c8dc); stroke-opacity: 0.55; stroke-width: 0.75; }
.body .sc-chart .c-svg .axis { stroke: var(--t-gray, #6a70a0); stroke-width: 1; }
.body .sc-chart .c-svg .bar { fill: var(--c); }
.body .sc-chart .c-svg .slice { fill: var(--c); stroke: #fff; stroke-width: 1.5; }
.body .sc-chart .c-svg .line { fill: none; stroke: var(--c); stroke-width: 2.25; stroke-linejoin: round; stroke-linecap: round; }
.body .sc-chart .c-svg .area { fill: var(--c); fill-opacity: 0.16; stroke: none; }
.body .sc-chart .c-svg .dot { fill: #fff; stroke: var(--c); stroke-width: 2; }
.body .sc-chart .c-svg .ctr { font-size: 15px; font-weight: 700; fill: var(--t-navy, #1e1a6b); }
.body .sc-chart .c-svg .ctr-sub { font-size: 8.5px; fill: var(--t-gray, #6a70a0); }
.body .sc-chart .c-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; font-size: 10px; }
.body .sc-chart .c-key { display: inline-flex; align-items: center; gap: 5px; }
.body .sc-chart .c-sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; background: var(--c); flex: none; }
.body .sc-chart .c-lv { color: var(--t-gray, #6a70a0); font-variant-numeric: tabular-nums; }
.body .sc-chart .c-note { font-size: 8.5px; color: var(--t-gray, #6a70a0); margin-top: 6px; }

.body .sc-toc { margin: 0.14in 0; padding: 0.1in 0.18in; background: #fff; border-left: 3px solid var(--t-accent); border-radius: 0 8px 8px 0; break-inside: avoid; }
.body .sc-toc-title { font-family: "Sora", sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--t-navy); margin-bottom: 4px; }
.body .sc-toc-item { font-size: 11px; padding: 2px 0; }
.body .sc-toc-l3 { padding-left: 16px; color: var(--t-gray); }

/* Composición según el tema: títulos, tablas y filas alternas */
body[data-h='bar'] .body h2 { display: block; font-size: 15px; letter-spacing: -0.01em; text-transform: none; font-weight: 800; border-left: 4px solid var(--accent); padding-left: 10px; margin: 0.3in 0 0.13in; line-height: 1.25; }
body[data-h='bar'] .body h2::after { display: none; }
body[data-h='plain'] .body h2 { display: block; font-size: 13px; letter-spacing: -0.01em; text-transform: none; font-weight: 800; border-bottom: 1px solid var(--t-rule); padding-bottom: 4px; margin: 0.26in 0 0.12in; }
body[data-h='plain'] .body h2::after { display: none; }
body[data-t='filled'] .body th { background: var(--navy); color: #fff; border-bottom: none; padding: 8px 10px; }
body[data-t='lines'] .body th { color: var(--navy); border-bottom: 1px solid var(--navy); padding: 6px 8px; }
body[data-t='lines'] .body td { border-bottom: 0.5px solid var(--t-rule); padding: 6px 8px; height: 0.27in; }
body[data-z='0'] .body tbody tr:nth-child(even) td { background: transparent; }

/* El primer bloque (cuadro de control) respira bajo el título */
.body > table:first-child { margin-top: 0.16in; }

/* Filas con alto propio: texto centrado y relleno mínimo, como en el editor */
.body tr[style*='height'] > td, .body tr[style*='height'] > th { padding-top: 3px; padding-bottom: 3px; vertical-align: middle; height: auto; }

/* Cifras y totales */
.body td.num, .body th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.body tr.sub td { font-weight: 700; background: var(--t-tint) !important; }
.body tr.tot td { font-weight: 800; color: var(--navy); background: var(--t-tint) !important; border-top: 1.5px solid var(--navy); border-bottom: 1.5px solid var(--navy); font-size: 12px; }

/* Bloques destacados: dato clave, resumen y cifra principal */
.body div[data-callout][data-tone='key'] { background: #fff; border: none; border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; font-family: "Sora"; font-weight: 700; font-size: 13px; color: var(--navy); line-height: 1.4; }
.body div[data-callout][data-tone='summary'] { background: var(--t-tint); border: none; border-radius: 6px; font-size: 11.5px; }
.body div[data-callout][data-tone='kpi'] { background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--navy); border-radius: 0 8px 8px 0; padding: 0.11in 0.18in; }
.body div[data-callout][data-tone='kpi'] > p:first-child { font-family: "Sora"; font-weight: 800; font-size: 26px; line-height: 1.1; letter-spacing: -0.02em; color: var(--navy); margin: 0; }
.body div[data-callout][data-tone='kpi'] > p:not(:first-child) { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--t-gray); margin: 3px 0 0; }
.body .doc-meta { font-size: 10.5px; color: var(--gray); margin: 0 0 0.2in; }

/* Tema Campaña: títulos grandes sin filete, viñetas cuadradas y bloques de impacto */
body[data-h='display'] .body h2 { display: block; font-size: 19px; letter-spacing: -0.015em; text-transform: none; font-weight: 800; margin: 0.06in 0 0.1in; line-height: 1.2; }
body[data-h='display'] .body h2::after { display: none; }
body[data-h='display'] .body h3 { font-size: 14px; }
body[data-h='display'] .body ul:not([data-type='taskList']) { list-style: none; padding-left: 0; }
body[data-h='display'] .body ul:not([data-type='taskList']) > li { position: relative; padding-left: 0.2in; margin-bottom: 0.05in; }
body[data-h='display'] .body ul:not([data-type='taskList']) > li::before { content: ''; position: absolute; left: 0.02in; top: 0.075in; width: 6px; height: 6px; background: var(--accent); }
.body table[data-border-color='paper'] { --bc: var(--paper); }
.body table[data-border-color='paper'] td p:empty { height: 0.24in; }

.body div[data-callout][data-tone='hero'] { background: var(--navy); color: #fff; border: none; border-radius: 0; padding: 0.26in 0.32in 0.3in; margin: 0 0 0.24in; }
.body div[data-callout][data-tone='hero'] > p { margin: 0; color: var(--t-on-navy); }
.body div[data-callout][data-tone='hero'] > p:nth-child(1) { font-family: "Sora"; font-weight: 700; font-size: 8.5px; letter-spacing: 0.26em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.1in; }
.body div[data-callout][data-tone='hero'] > p:nth-child(2) { font-family: "Sora"; font-weight: 800; font-size: 32px; line-height: 1.04; letter-spacing: -0.025em; color: #fff; }
.body div[data-callout][data-tone='hero'] > p:nth-child(2) em { font-style: normal; color: var(--accent); }
.body div[data-callout][data-tone='hero'] > p:nth-child(3) { font-size: 12px; margin-top: 0.1in; }
.body div[data-callout][data-tone='eyebrow'] { background: none; border: none; border-radius: 0; padding: 0; margin: 0.22in 0 0; font-family: "Sora"; font-weight: 700; font-size: 8.5px; letter-spacing: 0.26em; text-transform: uppercase; color: var(--accent-ink); }
.body div[data-callout][data-tone='eyebrow'] p { margin: 0; }
.body div[data-callout][data-tone='eyebrow'] + h2 { margin-top: 0.03in; }
.body div[data-callout][data-tone='eyebrow'] { break-after: avoid; }
body[data-h='display'] .body p { margin-bottom: 0.14in; line-height: 1.65; }
body[data-h='display'] .body li { margin-bottom: 0.07in; }
body[data-h='display'] .body li > p, body[data-h='display'] .body th p, body[data-h='display'] .body td p { margin: 0; }
body[data-h='display'] .body table[data-border='none'] td p { margin: 0 0 0.05in; }
body[data-h='display'] .body table { margin: 0.1in 0 0.26in; }
body[data-h='display'] .body h2 { margin-top: 0.08in; }
.body div[data-callout][data-tone='cta'] { display: grid; grid-template-columns: 1fr 2.5in; column-gap: 0.3in; align-items: center; background: var(--navy); color: #fff; border: none; border-radius: 0; padding: 0.2in 0.3in; margin: 0.2in 0 0; }
.body div[data-callout][data-tone='cta'] > p { margin: 0; text-align: right; font-size: 10.5px; line-height: 1.55; color: var(--t-on-navy); grid-column: 2; }
.body div[data-callout][data-tone='cta'] > p:first-child { grid-column: 1; grid-row: 1 / span 6; text-align: left; font-family: "Sora"; font-weight: 700; font-size: 15px; line-height: 1.3; color: #fff; }
.body div[data-callout][data-tone='cta'] strong { color: var(--accent); }

.watermark {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); white-space: nowrap; font-family: "Sora"; font-weight: 800;
  font-size: 96px; letter-spacing: 0.08em; color: oklch(0.24 0.14 275 / 0.07); pointer-events: none; z-index: 0;
}
</style>
</head>
<body data-h="${style.heading}" data-t="${style.table}" data-z="${style.zebra ? 1 : 0}">
  ${input.status === 'borrador' ? '<div class="watermark">BORRADOR</div>' : ''}
  ${
    style.titleBlock === 'hide'
      ? ''
      : `<div class="doc-head">
  <div class="kicker">${escapeHtml(input.folderName)}</div>
  <h1 class="doc-title">${escapeHtml(input.title)}</h1>
  </div>`
  }
  ${
    style.titleBlock !== 'hide' &&
    input.approvedBy &&
    input.approvedAt &&
    input.status !== 'borrador'
      ? `<div class="approval">${STATUS_LABEL[input.status]} — aprobado por ${escapeHtml(input.approvedBy)} el ${new Date(input.approvedAt).toLocaleDateString('es-NI')}</div>`
      : ''
  }
  ${
    style.cover === 'none' &&
    style.titleBlock !== 'hide' &&
    !input.contentHtml.includes('Código')
      ? `<div class="doc-meta">Versión ${input.versionNumber} · ${new Date(input.updatedAt).toLocaleDateString('es-NI', { year: 'numeric', month: 'long', day: 'numeric' })}${input.authorName ? ` · ${escapeHtml(input.authorName)}` : ''} </div>`
      : ''
  }
  <div class="body">${enhanceTables(promoteHeaderRows(input.contentHtml))}</div>
</body>
</html>`
}

/**
 * Cabecera y pie de las páginas de contenido, con la tipografía de marca (como los manuales de la liga).
 * Se dibuja como una página por hoja sobre un fondo transparente y se superpone al contenido.
 */
export function renderChromeOverlayHtml(
  input: DocumentPdfInput,
  pageCount: number,
) {
  const status =
    input.status === 'borrador' ? 'Borrador' : STATUS_LABEL[input.status]
  const title = escapeHtml(input.title)
  const footerKind = THEME_INFO[themeOf(input.theme)].style.footer
  const pages = Array.from({ length: pageCount }, (_, i) => {
    const header =
      footerKind === 'minimal' || footerKind === 'label'
        ? `<div class="hdr min"><span class="mk">Sport City Club</span><span class="d">${title}</span></div>`
        : `<div class="hdr">
        <span class="b"><img src="${LOGO_MARK}" alt=""><span class="wm"><b>Sport City</b><i>Club</i></span></span>
        <span class="d">${title}</span>
      </div>`
    const page = `Página ${i + 1} de ${pageCount}`
    const footer =
      footerKind === 'strip'
        ? `<div class="ftr">
        <div class="l">
          <div class="k">${title} · ${escapeHtml(status)}</div>
          <div class="n">Sport City Club</div>
        </div>
        <div class="r">
          <div><b>5865-1010</b> · info@sportcityclub.com</div>
          <div>www.sportcitynic.com · ${page}</div>
        </div>
      </div>`
        : footerKind === 'line'
          ? `<div class="ftr line">
        <div><b>Sport City Club</b> · ${title} · ${escapeHtml(status)}</div>
        <div>www.sportcitynic.com · ${page}</div>
      </div>`
          : footerKind === 'label'
            ? `<div class="ftr label">
        <div>${title} · Sport City Club</div>
        <div><b>${String(i + 1).padStart(2, '0')}</b></div>
      </div>`
            : `<div class="ftr minimal">
        <div>Sport City Club · ${escapeHtml(status)}</div>
        <div>${page}</div>
      </div>`
    return `<div class="ov">${header}${footer}</div>`
  }).join('')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
${FONT_FACES()}
${themeRoot(input.theme)}
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
.ov { position: relative; width: 8.5in; height: 11in; overflow: hidden; break-after: page; }
.ov:last-child { break-after: auto; }
.hdr { position: absolute; left: 0.85in; right: 0.85in; top: 0.36in; display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid color-mix(in srgb, var(--t-navy) 16%, transparent); }
.hdr .b { display: flex; align-items: center; gap: 8px; color: var(--t-navy); }
.hdr .b img { height: 24px; }
.hdr .wm { display: flex; flex-direction: column; line-height: 1; }
.hdr .wm b { font-family: "Sora", sans-serif; font-weight: 700; font-size: 13px; letter-spacing: -0.02em; }
.hdr .wm i { font-family: "Inter", sans-serif; font-style: normal; font-weight: 500; font-size: 7.5px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7; margin-top: 3px; }
.hdr .d { font-family: "Inter", sans-serif; font-size: 8.5px; color: var(--t-gray); max-width: 3.8in; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ftr { position: absolute; left: 0; right: 0; bottom: 0; height: 0.62in; background: var(--t-navy); color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 0.85in; }
.ftr .l { min-width: 0; }
.ftr .k { font-family: "Sora", sans-serif; font-weight: 700; font-size: 7.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--t-accent); max-width: 3.6in; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ftr .n { margin-top: 4px; font-family: "Sora", sans-serif; font-weight: 700; font-size: 12px; color: #fff; }
.ftr .r { text-align: right; font-family: "Inter", sans-serif; font-size: 8.5px; line-height: 1.6; color: var(--t-on-navy); }
.ftr .r b { font-family: "Sora", sans-serif; font-weight: 700; color: var(--t-accent); }
.ftr.line, .ftr.minimal { left: 0.85in; right: 0.85in; bottom: 0.42in; height: auto; background: none; padding: 8px 0 0; color: var(--t-gray); font-family: "Inter", sans-serif; font-size: 8.5px; }
.ftr.line { border-top: 1.5px solid var(--t-navy); }
.ftr.line b { font-family: "Sora", sans-serif; font-weight: 700; color: var(--t-navy); }
.ftr.minimal { border-top: 0.5px solid var(--t-rule); font-size: 8px; }
.ftr.label { left: 0.85in; right: 0.85in; bottom: 0.42in; height: auto; background: none; padding: 8px 0 0; border-top: 0.5px solid var(--t-rule); color: var(--t-gray); font-family: "Inter", sans-serif; font-size: 7.5px; letter-spacing: 0.2em; text-transform: uppercase; align-items: center; }
.ftr.label b { font-family: "Sora", sans-serif; font-weight: 800; font-size: 12px; letter-spacing: 0; color: var(--t-navy); }
.hdr.min { padding-bottom: 6px; border-bottom: 0.5px solid var(--t-rule); }
.hdr.min .mk { font-family: "Sora", sans-serif; font-weight: 700; font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--t-navy); }
</style></head><body>${pages}</body></html>`
}
