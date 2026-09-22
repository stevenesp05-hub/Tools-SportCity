import { BRAND_IMAGES } from '#/lib/brand-assets'
import { themeOf } from '#/lib/doc-themes'
import { extractHeadings } from '#/lib/document-text'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import { expandDynamicBlocks } from '#/lib/dynamic-blocks'
import { downloadImage, inlineInternalImages } from '#/server/images.server'
import type { DocumentPdfInput } from '#/lib/pdf-template'
import type { SupabaseServerClient } from '#/lib/supabase/server'

type Person = { full_name: string | null; email: string }

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

/** Sustituye las imágenes internas (/api/imagenes/…) por data URIs, para que el PDF/Word sean autocontenidos. */
async function inlineImages(html: string, supabase: SupabaseServerClient) {
  // Logos y recursos de marca: se incrustan porque el renderizador no tiene acceso a red (una sola pasada).
  const withBrand = html.replace(
    /src="\/brand\/([A-Za-z0-9._-]+)"/g,
    (whole, name: string) => {
      const dataUri = BRAND_IMAGES[name] as string | undefined
      return dataUri ? `src="${dataUri}"` : whole
    },
  )
  return inlineInternalImages(withBrand, async (name) => {
    const data = await downloadImage(supabase, name)
    if (!data) return null
    const base64 = Buffer.from(await data.arrayBuffer()).toString('base64')
    return `data:${data.type || 'image/png'};base64,${base64}`
  })
}

type ExportRow = {
  id: string
  title: string
  theme?: unknown
  updated_at: string
  status: DocumentPdfInput['status']
  approved_at: string | null
  approver: Person | Person[] | null
  folder: { name: string } | Array<{ name: string }> | null
  version:
    | {
        version_number: number
        content_html: string
        profiles: Person | Person[] | null
      }
    | Array<{
        version_number: number
        content_html: string
        profiles: Person | Person[] | null
      }>
    | null
}

const EXPORT_COLUMNS =
  'id, title, updated_at, status, approved_at, approver:profiles!documents_approved_by_fkey(full_name, email), folder:folders(name), version:document_versions!documents_current_version_id_fkey(version_number, content_html, profiles(full_name, email))'
// Lotes de ids: la lista va en la URL de la consulta y 150 uuids la harían demasiado larga.
const ID_BATCH = 50

/** Una consulta por lote de ids (no una por documento). Los borrados o los que RLS no deja ver simplemente no vienen. */
async function fetchExportRows(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, ExportRow>> {
  const rows = new Map<string, ExportRow>()
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH)
    const load = (select: string) =>
      supabase
        .from('documents')
        .select(select)
        .in('id', batch)
        .is('deleted_at', null)
    // `theme` va en la misma consulta. Tolerante: si la migración 0016 aún no está aplicada la columna no existe,
    // la consulta falla mencionándola y se repite sin ella (se usa el tema corporativo).
    let { data, error } = await load(`${EXPORT_COLUMNS}, theme`)
    if (error && /theme/i.test(error.message))
      ({ data, error } = await load(EXPORT_COLUMNS))
    if (error) continue
    for (const row of (data ?? []) as unknown as ExportRow[])
      rows.set(row.id, row)
  }
  return rows
}

/** Convierte una fila en el documento listo para exportar (HTML saneado y con imágenes incrustadas). */
async function toExportInput(
  supabase: SupabaseServerClient,
  raw: ExportRow,
): Promise<DocumentPdfInput> {
  const version = first(raw.version)
  const author = first(version?.profiles)
  const approver = first(raw.approver)
  const html = await inlineImages(
    expandDynamicBlocks(
      sanitizeContentHtml(version?.content_html ?? '<p></p>'),
    ),
    supabase,
  )

  return {
    theme: themeOf(raw.theme),
    title: raw.title,
    folderName: first(raw.folder)?.name ?? 'Documentos',
    contentHtml: html,
    headings: extractHeadings(html),
    versionNumber: version?.version_number ?? 1,
    updatedAt: raw.updated_at,
    authorName: author?.full_name ?? author?.email ?? null,
    status: raw.status,
    approvedBy: approver?.full_name ?? approver?.email ?? null,
    approvedAt: raw.approved_at,
  }
}

/** Carga un documento listo para exportar (HTML saneado y con imágenes incrustadas). */
export async function loadDocumentForExport(
  supabase: SupabaseServerClient,
  documentId: string,
): Promise<DocumentPdfInput | null> {
  const row = (await fetchExportRows(supabase, [documentId])).get(documentId)
  return row ? toExportInput(supabase, row) : null
}

/**
 * Para exportar muchos documentos (ZIP de una carpeta): lee todos con pocas consultas y devuelve un cargador
 * que prepara cada uno bajo demanda (saneado + imágenes), para no tener todos los HTML con base64 en memoria a la vez.
 */
export async function prepareDocumentsForExport(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<(documentId: string) => Promise<DocumentPdfInput | null>> {
  const rows = await fetchExportRows(supabase, ids)
  return async (documentId) => {
    const row = rows.get(documentId)
    return row ? toExportInput(supabase, row) : null
  }
}

const escapeAttr = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Página HTML autocontenida (sin fuentes incrustadas) para archivar o abrir sin el sistema. */
export function renderStandaloneHtml(input: DocumentPdfInput): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeAttr(input.title)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#1b1b3a;max-width:8.5in;margin:0 auto;padding:0.6in;line-height:1.55;font-size:14px}
h1,h2,h3{color:#1e1a6b}.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#3f78b5;font-weight:700}
.meta{color:#6a70a0;font-size:12px;margin-bottom:24px}
table{border-collapse:collapse;width:100%;margin:12px 0}th{background:#1e1a6b;color:#fff;text-align:left}
th,td{padding:6px 10px;border:1px solid #c9cde0;vertical-align:top}th p,td p{margin:0}
img{max-width:100%}figure{margin:12px auto}figcaption{font-size:11px;font-style:italic;color:#6a70a0;text-align:center}
div[data-callout]{border:1px solid #d9dcec;border-left:4px solid #9fc4ee;padding:8px 12px;margin:10px 0;border-radius:6px}
div[data-tone=warn]{border-left-color:#c2542b}div[data-tone=ok]{border-left-color:#2f9a5d}
ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:8px}
ul[data-type=taskList] li::before{content:'☐'}ul[data-type=taskList] li[data-checked=true]::before{content:'☑'}
div[data-page-break]{break-after:page}
div[data-signatures]{display:flex;gap:40px;margin:16px 0;break-inside:avoid}div[data-signature]{flex:1;margin-top:48px;padding-top:5px;border-top:1.5px solid #1b1b3a;text-align:center}
div[data-signature] p{margin:0;font-size:12px;color:#6a70a0}div[data-signature] p:first-child{color:#1b1b3a;font-weight:600}
</style></head><body>
<div class="kicker">${escapeAttr(input.folderName)}</div>
<h1>${escapeAttr(input.title)}</h1>
<div class="meta">Sport City Club · Versión ${input.versionNumber} · ${escapeAttr(input.status)}</div>
${input.contentHtml}
</body></html>`
}
