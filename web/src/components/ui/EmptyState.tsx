import { cn } from "../../lib/utils"
import { Inbox, Users, Shield, Search, Plus, Box, AlertCircle } from "@phosphor-icons/react"

interface EmptyStateProps {
  icon?: "inbox" | "users" | "shield" | "search" | "plus" | "box" | "alert"
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
  size?: "sm" | "md" | "lg"
}

const iconMap = {
  inbox: Inbox,
  users: Users,
  shield: Shield,
  search: Search,
  plus: Plus,
  box: Box,
  alert: AlertCircle,
}

const sizeClasses = {
  sm: "py-6 px-4",
  md: "py-12 px-6",
  lg: "py-16 px-8",
}

const iconSizes = {
  sm: 32,
  md: 48,
  lg: 64,
}

export function EmptyState({ icon = "inbox", title, description, action, className, size = "md" }: EmptyStateProps) {
  const Icon = iconMap[icon]

  return (
    <div
      className={cn(
        "text-center bg-ink rounded-lg border border-muted/20",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Icon size={iconSizes[size]} weight="regular" className="mx-auto text-muted/50 mb-4" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-ink mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm mx-auto">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

interface LoadingStateProps {
  message?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

export function LoadingState({ message = "Loading…", size = "md", className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", sizeClasses[size], className)} role="status" aria-live="polite">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" aria-hidden="true" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
  size?: "sm" | "md" | "lg"
}

export function ErrorState({ message, description, onRetry, retryLabel = "Try again", className, size = "md" }: ErrorStateProps) {
  return (
    <div className={cn("text-center bg-ink rounded-lg border border-crit/30 bg-crit/5", sizeClasses[size], className)} role="alert">
      <AlertCircle size={iconSizes[size]} weight="fill" className="mx-auto text-crit mb-4" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-crit mb-1">{message}</h3>
      {description && <p className="text-sm text-muted max-w-sm mx-auto mb-4">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-crit text-white text-sm font-medium rounded-lg hover:bg-crit/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crit focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}