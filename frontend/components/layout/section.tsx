import React from 'react'
import { cn } from '@/lib/utils'

export interface SectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, children, className }: SectionProps) {
  return (
    <div className={cn('ds-page-section', className)}>
      <div className="ds-section-header">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
