import { createServerFn } from '@tanstack/react-start'
import { generateJSON } from '@tiptap/html/server'
import mammoth from 'mammoth'
import { authMiddleware } from '#/server/auth'
import { insertDocumentWithContent } from '#/server/documents'
import { assertPermission } from '#/lib/permissions'
import { mapLimit } from '#/lib/map-limit'
import { SCHEMA_EXTENSIONS } from '#/lib/editor-extensions'
import { sanitizeContentHtml } from '#/lib/sanitize.server'
import {
  extractHtmlBody,
  markdownToHtml,
  normalizeHeadings,
  textToHtml,
} from '#/lib/import-convert'
import { convertStyledHtml } from '#/lib/import-html'
import { hasImageSignature } from '#/server/images.server'
import type { SupabaseServerClient } from '#/lib/supabase/server'

const MAX_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const STYLE_MAP = [
  "p[style-name='Title'] => h2:fresh",
  "p[style-name='Título'] => h2:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Título 1'] => h2:fresh",
  "p[style-name='Título 2'] => h3:fresh",
  "p[style-name='Título 3'] => h3:fresh",
]

/** Las imágenes incrustadas (data URI) se suben al almacenamiento; las que no valen se descartan. */
async function moveImagesToStorage(
  html: string,
  supabase: SupabaseServerClient,
) {
  let kept = 0
  let dropped = 0
  const matches = [
    ...html.matchAll(/<img[^>]*?src="data:([^;"]+);base64,([^"]+)"[^>]*>/g),
  ]
  // Cada imagen se valida y sube por separado (de 4 en 4); devuelve su etiqueta nueva o '' si se descarta.
  const replacements = await mapLimit(matches, 4, async (match) => {
    const [, mime, base64] = match
    const extension = IMAGE_TYPES[mime]
    const bytes = extension ? Buffer.from(base64, 'base64') : null
    if (
      !extension ||
      !bytes ||
      bytes.length > MAX_IMAGE_BYTES ||
      !hasImageSignature(bytes)
    )
      return ''
    const path = crypto.randomUUID()
    const { error } = await supabase.storage
      .from('documentos')
      .upload(path, bytes, { contentType: mime })
    return error ? '' : `<img src="/api/imagenes/${path}">`
  })

  // Un solo pase de reconstrucción del HTML (sin `replace` repetido sobre cadenas con base64).
  let result = ''
  let cursor = 0
  matches.forEach((match, i) => {
    result += html.slice(cursor, match.index) + replacements[i]
    cursor = match.index + match[0].length
    if (replacements[i]) kept += 1
    else dropped += 1
  })
  result += html.slice(cursor)
  return { html: result, kept, dropped }
}

export type ImportResult = {
  id: string
  title: string
  images: number
  droppedImages: number
}

export const importDocument = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData))
      throw new Error('Se esperaba un formulario con el archivo.')
    const file = data.get('file')
    const folderId = data.get('folderId')
    if (!(file instanceof File)) throw new Error('Falta el archivo.')
    if (typeof folderId !== 'string' || !folderId)
      throw new Error('Falta la carpeta.')
    return { file, folderId }
  })
  .handler(async ({ context, data }): Promise<ImportResult> => {
    assertPermission(context.user.role, 'tools.documentos.crear')
    const { file, folderId } = data
    if (file.size > MAX_BYTES) throw new Error(`${file.name} supera los 12 MB.`)

    const dot = file.name.lastIndexOf('.')
    const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
    const title = (dot > 0 ? file.name.slice(0, dot) : file.name)
      .replace(/[_]+/g, ' ')
      .trim()
      .slice(0, 300)
    if (!title) throw new Error('El archivo no tiene nombre.')

    let html: string
    let campaign = false
    if (extension === 'docx') {
      const buffer = Buffer.from(await file.arrayBuffer())
      const converted = await mammoth.convertToHtml(
        { buffer },
        {
          styleMap: STYLE_MAP,
          convertImage: mammoth.images.imgElement(async (image) => ({
            src: `data:${image.contentType};base64,${await image.read('base64')}`,
          })),
        },
      )
      html = converted.value
    } else if (extension === 'html' || extension === 'htm') {
      const source = await file.text()
      try {
        // Con diseño: se leen los estilos del archivo y se traducen a bloques del editor.
        const styled = convertStyledHtml(source)
        html = styled.html.trim() ? styled.html : extractHtmlBody(source)
        campaign = styled.campaign
      } catch {
        html = extractHtmlBody(source)
      }
    } else if (extension === 'md' || extension === 'markdown') {
      html = markdownToHtml(await file.text())
    } else if (extension === 'txt') {
      html = textToHtml(await file.text())
    } else {
      throw new Error(
        `${file.name}: formato no admitido. Usa .docx, .html, .md o .txt.`,
      )
    }

    const moved = await moveImagesToStorage(html, context.supabase)
    const clean = sanitizeContentHtml(normalizeHeadings(moved.html))
    if (!clean.replace(/<[^>]+>/g, '').trim() && !clean.includes('<img'))
      throw new Error(`${file.name}: no se encontró contenido para importar.`)

    const content = generateJSON(clean, SCHEMA_EXTENSIONS)
    const doc = await insertDocumentWithContent(
      context.supabase,
      context.user.id,
      {
        folderId,
        title,
        content,
        contentHtml: clean,
        // Tolerante: solo se envía el tema si es el de campaña (sin la migración 0016/0017 no hay columna).
        theme: campaign ? 'campaign' : undefined,
      },
    )
    return {
      id: doc.id,
      title,
      images: moved.kept,
      droppedImages: moved.dropped,
    }
  })
