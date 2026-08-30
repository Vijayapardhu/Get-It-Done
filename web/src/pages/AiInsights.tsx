import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { Brain, TrendUp, Users, CheckCircle, XCircle, Sparkle } from "@phosphor-icons/react"

export function AiInsights() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["federation-ai-forecasts"],
    queryFn: () => adminApi.getFederationAiForecasts().then((r) => r.data),
  })

  const { data: workforceAllocation } = useQuery({
    queryKey: ["workforce-allocation"],
    queryFn: () => adminApi.getWorkforceAllocation().then((r) => r.data),
  })

  const queryClient = useQueryClient()
  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveAiRecommendation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["federation-ai-forecasts"] }),
  })
  const rejectMutation = useMutation({
    mutationFn: (id: string) => adminApi.rejectAiRecommendation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["federation-ai-forecasts"] }),
  })

  if (isLoading) return <LoadingState message="Loading AI insights…" />
  if (isError) return <div className="max-w-md mx-auto mt-12"><ErrorState message="Failed to load AI insights" onRetry={() => refetch()} /></div>

  const recommendations = data?.recommendations ?? []
  const forecasts = data?.forecasts ?? []
  const workforceRecs = workforceAllocation?.recommendations ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Insights"
        description="Demand forecasts, workforce allocation, and recommendations"
        icon={Brain}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-accent-light">
              <TrendUp size={16} className="text-accent" />
            </div>
            <h3 className="text-sm font-semibold text-ink">Demand Forecast</h3>
          </div>
          {forecasts.length > 0 ? (
            <div className="space-y-2">
              {forecasts.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm text-ink">{f.service ?? f.area ?? "General"}</p>
                    <p className="text-xs text-muted">{f.date ?? "Upcoming period"}</p>
                  </div>
                  <span className="text-sm font-medium text-accent font-tabular">{f.predicted_requests ?? "—"} requests</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted py-4">No demand forecasts available</p>
          )}
        </section>

        <section className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-ok-light">
              <Users size={16} className="text-ok" />
            </div>
            <h3 className="text-sm font-semibold text-ink">Workforce Allocation</h3>
          </div>
          {workforceRecs.length > 0 ? (
            <div className="space-y-2">
              {workforceRecs.slice(0, 5).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm text-ink">{r.society ?? r.region ?? "General"}</p>
                    <p className="text-xs text-muted">{r.reasoning ?? `${r.current_workers ?? 0} → ${r.recommended_workers ?? 0} workers`}</p>
                  </div>
                  <span className="text-sm font-medium text-ok font-tabular">{r.recommended_workers ?? "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted py-4">No workforce allocation recommendations</p>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-warn-light">
            <Sparkle size={16} className="text-warn" />
          </div>
          <h3 className="text-sm font-semibold text-ink">AI Recommendations</h3>
        </div>
        {recommendations.length === 0 ? (
          <div className="py-8">
            <EmptyState icon="plus" title="No recommendations" description="AI recommendations will appear here when available." />
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.id} className="p-4 bg-bg rounded-lg border border-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-ink">{rec.title ?? rec.type ?? "Recommendation"}</h4>
                      <Badge variant={rec.priority === "high" ? "danger" : rec.priority === "medium" ? "warning" : "info"} size="sm">{rec.priority ?? "low"}</Badge>
                      <Badge variant={rec.status === "pending" ? "warning" : rec.status === "approved" ? "success" : "neutral"} size="sm">{rec.status}</Badge>
                    </div>
                    {rec.description && <p className="text-sm text-muted">{rec.description}</p>}
                    {rec.cooperative_name && <p className="text-xs text-muted mt-1">Society: {rec.cooperative_name}</p>}
                  </div>
                  {rec.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveMutation.mutate(rec.id)}
                        disabled={approveMutation.isPending}
                        className="p-2 rounded-lg bg-ok/10 text-ok hover:bg-ok/20 transition-colors"
                        title="Approve"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(rec.id)}
                        disabled={rejectMutation.isPending}
                        className="p-2 rounded-lg bg-crit/10 text-crit hover:bg-crit/20 transition-colors"
                        title="Reject"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
