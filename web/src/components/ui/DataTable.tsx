import { cn } from "../../lib/utils"
import { CaretUp, CaretDown, Check, Minus } from "@phosphor-icons/react"
import { useState } from "react"
import type { KeyboardEvent } from "react"

export interface Column<T> {
  key: string
  header: string
  width?: string
  align?: "left" | "center" | "right"
  render?: (value: unknown, row: T, index: number) => React.ReactNode
  sortable?: boolean
  className?: string
  hideOnMobile?: boolean
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
  mobileCardView?: boolean
}

function SortIcon({ order }: { order: "asc" | "desc" }) {
  return order === "asc" ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />
}

function SelectionCheckbox({ checked, indeterminate, onChange, ariaLabel }: { checked: boolean; indeterminate: boolean; onChange: () => void; ariaLabel: string }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        checked ? "bg-accent border-accent text-white" : "border-muted hover:border-accent/50",
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
  mobileCardView = true,
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

  const handleKeyDown = (e: KeyboardEvent, row: T, _index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onRowClick?.(row)
    }
  }

  const mobileColumns = columns.filter((col) => !col.hideOnMobile)

  if (loading) {
    return (
      <>
        <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full" role="grid" aria-busy="true">
            <thead className="bg-bg border-b border-border">
              <tr>
                {showSelection && <th className="px-3 py-2.5 w-10" scope="col" />}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "px-3 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider",
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
                <tr key={i} className="border-b border-border animate-pulse">
                  {showSelection && <td className="px-3 py-3 w-10" />}
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-3 py-3 text-sm", col.align === "center" && "text-center", col.align === "right" && "text-right", col.className)}>
                      <div className="h-4 w-3/4 bg-border rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 animate-pulse">
              <div className="h-4 w-1/2 bg-border rounded mb-3" />
              <div className="h-3 w-3/4 bg-border rounded" />
            </div>
          ))}
        </div>
      </>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-8 text-center">
        <div className="text-muted mb-2 text-sm">{emptyMessage}</div>
        {emptyDescription && <div className="text-xs text-muted/70">{emptyDescription}</div>}
      </div>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full" role="grid">
          <thead className="bg-bg border-b border-border">
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
                    "px-3 py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wider",
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
                    {col.sortable && sortBy === col.key && <SortIcon order={sortOrder!} />}
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
                    "border-b border-border transition-colors",
                    striped && index % 2 === 0 && "bg-bg/50",
                    selected && "bg-accent-light/50",
                    isHovered && "bg-bg",
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

      {/* Mobile card view */}
      {mobileCardView && (
        <div className="md:hidden space-y-3">
          {data.map((row, index) => {
            const rowKey = keyExtractor(row)
            const selected = selection.includes(rowKey)

            return (
              <div
                key={rowKey}
                className={cn(
                  "bg-white rounded-xl border border-border p-4 transition-colors",
                  selected && "border-accent bg-accent-light/30",
                  onRowClick && "cursor-pointer active:bg-bg"
                )}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => handleKeyDown(e, row, index)}
                tabIndex={onRowClick ? 0 : -1}
                role="row"
                aria-selected={selected}
              >
                <div className="space-y-2">
                  {mobileColumns.map((col) => (
                    <div key={col.key} className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted shrink-0">{col.header}</span>
                      <span className="text-sm text-ink text-right">
                        {col.render ? col.render((row as Record<string, unknown>)[col.key], row, index) : String((row as Record<string, unknown>)[col.key] ?? "")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
