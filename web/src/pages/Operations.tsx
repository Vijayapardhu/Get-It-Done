import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { DataTable, type Column } from "../components/ui/DataTable"
import { LoadingState, ErrorState } from "../components/ui/EmptyState"
import { PageHeader } from "../components/ui/PageHeader"
import { Badge } from "../components/ui/Badge"
import { formatRelativeTime } from "../lib/utils"
import { Pulse, ClipboardText, PlayCircle, Clock, WarningCircle } from "@phosphor-icons/react"
import { useAuth } from "../lib/AuthContext"

type Tab = "bookings" | "active" | "delayed" | "emergencies"

const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "bookings", label: "Current Bookings", icon: ClipboardText },
  { key: "active", label: "Active Jobs", icon: PlayCircle },
  { key: "delayed", label: "Delayed", icon: Clock },
  { key: "emergencies", label: "Emergencies", icon: WarningCircle },
]

export function Operations() {
  const { user } = useAuth()
  const isFederation = user?.role === "federation_admin" || user?.role === "system_admin"
  const [tab, setTab] = useState<Tab>("bookings")

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["federation-operations"],
    queryFn: () => adminApi.getLiveOperations().then((r) => r.data),
    enabled: isFederation,
  })

  const { data: emergenciesData } = useQuery({
    queryKey: ["active-emergencies"],
    queryFn: () => adminApi.getActiveEmergencies().then((r) => r.data.emergencies),
    enabled: isFederation,
  })

  const { data: delayedData } = useQuery({
    queryKey: ["delayed-bookings"],
    queryFn: () => adminApi.getDelayedBookings().then((r) => r.data.delayed),
    enabled: isFederation,
  })

  if (!isFederation) {
    return <CooperativeOperations />
  }

  const emergencyCount = emergenciesData?.length ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operations"
        description="Federation-wide live operations"
        icon={Pulse}
      >
        {emergencyCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crit/10 text-crit animate-pulse">
            <WarningCircle size={14} />
            <span className="text-xs font-medium">{emergencyCount} active emergency{emergencyCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </PageHeader>

      <div className="flex gap-1 bg-bg rounded-xl p-1 border border-border overflow-x-auto">
        {tabs.map((t) => {
          const count = countForFederation(data, delayedData, emergenciesData, t.key)
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                tab === t.key
                  ? "bg-accent text-white shadow-lg shadow-accent/25"
                  : "text-muted hover:text-ink hover:bg-border/50"
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-border"}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load operations" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading operations…" />
      ) : (
        <div>
          {tab === "bookings" && <FederationBookingsTable rows={data?.activeBookings ?? []} />}
          {tab === "active" && <FederationActiveJobsTable rows={data?.activeBookings?.filter((b) => b.status === "started" || b.status === "en_route") ?? []} />}
          {tab === "delayed" && <FederationDelayedTable rows={delayedData ?? []} />}
          {tab === "emergencies" && <FederationEmergenciesTable rows={emergenciesData ?? []} />}
        </div>
      )}
    </div>
  )
}

function CooperativeOperations() {
  const [tab, setTab] = useState<Tab>("bookings")
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cooperative-operations"],
    queryFn: () => adminApi.getOperations().then((r) => r.data),
  })

  const emergencyCount = data?.emergencyRequests?.length ?? 0

  return (
    <div className="space-y-5">
      <PageHeader title="Operations" description="Live jobs, delays, complaints and emergencies" icon={Pulse}>
        {emergencyCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crit/10 text-crit animate-pulse">
            <WarningCircle size={14} />
            <span className="text-xs font-medium">{emergencyCount} active emergency{emergencyCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </PageHeader>

      <div className="flex gap-1 bg-bg rounded-xl p-1 border border-border overflow-x-auto">
        {tabs.map((t) => {
          const count = countFor(data, t.key)
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${tab === t.key ? "bg-accent text-white shadow-lg shadow-accent/25" : "text-muted hover:text-ink hover:bg-border/50"}`}>
              <Icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-border"}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {isError ? (
        <div className="max-w-md mx-auto"><ErrorState message="Failed to load operations" onRetry={() => refetch()} /></div>
      ) : isLoading ? (
        <LoadingState message="Loading operations…" />
      ) : (
        <div>
          {tab === "bookings" && <BookingsTable rows={data!.currentBookings} />}
          {tab === "active" && <ActiveJobsTable rows={data!.activeJobs} />}
          {tab === "delayed" && <DelayedTable rows={data!.delayedJobs} />}
          {tab === "emergencies" && <EmergenciesTable rows={data!.emergencyRequests} />}
        </div>
      )}
    </div>
  )
}

function countForFederation(data: any, delayed: any, emergencies: any, tab: Tab): number {
  switch (tab) {
    case "bookings": return data?.activeBookings?.length ?? 0
    case "active": return data?.activeBookings?.filter((b: any) => b.status === "started" || b.status === "en_route").length ?? 0
    case "delayed": return delayed?.length ?? 0
    case "emergencies": return emergencies?.length ?? 0
    default: return 0
  }
}

function countFor(data: any, tab: Tab): number {
  if (!data) return 0
  switch (tab) {
    case "bookings": return data.currentBookings?.length ?? 0
    case "active": return data.activeJobs?.length ?? 0
    case "delayed": return data.delayedJobs?.length ?? 0
    case "emergencies": return data.emergencyRequests?.length ?? 0
    default: return 0
  }
}

const bookingColumns: Column<any>[] = [
  { key: "booking_number", header: "Booking", render: (_v, r) => <span className="font-mono text-xs">{r.booking_number}</span> },
  { key: "service_name", header: "Service" },
  { key: "customer_name", header: "Customer" },
  { key: "status", header: "Status", render: (_v, r) => <Badge variant={r.status === "completed" ? "success" : r.status === "cancelled" ? "danger" : "info"} size="sm">{r.status}</Badge> },
  { key: "created_at", header: "Created", render: (_v, r) => formatRelativeTime(r.created_at), hideOnMobile: true },
]

const activeColumns: Column<any>[] = [
  { key: "booking_number", header: "Booking", render: (_v, r) => <span className="font-mono text-xs">{r.booking_number}</span> },
  { key: "service_name", header: "Service" },
  { key: "customer_name", header: "Customer" },
  { key: "status", header: "Status", render: (_v, r) => <Badge variant="info" size="sm">{r.status}</Badge> },
]

const delayedColumns: Column<any>[] = [
  { key: "booking_number", header: "Booking", render: (_v, r) => <span className="font-mono text-xs">{r.booking_number}</span> },
  { key: "service_name", header: "Service" },
  { key: "status", header: "Status", render: (_v, r) => <Badge variant="warning" size="sm">{r.status}</Badge> },
  { key: "minutes_pending", header: "Minutes", align: "right", render: (_v, r) => <span className="font-tabular text-warn">{r.minutes_pending ?? "—"}</span> },
]

const emergencyColumns: Column<any>[] = [
  { key: "booking_number", header: "Booking", render: (_v, r) => <span className="font-mono text-xs">{r.booking_number}</span> },
  { key: "service_name", header: "Service" },
  { key: "priority", header: "Priority", render: (_v, r) => <Badge variant={r.priority === "critical" ? "danger" : "warning"} size="sm">{r.priority}</Badge> },
  { key: "escalation_level", header: "Escalation", align: "right", render: (_v, r) => <span className="font-tabular">{r.escalation_level ?? 0}</span>, hideOnMobile: true },
  { key: "created_at", header: "Created", render: (_v, r) => formatRelativeTime(r.created_at), hideOnMobile: true },
]

function FederationBookingsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No active bookings" />
  return <DataTable columns={bookingColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function FederationActiveJobsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No active jobs" />
  return <DataTable columns={activeColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function FederationDelayedTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No delayed bookings" />
  return <DataTable columns={delayedColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function FederationEmergenciesTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No active emergencies" />
  return <DataTable columns={emergencyColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function BookingsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No current bookings" />
  return <DataTable columns={bookingColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function ActiveJobsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No active jobs" />
  return <DataTable columns={activeColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function DelayedTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No delayed bookings" />
  return <DataTable columns={delayedColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function EmergenciesTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyTable message="No active emergencies" />
  return <DataTable columns={emergencyColumns} data={rows} keyExtractor={(r) => r.id} loading={false} />
}

function EmptyTable({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}
