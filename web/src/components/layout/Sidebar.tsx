import { NavLink, useLocation } from "react-router-dom"
import { cn } from "../../lib/utils"
import {
  House,
  Activity,
  Users,
  Box,
  Tag,
  DollarSign,
  CreditCard,
  User,
  Headphones,
  BarChart2,
  Building2,
  Shield,
  Settings,
  ChevronRight,
  ChevronLeft,
} from "@phosphor-icons/react"
import { useAuth } from "../../lib/AuthContext"
import { useState } from "react"

const navigation = [
  { key: "overview", label: "Overview", icon: House, href: "/", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "operations", label: "Operations", icon: Activity, href: "/operations", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "workforce", label: "Workforce", icon: Users, href: "/workforce", roles: ["system_admin", "federation_admin", "society_admin"] },
  { key: "catalogue", label: "Catalogue", icon: Box, href: "/catalogue", roles: ["system_admin", "federation_admin", "society_admin"] },
  { key: "pricing", label: "Pricing", icon: Tag, href: "/pricing", roles: ["system_admin", "federation_admin"] },
  { key: "finance", label: "Finance", icon: DollarSign, href: "/finance", roles: ["system_admin", "federation_admin", "support_staff"] },
  { key: "customers", label: "Customers", icon: User, href: "/customers", roles: ["system_admin", "support_staff"] },
  { key: "support", label: "Support", icon: Headphones, href: "/support", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "insight", label: "Insight", icon: BarChart2, href: "/insight", roles: ["system_admin", "federation_admin", "society_admin", "support_staff"] },
  { key: "organisation", label: "Organisation", icon: Building2, href: "/organisation", roles: ["system_admin", "federation_admin"] },
  { key: "system", label: "System", icon: Settings, href: "/system", roles: ["system_admin"] },
] as const

type NavKey = (typeof navigation)[number]["key"]

export function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const filteredNav = navigation.filter((item) => user && item.roles.includes(user.role))

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/"
    return location.pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 bottom-0 z-40 bg-ink/95 backdrop-blur border-r border-muted/20 transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
      aria-label="Main navigation"
    >
      <nav className="flex flex-col h-full p-2 space-y-1 overflow-y-auto scrollbar-thin" role="navigation">
        {filteredNav.map((item) => {
          const active = isActive(item.href)
          return (
            <NavLink
              key={item.key}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-ink hover:bg-muted/10",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
              "aria-current={active ? "page" : undefined}"
            >
              <item.icon size={20} weight="regular" aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}

        <div className="flex-1" />

        {!collapsed && (
          <div className="border-t border-muted/20 pt-2">
            <NavLink
              to="/"
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-crit hover:bg-crit/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crit"
            >
              <Shield size={20} weight="regular" aria-hidden="true" />
              <span>Sign out</span>
            </NavLink>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 p-1.5 rounded-full bg-muted/20 text-muted hover:bg-muted/30 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            collapsed && "rotate-180"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </nav>
    </aside>
  )
}