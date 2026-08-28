import { cn } from "../../lib/utils"
import { ChevronDown, Search, User, Bell, Key, MagnifyingGlass } from "@phosphor-icons/react"
import { useAuth } from "../../lib/AuthContext"
import { useState, useRef, useEffect, KeyboardEvent } from "react"

interface HeaderProps {
  onSearch?: (query: string) => void
  placeholder?: string
}

export function Header({ onSearch, placeholder = "Search bookings, workers, tickets…" }: HeaderProps) {
  const { user, scope, scopeOptions, setScope, logout } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [showScopeMenu, setShowScopeMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const scopeMenuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(event.target as Node)) {
        setShowScopeMenu(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch?.(searchQuery.trim())
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowScopeMenu(false)
      setShowUserMenu(false)
      searchRef.current?.blur()
    }
  }

  const scopeLabel = scope?.cooperativeId
    ? scopeOptions.find((s) => s.id === scope.cooperativeId)?.name ?? "Cooperative"
    : scope?.federationId
    ? scopeOptions.find((s) => s.id === scope.federationId)?.name ?? "Federation"
    : "All Societies"

  const canSwitchScope = scopeOptions.length > 1

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 h-16 bg-ink/95 backdrop-blur border-b border-muted/20"
      role="banner"
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-6 gap-4 ml-64">
        <div className="flex-1 max-w-md lg:max-w-xl">
          <form onSubmit={handleSearch} className="relative" role="search">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-muted/20 rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              aria-label={placeholder}
              onKeyDown={handleKeyDown}
            />
          </form>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {canSwitchScope && (
            <div className="relative" ref={scopeMenuRef}>
              <button
                onClick={() => setShowScopeMenu(!showScopeMenu)}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/10 border border-muted/20 rounded-lg text-sm font-medium text-ink hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-haspopup="listbox"
                aria-expanded={showScopeMenu}
                aria-label="Switch scope"
              >
                <Building2 size={16} weight="regular" aria-hidden="true" />
                <span className="truncate max-w-[160px]">{scopeLabel}</span>
                <ChevronDown size={14} weight="regular" aria-hidden="true" />
              </button>

              {showScopeMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-64 bg-ink border border-muted/20 rounded-lg shadow-lg py-1 z-50 scrollbar-thin max-h-60 overflow-auto"
                  role="listbox"
                  aria-label="Available scopes"
                >
                  <button
                    onClick={() => setScope({})}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm transition-colors",
                      !scope?.cooperativeId && !scope?.federationId
                        ? "bg-accent/15 text-accent"
                        : "text-muted hover:text-ink hover:bg-muted/10"
                    )}
                    role="option"
                    aria-selected={!scope?.cooperativeId && !scope?.federationId}
                  >
                    All Societies
                  </button>
                  <hr className="my-1 border-muted/20" />
                  {scopeOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setScope(option.type === "federation" ? { federationId: option.id } : { cooperativeId: option.id })
                        setShowScopeMenu(false)
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2",
                        scope?.cooperativeId === option.id || scope?.federationId === option.id
                          ? "bg-accent/15 text-accent"
                          : "text-muted hover:text-ink hover:bg-muted/10"
                      )}
                      role="option"
                      aria-selected={scope?.cooperativeId === option.id || scope?.federationId === option.id}
                    >
                      <span className="text-xs px-1.5 py-0.5 bg-muted/20 rounded text-[10px] font-medium capitalize">{option.type}</span>
                      <span className="truncate">{option.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted/10 border border-muted/20 rounded-lg text-sm font-medium text-ink hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-haspopup="menu"
              aria-expanded={showUserMenu}
              aria-label="User menu"
            >
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-sm">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block truncate max-w-[120px]">{user?.name}</span>
              <ChevronDown size={14} weight="regular" aria-hidden="true" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-ink border border-muted/20 rounded-lg shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-muted/20">
                  <p className="text-sm font-medium text-ink truncate">{user?.name}</p>
                  <p className="text-xs text-muted capitalize">{user?.role.replace("_", " ")}</p>
                </div>
                <button
                  onClick={logout}
                  className="w-full px-3 py-2 text-left text-sm text-crit hover:bg-crit/10 transition-colors flex items-center gap-2"
                >
                  <Key size={16} weight="regular" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

import { Building2 } from "@phosphor-icons/react"