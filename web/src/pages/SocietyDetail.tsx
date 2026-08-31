import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { AdminCooperative, Worker, SocietyAdmin } from "../lib/types"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { DataTable, type Column } from "../components/ui/DataTable"
import {
  ArrowLeft, MapPin, Pencil, CheckCircle, Users, ClipboardText,
  CurrencyDollar, ShieldCheck, HardHat, Envelope, Phone,
  Building, Images, X, Clock, Warning
} from "@phosphor-icons/react"

type Tab = "overview" | "workers" | "bookings" | "territory" | "admin"

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  territory_pending: "bg-yellow-100 text-yellow-700",
  admin_pending: "bg-orange-100 text-orange-700",
  active: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  territory_pending: "Territory Pending",
  admin_pending: "Admin Pending",
  active: "Active",
  suspended: "Suspended",
}

export function SocietyDetail() {
  const { societyId } = useParams<{ societyId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [isEditing, setIsEditing] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const { data: society, isLoading, isError, refetch } = useQuery({
    queryKey: ["society", societyId],
    queryFn: () => adminApi.getAdminSociety(societyId!).then((r) => r.data.society),
    enabled: !!societyId,
  })

  const { data: workers } = useQuery({
    queryKey: ["society-workers", societyId],
    queryFn: () => adminApi.getSocietyWorkers(societyId!).then((r) => r.data),
    enabled: !!societyId,
  })

  const { data: admin } = useQuery({
    queryKey: ["society-admin", societyId],
    queryFn: () => adminApi.getSocietyAdmin(societyId!).then((r) => r.data.admin),
    enabled: !!societyId,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<AdminCooperative>) => adminApi.updateSociety(societyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["society", societyId] })
      setIsEditing(false)
    },
  })

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadingLogo(true)
      const result = await adminApi.uploadFile(file, "society-logo")
      await adminApi.updateSociety(societyId!, { logoKey: result.fileKey })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["society", societyId] })
      setUploadingLogo(false)
    },
    onError: () => setUploadingLogo(false),
  })

  if (isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load society" onRetry={() => refetch()} />
      </div>
    )
  }

  if (isLoading || !society) {
    return <LoadingState message="Loading society details…" />
  }

  const statusColor = STATUS_COLORS[society.status || "draft"] || STATUS_COLORS.draft
  const statusLabel = STATUS_LABELS[society.status || "draft"] || society.status

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <Building size={14} /> },
    { key: "workers", label: "Workers", icon: <HardHat size={14} /> },
    { key: "bookings", label: "Bookings", icon: <ClipboardText size={14} /> },
    { key: "territory", label: "Territory", icon: <MapPin size={14} /> },
    { key: "admin", label: "Admin", icon: <ShieldCheck size={14} /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/societies")} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-fg">{society.name}</h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-muted">{society.district}, {society.state} · Code: {society.code}</p>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-border rounded-md hover:bg-muted/50 transition-colors"
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-accent text-white"
                : "bg-white border border-border text-muted hover:text-fg hover:border-accent/50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          society={society}
          workers={workers}
          admin={admin}
          onUploadLogo={(file) => uploadLogoMutation.mutate(file)}
          uploadingLogo={uploadingLogo}
        />
      )}
      {activeTab === "workers" && (
        <WorkersTab workers={workers} societyId={societyId!} />
      )}
      {activeTab === "bookings" && (
        <BookingsTab societyId={societyId!} />
      )}
      {activeTab === "territory" && (
        <TerritoryTab societyId={societyId!} status={society.status} />
      )}
      {activeTab === "admin" && (
        <AdminTab admin={admin} societyId={societyId!} societyName={society.name} />
      )}

      {isEditing && (
        <EditSocietyModal
          society={society}
          onSubmit={(data) => updateMutation.mutate(data)}
          onCancel={() => setIsEditing(false)}
          busy={updateMutation.isPending}
        />
      )}
    </div>
  )
}

