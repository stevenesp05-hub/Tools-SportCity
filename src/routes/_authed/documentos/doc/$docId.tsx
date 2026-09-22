import { createFileRoute, useBlocker, useRouter } from '@tanstack/react-router'
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Editor, JSONContent } from '@tiptap/react'
import {
  Maximize2,
  Minimize2,
  PanelRight,
  Pencil,
  Save,
  Users,
  RefreshCw,
  FileClock,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getDocument,
  saveDocumentVersion,
  createTemplateFromDocument,
  deleteDocument,
  getLatestVersion,
} from '#/server/documents'
import type { CurrentVersionInfo, DocumentDetail } from '#/server/documents'
import {
  addComment,
  listBacklinks,
  listComments,
  recordView,
  toggleFavorite,
} from '#/server/library'
import type { DocumentComment, DocumentLinkTarget } from '#/server/library'
import { listReviews } from '#/server/reviews'
import type { DocumentReview } from '#/server/reviews'
import {
  discardDraft,
  getDocumentExtras,
  setDocumentTheme,
} from '#/server/drafts'
import {
  clearLocalDraft,
  readLocalDraft,
  useAutosave,
} from '#/components/documents/useAutosave'
import type {
  AutosaveState,
  LocalDraft,
} from '#/components/documents/useAutosave'
import { THEME_INFO } from '#/lib/doc-themes'
import type { DocTheme } from '#/lib/doc-themes'
import { printDocument } from '#/lib/download'
import { timeAgo } from '#/lib/format'
import { hasPermission } from '#/lib/permissions'
import { DocumentEditor } from '#/components/documents/DocumentEditor'
import { Toolbar } from '#/components/documents/EditorToolbar'
import { revealText } from '#/components/documents/editor-extras'
import { DocumentMetaBar } from '#/components/documents/DocumentMetaBar'
import { DocumentComments } from '#/components/documents/DocumentComments'
import { DocumentHeader } from '#/components/documents/DocumentHeader'
import { DocumentMenuBar } from '#/components/documents/DocumentMenuBar'
import { DocumentSidebar } from '#/components/documents/DocumentSidebar'
import {
  RequestReviewDialog,
  ReviewBanners,
} from '#/components/documents/ReviewPanel'
import { useDocumentPresence } from '#/components/documents/useDocumentPresence'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { ChoiceSelect } from '#/components/ui/choice-select'
import { useDialogs } from '#/components/ui/dialogs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

// Diálogos que solo se abren por una acción: se descargan al usarlos por primera vez, no con la página
// (el historial y el conflicto arrastran `diff`; la vista previa y las comprobaciones, bastante código).
// RequestReviewDialog comparte módulo con los avisos de revisión, que sí se pintan siempre: no se separa.
const PdfPreviewDialog = lazy(() =>
  import('#/components/documents/PdfPreviewDialog').then((m) => ({
    default: m.PdfPreviewDialog,
  })),
)
const DocumentChecksDialog = lazy(() =>
  import('#/components/documents/DocumentChecksDialog').then((m) => ({
    default: m.DocumentChecksDialog,
  })),
)
const VersionHistory = lazy(() =>
  import('#/components/documents/VersionHistory').then((m) => ({
    default: m.VersionHistory,
  })),
)
const ShareDialog = lazy(() =>
  import('#/components/documents/ShareDialog').then((m) => ({
    default: m.ShareDialog,
  })),
)
const CommentDialog = lazy(() =>
  import('#/components/documents/CommentDialog').then((m) => ({
    default: m.CommentDialog,
  })),
)
const SaveConflictDialog = lazy(() =>
  import('#/components/documents/SaveConflictDialog').then((m) => ({
    default: m.SaveConflictDialog,
  })),
)

