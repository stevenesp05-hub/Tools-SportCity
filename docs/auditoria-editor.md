# Sport City Document Studio — auditoría y decisiones del editor

Estado a 20/09/2026. Todo lo que aparece como «real» se ha comprobado leyendo el código o ejecutándolo; lo que no se ha podido comprobar en este entorno se marca como **pendiente de verificar**.

## 1. Arquitectura: qué editor es y si sirve

- **TipTap v3 sobre ProseMirror** (esquema propio en `src/lib/editor-extensions.ts`, plugins en `components/documents/editor-extras.ts` y `pagination.ts`).
- **Decisión: se mantiene.** El esquema es rico (tablas con bordes y color de celda, avisos, figuras con pie, tareas, organigrama, gráficos, índice, salto de página), la persistencia es JSON + HTML saneado por versión y hay exportación a PDF/Word/ZIP. No hay una limitación estructural que justifique migrar.
- **Limitaciones estructurales reales** (documentadas, no bloqueantes hoy):
  1. La paginación del editor es una *simulación* (widgets que reservan espacio) calculada con el ancho de 8,5 in; el PDF lo pagina Chromium. Coinciden en lo esencial, pero no son el mismo motor. En pantallas estrechas se desactiva (vista continua).
  2. Solo un tamaño de página (Carta vertical). Cambiar a A4 u horizontal exige tocar `PAGE_*` en `pagination.ts`, el CSS de la hoja y `@page`/`format` del PDF.
  3. Edición simultánea: no. Ver §6.

## 2. Qué es real y qué era solo botón

| Área | Antes de esta pasada | Ahora |
|---|---|---|
| Deshacer/rehacer, Ctrl+Z / Ctrl+Shift+Z, B/I/U | Real (historial de ProseMirror) | Igual |
| Atajos Ctrl+S, Ctrl+F, Ctrl+/ | Real | + Ctrl+K (enlace), Ctrl+P (imprimir) |
| Autoguardado | **Solo un borrador local, y solo se guardaba una vez** (el efecto no se reprogramaba con cada pulsación) | Autoguardado con debounce (2,5 s, máx. 12 s), copia local síncrona + borrador en servidor por usuario, estados *guardando / borrador guardado / no se pudo guardar + Reintentar*, reintento automático cada 8 s |
| Recuperación tras fallo | Banner con el borrador local | Banner con el borrador más reciente (servidor o navegador) |
| Enlaces | Botón que quitaba el enlace si ya había uno; sin editar | Ctrl+K y campo de enlace propio, edición/apertura/quitar sobre un enlace existente, normalización de URL |
| Barra contextual al seleccionar | Solo «Comentar» en modo lectura | Barra flotante (negrita, cursiva, subrayado, tachado, resaltar, enlace, comentar) |
| Imágenes | Subida por botón (con compresión) | + pegar y arrastrar imágenes al documento |
| Impresión | **No existía** | Imprimir (botón y Ctrl+P) = el mismo PDF paginado, en un marco oculto |
| Temas de documento | **No existían** (una sola paleta fija) | 4 temas (Corporativo, Propuesta, Evento, Interno) aplicados a editor, PDF y Word |
| Móvil | **Sin ningún `@media`**: la hoja de 8,5 in con márgenes de 0,85 in dejaba ~210 px de texto en un teléfono | Vista continua, márgenes compactos, barra de una fila desplazable, botones táctiles de 40 px, panel lateral como cajón, `100dvh` y `interactive-widget` |
| Rendimiento | `JSON.stringify` del documento entero en **cada pulsación** para detectar cambios | Se compara una vez; después basta con marcar cambio |
| Barra de herramientas | ~30 botones al mismo nivel, 2-3 filas | Frecuentes visibles; tachado, interlineado, sangrías, borrar formato, cita, avisos, salto de página, mover bloque, buscar y atajos en «Más» |
| Comprobación del documento | No existía | Campos sin rellenar, totales que no cuadran, tablas a medias, títulos vacíos (sin IA) |
| Campos dinámicos | `{{fecha}}`, `{{proveedor}}` | + `{{cliente.nombre}}`, `{{evento.fecha}}` (por entidad) |

Ya existían y siguen: buscar y reemplazar, índice lateral desde títulos reales, historial con comparar/restaurar, conflicto de guardado con aviso, presencia de otras personas editando, comentarios con cita, revisión/aprobación, compartir por enlace, tablas (filas, columnas, combinar celdas, colores, bordes, fórmulas), imágenes (ancho, alineación, pie), bloques (aviso, firma, fecha, salto de página, gráfico, organigrama, índice), menú `/`, mover bloques y arrastre.

