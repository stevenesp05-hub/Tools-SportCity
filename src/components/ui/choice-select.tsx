import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { cn } from '#/lib/utils'

export type Choice<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

/** Lista desplegable propia (Radix) con una API mínima: opciones, valor y onChange. */
export function ChoiceSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  ariaLabel,
}: {
  value: T | ''
  onChange: (value: T) => void
  options: Array<Choice<T>>
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <Select
      value={value === '' ? undefined : value}
      onValueChange={(v) => onChange(v as T)}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn('h-8 text-xs', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
