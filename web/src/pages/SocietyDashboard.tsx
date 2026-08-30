import { useQuery } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { MapContainer, TileLayer, Polygon } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import {
  MapPin,
  Users,
  ClipboardText,
  Check,
  Pencil,
  Eye,
  ArrowRight,
  User,
} from "@phosphor-icons/react"
import type { Territory, Worker } from "../lib/types"

export function SocietyDashboard() {
  const { societyId } = useParams<{ societyId: string }>()

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ["society-dashboard", societyId],
    queryFn: () => adminApi.getTerritoryStatistics(societyId!).then((r) => r.data),
    enabled: !!societyId,
  })

  const { data: territoryData } = useQuery({
    queryKey: ["society-territory", societyId],
    queryFn: () => adminApi.getTerritory(societyId!).then((r) => r.data.territory),
    enabled: !!societyId,
  })

  const { data: workersData } = useQuery({
    queryKey: ["society-workers", societyId],
    queryFn: () => adminApi.getSocietyWorkers(societyId!, { limit: 10 }).then((r) => r.data),
    enabled: !!societyId,
  })

  const { data: societyData } = useQuery({
    queryKey: ["society-detail", societyId],
    queryFn: () => adminApi.getAdminSociety(societyId!).then((r) => r.data.society),
    enabled: !!societyId,
  })

  if (isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load society dashboard" onRetry={() => refetch()} />
      </div>
    )
  }

  if (isLoading || !stats) {
    return <LoadingState message="Loading society dashboard…" />
  }

  const territory: Territory | undefined = territoryData || stats?.territory
  const bookings = stats?.bookings || {}
  const workers = stats?.workers || {}
  const workersList: Worker[] = workersData?.workers || []

  const polygonPositions = territory?.geometry?.coordinates?.[0]?.map(
    ([lng, lat]: number[]) => [lat, lng] as [number, number]
  ) || []

  const centerPoint: [number, number] = polygonPositions[0] || [16.5, 80.6]

  const statusColor = territory?.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">{societyData?.name || "Society Dashboard"}</h1>
          <p className="text-xs text-muted">
            {societyData?.district}, {societyData?.state}
            {societyData?.federation_name && ` · ${societyData.federation_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
            {territory?.status || "No territory"}
          </span>
          {territory && <span className="text-xs text-muted">v{territory.version}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardText size={16} className="text-blue-600" />
            <span className="text-xs text-muted">Total Bookings</span>
          </div>
          <p className="text-xl font-semibold text-fg">{bookings.total || 0}</p>
          <p className="text-xs text-muted">{bookings.active || 0} active</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Check size={16} className="text-green-600" />
            <span className="text-xs text-muted">Completed</span>
          </div>
          <p className="text-xl font-semibold text-fg">{bookings.completed || 0}</p>
          <p className="text-xs text-muted">
            {bookings.total ? Math.round((bookings.completed / bookings.total) * 100) : 0}% rate
          </p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-purple-600" />
            <span className="text-xs text-muted">Workers</span>
          </div>
          <p className="text-xl font-semibold text-fg">{workers.total || 0}</p>
          <p className="text-xs text-muted">{workers.available || 0} available</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-orange-600" />
            <span className="text-xs text-muted">Coverage</span>
          </div>
          <p className="text-xl font-semibold text-fg">{territory?.area_km2 || "—"}</p>
          <p className="text-xs text-muted">km²</p>
        </div>
      </div>

      {territory && polygonPositions.length > 0 && (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-fg">Territory Map</h3>
            <span className="text-xs text-muted">
              Center: {territory.center_lat?.toFixed(4)}, {territory.center_lng?.toFixed(4)}
            </span>
          </div>
          <div className="h-[300px]">
            <MapContainer center={centerPoint} zoom={13} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Polygon
                positions={polygonPositions}
                pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.2 }}
              />
              {workersList.map((w) => (
                w.cooperativeId === societyId && (
                  <div key={w.id} />
                )
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-fg mb-3">Worker Status</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Total Workers</span>
              <span className="font-medium">{workers.total || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Available</span>
              <span className="font-medium text-green-600">{workers.available || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Verified</span>
              <span className="font-medium">{workers.verified || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-medium text-fg mb-3">Booking Status</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Total</span>
              <span className="font-medium">{bookings.total || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Active</span>
              <span className="font-medium text-blue-600">{bookings.active || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Completed</span>
              <span className="font-medium text-green-600">{bookings.completed || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {workersList.length > 0 && (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-fg">Recent Workers</h3>
            <Link to={`/societies/${societyId}/workers`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {workersList.slice(0, 5).map((worker) => (
              <div key={worker.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-fg">{worker.name}</p>
                    <p className="text-xs text-muted">{worker.workerCode}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  worker.currentStatus === "available" ? "bg-green-100 text-green-700" :
                  worker.currentStatus === "busy" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {worker.currentStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-fg mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to={`/societies/${societyId}/territory/edit`}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Pencil size={20} className="text-blue-600" />
            <span className="text-xs text-fg">Edit Territory</span>
          </Link>
          <Link
            to={`/societies/${societyId}/workers`}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Users size={20} className="text-purple-600" />
            <span className="text-xs text-fg">Manage Workers</span>
          </Link>
          <Link
            to={`/societies/${societyId}/bookings`}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <ClipboardText size={20} className="text-green-600" />
            <span className="text-xs text-fg">View Bookings</span>
          </Link>
          <Link
            to={`/societies/${societyId}`}
            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <Eye size={20} className="text-orange-600" />
            <span className="text-xs text-fg">Society Details</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
