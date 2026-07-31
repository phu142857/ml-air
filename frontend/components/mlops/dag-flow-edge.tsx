"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react"
import { cn } from "@/lib/utils"
import { useChartTheme } from "@/hooks/use-chart-theme"
import { getFlowEdgeStrokeForMode } from "@/lib/chart-theme"

export type DagFlowEdgeData = {
  label?: string
  /** Horizontal Bézier pull when using a fanned path. */
  curvature?: number
  /** Vertical control-point offset for sibling edge separation. */
  fan?: number
  /** When true (or fan is set), draw a custom fanned cubic instead of default bezier. */
  fanned?: boolean
  /**
   * Optional accent (e.g. success/running/failed). When set, used instead of theme stroke.
   * Theme-default edges should omit this so color tracks light/dark live.
   */
  accentStroke?: string
  [key: string]: unknown
}

/** Pipeline status accents — never treated as stale theme colors. */
const ACCENT_STROKES = new Set(["#10b981", "#0ea5e9", "#ef4444"])

function fannedBezierPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  bend,
  fan,
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  bend: number
  fan: number
}): [string, number, number] {
  const dx = Math.max(40, Math.abs(targetX - sourceX))
  const pull = Math.min(0.55, Math.max(0.22, bend))
  const c1x = sourceX + dx * pull
  const c2x = targetX - dx * pull
  const c1y = sourceY + fan
  const c2y = targetY + fan
  const path = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2 + fan * 0.35
  return [path, labelX, labelY]
}

function resolveStroke(
  themeStroke: string,
  accentStroke: string | undefined,
  styleStroke: string | undefined,
): string {
  const accent = (accentStroke || "").trim()
  if (accent) return accent
  const fromStyle = (styleStroke || "").trim()
  if (fromStyle && ACCENT_STROKES.has(fromStyle.toLowerCase())) return fromStyle
  // Always follow live theme — do not keep baked theme hex from style.stroke.
  return themeStroke
}

/**
 * Shared DAG edge: no arrowheads, capsule particles along the path.
 * Default stroke tracks light/dark via useChartTheme (same for lineage + pipeline DAG).
 */
export function DagFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  selected,
}: EdgeProps<Edge<DagFlowEdgeData>>) {
  const { flowColorMode } = useChartTheme()
  const themeStroke = getFlowEdgeStrokeForMode(flowColorMode)
  const stroke = resolveStroke(
    themeStroke,
    typeof data?.accentStroke === "string" ? data.accentStroke : undefined,
    typeof style?.stroke === "string" ? style.stroke : undefined,
  )

  const fan = typeof data?.fan === "number" ? data.fan : 0
  const useFanned = Boolean(data?.fanned) || fan !== 0
  const bend = typeof data?.curvature === "number" ? Math.abs(data.curvature) : 0.28

  const [path, labelX, labelY] = useFanned
    ? fannedBezierPath({ sourceX, sourceY, targetX, targetY, bend, fan })
    : getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        curvature: 0.25,
      })

  const label = data?.label
  const pills = [
    { begin: "0s", dur: "2.6s", opacity: 0.95 },
    { begin: "0.85s", dur: "2.6s", opacity: 0.75 },
    { begin: "1.7s", dur: "2.6s", opacity: 0.55 },
  ]

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: selected ? 2.75 : Number(style?.strokeWidth) || 2.25,
          opacity: 0.95,
        }}
      />
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="react-flow__edge-interaction" />
      {pills.map((pill, i) => (
        <g key={`${id}-pill-${i}`} className="mlair-dag-edge-pill" opacity={pill.opacity}>
          <rect x={-6} y={-2.25} width={12} height={4.5} rx={2.25} ry={2.25} fill={stroke} stroke="none">
            <animateMotion dur={pill.dur} repeatCount="indefinite" begin={pill.begin} path={path} rotate="auto" />
          </rect>
        </g>
      ))}
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-none absolute rounded border border-border bg-card px-1.5 py-0.5",
              "text-[10px] font-semibold tracking-wide text-foreground shadow-sm",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export const dagFlowEdgeTypes = {
  dag: DagFlowEdge,
}
