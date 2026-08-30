import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { SupportTicket } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { FilterBar, type FilterConfig } from "../components/ui/FilterBar"
import { DetailDrawer, DetailDrawerSection, DetailDrawerField } from "../components/ui/DetailDrawer"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatDateTime } from "../lib/utils"
import { Headphones, CheckCircle, Warning } from "@phosphor-icons/react"

const filterConfig: FilterConfig[] = [
  { key: "status", label: "Status", type: "select", placeholder: "Any status", options: [
    { key: "open", label: "Open", value: "open" },
    { key: "in_progress", label: "In Progress", value: "in_progress" },
    { key: "resolved", label: "Resolved", value: "resolved" },
  ] },
]

export function Support() {
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [drawer, setDrawer] = useState<SupportTicket | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tickets", filters.status],
    queryFn: () => adminApi.getTickets({ status: (filters.status as string) || undefined }).then((r) => r.data.tickets),
  })

  const resolve = useMutation({
    mutationFn: (id: string) => adminApi.resolveTicket(id, "Resolved from admin console"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tickets"] }); setDrawer(null) },
  })

  const openCount = data?.filter((t) => t.status === "open").length ?? 0

  const columns: Column<SupportTicket>[] = [
    { key: "id", header: "Ticket", render: (_v, r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
    { key: "subject", header: "Subject", render: (_v, r) => r.subject ?? r.category ?? "—" },
    { key: "status", header: "Status", render: (_v, r) => <Badge variant={r.status === "open" ? "warning" : r.status === "resolved" ? "success" : "info"} size="sm">{r.status}</Badge> },
    { key: "createdAt", header: "Created", render: (_v, r) => formatDateTime(r.createdAt) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support"
        description="Customer and worker tickets"
        icon={Headphones}
      >
        {openCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warn/10 text-warn">
            <Warning size={14} />
            <span className="text-xs font-medium">{openCount} open ticket{openCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </PageHeader>

      <FilterBar filters={filters} onChange={setFilters} config={filterConfig} />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load tickets" description="We couldn't fetch the support tickets. Check your connection and try again." onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading tickets…" />
      ) : (data?.length ?? 0) === 0 ? (
        <div className="py-8">
          <EmptyState icon="alert" title="All clear!" description="No support tickets to handle right now." />
        </div>
      ) : (
        <DataTable columns={columns} data={data ?? []} keyExtractor={(t) => t.id} loading={false} onRowClick={setDrawer} />
      )}

      <DetailDrawer isOpen={!!drawer} onClose={() => setDrawer(null)} title={drawer?.subject ?? "Ticket"} subtitle={drawer?.id.slice(0, 8)} width="md">
        {drawer && (
          <div className="space-y-4">
            <DetailDrawerSection title="Details">
              <DetailDrawerField label="Status" value={<Badge variant={drawer.status === "open" ? "warning" : "success"}>{drawer.status}</Badge>} />
              <DetailDrawerField label="Created" value={formatDateTime(drawer.createdAt)} />
              <DetailDrawerField label="Description" value={drawer.description ?? "—"} />
            </DetailDrawerSection>
            {drawer.status !== "resolved" && (
              <button disabled={resolve.isPending} onClick={() => resolve.mutate(drawer.id)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-ok text-white text-sm font-medium rounded-lg hover:bg-ok/90 disabled:opacity-50 transition-colors">
                {resolve.isPending ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}
                {resolve.isPending ? "Resolving…" : "Mark resolved"}
              </button>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
