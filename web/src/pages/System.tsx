import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState } from "../components/ui/EmptyState"
import { formatDateTime } from "../lib/utils"
import { Gear, UserCircle, ShieldCheck, Clock } from "@phosphor-icons/react"
import type { AdminUserRow, AuditEvent } from "../lib/types"

export function System() {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => adminApi.getAdminUsers().then((r) => r.data.users) })
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => adminApi.getAuditEvents().then((r) => r.data.events) })

  const userColumns: Column<AdminUserRow>[] = [
    { key: "name", header: "Name", render: (_v, r) => (
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-full bg-accent/10">
          <UserCircle size={16} className="text-accent" />
        </div>
        <span className="text-sm font-medium text-ink">{r.name}</span>
      </div>
    ) },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (_v, r) => (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
        <ShieldCheck size={12} />
        {r.role.replace(/_/g, " ")}
      </span>
    ) },
    { key: "status", header: "Status" },
  ]

  const auditColumns: Column<AuditEvent>[] = [
    { key: "action", header: "Action" },
    { key: "resourceType", header: "Resource" },
    { key: "createdAt", header: "When", render: (_v, r) => (
      <span className="flex items-center gap-1 text-xs text-muted">
        <Clock size={12} />
        {formatDateTime(r.createdAt)}
      </span>
    ) },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="System"
        description="Admin users and audit trail"
        icon={Gear}
      />

      <div className="bg-surface rounded-xl border border-muted/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <UserCircle size={16} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Admin Users</h3>
            <p className="text-xs text-muted">People with console access</p>
          </div>
        </div>
        {users.isError ? <ErrorState message="Failed to load users" size="sm" onRetry={() => users.refetch()} /> :
          <DataTable columns={userColumns} data={users.data ?? []} keyExtractor={(u) => u.id} loading={users.isLoading} emptyMessage="No admin users" />}
      </div>

      <div className="bg-surface rounded-xl border border-muted/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-warn/10">
            <Clock size={16} className="text-warn" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Audit Trail</h3>
            <p className="text-xs text-muted">Recent system activity</p>
          </div>
        </div>
        {audit.isError ? <ErrorState message="Failed to load audit events" size="sm" onRetry={() => audit.refetch()} /> :
          <DataTable columns={auditColumns} data={audit.data ?? []} keyExtractor={(e) => e.id} loading={audit.isLoading} emptyMessage="No audit events" />}
      </div>
    </div>
  )
}
