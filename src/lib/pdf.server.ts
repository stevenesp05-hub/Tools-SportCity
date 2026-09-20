import type { Browser, PDFOptions } from 'puppeteer-core'
import { PDFDocument, rgb } from 'pdf-lib'
import {
  renderChromeOverlayHtml,
  renderContentHtml,
  renderCoverHtml,
} from '#/lib/pdf-template'
import type { DocumentPdfInput } from '#/lib/pdf-template'
import { THEME_INFO, themeOf } from '#/lib/doc-themes'

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
)

async function launchBrowser(): Promise<Browser> {
  if (IS_SERVERLESS) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteerCore = await import('puppeteer-core')
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  // Dev local: usa el Chromium que descarga el paquete `puppeteer` (devDependency).
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.launch({ headless: true })
  return browser
}

// Chromium tarda 1-3 s en arrancar: se reutiliza el mismo navegador entre peticiones (en serverless, entre
// invocaciones de la misma instancia) y solo se abren y cierran páginas. Se guarda la promesa para que las
// peticiones simultáneas no lancen cada una el suyo.
const IDLE_CLOSE_MS = 60_000
let browserPromise: Promise<Browser> | null = null
let leases = 0
let lastUsed = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null

function startBrowser(): Promise<Browser> {
  const promise = launchBrowser()
  // Si el navegador se cae o se cierra por fuera, la próxima petición lanza uno nuevo.
  promise.then(
    (browser) =>
      browser.on('disconnected', () => {
        if (browserPromise === promise) browserPromise = null
      }),
    () => {
      if (browserPromise === promise) browserPromise = null
    },
  )
  return promise
}

async function acquireBrowser(): Promise<Browser> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const promise = (browserPromise ??= startBrowser())
    try {
      const browser = await promise
      if (browser.connected) return browser
    } catch (error) {
      if (browserPromise === promise) browserPromise = null
      // Un fallo de lanzamiento anterior (de otra petición) no debe contagiar a esta: se reintenta una vez.
      if (attempt === 1) throw error
      continue
    }
    if (browserPromise === promise) browserPromise = null
  }
  throw new Error('No se pudo iniciar el navegador para generar el PDF.')
}

/** Cierra el navegador compartido (cierre por inactividad y pruebas). La siguiente petición lanza otro. */
export async function closePdfBrowser(): Promise<void> {
  const promise = browserPromise
  browserPromise = null
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (!promise) return
  try {
    await (await promise).close()
  } catch {
    // Ya estaba cerrado o nunca llegó a arrancar.
  }
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer)
  // unref: el temporizador no mantiene vivo el proceso (dev local, pruebas).
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (leases > 0 || Date.now() - lastUsed < IDLE_CLOSE_MS) scheduleIdleClose()
    else void closePdfBrowser()
  }, IDLE_CLOSE_MS)
  idleTimer.unref()
}

/** Da el navegador compartido a `work`; mientras dure no se cierra por inactividad. Varias a la vez son válidas. */
async function withBrowser<T>(work: (browser: Browser) => Promise<T>) {
  leases += 1
  try {
    return await work(await acquireBrowser())
  } finally {
    leases -= 1
    lastUsed = Date.now()
    scheduleIdleClose()
  }
}

async function renderPagePdf(
  browser: Browser,
  html: string,
  options: PDFOptions,
) {
  const page = await browser.newPage()
  try {
    // El contenido lo escriben usuarios: sin JavaScript y sin ninguna petición de red ni de archivos locales.
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      const url = request.url()
      if (url.startsWith('data:') || url === 'about:blank')
        void request.continue()
      else void request.abort()
    })
    await page.setContent(html, { waitUntil: 'load' })
    return await page.pdf({
      format: 'letter',
      printBackground: true,
      ...options,
    })
  } finally {
    await page.close()
  }
}

/** Genera el PDF de un documento al vuelo: portada de marca + cuerpo con la tipografía Sport City. Nunca se guarda. */
export async function renderDocumentPdf(
  input: DocumentPdfInput,
  options: { cover?: boolean } = {},
): Promise<Buffer> {
  const style = THEME_INFO[themeOf(input.theme)].style
  // Sin indicar nada, la portada depende del tema (el interno no lleva).
  const withCover = options.cover ?? style.cover !== 'none'
  const paper = style.paper === 'white' ? rgb(1, 1, 1) : rgb(0.98, 0.976, 0.965)
  const { coverBytes, overlayBytes, content } = await withBrowser(
    async (browser) => {
      // La portada no depende del contenido: se renderizan a la vez, cada una en su propia página.
      const [cover, contentBytes] = await Promise.all([
        withCover
          ? renderPagePdf(browser, renderCoverHtml(input), {
              margin: { top: 0, bottom: 0, left: 0, right: 0 },
            })
          : Promise.resolve(null),
        renderPagePdf(browser, renderContentHtml(input), {
          margin: {
            top: '1.05in',
            bottom: '0.85in',
            left: '0.85in',
            right: '0.85in',
          },
        }),
      ])
      const body = await PDFDocument.load(contentBytes)

      // Cabecera y pie de marca: una página transparente por hoja (necesita saber cuántas hojas tiene el cuerpo).
      const overlay = await renderPagePdf(
        browser,
        renderChromeOverlayHtml(input, body.getPageCount()),
        {
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
          omitBackground: true,
        },
      )
      return { coverBytes: cover, overlayBytes: overlay, content: body }
    },
  )

  const merged = await PDFDocument.create()
  if (coverBytes) {
    const cover = await PDFDocument.load(coverBytes)
    const [coverPage] = await merged.copyPages(cover, [0])
    merged.addPage(coverPage)
  }
  const overlay = await PDFDocument.load(overlayBytes)
  const bodies = await merged.embedPdf(content, content.getPageIndices())
  const stamps = await merged.embedPdf(overlay, overlay.getPageIndices())

  // Cada hoja: fondo papel (el de los manuales), contenido y, encima, cabecera y pie.
  bodies.forEach((body, index) => {
    const page = merged.addPage([612, 792])
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      color: paper,
    })
    page.drawPage(body)
    page.drawPage(stamps[Math.min(index, stamps.length - 1)])
  })

  return Buffer.from(await merged.save())
}