function OverviewTab({
  society,
  workers,
  admin,
  onUploadLogo,
  uploadingLogo,
}: {
  society: AdminCooperative
  workers: { workers: Worker[]; total: number } | undefined
  admin: SocietyAdmin | undefined
  onUploadLogo: (file: File) => void
  uploadingLogo: boolean
}) {
  const totalWorkers = workers?.total ?? 0
  const verifiedWorkers = workers?.workers?.filter((w) => w.verificationStatus === "verified").length ?? 0
  const availableWorkers = workers?.workers?.filter((w) => w.currentStatus === "available").length ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-4">Society Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField label="Name" value={society.name} />
            <InfoField label="Code" value={society.code} />
            <InfoField label="District" value={society.district} />
            <InfoField label="State" value={society.state} />
            <InfoField label="Contact Email" value={society.contact_email} />
            <InfoField label="Contact Phone" value={society.contact_phone} />
            <InfoField label="Commission Rate" value={society.commission_rate != null ? `${society.commission_rate}%` : undefined} />
            <InfoField label="Min Workers" value={society.min_workers?.toString()} />
            <InfoField label="Max Workers" value={society.max_workers?.toString()} />
            <InfoField label="Created" value={society.created_at ? new Date(society.created_at).toLocaleDateString() : undefined} />
          </div>
          {society.address && (
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted">Address</span>
              <p className="text-sm text-fg mt-1">{society.address}</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-4">Performance Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Workers" value={totalWorkers} icon={<Users size={16} />} />
            <StatCard label="Verified" value={verifiedWorkers} icon={<ShieldCheck size={16} />} color="text-green-600" />
            <StatCard label="Available" value={availableWorkers} icon={<CheckCircle size={16} />} color="text-blue-600" />
            <StatCard label="Commission" value={`${society.commission_rate ?? 0}%`} icon={<CurrencyDollar size={16} />} color="text-amber-600" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-3">Society Logo</h3>
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-bg overflow-hidden">
              {society.logo_key ? (
                <img
                  src={`${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(society.logo_key)}`}
                  alt="Society logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building size={32} className="text-muted" />
              )}
            </div>
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
              uploadingLogo ? "bg-muted text-muted cursor-not-allowed" : "bg-accent text-white hover:bg-accent/90"
            }`}>
              {uploadingLogo ? (
                <><Clock size={14} className="animate-spin" /> Uploading…</>
              ) : (
                <><Images size={14} /> Upload Logo</>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadLogo(file)
                }}
              />
            </label>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-3">Location</h3>
          <div className="flex items-start gap-2">
            <MapPin size={16} className="text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-fg">{society.address ?? "No address on file"}</p>
              <p className="text-xs text-muted">{society.district}, {society.state}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-3">Federation</h3>
          <p className="text-sm text-fg">{society.federation_name ?? "Not assigned"}</p>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-fg mb-3">Admin Contact</h3>
          {admin ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-muted" />
                <span className="text-sm text-fg">{admin.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Envelope size={14} className="text-muted" />
                <span className="text-xs text-muted">{admin.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-muted" />
                <span className="text-xs text-muted">{admin.phone}</span>
              </div>
              {admin.temporary_password && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 rounded-lg">
                  <Warning size={14} className="text-amber-600" />
                  <span className="text-xs text-amber-700">Password change required on first login</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-xs text-muted mb-2">No admin assigned</p>
              <Link
                to={`/societies/${society.id}#admin`}
                className="text-xs text-accent hover:underline"
              >
                Assign Admin
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkersTab({ workers, societyId: _societyId }: { workers: { workers: Worker[]; total: number } | undefined; societyId: string }) {
  const [_page, _setPage] = useState(1)

  const columns: Column<Worker>[] = [
    {
      key: "name",
      header: "Worker",
      render: (_v, r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <span className="text-xs font-medium text-accent">{r.name.charAt(0)}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-fg">{r.name}</div>
            <div className="text-xs text-muted">{r.workerCode}</div>
          </div>
        </div>
      ),
    },
    {
      key: "verificationStatus",
      header: "Status",
      render: (_v, r) => (
        <Badge
          variant={r.verificationStatus === "verified" ? "success" : r.verificationStatus === "rejected" ? "danger" : "warning"}
          size="sm"
        >
          {r.verificationStatus.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "currentStatus",
      header: "Availability",
      render: (_v, r) => (
        <span className={`text-xs font-medium ${
          r.currentStatus === "available" ? "text-green-600" :
          r.currentStatus === "busy" ? "text-amber-600" : "text-muted"
        }`}>
          {r.currentStatus}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "rating",
      header: "Rating",
      align: "right",
      render: (_v, r) => r.rating != null ? (
        <span className="text-sm font-tabular">{r.rating.toFixed(1)}</span>
      ) : "—",
      hideOnMobile: true,
    },
    {
      key: "experienceYears",
      header: "Exp (yrs)",
      align: "right",
      render: (_v, r) => r.experienceYears ?? "—",
      hideOnMobile: true,
    },
  ]

  if (!workers || workers.workers.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg p-8 text-center">
        <HardHat size={32} className="text-muted mx-auto mb-3" />
        <p className="text-sm text-fg font-medium">No workers registered</p>
        <p className="text-xs text-muted mt-1">Workers will appear here once they join this society.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-fg">{workers.total}</p>
          <p className="text-xs text-muted">Total Workers</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-green-600">
            {workers.workers.filter((w) => w.verificationStatus === "verified").length}
          </p>
          <p className="text-xs text-muted">Verified</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-blue-600">
            {workers.workers.filter((w) => w.currentStatus === "available").length}
          </p>
          <p className="text-xs text-muted">Available</p>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={workers.workers}
        keyExtractor={(w) => w.id}
      />
    </div>
  )
}

function BookingsTab({ societyId }: { societyId: string }) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["society-bookings", societyId],
    queryFn: () => adminApi.getUnassignedBookings().then((r) => r.data),
    enabled: !!societyId,
  })

  const columns = [
    {
      key: "booking_number",
      header: "Booking #",
      render: (_v: unknown, r: any) => (
        <span className="text-sm font-mono text-fg">{r.booking_number}</span>
      ),
    },
    {
      key: "service_name",
      header: "Service",
      render: (_v: unknown, r: any) => (
        <span className="text-sm text-fg">{r.service_name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_v: unknown, r: any) => (
        <Badge
          variant={r.status === "completed" ? "success" : r.status === "cancelled" ? "danger" : "info"}
          size="sm"
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      render: (_v: unknown, r: any) => (
        <span className="text-xs text-muted">
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
      hideOnMobile: true,
    },
  ]

  if (isLoading) {
    return <LoadingState message="Loading bookings…" />
  }

  if (!bookings || (bookings as any).unassigned?.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg p-8 text-center">
        <ClipboardText size={32} className="text-muted mx-auto mb-3" />
        <p className="text-sm text-fg font-medium">No bookings found</p>
        <p className="text-xs text-muted mt-1">Bookings will appear here once customers place orders.</p>
      </div>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={(bookings as any).unassigned || []}
      keyExtractor={(b: any) => b.id}
    />
  )
}

function TerritoryTab({ societyId, status }: { societyId: string; status: string | undefined }) {
  const { data: territory, isLoading } = useQuery({
    queryKey: ["society-territory", societyId],
    queryFn: () => adminApi.getTerritory(societyId).then((r) => r.data.territory),
    enabled: !!societyId,
  })

  if (isLoading) {
    return <LoadingState message="Loading territory…" />
  }

  if (!territory) {
    return (
      <div className="bg-white border border-border rounded-lg p-8 text-center">
        <MapPin size={32} className="text-muted mx-auto mb-3" />
        <p className="text-sm text-fg font-medium">No territory defined</p>
        <p className="text-xs text-muted mt-1">
          {status === "territory_pending"
            ? "This society needs a territory to be defined before it can go active."
            : "Territory has not been set up for this society."}
        </p>
        <Link
          to="/territories"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
        >
          <MapPin size={14} />
          Manage Territories
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-fg">{territory.area_km2?.toFixed(1) ?? "—"}</p>
          <p className="text-xs text-muted">Area (km²)</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-fg">{territory.version}</p>
          <p className="text-xs text-muted">Version</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-fg">{territory.status}</p>
          <p className="text-xs text-muted">Status</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 text-center">
          <p className="text-xl font-semibold text-fg">
            {territory.validated_at ? new Date(territory.validated_at).toLocaleDateString() : "—"}
          </p>
          <p className="text-xs text-muted">Validated</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-fg mb-3">Territory Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Center Latitude" value={territory.center_lat?.toString()} />
          <InfoField label="Center Longitude" value={territory.center_lng?.toString()} />
          <InfoField label="Created" value={territory.created_at ? new Date(territory.created_at).toLocaleString() : undefined} />
          <InfoField label="Last Updated" value={territory.updated_at ? new Date(territory.updated_at).toLocaleString() : undefined} />
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-fg mb-3">Coverage Map</h3>
        <div className="h-64 bg-bg rounded-lg flex items-center justify-center border border-border">
          <div className="text-center">
            <MapPin size={24} className="text-muted mx-auto mb-2" />
            <p className="text-xs text-muted">Territory map visualization</p>
            <Link to="/territories" className="text-xs text-accent hover:underline">
              View on territory page
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminTab({ admin, societyId, societyName }: { admin: SocietyAdmin | undefined; societyId: string; societyName: string }) {
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const queryClient = useQueryClient()

  const createAdminMutation = useMutation({
    mutationFn: (data: { name: string; email: string; phone: string }) =>
      adminApi.createSocietyAdmin(societyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["society-admin", societyId] })
      setShowCreateAdmin(false)
    },
  })

  if (!admin) {
    return (
      <div className="bg-white border border-border rounded-lg p-8 text-center">
        <ShieldCheck size={32} className="text-muted mx-auto mb-3" />
        <p className="text-sm text-fg font-medium">No admin assigned</p>
        <p className="text-xs text-muted mt-1 mb-4">
          Create an admin account for {societyName} to manage their operations.
        </p>
        <button
          onClick={() => setShowCreateAdmin(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
        >
          <Users size={14} />
          Create Admin
        </button>

        {showCreateAdmin && (
          <CreateAdminForm
            onSubmit={(data) => createAdminMutation.mutate(data)}
            onCancel={() => setShowCreateAdmin(false)}
            busy={createAdminMutation.isPending}
            tempPassword={createAdminMutation.data?.data?.temporaryPassword}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg p-5">
        <h3 className="text-sm font-medium text-fg mb-4">Admin Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Name" value={admin.name} />
          <InfoField label="Email" value={admin.email} />
          <InfoField label="Phone" value={admin.phone} />
          <InfoField label="Status" value={admin.status} />
          <InfoField label="Last Login" value={admin.last_login_at ? new Date(admin.last_login_at).toLocaleString() : "Never"} />
          <InfoField label="Created" value={admin.created_at ? new Date(admin.created_at).toLocaleString() : undefined} />
        </div>
        {admin.temporary_password && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg flex items-start gap-2">
            <Warning size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700">Temporary Password Active</p>
              <p className="text-xs text-amber-600 mt-1">
                The admin must change their password on first login.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateAdminForm({
  onSubmit,
  onCancel,
  busy,
  tempPassword,
}: {
  onSubmit: (data: { name: string; email: string; phone: string }) => void
  onCancel: () => void
  busy: boolean
  tempPassword?: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  if (tempPassword) {
    return (
      <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle size={16} className="text-green-600" />
          <span className="text-sm font-medium text-green-700">Admin Created Successfully</span>
        </div>
        <p className="text-xs text-green-600 mb-2">
          Share these credentials with the admin. They will be asked to change their password on first login.
        </p>
        <div className="bg-white rounded-lg p-3 border border-green-200">
          <p className="text-xs text-muted">Temporary Password:</p>
          <p className="text-sm font-mono font-medium text-fg">{tempPassword}</p>
        </div>
        <button
          onClick={onCancel}
          className="mt-3 px-4 py-2 text-sm font-medium text-fg bg-white border border-border rounded-lg hover:bg-bg"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ name, email, phone })
      }}
      className="mt-4 bg-white border border-border rounded-lg p-5 space-y-4"
    >
      <h4 className="text-sm font-medium text-fg">Create Society Admin</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Full Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted mb-1">Phone *</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted bg-bg border border-border rounded-lg hover:bg-border/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create Admin"}
        </button>
      </div>
    </form>
  )
}

function EditSocietyModal({
  society,
  onSubmit,
  onCancel,
  busy,
}: {
  society: AdminCooperative
  onSubmit: (data: Partial<AdminCooperative>) => void
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState(society.name)
  const [code, setCode] = useState(society.code)
  const [district, setDistrict] = useState(society.district)
  const [state, setState] = useState(society.state)
  const [contactEmail, setContactEmail] = useState(society.contact_email ?? "")
  const [contactPhone, setContactPhone] = useState(society.contact_phone ?? "")
  const [address, setAddress] = useState(society.address ?? "")
  const [commissionRate, setCommissionRate] = useState(society.commission_rate?.toString() ?? "")
  const [minWorkers, setMinWorkers] = useState(society.min_workers?.toString() ?? "")
  const [maxWorkers, setMaxWorkers] = useState(society.max_workers?.toString() ?? "")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-fg">Edit Society</h3>
          <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted/50">
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit({
              name,
              code,
              district,
              state,
              contact_email: contactEmail || undefined,
              contact_phone: contactPhone || undefined,
              address: address || undefined,
              commission_rate: commissionRate ? Number(commissionRate) : undefined,
              min_workers: minWorkers ? Number(minWorkers) : undefined,
              max_workers: maxWorkers ? Number(maxWorkers) : undefined,
            })
          }}
          className="p-5 space-y-4"
        >
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
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Contact Email</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Contact Phone</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Commission Rate (%)</label>
              <input type="number" min="0" max="100" step="0.5" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Min Workers</label>
              <input type="number" min="0" value={minWorkers} onChange={(e) => setMinWorkers(e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Max Workers</label>
              <input type="number" min="0" value={maxWorkers} onChange={(e) => setMaxWorkers(e.target.value)} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted bg-bg border border-border rounded-lg hover:bg-border/50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50">
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <span className="text-xs text-muted">{label}</span>
      <p className="text-sm text-fg font-medium">{value ?? "—"}</p>
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="text-center p-3 bg-bg rounded-lg">
      <div className={`flex justify-center mb-1 ${color || "text-accent"}`}>{icon}</div>
      <p className="text-lg font-semibold text-fg">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
