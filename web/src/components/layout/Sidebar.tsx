import { NavLink, useLocation } from "react-router-dom"
import { cn } from "../../lib/utils"
import {
  House,
  Pulse,
  Users,
  Package,
  Tag,
  CurrencyInr,
  User,
  Headphones,
  ChartBar,
  Building,
  Gear,
  SignOut,
  X,
  Buildings,
  Brain,
  WarningCircle,
  MapPin,
  ChartLineUp,
  MapTrifold,
} from "@phosphor-icons/react"
import { useAuth } from "../../lib/AuthContext"
import { Logo } from "../ui/Logo"

const cooperativeNav = [
  { key: "overview", label: "Overview", icon: House, href: "/", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "operations", label: "Operations", icon: Pulse, href: "/operations", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "workforce", label: "Workforce", icon: Users, href: "/workforce", roles: ["system_admin", "federation_admin", "society_admin"] },
  { key: "catalogue", label: "Categories", icon: Package, href: "/catalogue", roles: ["system_admin", "federation_admin", "society_admin"] },
  { key: "pricing", label: "Pricing", icon: Tag, href: "/pricing", roles: ["system_admin", "federation_admin"] },
  { key: "zones", label: "Zones", icon: MapTrifold, href: "/zones", roles: ["system_admin", "federation_admin"] },
  { key: "finance", label: "Finance", icon: CurrencyInr, href: "/finance", roles: ["system_admin", "federation_admin", "support_staff"] },
  { key: "customers", label: "Customers", icon: User, href: "/customers", roles: ["system_admin", "support_staff"] },
  { key: "support", label: "Support", icon: Headphones, href: "/support", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "insight", label: "Insight", icon: ChartBar, href: "/insight", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "organisation", label: "Organisation", icon: Building, href: "/organisation", roles: ["system_admin", "federation_admin"] },
  { key: "system", label: "System", icon: Gear, href: "/system", roles: ["system_admin"] },
] as const

const federationNav = [
  { key: "overview", label: "Overview", icon: House, href: "/", roles: ["system_admin", "federation_admin"] },
  { key: "operations", label: "Operations", icon: Pulse, href: "/operations", roles: ["system_admin", "federation_admin"] },
  { key: "emergencies", label: "Emergencies", icon: WarningCircle, href: "/emergencies", roles: ["system_admin", "federation_admin"] },
  { key: "workforce", label: "Workforce", icon: Users, href: "/workforce", roles: ["system_admin", "federation_admin"] },
  { key: "societies", label: "Societies", icon: Buildings, href: "/societies", roles: ["system_admin", "federation_admin"] },
  { key: "performance", label: "Performance", icon: ChartLineUp, href: "/society-performance", roles: ["system_admin", "federation_admin"] },
  { key: "regional-demand", label: "Regional Demand", icon: MapPin, href: "/regional-demand", roles: ["system_admin", "federation_admin"] },
  { key: "ai-insights", label: "AI Insights", icon: Brain, href: "/ai-insights", roles: ["system_admin", "federation_admin"] },
  { key: "finance", label: "Finance", icon: CurrencyInr, href: "/finance", roles: ["system_admin", "federation_admin"] },
  { key: "catalogue", label: "Categories", icon: Package, href: "/catalogue", roles: ["system_admin", "federation_admin"] },
  { key: "pricing", label: "Pricing", icon: Tag, href: "/pricing", roles: ["system_admin", "federation_admin"] },
  { key: "support", label: "Support", icon: Headphones, href: "/support", roles: ["system_admin", "federation_admin"] },
  { key: "insight", label: "Analytics", icon: ChartBar, href: "/insight", roles: ["system_admin", "federation_admin"] },
  { key: "system", label: "System", icon: Gear, href: "/system", roles: ["system_admin"] },
] as const

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const isFederation = user?.role === "federation_admin" || user?.role === "system_admin"
  const navItems = isFederation ? federationNav : cooperativeNav
  const filteredNav = navItems.filter((item) => user && item.roles.some((r) => r === user.role))

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/"
    return location.pathname.startsWith(href)
  }

  const brandName = isFederation ? "Federation Desk" : "Cooperative Desk"

  const renderNav = (onClick?: () => void) => (
    <>
      {filteredNav.map((item) => {
        const active = isActive(item.href)
        return (
          <NavLink
            key={item.key}
            to={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus:ring-accent",
              active
                ? "bg-accent-light text-accent"
                : "text-muted hover:text-ink hover:bg-bg"
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon size={20} weight={active ? "fill" : "regular"} aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        )
      })}
    </>
  )

  return (
    <>
      {/* Desktop Sidebar - fixed, always visible on lg+ */}
      <aside
        className="hidden lg:flex fixed left-0 top-16 bottom-0 z-40 w-60 bg-white border-r border-border flex-col"
        aria-label="Main navigation"
      >
        <nav className="flex flex-col h-full p-3 space-y-1 overflow-y-auto scrollbar-thin" role="navigation">
          <div className="flex items-center gap-2.5 px-2 py-3 mb-2">
            <Logo size={28} />
            <span className="text-sm font-bold text-ink">{brandName}</span>
          </div>

          {renderNav()}

          <div className="flex-1" />

          <div className="border-t border-border pt-2 space-y-1">
            <NavLink
              to="/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                location.pathname === "/settings"
                  ? "bg-accent-light text-accent"
                  : "text-muted hover:text-ink hover:bg-bg"
              )}
            >
              <Gear size={20} weight="regular" aria-hidden="true" />
              <span>Settings</span>
            </NavLink>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-crit hover:bg-crit-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crit"
            >
              <SignOut size={20} weight="regular" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Mobile Drawer - slides in from left on mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside
            className="relative w-72 max-w-[80vw] bg-white shadow-xl flex flex-col animate-slide-in-left"
            aria-label="Mobile navigation"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="text-sm font-bold text-ink">{brandName}</span>
              </div>
              <button
                onClick={onMobileClose}
                className="p-2 -mr-2 text-muted hover:text-ink hover:bg-bg rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Close navigation"
              >
                <X size={20} weight="regular" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1" role="navigation">
              {renderNav(onMobileClose)}
            </nav>

            {/* Bottom section */}
            <div className="border-t border-border p-3 space-y-1">
              <NavLink
                to="/settings"
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  location.pathname === "/settings"
                    ? "bg-accent-light text-accent"
                    : "text-muted hover:text-ink hover:bg-bg"
                )}
              >
                <Gear size={20} weight="regular" aria-hidden="true" />
                <span>Settings</span>
              </NavLink>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-crit hover:bg-crit-light transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crit"
              >
                <SignOut size={20} weight="regular" aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
