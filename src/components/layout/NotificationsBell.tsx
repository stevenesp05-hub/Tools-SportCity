import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react'
import { getNotifications } from '#/server/notifications'
import type { NotificationItem, Notifications } from '#/server/notifications'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'

const REFRESH_MS = 60_000
/** Al volver a la pestaña solo se recarga si los avisos llevan más de este tiempo sin actualizarse. */
const STALE_MS = 60_000

const KIND_STYLE: Record<
  NotificationItem['kind'],
  { icon: typeof Bell; tone: string; label: string }
> = {
  review: {
    icon: ClipboardCheck,
    tone: 'text-primary bg-secondary',
    label: 'Te piden revisar',
  },
  overdue: {
    icon: AlarmClock,
    tone: 'text-destructive bg-danger-soft',
    label: 'Vencido',
  },
  decision: {
    icon: CheckCircle2,
    tone: 'text-success bg-success-soft',
    label: 'Respuesta a tu solicitud',
  },
  due_soon: {
    icon: CalendarClock,
    tone: 'text-warning bg-warning-soft',
    label: 'Por vencer',
  },
}

export function NotificationsBell() {
  const [data, setData] = useState<Notifications>({ items: [], count: 0 })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    let lastLoad = 0
    let timer: ReturnType<typeof setInterval> | undefined
    const load = () => {
      lastLoad = Date.now()
      getNotifications()
        .then((next) => {
          // Si el servidor falla puede llegar un valor vacío: se ignora para no romper la campana.
          if (!cancelled && (next as Notifications | undefined)?.items)
            setData(next)
        })
        .catch(() => undefined)
    }
    const start = () => {
      load()
      timer = setInterval(load, REFRESH_MS)
    }
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }
    // Con la pestaña oculta no se sondea; al volver se refresca solo si los datos ya están viejos.
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (timer === undefined) {
        if (Date.now() - lastLoad > STALE_MS) start()
        else timer = setInterval(load, REFRESH_MS)
      }
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 flex-none"
          aria-label={data.count > 0 ? `Avisos (${data.count})` : 'Avisos'}
          title="Avisos"
        >
          <Bell className="size-5" />
          {data.count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-medium leading-4 text-white">
              {data.count > 9 ? '9+' : data.count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="font-display text-sm text-foreground">Avisos</div>
          <div className="text-xs text-muted-foreground">
            Revisiones, respuestas y vencimientos de los próximos 7 días.
          </div>
        </div>
        {data.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No tienes avisos pendientes.
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {data.items.map((item) => {
              const style = KIND_STYLE[item.kind]
              const Icon = style.icon
              return (
                <li key={item.key}>
                  <Link
                    to="/documentos/doc/$docId"
                    params={{ docId: item.documentId }}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 px-4 py-3 hover:bg-secondary/60"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-8 flex-none items-center justify-center rounded-full',
                        style.tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
