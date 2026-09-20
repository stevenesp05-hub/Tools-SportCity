import { toast } from 'sonner'

function fileNameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      /* se usa el nombre simple */
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback
}

/**
 * Descarga un archivo directamente al ordenador (sin abrir otra pestaña) y avisa mientras se genera:
 * los PDF tardan unos segundos.
 */
export async function downloadFile(
  url: string,
  options: { fallbackName: string; loading?: string },
): Promise<void> {
  const toastId = toast.loading(options.loading ?? 'Preparando la descarga…')
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 160)
      throw new Error(detail || `Error ${response.status}`)
    }
    const name = fileNameFrom(
      response.headers.get('content-disposition'),
      options.fallbackName,
    )
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
    toast.success(`Descargado: ${name}`, { id: toastId })
  } catch (err) {
    toast.error(
      err instanceof Error && err.message
        ? `No se pudo descargar: ${err.message}`
        : 'No se pudo descargar el archivo',
      { id: toastId },
    )
  }
}

/**
 * Imprime el documento tal y como saldrá en el PDF (misma paginación, cabecera y pie): genera el PDF,
 * lo carga en un marco oculto y abre el diálogo de impresión. Si el navegador no deja imprimir el marco,
 * abre el PDF en una pestaña para imprimirlo desde ahí.
 */
export async function printDocument(
  docId: string,
  options: { cover?: boolean } = {},
): Promise<void> {
  const toastId = toast.loading('Preparando la impresión…')
  try {
    const response = await fetch(
      `/api/documentos/${docId}/pdf${options.cover ? '' : '?portada=0'}`,
      { credentials: 'same-origin' },
    )
    if (!response.ok) throw new Error(`Error ${response.status}`)
    const objectUrl = URL.createObjectURL(await response.blob())
    const frame = document.createElement('iframe')
    frame.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    frame.src = objectUrl
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
        toast.dismiss(toastId)
      } catch {
        window.open(objectUrl, '_blank')
        toast.dismiss(toastId)
      }
    })
    document.body.append(frame)
    setTimeout(() => {
      frame.remove()
      URL.revokeObjectURL(objectUrl)
    }, 5 * 60_000)
  } catch (err) {
    toast.error(
      err instanceof Error && err.message
        ? `No se pudo preparar la impresión: ${err.message}`
        : 'No se pudo preparar la impresión',
      { id: toastId },
    )
  }
}