export const Route = createFileRoute('/_authed/documentos/doc/$docId')({
  validateSearch: (search: Record<string, unknown>): { editar?: boolean } =>
    search.editar === true || search.editar === 'true' || search.editar === 1
      ? { editar: true }
      : {},
  // Solo lo imprescindible para pintar. Comentarios, revisiones, enlaces entrantes y borrador se piden
  // después del primer pintado (`useDeferred`): el más lento ya no retrasa el documento.
  loader: ({ params }) => getDocument({ data: { id: params.docId } }),
  component: DocumentPage,
})

const NO_REVIEWS: DocumentReview[] = []
const NO_BACKLINKS: DocumentLinkTarget[] = []
const NO_COMMENTS: DocumentComment[] = []
const NO_EXTRAS: Awaited<ReturnType<typeof getDocumentExtras>> = {
  draft: null,
  draftsSupported: false,
}

/** Función estable que siempre ejecuta la última versión de `fn` (para no repintar hijos memorizados). */
function useEvent<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
) {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: TArgs) => ref.current(...args), [])
}

/** `true` desde la primera vez que `value` es verdadero: monta un diálogo diferido sin perder su animación de cierre. */
function useEverTrue(value: boolean) {
  const [ever, setEver] = useState(value)
  if (value && !ever) setEver(true)
  return ever || value
}

/**
 * Datos que llegan después del primer pintado. `null` mientras se cargan; `reload` los vuelve a pedir
 * (tras una acción del usuario) y `update` los cambia al instante sin pasar por el servidor.
 */
function useDeferred<T>(
  key: string,
  load: () => Promise<T>,
  fallback: T,
  errorMessage?: string,
) {
  const [state, setState] = useState<{ key: string; value: T } | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const ticket = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++ticket.current
    try {
      const value = await loadRef.current()
      if (mine === ticket.current) setState({ key, value })
    } catch {
      if (mine !== ticket.current) return
      if (errorMessage) toast.error(errorMessage)
      setState((prev) => (prev?.key === key ? prev : { key, value: fallback }))
    }
    // `fallback` y `errorMessage` son constantes de quien llama.
  }, [key])
  useEffect(() => {
    void reload()
  }, [reload])
  const update = useCallback(
    (change: (prev: T) => T) =>
      setState((prev) =>
        prev?.key === key ? { key, value: change(prev.value) } : prev,
      ),
    [key],
  )
  return { value: state?.key === key ? state.value : null, reload, update }
}

