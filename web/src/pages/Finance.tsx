import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { LoadingState, ErrorState } from "../components/ui/EmptyState"
import { StatCard, PageHeader } from "../components/ui/PageHeader"
import { FinanceIllustration } from "../components/ui/Illustrations"
import { formatMoney, toNumber } from "../lib/utils"
import { CurrencyInr, CheckCircle, Receipt, Divide } from "@phosphor-icons/react"

export function Finance() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: () => adminApi.getDashboardOverview().then((r) => r.data.overview),
  })

  if (isLoading) return <LoadingState message="Loading finance…" />
  if (isError || !data) return (
    <div className="max-w-md mx-auto mt-12">
      <ErrorState message="Failed to load finance" description="We couldn't fetch the financial data. Check your connection and try again." onRetry={() => refetch()} />
    </div>
  )

  const avgPerJob = data.completedJobs > 0 ? formatMoney(toNumber(data.totalEarnings) / data.completedJobs) : "—"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Earnings and payout summary for your cooperative"
        icon={CurrencyInr}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Earnings" value={formatMoney(data.totalEarnings)} icon={CurrencyInr} accent="success" subtitle="all time revenue" />
        <StatCard label="Completed Jobs" value={data.completedJobs} icon={CheckCircle} accent="info" subtitle="delivered" />
        <StatCard label="Avg per Job" value={avgPerJob} icon={Receipt} accent="neutral" subtitle="revenue per job" />
      </div>

      <div className="bg-surface rounded-xl border border-muted/20 p-6">
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink mb-2">Payouts</h3>
            <p className="text-sm text-muted leading-relaxed">Individual worker payouts are managed from each worker's profile. The cooperative share is settled to the society account on a weekly cycle.</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted bg-muted/5 rounded-lg px-3 py-2">
              <Divide size={14} />
              <span>Revenue is split between workers and the cooperative according to your society's rules</span>
            </div>
          </div>
          <div className="hidden md:block flex-shrink-0">
            <FinanceIllustration className="w-40 h-32" />
          </div>
        </div>
      </div>
    </div>
  )
}
