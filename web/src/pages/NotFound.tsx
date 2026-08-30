import { Link } from "react-router-dom"
import { House } from "@phosphor-icons/react"

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8FAFC" }}>
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6" style={{ background: "#2E5FD9" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
            <circle cx="12" cy="12" r="2.5" fill="white" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold" style={{ color: "#0F172A" }}>404</h1>
        <p className="mt-2 text-lg" style={{ color: "#64748B" }}>Page not found</p>
        <p className="mt-2 text-sm" style={{ color: "#94A3B8" }}>The page you're looking for doesn't exist or has been moved.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ background: "#2E5FD9" }}
        >
          <House size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
