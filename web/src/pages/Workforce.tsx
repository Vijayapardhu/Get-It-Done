import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { Worker, WorkersListParams } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { FilterBar, type FilterConfig } from "../components/ui/FilterBar"
import { DetailDrawer, DetailDrawerSection, DetailDrawerField } from "../components/ui/DetailDrawer"
import { StatusPill, Avatar } from "../components/ui/Badge"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Users, UserCheck, WarningCircle, CheckCircle, Buildings } from "@phosphor-icons/react"
import { useAuth } from "../lib/AuthContext"

const filterConfig: FilterConfig[] = [
  { key: "search", label: "Search", type: "text", placeholder: "Name, phone, email…" },
  {
    key: "verificationStatus",
    label: "Verification",
    type: "select",
    placeholder: "Any status",
    options: [
      { key: "verified", label: "Verified", value: "verified" },
      { key: "submitted", label: "Submitted", value: "submitted" },
      { key: "under_review", label: "Under Review", value: "under_review" },
      { key: "rejected", label: "Rejected", value: "rejected" },
      { key: "suspended", label: "Suspended", value: "suspended" },
    ],
  },
  {
    key: "availability",
    label: "Availability",
    type: "select",
    placeholder: "Any",
    options: [
      { key: "available", label: "Available", value: "available" },
      { key: "busy", label: "Busy", value: "busy" },
      { key: "offline", label: "Offline", value: "offline" },
    ],
  },
]

export function Workforce() {
  const { user } = useAuth()
  const isFederation = user?.role === "federation_admin" || user?.role === "system_admin"
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [drawerWorker, setDrawerWorker] = useState<Worker | null>(null)
  const queryClient = useQueryClient()

  const params: WorkersListParams = {
    page,
    limit: 20,
    search: (filters.search as string) || undefined,
    verificationStatus: filters.verificationStatus as WorkersListParams["verificationStatus"],
    availability: filters.availability as WorkersListParams["availability"],
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workers", params, isFederation ? "federation" : "cooperative"],
    queryFn: () => adminApi.getWorkers(params).then((r) => r.data),
  })

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveVerification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      queryClient.invalidateQueries({ queryKey: ["federation-overview"] })
      queryClient.invalidateQueries({ queryKey: ["cooperative-overview"] })
      setDrawerWorker(null)
    },
  })
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.rejectVerification(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      setDrawerWorker(null)
    },
  })
  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.suspendVerification(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      setDrawerWorker(null)
    },
  })

  const columns: Column<Worker>[] = [
    { key: "name", header: "Worker", render: (_v, w) => (
      <div className="flex items-center gap-3">
        <Avatar name={w.name} src={w.avatarUrl} size="sm" />
        <div>
          <div className="text-sm font-medium text-ink">{w.name}</div>
          <div className="text-xs text-muted">{w.phone}</div>
        </div>
      </div>
    ) },
    ...(isFederation ? [{
      key: "cooperativeName" as const,
      header: "Society",
      render: (_v: unknown, w: Worker) => <span className="text-xs text-muted">{w.cooperativeName ?? "—"}</span>,
      hideOnMobile: true,
    }] : []),
    { key: "verificationStatus", header: "Status", render: (_v, w) => <StatusPill status={w.verificationStatus} size="sm" />, hideOnMobile: true },
    { key: "currentStatus", header: "Availability", render: (_v, w) => <StatusPill status={w.currentStatus} size="sm" /> },
    { key: "rating", header: "Rating", align: "right", render: (_v, w) => w.rating ? <span className="font-tabular">{Number(w.rating).toFixed(1)}</span> : "—", hideOnMobile: true },
    { key: "experienceYears", header: "Exp (yrs)", align: "right", render: (_v, w) => <span className="font-tabular">{w.experienceYears ?? "—"}</span>, hideOnMobile: true },
  ]

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))
  const pendingCount = data?.workers?.filter((w) => w.verificationStatus === "submitted" || w.verificationStatus === "under_review").length ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workforce"
        description={isFederation ? `${total} workers across all societies` : `${total} workers in your cooperative`}
        icon={isFederation ? Buildings : Users}
      >
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warn/10 text-warn">
            <WarningCircle size={14} />
            <span className="text-xs font-medium">{pendingCount} pending review</span>
          </div>
        )}
      </PageHeader>

      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1) }} config={filterConfig} />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load workers" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading workers…" />
      ) : (data?.workers?.length ?? 0) === 0 ? (
        <div className="py-8">
          <EmptyState
            icon="users"
            title="No workers found"
            description="No workers match your current filters. Try adjusting your search or filter criteria."
          />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.workers ?? []}
            keyExtractor={(w) => w.id}
            loading={false}
            onRowClick={(w) => setDrawerWorker(w)}
            selection={selected}
            onSelectionChange={setSelected}
            showSelection
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted">
            <span>Page {page} of {totalPages} · {total} total</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 bg-white border border-border rounded-lg disabled:opacity-40 hover:border-accent transition-colors">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 bg-white border border-border rounded-lg disabled:opacity-40 hover:border-accent transition-colors">Next</button>
            </div>
          </div>
        </>
      )}

      <DetailDrawer
        isOpen={!!drawerWorker}
        onClose={() => setDrawerWorker(null)}
        title={drawerWorker?.name ?? ""}
        subtitle={drawerWorker?.workerCode}
        width="lg"
      >
        {drawerWorker && (
          <WorkerDrawer
            worker={drawerWorker}
            approve={approve.mutate}
            reject={reject.mutate}
            suspend={suspend.mutate}
            busy={approve.isPending || reject.isPending || suspend.isPending}
          />
        )}
      </DetailDrawer>
    </div>
  )
}

