import type { JSONContent } from '@tiptap/react'
import { themeForTemplate } from '#/lib/template-catalog'

/** Bloques que generan a la vez el JSON del editor (TipTap) y su HTML. */
type Block = { json: JSONContent; html: string }

const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const text = (value: string, bold = false): JSONContent => ({
  type: 'text',
  text: value,
  ...(bold ? { marks: [{ type: 'bold' }] } : {}),
})

const paragraphJson = (value: string): JSONContent =>
  value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' }

const h2 = (value: string): Block => ({
  json: { type: 'heading', attrs: { level: 2 }, content: [text(value)] },
  html: `<h2>${esc(value)}</h2>`,
})

const p = (value = ''): Block => ({
  json: paragraphJson(value),
  html: value ? `<p>${esc(value)}</p>` : '<p></p>',
})

/** Párrafo con etiqueta en negrita: "Fecha: ______". */
const field = (label: string, value = ''): Block => ({
  json: {
    type: 'paragraph',
    content: [text(`${label}: `, true), ...(value ? [text(value)] : [])],
  },
  html: `<p><strong>${esc(label)}: </strong>${esc(value)}</p>`,
})

const listItem = (value: string): JSONContent => ({
  type: 'listItem',
  content: [paragraphJson(value)],
})

const ul = (items: string[]): Block => ({
  json: { type: 'bulletList', content: items.map(listItem) },
  html: `<ul>${items.map((i) => `<li><p>${esc(i)}</p></li>`).join('')}</ul>`,
})

/** Regla numerada: si el ítem es "Titular: descripción", el titular va en negrita y la descripción en la línea siguiente. */
const ruleParts = (value: string): { title: string; rest: string } | null => {
  const match = /^([^:\n]{3,48}): (.+)$/.exec(value)
  return match ? { title: match[1], rest: match[2] } : null
}

const ruleItem = (value: string): JSONContent => {
  const parts = ruleParts(value)
  if (!parts) return listItem(value)
  return {
    type: 'listItem',
    content: [
      {
        type: 'paragraph',
        content: [
          text(parts.title, true),
          { type: 'hardBreak' },
          text(parts.rest),
        ],
      },
    ],
  }
}

const ruleHtml = (value: string): string => {
  const parts = ruleParts(value)
  return parts
    ? `<li><p><strong>${esc(parts.title)}</strong><br>${esc(parts.rest)}</p></li>`
    : `<li><p>${esc(value)}</p></li>`
}

const ol = (items: string[]): Block => ({
  json: {
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map(ruleItem),
  },
  html: `<ol>${items.map(ruleHtml).join('')}</ol>`,
})

const callout = (
  tone: 'info' | 'warn' | 'ok' | 'key' | 'summary' | 'kpi',
  value: string,
): Block => ({
  json: { type: 'callout', attrs: { tone }, content: [paragraphJson(value)] },
  html: `<div data-callout data-tone="${tone}"><p>${esc(value)}</p></div>`,
})

const cellAttrs = { colspan: 1, rowspan: 1, colwidth: null }

const table = (headers: string[], rows: string[][]): Block => ({
  json: {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: headers.map((h) => ({
          type: 'tableHeader',
          attrs: cellAttrs,
          content: [paragraphJson(h)],
        })),
      },
      ...rows.map((row) => ({
        type: 'tableRow',
        content: row.map((c) => ({
          type: 'tableCell',
          attrs: cellAttrs,
          content: [paragraphJson(c)],
        })),
      })),
    ],
  },
  html: `<table><tbody><tr>${headers
    .map((h) => `<th colspan="1" rowspan="1"><p>${esc(h)}</p></th>`)
    .join('')}</tr>${rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td colspan="1" rowspan="1">${c ? `<p>${esc(c)}</p>` : '<p></p>'}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`,
})

const blank = (n: number, cols: number) =>
  Array.from({ length: n }, () => Array<string>(cols).fill(''))

const boldP = (value: string): Block => ({
  json: { type: 'paragraph', content: [text(value, true)] },
  html: `<p><strong>${esc(value)}</strong></p>`,
})

/** Cuadro de control del documento. El logo y el título ya los pone el encabezado del tema, sin repetirlos aquí. */
const membrete = (code: string, area: string): Block[] => [
  table(
    ['Código', 'Versión', 'Fecha de emisión', 'Área'],
    [[code, '1.0', '{{fecha}}', area]],
  ),
]

const firmas = (roles: string[]): Block =>
  table(
    ['Rol', 'Nombre', 'Cargo', 'Firma', 'Fecha'],
    roles.map((r) => [r, '', '', '', '']),
  )

const CIERRE =
  'Documento controlado de Sport City Club. Las copias impresas se consideran de referencia; la versión vigente es la publicada en Sport City Tools.'

/**
 * Documento formal: cuadro de control + contenido. Según el tema (que sale del propósito de la plantilla)
 * se añade un resumen inicial (propuestas e informes) o la nota de control (documentos internos).
 */
const formal = (
  title: string,
  code: string,
  area: string,
  body: Block[],
): Block[] => {
  const theme = themeForTemplate(title)
  const hasSummary = body.some((b) => /<h2>[^<]*resumen/i.test(b.html))
  const lead =
    (theme === 'proposal' || theme === 'report') && !hasSummary
      ? [
          callout(
            'summary',
            theme === 'proposal'
              ? '[Resumen de la propuesta en dos o tres frases]'
              : '[Resumen: qué se concluye y qué se necesita]',
          ),
        ]
      : []
  const tail = theme === 'internal' ? [callout('summary', CIERRE)] : []
  return [...membrete(code, area), ...lead, ...body, ...tail]
}

const cambios = (): Block =>
  table(
    ['Versión', 'Fecha', 'Descripción del cambio', 'Autor'],
    [['1.0', '{{fecha}}', 'Emisión inicial', '{{usuario}}']],
  )

/**
 * Plantillas base que cambiaron de nombre: el instalador borra las copias con el nombre antiguo
 * (la nueva las sustituye) para que no aparezcan dos versiones de lo mismo.
 */
export const RETIRED_TEMPLATE_NAMES: readonly string[] = [
  'Cuadro comparativo de cotizaciones',
]

export type TemplateDefinition = {
  name: string
  description: string
  /** Carpeta raíz donde aparece la plantilla (null = en todas). */
  space: string | null
  blocks: Block[]
}

export function buildTemplateContent(definition: TemplateDefinition) {
  return {
    content: {
      type: 'doc',
      content: [...definition.blocks.map((b) => b.json), { type: 'paragraph' }],
    } as JSONContent,
    contentHtml: [...definition.blocks.map((b) => b.html), '<p></p>'].join(''),
  }
}

const MANUALES: TemplateDefinition[] = [
  {
    name: 'Manual de uso',
    description:
      'Manual formal de un sistema o proceso: roles, módulos, paso a paso y preguntas frecuentes.',
    space: 'Manuales',
    blocks: formal('Manual de uso', 'SC-MAN-001', 'Operaciones', [
      h2('1. Objetivo y alcance'),
      p(
        'Describa el propósito de este manual, a quién va dirigido y qué procesos abarca.',
      ),
      h2('2. Roles y permisos'),
      table(['Rol', 'Qué puede hacer'], blank(3, 2)),
      callout(
        'info',
        'Lo que cada persona ve depende de su rol. Si necesita otro acceso, solicítelo a su supervisor directo.',
      ),
      h2('3. Módulos'),
      table(['Módulo', 'Para qué sirve'], blank(3, 2)),
      h2('4. Paso a paso'),
      ol([
        '[Primer paso]',
        '[Segundo paso]',
        '[Tercer paso]',
        '[Confirmar y cerrar]',
      ]),
      callout(
        'warn',
        'Antes de comenzar: indique lo que debe tenerse a mano o verificarse.',
      ),
      h2('5. Preguntas frecuentes'),
      field('¿Qué hacer si [situación]?', '[Respuesta]'),
      field('¿Qué hacer si [otra situación]?', '[Respuesta]'),
      h2('6. Contacto de soporte'),
      p('[Nombre, cargo, teléfono y correo]'),
      h2('7. Control de cambios'),
      cambios(),
      h2('8. Aprobación'),
      firmas(['Elaboró', 'Revisó', 'Aprobó']),
    ]),
  },
  {
    name: 'Manual de operaciones de cancha',
    description:
      'Apertura, servicio, cierre y mantenimiento diario de las canchas.',
    space: 'Manuales',
    blocks: formal(
      'Manual de operaciones de cancha',
      'SC-OPE-001',
      'Operaciones',
      [
        h2('1. Objetivo'),
        p(
          'Establecer la forma estándar de operar las canchas de Sport City Club.',
        ),
        h2('2. Horarios y turnos'),
        table(['Turno', 'Horario', 'Responsable', 'Personal'], blank(3, 4)),
        h2('3. Apertura'),
        ol([
          'Verificar iluminación y estado de la superficie.',
          'Revisar limpieza de vestidores y baños.',
          'Confirmar reservas del día.',
          'Preparar material (balones, chalecos, botiquín).',
        ]),
        h2('4. Durante el servicio'),
        ul([
          'Atender a los clientes con cortesía y puntualidad.',
          'Supervisar el uso adecuado de las instalaciones.',
          'Registrar cualquier incidencia.',
        ]),
        h2('5. Cierre'),
        ol([
          'Apagar iluminación y equipos.',
          'Recoger el material y guardarlo.',
          'Revisar y asegurar accesos.',
          'Completar el registro de cierre.',
        ]),
        h2('6. Mantenimiento'),
        table(['Tarea', 'Frecuencia', 'Responsable'], blank(4, 3)),
        callout(
          'warn',
          'Toda condición insegura debe reportarse de inmediato y la cancha no debe habilitarse hasta corregirla.',
        ),
        h2('7. Aprobación'),
        firmas(['Elaboró', 'Revisó', 'Aprobó']),
      ],
    ),
  },
  {
    name: 'Manual de bienvenida al colaborador',
    description:
      'Presentación del club, estructura, normas básicas y primeros días de trabajo.',
    space: 'Manuales',
    blocks: formal(
      'Manual de bienvenida al colaborador',
      'SC-RHB-001',
      'Recursos Humanos',
      [
        h2('Bienvenida'),
        p(
          'Estimado(a) colaborador(a): le damos la bienvenida a Sport City Club. Este manual le ayudará a integrarse al equipo.',
        ),
        h2('Quiénes somos'),
        field('Misión'),
        field('Visión'),
        field('Valores'),
        h2('Nuestra estructura'),
        table(['Área', 'Responsable', 'Contacto'], blank(4, 3)),
        h2('Sus primeros días'),
        ol([
          'Presentación con su equipo y supervisor.',
          'Entrega de accesos y uniformes.',
          'Recorrido por las instalaciones.',
          'Inducción en seguridad y normas internas.',
        ]),
        h2('Normas básicas'),
        ul([
          'Puntualidad y asistencia.',
          'Trato respetuoso a clientes y compañeros.',
          'Cuidado de instalaciones y equipos.',
          'Confidencialidad de la información.',
        ]),
        h2('Contactos importantes'),
        table(['Tema', 'Persona', 'Teléfono / correo'], blank(3, 3)),
        h2('Constancia de recepción'),
        p('Declaro haber recibido y leído este manual.'),
        firmas(['Colaborador(a)', 'Recursos Humanos']),
      ],
    ),
  },
  {
    name: 'Guía rápida',
    description: 'Guía de una página para una tarea concreta.',
    space: 'Manuales',
    blocks: formal('Guía rápida', 'SC-GUI-001', 'Operaciones', [
      h2('¿Para qué sirve?'),
      p('[Explique en una frase qué se logra con esta guía.]'),
      h2('Pasos'),
      ol(['[Paso 1]', '[Paso 2]', '[Paso 3]']),
      h2('Consejos'),
      ul(['[Consejo útil]', '[Error frecuente que evitar]']),
      h2('¿Necesita ayuda?'),
      p('[Persona o canal de contacto]'),
    ]),
  },
  {
    name: 'Manual de atención al cliente',
    description:
      'Principios, protocolo de atención, situaciones frecuentes y escalamiento.',
    space: 'Manuales',
    blocks: formal(
      'Manual de atención al cliente',
      'SC-ATC-001',
      'Servicio al cliente',
      [
        h2('1. Principios de servicio'),
        ul([
          'Cortesía y respeto en todo momento.',
          'Rapidez y claridad en la información.',
          'Soluciones antes que excusas.',
        ]),
        h2('2. Protocolo de atención'),
        ol([
          'Saludar con amabilidad e identificarse.',
          'Escuchar la solicitud completa.',
          'Confirmar lo entendido.',
          'Resolver o derivar según corresponda.',
          'Despedirse y verificar satisfacción.',
        ]),
        h2('3. Situaciones frecuentes'),
        table(['Situación', 'Cómo actuar'], blank(4, 2)),
        h2('4. Frases recomendadas'),
        ul([
          '"Con gusto le ayudo."',
          '"Permítame verificar y le confirmo enseguida."',
        ]),
        h2('5. Escalamiento'),
        callout(
          'warn',
          'Toda queja formal debe registrarse y comunicarse al supervisor en un máximo de 24 horas.',
        ),
        firmas(['Elaboró', 'Aprobó']),
      ],
    ),
  },
]

