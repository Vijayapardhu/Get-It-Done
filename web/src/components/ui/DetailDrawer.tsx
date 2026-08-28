import { cn } from "../../lib/utils"
import { X, ChevronLeft, ChevronRight } from "@phosphor-icons/react"
import { useEffect, useRef, KeyboardEvent } from "react"
import { createPortal } from "react-dom"

interface DetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  width?: "sm" | "md" | "lg" | "xl" | "full"
  position?: "right" | "left"
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
}

const widthClasses = {
  sm: "w-80",
  md: "w-96",
  lg: "w-[36rem]",
  xl: "w-[48rem]",
  full: "w-full max-w-[90vw]",
}

export function DetailDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = "lg",
  position = "right",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = "hidden"
      drawerRef.current?.focus()

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && closeOnEscape) {
          onClose()
        }
        if (e.key === "Tab") {
          const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          if (focusableElements && focusableElements.length > 0) {
            const firstElement = focusableElements[0]
            const lastElement = focusableElements[focusableElements.length - 1]
            if (e.shiftKey && document.activeElement === firstElement) {
              e.preventDefault()
              lastElement.focus()
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              e.preventDefault()
              firstElement.focus()
            }
          }
        }
      }

      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
        document.body.style.overflow = ""
        previousFocusRef.current?.focus()
      }
    }
  }, [isOpen, closeOnEscape, onClose])

  if (!isOpen) return null

  const drawerContent = (
    <div
      className={cn(
        "fixed inset-0 z-50 flex",
        position === "right" ? "justify-end" : "justify-start"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        aria-hidden="true"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={cn(
          "relative flex flex-col bg-ink border-l border-muted/20 shadow-xl",
          "animate-slide-in",
          widthClasses[width],
          position === "left" && "border-l-0 border-r border-muted/20"
        )}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-muted/20 sticky top-0 bg-ink z-10">
          <div className="flex-1 mr-4">
            <h2 id="drawer-title" className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-muted/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close drawer"
            >
              <X size={20} weight="regular" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(drawerContent, document.body)
}

interface DetailDrawerHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function DetailDrawerHeader({ title, subtitle, actions }: DetailDrawerHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4 pb-4 border-b border-muted/20">
      <div>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
    </div>
  )
}

interface DetailDrawerSectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function DetailDrawerSection({ title, children, className }: DetailDrawerSectionProps) {
  return (
    <div className={cn("mb-6", className)}>
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  )
}

interface DetailDrawerFieldProps {
  label: string
  value: React.ReactNode
  className?: string
  copyable?: boolean
  copyValue?: string
}

export function DetailDrawerField({ label, value, className, copyable, copyValue }: DetailDrawerFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1 mb-4", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-ink break-all">{value}</span>
        {copyable && copyValue && (
          <button
            onClick={() => navigator.clipboard.writeText(copyValue)}
            className="p-1 text-muted hover:text-ink transition-colors"
            aria-label={`Copy ${label}`}
          >
            <Copy size={14} weight="regular" />
          </button>
        )}
      </div>
    </div>
  )
}

import { Copy } from "@phosphor-icons/react"