import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('skeleton-pulse rounded-md bg-muted/70', className)}
      aria-hidden
      {...props}
    />
  )
}

export { Skeleton }