const REGLAMENTOS: TemplateDefinition[] = [
  {
    name: 'Reglamento de evento',
    description:
      'Normativa completa de un evento: disposiciones, puntaje, disciplina, administración e inscripción.',
    space: 'Reglamentos de eventos',
    blocks: formal('Reglamento de evento', 'SC-REG-001', 'Eventos', [
      h2('1. Disposiciones generales'),
      p('Indique el carácter del evento y el reglamento base que se aplica.'),
      ol([
        'Cuidado de instalaciones: [regla].',
        'Responsabilidad: [regla].',
        'Comunicación oficial: [canal].',
        'Uniforme y equipamiento: [regla].',
        'Autoridad de interpretación: [quién].',
      ]),
      h2('2. Sistema de competencia'),
      table(
        ['Resultado', 'Puntos', 'Observación'],
        [
          ['Juego ganado', '3', ''],
          ['Juego empatado', '1', ''],
          ['Juego perdido', '0', ''],
        ],
      ),
      callout(
        'info',
        'Criterios de desempate (en orden): 1) puntos, 2) diferencia de goles, 3) goles a favor, 4) goles en contra.',
      ),
      h2('3. Disciplina y sanciones'),
      table(
        ['Falta', 'Sanción deportiva', 'Multa (C$)'],
        [
          ['Tarjeta amarilla', '—', ''],
          ['Tarjeta roja', '[partidos de suspensión]', ''],
          ['Agresión', 'Expulsión', ''],
        ],
      ),
      callout(
        'warn',
        'Ningún jugador o director técnico puede jugar con una multa pendiente.',
      ),
      h2('4. Normativa administrativa'),
      ol([
        'Inscripción y planilla: [regla].',
        'Pago: [regla].',
        'Calendario y reprogramaciones: [regla].',
        'Retiro de un equipo: [regla].',
      ]),
      h2('5. Inscripción'),
      ol([
        'Formulario web',
        'Contacto del club',
        'Planilla y pago',
        'Equipo habilitado',
      ]),
      h2('6. Aprobación'),
      firmas(['Elaboró', 'Comité organizador', 'Gerencia']),
    ]),
  },
  {
    name: 'Reglamento de liga deportiva',
    description:
      'Basado en la normativa de la Liga Sport City: conducta, formato, puntaje, disciplina y administración.',
    space: 'Reglamentos de eventos',
    blocks: formal('Reglamento de liga deportiva', 'SC-LIG-001', 'Ligas', [
      h2('Parte 1 · Disposiciones generales'),
      p(
        'La liga es de carácter recreativo. De manera general se rige por el reglamento FIFA de fútbol sala, con las consideraciones propias de Sport City Club que se detallan a continuación.',
      ),
      ol([
        'Cuido de instalaciones: Todo jugador que atente contra las instalaciones será expulsado de la liga; el equipo asume el costo del daño.',
        'Responsabilidad: Sport City Club no se hace responsable de lesiones o daños sufridos por un jugador durante el torneo.',
        'Alimentos y bebidas: Prohibido el ingreso de alimentos y bebidas ajenas al club durante el desarrollo del torneo.',
        'Comunicación oficial: El único medio oficial entre equipos y organización es el grupo de WhatsApp de la liga.',
        'Barridas: Prohibidas en disputa de balón; solo el portero puede hacerlo dentro de su área.',
        'Cambios: Ilimitados durante el partido; deben hacerse por la banda, en el centro de la cancha.',
        'Alcance del reglamento: Sport City Club puede modificarlo cuando lo estime conveniente, notificando previamente a los equipos.',
        'Autoridad de interpretación: Sport City Club es la única organización competente para interpretar este reglamento.',
      ]),
      h2('Uniforme y equipamiento'),
      table(
        ['Uniforme completo', 'Calzado', 'Prohibido'],
        [
          [
            'Camisa y short numerados del mismo color; calcetas altas del mismo color; portero con camisa diferenciada.',
            'Tacos de futsal o multitacos (se recomienda suela de goma).',
            'Uñas largas, cadenas, relojes y aretes durante el juego.',
          ],
        ],
      ),
      callout(
        'info',
        'Se permite jugar sin uniforme oficial hasta la segunda jornada, siempre que el equipo mantenga un color uniforme acordado entre todos sus jugadores.',
      ),
      h2('Parte 2 · Sistema de competencia'),
      table(
        ['División', 'Equipos', 'Formato'],
        [
          [
            'Star',
            '8',
            'Grupo único, todos contra todos, ida y vuelta. Corona el primer lugar de la tabla.',
          ],
          [
            'Gold',
            '16',
            '2 grupos de 8; los campeones de cada grupo se enfrentan en una final única.',
          ],
          ['Blue', '8', 'Grupo único, todos contra todos, ida y vuelta.'],
        ],
      ),
      table(
        ['Resultado', 'Puntos', 'Observación'],
        [
          ['Juego ganado', '3', '—'],
          ['Juego empatado', '1', '—'],
          ['Juego perdido', '0', '—'],
          [
            'Forfait (equipo ausente)',
            '3 – 0',
            'Se carga solo para estadística del equipo.',
          ],
        ],
      ),
      callout(
        'info',
        'Criterios de desempate, en orden: 1) puntos, 2) diferencia de goles, 3) goles a favor, 4) goles en contra. En la final, de existir empate: 5 penales directos y, de persistir, muerte súbita.',
      ),
      h2('Tiempos, clima y protestas'),
      table(
        ['Concepto', 'Regla'],
        [
          ['Duración', '2 tiempos de 20 minutos, con 5 de descanso'],
          ['Tolerancia', '10 minutos; después, pérdida por default (0–3)'],
          [
            'Suspensión por clima',
            'Solo con tormenta eléctrica o cancha impracticable, según el árbitro y el comité',
          ],
        ],
      ),
      ol([
        'Notificar al árbitro: En el momento, firmada por el capitán o director técnico.',
        'Protesta formal: Dentro de 24 horas, en el formato oficial y con soportes.',
        'El comité resuelve: En un plazo de 36 a 72 horas, ampliable 48 horas más.',
        'Resolución final: De cumplimiento estricto.',
      ]),
      h2('Parte 3 · Disciplina y sanciones'),
      table(
        ['Falta', 'Sanción deportiva', 'Multa (C$)'],
        [
          ['Tarjeta amarilla', 'Doble amarilla = expulsión y 1 partido', '100'],
          ['Tarjeta roja', 'Mínimo 2 partidos, según gravedad', '200'],
          ['Palabras soeces al árbitro', 'Roja directa + 2 partidos', ''],
          ['Agresión física', 'Expulsión del partido y de la liga', ''],
          ['Riña entre equipos', 'Expulsión de la liga para ambos equipos', ''],
        ],
      ),
      callout(
        'warn',
        'Ningún jugador o director técnico puede jugar con un pago de tarjeta pendiente.',
      ),
      h2('Parte 4 · Normativa administrativa'),
      ol([
        'Hoja de inscripción: Cada equipo presenta su planilla con un máximo de 15 jugadores y cédula de cada uno; no puede modificarse iniciada la temporada.',
        'Verificación en cancha: Cada jugador debe presentar su cédula o carnet en todo partido.',
        'Director técnico o capitán: Única persona autorizada para protestar o comunicarse con árbitro y comité.',
        'Pago por adelantado: La inscripción se paga completa antes del arranque; no se reserva cupo sin el pago registrado.',
        'Calendario fijo: Ningún equipo puede modificarlo; solo Sport City Club puede reprogramar por fuerza mayor.',
        'Reposición de partido: Tiene un costo de US$80, sujeto a autorización con 48 horas de anticipación.',
        'Retiro de un equipo: Una vez iniciada la temporada, el pago no es reembolsable y los partidos pendientes se dan por perdidos (0–3).',
      ]),
      h2('Parte 5 · Inscripción'),
      ol([
        'Formulario web: Nombre del equipo, contacto, teléfono y correo.',
        'Contacto del club: Recepción confirma cupo y división disponible.',
        'Planilla y pago: Se completa en el club con cédulas y pago total.',
        'Equipo habilitado: Aparece en el fixture de su división.',
      ]),
      h2('Aprobación'),
      firmas(['Comité organizador', 'Gerencia']),
    ]),
  },
  {
    name: 'Informativo de liga',
    description:
      'Hoja informativa de una página: divisiones, cifras clave, inversión y horarios.',
    space: 'Reglamentos de eventos',
    blocks: formal('Informativo de liga', 'SC-INL-001', 'Ligas', [
      h2('Liga abierta · Fútbol 5 · Managua'),
      p('[Lema de la temporada. Ejemplo: Sube de división. Hazte leyenda.]'),
      table(
        ['División', 'Equipos', 'Detalle'],
        [
          ['Star', '8', ''],
          ['Gold', '16', '2 grupos'],
          ['Blue', '8', 'Entrada'],
        ],
      ),
      h2('Cifras clave'),
      table(
        ['Equipos', 'Jornadas', 'Partidos', 'Meses'],
        [['32', '14', '200+', '3']],
      ),
      h2('Inversión y horario'),
      table(
        ['Inversión por jugador', 'Horario de juego'],
        [['C$ 1,680', 'Lun–Jue · tarde. 1 partido por semana.']],
      ),
      h2('Cómo inscribirse'),
      ol([
        'Formulario web: [dirección]',
        'Contacto del club: [teléfono]',
        'Planilla y pago: en recepción',
      ]),
    ]),
  },
  {
    name: 'Bases y convocatoria de torneo',
    description:
      'Convocatoria pública: fechas clave, categorías, requisitos, costos y premios.',
    space: 'Reglamentos de eventos',
    blocks: formal('Bases y convocatoria de torneo', 'SC-BAS-001', 'Eventos', [
      h2('Convocatoria'),
      p(
        'Sport City Club convoca a los equipos interesados a participar en el torneo [nombre], que se realizará del [fecha] al [fecha].',
      ),
      h2('Fechas clave'),
      table(
        ['Hito', 'Fecha'],
        [
          ['Apertura de inscripciones', ''],
          ['Cierre de inscripciones', ''],
          ['Reunión técnica', ''],
          ['Inicio del torneo', ''],
          ['Final', ''],
        ],
      ),
      h2('Categorías'),
      table(['Categoría', 'Edades', 'Cupos'], blank(3, 3)),
      h2('Requisitos de inscripción'),
      ul([
        'Planilla con documento de identidad de cada jugador.',
        'Pago de inscripción.',
        'Aceptación del reglamento.',
      ]),
      h2('Costos'),
      table(['Concepto', 'Monto (C$)'], blank(3, 2)),
      h2('Premios'),
      table(['Puesto', 'Premio'], blank(3, 2)),
      h2('Contacto e informes'),
      p('[Teléfono · correo · sitio web]'),
    ]),
  },
  {
    name: 'Reglamento de uso de instalaciones',
    description:
      'Normas de uso, horarios, prohibiciones y responsabilidades de los usuarios.',
    space: 'Reglamentos de eventos',
    blocks: formal(
      'Reglamento de uso de instalaciones',
      'SC-INS-001',
      'Operaciones',
      [
        h2('1. Objeto'),
        p(
          'Regular el uso de las instalaciones de Sport City Club por parte de clientes, equipos y visitantes.',
        ),
        h2('2. Horarios'),
        table(['Instalación', 'Días', 'Horario'], blank(3, 3)),
        h2('3. Normas de uso'),
        ol([
          'Respetar el horario reservado.',
          'Utilizar calzado apropiado para la superficie.',
          'Cuidar mobiliario, vallas e iluminación.',
          'Depositar los residuos en los lugares indicados.',
        ]),
        h2('4. Prohibiciones'),
        ul([
          'Ingreso de alimentos o bebidas ajenas al club.',
          'Consumo de bebidas alcohólicas o sustancias prohibidas.',
          'Conductas violentas o irrespetuosas.',
        ]),
        h2('5. Responsabilidad'),
        p(
          'Sport City Club no se hace responsable por lesiones, pérdidas o daños a pertenencias durante el uso de las instalaciones.',
        ),
        h2('6. Sanciones'),
        p(
          'El incumplimiento puede implicar amonestación, cobro de daños o suspensión del acceso.',
        ),
        h2('7. Aceptación'),
        firmas(['Usuario / representante']),
      ],
    ),
  },
  {
    name: 'Código de conducta',
    description:
      'Compromisos de jugadores, cuerpo técnico y aficionados, con firma de aceptación.',
    space: 'Reglamentos de eventos',
    blocks: formal('Código de conducta', 'SC-COD-001', 'Eventos', [
      h2('Compromisos de los jugadores'),
      ul([
        'Respetar a árbitros, rivales, compañeros y organizadores.',
        'Competir con espíritu deportivo.',
        'No agredir física ni verbalmente a nadie.',
      ]),
      h2('Compromisos del cuerpo técnico'),
      ul([
        'Responder por la conducta de su equipo.',
        'Presentar reclamos únicamente por las vías oficiales.',
      ]),
      h2('Compromisos de los aficionados'),
      ul([
        'Alentar sin ofender.',
        'Respetar las decisiones arbitrales y las instalaciones.',
      ]),
      h2('Sanciones'),
      callout(
        'warn',
        'Las faltas graves pueden conllevar expulsión del evento sin derecho a reembolso.',
      ),
      h2('Aceptación'),
      firmas(['Capitán', 'Director técnico']),
    ]),
  },
  {
    name: 'Formato de protesta oficial',
    description:
      'Protesta formal de un equipo con hechos, pruebas y resolución del comité.',
    space: 'Reglamentos de eventos',
    blocks: formal('Formato de protesta oficial', 'SC-PRO-001', 'Eventos', [
      h2('Datos generales'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Equipo que protesta', ''],
          ['Equipo contrario', ''],
          ['Fecha y hora del partido', ''],
          ['División / categoría', ''],
          ['Árbitro', ''],
        ],
      ),
      h2('Motivo de la protesta'),
      p('[Artículo del reglamento que se considera infringido]'),
      h2('Relato de los hechos'),
      p('[Describa lo ocurrido con claridad y en orden cronológico.]'),
      h2('Pruebas presentadas'),
      ul(['[Foto, video, testigo, planilla…]']),
      callout(
        'info',
        'La protesta debe presentarse dentro de las 24 horas siguientes al partido, firmada por el capitán o director técnico.',
      ),
      h2('Resolución del comité'),
      table(['Decisión', 'Fundamento', 'Fecha'], blank(1, 3)),
      firmas(['Capitán / DT', 'Presidente del comité']),
    ]),
  },
  {
    name: 'Planilla de inscripción de equipo',
    description: 'Datos del equipo, listado de jugadores, declaración y pago.',
    space: 'Reglamentos de eventos',
    blocks: formal('Planilla de inscripción de equipo', 'SC-PLA-001', 'Ligas', [
      h2('Datos del equipo'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Nombre del equipo', ''],
          ['División / categoría', ''],
          ['Color de uniforme', ''],
          ['Capitán / DT', ''],
          ['Teléfono y correo', ''],
        ],
      ),
      h2('Jugadores'),
      table(
        ['N.º', 'Nombre completo', 'Cédula', 'Teléfono', 'Firma'],
        blank(15, 5),
      ),
      callout(
        'warn',
        'La planilla no puede modificarse una vez iniciada la temporada. Cada jugador debe presentar su documento en cada partido.',
      ),
      h2('Pago'),
      table(
        [
          'Jugadores inscritos',
          'Precio por jugador (C$)',
          'Total (C$)',
          'Recibo N.º',
        ],
        blank(1, 4),
      ),
      h2('Declaración'),
      p('Declaramos conocer y aceptar el reglamento del evento.'),
      firmas(['Capitán / DT', 'Recepción del club']),
    ]),
  },
  {
    name: 'Acta de partido',
    description:
      'Hoja de arbitraje: alineaciones, goles, tarjetas y observaciones.',
    space: 'Reglamentos de eventos',
    blocks: formal('Acta de partido', 'SC-ATP-001', 'Ligas', [
      h2('Datos del partido'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha y hora', ''],
          ['Cancha', ''],
          ['Equipo local', ''],
          ['Equipo visitante', ''],
          ['Resultado final', ''],
          ['Árbitro', ''],
        ],
      ),
      h2('Alineaciones'),
      table(['N.º', 'Jugador local', 'N.º', 'Jugador visitante'], blank(8, 4)),
      h2('Goles'),
      table(['Minuto', 'Equipo', 'Jugador (N.º)'], blank(4, 3)),
      h2('Tarjetas'),
      table(
        ['Minuto', 'Equipo', 'Jugador (N.º)', 'Amarilla / Roja', 'Motivo'],
        blank(3, 5),
      ),
      h2('Observaciones'),
      p(''),
      firmas(['Árbitro', 'Capitán local', 'Capitán visitante']),
    ]),
  },
]

