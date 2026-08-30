import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { AdminCooperative } from "../lib/types"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { ArrowLeft, MapPin, Pencil, CheckCircle } from "@phosphor-icons/react"

export function SocietyDetail() {
  const { societyId } = useParams<{ societyId: string }>()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["society", societyId],
    queryFn: () => adminApi.getAdminSociety(societyId!).then((r) => r.data.society),
    enabled: !!societyId,
  })

  const society: AdminCooperative | undefined = data

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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/societies" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-fg">{society.name}</h1>
          <p className="text-xs text-muted">{society.district}, {society.state}</p>
        </div>
        <Link
          to={`/societies/${societyId}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-border rounded-md hover:bg-muted/50 transition-colors"
        >
          <Pencil size={14} />
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-4">Society Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted">Name</span>
                <p className="text-sm text-fg font-medium">{society.name}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Status</span>
                <p className="text-sm">
                  <Badge variant="success" size="sm">
                    Active
                  </Badge>
                </p>
              </div>
              <div>
                <span className="text-xs text-muted">District</span>
                <p className="text-sm text-fg">{society.district ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted">State</span>
                <p className="text-sm text-fg">{society.state ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Contact Email</span>
                <p className="text-sm text-fg">{society.contact_email ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Contact Phone</span>
                <p className="text-sm text-fg">{society.contact_phone ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Code</span>
                <p className="text-sm text-fg">{society.code ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Commission Rate</span>
                <p className="text-sm text-fg">{society.commission_rate != null ? `${society.commission_rate}%` : "—"}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-4">Performance Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <p className="text-lg font-semibold text-fg">—</p>
                <p className="text-xs text-muted">Workers</p>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <p className="text-lg font-semibold text-fg">—</p>
                <p className="text-xs text-muted">Active</p>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <p className="text-lg font-semibold text-fg">—</p>
                <p className="text-xs text-muted">Bookings</p>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-lg">
                <p className="text-lg font-semibold text-fg">—</p>
                <p className="text-xs text-muted">Revenue</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Location</h3>
            <div className="flex items-start gap-2">
              <MapPin size={16} className="text-muted mt-0.5" />
              <div>
                <p className="text-sm text-fg">{society.address ?? "No address on file"}</p>
                <p className="text-xs text-muted">{society.district}, {society.state}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Verification</h3>
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-ok" />
              <span className="text-sm text-fg">Active</span>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Federation</h3>
            <p className="text-sm text-fg">{society.federation_name ?? "Not assigned"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
