import { createFileRoute } from '@tanstack/react-router'
import { attachment } from '#/lib/content-disposition'
import { apiAuthMiddleware } from '#/server/auth'
import { loadDocumentForExport } from '#/server/export.server'
import { renderDocumentPdfCached } from '#/lib/pdf-cache.server'

export const Route = createFileRoute('/api/documentos/$docId/pdf')({
  server: {
    middleware: [apiAuthMiddleware],
    handlers: {
      GET: async ({ params, context, request }) => {
        const input = await loadDocumentForExport(
          context.supabase,
          params.docId,
        )
        if (!input)
          return new Response('Documento no encontrado', { status: 404 })

        // ?portada=1 / ?portada=0 fuerza; sin parámetro, según el tema.
        const param = new URL(request.url).searchParams.get('portada')
        const cover = param === null ? undefined : param !== '0'
        // La lectura anterior ya pasó por RLS (autorización); la caché solo evita regenerar el mismo PDF.
        const pdf = await renderDocumentPdfCached(params.docId, input, {
          cover,
        })
        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': attachment(input.title, 'pdf'),
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