const ALCANCES: TemplateDefinition[] = [
  {
    name: 'Alcance de proyecto',
    description:
      'Objetivo, alcance, entregables, cronograma, riesgos y aprobación.',
    space: 'Alcances',
    blocks: formal('Alcance de proyecto', 'SC-ALC-001', 'Proyectos', [
      h2('1. Objetivo'),
      p('Qué se quiere lograr y por qué es importante para Sport City Club.'),
      h2('2. Incluido en el alcance'),
      ul(['[Actividad o entregable]', '[Actividad o entregable]']),
      h2('3. Fuera del alcance'),
      ul(['[Lo que NO se hará]']),
      h2('4. Entregables'),
      table(['Entregable', 'Descripción', 'Responsable', 'Fecha'], blank(3, 4)),
      h2('5. Cronograma'),
      table(['Fase', 'Inicio', 'Fin', 'Hito'], blank(3, 4)),
      h2('6. Supuestos y riesgos'),
      ul(['[Supuesto o riesgo y su mitigación]']),
      callout(
        'info',
        'Cualquier cambio de alcance debe aprobarse por escrito antes de ejecutarse.',
      ),
      h2('7. Aprobación'),
      firmas(['Solicitante', 'Responsable del proyecto', 'Gerencia']),
    ]),
  },
  {
    name: 'Propuesta comercial',
    description:
      'Propuesta formal a clientes: necesidad, servicios, inversión y condiciones.',
    space: 'Alcances',
    blocks: formal('Propuesta comercial', 'SC-PRP-001', 'Comercial', [
      h2('1. Presentación'),
      p('Sport City Club presenta a [cliente] la siguiente propuesta.'),
      h2('2. Necesidad identificada'),
      p('[Qué necesita el cliente]'),
      h2('3. Nuestra propuesta'),
      ul(['[Servicio incluido]', '[Servicio incluido]', '[Servicio incluido]']),
      h2('4. Inversión'),
      table(
        ['Concepto', 'Cantidad', 'Precio unitario (C$)', 'Total (C$)'],
        [...blank(3, 4), ['Total', '', '', '']],
      ),
      h2('5. Condiciones'),
      ul([
        'Forma de pago: [ ]',
        'Vigencia de la propuesta: [ ] días',
        'Fecha de inicio: [ ]',
      ]),
      callout(
        'ok',
        'Quedamos atentos para resolver cualquier duda y ajustar la propuesta a sus necesidades.',
      ),
      h2('6. Contacto'),
      p('[Nombre · cargo · teléfono · correo]'),
    ]),
  },
  {
    name: 'Propuesta de patrocinio',
    description:
      'Paquetes de patrocinio con beneficios, inversión y retorno para la marca.',
    space: 'Alcances',
    blocks: formal('Propuesta de patrocinio', 'SC-PAT-001', 'Comercial', [
      h2('1. Sport City Club'),
      p('Presentación breve del club, su trayectoria y su comunidad.'),
      h2('2. La oportunidad'),
      p('[Evento o temporada a patrocinar, fechas y alcance]'),
      h2('3. Audiencia'),
      table(
        ['Indicador', 'Cifra'],
        [
          ['Asistentes estimados', ''],
          ['Equipos participantes', ''],
          ['Seguidores en redes', ''],
          ['Clientes mensuales', ''],
        ],
      ),
      h2('4. Paquetes de patrocinio'),
      table(['Paquete', 'Beneficios', 'Inversión (US$)'], blank(3, 3)),
      h2('5. Retorno para la marca'),
      ul([
        'Presencia de marca en instalaciones y comunicaciones.',
        'Activaciones en el evento.',
        'Informe de resultados al cierre.',
      ]),
      h2('6. Términos'),
      p('[Vigencia, forma de pago y exclusividad]'),
      h2('7. Contacto'),
      p('[Nombre · cargo · teléfono · correo]'),
    ]),
  },
  {
    name: 'Convenio de colaboración',
    description:
      'Convenio entre Sport City Club y otra entidad, con obligaciones, vigencia y firmas.',
    space: 'Alcances',
    blocks: formal('Convenio de colaboración', 'SC-CON-001', 'Legal', [
      h2('Partes'),
      p(
        'Por una parte, SPORT CITY CLUB, representado por [nombre y cargo]; y por otra, [entidad], representada por [nombre y cargo].',
      ),
      h2('Cláusula 1. Objeto'),
      p('[Descripción del objeto del convenio]'),
      h2('Cláusula 2. Obligaciones de las partes'),
      table(['Sport City Club', '[Otra parte]'], blank(3, 2)),
      h2('Cláusula 3. Vigencia'),
      p(
        'El presente convenio tendrá vigencia desde el [fecha] hasta el [fecha].',
      ),
      h2('Cláusula 4. Confidencialidad'),
      p(
        'Las partes se obligan a mantener reserva sobre la información a la que accedan con motivo de este convenio.',
      ),
      h2('Cláusula 5. Terminación'),
      p(
        'Cualquiera de las partes podrá darlo por terminado con [ ] días de aviso previo por escrito.',
      ),
      h2('Cláusula 6. Legislación aplicable'),
      p('Este convenio se rige por las leyes de la República de Nicaragua.'),
      h2('Firmas'),
      table(
        ['Parte', 'Nombre', 'Cargo', 'Firma', 'Fecha'],
        [
          ['Sport City Club', '', '', '', ''],
          ['[Otra parte]', '', '', '', ''],
        ],
      ),
    ]),
  },
  {
    name: 'Términos de referencia',
    description:
      'TDR para contratar un servicio o consultoría: alcance, productos, perfil y evaluación.',
    space: 'Alcances',
    blocks: formal('Términos de referencia', 'SC-TDR-001', 'Proyectos', [
      h2('1. Antecedentes'),
      p(''),
      h2('2. Objetivo'),
      p(''),
      h2('3. Alcance y actividades'),
      ul(['[Actividad]', '[Actividad]']),
      h2('4. Productos esperados'),
      table(['Producto', 'Descripción', 'Fecha de entrega'], blank(3, 3)),
      h2('5. Perfil requerido'),
      ul(['[Experiencia]', '[Formación o capacidades]']),
      h2('6. Cronograma y presupuesto'),
      table(
        ['Concepto', 'Detalle'],
        [
          ['Duración', ''],
          ['Presupuesto máximo (C$)', ''],
          ['Forma de pago', ''],
        ],
      ),
      h2('7. Criterios de evaluación'),
      table(['Criterio', 'Ponderación'], blank(4, 2)),
      h2('8. Aprobación'),
      firmas(['Elaboró', 'Aprobó']),
    ]),
  },
  {
    name: 'Plan de proyecto',
    description:
      'Objetivos, equipo, cronograma, riesgos, comunicación y seguimiento.',
    space: 'Alcances',
    blocks: formal('Plan de proyecto', 'SC-PLN-001', 'Proyectos', [
      h2('1. Resumen'),
      p(''),
      h2('2. Objetivos'),
      ul(['[Objetivo específico, medible y con fecha]']),
      h2('3. Equipo'),
      table(['Nombre', 'Rol', 'Responsabilidades'], blank(4, 3)),
      h2('4. Cronograma'),
      table(
        ['Actividad', 'Responsable', 'Inicio', 'Fin', 'Estado'],
        blank(5, 5),
      ),
      h2('5. Riesgos'),
      table(['Riesgo', 'Probabilidad', 'Impacto', 'Mitigación'], blank(3, 4)),
      h2('6. Comunicación y seguimiento'),
      table(['Qué', 'Con quién', 'Frecuencia'], blank(3, 3)),
      firmas(['Responsable', 'Gerencia']),
    ]),
  },
  {
    name: 'Cotización a cliente',
    description:
      'Cotización formal con datos del cliente, detalle, condiciones y vigencia.',
    space: 'Alcances',
    blocks: formal('Cotización', 'SC-COT-001', 'Comercial', [
      h2('Datos del cliente'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Cliente', ''],
          ['RUC / cédula', ''],
          ['Contacto', ''],
          ['Fecha', ''],
          ['Cotización N.º', ''],
        ],
      ),
      h2('Detalle'),
      table(
        ['Descripción', 'Cantidad', 'Precio unitario (C$)', 'Total (C$)'],
        [
          ...blank(4, 4),
          ['Subtotal', '', '', ''],
          ['IVA', '', '', ''],
          ['Total', '', '', ''],
        ],
      ),
      h2('Condiciones'),
      ul([
        'Vigencia: [ ] días',
        'Forma de pago: [ ]',
        'Tiempo de entrega: [ ]',
      ]),
      firmas(['Emite']),
    ]),
  },
]

