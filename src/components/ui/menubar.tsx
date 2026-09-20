import * as React from 'react'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import { Menubar as MenubarPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'

/** Barra de menús (Archivo, Editar, Ver…): al abrir una, pasar el ratón por las demás las abre. */
function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      className={cn('flex items-center gap-0.5', className)}
      {...props}
    />
  )
}

const Menu = MenubarPrimitive.Menu

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      className={cn(
        'flex h-7 cursor-default items-center rounded-md px-2.5 text-sm text-foreground outline-hidden select-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary [@media(pointer:coarse)]:h-9',
        className,
      )}
      {...props}
    />
  )
}

const contentClass =
  'z-50 min-w-52 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0'

function MenubarContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          contentClass,
          'max-h-(--radix-menubar-content-available-height)',
          className,
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

function MenubarItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  variant?: 'default' | 'destructive'
}) {
  return (
    <MenubarPrimitive.Item
      data-variant={variant}
      className={cn(itemClass, className)}
      {...props}
    />
  )
}

function MenubarCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  return (
    <MenubarPrimitive.CheckboxItem
      className={cn(itemClass, 'pl-8', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function MenubarLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label>) {
  return (
    <MenubarPrimitive.Label
      className={cn(
        'px-2 py-1 text-2xs font-display uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

const MenubarSub = MenubarPrimitive.Sub

function MenubarSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger>) {
  return (
    <MenubarPrimitive.SubTrigger
      className={cn(
        itemClass,
        'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </MenubarPrimitive.SubTrigger>
  )
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.SubContent
        collisionPadding={8}
        className={cn(
          contentClass,
          'max-h-(--radix-menubar-content-available-height)',
          className,
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'ml-auto pl-6 font-mono text-2xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Menubar,
  Menu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarShortcut,
}
