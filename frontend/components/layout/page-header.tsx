import React from 'react'

export interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: PageHeaderProps) {
  return (
    <div className="ds-page-header">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {icon && <div className="mt-1 text-muted-foreground">{icon}</div>}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  )
}
