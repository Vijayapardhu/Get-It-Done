import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { Settlement } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatMoney, formatDate } from "../lib/utils"
import { Building } from "@phosphor-icons/react"

export function Settlements() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settlements"],
    queryFn: () => adminApi.getSettlements().then((r) => r.data.settlements),
  })

  const settlements: Settlement[] = data ?? []

  const statusVariant = (status: string) => {
    switch (status) {
      case "paid": return "success"
      case "pending": return "warning"
      case "failed": return "danger"
      default: return "neutral"
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlements"
        description={`${settlements.length} settlement records`}
        icon={Building}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load settlements" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading settlements…" />
      ) : settlements.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No settlements" description="No settlement records found." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Settlement ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Society/Worker</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Period</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Date</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((settlement) => (
                <tr key={settlement.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 font-mono text-xs text-fg">{settlement.id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-3 text-fg">{settlement.cooperative_name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-fg">{formatMoney(settlement.total_amount ?? 0)}</td>
                  <td className="px-4 py-3 text-muted">{settlement.period_start ? `${formatDate(settlement.period_start)} - ${formatDate(settlement.period_end ?? "")}` : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(settlement.status ?? "pending")} size="sm">{settlement.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(settlement.created_at ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
