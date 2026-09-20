import {
  Boxes,
  BookOpen,
  Building2,
  CalendarDays,
  Calculator,
  ClipboardList,
  Mail,
  Network,
  Receipt,
  Scale,
  ShieldCheck,
  Truck,
  Users,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Tone = { tile: string; bar: string }

// Tonos sobrios que conviven con el azul de marca; se usan solo en la interfaz (no en los documentos exportados).
const TONES: Record<string, Tone> = {
  indigo: { tile: 'bg-indigo-100 text-indigo-700', bar: '#4f46e5' },
  sky: { tile: 'bg-sky-100 text-sky-700', bar: '#0284c7' },
  teal: { tile: 'bg-teal-100 text-teal-700', bar: '#0d9488' },
  emerald: { tile: 'bg-emerald-100 text-emerald-700', bar: '#059669' },
  amber: { tile: 'bg-amber-100 text-amber-700', bar: '#d97706' },
  orange: { tile: 'bg-orange-100 text-orange-700', bar: '#ea580c' },
  rose: { tile: 'bg-rose-100 text-rose-700', bar: '#e11d48' },
  violet: { tile: 'bg-violet-100 text-violet-700', bar: '#7c3aed' },
}
const TONE_LIST = Object.values(TONES)

const CATEGORIES: Array<{
  match: RegExp
  icon: LucideIcon
  tone: keyof typeof TONES
}> = [
  { match: /inventari|almacen|stock|activo/, icon: Boxes, tone: 'amber' },
  { match: /factur|pago|recibo|cobro|caja/, icon: Receipt, tone: 'emerald' },
  {
    match: /presupuest|costo|cotiz|gasto|financ/,
    icon: Calculator,
    tone: 'teal',
  },
  {
    match: /reglament|politic|norma|contrat|legal|acuerdo|alcance/,
    icon: Scale,
    tone: 'violet',
  },
  {
    match: /manual|guia|protocolo|procedimiento|instructivo/,
    icon: BookOpen,
    tone: 'indigo',
  },
  {
    match: /organigrama|estructura|cargo|puesto|funcion/,
    icon: Network,
    tone: 'sky',
  },
  { match: /proveedor|compra|orden de/, icon: Truck, tone: 'orange' },
  {
    match: /empresa|cliente|alianza|patrocin/,
    icon: Building2,
    tone: 'rose',
  },
  { match: /carta|oficio|memo|comunicad|circular/, icon: Mail, tone: 'sky' },
  {
    match: /evento|torneo|cronograma|calendario|campeonato|reserva/,
    icon: CalendarDays,
    tone: 'orange',
  },
  {
    match: /academia|entrenam|profesor|personal|rrhh|empleado|equipo/,
    icon: Users,
    tone: 'teal',
  },
  {
    match: /mantenim|reparac|limpieza|incidente/,
    icon: Wrench,
    tone: 'rose',
  },
  {
    match: /seguridad|emergencia|riesgo/,
    icon: ShieldCheck,
    tone: 'rose',
  },
  {
    match: /\bbar\b|cocina|restaurante|menu/,
    icon: UtensilsCrossed,
    tone: 'amber',
  },
  {
    match: /acta|reunion|informe|reporte|checklist|lista|control/,
    icon: ClipboardList,
    tone: 'indigo',
  },
]

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Icono y color de un tipo de documento o carpeta a partir de su nombre, para distinguirlos de un vistazo.
 * `icon` es null si el nombre no encaja en ninguna categoría (el llamador pone el suyo).
 */
export function visualFor(
  name: string,
  /** Con `vary`, el color sale del nombre completo (para que las plantillas de una misma carpeta no salgan idénticas). */
  vary = false,
): { icon: LucideIcon | null; tone: Tone } {
  const text = normalize(name)
  const found = CATEGORIES.find((c) => c.match.test(text))
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hashed = TONE_LIST[hash % TONE_LIST.length]
  if (found)
    return { icon: found.icon, tone: vary ? hashed : TONES[found.tone] }
  return { icon: null, tone: hashed }
}
