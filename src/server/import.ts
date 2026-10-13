import { createServerFn } from '@tanstack/react-start'
import { generateJSON } from '@tiptap/html/server'
import type { JSONContent } from '@tiptap/react'
import mammoth from 'mammoth'
import WordExtractor from 'word-extractor'
import { authMiddleware } from '#/server/auth'
import { approveDirectly, insertDocumentWithContent } from '#/server/documents'
import { assertPermission, autoApproves } from '#/lib/permissions'
import { hasShoutedWord, toNameCase } from '#/lib/name-rules'
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
import {
  decodeCsvBytes,
  docTextToHtml,
  parseCsv,
  sheetsToHtml,
} from '#/lib/import-sheet'
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

export const STYLE_MAP = [
  // Encabezados: inglés, español (Word) y "Encabezado" (LibreOffice/plantillas traducidas).
  // Del 3 en adelante todos bajan a h3 — es el nivel más profundo que soporta el editor.
  "p[style-name='Title'] => h2:fresh",
  "p[style-name='Título'] => h2:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h3:fresh",
  "p[style-name='Heading 5'] => h3:fresh",
  "p[style-name='Heading 6'] => h3:fresh",
  "p[style-name='Título 1'] => h2:fresh",
  "p[style-name='Título 2'] => h3:fresh",
  "p[style-name='Título 3'] => h3:fresh",
  "p[style-name='Título 4'] => h3:fresh",
  "p[style-name='Encabezado 1'] => h2:fresh",
  "p[style-name='Encabezado 2'] => h3:fresh",
  "p[style-name='Encabezado 3'] => h3:fresh",
  // Citas: el editor sí tiene cita (blockquote), así que no hace falta que caigan como párrafo suelto.
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "p[style-name='Cita'] => blockquote:fresh",
  "p[style-name='Cita destacada'] => blockquote:fresh",
  // Mammoth ignora el subrayado por defecto (se confunde con enlaces); el editor sí lo soporta.
  'u => u',
]

/** Firma de un .doc binario (97-2003): mammoth no puede leerlo aunque tenga la extensión .docx. */
export function looksLikeLegacyDoc(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  )
}

/** Un .docx es, por dentro, un .zip (firma "PK"). Si no lo es, no es un .docx válido. */
export function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

const OLD_DOC_MESSAGE =
  'es un Word antiguo (.doc) y no se pudo leer. Ábrelo en Word, usa Archivo → Guardar como → ' +
  'Word (.docx) y vuelve a subirlo.'

