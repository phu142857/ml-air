'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex min-h-0 flex-col gap-2', className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'bg-muted/50 text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg border border-border p-[3px] transition-default',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-default focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const classStr = typeof className === 'string' ? className : ''
  const isScrollRegion = classStr.includes('scroll-region')

  if (isScrollRegion) {
    // Keep layout utilities (space-y-*, gap-*) on the padded inner content so the
    // scrollbar sits on the outer edge and does not collide with panels.
    const innerLayout = classStr
      .split(/\s+/)
      .filter((token) => /^(space-y-|gap-|flex|flex-col|items-|justify-)/.test(token))
      .join(' ')

    return (
      <TabsPrimitive.Content
        data-slot="tabs-content"
        className={cn(
          'scroll-region mt-0 min-h-0 flex-1 outline-none data-[state=inactive]:hidden',
        )}
        {...props}
      >
        <div className={cn('scroll-region-pad flex flex-col py-6', innerLayout)}>
          {children}
        </div>
      </TabsPrimitive.Content>
    )
  }

  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'min-h-0 flex-1 outline-none data-[state=inactive]:hidden',
        'data-[state=active]:overflow-x-hidden data-[state=active]:overflow-y-auto',
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