const PRESUPUESTOS: TemplateDefinition[] = [
  {
    name: 'Presupuesto de evento',
    description:
      'Ingresos, gastos por proveedor, resultado y aprobación de un evento.',
    space: 'Presupuestos',
    blocks: formal('Presupuesto de evento', 'SC-PRE-001', 'Finanzas', [
      h2('1. Resumen'),
      field('Evento'),
      field('Fecha'),
      field('Responsable'),
      h2('2. Ingresos previstos'),
      table(['Concepto', 'Cantidad', 'Precio (C$)', 'Total (C$)'], blank(3, 4)),
      h2('3. Gastos previstos'),
      table(['Concepto', 'Proveedor', 'Monto (C$)', 'Estado'], blank(4, 4)),
      h2('4. Resultado'),
      table(
        ['Ingresos totales (C$)', 'Gastos totales (C$)', 'Margen (C$)'],
        [['', '', '']],
      ),
      callout(
        'warn',
        'Todo gasto fuera de este presupuesto requiere aprobación previa.',
      ),
      h2('5. Aprobación'),
      firmas(['Elaboró', 'Finanzas', 'Gerencia']),
    ]),
  },
  {
    name: 'Presupuesto anual por área',
    description:
      'Presupuesto trimestral por rubro, con inversiones y justificación.',
    space: 'Presupuestos',
    blocks: formal('Presupuesto anual por área', 'SC-PAN-001', 'Finanzas', [
      h2('1. Datos generales'),
      field('Área'),
      field('Año fiscal'),
      field('Responsable'),
      h2('2. Supuestos'),
      ul(['[Supuesto de ingresos]', '[Supuesto de costos]']),
      h2('3. Presupuesto por rubro (C$)'),
      table(
        ['Rubro', 'Ene–Mar', 'Abr–Jun', 'Jul–Sep', 'Oct–Dic', 'Total'],
        [...blank(5, 6), ['Total', '', '', '', '', '']],
      ),
      h2('4. Inversiones planificadas'),
      table(['Inversión', 'Justificación', 'Monto (C$)', 'Mes'], blank(3, 4)),
      h2('5. Aprobación'),
      firmas(['Responsable del área', 'Finanzas', 'Gerencia']),
    ]),
  },
  {
    name: 'Requisición de compra',
    description:
      'Solicitud interna de compra con artículos, justificación y autorizaciones.',
    space: 'Presupuestos',
    blocks: formal('Requisición de compra', 'SC-REQ-001', 'Compras', [
      h2('Datos del solicitante'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Solicitante', ''],
          ['Área', ''],
          ['Fecha', ''],
          ['Requisición N.º', ''],
        ],
      ),
      h2('Artículos o servicios'),
      table(
        ['Descripción', 'Cantidad', 'Costo estimado (C$)', 'Urgencia'],
        blank(5, 4),
      ),
      h2('Justificación'),
      p(''),
      h2('Partida presupuestaria'),
      p('[Presupuesto contra el que se cargará]'),
      h2('Autorizaciones'),
      firmas(['Solicitante', 'Jefe de área', 'Compras', 'Gerencia']),
    ]),
  },
  {
    name: 'Orden de compra',
    description:
      'Orden formal a un proveedor con artículos, condiciones de entrega y pago.',
    space: 'Presupuestos',
    blocks: formal('Orden de compra', 'SC-OC-001', 'Compras', [
      h2('Proveedor'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Razón social', ''],
          ['RUC', ''],
          ['Contacto', ''],
          ['Orden N.º', ''],
          ['Fecha', ''],
        ],
      ),
      h2('Detalle de la orden'),
      table(
        ['Descripción', 'Cantidad', 'Precio unitario (C$)', 'Total (C$)'],
        [...blank(4, 4), ['Total', '', '', '']],
      ),
      h2('Condiciones'),
      table(
        ['Concepto', 'Detalle'],
        [
          ['Lugar y fecha de entrega', ''],
          ['Forma de pago', ''],
          ['Garantía', ''],
        ],
      ),
      h2('Autorización'),
      firmas(['Compras', 'Gerencia']),
    ]),
  },
  {
    name: 'Control de gastos mensual',
    description:
      'Registro de gastos del mes por categoría, con resumen y observaciones.',
    space: 'Presupuestos',
    blocks: formal('Control de gastos mensual', 'SC-GAS-001', 'Finanzas', [
      field('Mes'),
      field('Responsable'),
      h2('Gastos'),
      table(
        ['Fecha', 'Concepto', 'Proveedor', 'Categoría', 'Monto (C$)'],
        blank(10, 5),
      ),
      h2('Resumen por categoría'),
      table(
        ['Categoría', 'Presupuestado (C$)', 'Real (C$)', 'Diferencia (C$)'],
        blank(4, 4),
      ),
      h2('Observaciones'),
      p(''),
      firmas(['Elaboró', 'Finanzas']),
    ]),
  },
]

