import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { AuditEvent } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { formatDateTime } from "../lib/utils"
import { ClipboardText } from "@phosphor-icons/react"

export function AuditLog() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => adminApi.getAuditLog().then((r) => r.data.events),
  })

  const events: AuditEvent[] = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description={`${events.length} audit events recorded`}
        icon={ClipboardText}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load audit log" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading audit log…" />
      ) : events.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No audit events" description="No audit events recorded yet." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Timestamp</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Actor</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Action</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Resource</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3 text-fg">{event.actorId?.slice(0, 8) ?? "System"}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-muted/30 px-1.5 py-0.5 rounded">{event.action}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{event.resourceType ?? "—"}</td>
                  <td className="px-4 py-3 text-muted max-w-[200px] truncate">{JSON.stringify(event.metadata ?? {})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
