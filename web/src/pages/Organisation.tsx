import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { LoadingState, ErrorState } from "../components/ui/EmptyState"
import { PageHeader } from "../components/ui/PageHeader"
import { OrganisationIllustration } from "../components/ui/Illustrations"
import { useAuth } from "../lib/AuthContext"
import { Building, Users, UserCheck, MapPin } from "@phosphor-icons/react"

export function Organisation() {
  const { scope } = useAuth()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["societies"],
    queryFn: () => adminApi.getSocieties().then((r) => r.data.cooperatives),
  })

  const mine = data?.find((c) => c.id === scope?.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisation"
        description="Your cooperative society"
        icon={Building}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load organisation" description="We couldn't fetch your society details. Check your connection and try again." onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading organisation…" />
      ) : (
        <div className="bg-surface rounded-xl border border-muted/20 p-6">
          <div className="flex items-start gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-muted/10">
                <div className="p-3 rounded-xl bg-accent/10">
                  <Building size={28} className="text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">{mine?.name ?? "Your Society"}</h2>
                  <p className="text-sm text-muted">{mine?.district ?? ""}{mine?.state ? `, ${mine.state}` : ""}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field icon={MapPin} label="District" value={mine?.district ?? "—"} />
                <Field icon={MapPin} label="State" value={mine?.state ?? "—"} />
                <Field icon={Users} label="Members" value={mine?.memberCount != null ? String(mine.memberCount) : "—"} />
                <Field icon={UserCheck} label="Verified Workers" value={mine?.verifiedWorkers != null ? String(mine.verifiedWorkers) : "—"} />
              </div>
            </div>
            <div className="hidden lg:block flex-shrink-0">
              <OrganisationIllustration className="w-48 h-40" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/5">
      <div className="p-1.5 rounded-lg bg-muted/10">
        <Icon size={16} className="text-muted" />
      </div>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  )
}