function editorsLabel(names: string[]) {
  if (names.length === 1) return `${names[0]} está`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]} están`
}

function DocumentPage() {
  const { docId } = Route.useParams()
  const { editar } = Route.useSearch()
  const { document, versions } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const { confirm } = useDialogs()
  const canEdit = hasPermission(user?.role, 'tools.documentos.editar')
  const canDelete = hasPermission(user?.role, 'tools.documentos.eliminar')
  const canApprove = hasPermission(user?.role, 'tools.documentos.aprobar')
  const canComment = hasPermission(user?.role, 'tools.documentos.comentar')
  const canManageAccess = hasPermission(
    user?.role,
    'tools.admin.gestionar_acceso',
  )

  // Vuelve a pedir solo este documento (versiones, fecha, estado), en segundo plano y sin tocar el resto de rutas.
  const invalidateDoc = useCallback(
    () => router.invalidate({ filter: (match) => match.routeId === Route.id }),
    [router],
  )

  // Datos secundarios: llegan después del primer pintado, cada uno por su lado.
  const comments = useDeferred(
    docId,
    () => listComments({ data: { documentId: docId } }),
    NO_COMMENTS,
    'No se pudieron cargar los comentarios',
  )
  // La versión actual ya viaja con el documento: solo la primera carga evita releerla; después la lee el servidor.
  const versionHint = useRef<string | null>(null)
  const reviews = useDeferred(
    docId,
    () => {
      const hint =
        versionHint.current === docId
          ? undefined
          : (document.current_version?.id ?? null)
      versionHint.current = docId
      return listReviews({
        data: { documentId: docId, currentVersionId: hint },
      })
    },
    NO_REVIEWS,
  )
  const backlinks = useDeferred(
    docId,
    () => listBacklinks({ data: { documentId: docId } }),
    NO_BACKLINKS,
  )
  const extras = useDeferred(
    docId,
    () => getDocumentExtras({ data: { documentId: docId } }),
    NO_EXTRAS,
  )
  const draftInfo = extras.value ?? NO_EXTRAS

  // Cambios locales sobre el documento (estado, fecha, etiquetas, favorito, tema…): se ven al instante y valen
  // hasta que el servidor devuelve el documento de nuevo.
  const documentRef = useRef(document)
  documentRef.current = document
  const [patch, setPatch] = useState<{
    base: DocumentDetail
    values: Partial<DocumentDetail>
  }>({ base: document, values: {} })
  const doc = useMemo(
    () =>
      patch.base === document ? { ...document, ...patch.values } : document,
    [document, patch],
  )
  const patchDocument = useCallback((values: Partial<DocumentDetail>) => {
    setPatch((prev) => ({
      base: documentRef.current,
      values:
        prev.base === documentRef.current
          ? { ...prev.values, ...values }
          : values,
    }))
  }, [])

  const [title, setTitle] = useState(document.title)
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [checksOpen, setChecksOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [focus, setFocus] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const [showComments, setShowComments] = useState(true)
  const [outlineHost, setOutlineHost] = useState<HTMLDivElement | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  const [editing, setEditing] = useState(Boolean(editar) && canEdit)
  const [dirty, setDirty] = useState(false)
  const emptyContent = { type: 'doc', content: [{ type: 'paragraph' }] }
  const [initial, setInitial] = useState({
    key: 0,
    content: document.current_version?.content ?? emptyContent,
  })
  const savedContentRef = useRef(initial.content)
  const [baseVersionId, setBaseVersionId] = useState<string | null>(
    document.current_version?.id ?? null,
  )
  const [conflict, setConflict] = useState<CurrentVersionInfo | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [commentQuote, setCommentQuote] = useState<string | null>(null)
  const presence = useDocumentPresence(docId, editing)
  const newVersionAvailable =
    presence.latestVersionId !== null &&
    presence.latestVersionId !== baseVersionId

  // Diálogos diferidos: se montan al abrirlos por primera vez.
  const shareMounted = useEverTrue(shareOpen)
  const reviewMounted = useEverTrue(reviewOpen)
  const commentMounted = useEverTrue(commentQuote !== null)
  const previewMounted = useEverTrue(previewOpen)
  const checksMounted = useEverTrue(checksOpen)
  const historyMounted = useEverTrue(historyOpen)

  const [draft, setDraft] = useState<
    (LocalDraft & { source: 'servidor' | 'navegador' }) | null
  >(null)
  const theme = doc.theme
  const changeTheme = useEvent(async (next: DocTheme) => {
    const previous = theme
    patchDocument({ theme: next })
    try {
      await setDocumentTheme({ data: { documentId: docId, theme: next } })
    } catch (err) {
      patchDocument({ theme: previous })
      toast.error(
        err instanceof Error ? err.message : 'No se pudo cambiar el tema',
      )
    }
  })
  const titleRef = useRef(title)
  titleRef.current = title
  const getTitle = useCallback(() => titleRef.current, [])
  const baseRef = useRef(baseVersionId)
  baseRef.current = baseVersionId

  const autosave = useAutosave({
    documentId: docId,
    enabled: editing && canEdit,
    serverEnabled: draftInfo.draftsSupported,
    getSnapshot: () => {
      const editor = editorRef.current
      if (!editor) return null
      return {
        base: baseRef.current,
        title: titleRef.current.trim() || document.title,
        content: editor.getJSON(),
      }
    },
  })

  function clearDraft() {
    setDraft(null)
    clearLocalDraft(docId)
    autosave.reset()
    if (draftInfo.draftsSupported)
      void discardDraft({ data: { documentId: docId } }).catch(() => undefined)
  }

  // Al abrir el documento: ¿quedó un borrador sin guardar (en el servidor o en este navegador)?
  // Se repite cuando llega el borrador del servidor (se pide después del primer pintado).
  useEffect(() => {
    if (!canEdit) return
    const local = readLocalDraft(docId)
    const serverDraft = draftInfo.draft
    const remote = serverDraft
      ? {
          base: serverDraft.baseVersionId,
          title: serverDraft.title,
          content: serverDraft.content,
          at: Date.parse(serverDraft.updatedAt),
        }
      : null
    const newest =
      remote && (!local || remote.at >= local.at)
        ? { ...remote, source: 'servidor' as const }
        : local
          ? { ...local, source: 'navegador' as const }
          : null
    // Un borrador anterior a la última versión guardada ya no aporta nada.
    if (newest && newest.at > Date.parse(document.updated_at)) setDraft(newest)
  }, [docId, canEdit, draftInfo])

  const blocker = useBlocker({
    shouldBlockFn: () => editing && dirty,
    enableBeforeUnload: () => editing && dirty,
    withResolver: true,
  })
  useEffect(() => {
    if (blocker.status !== 'blocked') return
    void confirm({
      title: 'Tienes cambios sin guardar',
      description:
        'Si sales ahora no se guardarán en el documento, aunque queda un borrador en este navegador para recuperarlo.',
      confirmLabel: 'Salir sin guardar',
      destructive: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker.status])

  function restoreDraft() {
    if (!draft) return
    setInitial((prev) => ({ key: prev.key + 1, content: draft.content }))
    setTitle(draft.title)
    setBaseVersionId(draft.base)
    setEditing(true)
    setDirty(true)
    setDraft(null)
  }

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateScope, setTemplateScope] = useState<'folder' | 'global'>(
    'folder',
  )
  const [savingTemplate, setSavingTemplate] = useState(false)

  useEffect(() => {
    void recordView({ data: { documentId: docId } }).catch(() => undefined)
  }, [docId])

  const handleDelete = useEvent(async () => {
    const ok = await confirm({
      title: '¿Enviar este documento a la papelera?',
      description: 'Podrás restaurarlo desde la papelera.',
      confirmLabel: 'Enviar a la papelera',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteDocument({ data: { id: docId } })
      await router.navigate({
        to: '/documentos/$folderId',
        params: { folderId: document.folder_id },
      })
    } catch {
      toast.error('No se pudo eliminar el documento')
    }
  })

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    try {
      await createTemplateFromDocument({
        data: {
          documentId: docId,
          name: templateName.trim(),
          scope: templateScope,
        },
      })
      setTemplateName('')
      setTemplateDialogOpen(false)
      toast.success('Plantilla guardada')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo guardar la plantilla',
      )
    } finally {
      setSavingTemplate(false)
    }
  }

  function adoptVersion(info: CurrentVersionInfo) {
    setInitial((prev) => ({ key: prev.key + 1, content: info.content }))
    savedContentRef.current = info.content
    setBaseVersionId(info.versionId)
    setConflict(null)
    setDirty(false)
  }

  async function handleLoadLatest() {
    try {
      adoptVersion(await getLatestVersion({ data: { documentId: docId } }))
      void invalidateDoc()
      void reviews.reload()
    } catch {
      toast.error('No se pudo cargar la última versión')
    }
  }

  const handleSave = useEvent(async (force: boolean = false): Promise<void> => {
    const editor = editorRef.current
    if (!editor || !title.trim()) return
    setSaving(true)
    try {
      const result = await saveDocumentVersion({
        data: {
          documentId: docId,
          title: title.trim(),
          content: editor.getJSON(),
          contentHtml: editor.getHTML(),
          baseVersionId,
          force,
        },
      })
      if (result.conflict) {
        setConflict(result.current)
        return
      }
      setBaseVersionId(result.versionId)
      savedContentRef.current = editor.getJSON()
      clearDraft()
      setConflict(null)
      setDirty(false)
      setEditing(false)
      toast.success('Documento guardado')
      // El contenido ya está en pantalla: la recarga (versiones, avisos) va en segundo plano.
      void invalidateDoc()
      void reviews.reload()
    } catch {
      toast.error('No se pudo guardar el documento')
    } finally {
      setSaving(false)
    }
  })

  const handleCancelEdit = useEvent(async () => {
    if (dirty) {
      const ok = await confirm({
        title: '¿Descartar los cambios?',
        description: 'Se perderá lo que has escrito desde el último guardado.',
        confirmLabel: 'Descartar',
        destructive: true,
      })
      if (!ok) return
      editorRef.current?.commands.setContent(savedContentRef.current)
      setTitle(document.title)
    }
    clearDraft()
    setDirty(false)
    setEditing(false)
  })

  // Modo enfoque: la aplicación se oculta y queda el documento con su barra mínima.
  useEffect(() => {
    const root = globalThis.document.documentElement
    if (focus) root.dataset.focus = '1'
    else delete root.dataset.focus
    return () => {
      delete root.dataset.focus
    }
  }, [focus])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault()
        setFocus((value) => !value)
      } else if (event.key === 'Escape' && focus) {
        setFocus(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  // Ctrl/Cmd + P imprime el documento con su paginación real (el PDF), no la página de la aplicación.
  useEffect(() => {
    const printNow = () => void printDocument(docId)
    globalThis.document.addEventListener('sc:print', printNow)
    function onPrint(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void printDocument(docId)
      }
    }
    window.addEventListener('keydown', onPrint)
    return () => {
      window.removeEventListener('keydown', onPrint)
      globalThis.document.removeEventListener('sc:print', printNow)
    }
  }, [docId])

  useEffect(() => {
    if (!editing) return
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing, handleSave])

  // Manejadores estables: escribir el título repinta la cabecera, pero no los menús, el panel ni los diálogos.
  const startEditing = useCallback(() => setEditing(true), [])
  const openHistory = useCallback(() => setHistoryOpen(true), [])
  const openShare = useCallback(() => setShareOpen(true), [])
  const openReview = useCallback(() => setReviewOpen(true), [])
  const openTemplate = useCallback(() => setTemplateDialogOpen(true), [])
  const openChecks = useCallback(() => setChecksOpen(true), [])
  const openPreview = useCallback(() => setPreviewOpen(true), [])
  const toggleFocus = useCallback(() => setFocus((value) => !value), [])
  const toggleContinuous = useCallback(
    () => setContinuous((value) => !value),
    [],
  )
  const toggleShowComments = useCallback(
    () => setShowComments((value) => !value),
    [],
  )
  const onSave = useCallback(() => void handleSave(), [handleSave])
  const onCancel = useCallback(
    () => void handleCancelEdit(),
    [handleCancelEdit],
  )
  const onDelete = useCallback(() => void handleDelete(), [handleDelete])
  const onTheme = useCallback(
    (value: DocTheme) => void changeTheme(value),
    [changeTheme],
  )
  const onEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    setEditorInstance(editor)
  }, [])
  const onEditorDirty = useEvent(() => {
    setDirty(true)
    autosave.notifyChange()
  })
  const onTitleChange = useEvent((value: string) => {
    setTitle(value)
    setDirty(true)
    autosave.notifyChange()
  })
  const onToggleFavorite = useEvent(() => {
    const favorite = !doc.is_favorite
    patchDocument({ is_favorite: favorite })
    toggleFavorite({ data: { documentId: docId, favorite } }).catch(() => {
      patchDocument({ is_favorite: !favorite })
      toast.error('No se pudo cambiar el favorito')
    })
  })
  const onReveal = useCallback((quote: string) => {
    if (editorRef.current) revealText(editorRef.current, quote)
  }, [])
  const onReviewChanged = useCallback(async () => {
    // Aprobar cambia también el estado del documento.
    await Promise.all([reviews.reload(), invalidateDoc()])
  }, [reviews.reload, invalidateDoc])
  const onVersionRestored = useEvent(
    (content: JSONContent, versionId: string) => {
      editorRef.current?.commands.setContent(content)
      savedContentRef.current = content
      setBaseVersionId(versionId)
      setDirty(false)
      void invalidateDoc()
      void reviews.reload()
    },
  )
  const closeCommentDialog = useCallback(() => setCommentQuote(null), [])
  const sendCommentOnQuote = useEvent(async (body: string) => {
    await addComment({
      data: { documentId: docId, body, quote: commentQuote ?? undefined },
    })
    await comments.reload()
    setCommentQuote(null)
  })
  const keepMine = useCallback(() => void handleSave(true), [handleSave])
  const loadTheirs = useEvent(() => {
    if (conflict) adoptVersion(conflict)
  })
  const closeConflict = useCallback(() => setConflict(null), [])
  // El HTML del editor solo se lee cuando hay un conflicto que mostrar (no en cada pintado).
  const mineHtml = useMemo(
    () => (conflict ? (editorRef.current?.getHTML() ?? '') : ''),
    [conflict],
  )
  const details = useMemo(
    () => (
      <DocumentMetaBar
        document={doc}
        onChange={patchDocument}
        onRefresh={invalidateDoc}
        canEdit={canEdit}
        canApprove={canApprove}
        canManageAccess={canManageAccess}
      />
    ),
    [doc, patchDocument, invalidateDoc, canEdit, canApprove, canManageAccess],
  )

  return (
    <div className="flex h-full w-full">
      <div className="flex min-w-0 flex-1 flex-col px-4 py-2">
        <DocumentHeader
          folder={{
            id: document.folder_id,
            name: document.folder?.name ?? 'Documentos',
          }}
          title={title}
          editing={editing}
          onTitleChange={onTitleChange}
          status={doc.status}
          isFavorite={doc.is_favorite}
          onToggleFavorite={onToggleFavorite}
          canEdit={canEdit}
          theme={theme}
          version={document.current_version?.version_number ?? null}
          author={
            versions[0]?.profiles?.full_name ??
            versions[0]?.profiles?.email ??
            null
          }
          updatedAt={doc.updated_at}
          editors={presence.editors}
          focus={focus}
          focusToggle={
            <Button
              variant={focus ? 'outline' : 'ghost'}
              size={focus ? 'sm' : 'icon'}
              className={focus ? 'gap-1.5' : 'size-9 max-md:hidden'}
              onClick={toggleFocus}
              aria-label={focus ? 'Salir del modo enfoque' : 'Modo enfoque'}
              title={
                focus
                  ? 'Salir del modo enfoque (Esc)'
                  : 'Modo enfoque (Ctrl+Mayús+F)'
              }
            >
              {focus ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
              {focus && <span className="max-sm:sr-only">Salir</span>}
            </Button>
          }
          saveStatus={
            <SaveStatus
              editing={editing}
              dirty={dirty}
              saving={saving}
              updatedAt={doc.updated_at}
              autosave={autosave.state}
              onRetry={() => void autosave.flush()}
            />
          }
          actions={
            <>
              {canEdit && editing && (
                <Button size="sm" onClick={onSave} disabled={saving}>
                  <Save className="size-4" />
                  <span className="max-sm:sr-only">
                    {saving ? 'Guardando…' : 'Guardar'}
                  </span>
                </Button>
              )}
              {canEdit && !editing && (
                <Button size="sm" onClick={startEditing}>
                  <Pencil className="size-4" />
                  <span className="max-sm:sr-only">Editar documento</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-9 flex-none md:hidden"
                onClick={() => setPanelOpen(true)}
                aria-label="Abrir el panel del documento"
              >
                <PanelRight className="size-4" />
              </Button>
            </>
          }
          menu={
            <DocumentMenuBar
              editor={editorInstance}
              docId={docId}
              getTitle={getTitle}
              theme={theme}
              editing={editing}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={startEditing}
              onSave={onSave}
              onCancel={onCancel}
              onHistory={openHistory}
              onShare={openShare}
              onReview={openReview}
              onTemplate={openTemplate}
              onChecks={openChecks}
              onDelete={onDelete}
              onTheme={onTheme}
              focus={focus}
              onFocus={toggleFocus}
              onPreview={openPreview}
              continuous={continuous}
              onContinuous={toggleContinuous}
              showComments={showComments}
              onShowComments={toggleShowComments}
            />
          }
          toolbar={
            editing && editorInstance ? (
              <Toolbar editor={editorInstance} />
            ) : null
          }
        />

        <ReviewBanners
          reviews={reviews.value ?? NO_REVIEWS}
          currentUserId={user?.id ?? ''}
          canApprove={canApprove}
          onChanged={onReviewChanged}
        />

        {draft && !editing && (
          <div className="mb-2 flex flex-none flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-soft px-4 py-2 text-sm text-info">
            <FileClock className="size-4 flex-none" />
            Hay cambios sin guardar de{' '}
            {new Date(draft.at).toLocaleString('es-NI')} en este navegador.
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-info-line bg-white text-info"
              onClick={restoreDraft}
            >
              Recuperar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-info"
              onClick={clearDraft}
            >
              Descartar
            </Button>
          </div>
        )}
        {(presence.editors.length > 0 || newVersionAvailable) && (
          <div className="mb-2 flex flex-none flex-wrap items-center gap-2 rounded-lg border border-warning-line bg-warning-soft px-4 py-2 text-sm text-warning">
            {presence.editors.length > 0 && (
              <span className="flex items-center gap-2">
                <Users className="size-4 flex-none" />
                {editorsLabel(presence.editors)}{' '}
                {editing
                  ? 'también está editando este documento. Si guarda antes que tú, te avisaré del conflicto al guardar.'
                  : 'editando este documento ahora mismo.'}
              </span>
            )}
            {newVersionAvailable && (
              <span className="flex flex-wrap items-center gap-2">
                <RefreshCw className="size-4 flex-none" />
                {editing
                  ? 'Alguien guardó una versión nueva mientras editas.'
                  : 'Hay una versión más reciente guardada por otra persona.'}
                {!editing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-warning-line bg-white text-warning"
                    onClick={handleLoadLatest}
                  >
                    Ver la última versión
                  </Button>
                )}
              </span>
            )}
          </div>
        )}

        <DocumentEditor
          key={initial.key}
          initialContent={initial.content}
          title={title}
          folderName={document.folder?.name ?? 'Documento'}
          editable={canEdit && editing}
          onDirty={onEditorDirty}
          theme={theme}
          onRequestEdit={canEdit ? startEditing : undefined}
          onCommentSelection={canComment ? setCommentQuote : undefined}
          backlinks={backlinks.value ?? NO_BACKLINKS}
          outlineHost={outlineHost}
          continuous={continuous}
          onEditorReady={onEditorReady}
        >
          {showComments && (
            <DocumentComments
              documentId={docId}
              comments={comments.value}
              onCommentsChange={comments.update}
              onReload={comments.reload}
              currentUserId={user?.id ?? ''}
              canComment={canComment}
              isAdmin={user?.role === 'admin'}
              onReveal={onReveal}
            />
          )}
        </DocumentEditor>
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Guardar como plantilla</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Nombre de la plantilla</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAsTemplate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-scope">Disponible en</Label>
              <ChoiceSelect<'folder' | 'global'>
                ariaLabel="Disponible en"
                className="h-9 w-full text-sm"
                value={templateScope}
                onChange={setTemplateScope}
                options={[
                  { value: 'folder', label: 'Solo esta carpeta' },
                  { value: 'global', label: 'Todas las carpetas' },
                ]}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
              >
                Guardar plantilla
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {shareMounted && (
          <Suspense fallback={null}>
            <ShareDialog
              documentId={docId}
              open={shareOpen}
              onOpenChange={setShareOpen}
              canHideAuthorship={canManageAccess}
            />
          </Suspense>
        )}
        {reviewMounted && (
          <RequestReviewDialog
            documentId={docId}
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            onRequested={reviews.reload}
          />
        )}
        {commentMounted && (
          <Suspense fallback={null}>
            <CommentDialog
              quote={commentQuote}
              onClose={closeCommentDialog}
              onSend={sendCommentOnQuote}
            />
          </Suspense>
        )}
        {conflict && (
          <Suspense fallback={null}>
            <SaveConflictDialog
              current={conflict}
              mineHtml={mineHtml}
              busy={saving}
              onKeepMine={keepMine}
              onLoadTheirs={loadTheirs}
              onClose={closeConflict}
            />
          </Suspense>
        )}
        {previewMounted && (
          <Suspense fallback={null}>
            <PdfPreviewDialog
              docId={docId}
              getTitle={getTitle}
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              dirty={editing && dirty}
              defaultCover={THEME_INFO[theme].style.cover !== 'none'}
            />
          </Suspense>
        )}
        {checksMounted && (
          <Suspense fallback={null}>
            <DocumentChecksDialog
              open={checksOpen}
              onOpenChange={setChecksOpen}
              editor={editorInstance}
            />
          </Suspense>
        )}
        {historyMounted && (
          <Suspense fallback={null}>
            <VersionHistory
              documentId={docId}
              versions={versions}
              currentVersionId={document.current_version?.id ?? null}
              canEdit={canEdit}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
              onRestored={onVersionRestored}
            />
          </Suspense>
        )}
      </div>
      {!focus && (
        <DocumentSidebar
          docId={docId}
          getTitle={getTitle}
          editing={editing}
          canEdit={canEdit}
          canDelete={canDelete}
          onCancel={onCancel}
          onHistory={openHistory}
          onShare={openShare}
          onReview={openReview}
          onTemplate={openTemplate}
          onChecks={openChecks}
          onPreview={openPreview}
          onDelete={onDelete}
          mobileOpen={panelOpen}
          onMobileOpenChange={setPanelOpen}
          theme={theme}
          onTheme={onTheme}
          outlineHostRef={setOutlineHost}
          details={details}
        />
      )}
    </div>
  )
}

function SaveStatus({
  editing,
  dirty,
  saving,
  updatedAt,
  autosave,
  onRetry,
}: {
  editing: boolean
  dirty: boolean
  saving: boolean
  updatedAt: string
  autosave: AutosaveState
  onRetry: () => void
}) {
  let label: string
  let hint = ''
  let dot = 'bg-success-solid'
  let tone = 'text-muted-foreground'
  if (saving) {
    label = 'Guardando…'
    dot = 'animate-pulse bg-primary'
  } else if (!editing) {
    label = `Guardado ${timeAgo(updatedAt)}`
  } else if (autosave.status === 'error') {
    label = 'No se pudo guardar'
    hint = 'Tu texto sigue a salvo en este navegador. Se reintentará solo.'
    dot = 'bg-destructive'
    tone = 'text-destructive'
  } else if (autosave.status === 'saving') {
    label = 'Guardando borrador…'
    dot = 'animate-pulse bg-primary'
  } else if (
    autosave.status === 'pending' ||
    (dirty && autosave.status === 'idle')
  ) {
    label = 'Cambios sin guardar'
    dot = 'bg-warning-solid'
    tone = 'text-warning'
  } else if (autosave.status === 'saved') {
    label = 'Borrador guardado ✓'
    hint = 'Se ha guardado un borrador. Pulsa Guardar para crear una versión.'
  } else if (autosave.status === 'local') {
    label = 'Borrador en este navegador'
    hint = 'Pulsa Guardar para crear una versión en el servidor.'
    dot = 'bg-info-solid'
  } else {
    label = 'Sin cambios'
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs ${tone}`}
      role="status"
      aria-live="polite"
      title={hint || undefined}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      <span className="max-sm:sr-only">{label}</span>
      {editing && autosave.status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 rounded-md font-medium underline underline-offset-2 hover:no-underline"
        >
          Reintentar
        </button>
      )}
    </span>
  )
}
