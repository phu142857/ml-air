import React from 'react'
import { cn } from '@/lib/utils'

export interface CardPanelProps {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

export function CardPanel({ children, className, size = 'md' }: CardPanelProps) {
  return (
    <div
      className={cn(
        size === 'sm' ? 'card-panel-sm' : 'card-panel',
        className
      )}
    >
      {children}
    </div>
  )
}