const PROVEEDORES: TemplateDefinition[] = [
  {
    name: 'Comparativo de proveedores',
    description:
      'Compara proveedores de un producto o servicio y documenta la recomendación.',
    space: 'Proveedores',
    blocks: formal('Comparativo de proveedores', 'SC-CMP-001', 'Compras', [
      field('Producto o servicio'),
      field('Fecha'),
      field('Responsable'),
      h2('1. Comparativo'),
      table(
        [
          'Proveedor',
          'Contacto',
          'Precio (C$)',
          'Entrega',
          'Garantía',
          'Puntaje',
        ],
        blank(4, 6),
      ),
      h2('2. Análisis'),
      p('[Ventajas y desventajas de cada opción]'),
      h2('3. Recomendación'),
      callout('ok', '[Proveedor recomendado y motivo de la elección]'),
      h2('4. Aprobación'),
      firmas(['Elaboró', 'Compras', 'Gerencia']),
    ]),
  },
  {
    name: 'Ficha de proveedor',
    description:
      'Datos fiscales, contacto, productos, condiciones comerciales y documentos.',
    space: 'Proveedores',
    blocks: formal('Ficha de proveedor', 'SC-FPV-001', 'Compras', [
      h2('1. Datos generales'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Razón social', ''],
          ['Nombre comercial', ''],
          ['RUC', ''],
          ['Dirección', ''],
          ['Sitio web', ''],
        ],
      ),
      h2('2. Contacto'),
      table(['Nombre', 'Cargo', 'Teléfono', 'Correo'], blank(2, 4)),
      h2('3. Productos o servicios'),
      table(
        ['Producto / servicio', 'Descripción', 'Precio de referencia (C$)'],
        blank(4, 3),
      ),
      h2('4. Condiciones comerciales'),
      table(
        ['Concepto', 'Detalle'],
        [
          ['Forma de pago', ''],
          ['Crédito (días)', ''],
          ['Tiempo de entrega', ''],
          ['Garantía', ''],
        ],
      ),
      h2('5. Documentos recibidos'),
      ul([
        'RUC',
        'Cédula del representante',
        'Constancia de retenciones',
        'Cotización vigente',
      ]),
      h2('6. Observaciones'),
      p(''),
    ]),
  },
  {
    name: 'Evaluación de proveedor',
    description:
      'Evaluación periódica con criterios ponderados y decisión final.',
    space: 'Proveedores',
    blocks: formal('Evaluación de proveedor', 'SC-EVP-001', 'Compras', [
      field('Proveedor', '{{proveedor}}'),
      field('Periodo evaluado'),
      field('Evaluador'),
      h2('Criterios'),
      table(
        ['Criterio', 'Peso (%)', 'Calificación (1–5)', 'Comentarios'],
        [
          ['Calidad', '30', '', ''],
          ['Precio', '25', '', ''],
          ['Cumplimiento de entrega', '25', '', ''],
          ['Servicio y atención', '20', '', ''],
        ],
      ),
      h2('Resultado'),
      table(['Puntaje total', 'Clasificación'], [['', '']]),
      h2('Decisión'),
      callout(
        'info',
        'Excelente (≥ 4.5): preferente · Bueno (3.5–4.4): aprobado · Regular (< 3.5): plan de mejora o reemplazo.',
      ),
      firmas(['Evaluador', 'Compras']),
    ]),
  },
  {
    name: 'Solicitud de cotización',
    description:
      'Solicitud formal de cotización a varios proveedores, con requerimientos y criterios.',
    space: 'Proveedores',
    blocks: formal('Solicitud de cotización', 'SC-RFQ-001', 'Compras', [
      h2('1. Datos'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Solicitante', ''],
          ['Fecha', ''],
          ['Fecha límite de respuesta', ''],
          ['Contacto para consultas', ''],
        ],
      ),
      h2('2. Requerimientos'),
      table(['Descripción', 'Cantidad', 'Especificaciones'], blank(4, 3)),
      h2('3. Condiciones solicitadas'),
      ul([
        'Precio unitario y total, con impuestos.',
        'Tiempo y lugar de entrega.',
        'Garantía y forma de pago.',
        'Vigencia de la oferta.',
      ]),
      h2('4. Criterios de selección'),
      p(
        'Precio, calidad, tiempo de entrega, garantía y experiencia del proveedor.',
      ),
    ]),
  },
  {
    name: 'Contrato de prestación de servicios',
    description:
      'Modelo formal de contrato con cláusulas de objeto, plazo, pago y terminación.',
    space: 'Proveedores',
    blocks: formal(
      'Contrato de prestación de servicios',
      'SC-CTR-001',
      'Legal',
      [
        h2('Comparecientes'),
        p(
          'Por una parte, SPORT CITY CLUB, en adelante EL CONTRATANTE, representado por [nombre y cargo]; y por otra, {{proveedor}}, RUC [ ], en adelante EL PROVEEDOR.',
        ),
        h2('Cláusula 1. Objeto'),
        p(
          'EL PROVEEDOR se obliga a prestar los siguientes servicios: [descripción].',
        ),
        h2('Cláusula 2. Plazo'),
        p('El contrato tendrá vigencia desde el [fecha] hasta el [fecha].'),
        h2('Cláusula 3. Precio y forma de pago'),
        p(
          'El precio total es de C$ [monto], pagadero [forma de pago] contra presentación de factura.',
        ),
        h2('Cláusula 4. Obligaciones del proveedor'),
        ul([
          'Ejecutar los servicios con la calidad y en los plazos pactados.',
          'Responder por daños causados por su personal.',
        ]),
        h2('Cláusula 5. Confidencialidad'),
        p(
          'EL PROVEEDOR guardará reserva de toda información a la que acceda por razón del contrato.',
        ),
        h2('Cláusula 6. Terminación'),
        p(
          'Cualquiera de las partes podrá terminar el contrato con [ ] días de aviso previo por escrito.',
        ),
        h2('Cláusula 7. Legislación aplicable'),
        p('Este contrato se rige por las leyes de la República de Nicaragua.'),
        h2('Firmas'),
        table(
          ['Parte', 'Nombre', 'Cargo', 'Firma', 'Fecha'],
          [
            ['EL CONTRATANTE', '', '', '', ''],
            ['EL PROVEEDOR', '', '', '', ''],
          ],
        ),
      ],
    ),
  },
  {
    name: 'Acta de recepción de bienes o servicios',
    description:
      'Constancia de recepción con estado, observaciones y conformidad.',
    space: 'Proveedores',
    blocks: formal(
      'Acta de recepción de bienes o servicios',
      'SC-REC-001',
      'Compras',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Proveedor', '{{proveedor}}'],
            ['Orden de compra N.º', ''],
            ['Fecha de recepción', ''],
            ['Lugar', ''],
          ],
        ),
        h2('Detalle recibido'),
        table(
          ['Descripción', 'Cantidad', 'Estado', 'Observaciones'],
          blank(5, 4),
        ),
        h2('Conformidad'),
        callout(
          'ok',
          'Se recibe a entera satisfacción / con las observaciones indicadas (tache lo que no aplique).',
        ),
        firmas(['Recibe', 'Entrega (proveedor)']),
      ],
    ),
  },
  {
    name: 'Solicitud de pago',
    description: 'Datos del pago, justificación y firmas de aprobación.',
    space: 'Proveedores',
    blocks: formal('Solicitud de pago', 'SC-PAG-001', 'Finanzas', [
      h2('1. Datos del pago'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Proveedor', '{{proveedor}}'],
          ['Concepto', ''],
          ['Factura / referencia', ''],
          ['Monto (C$)', ''],
          ['Fecha de vencimiento', ''],
          ['Forma de pago', ''],
        ],
      ),
      h2('2. Justificación'),
      p('Explique brevemente por qué se solicita este pago.'),
      callout(
        'info',
        'Adjunte o referencie la factura o cotización que respalda el pago.',
      ),
      h2('3. Aprobaciones'),
      firmas(['Solicitante', 'Gerencia', 'Finanzas']),
    ]),
  },
  {
    name: 'Informe de evento',
    description:
      'Resultados, costos reales frente al presupuesto, incidencias y lecciones aprendidas.',
    space: 'Proveedores',
    blocks: formal('Informe de evento', 'SC-INF-001', 'Eventos', [
      h2('1. Resumen ejecutivo'),
      p('Cómo fue el evento en pocas líneas.'),
      table(
        ['Dato', 'Detalle'],
        [
          ['Evento', ''],
          ['Fecha', ''],
          ['Asistencia', ''],
          ['Responsable', ''],
        ],
      ),
      h2('2. Costos reales frente al presupuesto'),
      table(
        ['Concepto', 'Presupuestado (C$)', 'Real (C$)', 'Diferencia (C$)'],
        blank(4, 4),
      ),
      h2('3. Incidencias'),
      ul(['[Incidencia y cómo se resolvió]']),
      h2('4. Lecciones aprendidas'),
      ul(['[Qué repetir]', '[Qué mejorar]']),
      callout(
        'ok',
        'Comparta este informe con el equipo antes de planificar el siguiente evento.',
      ),
      firmas(['Elaboró', 'Gerencia']),
    ]),
  },
]