function WorkerDrawer({ worker, approve, reject, suspend, busy }: { worker: Worker; approve: (id: string) => void; reject: (p: { id: string; reason: string }) => void; suspend: (p: { id: string; reason: string }) => void; busy: boolean }) {
  const [reason, setReason] = useState("")
  const canVerify = worker.verificationStatus === "submitted" || worker.verificationStatus === "under_review"
  return (
    <div className="space-y-6">
      <DetailDrawerSection title="Profile">
        <DetailDrawerField label="Phone" value={worker.phone} />
        <DetailDrawerField label="Email" value={worker.email} />
        <DetailDrawerField label="Experience" value={worker.experienceYears != null ? `${worker.experienceYears} years` : "—"} />
        <DetailDrawerField label="Service Radius" value={worker.serviceRadiusKm != null ? `${worker.serviceRadiusKm} km` : "—"} />
        <DetailDrawerField label="Rating" value={worker.rating ? Number(worker.rating).toFixed(1) : "—"} />
        <DetailDrawerField label="Jobs (last 30 days)" value={String(worker.jobsLast30Days ?? 0)} />
      </DetailDrawerSection>

      {worker.skills && worker.skills.length > 0 && (
        <DetailDrawerSection title="Skills">
          <div className="flex flex-wrap gap-2">
            {worker.skills.map((s) => (
              <span key={s.skillId} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-bg border border-border rounded-full text-ink">
                {s.name} {s.verified && <CheckCircle size={12} className="text-ok" />}
              </span>
            ))}
          </div>
        </DetailDrawerSection>
      )}

      <DetailDrawerSection title="Verification">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Current Status</span>
            <StatusPill status={worker.verificationStatus} />
          </div>
          {canVerify && (
            <div className="space-y-3 p-4 bg-bg rounded-xl border border-border">
              <label className="block text-xs font-medium text-muted">Review Notes</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add a reason (required for reject/suspend)…"
                rows={3}
                className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
              <div className="flex gap-2 flex-wrap">
                <button disabled={busy} onClick={() => approve(worker.id)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-ok text-white text-sm font-medium rounded-lg hover:bg-ok/90 disabled:opacity-50 transition-colors">
                  {busy ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserCheck size={16} />}
                  Approve
                </button>
                <button disabled={busy || !reason} onClick={() => reject({ id: worker.id, reason })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-crit text-white text-sm font-medium rounded-lg hover:bg-crit/90 disabled:opacity-50 transition-colors">
                  Reject
                </button>
                <button disabled={busy || !reason} onClick={() => suspend({ id: worker.id, reason })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-warn text-white text-sm font-medium rounded-lg hover:bg-warn/90 disabled:opacity-50 transition-colors">
                  Suspend
                </button>
              </div>
            </div>
          )}
          {!canVerify && (
            <p className="text-xs text-muted bg-bg rounded-lg p-3">No actions available for this verification status.</p>
          )}
        </div>
      </DetailDrawerSection>
    </div>
  )
}
