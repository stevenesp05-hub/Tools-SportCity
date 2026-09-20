# Auditoría visual de Sport City Document Studio

Medido sobre el código el 20/09/2026, antes de rediseñar. El resultado y las reglas están en [sistema-visual.md](sistema-visual.md).

## 1. Hallazgos en la interfaz

| Problema | Medición | Decisión |
|---|---|---|
| Tamaños de texto arbitrarios | 34 × `text-[11px]`, 8 × `text-[10px]`, más `[13px]`, `[12px]`, `[15px]`, `[0.8rem]` | Un solo token `text-2xs` (11 px) y la escala estándar. Se conservan los tamaños de papel (≤ 13 px), que son tipografía de impresión, no de interfaz |
| Radios sin sistema | 8 valores distintos (`rounded`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl`, `-full`, `[4px]`) | Cuatro: control `md`, contenedor `lg`, flotante `xl`, píldora `full` |
| Sombras | 6 variantes (`shadow`, `xs`, `sm`, `md`, `lg`, `2xl`) | Tres, con uso definido |
| Colores sueltos | 20 combinaciones de Tailwind (`amber-*`, `emerald-*`, `sky-*`, `violet-*`, `orange-*`, `red-*`) para avisos y estados | Tokens semánticos `success / warning / info / danger` (texto, fondo, borde, sólido) |
| Avisos repetidos | El mismo bloque `border-X-300 bg-X-50 text-X-900` en 7 sitios con colores distintos (revisión violeta, borrador celeste, conflicto ámbar…) | Mismo lenguaje: `info` para revisión y borrador, `warning` para conflicto y rechazo, `success` para aprobado |
| Cabecera del documento dispersa | Título, estado, botones y menús en tres bloques con bordes propios; barra de herramientas de ~30 botones | Una sola cabecera: identidad + menús + herramientas fijas; el resto en menús |
| Plantilla «igual a todas» | 68 plantillas con el mismo membrete (logo + título + tabla de control), el mismo cierre y una única composición | Ver §2 |
| Logo repetido | Portada + cabecera de cada página + membrete de la plantilla en el cuerpo (tres veces en la primera página) | El membrete de plantilla ya no lleva logo |
| Móvil | Sin `@media` en el editor (corregido en la pasada anterior); galería de plantillas con lista de tarjetas de texto | Galería con categorías en fila desplazable y tarjetas de 2 columnas |
| Alineación de cifras | Números a la izquierda, totales como una fila más | Cifras a la derecha con números tabulares; subtotal y total destacados |

## 2. Auditoría de plantillas (68)

- **Estructura repetida:** las 68 empezaban con el mismo bloque `logo + «Sport City Club» + título + «Documento oficial · Uso interno»` seguido de la misma tabla de control, y acababan con el mismo aviso de «Documento controlado…». Una carta y un presupuesto de evento eran indistinguibles.
- **Sin propósito visual:** el tema era una paleta única; no había portada distinta, ni pie distinto, ni tablas distintas.
- **Categorización inexistente:** la galería agrupaba solo por «para esta carpeta / generales».

Qué se ha hecho:
1. Cada plantilla recibe **categoría** y **tema** por nombre (`template-catalog.ts`); las seis categorías (Corporativo, Comercial, Administración y finanzas, Operaciones, Personas y estructura, Eventos y ligas) tienen plantillas reales, y los cinco temas se usan (lo comprueba un test).
2. El **membrete** pasa a ser solo el cuadro de control; el logo lo pone la cabecera del tema.
3. **Propuestas e informes** empiezan con un bloque de *resumen*; los **documentos internos** cierran con la nota de control como *resumen* tenue. Los demás no llevan cierre.
4. Los temas cambian portada, pie, títulos y tablas (ver la tabla del sistema visual).

Pendiente de criterio humano (no se ha tocado el contenido): revisar el texto de las 68 plantillas y decidir cuáles sobran. La auditoría visual no puede decidir qué documentos necesita el club.

## 3. Verificación

Comprobado generando PDFs reales de cada tema y de cinco plantillas (Presupuesto de evento, Procedimiento operativo, Informe general, Carta oficial, Reglamento de liga): portadas, pies, cabeceras de tabla repetidas, cifras alineadas, totales, KPI y bloques destacados.

No comprobado en pantalla en esta pasada (la sesión del navegador estaba caducada): la galería de plantillas, la cabecera unificada, el modo enfoque y la vista previa del PDF. Compilan, pasan lint y pruebas, pero necesitan una revisión visual en escritorio y móvil.

## 4. Nota sobre trabajo simultáneo

Durante esta pasada aparecieron cambios ajenos a ella en `charts.ts`, `ChartDialog.tsx`, `BlockDialog.tsx`, `editor-extensions.ts`, `docx.server.ts` y `sanitize.server.ts` (una refactorización de gráficos en curso). Producen errores de compilación propios (`CHART_KINDS` sin exportar, tipos implícitos) que no se han tocado.
