import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Users, ArrowRight, Info } from "@phosphor-icons/react"
import { Badge } from "../components/ui/Badge"

export function WorkforceAllocation() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workforce-allocation"],
    queryFn: () => adminApi.getWorkforceAllocation().then((r) => r.data),
  })

  const recommendations: any[] = data?.recommendations ?? []
  const pendingApproval = data?.pendingApproval ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workforce Allocation"
        description="AI-powered workforce rebalancing recommendations"
        icon={Users}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load allocation" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading recommendations…" />
      ) : recommendations.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No recommendations" description="No workforce allocation recommendations. The AI will generate recommendations when demand shortages are predicted." />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight size={16} className="text-accent" />
                <span className="text-xs text-muted">Recommendations</span>
              </div>
              <p className="text-lg font-semibold text-fg">{recommendations.length}</p>
              <p className="text-xs text-muted">allocation actions</p>
            </div>
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-ok" />
                <span className="text-xs text-muted">Workers Needed</span>
              </div>
              <p className="text-lg font-semibold text-fg">{recommendations.reduce((sum, r) => sum + (r.workers_needed ?? r.recommended_workers ?? 0), 0)}</p>
              <p className="text-xs text-muted">total additional</p>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Priority</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Area</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Service</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Workers Needed</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec: any, idx: number) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <Badge variant={rec.priority === "high" ? "danger" : rec.priority === "medium" ? "warning" : "info"} size="sm">
                        rec.priority ?? "low"
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-fg">{rec.locality ?? rec.area ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{rec.service ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-fg text-right">{rec.workers_needed ?? rec.recommended_workers ?? "—"}</td>
                    <td className="px-4 py-3 text-muted max-w-[300px]">{rec.recommendation ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pendingApproval > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-blue-700 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800 mb-1">{pendingApproval} Pending Approval</h4>
                  <p className="text-xs text-blue-700">
                    Recommendations are persisted for human approval. Approved recommendations take effect immediately.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
