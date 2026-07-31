"use client"

import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { MlopsEmptyState } from "@/components/mlops/layout"
import type { LucideIcon } from "lucide-react"

interface ScopedListContentProps {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  errorMessage?: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyContent?: React.ReactNode
  skeletonRows?: number
  children: React.ReactNode
}

export function ScopedListContent({
  isLoading,
  isError,
  isEmpty,
  errorMessage = "Failed to load data.",
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyContent,
  skeletonRows = 6,
  children,
}: ScopedListContentProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ListTableSkeleton rows={skeletonRows} />
      </div>
    )
  }

  return (
    <>
      {isError && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}
      {isEmpty ? (
        emptyContent ?? (
          <MlopsEmptyState
            icon={EmptyIcon}
            title={emptyTitle}
          />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      )}
    </>
  )
}
