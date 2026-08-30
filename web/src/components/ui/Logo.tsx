export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="currentColor" className="text-accent" />
      <path d="M16 6l9 5v10l-9 5-9-5V11l9-5z" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 6v20M7 11l9 5 9-5" stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <circle cx="16" cy="16" r="3.5" fill="white" />
      <path d="M14.5 14.5l1.5 1.5 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />
    </svg>
  )
}

export function LogoFull({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={32} />
      <span className="text-lg font-bold text-ink">The Cooperative Desk</span>
    </div>
  )
}
