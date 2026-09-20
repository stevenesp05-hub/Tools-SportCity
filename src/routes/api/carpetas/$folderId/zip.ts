import { createFileRoute } from '@tanstack/react-router'
import { attachment } from '#/lib/content-disposition'
import JSZip from 'jszip'
import { apiAuthMiddleware } from '#/server/auth'
import {
  prepareDocumentsForExport,
  renderStandaloneHtml,
} from '#/server/export.server'
import { mapWithConcurrency } from '#/server/images.server'
import { buildDocx } from '#/lib/docx.server'

const MAX_DOCUMENTS = 150

const safeName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sin nombre'

type FolderNode = { id: string; name: string; parent_id: string | null }

export const Route = createFileRoute('/api/carpetas/$folderId/zip')({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context, request }) => {
        const format =
          new URL(request.url).searchParams.get('formato') === 'html'
            ? 'html'
            : 'docx'

        const { data: allFolders } = await context.supabase
          .from('folders')
          .select('id, name, parent_id')
          .is('record_id', null)
        const folders = (allFolders ?? []) as FolderNode[]
        const root = folders.find((f) => f.id === params.folderId)
        if (!root) return new Response('Carpeta no encontrada', { status: 404 })

        // Ruta de cada carpeta dentro del ZIP, empezando por la carpeta elegida.
        const paths = new Map<string, string>([[root.id, safeName(root.name)]])
        const queue = [root.id]
        while (queue.length > 0) {
          const current = queue.shift() as string
          for (const child of folders.filter((f) => f.parent_id === current)) {
            paths.set(child.id, `${paths.get(current)}/${safeName(child.name)}`)
            queue.push(child.id)
          }
        }

        const { data: docs } = await context.supabase
          .from('documents')
          .select('id, title, folder_id')
          .in('folder_id', [...paths.keys()])
          .is('deleted_at', null)
          .order('title')
        const documents = (docs ?? []) as Array<{
          id: string
          title: string
          folder_id: string
        }>
        if (documents.length === 0)
          return new Response('La carpeta no tiene documentos.', {
            status: 404,
          })
        if (documents.length > MAX_DOCUMENTS)
          return new Response(
            `La carpeta tiene ${documents.length} documentos; el máximo por descarga es ${MAX_DOCUMENTS}. Descarga las subcarpetas por separado.`,
            { status: 413 },
          )

        // Los documentos se leen con pocas consultas y se convierten de 4 en 4; el orden y los nombres del ZIP
        // se asignan después, en el orden original, para que el resultado sea el mismo que en serie.
        const load = await prepareDocumentsForExport(
          context.supabase,
          documents.map((doc) => doc.id),
        )
        const files = await mapWithConcurrency(documents, 4, async (doc) => {
          const input = await load(doc.id)
          if (!input) return null
          return format === 'docx'
            ? await buildDocx(input)
            : renderStandaloneHtml(input)
        })

        const zip = new JSZip()
        const used = new Set<string>()
        documents.forEach((doc, index) => {
          const file = files[index]
          if (file === null) return
          const base = `${paths.get(doc.folder_id) ?? safeName(root.name)}/${safeName(doc.title)}`
          let name = `${base}.${format}`
          for (let n = 2; used.has(name); n += 1)
            name = `${base} (${n}).${format}`
          used.add(name)
          zip.file(name, file)
        })

        const bytes = await zip.generateAsync({
          type: 'uint8array',
          compression: 'DEFLATE',
        })
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': attachment(root.name, 'zip'),
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
