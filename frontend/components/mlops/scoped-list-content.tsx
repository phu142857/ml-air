"use client"

import { ListTableSkeleton } from "@/components/mlops/list-table-skeleton"
import { MlopsEmptyState, MlopsPageError } from "@/components/mlops/layout"
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
      {isError ? (
        <MlopsPageError
          title="Failed to load data"
          message={errorMessage}
          className="mb-3"
        />
      ) : null}
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
