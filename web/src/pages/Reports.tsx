import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { FileText } from "@phosphor-icons/react"

export function Reports() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: () => adminApi.getReports().then((r) => r.data.reports),
  })

  const reports: any[] = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={`${reports.length} reports available`}
        icon={FileText}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load reports" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading reports…" />
      ) : reports.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No reports" description="No reports generated yet." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Report</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Generated</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report: any, idx: number) => (
                <tr key={report.id ?? idx} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium text-fg">{report.name ?? report.title ?? "Report"}</td>
                  <td className="px-4 py-3 text-muted">{report.type ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{report.createdAt ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-primary hover:text-primary/80">Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
