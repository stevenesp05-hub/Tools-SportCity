# Sport City Document Studio — sistema visual

Dos capas que comparten identidad pero no reglas: **la interfaz** (sobria, editorial, tecnológica) y **el documento** (donde la marca se expresa). La interfaz nunca compite con el papel.

## 1. Interfaz

### Tipografía
| Rol | Fuente | Uso |
|---|---|---|
| Display | Sora 700–800 | Títulos de pantalla y de documento, etiquetas en versalitas |
| Texto | Inter 400–600 | Todo lo demás |

Escala (Tailwind, sin tamaños sueltos):

| Token | Tamaño | Uso |
|---|---|---|
| `text-2xs` | 11 px | Metadatos, etiquetas en versalitas, contadores |
| `text-xs` | 12 px | Ayuda, filas densas, chips |
| `text-sm` | 14 px | Cuerpo de la interfaz, botones, menús |
| `text-base` | 16 px | Texto destacado |
| `text-lg` / `text-xl` | 18 / 20 px | Títulos de diálogo y de documento |

Etiqueta en versalitas (repetida en toda la app): `font-display text-2xs uppercase tracking-wide text-muted-foreground`.

### Espaciado
Escala de 4 px (`1`, `1.5`, `2`, `3`, `4`, `5`, `6`, `8`). Regla: gutters de pantalla `px-4` (móvil) / `px-6` (escritorio); separación entre secciones `mb-8`; entre controles `gap-2`.

### Radios
Un radio por familia (antes había 8 distintos):
- Controles (botones, inputs, chips rectangulares, ítems de menú): `rounded-md`
- Contenedores (tarjetas, cabecera, avisos): `rounded-lg`
- Superficies flotantes (diálogos, popovers): `rounded-xl`
- Píldoras y avatares: `rounded-full`

### Sombras
Solo tres: `shadow-sm` (cabecera del documento, hoja), `shadow-md` (elementos que se elevan al pasar el ratón), `shadow-lg` (menús, diálogos, cajones). Las superficies planas no llevan sombra: se separan con `border`.

### Color
Tokens en `styles.css`; nada de colores de Tailwind sueltos (había 20 combinaciones `amber/emerald/sky/violet/red…`).

| Token | Uso |
|---|---|
| `background` / `card` | Fondo y superficies |
| `foreground` / `muted-foreground` | Texto y texto secundario |
| `border` | Filetes (siempre 1 px) |
| `primary` (índigo Sport City) / `accent` (celeste) | Acciones y realces |
| `success` · `warning` · `info` · `destructive` | Estados. Cada uno con `-soft` (fondo), `-line` (borde) y `-solid` (puntos, iconos) |

Los colores de categoría de `visuals.tsx` (iconos de carpetas y plantillas) son decorativos y están aislados en ese archivo.

### Iconografía
Solo `lucide-react`, 16 px (`size-4`) en controles, 20 px en tarjetas, trazo por defecto.

### Movimiento
Solo donde informa: guardado (punto que late), estados de carga, aparición de menús. Nada decorativo.

## 2. Documento: cinco composiciones

El mismo contenido cambia de personalidad con el tema (`src/lib/doc-themes.ts`). Comparten tipografía (Sora + Inter), la marca y las reglas de composición; cambian portada, pie, títulos y tablas.

| Tema | Portada | Pie | Títulos | Tablas | Papel |
|---|---|---|---|---|---|
| **Corporativo** | Limpia, blanca, jerarquía por delante del adorno | Franja de color | Versalitas con filete | Cabecera subrayada | Crema |
| **Informe** | A sangre completa con índice | Franja de color | Versalitas con filete | Subrayada + filas alternas | Crema |
| **Propuesta** | Dividida: panel de color con datos + título | Franja de color | Barra de acento | Cabecera de color, totales destacados | Crema |
| **Evento** | Bloque de color con diagonal y franja de acento | Franja de color | Barra de acento | Cabecera de color + filas alternas | Crema |
| **Interno** | Sin portada (fácil de imprimir) | Solo texto | Simples con filete | Líneas finas | Blanco puro |

Reglas comunes a los cinco:
- Márgenes 0,85 in (lados), cabecera 0,36 in, pie 0,62 in; hoja Carta.
- Cifras alineadas a la derecha con números tabulares; filas «Subtotal» y «Total» destacadas (editor y PDF comparten `table-semantics.ts`).
- Bloques destacados con moderación: aviso (info/advertencia/correcto), **dato destacado**, **resumen** y **cifra principal (KPI)**.
- El logo aparece una vez por página (cabecera) y en la portada; las plantillas ya no lo repiten en el cuerpo.

## 3. Cómo añadir algo

- **Nuevo tema:** una entrada en `THEME_INFO` (colores + composición) y, si hace falta, una portada en `pdf-template.ts`.
- **Nueva plantilla:** una definición en `default-templates.ts`; su categoría y tema salen de `template-catalog.ts` por nombre.
- **Nuevo bloque visual:** un tono de aviso (`data-tone`) con su CSS en `styles.css` (editor) y `pdf-template.ts` (PDF).
