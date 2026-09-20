import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import { uploadImage } from '#/server/uploads'

/** Reduce el peso de la imagen antes de subirla: máximo 1800 px de ancho y WebP, si así pesa menos. */
export async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.size < 250 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1800 / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas
      .getContext('2d')
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob || blob.size >= file.size * 0.9) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', {
      type: 'image/webp',
    })
  } catch {
    return file
  }
}

/** Imágenes de un portapapeles o de un arrastre (ignora cualquier otro tipo de archivo). */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((file) =>
    /^image\/(png|jpe?g|webp|gif)$/i.test(file.type),
  )
}

/**
 * Comprime, sube e inserta imágenes en el documento (en `pos`, o donde esté el cursor).
 * Solo se admiten imágenes de editor: los documentos no se suben como archivos.
 */
export async function insertImageFiles(
  editor: Editor,
  files: File[],
  pos?: number,
): Promise<void> {
  let at = pos
  for (const file of files) {
    const toastId = toast.loading('Subiendo imagen…')
    try {
      const formData = new FormData()
      formData.append('file', await compressImage(file))
      const { url } = await uploadImage({ data: formData })
      const chain = editor.chain().focus()
      if (at === undefined) chain.setImage({ src: url }).run()
      else {
        chain.insertContentAt(at, { type: 'image', attrs: { src: url } }).run()
        at = undefined
      }
      toast.dismiss(toastId)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo subir la imagen',
        { id: toastId },
      )
    }
  }
}