/** Texto de un Word antiguo (.doc): se pierde el formato, no el contenido. */
async function readLegacyDoc(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  let text: string
  try {
    text = (await new WordExtractor().extract(buffer)).getBody()
  } catch {
    throw new Error(`${fileName}: ${OLD_DOC_MESSAGE}`)
  }
  const html = docTextToHtml(text)
  if (!html)
    throw new Error(`${fileName}: no se encontró contenido para importar.`)
  return html
}

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
  /** Avisos de Word al convertir (estilo sin reconocer, imagen sin encontrar…): no bloquean, pero pueden significar que algo no quedó igual. */
  warnings: number
  /** Si el documento con formato no se pudo montar y se guardó solo el texto, sin perder el contenido. */
  textOnly: boolean
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
    const rawTitle = (dot > 0 ? file.name.slice(0, dot) : file.name)
      .replace(/[_]+/g, ' ')
      .trim()
      .slice(0, 300)
    const title = hasShoutedWord(rawTitle) ? toNameCase(rawTitle) : rawTitle
    if (!title) throw new Error('El archivo no tiene nombre.')
    // El título sale del nombre del archivo, que no escribe quien importa: si viene en mayúsculas
    // sostenidas («NORMATIVA LIGA») se pasa a la forma permitida en vez de rechazar el archivo.

    let html: string
    let campaign = false
    let warnings = 0
    // Guardado solo si es un .docx válido: permite el respaldo a texto plano más abajo si el resto
    // de la conversión no cuaja en el editor.
    let docxBuffer: Buffer | null = null
    // Verdadero cuando solo se conserva el texto (Word antiguo): se avisa para que se revise.
    let textOnly = false
    if (extension === 'doc') {
      html = await readLegacyDoc(
        Buffer.from(await file.arrayBuffer()),
        file.name,
      )
      textOnly = true
    } else if (extension === 'xls') {
      throw new Error(
        `${file.name}: es un Excel antiguo (.xls). Ábrelo en Excel, usa Archivo → Guardar como → Libro de Excel (.xlsx) o CSV y vuelve a subirlo.`,
      )
    } else if (extension === 'xlsx') {
      const buffer = Buffer.from(await file.arrayBuffer())
      if (!looksLikeZip(buffer))
        throw new Error(
          `${file.name}: no se pudo abrir. El archivo parece dañado o no es un .xlsx real.`,
        )
      let sheets: Array<{ sheet: string; data: unknown[][] }>
      try {
        const { default: readExcelFile } = await import('read-excel-file/node')
        sheets = await readExcelFile(buffer)
      } catch {
        throw new Error(
          `${file.name}: no se pudo leer. El archivo parece dañado o protegido con contraseña.`,
        )
      }
      const result = sheetsToHtml(
        sheets.map((s) => ({ name: s.sheet, data: s.data })),
      )
      if (!result.html)
        throw new Error(`${file.name}: no se encontró contenido para importar.`)
      html = result.html
      if (result.truncated) warnings += 1
    } else if (extension === 'csv' || extension === 'tsv') {
      const rows = parseCsv(
        decodeCsvBytes(new Uint8Array(await file.arrayBuffer())),
      )
      const result = sheetsToHtml([{ name: title, data: rows }])
      if (!result.html)
        throw new Error(`${file.name}: no se encontró contenido para importar.`)
      html = result.html
      if (result.truncated) warnings += 1
    } else if (extension === 'docx') {
      const buffer = Buffer.from(await file.arrayBuffer())
      if (looksLikeLegacyDoc(buffer)) {
        // Un .doc antiguo con la extensión cambiada a mano a .docx: se lee como lo que es.
        html = await readLegacyDoc(buffer, file.name)
        textOnly = true
      } else {
        if (!looksLikeZip(buffer))
          throw new Error(
            `${file.name}: no se pudo abrir. El archivo parece dañado o no es un .docx real.`,
          )
        docxBuffer = buffer
        let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>
        try {
          converted = await mammoth.convertToHtml(
            { buffer },
            {
              styleMap: STYLE_MAP,
              convertImage: mammoth.images.imgElement(async (image) => ({
                src: `data:${image.contentType};base64,${await image.read('base64')}`,
              })),
            },
          )
        } catch {
          throw new Error(
            `${file.name}: no se pudo leer. El archivo parece dañado o protegido con contraseña.`,
          )
        }
        html = converted.value
        warnings = converted.messages.filter((m) => m.type === 'warning').length
      }
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
        `${file.name}: formato no admitido. Usa .docx, .doc, .xlsx, .csv, .html, .md o .txt.`,
      )
    }

    const moved = await moveImagesToStorage(html, context.supabase)
    let clean = sanitizeContentHtml(normalizeHeadings(moved.html))
    let content: JSONContent
    try {
      if (!clean.replace(/<[^>]+>/g, '').trim() && !clean.includes('<img'))
        throw new Error(`${file.name}: no se encontró contenido para importar.`)
      content = generateJSON(clean, SCHEMA_EXTENSIONS)
    } catch (err) {
      // El formato de un Word no siempre encaja en el editor (tablas o estilos muy anidados). En vez
      // de dejar a quien lo sube sin nada, se guarda el texto plano: se pierde el formato, no el
      // contenido, y se avisa (`textOnly`) para que sepa que tiene que revisarlo.
      if (!docxBuffer) throw err
      const raw = (await mammoth.extractRawText({ buffer: docxBuffer })).value
      if (!raw.trim())
        throw new Error(`${file.name}: no se encontró contenido para importar.`)
      clean = textToHtml(raw)
      content = generateJSON(clean, SCHEMA_EXTENSIONS)
      textOnly = true
    }

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
    if (autoApproves(context.user.role))
      await approveDirectly(context.supabase, context.user.id, doc.id)
    return {
      id: doc.id,
      title,
      images: moved.kept,
      droppedImages: moved.dropped,
      warnings,
      textOnly,
    }
  })
