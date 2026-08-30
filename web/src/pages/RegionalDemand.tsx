import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { RegionalDemandRow } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { formatMoney } from "../lib/utils"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { MapPin, ClipboardText, Users, WarningCircle } from "@phosphor-icons/react"

export function RegionalDemand() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["regional-demand"],
    queryFn: () => adminApi.getRegionalDemand().then((r) => r.data.regionalDemand),
  })

  const columns: Column<RegionalDemandRow>[] = [
    { key: "cooperative_name", header: "Society", render: (_v, r) => (
      <div>
        <div className="text-sm font-medium text-ink">{r.cooperative_name}</div>
        <div className="text-xs text-muted">{r.district}, {r.state}</div>
      </div>
    ) },
    { key: "total_bookings", header: "Bookings", align: "right", render: (_v, r) => <span className="font-tabular">{r.total_bookings}</span> },
    { key: "emergency_bookings", header: "Emergencies", align: "right", render: (_v, r) => r.emergency_bookings > 0 ? (
      <span className="font-tabular text-crit">{r.emergency_bookings}</span>
    ) : <span className="text-muted">0</span>, hideOnMobile: true },
    { key: "unassigned", header: "Unassigned", align: "right", render: (_v, r) => r.unassigned > 0 ? (
      <span className="font-tabular text-warn">{r.unassigned}</span>
    ) : <span className="text-muted">0</span>, hideOnMobile: true },
    { key: "available_workers", header: "Available", align: "right", render: (_v, r) => <span className="font-tabular">{r.available_workers}</span> },
    { key: "earnings", header: "Earnings", align: "right", render: (_v, r) => <span className="font-tabular text-ok">{formatMoney(r.earnings)}</span>, hideOnMobile: true },
  ]

  const sorted = data ? [...data].sort((a, b) => b.total_bookings - a.total_bookings) : []
  const chartData = sorted.slice(0, 10).map((r) => ({
    name: r.cooperative_name.length > 15 ? r.cooperative_name.slice(0, 15) + "…" : r.cooperative_name,
    bookings: r.total_bookings,
    emergencies: r.emergency_bookings,
    unassigned: r.unassigned,
  }))

  const totalBookings = data?.reduce((sum, r) => sum + r.total_bookings, 0) ?? 0
  const totalEmergencies = data?.reduce((sum, r) => sum + r.emergency_bookings, 0) ?? 0
  const totalUnassigned = data?.reduce((sum, r) => sum + r.unassigned, 0) ?? 0
  const totalAvailable = data?.reduce((sum, r) => sum + r.available_workers, 0) ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Regional Demand"
        description="Demand and workforce distribution across societies"
        icon={MapPin}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load regional demand" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading regional demand…" />
      ) : data?.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="alert" title="No demand data" description="Regional demand data will appear once bookings are made." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Total Bookings" value={totalBookings} icon={ClipboardText} />
            <SummaryCard label="Emergencies" value={totalEmergencies} icon={WarningCircle} variant="danger" />
            <SummaryCard label="Unassigned" value={totalUnassigned} icon={MapPin} variant="warning" />
            <SummaryCard label="Available Workers" value={totalAvailable} icon={Users} />
          </div>

          {chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-ink mb-3">Bookings by Society</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="bookings" fill="#2E5FD9" name="Bookings" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="emergencies" fill="#DC2626" name="Emergencies" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable columns={columns} data={sorted} keyExtractor={(r) => r.cooperative_id} loading={false} />
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, variant = "info" }: { label: string; value: number; icon: React.ComponentType<{ size?: number; className?: string }>; variant?: "info" | "danger" | "warning" }) {
  const colors = { info: "bg-accent-light text-accent", danger: "bg-crit-light text-crit", warning: "bg-warn-light text-warn" }
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[variant]}`}>
          <Icon size={14} className={variant === "danger" ? "text-crit" : variant === "warning" ? "text-warn" : "text-accent"} />
        </div>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-ink font-tabular">{value}</p>
    </div>
  )
}
