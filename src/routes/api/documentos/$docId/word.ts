import { createFileRoute } from '@tanstack/react-router'
import { attachment } from '#/lib/content-disposition'
import { apiAuthMiddleware } from '#/server/auth'
import { loadDocumentForExport } from '#/server/export.server'
import { buildDocx } from '#/lib/docx.server'

export const Route = createFileRoute('/api/documentos/$docId/word')({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context }) => {
        const input = await loadDocumentForExport(
          context.supabase,
          params.docId,
        )
        if (!input)
          return new Response('Documento no encontrado', { status: 404 })

        const docx = await buildDocx(input)
        return new Response(new Uint8Array(docx), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': attachment(input.title, 'docx'),
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
