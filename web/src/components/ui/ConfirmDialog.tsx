import { cn } from "../../lib/utils"
import { X, CheckCircle, AlertTriangle } from "@phosphor-icons/react"
import { useEffect, useRef, KeyboardEvent } from "react"
import { createPortal } from "react-dom"

export type ConfirmVariant = "destructive" | "warning" | "info" | "success"

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  requireReason?: boolean
  reasonPlaceholder?: string
  reasonLabel?: string
  loading?: boolean
}

const variantStyles = {
  destructive: "border-crit/30 bg-crit/5",
  warning: "border-warn/30 bg-warn/5",
  info: "border-accent/30 bg-accent/5",
  success: "border-ok/30 bg-ok/5",
}

const variantIconStyles = {
  destructive: "text-crit",
  warning: "text-warn",
  info: "text-accent",
  success: "text-ok",
}

const variantButtonStyles = {
  destructive: "bg-crit hover:bg-crit/90 text-white",
  warning: "bg-warn hover:bg-warn/90 text-ink",
  info: "bg-accent hover:bg-accent/90 text-white",
  success: "bg-ok hover:bg-ok/90 text-white",
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  requireReason = false,
  reasonPlaceholder = "Enter reason…",
  reasonLabel = "Reason (required)",
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = "hidden"
      setTimeout(() => dialogRef.current?.focus(), 0)
      if (requireReason) {
        setTimeout(() => reasonRef.current?.focus(), 100)
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose()
        }
        if (e.key === "Tab") {
          const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
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
  }, [isOpen, onClose, requireReason])

  const handleConfirm = () => {
    if (requireReason && !reason.trim()) {
      reasonRef.current?.focus()
      return
    }
    onConfirm()
  }

  const canConfirm = !requireReason || reason.trim().length > 0

  if (!isOpen) return null

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
    >
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md bg-ink rounded-xl shadow-xl animate-scale-in",
          variantStyles[variant]
        )}
      >
        <div className="flex items-start gap-3 p-5 border-b border-muted/20">
          <div className={cn("flex-shrink-0 mt-0.5", variantIconStyles[variant])}>
            {variant === "destructive" && <AlertTriangle size={24} weight="fill" />}
            {variant === "warning" && <AlertTriangle size={24} weight="regular" />}
            {variant === "info" && <CheckCircle size={24} weight="regular" />}
            {variant === "success" && <CheckCircle size={24} weight="fill" />}
          </div>
          <div className="flex-1">
            <h2 id="confirm-title" className="text-lg font-semibold text-ink">{title}</h2>
            <p id="confirm-description" className="text-sm text-muted mt-1">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-lg text-muted hover:text-ink hover:bg-muted/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close dialog"
          >
            <X size={18} weight="regular" />
          </button>
        </div>

        {requireReason && (
          <div className="p-5 border-b border-muted/20">
            <label htmlFor="confirm-reason" className="block text-sm font-medium text-muted mb-2">
              {reasonLabel}
            </label>
            <textarea
              ref={reasonRef}
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full px-3 py-2 bg-muted/10 border border-muted/20 rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
              aria-required="true"
            />
            <p className="text-xs text-muted/70 mt-1">This will be recorded in the audit log.</p>
          </div>
        )}

        <div className="p-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted bg-muted/10 hover:bg-muted/20 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
              variantButtonStyles[variant],
              (!canConfirm || loading) && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}

import { useState } from "react"