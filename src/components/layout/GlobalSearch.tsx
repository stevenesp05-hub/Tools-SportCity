import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText, Folder, Search } from 'lucide-react'
import { quickSearch } from '#/server/search'
import type { DocumentHit, FolderHit } from '#/server/search'
import { Input } from '#/components/ui/input'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [documents, setDocuments] = useState<DocumentHit[]>([])
  const [folders, setFolders] = useState<FolderHit[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (query.trim().length < 2) {
      setDocuments([])
      setFolders([])
      return
    }
    // Si se sigue escribiendo, la respuesta de la búsqueda anterior se descarta.
    let stale = false
    const timeout = setTimeout(() => {
      quickSearch({ data: { query } })
        .then((result) => {
          if (stale) return
          setDocuments(result.documents)
          setFolders(result.folders)
          setOpen(true)
        })
        .catch(() => {
          if (stale) return
          setDocuments([])
          setFolders([])
        })
    }, 250)
    return () => {
      stale = true
      clearTimeout(timeout)
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function seeAll() {
    const q = query.trim()
    if (!q) return
    close()
    void navigate({ to: '/buscar', search: { q } })
  }

  const hasResults = documents.length > 0 || folders.length > 0

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hasResults && setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && seeAll()}
        placeholder="Buscar en documentos y carpetas…"
        className="pl-9"
      />
      {open && hasResults && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <ul className="max-h-96 overflow-auto py-1">
            {folders.map((folder) => (
              <li key={`f-${folder.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    void navigate({
                      to: '/documentos/$folderId',
                      params: { folderId: folder.id },
                    })
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <Folder className="size-4 flex-none text-muted-foreground" />
                  <span className="flex-1 truncate text-foreground">
                    {folder.name}
                  </span>
                  <span className="text-xs text-muted-foreground">Carpeta</span>
                </button>
              </li>
            ))}
            {documents.map((doc) => (
              <li key={`d-${doc.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    void navigate({
                      to: '/documentos/doc/$docId',
                      params: { docId: doc.id },
                    })
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <FileText className="mt-0.5 size-4 flex-none text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {doc.title}
                    </span>
                    {doc.snippet ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {doc.snippet.before}
                        <mark className="rounded-md bg-accent px-0.5 text-foreground">
                          {doc.snippet.match}
                        </mark>
                        {doc.snippet.after}
                      </span>
                    ) : (
                      <span className="block truncate text-xs text-muted-foreground">
                        {doc.folder_path}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={seeAll}
            className="w-full border-t border-border px-3 py-2 text-left text-xs font-medium text-primary hover:bg-secondary"
          >
            Ver todos los resultados para "{query.trim()}"
          </button>
        </div>
      )}
    </div>
  )
}
