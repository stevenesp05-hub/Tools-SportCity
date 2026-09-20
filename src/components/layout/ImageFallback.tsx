import { useEffect } from 'react'

/**
 * El servidor de desarrollo de Vite responde 404 a las peticiones de <img> hacia rutas /api/…
 * (las de producción no). Si una imagen del sistema falla, se pide con fetch y se muestra como blob.
 */
export function ImageFallback() {
  useEffect(() => {
    const tried = new WeakSet<HTMLImageElement>()
    const onError = (event: Event) => {
      const img = event.target
      if (!(img instanceof HTMLImageElement) || tried.has(img)) return
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('/api/')) return
      tried.add(img)
      void fetch(src, { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (blob) img.src = URL.createObjectURL(blob)
        })
        .catch(() => undefined)
    }
    document.addEventListener('error', onError, true)
    return () => document.removeEventListener('error', onError, true)
  }, [])
  return null
}
