import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { LoadingState, ErrorState } from "../components/ui/EmptyState"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { formatMoney, formatRelativeTime } from "../lib/utils"
import type { IconProps } from "@phosphor-icons/react"
import {
  Buildings,
  Users,
  UserCheck,
  WifiHigh,
  WarningCircle,
  ClipboardText,
  CheckCircle,
  Star,
  CurrencyInr,
  ArrowClockwise,
  ShieldCheck,
  Clock,
  Check,
  MapPin,
  TrendUp,
} from "@phosphor-icons/react"
import { useAuth } from "../lib/AuthContext"

export function Overview() {
  const { user } = useAuth()
  const isFederation = user?.role === "federation_admin" || user?.role === "system_admin"

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["federation-overview"],
    queryFn: () => adminApi.getFederationOverview().then((r) => r.data.overview),
    enabled: isFederation,
  })

  const { data: operationsData } = useQuery({
    queryKey: ["federation-operations"],
    queryFn: () => adminApi.getLiveOperations().then((r) => r.data),
    enabled: isFederation,
  })

  const { data: regionalData } = useQuery({
    queryKey: ["regional-demand"],
    queryFn: () => adminApi.getRegionalDemand().then((r) => r.data.regionalDemand),
    enabled: isFederation,
  })

  const { data: auditData } = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => adminApi.getAuditEvents().then((r) => r.data),
  })

  if (isLoading && isFederation) return <LoadingState message="Loading federation overview…" />
  if (isError && isFederation) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <ErrorState message="Failed to load federation overview" onRetry={() => refetch()} />
      </div>
    )
  }

  if (!isFederation) {
    return <CooperativeOverview />
  }

  const overview = data!
  const activeEmergencies = overview.activeEmergencyRequests
  const pendingVerifications = overview.totalWorkers - overview.workerUtilization.total_verified
  const activeBookings = operationsData?.activeBookings?.length ?? 0
  const delayedJobs = operationsData?.activeBookings?.filter((b) => b.status === "assigned").length ?? 0
  const hasAlerts = activeEmergencies > 0 || pendingVerifications > 0 || delayedJobs > 0

  const earningsBySociety = (regionalData ?? [])
    .map((r) => ({ name: r.cooperative_name, earnings: Number(r.earnings) }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Federation Overview</h1>
          <p className="text-sm text-muted mt-0.5">Live pulse across all {overview.totalSocieties} societies</p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <div className="flex items-center gap-1.5 text-xs text-accent">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>Refreshing…</span>
            </div>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted bg-white border border-border rounded-lg hover:bg-bg hover:text-ink transition-colors disabled:opacity-50"
          >
            <ArrowClockwise size={14} className={isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {hasAlerts ? (
        <div className="bg-warn-light/30 rounded-lg border border-warn/20 px-4 py-2.5 flex items-center gap-2">
          <WarningCircle size={16} className="text-warn" />
          <span className="text-sm text-warn font-medium">
            Attention required: {activeEmergencies > 0 && `${activeEmergencies} active emergency${activeEmergencies > 1 ? "ies" : "y"}, `}
            {pendingVerifications > 0 && `${pendingVerifications} unverified worker${pendingVerifications > 1 ? "s" : ""}, `}
            {delayedJobs > 0 && `${delayedJobs} assigned job${delayedJobs > 1 ? "s" : ""}`}
          </span>
        </div>
      ) : (
        <div className="bg-ok-light/30 rounded-lg border border-ok/20 px-4 py-2.5 flex items-center gap-2">
          <CheckCircle size={16} className="text-ok" />
          <span className="text-sm text-ok font-medium">All societies operational — no urgent actions required.</span>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">Federation Summary</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Societies" value={overview.totalSocieties} icon={Buildings} accent="info" href="/societies" />
          <KpiCard label="Total Workers" value={overview.totalWorkers} icon={Users} accent="info" href="/workforce" />
          <KpiCard label="Customers" value={overview.totalCustomers} icon={UserCheck} accent="info" />
          <KpiCard label="Bookings" value={overview.totalBookings} icon={ClipboardText} accent="info" href="/operations" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">Workforce & Operations</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Verified Workers" value={overview.workerUtilization.total_verified} icon={ShieldCheck} accent="success" href="/workforce" />
          <KpiCard label="Active Jobs" value={activeBookings} icon={WifiHigh} accent="info" href="/operations" />
          <KpiCard label="Total Earnings" value={formatMoney(overview.totalEarnings)} icon={CurrencyInr} accent="success" href="/finance" />
          <KpiCard label="Emergencies" value={activeEmergencies} icon={WarningCircle} accent={activeEmergencies > 0 ? "danger" : "neutral"} href="/operations" />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Earnings by Society</h3>
              <p className="text-xs text-muted">Revenue distribution</p>
            </div>
            <div className="p-1.5 rounded-lg bg-ok-light">
              <CurrencyInr size={14} className="text-ok" />
            </div>
          </div>
          {earningsBySociety.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={earningsBySociety} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} width={100} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v) => [formatMoney(Number(v)), "Earnings"]}
                />
                <Bar dataKey="earnings" fill="#2E5FD9" name="Earnings" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted">No earnings data yet</div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Welfare</h3>
              <p className="text-xs text-muted">Worker welfare indicators</p>
            </div>
            <div className="p-1.5 rounded-lg bg-accent-light">
              <TrendUp size={14} className="text-accent" />
            </div>
          </div>
          <div className="space-y-3">
            <WelfareRow label="Insured Workers" value={overview.welfare.insured_workers} total={overview.welfare.total_workers} />
            <WelfareRow label="Trained Workers" value={overview.welfare.trained_workers} total={overview.welfare.total_workers} />
            <WelfareRow label="Critical Incidents" value={overview.welfare.critical_incidents} variant="danger" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-muted" />
            Top Societies by Demand
          </h2>
          <TopSocieties data={regionalData ?? []} />
        </section>

        <section className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <Clock size={16} className="text-muted" />
            Recent Activity
          </h2>
          <RecentActivity data={auditData?.events ?? []} />
        </section>
      </div>
    </div>
  )
}

function CooperativeOverview() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["cooperative-overview"],
    queryFn: () => adminApi.getDashboardOverview().then((r) => r.data.overview),
  })

  const { data: operationsData } = useQuery({
    queryKey: ["cooperative-operations"],
    queryFn: () => adminApi.getOperations().then((r) => r.data),
  })

  const { data: auditData } = useQuery({
    queryKey: ["audit-events"],
    queryFn: () => adminApi.getAuditEvents().then((r) => r.data),
  })

  if (isLoading) return <LoadingState message="Loading dashboard…" />
  if (isError || !data) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <ErrorState message="Failed to load dashboard" onRetry={() => refetch()} />
      </div>
    )
  }

  const pendingVerifications = data.totalWorkers - data.verifiedWorkers
  const activeEmergencies = data.activeEmergencyRequests
  const delayedJobs = operationsData?.delayedJobs?.length ?? 0
  const openComplaints = operationsData?.complaints?.length ?? 0
  const hasAlerts = activeEmergencies > 0 || pendingVerifications > 0 || delayedJobs > 0 || openComplaints > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Cooperative Overview</h1>
          <p className="text-sm text-muted mt-0.5">Live pulse of your workforce and operations</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted bg-white border border-border rounded-lg hover:bg-bg">
          <ArrowClockwise size={14} className={isFetching ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {hasAlerts ? (
        <div className="bg-warn-light/30 rounded-lg border border-warn/20 px-4 py-2.5 flex items-center gap-2">
          <WarningCircle size={16} className="text-warn" />
          <span className="text-sm text-warn font-medium">Attention required</span>
        </div>
      ) : (
        <div className="bg-ok-light/30 rounded-lg border border-ok/20 px-4 py-2.5 flex items-center gap-2">
          <CheckCircle size={16} className="text-ok" />
          <span className="text-sm text-ok font-medium">All systems operational</span>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">Workforce</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total Workers" value={data.totalWorkers} icon={Users} accent="info" href="/workforce" />
          <KpiCard label="Verified" value={data.verifiedWorkers} icon={UserCheck} accent="success" href="/workforce" />
          <KpiCard label="Online Now" value={data.activeWorkers} icon={WifiHigh} accent="info" href="/workforce" />
          <KpiCard label="Emergencies" value={data.activeEmergencyRequests} icon={WarningCircle} accent={data.activeEmergencyRequests > 0 ? "danger" : "neutral"} href="/operations" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">Operations</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total Bookings" value={data.totalBookings} icon={ClipboardText} accent="info" href="/operations" />
          <KpiCard label="Completed" value={data.completedJobs} icon={CheckCircle} accent="success" href="/operations" />
          <KpiCard label="Earnings" value={formatMoney(data.totalEarnings)} icon={CurrencyInr} accent="success" href="/finance" />
          <KpiCard label="Avg Rating" value={data.averageRating ? data.averageRating.toFixed(1) : "—"} icon={Star} accent="warning" href="/workforce" />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <WarningCircle size={16} className="text-warn" />
            Needs Attention
          </h2>
          <NeedsAttention
            emergencies={activeEmergencies}
            pendingVerifications={pendingVerifications}
            delayedJobs={delayedJobs}
            openComplaints={openComplaints}
          />
        </section>
        <section className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <Clock size={16} className="text-muted" />
            Recent Activity
          </h2>
          <RecentActivity data={auditData?.events ?? []} />
        </section>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "neutral",
  subtitle,
  href,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<IconProps>
  accent?: "success" | "danger" | "info" | "warning" | "neutral"
  subtitle?: string
  href?: string
}) {
  const accentStyles = {
    info: "bg-accent-light text-accent",
    success: "bg-ok-light text-ok",
    warning: "bg-warn-light text-warn",
    danger: "bg-crit-light text-crit",
    neutral: "bg-bg text-muted",
  }

  const content = (
    <div className="bg-white rounded-xl border border-border p-4 hover:shadow-sm hover:border-accent/30 transition-all cursor-pointer">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-ink mt-1 font-tabular">{value}</p>
          {subtitle && <p className="text-xs text-muted mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg shrink-0 ${accentStyles[accent]}`}>
          <Icon size={18} weight="duotone" />
        </div>
      </div>
    </div>
  )

  if (href) return <a href={href} className="block">{content}</a>
  return content
}

function WelfareRow({ label, value, total, variant = "info" }: { label: string; value: number; total?: number; variant?: "info" | "danger" }) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null
  const color = variant === "danger" ? "text-crit" : "text-accent"
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink">{label}</span>
          <span className={`text-sm font-medium font-tabular ${color}`}>{value}{pct !== null ? ` (${pct}%)` : ""}</span>
        </div>
        {total && (
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${variant === "danger" ? "bg-crit" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function TopSocieties({ data }: { data: Array<{ cooperative_name: string; total_bookings: number; available_workers: number }> }) {
  if (data.length === 0) {
    return <div className="py-4 text-sm text-muted">No demand data yet</div>
  }
  const sorted = [...data].sort((a, b) => b.total_bookings - a.total_bookings).slice(0, 6)
  return (
    <div className="space-y-2">
      {sorted.map((s, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink truncate">{s.cooperative_name}</p>
            <p className="text-xs text-muted">{s.available_workers} workers available</p>
          </div>
          <span className="text-sm font-medium text-accent font-tabular">{s.total_bookings} bookings</span>
        </div>
      ))}
    </div>
  )
}

function NeedsAttention({
  emergencies,
  pendingVerifications,
  delayedJobs,
  openComplaints,
}: {
  emergencies: number
  pendingVerifications: number
  delayedJobs: number
  openComplaints: number
}) {
  const items = [
    { condition: emergencies > 0, icon: WarningCircle, label: "Active Emergencies", value: emergencies, href: "/operations", variant: "danger" as const },
    { condition: pendingVerifications > 0, icon: ShieldCheck, label: "Pending Verifications", value: pendingVerifications, href: "/workforce", variant: "warning" as const },
    { condition: delayedJobs > 0, icon: Clock, label: "Delayed Jobs", value: delayedJobs, href: "/operations", variant: "warning" as const },
    { condition: openComplaints > 0, icon: ClipboardText, label: "Open Complaints", value: openComplaints, href: "/support", variant: "warning" as const },
  ].filter((item) => item.condition)

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-ok">
        <Check size={16} />
        <span className="text-sm">Everything looks good — no urgent actions.</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <a key={i} href={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${item.variant === "danger" ? "bg-crit-light/50 border-crit/20" : "bg-warn-light/50 border-warn/20"}`}>
          <div className="flex items-center gap-2">
            <item.icon size={16} className={item.variant === "danger" ? "text-crit" : "text-warn"} />
            <span className="text-sm text-ink">{item.label}</span>
          </div>
          <span className={`text-sm font-bold font-tabular ${item.variant === "danger" ? "text-crit" : "text-warn"}`}>{item.value}</span>
        </a>
      ))}
    </div>
  )
}

function RecentActivity({ data }: { data: Array<{ action: string; createdAt: string }> }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted">
        <Clock size={16} />
        <span className="text-sm">No recent activity</span>
      </div>
    )
  }
  return (
    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
      {data.slice(0, 8).map((event, i) => (
        <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
          <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink truncate">{formatAuditAction(event.action)}</p>
            <p className="text-xs text-muted">{formatRelativeTime(event.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatAuditAction(action: string): string {
  const actionMap: Record<string, string> = {
    "worker.verification.approved": "Worker verified",
    "worker.verification.rejected": "Worker verification rejected",
    "worker.verification.suspended": "Worker suspended",
    "booking.created": "New booking created",
    "booking.completed": "Booking completed",
    "support.ticket.created": "Support ticket created",
    "emergency.reported": "Emergency reported",
    "user.registered": "New user registered",
    "service.created": "Service added",
    "role.assigned": "Role assigned",
  }
  return actionMap[action] || action.replace(/\./g, " ").replace(/_/g, " ")
}
