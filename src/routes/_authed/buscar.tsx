import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
} from '@tanstack/react-router'
import { FileText, Search } from 'lucide-react'
import { searchDocuments } from '#/server/search'
import { DOC_STATUSES } from '#/server/documents'
import type { DocStatus } from '#/server/documents'
import {
  StatusBadge,
  STATUS_LABELS,
  formatDueDate,
  isOverdue,
} from '#/components/documents/StatusBadge'
import { Input } from '#/components/ui/input'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { cn } from '#/lib/utils'

type SearchParams = {
  q: string
  folder?: string
  estado?: DocStatus
  etiqueta?: string
}

export const Route = createFileRoute('/_authed/buscar')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === 'string' ? search.q : '',
    folder:
      typeof search.folder === 'string' && search.folder
        ? search.folder
        : undefined,
    estado: DOC_STATUSES.find((s) => s === search.estado),
    etiqueta:
      typeof search.etiqueta === 'string' && search.etiqueta
        ? search.etiqueta
        : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    searchDocuments({
      data: {
        query: deps.q,
        folderId: deps.folder,
        status: deps.estado,
        tag: deps.etiqueta,
      },
    }),
  component: BuscarPage,
})

const authedRoute = getRouteApi('/_authed')

function BuscarPage() {
  const { documents, folders } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/buscar' })
  const allFolders = authedRoute.useLoaderData()
  const spaces = allFolders.filter((f) => f.parent_id === null)

  const update = (patch: Partial<SearchParams>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }) })

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="mb-4 text-xl font-display text-foreground">Buscar</h1>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          key={search.q}
          defaultValue={search.q}
          placeholder="Busca en el título y en el contenido de los documentos…"
          className="pl-9"
          onKeyDown={(e) =>
            e.key === 'Enter' && update({ q: e.currentTarget.value.trim() })
          }
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <ChoiceSelect<string>
          ariaLabel="Espacio"
          className="w-52"
          value={search.folder ?? 'all'}
          onChange={(value) =>
            update({ folder: value === 'all' ? undefined : value })
          }
          options={[
            { value: 'all', label: 'Todos los espacios' },
            ...spaces.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <ChoiceSelect<string>
          ariaLabel="Estado"
          className="w-44"
          value={search.estado ?? 'all'}
          onChange={(value) =>
            update({ estado: DOC_STATUSES.find((s) => s === value) })
          }
          options={[
            { value: 'all', label: 'Cualquier estado' },
            ...DOC_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        {search.etiqueta && (
          <button
            type="button"
            onClick={() => update({ etiqueta: undefined })}
            className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/70"
          >
            Etiqueta: {search.etiqueta} ✕
          </button>
        )}
      </div>

      {folders.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              to="/documentos/$folderId"
              params={{ folderId: folder.id }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-secondary"
            >
              📁 {folder.name}
            </Link>
          ))}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {search.q || search.estado || search.etiqueta || search.folder
            ? 'Sin resultados. Prueba con otras palabras o quita algún filtro.'
            : 'Escribe algo para buscar.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                to="/documentos/doc/$docId"
                params={{ docId: doc.id }}
                className="block px-4 py-3 hover:bg-secondary/60"
              >
                <div className="flex items-center gap-2">
                  <FileText className="size-4 flex-none text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {doc.title}
                  </span>
                  <StatusBadge status={doc.status} className="flex-none" />
                  {doc.due_date && (
                    <span
                      className={cn(
                        'flex-none text-xs',
                        isOverdue(doc.due_date)
                          ? 'font-medium text-destructive'
                          : 'text-muted-foreground',
                      )}
                    >
                      Vence {formatDueDate(doc.due_date)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 pl-6 text-xs text-muted-foreground">
                  {doc.folder_path}
                </div>
                {doc.snippet && (
                  <p className="mt-1 pl-6 text-sm text-muted-foreground">
                    {doc.snippet.before}
                    <mark className="rounded-md bg-accent px-0.5 font-medium text-foreground">
                      {doc.snippet.match}
                    </mark>
                    {doc.snippet.after}
                  </p>
                )}
                {doc.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
