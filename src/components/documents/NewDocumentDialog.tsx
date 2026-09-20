import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FilePlus2, Search } from 'lucide-react'
import { DOC_THEMES, THEME_INFO, suggestTheme } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import {
  TEMPLATE_CATEGORIES,
  categoryOf,
  themeForTemplate,
} from '#/lib/template-catalog'
import type { TemplateCategory } from '#/lib/template-catalog'
import {
  builtinValues,
  fillHtml,
  variableLabel,
} from '#/lib/template-variables'
import { PaperPreview } from '#/components/documents/PaperPreview'
import { useTemplatePreview } from '#/components/documents/template-previews'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'

export type TemplateOption = {
  id: string
  name: string
  folder_id: string | null
  description: string | null
}

type Filter = 'all' | 'folder' | TemplateCategory

/** Muestra de los colores del tema: color principal + acento. */
function ThemeDot({
  theme,
  className,
}: {
  theme: DocTheme
  className?: string
}) {
  const { navy, accent } = THEME_INFO[theme].colors
  return (
    <span
      className={cn(
        'inline-block size-3 flex-none rounded-full border border-black/10',
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${navy} 55%, ${accent} 55%)`,
      }}
    />
  )
}

/** Tarjeta de la galería: primera página real de la plantilla con su tema, nombre, propósito y acción. */
function TemplateCard({
  template,
  folderName,
  onUse,
}: {
  template: TemplateOption | null
  folderName: string
  onUse: () => void
}) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const preview = useTemplatePreview(template?.id ?? null, visible)
  const theme = template
    ? themeForTemplate(template.name)
    : suggestTheme(folderName)
  const category = template
    ? TEMPLATE_CATEGORIES.find((c) => c.id === categoryOf(template.name))
    : null
  const html = preview
    ? fillHtml(preview.html, {
        ...builtinValues({ userName: '', folderName }),
        ...Object.fromEntries(
          preview.variables.map((name) => [name, `[${variableLabel(name)}]`]),
        ),
      })
    : null

  return (
    <button
      ref={ref}
      type="button"
      onClick={onUse}
      className="group flex flex-col gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative overflow-hidden rounded-md border border-border bg-[var(--doc-desk)] p-2.5 transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/40">
        <PaperPreview
          theme={theme}
          title={template?.name ?? 'Documento sin título'}
          kicker={folderName}
          html={html}
          loading={template !== null && preview === undefined}
          emptyNote="Documento vacío: empiezas a escribir desde cero."
          className="shadow-sm"
        />
        <span
          className={cn(
            'absolute inset-x-4 bottom-4 flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-md transition-opacity',
            'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100',
          )}
        >
          <FilePlus2 className="size-4" />
          {template ? 'Usar plantilla' : 'Empezar en blanco'}
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="text-sm font-medium leading-snug text-foreground">
          {template?.name ?? 'Documento en blanco'}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {template?.description ??
            'Un documento vacío con la base de marca Sport City.'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground">
          {category && (
            <span className="font-display uppercase tracking-wide">
              {category.label}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <ThemeDot theme={theme} />
            {THEME_INFO[theme].label}
          </span>
        </div>
      </div>
    </button>
  )
}

export function NewDocumentDialog({
  open,
  onOpenChange,
  templates,
  saving,
  folderName,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: TemplateOption[]
  saving: boolean
  folderName: string
  onCreate: (
    title: string,
    templateId: string | null,
    variables: Record<string, string>,
    theme: DocTheme,
  ) => void
}) {
  const [step, setStep] = useState<'gallery' | 'details'>('gallery')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [pickedTheme, setPickedTheme] = useState<DocTheme | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setStep('gallery')
      setQuery('')
      setFilter('all')
      setSelectedId(null)
      setTitle('')
      setValues({})
      setPickedTheme(null)
    }
  }, [open])

  const selected = templates.find((t) => t.id === selectedId) ?? null
  const theme =
    pickedTheme ??
    (selected ? themeForTemplate(selected.name) : suggestTheme(folderName))
  const preview = useTemplatePreview(selectedId, step === 'details')
  const variables = preview?.variables ?? []

  const normalized = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      templates.filter(
        (t) =>
          !normalized ||
          `${t.name} ${t.description ?? ''}`.toLowerCase().includes(normalized),
      ),
    [templates, normalized],
  )
  const counts = useMemo(() => {
    const byCategory = new Map<TemplateCategory, number>()
    for (const t of visible) {
      const id = categoryOf(t.name)
      byCategory.set(id, (byCategory.get(id) ?? 0) + 1)
    }
    return {
      byCategory,
      folder: visible.filter((t) => t.folder_id !== null).length,
    }
  }, [visible])

  const shown =
    filter === 'all'
      ? visible
      : filter === 'folder'
        ? visible.filter((t) => t.folder_id !== null)
        : visible.filter((t) => categoryOf(t.name) === filter)

  type Group = {
    id: string
    label: string
    hint: string
    items: TemplateOption[]
  }
  // En «Todas» se agrupa por propósito; con un filtro, una sola lista.
  const groups: Group[] =
    filter === 'all'
      ? TEMPLATE_CATEGORIES.map((c) => ({
          id: c.id,
          label: c.label,
          hint: c.hint,
          items: shown.filter((t) => categoryOf(t.name) === c.id),
        })).filter((g) => g.items.length > 0)
      : [
          {
            id: filter,
            label:
              filter === 'folder'
                ? `Para ${folderName}`
                : (TEMPLATE_CATEGORIES.find((c) => c.id === filter)?.label ??
                  ''),
            hint:
              filter === 'folder'
                ? 'Plantillas pensadas para esta carpeta'
                : (TEMPLATE_CATEGORIES.find((c) => c.id === filter)?.hint ??
                  ''),
            items: shown,
          },
        ]
  const showBlank =
    filter === 'all' && (!normalized || 'blanco'.includes(normalized))

  const filters: ReadonlyArray<readonly [Filter, string, number]> = [
    ['all', 'Todas', visible.length],
    ...(counts.folder > 0
      ? ([['folder', `Para ${folderName}`, counts.folder]] as const)
      : []),
    ...TEMPLATE_CATEGORIES.map(
      (c) => [c.id, c.label, counts.byCategory.get(c.id) ?? 0] as const,
    ),
  ]

  function use(id: string | null) {
    setSelectedId(id)
    setPickedTheme(null)
    setTitle(templates.find((t) => t.id === id)?.name ?? '')
    setStep('details')
    setTimeout(() => titleRef.current?.select(), 60)
  }

  const liveHtml = preview
    ? fillHtml(preview.html, {
        ...builtinValues({ userName: 'Tu nombre', folderName }),
        ...Object.fromEntries(
          variables.map((name) => [
            name,
            (values[name] as string | undefined)?.trim() ||
              `[${variableLabel(name)}]`,
          ]),
        ),
      })
    : null

  const style = THEME_INFO[theme].style
  const facts: Array<[string, string]> = [
    [
      'Portada',
      {
        full: 'A sangre completa',
        clean: 'Limpia y blanca',
        split: 'Dividida en dos',
        diagonal: 'Con diagonal',
        none: 'Sin portada',
      }[style.cover],
    ],
    [
      'Pie',
      {
        strip: 'Franja de color',
        line: 'Línea fina',
        minimal: 'Solo texto',
        label: 'Etiqueta y número',
      }[style.footer],
    ],
    [
      'Tablas',
      {
        underline: 'Cabecera subrayada',
        filled: 'Cabecera de color',
        lines: 'Líneas finas',
      }[style.table],
    ],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl">
        {step === 'gallery' ? (
          <>
            <DialogHeader className="flex-none gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
              <div>
                <DialogTitle className="font-display text-lg">
                  Nuevo documento
                </DialogTitle>
                <DialogDescription>
                  Empieza en blanco o elige una plantilla: cada una trae su
                  propio estilo.
                </DialogDescription>
              </div>
              <div className="relative w-full sm:mr-8 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar plantilla…"
                  className="pl-9"
                  aria-label="Buscar plantilla"
                />
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <nav
                aria-label="Categorías de plantillas"
                className="flex flex-none gap-1 overflow-x-auto border-b border-border p-2 md:w-60 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3 [scrollbar-width:none]"
              >
                {filters.map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    disabled={count === 0 && id !== 'all'}
                    className={cn(
                      'flex flex-none items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 md:w-full',
                      filter === id
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <span className="whitespace-nowrap">{label}</span>
                    <span className="text-2xs tabular-nums">{count}</span>
                  </button>
                ))}
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {showBlank && (
                  <section className="mb-8">
                    <h3 className="mb-3 font-display text-2xs uppercase tracking-wide text-muted-foreground">
                      Empezar de cero
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
                      <TemplateCard
                        template={null}
                        folderName={folderName}
                        onUse={() => use(null)}
                      />
                    </div>
                  </section>
                )}
                {groups.map((group) => (
                  <section key={group.id} className="mb-8">
                    <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                      <h3 className="font-display text-2xs uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </h3>
                      <span className="text-xs text-muted-foreground/80">
                        {group.hint}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
                      {group.items.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          folderName={folderName}
                          onUse={() => use(t.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                {!showBlank && groups.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ninguna plantilla coincide con «{query}».
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="flex-none border-b border-border px-5 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1.5"
                  onClick={() => setStep('gallery')}
                >
                  <ArrowLeft className="size-4" />
                  Plantillas
                </Button>
                <DialogTitle className="font-display text-base">
                  {selected?.name ?? 'Documento en blanco'}
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Título, datos y estilo del nuevo documento.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,26rem)_1fr] lg:overflow-hidden">
              <div className="space-y-5 px-5 py-5 sm:px-6 lg:overflow-y-auto">
                <div className="space-y-1.5">
                  <Label htmlFor="new-doc-title">Título del documento</Label>
                  <Input
                    id="new-doc-title"
                    ref={titleRef}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && title.trim() && !saving)
                        onCreate(title.trim(), selectedId, values, theme)
                    }}
                    placeholder="Por ejemplo: Reglamento Liga 2026"
                  />
                </div>

                {variables.length > 0 && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">
                      Datos de la plantilla
                    </legend>
                    <p className="-mt-1 text-xs text-muted-foreground">
                      Opcional: lo que dejes vacío quedará marcado para
                      rellenar.
                    </p>
                    {variables.map((name) => (
                      <div key={name} className="space-y-1">
                        <Label htmlFor={`var-${name}`} className="text-xs">
                          {variableLabel(name)}
                        </Label>
                        <Input
                          id={`var-${name}`}
                          value={values[name] ?? ''}
                          onChange={(event) =>
                            setValues((prev) => ({
                              ...prev,
                              [name]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </fieldset>
                )}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Estilo</legend>
                  <div className="grid gap-1.5">
                    {DOC_THEMES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPickedTheme(value)}
                        aria-pressed={theme === value}
                        className={cn(
                          'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                          theme === value
                            ? 'border-primary bg-secondary'
                            : 'border-border hover:bg-secondary/60',
                        )}
                      >
                        <ThemeDot theme={value} className="size-4" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {THEME_INFO[value].label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {THEME_INFO[value].description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 pt-1 text-2xs">
                    {facts.map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-display uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-0.5 text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </fieldset>
              </div>

              <div className="flex flex-col border-t border-border bg-[var(--doc-desk)] lg:min-h-0 lg:border-l lg:border-t-0">
                <div className="flex-none px-6 pt-4 font-display text-2xs uppercase tracking-wide text-muted-foreground">
                  Vista previa · primera página
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <PaperPreview
                    theme={theme}
                    title={title.trim() || selected?.name || ''}
                    kicker={folderName}
                    html={liveHtml}
                    loading={selectedId !== null && preview === undefined}
                    emptyNote="Documento vacío: empiezas a escribir desde cero."
                    className="mx-auto max-w-[34rem] shadow-md"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-card px-5 py-3 sm:px-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  onCreate(title.trim(), selectedId, values, theme)
                }
                disabled={saving || !title.trim()}
              >
                {saving ? 'Creando…' : 'Crear documento'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
