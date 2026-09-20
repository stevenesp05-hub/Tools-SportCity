// Recursos de marca empaquetados dentro del código (data URI). En Vercel la carpeta `public/` no está en el
// sistema de archivos de la función, así que el PDF y el Word no pueden leerla con fs.
import logoMark from '../../public/brand/logo-mark.png?inline'
import logoMarkWhite from '../../public/brand/logo-mark-white.png?inline'
import logoFull from '../../public/brand/logo.png?inline'
import soraFont from '../../public/brand/fonts/sora-latin-variable.woff2?inline'
import interFont from '../../public/brand/fonts/inter-latin-variable.woff2?inline'

export const LOGO_MARK = logoMark
export const LOGO_MARK_WHITE = logoMarkWhite
export const SORA_FONT = soraFont
export const INTER_FONT = interFont

/** Imágenes de marca que pueden aparecer en los documentos como /brand/<archivo>. */
export const BRAND_IMAGES: Record<string, string> = {
  'logo-mark.png': logoMark,
  'logo-mark-white.png': logoMarkWhite,
  'logo.png': logoFull,
}
