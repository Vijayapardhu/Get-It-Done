import { TrendUp, TrendDown } from "@phosphor-icons/react"
import { cn, toNumber } from "../../lib/utils"
import type { IconProps } from "@phosphor-icons/react"

interface StatCardProps {
  label: string
  value: number | string
  icon?: React.ComponentType<IconProps>
  accent?: "success" | "danger" | "info" | "warning" | "neutral"
  trend?: number
  trendLabel?: string
  subtitle?: string
  className?: string
}

const accentConfig = {
  success: { border: "border-l-ok", iconBg: "bg-ok-light", iconText: "text-ok" },
  danger: { border: "border-l-crit", iconBg: "bg-crit-light", iconText: "text-crit" },
  info: { border: "border-l-accent", iconBg: "bg-accent-light", iconText: "text-accent" },
  warning: { border: "border-l-warn", iconBg: "bg-warn-light", iconText: "text-warn" },
  neutral: { border: "border-l-border", iconBg: "bg-bg", iconText: "text-muted" },
}

export function StatCard({ label, value, icon: Icon, accent = "neutral", trend, trendLabel, subtitle, className }: StatCardProps) {
  const cfg = accentConfig[accent]
  const trendNum = trend != null ? toNumber(trend) : null

  return (
    <div className={cn(
      "bg-white rounded-xl border border-border border-l-4 p-5 transition-shadow hover:shadow-md hover:shadow-border/50",
      cfg.border,
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
          <div className="mt-2 text-2xl font-bold text-ink font-tabular">{value}</div>
          {subtitle && <div className="mt-1 text-xs text-muted">{subtitle}</div>}
          {trendNum !== null && trendNum !== 0 && (
            <div className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5",
              trendNum > 0 ? "bg-ok-light text-ok" : "bg-crit-light text-crit"
            )}>
              {trendNum > 0 ? <TrendUp size={12} /> : <TrendDown size={12} />}
              <span>{Math.abs(trendNum)}%</span>
              {trendLabel && <span className="text-muted font-normal">{trendLabel}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("flex-shrink-0 p-2.5 rounded-xl", cfg.iconBg)}>
            <Icon size={20} className={cfg.iconText} weight="duotone" />
          </div>
        )}
      </div>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ComponentType<IconProps>
  children?: React.ReactNode
}

export function PageHeader({ title, description, icon: Icon, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex-shrink-0 p-2 rounded-xl bg-accent-light">
            <Icon size={22} className="text-accent" weight="duotone" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink truncate">{title}</h1>
          {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  )
}