const FACTURAS: TemplateDefinition[] = [
  {
    name: 'Control de facturas recibidas',
    description:
      'Registro periódico de facturas de proveedores con vencimiento y estado.',
    space: 'Facturas',
    blocks: formal('Control de facturas recibidas', 'SC-FAC-001', 'Finanzas', [
      field('Periodo'),
      field('Responsable'),
      h2('Facturas'),
      table(
        [
          'Factura N.º',
          'Proveedor',
          'Fecha',
          'Monto (C$)',
          'Vencimiento',
          'Estado',
        ],
        blank(10, 6),
      ),
      h2('Resumen'),
      table(
        ['Total facturado (C$)', 'Pagado (C$)', 'Pendiente (C$)'],
        [['', '', '']],
      ),
      firmas(['Elaboró', 'Finanzas']),
    ]),
  },
  {
    name: 'Conciliación de pagos',
    description:
      'Concilia facturas contra pagos realizados y explica diferencias.',
    space: 'Facturas',
    blocks: formal('Conciliación de pagos', 'SC-CNP-001', 'Finanzas', [
      field('Periodo'),
      h2('Conciliación'),
      table(
        [
          'Referencia',
          'Proveedor',
          'Facturado (C$)',
          'Pagado (C$)',
          'Diferencia (C$)',
        ],
        blank(8, 5),
      ),
      h2('Explicación de diferencias'),
      p(''),
      firmas(['Elaboró', 'Revisó']),
    ]),
  },
]

const ORGANIGRAMA: TemplateDefinition[] = [
  {
    name: 'Ficha de puesto',
    description:
      'Descripción de un puesto: propósito, funciones, requisitos e indicadores.',
    space: 'Organigrama',
    blocks: formal('Ficha de puesto', 'SC-FPU-001', 'Recursos Humanos', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Puesto', ''],
          ['Área', ''],
          ['Reporta a', ''],
          ['Personas a cargo', ''],
        ],
      ),
      h2('1. Propósito del puesto'),
      p('Para qué existe este puesto dentro de Sport City Club.'),
      h2('2. Funciones principales'),
      ul(['[Función]', '[Función]', '[Función]']),
      h2('3. Requisitos'),
      ul(['[Formación o experiencia]', '[Habilidad]']),
      h2('4. Indicadores de desempeño'),
      ul(['[Indicador y meta]']),
      h2('5. Relaciones clave'),
      table(['Con quién', 'Para qué'], blank(3, 2)),
      firmas(['Recursos Humanos', 'Jefe inmediato']),
    ]),
  },
  {
    name: 'Estructura de área',
    description:
      'Puestos, personas, líneas de reporte y funciones clave de un área.',
    space: 'Organigrama',
    blocks: formal('Estructura de área', 'SC-EST-001', 'Recursos Humanos', [
      field('Área'),
      field('Responsable'),
      h2('Estructura'),
      table(['Puesto', 'Persona', 'Reporta a', 'Funciones clave'], blank(6, 4)),
      h2('Coordinación con otras áreas'),
      table(['Área', 'Motivo de coordinación'], blank(3, 2)),
      h2('Control de cambios'),
      cambios(),
    ]),
  },
  {
    name: 'Solicitud de nuevo puesto',
    description:
      'Justificación, perfil y rango salarial para abrir una vacante.',
    space: 'Organigrama',
    blocks: formal(
      'Solicitud de nuevo puesto',
      'SC-VAC-001',
      'Recursos Humanos',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Puesto solicitado', ''],
            ['Área', ''],
            ['Solicitante', ''],
            ['Fecha', ''],
            ['Tipo', 'Nuevo / reemplazo'],
          ],
        ),
        h2('Justificación'),
        p(''),
        h2('Perfil requerido'),
        ul(['[Formación]', '[Experiencia]', '[Habilidades]']),
        h2('Condiciones'),
        table(
          ['Concepto', 'Detalle'],
          [
            ['Rango salarial (C$)', ''],
            ['Jornada', ''],
            ['Fecha de inicio deseada', ''],
          ],
        ),
        h2('Autorizaciones'),
        firmas(['Solicitante', 'Recursos Humanos', 'Gerencia']),
      ],
    ),
  },
  {
    name: 'Evaluación de desempeño',
    description:
      'Evaluación por competencias, logros, mejoras y plan de acción.',
    space: 'Organigrama',
    blocks: formal(
      'Evaluación de desempeño',
      'SC-EVD-001',
      'Recursos Humanos',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Colaborador', ''],
            ['Puesto', ''],
            ['Periodo evaluado', ''],
            ['Evaluador', ''],
          ],
        ),
        h2('1. Competencias'),
        table(
          ['Competencia', 'Calificación (1–5)', 'Evidencia'],
          [
            ['Cumplimiento de objetivos', '', ''],
            ['Trabajo en equipo', '', ''],
            ['Servicio al cliente', '', ''],
            ['Responsabilidad y puntualidad', '', ''],
          ],
        ),
        h2('2. Logros del periodo'),
        ul(['[Logro]']),
        h2('3. Áreas de mejora'),
        ul(['[Aspecto a mejorar]']),
        h2('4. Plan de acción'),
        table(['Acción', 'Responsable', 'Fecha'], blank(3, 3)),
        firmas(['Colaborador', 'Evaluador', 'Recursos Humanos']),
      ],
    ),
  },
  {
    name: 'Asignación de funciones',
    description:
      'Documento formal que asigna funciones y responsabilidades a una persona.',
    space: 'Organigrama',
    blocks: formal(
      'Asignación de funciones',
      'SC-ASF-001',
      'Recursos Humanos',
      [
        p(
          'Por medio de la presente se asignan a [nombre], en el puesto de [puesto], las siguientes funciones a partir del [fecha]:',
        ),
        ol(['[Función 1]', '[Función 2]', '[Función 3]']),
        h2('Línea de reporte'),
        p('Reportará a [nombre y cargo].'),
        h2('Aceptación'),
        firmas(['Colaborador', 'Jefe inmediato', 'Recursos Humanos']),
      ],
    ),
  },
]

