import { FilePlus2, Upload } from 'lucide-react'
import { Button } from '#/components/ui/button'

export function EmptyFolder({
  canCreate,
  canImport,
  onNew,
  onImport,
}: {
  canCreate: boolean
  canImport: boolean
  onNew: () => void
  onImport: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-xl bg-secondary text-primary">
        <FilePlus2 className="size-8" />
      </div>
      <h3 className="text-base font-display text-foreground">
        Esta carpeta está vacía
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {canCreate
          ? 'Crea un documento desde una plantilla o en blanco, o arrastra aquí un archivo Word, HTML, Markdown o de texto para importarlo.'
          : 'Todavía no hay documentos que puedas ver aquí.'}
      </p>
      {canCreate && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onNew}>
            <FilePlus2 className="size-4" />
            Nuevo documento
          </Button>
          {canImport && (
            <Button variant="outline" onClick={onImport}>
              <Upload className="size-4" />
              Importar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
