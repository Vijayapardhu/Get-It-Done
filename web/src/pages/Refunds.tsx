import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { Refund } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatMoney, formatDate } from "../lib/utils"
import { CurrencyDollar } from "@phosphor-icons/react"

export function Refunds() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["refunds"],
    queryFn: () => adminApi.getRefunds().then((r) => r.data.refunds),
  })

  const refunds: Refund[] = data ?? []

  const statusVariant = (status: string) => {
    switch (status) {
      case "completed": return "success"
      case "pending": return "warning"
      case "failed": return "danger"
      default: return "neutral"
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Refunds"
        description={`${refunds.length} refund transactions`}
        icon={CurrencyDollar}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load refunds" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading refunds…" />
      ) : refunds.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No refunds" description="No refund transactions found." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Refund ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Booking</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Amount</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Reason</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Date</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((refund) => (
                <tr key={refund.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 font-mono text-xs text-fg">{refund.id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{refund.booking_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-fg">{formatMoney(refund.amount ?? 0)}</td>
                  <td className="px-4 py-3 text-muted max-w-[200px] truncate">{refund.provider ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(refund.status ?? "pending")} size="sm">{refund.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(refund.created_at ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
