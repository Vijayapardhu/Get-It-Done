import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { EmergencyBooking } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatRelativeTime } from "../lib/utils"
import { WarningCircle, ArrowUp, CheckCircle } from "@phosphor-icons/react"

export function Emergencies() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["active-emergencies"],
    queryFn: () => adminApi.getActiveEmergencies().then((r) => r.data.emergencies),
  })

  const escalateMutation = useMutation({
    mutationFn: (id: string) => adminApi.escalateEmergency(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-emergencies"] }),
  })
  const resolveMutation = useMutation({
    mutationFn: (id: string) => adminApi.resolveEmergency(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-emergencies"] }),
  })

  const columns: Column<EmergencyBooking>[] = [
    { key: "booking_number", header: "Booking", render: (_v, r) => <span className="font-mono text-xs">{r.booking_number ?? r.id.slice(0, 8)}</span> },
    { key: "service_name", header: "Service" },
    { key: "priority", header: "Priority", render: (_v, r) => (
      <Badge variant={r.priority === "critical" ? "danger" : r.priority === "high" ? "warning" : "info"} size="sm">{r.priority}</Badge>
    ) },
    { key: "status", header: "Status", render: (_v, r) => <Badge variant="warning" size="sm">{r.status}</Badge> },
    { key: "escalation_level", header: "Escalation", align: "right", render: (_v, r) => <span className="font-tabular">{r.escalation_level ?? 0}</span>, hideOnMobile: true },
    { key: "created_at", header: "Created", render: (_v, r) => formatRelativeTime(r.created_at), hideOnMobile: true },
    { key: "actions", header: "Actions", render: (_v, r) => (
      <div className="flex gap-1">
        <button
          onClick={() => escalateMutation.mutate(r.id)}
          disabled={escalateMutation.isPending}
          className="p-1.5 rounded-lg bg-warn/10 text-warn hover:bg-warn/20 transition-colors"
          title="Escalate"
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={() => resolveMutation.mutate(r.id)}
          disabled={resolveMutation.isPending}
          className="p-1.5 rounded-lg bg-ok/10 text-ok hover:bg-ok/20 transition-colors"
          title="Resolve"
        >
          <CheckCircle size={14} />
        </button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Emergency Center"
        description="Active emergency bookings across the federation"
        icon={WarningCircle}
      >
        {(data?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crit/10 text-crit animate-pulse">
            <WarningCircle size={14} />
            <span className="text-xs font-medium">{data!.length} active emergency{data!.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </PageHeader>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load emergencies" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading emergencies…" />
      ) : data?.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="shield" title="No active emergencies" description="All clear — no emergency bookings require attention." />
        </div>
      ) : (
        <DataTable columns={columns} data={data!} keyExtractor={(e) => e.id} loading={false} />
      )}
    </div>
  )
}
