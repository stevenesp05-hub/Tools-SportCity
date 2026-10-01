/**
 * Limpia el HTML que llega al pegar desde fuera del editor (Word, Google Docs, Excel, una página
 * web): quita `<style>`/`<script>` (si no, el analizador los trataría como texto suelto) y los
 * atributos `style`/`class` de cada elemento, para que el color o el tamaño de letra de origen no
 * se cuele como marca del editor. La estructura (negrita, listas, tablas, enlaces…) se conserva tal
 * cual — esto no reemplaza al conversor de "Importar archivo" (import-html.ts), que hace un análisis
 * mucho más caro pensado para un documento entero, no para algo que corre en cada pulsación de pegar.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('style, script').forEach((el) => el.remove())
  const strip = (el: Element) => {
    el.removeAttribute('style')
    el.removeAttribute('class')
    for (const child of Array.from(el.children)) strip(child)
  }
  strip(doc.body)
  return doc.body.innerHTML
}
