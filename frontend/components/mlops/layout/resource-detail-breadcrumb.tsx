import { SubpageBreadcrumb, type BreadcrumbSegment } from "./subpage-breadcrumb"

export interface ResourceDetailBreadcrumbProps {
  listHref: string
  listLabel: string
  currentLabel: string
  currentMono?: boolean
  middleSegments?: BreadcrumbSegment[]
  className?: string
}

/** Breadcrumb trail for resource detail pages (list → optional parents → current). */
export function ResourceDetailBreadcrumb({
  listHref,
  listLabel,
  currentLabel,
  currentMono = true,
  middleSegments = [],
  className,
}: ResourceDetailBreadcrumbProps) {
  const segments: BreadcrumbSegment[] = [
    { label: listLabel, href: listHref },
    ...middleSegments,
    { label: currentLabel, mono: currentMono },
  ]

  return <SubpageBreadcrumb segments={segments} className={className} />
}