const DOCUMENTACION: TemplateDefinition[] = [
  {
    name: 'Política interna',
    description:
      'Propósito, alcance, reglas, responsabilidades e historial de versiones.',
    space: 'Documentación',
    blocks: formal('Política interna', 'SC-POL-001', 'Gerencia', [
      h2('1. Propósito'),
      p('Qué busca esta política.'),
      h2('2. Alcance'),
      p('A quién aplica y en qué situaciones.'),
      h2('3. Definiciones'),
      ul(['[Término]: [significado]']),
      h2('4. Política'),
      ol(['[Regla]', '[Regla]', '[Regla]']),
      h2('5. Responsabilidades'),
      table(['Rol', 'Responsabilidad'], blank(3, 2)),
      callout(
        'warn',
        'El incumplimiento de esta política puede dar lugar a medidas conforme al reglamento interno.',
      ),
      h2('6. Vigencia y revisión'),
      cambios(),
      h2('7. Aprobación'),
      firmas(['Elaboró', 'Revisó', 'Aprobó']),
    ]),
  },
  {
    name: 'Procedimiento operativo',
    description:
      'Pasos numerados, puntos críticos, checklist y qué hacer si algo falla.',
    space: 'Documentación',
    blocks: formal('Procedimiento operativo', 'SC-PRC-001', 'Operaciones', [
      h2('1. Objetivo'),
      p('Qué se consigue al seguir este procedimiento.'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Responsable', ''],
          ['Frecuencia', ''],
          ['Área', ''],
        ],
      ),
      h2('2. Materiales o accesos necesarios'),
      ul(['[Material o acceso]']),
      h2('3. Pasos'),
      ol(['[Paso 1]', '[Paso 2]', '[Paso 3]', '[Paso 4]']),
      callout(
        'warn',
        'Puntos críticos: indique lo que no se puede omitir ni hacer de otra forma.',
      ),
      h2('4. Checklist final'),
      ul(['[Comprobación]', '[Comprobación]']),
      h2('5. Si algo falla'),
      table(['Situación', 'Acción', 'A quién avisar'], blank(3, 3)),
      h2('6. Aprobación'),
      firmas(['Elaboró', 'Aprobó']),
    ]),
  },
  {
    name: 'Instructivo de trabajo',
    description: 'Instrucciones detalladas para ejecutar una tarea concreta.',
    space: 'Documentación',
    blocks: formal('Instructivo de trabajo', 'SC-INT-001', 'Operaciones', [
      h2('1. Objetivo'),
      p(''),
      h2('2. Materiales y herramientas'),
      ul(['[Elemento]']),
      h2('3. Instrucciones'),
      ol(['[Instrucción 1]', '[Instrucción 2]', '[Instrucción 3]']),
      h2('4. Precauciones'),
      callout('warn', '[Riesgos y medidas de seguridad a tener en cuenta]'),
      h2('5. Aprobación'),
      firmas(['Elaboró', 'Aprobó']),
    ]),
  },
  {
    name: 'Protocolo de seguridad y emergencia',
    description:
      'Actuación ante lesiones, incendio y evacuación, con contactos y responsables.',
    space: 'Documentación',
    blocks: formal(
      'Protocolo de seguridad y emergencia',
      'SC-SEG-001',
      'Seguridad',
      [
        h2('1. Objetivo'),
        p('Proteger a las personas y las instalaciones ante emergencias.'),
        h2('2. Contactos de emergencia'),
        table(
          ['Servicio', 'Teléfono'],
          [
            ['Bomberos', ''],
            ['Cruz Roja / ambulancia', ''],
            ['Policía', ''],
            ['Responsable del club', ''],
          ],
        ),
        h2('3. Ante una lesión'),
        ol([
          'Detener la actividad y asegurar la zona.',
          'Prestar primeros auxilios básicos.',
          'Llamar a emergencias si es necesario.',
          'Informar al responsable y registrar el incidente.',
        ]),
        h2('4. Ante un incendio'),
        ol([
          'Activar la alarma y avisar al responsable.',
          'Evacuar por las rutas señalizadas.',
          'No usar ascensores ni regresar por objetos personales.',
        ]),
        h2('5. Punto de reunión'),
        p('[Ubicación del punto de reunión]'),
        callout(
          'warn',
          'Se realizarán simulacros al menos una vez al año y su resultado quedará registrado.',
        ),
        h2('6. Aprobación'),
        firmas(['Elaboró', 'Aprobó']),
      ],
    ),
  },
  {
    name: 'Checklist de apertura y cierre',
    description:
      'Lista de verificación diaria de apertura y cierre de instalaciones.',
    space: 'Documentación',
    blocks: formal(
      'Checklist de apertura y cierre',
      'SC-CHK-001',
      'Operaciones',
      [
        field('Fecha'),
        field('Responsable'),
        table(
          ['Ítem', 'Apertura ✓', 'Cierre ✓', 'Observaciones'],
          [
            ['Iluminación', '', '', ''],
            ['Superficie de juego', '', '', ''],
            ['Baños y vestidores', '', '', ''],
            ['Botiquín', '', '', ''],
            ['Material deportivo', '', '', ''],
            ['Accesos y candados', '', '', ''],
            ['Equipos apagados', '', '', ''],
          ],
        ),
        firmas(['Apertura', 'Cierre']),
      ],
    ),
  },
  {
    name: 'Registro de incidentes',
    description:
      'Reporte de un incidente con personas involucradas, acciones y seguimiento.',
    space: 'Documentación',
    blocks: formal('Registro de incidentes', 'SC-INC-001', 'Seguridad', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha y hora', ''],
          ['Lugar', ''],
          ['Reportado por', ''],
          ['Tipo de incidente', ''],
        ],
      ),
      h2('Descripción'),
      p(''),
      h2('Personas involucradas'),
      table(['Nombre', 'Rol', 'Contacto'], blank(3, 3)),
      h2('Acciones inmediatas'),
      p(''),
      h2('Seguimiento'),
      table(
        ['Acción correctiva', 'Responsable', 'Fecha', 'Estado'],
        blank(3, 4),
      ),
      firmas(['Reporta', 'Responsable del club']),
    ]),
  },
  {
    name: 'Plan de mantenimiento',
    description:
      'Programa de mantenimiento preventivo de instalaciones y equipos.',
    space: 'Documentación',
    blocks: formal('Plan de mantenimiento', 'SC-MTO-001', 'Mantenimiento', [
      field('Periodo'),
      table(
        [
          'Instalación / equipo',
          'Tarea',
          'Frecuencia',
          'Responsable',
          'Último',
          'Próximo',
        ],
        blank(8, 6),
      ),
      h2('Observaciones'),
      p(''),
      firmas(['Elaboró', 'Aprobó']),
    ]),
  },
  {
    name: 'Política de privacidad y uso de datos',
    description:
      'Cómo se recopilan, usan y protegen los datos personales de clientes y jugadores.',
    space: 'Documentación',
    blocks: formal(
      'Política de privacidad y uso de datos',
      'SC-PRV-001',
      'Legal',
      [
        h2('1. Objeto'),
        p(
          'Informar cómo Sport City Club trata los datos personales de sus clientes, jugadores y colaboradores.',
        ),
        h2('2. Datos que se recopilan'),
        ul([
          'Datos de identificación y contacto.',
          'Datos de reservas, inscripciones y pagos.',
          'Imágenes tomadas en eventos, cuando corresponda.',
        ]),
        h2('3. Finalidades'),
        ul([
          'Gestionar reservas, inscripciones y pagos.',
          'Comunicar información del club.',
          'Cumplir obligaciones legales.',
        ]),
        h2('4. Protección y conservación'),
        p(
          'Los datos se almacenan con medidas de seguridad y solo acceden a ellos las personas autorizadas.',
        ),
        h2('5. Derechos de los titulares'),
        p(
          'Los titulares pueden solicitar acceso, rectificación o eliminación de sus datos escribiendo a [correo].',
        ),
        h2('6. Aprobación'),
        firmas(['Elaboró', 'Aprobó']),
      ],
    ),
  },
]

const GENERALES: TemplateDefinition[] = [
  {
    name: 'Acta de reunión',
    description: 'Asistentes, agenda, acuerdos con responsable y fecha límite.',
    space: null,
    blocks: formal('Acta de reunión', 'SC-REU-001', 'General', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha', ''],
          ['Hora', ''],
          ['Lugar', ''],
          ['Convoca', ''],
        ],
      ),
      h2('1. Asistentes'),
      table(['Nombre', 'Cargo', 'Firma'], blank(5, 3)),
      h2('2. Agenda'),
      ol(['[Tema]', '[Tema]']),
      h2('3. Desarrollo'),
      p('Resumen de lo tratado.'),
      h2('4. Acuerdos'),
      table(['Acuerdo', 'Responsable', 'Fecha límite', 'Estado'], blank(3, 4)),
      h2('5. Próxima reunión'),
      p('[Fecha y tema]'),
    ]),
  },
  {
    name: 'Memorando interno',
    description: 'Comunicación formal interna entre áreas o hacia el personal.',
    space: null,
    blocks: formal('Memorando', 'SC-MEM-001', 'General', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Para', ''],
          ['De', ''],
          ['Copia a', ''],
          ['Fecha', ''],
          ['Asunto', ''],
        ],
      ),
      p('Estimados(as):'),
      p('[Cuerpo del memorando]'),
      p('Atentamente,'),
      firmas(['Remitente']),
    ]),
  },
  {
    name: 'Carta oficial',
    description: 'Carta formal con destinatario, asunto, cuerpo y firma.',
    space: null,
    blocks: formal('Carta oficial', 'SC-CAR-001', 'General', [
      p('Managua, [fecha]'),
      boldP('[Nombre del destinatario]'),
      p('[Cargo · Institución]'),
      p('Presente.'),
      field('Asunto'),
      p('Estimado(a) señor(a):'),
      p('[Cuerpo de la carta]'),
      p(
        'Sin otro particular, me despido con muestras de aprecio y consideración.',
      ),
      p('Atentamente,'),
      firmas(['Firma autorizada']),
    ]),
  },
  {
    name: 'Comunicado oficial',
    description:
      'Comunicado público o interno con mensaje claro y datos de contacto.',
    space: null,
    blocks: formal('Comunicado oficial', 'SC-COM-001', 'Comunicación', [
      field('Fecha'),
      field('Dirigido a'),
      h2('Comunicado'),
      p('[Mensaje principal en tono claro y respetuoso]'),
      h2('Detalles'),
      ul(['[Dato importante]', '[Dato importante]']),
      h2('Contacto'),
      p('[Teléfono · correo]'),
    ]),
  },
  {
    name: 'Informe general',
    description:
      'Informe formal con antecedentes, desarrollo, conclusiones y recomendaciones.',
    space: null,
    blocks: formal('Informe', 'SC-IGN-001', 'General', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Elaborado por', ''],
          ['Dirigido a', ''],
          ['Fecha', ''],
          ['Periodo', ''],
        ],
      ),
      h2('1. Resumen'),
      p(''),
      h2('2. Antecedentes'),
      p(''),
      h2('3. Desarrollo'),
      p(''),
      h2('4. Conclusiones'),
      ul(['[Conclusión]']),
      h2('5. Recomendaciones'),
      ul(['[Recomendación]']),
      firmas(['Elaboró', 'Revisó']),
    ]),
  },
  {
    name: 'Constancia',
    description: 'Constancia formal emitida por Sport City Club.',
    space: null,
    blocks: formal('Constancia', 'SC-CST-001', 'General', [
      p(
        'Sport City Club hace constar que [nombre completo], con cédula [número], [detalle de lo que se certifica].',
      ),
      p(
        'Se extiende la presente a solicitud del interesado, en Managua, a los [día] días del mes de [mes] de [año].',
      ),
      firmas(['Emite']),
    ]),
  },
  {
    name: 'Lista de asistencia',
    description: 'Registro de asistentes a una actividad, con firma.',
    space: null,
    blocks: formal('Lista de asistencia', 'SC-ASI-001', 'General', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Actividad', ''],
          ['Fecha y lugar', ''],
          ['Responsable', ''],
        ],
      ),
      table(
        ['N.º', 'Nombre completo', 'Cargo / equipo', 'Firma'],
        blank(15, 4),
      ),
    ]),
  },
  {
    name: 'Documento formal en blanco',
    description:
      'Membrete y estructura mínima para cualquier documento que no tenga plantilla propia.',
    space: null,
    blocks: formal('[Título del documento]', 'SC-DOC-001', 'General', [
      h2('1. Objeto'),
      p(''),
      h2('2. Desarrollo'),
      p(''),
      h2('3. Conclusiones'),
      p(''),
      firmas(['Elaboró', 'Aprobó']),
    ]),
  },
]

