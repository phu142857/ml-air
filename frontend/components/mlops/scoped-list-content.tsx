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
  emptyDescription: string
  skeletonRows?: number
  children: React.ReactNode
}

export function ScopedListContent({
  isLoading,
  isError,
  isEmpty,
  errorMessage = "Failed to load data. Check API base URL in Settings or use mock mode.",
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  skeletonRows = 6,
  children,
}: ScopedListContentProps) {
  if (isLoading) {
    return <ListTableSkeleton rows={skeletonRows} />
  }

  return (
    <>
      {isError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}
      {isEmpty ? (
        <MlopsEmptyState
          icon={EmptyIcon}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        children
      )}
    </>
  )
}
