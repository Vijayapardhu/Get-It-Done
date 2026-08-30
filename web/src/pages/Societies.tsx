import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { AdminCooperative } from "../lib/types"
import { DataTable, type Column } from "../components/ui/DataTable"
import { FilterBar, type FilterConfig } from "../components/ui/FilterBar"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Buildings, Plus, MapPin } from "@phosphor-icons/react"

const filterConfig: FilterConfig[] = [
  { key: "search", label: "Search", type: "text", placeholder: "Name, code, district…" },
]

export function Societies() {
  const [filters, setFilters] = useState<Record<string, unknown>>({})
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const params = {
    page,
    limit: 20,
    search: (filters.search as string) || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["federation-societies", params],
    queryFn: () => adminApi.getFederationSocieties(params).then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string; code: string; district: string; state: string; federationId: string }) => adminApi.createSociety(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["federation-societies"] })
      setShowCreate(false)
    },
  })

  const columns: Column<AdminCooperative>[] = [
    { key: "name", header: "Society", render: (_v, r) => (
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent/10">
          <Buildings size={16} className="text-accent" />
        </div>
        <div>
          <div className="text-sm font-medium text-ink">{r.name}</div>
          <div className="text-xs text-muted">{r.code}</div>
        </div>
      </div>
    ) },
    { key: "district", header: "Location", render: (_v, r) => (
      <span className="flex items-center gap-1 text-sm text-muted">
        <MapPin size={12} />
        {r.district}{r.state ? `, ${r.state}` : ""}
      </span>
    ), hideOnMobile: true },
    { key: "commission_rate", header: "Commission", align: "right", render: (_v, r) => r.commission_rate != null ? <span className="font-tabular">{r.commission_rate}%</span> : "—", hideOnMobile: true },
  ]

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Societies"
        description={`${total} cooperative societies in your federation`}
        icon={Buildings}
      >
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
        >
          <Plus size={14} />
          Add Society
        </button>
      </PageHeader>

      {showCreate && (
        <CreateSocietyForm
          onSubmit={(body) => createMutation.mutate(body)}
          onCancel={() => setShowCreate(false)}
          busy={createMutation.isPending}
        />
      )}

      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(1) }} config={filterConfig} />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load societies" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading societies…" />
      ) : (data?.cooperatives?.length ?? 0) === 0 ? (
        <div className="py-8">
          <EmptyState
            icon="box"
            title="No societies found"
            description="No cooperative societies match your current filters."
          />
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.cooperatives ?? []}
            keyExtractor={(s) => s.id}
            loading={false}
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
    </div>
  )
}

function CreateSocietyForm({ onSubmit, onCancel, busy }: { onSubmit: (body: { name: string; code: string; district: string; state: string; federationId: string }) => void; onCancel: () => void; busy: boolean }) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [district, setDistrict] = useState("")
  const [state, setState] = useState("")
  const [federationId, setFederationId] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ name, code, district, state, federationId })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink">Create New Society</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Society Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Code *</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} required className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">District *</label>
          <input value={district} onChange={(e) => setDistrict(e.target.value)} required className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">State *</label>
          <input value={state} onChange={(e) => setState(e.target.value)} required className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Federation ID *</label>
          <input value={federationId} onChange={(e) => setFederationId(e.target.value)} required placeholder="UUID of the federation" className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted bg-bg border border-border rounded-lg hover:bg-border/50">Cancel</button>
        <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50">
          {busy ? "Creating…" : "Create Society"}
        </button>
      </div>
    </form>
  )
}
