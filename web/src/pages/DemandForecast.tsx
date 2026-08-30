import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Brain, TrendUp, TrendDown, Minus, Info } from "@phosphor-icons/react"

export function DemandForecast() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["demand-forecast"],
    queryFn: () => adminApi.getDemandForecast().then((r) => r.data),
  })

  const forecasts: any[] = data?.forecasts ?? []
  const modelTrained = data?.model_trained ?? false
  const trainingSamples = data?.training_samples ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Demand Forecast"
        description="AI-powered demand prediction by area and service"
        icon={Brain}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load forecast" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading forecast…" />
      ) : forecasts.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No forecast data" description="Not enough booking history to generate forecasts. Need at least 12 data points per area/service." />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {modelTrained ? <TrendUp size={16} className="text-ok" /> : <Minus size={16} className="text-warn" />}
                <span className="text-xs text-muted">Model Status</span>
              </div>
              <p className="text-lg font-semibold text-fg">{modelTrained ? "Trained" : "Baseline"}</p>
              <p className="text-xs text-muted">{trainingSamples} observations</p>
            </div>
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendUp size={16} className="text-accent" />
                <span className="text-xs text-muted">Areas Covered</span>
              </div>
              <p className="text-lg font-semibold text-fg">{new Set(forecasts.map(f => f.area)).size}</p>
              <p className="text-xs text-muted">grid cells</p>
            </div>
            <div className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendDown size={16} className="text-danger" />
                <span className="text-xs text-muted">Predicted Shortages</span>
              </div>
              <p className="text-lg font-semibold text-fg">{forecasts.filter(f => f.predicted_shortage > 0).length}</p>
              <p className="text-xs text-muted">time slots</p>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Area</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Service</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Expected</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Available</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Shortage</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((pred: any, idx: number) => (
                  <tr key={idx} className={`border-b border-border/50 hover:bg-muted/10 ${pred.predicted_shortage > 0 ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-3 text-fg whitespace-nowrap">{pred.date ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{pred.locality ?? pred.area ?? "—"}</td>
                    <td className="px-4 py-3 text-fg">{pred.service ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-fg text-right">{pred.expected_requests ?? "—"}</td>
                    <td className="px-4 py-3 text-muted text-right">{pred.available_workers ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      {pred.predicted_shortage > 0 ? (
                        <span className="font-medium text-danger">{pred.predicted_shortage}</span>
                      ) : (
                        <span className="text-ok">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{pred.confidence_low != null ? `${pred.confidence_low}–${pred.confidence_high}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!modelTrained && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-yellow-700 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 mb-1">Using Baseline Estimate</h4>
                  <p className="text-xs text-yellow-700">
                    Need 12+ observations to fit the prediction model. Currently using historical averages.
                    Forecasts will improve as more bookings are completed.
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
