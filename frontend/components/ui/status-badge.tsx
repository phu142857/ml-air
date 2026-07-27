import React from 'react'
import { cn } from '@/lib/utils'

export type StatusType = 'running' | 'success' | 'warning' | 'error'

export interface StatusBadgeProps {
  status: StatusType
  label: string
  className?: string
}

const statusStyles: Record<StatusType, string> = {
  running: 'status-badge-running',
  success: 'status-badge-success',
  warning: 'status-badge-warning',
  error: 'status-badge-error',
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={cn('status-badge', statusStyles[status], className)}>
      {label}
    </span>
  )
}
