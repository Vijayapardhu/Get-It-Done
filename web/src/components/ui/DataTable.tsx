import { cn } from "../../lib/utils"
import { ChevronUp, ChevronDown, Check, Minus } from "@phosphor-icons/react"
import { useState, useMemo, KeyboardEvent } from "react"

export interface Column<T> {
  key: string
  header: string
  width?: string
  align?: "left" | "center" | "right"
  render?: (value: unknown, row: T, index: number) => React.ReactNode
  sortable?: boolean
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  loading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  onRowClick?: (row: T) => void
  selection?: string[]
  onSelectionChange?: (keys: string[]) => void
  showSelection?: boolean
  sortBy?: string
  sortOrder?: "asc" | "desc"
  onSort?: (key: string, order: "asc" | "desc") => void
  rowClassName?: (row: T) => string
  striped?: boolean
  compact?: boolean
}

function SortIcon({ order }: { order: "asc" | "desc" }) {
  return order === "asc" ? <ChevronUp size={14} weight="bold" /> : <ChevronDown size={14} weight="bold" />
}

function SelectionCheckbox({ checked, indeterminate, onChange, ariaLabel }: { checked: boolean; indeterminate: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        checked ? "bg-accent border-accent text-ink" : "border-muted/30 hover:border-accent/50",
        indeterminate && "bg-accent border-accent"
      )}
      aria-label={ariaLabel}
      aria-checked={checked}
      aria-indeterminate={indeterminate}
      type="button"
    >
      {checked && <Check size={12} weight="bold" />}
      {indeterminate && !checked && <Minus size={12} weight="bold" />}
    </button>
  )
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = "No data",
  emptyDescription,
  onRowClick,
  selection = [],
  onSelectionChange,
  showSelection = false,
  sortBy,
  sortOrder,
  onSort,
  rowClassName,
  striped = true,
  compact = false,
}: DataTableProps<T>) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const allSelected = data.length > 0 && data.every((row) => selection.includes(keyExtractor(row)))
  const someSelected = data.some((row) => selection.includes(keyExtractor(row)))

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(data.map(keyExtractor))
    }
  }

  const handleRowSelect = (key: string) => {
    if (selection.includes(key)) {
      onSelectionChange?.(selection.filter((k) => k !== key))
    } else {
      onSelectionChange?.([...selection, key])
    }
  }

  const handleKeyDown = (e: KeyboardEvent, row: T, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-muted/20 bg-ink/50">
        <table className="w-full" role="grid" aria-busy="true">
          <thead className="bg-muted/10 border-b border-muted/20">
            <tr>
              {showSelection && <th className="px-3 py-2.5 w-10" scope="col" />}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                    col.className
                  )}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={cn("border-b border-muted/10 animate-pulse", striped && i % 2 === 0 && "bg-muted/5")}>
                {showSelection && <td className="px-3 py-3 w-10" />}
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-3 py-3 text-sm", col.align === "center" && "text-center", col.align === "right" && "text-right", col.className)}>
                    <div className="h-4 w-3/4 bg-muted/20 rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-muted/20 bg-ink/50 p-8 text-center">
        <div className="text-muted mb-2 text-sm">{emptyMessage}</div>
        {emptyDescription && <div className="text-xs text-muted/70">{emptyDescription}</div>}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-muted/20 bg-ink">
      <table className="w-full" role="grid">
        <thead className="bg-muted/10 border-b border-muted/20">
          <tr>
            {showSelection && (
              <th scope="col" className="px-3 py-2.5 w-10">
                <SelectionCheckbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={handleSelectAll}
                  ariaLabel="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-3 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wider",
                  col.align === "center" && "text-center",
                  col.align === "right" && "text-right",
                  col.sortable && "cursor-pointer select-none hover:text-ink",
                  col.className
                )}
                style={{ width: col.width }}
                onClick={col.sortable ? () => onSort?.(col.key, sortBy === col.key && sortOrder === "asc" ? "desc" : "asc") : undefined}
                aria-sort={sortBy === col.key ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortBy === col.key && <SortIcon order={sortOrder} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const rowKey = keyExtractor(row)
            const selected = selection.includes(rowKey)
            const isHovered = hoveredKey === rowKey

            return (
              <tr
                key={rowKey}
                className={cn(
                  "border-b border-muted/10 transition-colors",
                  striped && index % 2 === 0 && "bg-muted/5",
                  selected && "bg-accent/5",
                  isHovered && "bg-muted/10",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row)
                )}
                onMouseEnter={() => setHoveredKey(rowKey)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => handleKeyDown(e, row, index)}
                tabIndex={onRowClick ? 0 : -1}
                role="row"
                aria-selected={selected}
              >
                {showSelection && (
                  <td className="px-3 py-2.5 w-10">
                    <SelectionCheckbox
                      checked={selected}
                      indeterminate={false}
                      onChange={() => handleRowSelect(rowKey)}
                      ariaLabel={`Select row ${index + 1}`}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5 text-sm",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                      compact && "py-1.5",
                      col.className
                    )}
                  >
                    {col.render ? col.render((row as Record<string, unknown>)[col.key], row, index) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}