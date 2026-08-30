import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { NotificationTemplate } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { Bell, Plus } from "@phosphor-icons/react"
import { useState } from "react"

export function NotificationTemplates() {
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => adminApi.getNotificationTemplates().then((r) => r.data.templates),
  })

  const templates: NotificationTemplate[] = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notification Templates"
        description={`${templates.length} templates configured`}
        icon={Bell}
      >
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add Template
        </button>
      </PageHeader>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load templates" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading templates…" />
      ) : templates.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No templates" description="Create your first notification template." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Channels</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Language</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium text-fg">{template.name}</td>
                  <td className="px-4 py-3 text-muted">{template.type}</td>
                  <td className="px-4 py-3 text-muted">{template.channels?.join(", ") ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{template.language ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={template.is_active !== false ? "success" : "neutral"} size="sm">
                      {template.is_active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
