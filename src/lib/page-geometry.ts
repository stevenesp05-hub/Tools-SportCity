/**
 * Medidas de página de carta (8.5×11 in) compartidas entre el editor (pagination.ts,
 * DocumentEditor.tsx) y la exportación a PDF (pdf.server.ts). Antes cada uno tenía sus propios
 * literales ("1.05in", "0.85in"...) repetidos a mano: cambiar el margen implicaba tocar los tres
 * sitios y arriesgarse a que quedaran desincronizados (la hoja del editor dejaría de coincidir con
 * el PDF real). Aquí no cambia ningún número, solo de dónde sale.
 */
export const PAGE_HEIGHT_IN = 11
export const PAGE_MARGIN_TOP_IN = 1.05
export const PAGE_MARGIN_SIDE_IN = 0.85
export const PAGE_MARGIN_BOTTOM_IN = 0.85