## 3. Bloques

Arquitectura de bloques: cada bloque es un nodo TipTap + una entrada en `SLASH_ITEMS` (`editor-extras.ts`); la barra «Insertar» se genera desde esa misma lista, así que **añadir un bloque nuevo = un nodo y una entrada**. Faltan *columnas* reales: hoy se resuelve con una tabla sin bordes; un nodo `columns` propio es trabajo futuro.

## 4. Temas y plantillas

- `src/lib/doc-themes.ts` define la paleta por tema (`navy`, `accent`, `gray`, `tint`, `rule`, `onNavy`). El PDF usa variables CSS `--t-*`; el editor las aplica a la hoja; Word sustituye los colores del HTML antes de generar el .docx.
- El tema se guarda por documento (`documents.theme`, migración 0016) y se sugiere al crear (por nombre de plantilla/carpeta) con selector en «Nuevo documento».
- Las plantillas siguen definiendo estructura (membrete, cuadro de control, secciones); el tema define el color. La tipografía corporativa (Sora + Inter) es común a todos los temas.

## 5. Exportación e impresión

- **PDF** (Chromium + pdf-lib): tipografía de marca, márgenes, cabecera y pie por página con numeración, portada, tablas con **cabecera repetida** al continuar (comprobado con un PDF de 3 páginas en tema Evento), marca de agua «Borrador», imágenes incrustadas.
- **Word**: .docx editable con cabecera, pie y numeración; los gráficos se convierten en tablas y el organigrama en listas (límite de la librería).
- **Impresión**: ahora es el PDF sin portada; imprime la **última versión guardada** (no los cambios sin guardar).
- Pendiente: orientación horizontal / A4 (ver §1).

## 6. Colaboración: qué permite la arquitectura

- Hoy: un editor por documento con guardado por versiones, aviso de conflicto al guardar, presencia (quién está editando), comentarios, revisión y aprobación, compartir por enlace, permisos por rol/carpeta/documento.
- Edición simultánea: **no está justificada todavía**. Para hacerla haría falta Yjs (`@tiptap/extension-collaboration` ya está instalado como dependencia transitiva), un canal en tiempo real (Supabase Realtime) y persistir el estado Yjs. El borrador por usuario de esta pasada es compatible con ese futuro.
- Modo sugerencias / control de cambios: no existe; requeriría marcas de inserción/borrado y flujo de aceptar/rechazar.

## 7. IA dentro del editor — **no implementada, por decisión del proyecto**

El proyecto se definió **sin IA** («sin IA ni subida de archivos»). Las secciones 26-28 del encargo (asistente de redacción, estilos de escritura, inteligencia de documento con IA) contradicen esa decisión, así que no se han implementado. Lo que sí encaja sin IA y se ha hecho: *Comprobar documento* (§2), determinista y sin enviar contenido a terceros. Si se decide activar IA, el punto de entrada natural es la barra contextual (`SelectionBubble`) y el menú `/`; y habría que decidir proveedor, privacidad de los documentos y coste antes de escribir código.

## 8. Documentos dinámicos

Encaja: el motor de campos (`template-variables.ts`) ya sustituye `{{campo}}` al crear desde plantilla. Con `{{cliente.nombre}}` el nombre de campo ya lleva la entidad, de modo que una futura integración con el ERP solo tiene que proveer valores por clave. No se ha integrado nada con el ERP.

## 9. Rendimiento

- Corregido el `JSON.stringify` por pulsación; las miniaturas se cargan bajo demanda y en lote.
- Riesgo que queda: la paginación (`pagination.ts`) mide el DOM completo en una microtarea tras **cada** transacción, es decir, un coste lineal con el tamaño del documento por pulsación. Se mide en §12 con un documento de 20 páginas.

## 10. Accesibilidad

- Botones de la barra con `aria-label` y `title`; estado de guardado con `role="status"` y `aria-live`; diálogos con foco atrapado (Radix); barra contextual con `role="toolbar"`; objetivos táctiles de 40 px en dispositivos táctiles.
- Pendiente de auditar con lector de pantalla real y de revisar contraste de los tonos de tema sobre el color de acento.

## 11. Pasos que requiere el proyecto

1. Aplicar `supabase/migrations/0016_borradores_y_temas.sql` (autoguardado en servidor y temas). **Sin ella todo funciona**: el autoguardado queda solo en el navegador («Borrador en este navegador») y el tema no se puede cambiar (aviso claro).
2. Aplicar `0015_borrar_usuarios.sql` (borrado de usuarios en Supabase).
