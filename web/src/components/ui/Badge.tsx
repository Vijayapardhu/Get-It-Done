import { cn } from "../../lib/utils"
import { User } from "@phosphor-icons/react"

interface BadgeProps {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral"
  size?: "sm" | "md"
  dot?: boolean
  className?: string
}

const variantClasses = {
  default: "bg-muted/10 text-muted",
  success: "bg-ok/10 text-ok",
  warning: "bg-warn/10 text-warn",
  danger: "bg-crit/10 text-crit",
  info: "bg-accent/10 text-accent",
  neutral: "bg-surface/50 text-ink",
}

export function Badge({ children, variant = "default", size = "md", dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full px-2.5",
        size === "sm" && "py-0.5 text-xs",
        size === "md" && "py-1 text-sm",
        variantClasses[variant],
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", variantClasses[variant].replace("bg-", "bg-").replace("text-", ""))} aria-hidden="true" />}
      {children}
    </span>
  )
}

interface StatusPillProps {
  status: "verified" | "submitted" | "under_review" | "rejected" | "suspended" | "expired" | "draft" | "available" | "busy" | "offline"
  size?: "sm" | "md"
  showDot?: boolean
}

const statusConfig: Record<StatusPillProps["status"], { label: string; variant: BadgeProps["variant"] }> = {
  verified: { label: "Verified", variant: "success" },
  submitted: { label: "Submitted", variant: "info" },
  under_review: { label: "Under Review", variant: "warning" },
  rejected: { label: "Rejected", variant: "danger" },
  suspended: { label: "Suspended", variant: "danger" },
  expired: { label: "Expired", variant: "neutral" },
  draft: { label: "Draft", variant: "default" },
  available: { label: "Available", variant: "success" },
  busy: { label: "Busy", variant: "warning" },
  offline: { label: "Offline", variant: "neutral" },
}

export function StatusPill({ status, size = "md", showDot = true }: StatusPillProps) {
  const config = statusConfig[status] || { label: status, variant: "default" }
  return <Badge variant={config.variant} size={size} dot={showDot}>{config.label}</Badge>
}

interface AvatarProps {
  name: string
  src?: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}

const avatarSizes = {
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
  lg: "w-10 h-10 text-base",
  xl: "w-12 h-12 text-lg",
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover bg-muted/20", avatarSizes[size], className)}
        aria-hidden="true"
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-full bg-accent/10 flex items-center justify-center text-accent/60",
        avatarSizes[size],
        className
      )}
      aria-label={name}
    >
      <User size={size === "sm" ? 12 : size === "md" ? 16 : size === "lg" ? 20 : 24} weight="regular" />
    </div>
  )
}