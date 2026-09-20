/** Cabecera para que el navegador guarde el archivo directamente, con el nombre real (tildes incluidas). */
export function attachment(name: string, extension: string): string {
  const clean =
    name
      .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'documento'
  const ascii =
    clean
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._ -]/g, '')
      .trim() || 'documento'
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${clean}.${extension}`)}`
}
