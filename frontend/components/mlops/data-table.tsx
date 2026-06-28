import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  emptyMessage?: string
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  rowClassName,
  emptyMessage = "No rows",
  className,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <Panel className={cn("overflow-hidden", className)}>
      <div className="overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
            <TableRow className="border-border/60 hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
                    col.className,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={keyExtractor(row)}
                className={cn(
                  "border-border/50 transition-premium hover:bg-muted/30",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row),
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.id} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}
