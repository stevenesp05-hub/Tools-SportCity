import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  ChevronRight,
  Copy,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ROLES,
  ROLE_LABELS,
  effectiveVisibleRoles,
  toVisibleRoles,
} from '#/lib/permissions'
import type { Role } from '#/lib/permissions'
import { deleteDocuments, deleteFolder, renameFolder } from '#/server/documents'
import { importDocument } from '#/server/import'
import { downloadFile } from '#/lib/download'
import type { DocumentSummary, FolderRow } from '#/server/documents'
import {
  duplicateDocument,
  moveDocuments,
  moveFolder,
  renameDocument,
  toggleFavorite,
  updateFolderAccess,
} from '#/server/library'
import { MoveDialog } from '#/components/documents/MoveDialog'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Checkbox } from '#/components/ui/checkbox'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { useDialogs } from '#/components/ui/dialogs'
import { NewDocumentDialog } from '#/components/documents/NewDocumentDialog'
import {
  DocumentGrid,
  DocumentList,
} from '#/components/documents/DocumentViews'
import { QuickLookDialog } from '#/components/documents/QuickLookDialog'
import { EmptyFolder } from '#/components/documents/EmptyFolder'
import type { DocTheme } from '#/lib/doc-themes'
import { cn } from '#/lib/utils'

type TemplateRow = {
  id: string
  name: string
  folder_id: string | null
  description: string | null
}
type SortKey = 'name' | 'date'
type ViewMode = 'list' | 'grid'

