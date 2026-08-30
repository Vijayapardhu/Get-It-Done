import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { DataTable, type Column } from "../components/ui/DataTable"
import { formatMoney, formatDateTime } from "../lib/utils"
import { Badge } from "../components/ui/Badge"
import { CurrencyInr, Receipt, ArrowsClockwise, CheckCircle } from "@phosphor-icons/react"

export function FederationFinance() {
  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ["federation-overview"],
    queryFn: () => adminApi.getFederationOverview().then((r) => r.data.overview),
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["revenue-analytics"],
    queryFn: () => adminApi.getRevenueAnalytics().then((r) => r.data),
  })

  const { data: refundsData, isLoading: refundsLoading } = useQuery({
    queryKey: ["refunds"],
    queryFn: () => adminApi.getRefunds({ limit: 20 }).then((r) => r.data),
  })

  const { data: reconciliationData } = useQuery({
    queryKey: ["reconciliation"],
    queryFn: () => adminApi.getReconciliation().then((r) => r.data),
  })

  const isLoading = overviewLoading || revenueLoading

  if (isLoading) return <LoadingState message="Loading financial data…" />
  if (overviewError) return <div className="max-w-md mx-auto mt-12"><ErrorState message="Failed to load financial data" onRetry={() => refetchOverview()} /></div>

  const refundColumns: Column<any>[] = [
    { key: "id", header: "Refund ID", render: (_v, r) => <span className="font-mono text-xs">{r.id?.slice(0, 8)}</span> },
    { key: "customer_name", header: "Customer" },
    { key: "amount", header: "Amount", align: "right", render: (_v, r) => r.amount != null ? <span className="font-tabular">{formatMoney(r.amount)}</span> : "—" },
    { key: "status", header: "Status", render: (_v, r) => <Badge variant={r.status === "completed" ? "success" : r.status === "pending" ? "warning" : "info"} size="sm">{r.status}</Badge>, hideOnMobile: true },
    { key: "created_at", header: "Date", render: (_v, r) => r.created_at ? formatDateTime(r.created_at) : "—", hideOnMobile: true },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description="Revenue, settlements, and refunds across the federation"
        icon={CurrencyInr}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Revenue" value={formatMoney(overview?.totalEarnings ?? 0)} icon={CurrencyInr} />
        <SummaryCard label="Total Bookings" value={overview?.totalBookings ?? 0} icon={Receipt} />
        <SummaryCard label="Avg per Booking" value={overview && overview.totalBookings > 0 ? formatMoney(Number(overview.totalEarnings) / overview.totalBookings) : "—"} icon={ArrowsClockwise} />
        <SummaryCard label="Refunds" value={refundsData?.total ?? 0} icon={CheckCircle} variant="warning" />
      </div>

      {revenueData?.by_society && revenueData.by_society.length > 0 && (
        <section className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Revenue by Society</h3>
          <div className="space-y-2">
            {revenueData.by_society.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-ink">{s.cooperative_name}</span>
                <div className="text-right">
                  <span className="text-sm font-medium text-ok font-tabular">{formatMoney(s.revenue)}</span>
                  <span className="text-xs text-muted ml-2">{s.bookings} bookings</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reconciliationData?.summary && reconciliationData.summary.length > 0 && (
        <section className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Reconciliation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reconciliationData.summary.map((s, i) => (
              <div key={i} className="p-3 bg-bg rounded-lg border border-border">
                <p className="text-xs text-muted">{s.provider}</p>
                <p className="text-lg font-bold text-ink font-tabular">{formatMoney(s.total)}</p>
                <p className="text-xs text-muted">{s.count} transactions</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-ink mb-3">Recent Refunds</h3>
        {refundsLoading ? (
          <LoadingState message="Loading refunds…" />
        ) : refundsData?.refunds?.length === 0 ? (
          <div className="py-4 text-sm text-muted">No refunds found</div>
        ) : (
          <DataTable columns={refundColumns} data={refundsData?.refunds ?? []} keyExtractor={(r) => r.id} loading={false} />
        )}
      </section>
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, variant = "info" }: { label: string; value: number | string; icon: React.ComponentType<{ size?: number; className?: string }>; variant?: "info" | "warning" }) {
  const colors = { info: "bg-accent-light text-accent", warning: "bg-warn-light text-warn" }
  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colors[variant]}`}>
          <Icon size={14} className={variant === "warning" ? "text-warn" : "text-accent"} />
        </div>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-ink font-tabular">{value}</p>
    </div>
  )
}
