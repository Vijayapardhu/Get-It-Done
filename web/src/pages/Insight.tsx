import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { LoadingState, ErrorState } from "../components/ui/EmptyState"
import { PageHeader } from "../components/ui/PageHeader"
import { NoDataIllustration } from "../components/ui/Illustrations"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from "recharts"
import { formatMoney } from "../lib/utils"
import { ChartBar, Package, MapPin, Users } from "@phosphor-icons/react"
import { useAuth } from "../lib/AuthContext"

const COLORS = ["var(--color-accent)", "var(--color-ok)", "var(--color-warn)", "var(--color-crit)", "var(--color-muted)"]

export function Insight() {
  const { user } = useAuth()
  const isFederation = user?.role === "federation_admin" || user?.role === "system_admin"

  const { data: bookingData, isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ["booking-analytics"],
    queryFn: () => adminApi.getBookingAnalytics().then((r) => r.data),
    enabled: isFederation,
  })

  const { data: workerData, isLoading: workersLoading } = useQuery({
    queryKey: ["worker-analytics"],
    queryFn: () => adminApi.getWorkerAnalytics().then((r) => r.data),
    enabled: isFederation,
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["revenue-analytics"],
    queryFn: () => adminApi.getRevenueAnalytics().then((r) => r.data),
    enabled: isFederation,
  })

  if (!isFederation) {
    return <CooperativeInsight />
  }

  const isLoading = bookingsLoading || workersLoading || revenueLoading
  const isError = bookingsError

  if (isLoading) return <LoadingState message="Loading analytics…" />
  if (isError) return <div className="max-w-md mx-auto mt-12"><ErrorState message="Failed to load analytics" onRetry={() => refetchBookings()} /></div>

  const statusData = bookingData?.by_status?.map((s) => ({ name: s.status, value: s.count })) ?? []
  const serviceData = bookingData?.by_service?.slice(0, 8).map((s) => ({ name: s.service_name, bookings: s.count })) ?? []
  const societyData = workerData?.by_cooperative?.slice(0, 8).map((s) => ({ name: s.cooperative_name.length > 15 ? s.cooperative_name.slice(0, 15) + "…" : s.cooperative_name, workers: s.workers, verified: s.verified })) ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" description="Federation-wide booking, worker, and revenue analytics" icon={ChartBar} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Bookings" value={bookingData?.total_bookings ?? 0} icon={Package} />
        <SummaryCard label="Completed" value={bookingData?.completed ?? 0} icon={ChartBar} />
        <SummaryCard label="Total Workers" value={workerData?.total_workers ?? 0} icon={Users} />
        <SummaryCard label="Total Revenue" value={formatMoney(revenueData?.total_revenue ?? 0)} icon={MapPin} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Bookings by Status</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted">No booking data</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Bookings by Service</h3>
          {serviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={serviceData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} width={80} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#2E5FD9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted">No service data</div>
          )}
        </div>
      </div>

      {societyData.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Workers by Society</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={societyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="workers" fill="#2E5FD9" name="Total" radius={[4, 4, 0, 0]} />
              <Bar dataKey="verified" fill="#16A34A" name="Verified" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {revenueData?.trend && revenueData.trend.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData.trend.map((t) => ({ name: t.date.slice(5), revenue: t.revenue }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [formatMoney(Number(v)), "Revenue"]} />
              <Bar dataKey="revenue" fill="#2E5FD9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function CooperativeInsight() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cooperative-analytics"],
    queryFn: () => adminApi.getAnalytics().then((r) => r.data),
  })

  if (isLoading) return <LoadingState message="Loading analytics…" />
  if (isError || !data) return <div className="max-w-md mx-auto mt-12"><ErrorState message="Failed to load analytics" onRetry={() => refetch()} /></div>

  return (
    <div className="space-y-6">
      <PageHeader title="Insight" description="Demand, utilization and performance trends" icon={ChartBar} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Service Demand</h3>
          {data.serviceDemand.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <NoDataIllustration className="w-28 h-20" />
              <p className="text-sm text-muted">No demand data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.serviceDemand.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} width={85} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="demand" fill="var(--color-accent)" name="Bookings" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Worker Status Mix</h3>
          <StatusPie data={data.workerUtilization} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-ink mb-4">Area Demand</h3>
        {data.areaDemand.length === 0 ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <NoDataIllustration className="w-28 h-20" />
            <p className="text-sm text-muted">No area demand data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.areaDemand} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="area" tick={{ fontSize: 10, fill: "#64748B" }} width={85} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="total_requests" fill="var(--color-accent)" name="Requests" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function StatusPie({ data }: { data: Array<{ current_status: string; total_assigned: string | number }> | undefined }) {
  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-sm text-muted">No data</div>
  }
  const chartData = data.map((d) => ({ name: d.current_status, value: Number(d.total_assigned) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name }) => name}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-accent-light">
          <Icon size={14} className="text-accent" />
        </div>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-ink font-tabular">{value}</p>
    </div>
  )
}
