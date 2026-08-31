import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { EmergencyBooking, Worker } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatRelativeTime } from "../lib/utils"
import { WarningCircle, ArrowUp, CheckCircle, UserSwitch, X } from "@phosphor-icons/react"
import { useState } from "react"

export function Emergencies() {
  const queryClient = useQueryClient()
  const [reassignEmergency, setReassignEmergency] = useState<EmergencyBooking | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["active-emergencies"],
    queryFn: () => adminApi.getActiveEmergencies().then((r) => r.data.emergencies),
  })

  const { data: availableWorkers } = useQuery({
    queryKey: ["available-workers"],
    queryFn: () => adminApi.getWorkers({ availability: "available", limit: 100 }).then((r) => r.data.workers),
    enabled: !!reassignEmergency,
  })

  const escalateMutation = useMutation({
    mutationFn: (id: string) => adminApi.escalateEmergency(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-emergencies"] }),
  })
  const resolveMutation = useMutation({
    mutationFn: (id: string) => adminApi.resolveEmergency(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-emergencies"] }),
  })
  const reassignMutation = useMutation({
    mutationFn: ({ id, workerId }: { id: string; workerId: string }) => adminApi.reassignEmergency(id, { workerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-emergencies"] })
      setReassignEmergency(null)
    },
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
          onClick={() => setReassignEmergency(r)}
          className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          title="Reassign Worker"
        >
          <UserSwitch size={14} />
        </button>
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

      {reassignEmergency && (
        <ReassignModal
          emergency={reassignEmergency}
          workers={availableWorkers ?? []}
          onReassign={(workerId) => reassignMutation.mutate({ id: reassignEmergency.id, workerId })}
          onClose={() => setReassignEmergency(null)}
          busy={reassignMutation.isPending}
        />
      )}
    </div>
  )
}

function ReassignModal({
  emergency,
  workers,
  onReassign,
  onClose,
  busy,
}: {
  emergency: EmergencyBooking
  workers: Worker[]
  onReassign: (workerId: string) => void
  onClose: () => void
  busy: boolean
}) {
  const [selectedWorker, setSelectedWorker] = useState("")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl border border-border w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-fg">Reassign Emergency Booking</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="p-3 bg-crit/10 rounded-lg">
            <p className="text-xs font-medium text-crit">Emergency: {emergency.booking_number ?? emergency.id.slice(0, 8)}</p>
            <p className="text-xs text-muted mt-1">{emergency.service_name} • {emergency.priority} priority</p>
            <p className="text-xs text-muted mt-1">{emergency.address}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-2">Select Available Worker</label>
            {workers.length === 0 ? (
              <p className="text-xs text-muted p-3 bg-muted/20 rounded-lg">No available workers found.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {workers.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWorker(w.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      selectedWorker === w.id ? "bg-accent/10 border border-accent" : "hover:bg-muted/30 border border-transparent"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                      <span className="text-xs font-medium text-accent">{w.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{w.name}</p>
                      <p className="text-xs text-muted">{w.workerCode} • {w.currentStatus}</p>
                    </div>
                    {w.rating && (
                      <span className="text-xs font-tabular text-muted">{w.rating.toFixed(1)}★</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-fg bg-bg border border-border rounded-lg hover:bg-muted/50">
            Cancel
          </button>
          <button
            onClick={() => onReassign(selectedWorker)}
            disabled={!selectedWorker || busy}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? "Reassigning..." : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  )
}
