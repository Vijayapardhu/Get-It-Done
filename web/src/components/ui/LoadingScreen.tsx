export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#F8FAFC" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#2E5FD9" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
          <circle cx="12" cy="12" r="2.5" fill="white" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#2E5FD9", animationDelay: "0ms" }} />
        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#2E5FD9", animationDelay: "150ms" }} />
        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#2E5FD9", animationDelay: "300ms" }} />
      </div>
      <p className="text-sm" style={{ color: "#64748B" }}>Loading…</p>
    </div>
  )
}
