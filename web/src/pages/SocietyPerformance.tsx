import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { SocietyPerformanceRow } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { formatMoney } from "../lib/utils"
import { ChartBar, Buildings, TrendUp, Star } from "@phosphor-icons/react"

export function SocietyPerformance() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["society-performance"],
    queryFn: () => adminApi.getSocietyPerformance().then((r) => r.data.societyPerformance),
  })

  const columns: Column<SocietyPerformanceRow>[] = [
    { key: "name", header: "Society", render: (_v, r) => (
      <div>
        <div className="text-sm font-medium text-ink">{r.name}</div>
        <div className="text-xs text-muted">{r.code} · {r.district}</div>
      </div>
    ) },
    { key: "total_workers", header: "Workers", align: "right", render: (_v, r) => (
      <div className="text-right">
        <span className="font-tabular">{r.total_workers}</span>
        <span className="text-xs text-muted ml-1">({r.verified_workers}✓)</span>
      </div>
    ), hideOnMobile: true },
    { key: "bookings_last_30d", header: "Bookings (30d)", align: "right", render: (_v, r) => <span className="font-tabular">{r.bookings_last_30d}</span> },
    { key: "earnings_last_30d", header: "Earnings (30d)", align: "right", render: (_v, r) => <span className="font-tabular text-ok">{formatMoney(r.earnings_last_30d)}</span> },
    { key: "avg_worker_rating", header: "Rating", align: "right", render: (_v, r) => r.avg_worker_rating ? (
      <span className="inline-flex items-center gap-1 font-tabular">
        <Star size={12} className="text-warn" weight="fill" />
        {Number(r.avg_worker_rating).toFixed(1)}
      </span>
    ) : "—", hideOnMobile: true },
    { key: "negative_reviews", header: "Neg. Reviews", align: "right", render: (_v, r) => r.negative_reviews > 0 ? (
      <span className="font-tabular text-crit">{r.negative_reviews}</span>
    ) : <span className="text-muted">0</span>, hideOnMobile: true },
  ]

  const sorted = data ? [...data].sort((a, b) => b.earnings_last_30d - a.earnings_last_30d) : []
  const totalWorkers = data?.reduce((sum, s) => sum + s.total_workers, 0) ?? 0
  const totalBookings = data?.reduce((sum, s) => sum + s.bookings_last_30d, 0) ?? 0
  const totalEarnings = data?.reduce((sum, s) => sum + Number(s.earnings_last_30d), 0) ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Society Performance"
        description="30-day performance comparison across all societies"
        icon={ChartBar}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load performance data" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading performance data…" />
      ) : data?.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No performance data" description="Performance data will appear once societies have bookings." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Total Societies" value={data!.length} icon={Buildings} />
            <SummaryCard label="Total Workers" value={totalWorkers} icon={TrendUp} />
            <SummaryCard label="Bookings (30d)" value={totalBookings} icon={ChartBar} />
            <SummaryCard label="Earnings (30d)" value={formatMoney(totalEarnings)} icon={TrendUp} />
          </div>

          <DataTable columns={columns} data={sorted} keyExtractor={(s) => s.id} loading={false} />
        </>
      )}
    </div>
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
