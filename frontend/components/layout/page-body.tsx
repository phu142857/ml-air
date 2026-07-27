import React from 'react'
import { cn } from '@/lib/utils'

export interface PageBodyProps {
  children: React.ReactNode
  className?: string
}

export function PageBody({ children, className }: PageBodyProps) {
  return (
    <div className="ds-page-body">
      <div className={cn('ds-page-content', className)}>{children}</div>
    </div>
  )
}
