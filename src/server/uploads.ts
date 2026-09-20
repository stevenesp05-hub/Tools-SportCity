import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '#/server/auth'
import { assertPermission } from '#/lib/permissions'
import { hasImageSignature } from '#/server/images.server'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_BYTES = 5 * 1024 * 1024

export const uploadImage = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData))
      throw new Error('Se esperaba un formulario con la imagen.')
    const file = data.get('file')
    if (!(file instanceof File)) throw new Error('Falta la imagen.')
    return { file }
  })
  .handler(async ({ context, data }): Promise<{ url: string }> => {
    assertPermission(context.user.role, 'tools.documentos.editar')

    if (!(data.file.type in ALLOWED_TYPES))
      throw new Error('Formato no permitido. Usa PNG, JPG, WEBP o GIF.')
    if (
      !hasImageSignature(
        new Uint8Array(await data.file.slice(0, 16).arrayBuffer()),
      )
    )
      throw new Error('El archivo no es una imagen válida.')
    if (data.file.size > MAX_BYTES)
      throw new Error('La imagen supera los 5 MB.')

    // Sin extensión: el servidor de desarrollo no enruta las URL que terminan en .png; el tipo va en los metadatos.
    const path = crypto.randomUUID()
    const { error } = await context.supabase.storage
      .from('documentos')
      .upload(path, data.file, { contentType: data.file.type })
    if (error) throw new Error(error.message)

    return { url: `/api/imagenes/${path}` }
  })
