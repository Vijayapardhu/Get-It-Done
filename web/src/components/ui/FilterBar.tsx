import { cn } from "../../lib/utils"
import { Funnel, X, CaretDown, SlidersHorizontal } from "@phosphor-icons/react"
import { useState, useRef, useEffect } from "react"

export interface FilterOption {
  key: string
  label: string
  value: string
}

export interface FilterConfig {
  key: string
  label: string
  type: "text" | "select" | "date" | "daterange"
  placeholder?: string
  options?: FilterOption[]
  multiple?: boolean
}

export interface FilterBarProps {
  filters: Record<string, unknown>
  onChange: (filters: Record<string, unknown>) => void
  config: FilterConfig[]
  className?: string
  showActiveCount?: boolean
}

export function FilterBar({ filters, onChange, config, className, showActiveCount = true }: FilterBarProps) {
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const filterRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      let clickedInside = false
      Object.values(filterRefs.current).forEach((ref) => {
        if (ref && ref.contains(target)) clickedInside = true
      })
      if (!clickedInside) setOpenFilter(null)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const activeCount = Object.values(filters).filter((v) => v !== undefined && v !== "" && v !== null && (Array.isArray(v) ? v.length > 0 : true)).length

  const handleClear = (key: string) => {
    const newFilters = { ...filters }
    delete newFilters[key]
    onChange(newFilters)
  }

  const handleClearAll = () => {
    onChange({})
  }

  return (
    <div className={cn("bg-white rounded-xl border border-border", className)}>
      {/* Mobile toggle */}
      <div className="sm:hidden flex items-center justify-between p-3">
        <button
          onClick={() => setMobileExpanded(!mobileExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-ink"
          aria-expanded={mobileExpanded}
        >
          <SlidersHorizontal size={16} className="text-muted" />
          Filters
          {showActiveCount && activeCount > 0 && (
            <span className="px-2 py-0.5 bg-accent-light text-accent text-xs font-medium rounded-full">{activeCount}</span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-crit hover:text-crit/70 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter content */}
      <div className={cn(
        "p-3",
        "hidden sm:flex sm:flex-wrap sm:items-center sm:gap-3",
        mobileExpanded && "block"
      )}>
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted">
          <Funnel size={16} weight="regular" aria-hidden="true" />
          <span>Filters</span>
          {showActiveCount && activeCount > 0 && (
            <span className="px-2 py-0.5 bg-accent-light text-accent text-xs font-medium rounded-full">{activeCount}</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 flex-1 min-w-0">
          {config.map((filter) => {
            const value = filters[filter.key]
            const hasValue = value !== undefined && value !== "" && value !== null && (Array.isArray(value) ? value.length > 0 : true)

            if (filter.type === "text") {
              return (
                <div key={filter.key} className="relative">
                  <input
                    type="text"
                    value={(value as string) ?? ""}
                    onChange={(e) => onChange({ ...filters, [filter.key]: e.target.value })}
                    placeholder={filter.placeholder}
                    className={cn(
                      "w-full sm:w-64 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent",
                      hasValue && "border-accent/50"
                    )}
                    aria-label={filter.label}
                  />
                  {hasValue && (
                    <button
                      onClick={() => handleClear(filter.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                      aria-label={`Clear ${filter.label}`}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  )}
                </div>
              )
            }

            if (filter.type === "select") {
              return (
                <div key={filter.key} className="relative" ref={(el) => { filterRefs.current[filter.key] = el }}>
                  <button
                    onClick={() => setOpenFilter(openFilter === filter.key ? null : filter.key)}
                    className={cn(
                      "w-full sm:w-auto flex items-center justify-between gap-1.5 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-ink hover:bg-border/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      hasValue && "border-accent/50 text-accent"
                    )}
                    aria-haspopup="listbox"
                    aria-expanded={openFilter === filter.key}
                    aria-label={filter.label}
                  >
                    <span className="truncate max-w-[140px] flex items-center gap-1">
                      {value ? (Array.isArray(value) ? `${value.length} selected` : String(value)) : filter.placeholder}
                    </span>
                    <CaretDown size={12} weight="regular" aria-hidden="true" />
                  </button>

                  {openFilter === filter.key && (
                    <div
                      className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-border rounded-lg shadow-lg py-1 z-50 max-h-60 overflow-auto scrollbar-thin"
                      role="listbox"
                      aria-label={filter.label}
                    >
                      {(filter.options ?? []).map((option) => (
                        <button
                          key={option.key}
                          onClick={() => {
                            const newValue = filter.multiple
                              ? [...(Array.isArray(value) ? value : []), option.value].filter((v, i, arr) => arr.indexOf(v) === i)
                              : option.value
                            onChange({ ...filters, [filter.key]: newValue })
                            if (!filter.multiple) setOpenFilter(null)
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2",
                            (Array.isArray(value) ? value.includes(option.value) : value === option.value)
                              ? "bg-accent-light text-accent"
                              : "text-muted hover:text-ink hover:bg-bg"
                          )}
                          role="option"
                          aria-selected={Array.isArray(value) ? value.includes(option.value) : value === option.value}
                        >
                          {filter.multiple && (
                            <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0", (Array.isArray(value) ? value.includes(option.value) : false) ? "bg-accent border-accent" : "border-muted")}>
                              {(Array.isArray(value) ? value.includes(option.value) : false) && <Check size={12} weight="bold" />}
                            </span>
                          )}
                          <span className="truncate">{option.label}</span>
                        </button>
                      ))}
                      {filter.multiple && Array.isArray(value) && value.length > 0 && (
                        <>
                          <hr className="my-1 border-border" />
                          <button
                            onClick={() => handleClear(filter.key)}
                            className="w-full px-3 py-2 text-left text-sm text-crit hover:bg-crit-light transition-colors flex items-center gap-2"
                            role="option"
                          >
                            <X size={14} weight="regular" aria-hidden="true" />
                            Clear all
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            }

            if (filter.type === "date") {
              return (
                <div key={filter.key} className="relative">
                  <input
                    type="date"
                    value={(value as string) ?? ""}
                    onChange={(e) => onChange({ ...filters, [filter.key]: e.target.value || undefined })}
                    className={cn(
                      "w-full sm:w-40 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent",
                      hasValue && "border-accent/50"
                    )}
                    aria-label={filter.label}
                  />
                  {hasValue && (
                    <button
                      onClick={() => handleClear(filter.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                      aria-label={`Clear ${filter.label}`}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  )}
                </div>
              )
            }

            if (filter.type === "daterange") {
              const start = (value as { start?: string; end?: string })?.start
              const end = (value as { start?: string; end?: string })?.end
              const hasRange = start || end

              return (
                <div key={filter.key} className="flex items-center gap-1">
                  <input
                    type="date"
                    value={start ?? ""}
                    onChange={(e) => onChange({ ...filters, [filter.key]: { start: e.target.value || undefined, end } })}
                    placeholder="From"
                    className={cn("w-full sm:w-36 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent", hasRange && "border-accent/50")}
                    aria-label={`${filter.label} from`}
                  />
                  <span className="text-muted text-xs hidden sm:inline">–</span>
                  <input
                    type="date"
                    value={end ?? ""}
                    onChange={(e) => onChange({ ...filters, [filter.key]: { start, end: e.target.value || undefined } })}
                    placeholder="To"
                    className={cn("w-full sm:w-36 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent", hasRange && "border-accent/50")}
                    aria-label={`${filter.label} to`}
                  />
                  {hasRange && (
                    <button
                      onClick={() => handleClear(filter.key)}
                      className="text-muted hover:text-ink transition-colors"
                      aria-label={`Clear ${filter.label}`}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  )}
                </div>
              )
            }

            return null
          })}

          {activeCount > 0 && (
            <button
              onClick={handleClearAll}
              className="hidden sm:block px-3 py-2 text-sm text-crit hover:text-crit/70 hover:bg-crit-light rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crit"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { Check } from "@phosphor-icons/react"
