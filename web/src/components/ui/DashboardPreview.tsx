import { Users, UserCheck, CurrencyInr, ClipboardText, CheckCircle, WifiHigh, Star, TrendUp } from "@phosphor-icons/react"

function MiniStat({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className={`p-1.5 rounded-md ${accent ?? "bg-accent/15 text-accent"}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted truncate">{label}</div>
        <div className="text-xs font-semibold text-ink font-tabular">{value}</div>
      </div>
    </div>
  )
}

function ActivityItem({ initials, name, action, time, status }: { initials: string; name: string; action: string; time: string; status: "verified" | "pending" | "active" }) {
  const statusColors = {
    verified: "bg-ok/15 text-ok",
    pending: "bg-warn/15 text-warn",
    active: "bg-accent/15 text-accent",
  }
  const statusIcons = {
    verified: CheckCircle,
    pending: ClipboardText,
    active: WifiHigh,
  }
  const StatusIcon = statusIcons[status]
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[9px] font-semibold text-accent shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-ink truncate"><span className="font-medium">{name}</span> <span className="text-muted">{action}</span></div>
        <div className="text-[9px] text-muted/60">{time}</div>
      </div>
      <div className={`p-1 rounded ${statusColors[status]}`}>
        <StatusIcon size={10} />
      </div>
    </div>
  )
}

function MiniChart() {
  const bars = [35, 52, 41, 68, 45, 72, 58, 80, 64, 90, 75, 95]
  return (
    <div className="flex items-end gap-[3px] h-16">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-accent/20"
          style={{ height: `${h}%`, background: i === bars.length - 1 ? "var(--color-accent)" : `color-mix(in srgb, var(--color-accent) ${15 + (h / 100) * 25}%, transparent)` }}
        />
      ))}
    </div>
  )
}

export function DashboardPreview() {
  return (
    <div className="relative w-full max-w-md mx-auto" style={{ animation: "fadeInUp 0.8s ease-out both" }}>
      {/* Glow effect behind the card */}
      <div className="absolute -inset-8 bg-accent/[0.07] rounded-[40px] blur-3xl" aria-hidden="true" />

      {/* Main dashboard card */}
      <div className="relative bg-surface/80 backdrop-blur-sm rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-ok animate-pulse" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-ink">Live Dashboard</span>
          </div>
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-crit/60" aria-hidden="true" />
            <div className="w-2.5 h-2.5 rounded-full bg-warn/60" aria-hidden="true" />
            <div className="w-2.5 h-2.5 rounded-full bg-ok/60" aria-hidden="true" />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 p-3">
          <MiniStat icon={Users} label="Total Workers" value="248" />
          <MiniStat icon={UserCheck} label="Verified" value="192" accent="bg-ok/15 text-ok" />
          <MiniStat icon={WifiHigh} label="Online Now" value="37" accent="bg-accent/15 text-accent" />
          <MiniStat icon={CurrencyInr} label="Earnings" value="₹4.2L" accent="bg-warn/15 text-warn" />
        </div>

        {/* Chart section */}
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted">Earnings · 12 weeks</span>
              <span className="text-[10px] font-medium text-ok flex items-center gap-0.5">
              <TrendUp size={10} /> +12%
            </span>
          </div>
          <MiniChart />
        </div>

        {/* Activity feed */}
        <div className="px-3 pb-3 pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-muted">Recent Verifications</span>
            <span className="text-[9px] text-accent cursor-pointer hover:underline">View all</span>
          </div>
          <div className="space-y-0.5">
            <ActivityItem initials="RK" name="Rajesh K." action="verified" time="2m ago" status="verified" />
            <ActivityItem initials="SP" name="Sneha P." action="submitted" time="5m ago" status="pending" />
            <ActivityItem initials="AM" name="Arun M." action="now online" time="8m ago" status="active" />
            <ActivityItem initials="PK" name="Priya K." action="verified" time="12m ago" status="verified" />
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -left-4 top-12 bg-surface/90 backdrop-blur-sm rounded-lg border border-white/[0.08] px-2.5 py-1.5 shadow-lg" style={{ animation: "float 4s ease-in-out infinite" }}>
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded bg-ok/15"><CheckCircle size={11} className="text-ok" /></div>
          <span className="text-[10px] font-medium text-ink">12 verified today</span>
        </div>
      </div>

      <div className="absolute -right-3 bottom-16 bg-surface/90 backdrop-blur-sm rounded-lg border border-white/[0.08] px-2.5 py-1.5 shadow-lg" style={{ animation: "float 5s ease-in-out infinite", animationDelay: "1s" }}>
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded bg-accent/15"><Star size={11} className="text-accent" /></div>
          <span className="text-[10px] font-medium text-ink">4.8 avg rating</span>
        </div>
      </div>
    </div>
  )
}
