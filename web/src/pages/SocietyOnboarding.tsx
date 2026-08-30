import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { adminApi } from "../lib/api"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { PageHeader } from "../components/ui/PageHeader"
import { Check, Clock, Warning, ArrowRight, UserPlus, MapPin, Gear } from "@phosphor-icons/react"
import type { SocietyStatus } from "../lib/types"

interface Society {
  id: string
  name: string
  code: string
  district: string
  state: string
  status?: SocietyStatus
  federation_name?: string
  created_at?: string
}

const statusConfig: Record<SocietyStatus, { label: string; color: string; icon: typeof Check }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: Clock },
  territory_pending: { label: "Territory Pending", color: "bg-yellow-100 text-yellow-700", icon: MapPin },
  admin_pending: { label: "Admin Pending", color: "bg-blue-100 text-blue-700", icon: UserPlus },
  active: { label: "Active", color: "bg-green-100 text-green-700", icon: Check },
  suspended: { label: "Suspended", color: "bg-red-100 text-red-700", icon: Warning },
}

const statusOrder: SocietyStatus[] = ["draft", "territory_pending", "admin_pending", "active"]

export function SocietyOnboarding() {
  const queryClient = useQueryClient()
  const [selectedSociety, setSelectedSociety] = useState<string | null>(null)
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [adminForm, setAdminForm] = useState({ name: "", email: "", phone: "" })

  const { data: societies, isLoading, isError, refetch } = useQuery({
    queryKey: ["societies-onboarding"],
    queryFn: () => adminApi.getAdminSocieties({ limit: 100 }).then((r) => r.data.societies),
  })

  const { data: selectedSocietyData } = useQuery({
    queryKey: ["society-detail", selectedSociety],
    queryFn: () => selectedSociety ? adminApi.getAdminSociety(selectedSociety).then((r) => r.data.society) : null,
    enabled: !!selectedSociety,
  })

  const { data: societyAdmin } = useQuery({
    queryKey: ["society-admin", selectedSociety],
    queryFn: () => selectedSociety ? adminApi.getSocietyAdmin(selectedSociety).then((r) => r.data.admin) : null,
    enabled: !!selectedSociety,
  })

  const { data: societyTerritory } = useQuery({
    queryKey: ["society-territory", selectedSociety],
    queryFn: () => selectedSociety ? adminApi.getTerritory(selectedSociety).then((r) => r.data.territory) : null,
    enabled: !!selectedSociety,
  })

  const statusMutation = useMutation({
    mutationFn: ({ societyId, status }: { societyId: string; status: SocietyStatus }) =>
      adminApi.updateSocietyStatus(societyId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["societies-onboarding"] })
      queryClient.invalidateQueries({ queryKey: ["society-detail"] })
    },
  })

  const createAdminMutation = useMutation({
    mutationFn: (data: { name: string; email: string; phone: string }) =>
      selectedSociety ? adminApi.createSocietyAdmin(selectedSociety, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["society-admin"] })
      queryClient.invalidateQueries({ queryKey: ["society-detail"] })
      setShowCreateAdmin(false)
      setAdminForm({ name: "", email: "", phone: "" })
    },
  })

  const advanceStatus = (societyId: string, currentStatus: SocietyStatus) => {
    const currentIndex = statusOrder.indexOf(currentStatus)
    if (currentIndex < statusOrder.length - 1) {
      const nextStatus = statusOrder[currentIndex + 1]
      statusMutation.mutate({ societyId, status: nextStatus })
    }
  }

  const getStatusProgress = (status: SocietyStatus) => {
    const index = statusOrder.indexOf(status)
    if (status === "suspended") return -1
    return index >= 0 ? index : 0
  }

  if (isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load societies" onRetry={() => refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Society Onboarding"
        description="Manage society onboarding workflow from draft to active"
        icon={Gear}
      />

      {isLoading ? (
        <LoadingState message="Loading societies…" />
      ) : !societies || societies.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No societies found" description="Create a society to start the onboarding process." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3">
            {societies.map((society: Society) => {
              const config = statusConfig[society.status || "draft"]
              const progress = getStatusProgress(society.status || "draft")
              const isSelected = selectedSociety === society.id

              return (
                <div
                  key={society.id}
                  onClick={() => setSelectedSociety(society.id)}
                  className={`bg-white border rounded-lg p-4 cursor-pointer transition-all ${
                    isSelected ? "border-blue-500 ring-1 ring-blue-500" : "border-border hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">{society.name}</h3>
                      <p className="text-xs text-muted">{society.district}, {society.state} · {society.code}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${config.color}`}>
                      {config.label}
                    </span>
                  </div>

                  {society.status !== "suspended" && (
                    <div className="flex items-center gap-1 mb-3">
                      {statusOrder.map((status, index) => (
                        <div key={status} className="flex items-center">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                              index <= progress ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                            }`}
                          >
                            {index <= progress ? <Check size={12} /> : index + 1}
                          </div>
                          {index < statusOrder.length - 1 && (
                            <div className={`w-8 h-0.5 ${index < progress ? "bg-green-500" : "bg-gray-200"}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {society.status && society.status !== "active" && society.status !== "suspended" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          advanceStatus(society.id, society.status || "draft")
                        }}
                        disabled={statusMutation.isPending}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        Advance <ArrowRight size={12} />
                      </button>
                    )}
                    {society.status === "admin_pending" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedSociety(society.id)
                          setShowCreateAdmin(true)
                        }}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                      >
                        <UserPlus size={12} /> Create Admin
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-4">
            {selectedSocietyData ? (
              <>
                <div className="bg-white border border-border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-fg mb-3">Society Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Name</span>
                      <span className="font-medium">{selectedSocietyData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Code</span>
                      <span>{selectedSocietyData.code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Federation</span>
                      <span>{selectedSocietyData.federation_name || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Status</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${statusConfig[(selectedSocietyData.status as SocietyStatus) || "draft"]?.color}`}>
                        {statusConfig[(selectedSocietyData.status as SocietyStatus) || "draft"]?.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-fg mb-3">Territory</h3>
                  {societyTerritory ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Status</span>
                        <span className="capitalize">{societyTerritory.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Area</span>
                        <span>{societyTerritory.area_km2} km²</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Version</span>
                        <span>v{societyTerritory.version}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No territory defined</p>
                  )}
                </div>

                <div className="bg-white border border-border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-fg mb-3">Administrator</h3>
                  {societyAdmin ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted">Name</span>
                        <span>{societyAdmin.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Email</span>
                        <span className="text-xs">{societyAdmin.email}</span>
                      </div>
                      {societyAdmin.temporary_password && (
                        <p className="text-xs text-orange-600 flex items-center gap-1">
                          <Warning size={12} /> Temporary password not changed
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-muted mb-2">No admin assigned</p>
                      <button
                        onClick={() => setShowCreateAdmin(true)}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                      >
                        <UserPlus size={12} /> Create Admin
                      </button>
                    </div>
                  )}
                </div>

                {showCreateAdmin && (
                  <div className="bg-white border border-border rounded-lg p-4">
                    <h3 className="text-sm font-medium text-fg mb-3">Create Society Admin</h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={adminForm.name}
                        onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                        placeholder="Full Name"
                        className="w-full px-3 py-2 border border-border rounded text-sm"
                      />
                      <input
                        type="email"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        placeholder="Email"
                        className="w-full px-3 py-2 border border-border rounded text-sm"
                      />
                      <input
                        type="tel"
                        value={adminForm.phone}
                        onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                        placeholder="Phone"
                        className="w-full px-3 py-2 border border-border rounded text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => createAdminMutation.mutate(adminForm)}
                          disabled={!adminForm.name || !adminForm.email || !adminForm.phone || createAdminMutation.isPending}
                          className="flex-1 py-2 bg-green-600 text-white rounded text-sm disabled:opacity-50"
                        >
                          {createAdminMutation.isPending ? "Creating..." : "Create"}
                        </button>
                        <button
                          onClick={() => setShowCreateAdmin(false)}
                          className="px-3 py-2 border border-border rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                      {createAdminMutation.isSuccess && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                          <p className="font-medium">Admin created!</p>
                          <p>Temporary password: <code className="bg-green-100 px-1 rounded">{createAdminMutation.data?.data?.temporaryPassword}</code></p>
                          <p className="mt-1">Share this password securely with the admin.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border border-border rounded-lg p-4 text-center text-muted">
                <p className="text-sm">Select a society to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