const INVENTARIOS: TemplateDefinition[] = [
  {
    name: 'Inventario general de activos',
    description:
      'Listado de todos los bienes del club: código, categoría, ubicación, responsable, estado y valor.',
    space: 'Inventarios',
    blocks: formal(
      'Inventario general de activos',
      'SC-INV-001',
      'Inventarios',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Fecha del inventario', '{{fecha}}'],
            ['Responsable', '{{usuario}}'],
            ['Área o sede', ''],
          ],
        ),
        h2('1. Activos'),
        table(
          [
            'Código',
            'Descripción',
            'Categoría',
            'Ubicación',
            'Responsable',
            'Estado',
            'Valor (C$)',
          ],
          blank(8, 7),
        ),
        h2('2. Resumen'),
        table(
          ['Categoría', 'Cantidad', 'Valor total (C$)'],
          [
            ['Mobiliario', '', ''],
            ['Equipo deportivo', '', ''],
            ['Equipo electrónico', '', ''],
            ['Herramientas', '', ''],
            ['Total', '', ''],
          ],
        ),
        callout(
          'info',
          'Estados sugeridos: Bueno, Regular, Malo, En reparación, De baja.',
        ),
        firmas(['Elaboró', 'Revisó', 'Aprobó']),
      ],
    ),
  },
  {
    name: 'Inventario de equipo deportivo',
    description:
      'Balones, redes, conos, petos y demás material de las canchas, con cantidad y estado.',
    space: 'Inventarios',
    blocks: formal('Inventario de equipo deportivo', 'SC-INV-002', 'Deportes', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha', '{{fecha}}'],
          ['Responsable', '{{usuario}}'],
          ['Cancha o bodega', ''],
        ],
      ),
      h2('1. Material'),
      table(
        [
          'Artículo',
          'Total',
          'Bueno',
          'Regular',
          'Malo',
          'Ubicación',
          'Observaciones',
        ],
        [
          ['Balones', '', '', '', '', '', ''],
          ['Conos', '', '', '', '', '', ''],
          ['Petos', '', '', '', '', '', ''],
          ['Redes de portería', '', '', '', '', '', ''],
          ['Porterías', '', '', '', '', '', ''],
          ['Botiquín', '', '', '', '', '', ''],
          ['', '', '', '', '', '', ''],
          ['', '', '', '', '', '', ''],
        ],
      ),
      h2('2. Necesidades de reposición'),
      table(['Artículo', 'Cantidad a reponer', 'Prioridad'], blank(4, 3)),
      firmas(['Elaboró', 'Revisó']),
    ]),
  },
  {
    name: 'Inventario de bar y productos',
    description:
      'Control de existencias del bar o la tienda: entradas, salidas, existencia final y stock mínimo.',
    space: 'Inventarios',
    blocks: formal('Inventario de bar y productos', 'SC-INV-003', 'Bar', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Periodo', ''],
          ['Fecha de corte', '{{fecha}}'],
          ['Responsable', '{{usuario}}'],
        ],
      ),
      h2('1. Existencias'),
      table(
        [
          'Producto',
          'Unidad',
          'Existencia inicial',
          'Entradas',
          'Salidas',
          'Existencia final',
          'Mínimo',
        ],
        blank(10, 7),
      ),
      h2('2. Observaciones'),
      p(''),
      callout(
        'warn',
        'Los productos con existencia final por debajo del mínimo deben pasar al reporte de faltantes y reposición.',
      ),
      firmas(['Elaboró', 'Revisó']),
    ]),
  },
  {
    name: 'Acta de conteo físico',
    description:
      'Toma física de inventario: conteo contra sistema, diferencias, acciones y firmas de quien cuenta y del testigo.',
    space: 'Inventarios',
    blocks: formal('Acta de conteo físico', 'SC-INV-004', 'Inventarios', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha del conteo', '{{fecha}}'],
          ['Área contada', ''],
          ['Responsable del conteo', '{{usuario}}'],
          ['Testigo', ''],
        ],
      ),
      h2('1. Resultado del conteo'),
      table(
        ['Artículo', 'Sistema', 'Conteo físico', 'Diferencia', 'Observación'],
        blank(8, 5),
      ),
      h2('2. Diferencias y causas'),
      p(''),
      h2('3. Acciones correctivas'),
      table(['Acción', 'Responsable', 'Fecha límite'], blank(3, 3)),
      firmas(['Contó', 'Testigo', 'Autorizó']),
    ]),
  },
  {
    name: 'Entrada de inventario',
    description:
      'Registro de mercancía o material que llega al club: proveedor, factura, cantidades y quién recibe.',
    space: 'Inventarios',
    blocks: formal('Entrada de inventario', 'SC-INV-005', 'Inventarios', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha de entrada', '{{fecha}}'],
          ['Proveedor', '{{proveedor}}'],
          ['Factura o documento', ''],
          ['Recibido por', '{{usuario}}'],
        ],
      ),
      h2('1. Artículos recibidos'),
      table(
        [
          'Artículo',
          'Cantidad',
          'Unidad',
          'Costo unitario (C$)',
          'Total (C$)',
          'Estado al recibir',
        ],
        blank(8, 6),
      ),
      h2('2. Observaciones'),
      p(''),
      firmas(['Recibió', 'Entregó']),
    ]),
  },
  {
    name: 'Salida o requisición de material',
    description:
      'Solicitud y autorización para sacar material del inventario, con motivo y destino.',
    space: 'Inventarios',
    blocks: formal(
      'Salida o requisición de material',
      'SC-INV-006',
      'Inventarios',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Fecha', '{{fecha}}'],
            ['Solicitante', '{{usuario}}'],
            ['Área que lo usa', ''],
            ['Motivo', ''],
          ],
        ),
        h2('1. Material solicitado'),
        table(['Artículo', 'Cantidad', 'Unidad', 'Destino o uso'], blank(8, 4)),
        h2('2. Observaciones'),
        p(''),
        firmas(['Solicita', 'Autoriza', 'Entrega']),
      ],
    ),
  },
  {
    name: 'Kardex de artículo',
    description:
      'Ficha de un artículo con todos sus movimientos: entradas, salidas y saldo.',
    space: 'Inventarios',
    blocks: formal('Kardex de artículo', 'SC-INV-007', 'Inventarios', [
      h2('1. Datos del artículo'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Código', ''],
          ['Descripción', ''],
          ['Unidad de medida', ''],
          ['Stock mínimo', ''],
          ['Stock máximo', ''],
          ['Ubicación', ''],
        ],
      ),
      h2('2. Movimientos'),
      table(
        ['Fecha', 'Documento', 'Entrada', 'Salida', 'Saldo', 'Responsable'],
        blank(12, 6),
      ),
      callout(
        'info',
        'El saldo de cada línea es el saldo anterior más la entrada, menos la salida.',
      ),
    ]),
  },
  {
    name: 'Reporte de faltantes y reposición',
    description:
      'Artículos por debajo del mínimo, cantidad a reponer, prioridad y proveedor sugerido.',
    space: 'Inventarios',
    blocks: formal(
      'Reporte de faltantes y reposición',
      'SC-INV-008',
      'Inventarios',
      [
        table(
          ['Campo', 'Detalle'],
          [
            ['Fecha', '{{fecha}}'],
            ['Elaborado por', '{{usuario}}'],
          ],
        ),
        h2('1. Artículos a reponer'),
        table(
          [
            'Artículo',
            'Existencia',
            'Mínimo',
            'A reponer',
            'Proveedor sugerido',
            'Prioridad',
          ],
          blank(8, 6),
        ),
        h2('2. Presupuesto estimado'),
        table(
          ['Concepto', 'Monto (C$)'],
          [
            ['Total estimado de reposición', ''],
            ['Autorizado', ''],
          ],
        ),
        callout(
          'warn',
          'Este reporte no es una orden de compra: la compra se autoriza con la solicitud de pago correspondiente.',
        ),
        firmas(['Elaboró', 'Autorizó']),
      ],
    ),
  },
  {
    name: 'Baja de activos',
    description:
      'Acta para retirar bienes del inventario por daño, pérdida, obsolescencia, venta o donación.',
    space: 'Inventarios',
    blocks: formal('Baja de activos', 'SC-INV-009', 'Inventarios', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha', '{{fecha}}'],
          ['Solicitado por', '{{usuario}}'],
        ],
      ),
      h2('1. Activos a dar de baja'),
      table(
        ['Código', 'Descripción', 'Estado actual', 'Valor (C$)', 'Motivo'],
        blank(6, 5),
      ),
      h2('2. Motivo de la baja'),
      ul([
        'Daño o desgaste irreparable.',
        'Pérdida o robo (adjuntar denuncia o acta).',
        'Obsolescencia.',
        'Venta o donación.',
      ]),
      h2('3. Destino final'),
      p(''),
      firmas(['Solicita', 'Revisó', 'Autorizó']),
    ]),
  },
  {
    name: 'Préstamo de equipo',
    description:
      'Control de equipo o material prestado: a quién, cuándo sale, cuándo vuelve y en qué estado.',
    space: 'Inventarios',
    blocks: formal('Préstamo de equipo', 'SC-INV-010', 'Inventarios', [
      table(
        ['Campo', 'Detalle'],
        [
          ['Responsable del préstamo', '{{usuario}}'],
          ['Periodo', ''],
        ],
      ),
      h2('1. Préstamos'),
      table(
        [
          'Equipo',
          'Prestado a',
          'Fecha de salida',
          'Fecha de devolución',
          'Estado al devolver',
          'Firma',
        ],
        blank(10, 6),
      ),
      callout(
        'info',
        'Quien recibe el equipo se responsabiliza de su cuidado y devolución en la fecha acordada.',
      ),
    ]),
  },
  {
    name: 'Ficha de activo',
    description:
      'Datos de un bien: identificación, compra, garantía, ubicación y su historial de mantenimiento.',
    space: 'Inventarios',
    blocks: formal('Ficha de activo', 'SC-INV-011', 'Inventarios', [
      h2('1. Identificación'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Código del activo', ''],
          ['Descripción', ''],
          ['Marca y modelo', ''],
          ['Número de serie', ''],
          ['Categoría', ''],
          ['Ubicación', ''],
          ['Responsable', ''],
        ],
      ),
      h2('2. Compra y garantía'),
      table(
        ['Campo', 'Detalle'],
        [
          ['Fecha de compra', ''],
          ['Proveedor', '{{proveedor}}'],
          ['Factura', ''],
          ['Valor de compra (C$)', ''],
          ['Garantía hasta', ''],
        ],
      ),
      h2('3. Historial de mantenimiento'),
      table(
        ['Fecha', 'Trabajo realizado', 'Costo (C$)', 'Responsable'],
        blank(5, 4),
      ),
      h2('4. Estado actual'),
      p(''),
    ]),
  },
]

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  ...MANUALES,
  ...REGLAMENTOS,
  ...ALCANCES,
  ...PRESUPUESTOS,
  ...PROVEEDORES,
  ...FACTURAS,
  ...ORGANIGRAMA,
  ...DOCUMENTACION,
  ...INVENTARIOS,
  ...GENERALES,
]
