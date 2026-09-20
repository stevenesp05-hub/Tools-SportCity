import { useState } from 'react'
import { format, parse } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'

/** Selector de fecha propio (yyyy-MM-dd) en lugar del calendario nativo del navegador. */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Sin fecha',
  className,
  invalid = false,
}: {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 px-2 text-xs font-normal',
            invalid && 'border-destructive text-destructive',
            className,
          )}
        >
          <CalendarDays className="size-3.5" />
          {selected
            ? format(selected, "d 'de' MMM yyyy", { locale: es })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? format(date, 'yyyy-MM-dd') : null)
            setOpen(false)
          }}
        />
        {value && (
          <div className="border-t border-border p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <X className="size-3.5" />
              Quitar fecha
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