export function FolderBrowser({
  folders,
  documents,
  loadTemplates,
  currentFolderId,
  canCreate,
  canEdit = false,
  canDelete = false,
  canManageAccess,
  embedded = false,
  topSlot,
  onCreateFolder,
  onCreateDocument,
}: {
  folders: FolderRow[]
  documents: DocumentSummary[]
  /** Carga las plantillas aplicables a esta carpeta; se llama al abrir "Nuevo documento", no antes. */
  loadTemplates?: () => Promise<TemplateRow[]>
  currentFolderId: string | null
  canCreate: boolean
  canEdit?: boolean
  canDelete?: boolean
  canManageAccess: boolean
  embedded?: boolean
  topSlot?: ReactNode
  onCreateFolder: (name: string, visibleRoles: Role[] | null) => Promise<void>
  onCreateDocument?: (
    title: string,
    templateId: string | null,
    variables: Record<string, string>,
    theme: DocTheme,
  ) => Promise<void>
}) {
  const router = useRouter()
  const { confirm, prompt } = useDialogs()
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])

  const breadcrumb = useMemo(() => {
    const chain: FolderRow[] = []
    let cursor = currentFolderId
    while (cursor) {
      const folder = byId.get(cursor)
      if (!folder) break
      chain.unshift(folder)
      cursor = folder.parent_id
    }
    return chain
  }, [byId, currentFolderId])
  const currentFolder = breadcrumb.at(-1) ?? null

  const [sort, setSort] = useState<SortKey>('name')
  const [view, setView] = useState<ViewMode>('list')
  useEffect(() => {
    try {
      const savedSort = localStorage.getItem('sc.sort')
      const savedView = localStorage.getItem('sc.view')
      if (savedSort === 'name' || savedSort === 'date') setSort(savedSort)
      if (savedView === 'list' || savedView === 'grid') setView(savedView)
    } catch {
      /* sin almacenamiento local: se usan los valores por defecto */
    }
  }, [])
  function changeSort(next: SortKey) {
    setSort(next)
    try {
      localStorage.setItem('sc.sort', next)
    } catch {
      /* ignorar */
    }
  }
  function changeView(next: ViewMode) {
    setView(next)
    try {
      localStorage.setItem('sc.view', next)
    } catch {
      /* ignorar */
    }
  }

  const subfolders = useMemo(() => {
    const list = folders.filter((f) => f.parent_id === currentFolderId)
    return list.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [folders, currentFolderId])

  // Número de subcarpetas de cada carpeta (una sola pasada en vez de un filter por tarjeta).
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of folders)
      if (f.parent_id)
        counts.set(f.parent_id, (counts.get(f.parent_id) ?? 0) + 1)
    return counts
  }, [folders])

  const sortedDocuments = useMemo(() => {
    const list = [...documents]
    if (sort === 'name')
      list.sort((a, b) => a.title.localeCompare(b.title, 'es'))
    else list.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return list
  }, [documents, sort])

  // ---------- selección múltiple ----------
  const [quickDoc, setQuickDoc] = useState<DocumentSummary | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [currentFolderId, documents])
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------- diálogos ----------
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [allowedRoles, setAllowedRoles] = useState<Role[] | null>(null)
  const [accessFolder, setAccessFolder] = useState<{
    folder: FolderRow
    roles: Role[] | null
    includeSubfolders: boolean
  } | null>(null)
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [templateCache, setTemplateCache] = useState<{
    folderId: string | null
    list: TemplateRow[]
  } | null>(null)
  const templatesRequested = useRef<string | null | undefined>(undefined)
  // Las plantillas se piden una sola vez por carpeta, al acercarse al botón o abrir el diálogo.
  function ensureTemplates() {
    if (!loadTemplates || templatesRequested.current === currentFolderId) return
    templatesRequested.current = currentFolderId
    const requestedFor = currentFolderId
    loadTemplates()
      .then((list) => setTemplateCache({ folderId: requestedFor, list }))
      .catch(() => {
        templatesRequested.current = undefined
      })
  }
  const [moveTarget, setMoveTarget] = useState<
    { kind: 'documents'; ids: string[] } | { kind: 'folder'; id: string } | null
  >(null)

  // Una subcarpeta parte con la misma audiencia que la carpeta donde se crea.
  const parentRoles = currentFolderId
    ? (byId.get(currentFolderId)?.visible_roles ?? null)
    : null
  useEffect(() => {
    if (folderDialogOpen) setAllowedRoles(parentRoles)
  }, [folderDialogOpen, parentRoles])

  function toggleRole(role: Role) {
    if (role === 'admin') return
    setAllowedRoles((prev) => {
      const current = effectiveVisibleRoles(prev)
      return toVisibleRoles(
        current.includes(role)
          ? current.filter((r) => r !== role)
          : [...current, role],
      )
    })
  }

  async function run(action: () => Promise<unknown>, success?: string) {
    try {
      await action()
      await router.invalidate()
      if (success) toast.success(success)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo completar la acción',
      )
    }
  }

  async function handleCreateFolder() {
    if (!folderName.trim()) return
    setSaving(true)
    try {
      await onCreateFolder(folderName.trim(), allowedRoles)
      setFolderName('')
      setAllowedRoles(null)
      setFolderDialogOpen(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo crear la carpeta',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateDocument(
    title: string,
    templateId: string | null,
    variables: Record<string, string>,
    theme: DocTheme,
  ) {
    if (!title || !onCreateDocument) return
    setSaving(true)
    try {
      await onCreateDocument(title, templateId, variables, theme)
      setDocDialogOpen(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo crear el documento',
      )
    } finally {
      setSaving(false)
    }
  }

  async function renameFolderPrompt(folder: FolderRow) {
    const name = await prompt({
      title: 'Renombrar carpeta',
      label: 'Nombre',
      defaultValue: folder.name,
      confirmLabel: 'Renombrar',
    })
    if (name && name !== folder.name) {
      await run(
        () => renameFolder({ data: { id: folder.id, name } }),
        'Carpeta renombrada',
      )
    }
  }

  async function deleteFolderConfirm(folder: FolderRow) {
    const ok = await confirm({
      title: `¿Eliminar la carpeta "${folder.name}"?`,
      description: 'Solo se puede eliminar si está vacía.',
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    await run(async () => {
      await deleteFolder({ data: { id: folder.id } })
      if (folder.id === currentFolderId) {
        await router.navigate(
          folder.parent_id
            ? {
                to: '/documentos/$folderId',
                params: { folderId: folder.parent_id },
              }
            : { to: '/documentos' },
        )
      }
    }, 'Carpeta eliminada')
  }

  async function renameDocPrompt(doc: DocumentSummary) {
    const title = await prompt({
      title: 'Renombrar documento',
      label: 'Título',
      defaultValue: doc.title,
      confirmLabel: 'Renombrar',
    })
    if (title && title !== doc.title) {
      await run(
        () => renameDocument({ data: { id: doc.id, title } }),
        'Documento renombrado',
      )
    }
  }

  async function deleteDocsConfirm(ids: string[]) {
    const label =
      ids.length === 1 ? 'este documento' : `${ids.length} documentos`
    const ok = await confirm({
      title: `¿Enviar ${label} a la papelera?`,
      description: 'Podrás restaurarlos desde la papelera.',
      confirmLabel: 'Enviar a la papelera',
      destructive: true,
    })
    if (!ok) return
    await run(() => deleteDocuments({ data: { ids } }), 'Enviado a la papelera')
  }

  function duplicateDoc(doc: DocumentSummary) {
    void run(
      () => duplicateDocument({ data: { id: doc.id } }),
      'Documento duplicado',
    )
  }

  function toggleFav(doc: DocumentSummary) {
    void run(() =>
      toggleFavorite({
        data: { documentId: doc.id, favorite: !doc.is_favorite },
      }),
    )
  }

  const docMenu = (doc: DocumentSummary) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Acciones"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => toggleFav(doc)}>
          <Star className="size-4" />
          {doc.is_favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem
            onSelect={() =>
              void router.navigate({
                to: '/documentos/doc/$docId',
                params: { docId: doc.id },
                search: { editar: true },
              })
            }
          >
            <Pencil className="size-4" />
            Editar contenido
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={() => renameDocPrompt(doc)}>
            <Pencil className="size-4" />
            Renombrar
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem
            onSelect={() => setMoveTarget({ kind: 'documents', ids: [doc.id] })}
          >
            <FolderInput className="size-4" />
            Mover a…
          </DropdownMenuItem>
        )}
        {canCreate && (
          <DropdownMenuItem onSelect={() => duplicateDoc(doc)}>
            <Copy className="size-4" />
            Duplicar
          </DropdownMenuItem>
        )}
        {canDelete && <DropdownMenuSeparator />}
        {canDelete && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => deleteDocsConfirm([doc.id])}
          >
            <Trash2 className="size-4" />
            Enviar a la papelera
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const folderMenu = (folder: FolderRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Acciones de carpeta"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => renameFolderPrompt(folder)}
          disabled={!canEdit}
        >
          <Pencil className="size-4" />
          Renombrar
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setMoveTarget({ kind: 'folder', id: folder.id })}
          disabled={!canEdit}
        >
          <FolderInput className="size-4" />
          Mover a…
        </DropdownMenuItem>
        {canManageAccess && (
          <DropdownMenuItem
            onSelect={() =>
              setAccessFolder({
                folder,
                roles: folder.visible_roles,
                includeSubfolders: true,
              })
            }
          >
            <Lock className="size-4" />
            Acceso…
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => deleteFolderConfirm(folder)}
          >
            <Trash2 className="size-4" />
            Eliminar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // ---------- importar ----------
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState<{
    done: number
    total: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  async function importFiles(files: File[]) {
    if (!currentFolderId || files.length === 0 || importing) return
    setImporting({ done: 0, total: files.length })
    let lastId: string | null = null
    let ok = 0
    let images = 0
    let dropped = 0
    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folderId', currentFolderId)
        const result = await importDocument({ data: formData })
        lastId = result.id
        ok += 1
        images += result.images
        dropped += result.droppedImages
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : `No se pudo importar ${file.name}`,
        )
      }
      setImporting((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }
    setImporting(null)
    if (ok > 0) {
      toast.success(
        ok === 1 ? 'Documento importado' : `${ok} documentos importados`,
        {
          description:
            dropped > 0
              ? `${dropped} imagen(es) no se pudieron importar (formato no admitido o de más de 5 MB).`
              : images > 0
                ? `${images} imagen(es) incluidas.`
                : undefined,
        },
      )
      if (ok === 1 && files.length === 1 && lastId)
        await router.navigate({
          to: '/documentos/doc/$docId',
          params: { docId: lastId },
        })
      else await router.invalidate()
    }
  }

  const canImport = canCreate && currentFolderId !== null && !embedded

  return (
    <div
      className={cn(
        embedded ? undefined : 'relative mx-auto max-w-5xl px-8 py-8',
      )}
      onDragOver={(event) => {
        if (!canImport || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false)
      }}
      onDrop={(event) => {
        if (!canImport) return
        event.preventDefault()
        setDragging(false)
        void importFiles([...event.dataTransfer.files])
      }}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 text-lg font-display text-primary backdrop-blur-sm">
          Suelta los archivos para importarlos (.docx, .html, .md, .txt)
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <h2 className="text-sm font-display uppercase tracking-wide text-muted-foreground">
            Documentos y archivos
          </h2>
        ) : (
          <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Link
              to="/documentos"
              className="rounded-md px-1.5 py-0.5 font-medium hover:bg-secondary hover:text-foreground"
            >
              Inicio
            </Link>

            {breadcrumb.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5" />
                <Link
                  to="/documentos/$folderId"
                  params={{ folderId: folder.id }}
                  className="rounded-md px-1.5 py-0.5 font-medium hover:bg-secondary hover:text-foreground [&.is-active]:text-foreground"
                  activeProps={{ className: 'is-active' }}
                >
                  {folder.name}
                </Link>
              </span>
            ))}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {currentFolder && !embedded && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  title="Descargar carpeta"
                  aria-label="Descargar carpeta"
                >
                  <Download className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    void downloadFile(
                      `/api/carpetas/${currentFolder.id}/zip?formato=docx`,
                      {
                        fallbackName: `${currentFolder.name}.zip`,
                        loading: 'Preparando el ZIP…',
                      },
                    )
                  }
                >
                  Toda la carpeta en Word (.zip)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void downloadFile(
                      `/api/carpetas/${currentFolder.id}/zip?formato=html`,
                      {
                        fallbackName: `${currentFolder.name}.zip`,
                        loading: 'Preparando el ZIP…',
                      },
                    )
                  }
                >
                  Toda la carpeta en HTML (.zip)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {currentFolder && !embedded && (canEdit || canDelete) && (
            <>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  title="Renombrar carpeta"
                  onClick={() => renameFolderPrompt(currentFolder)}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  title="Eliminar carpeta (debe estar vacía)"
                  onClick={() => deleteFolderConfirm(currentFolder)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
          )}

          {canCreate && (
            <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderPlus className="size-4" />
                  Nueva carpeta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva carpeta</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="folder-name">Nombre</Label>
                  <Input
                    id="folder-name"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                </div>
                {canManageAccess && (
                  <div className="space-y-1.5">
                    <Label>Visible para</Label>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {ROLES.map((role) => (
                        <label
                          key={role}
                          className="flex items-center gap-1.5 text-sm text-foreground"
                        >
                          <Checkbox
                            checked={effectiveVisibleRoles(
                              allowedRoles,
                            ).includes(role)}
                            disabled={role === 'admin'}
                            onCheckedChange={() => toggleRole(role)}
                          />
                          {ROLE_LABELS[role]}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Administración siempre la ve. Recepción la ve por defecto.
                      Marca Profesor para darle acceso a esta carpeta.
                    </p>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleCreateFolder}
                    disabled={saving || !folderName.trim()}
                  >
                    Crear
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canImport && (
            <>
              <input
                ref={importInputRef}
                type="file"
                multiple
                accept=".docx,.html,.htm,.md,.markdown,.txt"
                className="hidden"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])]
                  event.target.value = ''
                  void importFiles(files)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing !== null}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="size-4" />
                {importing
                  ? `Importando ${importing.done + 1} de ${importing.total}…`
                  : 'Importar'}
              </Button>
            </>
          )}

          {canCreate && onCreateDocument && (
            <>
              <Button
                onClick={() => {
                  ensureTemplates()
                  setDocDialogOpen(true)
                }}
                onPointerEnter={ensureTemplates}
                onFocus={ensureTemplates}
                size="sm"
              >
                <Plus className="size-4" />
                Nuevo documento
              </Button>
              <NewDocumentDialog
                open={docDialogOpen}
                onOpenChange={setDocDialogOpen}
                templates={
                  templateCache?.folderId === currentFolderId
                    ? templateCache.list
                    : []
                }
                saving={saving}
                folderName={currentFolder?.name ?? 'Documento'}
                onCreate={handleCreateDocument}
              />
            </>
          )}
        </div>
      </div>

      {topSlot}

      {subfolders.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {subfolders.map((folder) => {
            const children = childCounts.get(folder.id) ?? 0
            return (
              <div
                key={folder.id}
                className="group relative flex items-center rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <Link
                  to="/documentos/$folderId"
                  params={{ folderId: folder.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3.5"
                >
                  <FolderTile />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {folder.name}
                    </span>
                    <span className="block text-2xs text-muted-foreground">
                      {children > 0
                        ? `${children} ${children === 1 ? 'subcarpeta' : 'subcarpetas'}`
                        : 'Carpeta'}
                    </span>
                  </span>
                  {folder.visible_roles && (
                    <Lock className="size-3.5 flex-none text-muted-foreground" />
                  )}
                </Link>
                {(canEdit || canDelete) && (
                  <div className="pr-1.5">{folderMenu(folder)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {onCreateDocument && (
        <>
          <div className="mb-3 flex items-center justify-between">
            {selected.size > 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {selected.size} seleccionados
                </span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() =>
                      setMoveTarget({ kind: 'documents', ids: [...selected] })
                    }
                  >
                    <FolderInput className="size-4" />
                    Mover
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive"
                    onClick={() => deleteDocsConfirm([...selected])}
                  >
                    <Trash2 className="size-4" />
                    Papelera
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setSelected(new Set())}
                  aria-label="Limpiar selección"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {documents.length}{' '}
                {documents.length === 1 ? 'documento' : 'documentos'}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <ChoiceSelect<SortKey>
                ariaLabel="Ordenar"
                className="w-36"
                value={sort}
                onChange={changeSort}
                options={[
                  { value: 'name', label: 'Nombre' },
                  { value: 'date', label: 'Más recientes' },
                ]}
              />
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                onClick={() => changeView('list')}
                aria-label="Vista de lista"
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                onClick={() => changeView('grid')}
                aria-label="Vista de cuadrícula"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
          </div>

          {sortedDocuments.length === 0 ? (
            <EmptyFolder
              canCreate={canCreate}
              canImport={canImport}
              onNew={() => setDocDialogOpen(true)}
              onImport={() => importInputRef.current?.click()}
            />
          ) : view === 'list' ? (
            <DocumentList
              docs={sortedDocuments}
              selected={selected}
              onToggleSelect={toggleSelected}
              onToggleFav={toggleFav}
              onQuickLook={setQuickDoc}
              renderMenu={docMenu}
              canEdit={canEdit}
              sort={sort}
              onSort={changeSort}
            />
          ) : (
            <DocumentGrid
              docs={sortedDocuments}
              selected={selected}
              onToggleSelect={toggleSelected}
              onToggleFav={toggleFav}
              onQuickLook={setQuickDoc}
              renderMenu={docMenu}
              canEdit={canEdit}
            />
          )}
        </>
      )}

      {subfolders.length === 0 && !onCreateDocument && (
        <p className="text-sm text-muted-foreground">
          {canCreate
            ? 'Todavía no hay carpetas.'
            : 'No tienes carpetas disponibles todavía. Un administrador debe darte acceso.'}
        </p>
      )}

      <Dialog
        open={accessFolder !== null}
        onOpenChange={(open) => !open && setAccessFolder(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Quién ve «{accessFolder?.folder.name}»?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-1.5 text-sm text-foreground"
              >
                <Checkbox
                  checked={effectiveVisibleRoles(
                    accessFolder?.roles ?? null,
                  ).includes(role)}
                  disabled={role === 'admin'}
                  onCheckedChange={() =>
                    setAccessFolder((prev) => {
                      if (!prev || role === 'admin') return prev
                      const current = effectiveVisibleRoles(prev.roles)
                      return {
                        ...prev,
                        roles: toVisibleRoles(
                          current.includes(role)
                            ? current.filter((r) => r !== role)
                            : [...current, role],
                        ),
                      }
                    })
                  }
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Administración siempre la ve. Recepción la ve por defecto. El
            Profesor solo ve las carpetas donde lo marcas.
          </p>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <Checkbox
              checked={accessFolder?.includeSubfolders ?? false}
              onCheckedChange={(v) =>
                setAccessFolder((prev) =>
                  prev ? { ...prev, includeSubfolders: v === true } : prev,
                )
              }
            />
            Aplicar también a las subcarpetas
          </label>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (!accessFolder) return
                const { folder, roles, includeSubfolders } = accessFolder
                setAccessFolder(null)
                await run(
                  () =>
                    updateFolderAccess({
                      data: {
                        id: folder.id,
                        visibleRoles: roles,
                        includeSubfolders,
                      },
                    }),
                  'Acceso actualizado',
                )
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickLookDialog
        doc={quickDoc}
        canEdit={canEdit}
        onClose={() => setQuickDoc(null)}
      />

      <MoveDialog
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        title={moveTarget?.kind === 'folder' ? 'Mover carpeta a…' : 'Mover a…'}
        folders={folders}
        excludeIds={moveTarget?.kind === 'folder' ? [moveTarget.id] : []}
        allowRoot={moveTarget?.kind === 'folder'}
        currentId={currentFolderId}
        onConfirm={async (folderId) => {
          if (!moveTarget) return
          try {
            if (moveTarget.kind === 'folder') {
              await moveFolder({
                data: { id: moveTarget.id, parentId: folderId },
              })
            } else if (folderId) {
              await moveDocuments({ data: { ids: moveTarget.ids, folderId } })
            }
            await router.invalidate()
            toast.success('Movido')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo mover')
            throw err
          }
        }}
      />
    </div>
  )
}

/** Icono de carpeta: uno solo y neutro, sin colores ni símbolos por tipo. */
function FolderTile() {
  return (
    <Folder
      className="size-5 flex-none text-muted-foreground transition-colors group-hover:text-primary"
      strokeWidth={1.75}
    />
  )
}
