import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { adminApi } from "../lib/api"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { PageHeader } from "../components/ui/PageHeader"
import { MapPin, Check, Clock } from "@phosphor-icons/react"

export function UnassignedRequests() {
  const queryClient = useQueryClient()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedSociety, setSelectedSociety] = useState<string>("")

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["unassigned-bookings"],
    queryFn: () => adminApi.getTerritoryUnassignedBookings().then((r) => r.data.bookings),
  })

  const { data: societies } = useQuery({
    queryKey: ["societies"],
    queryFn: () => adminApi.getSocieties().then((r) => r.data.cooperatives),
  })

  const assignMutation = useMutation({
    mutationFn: (vars: { bookingId: string; cooperativeId: string }) =>
      adminApi.assignBooking(vars.bookingId, vars.cooperativeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-bookings"] })
      setAssigningId(null)
      setSelectedSociety("")
    },
  })

  const bookings: any[] = data ?? []

  const reasonForUnassigned = (booking: any) => {
    if (!booking.lat || !booking.lng) return "Invalid location"
    if (!booking.nearestSociety) return "No territories defined"
    return `Outside territory (${booking.nearestSociety.distance_km?.toFixed(1)} km from ${booking.nearestSociety.cooperative_name})`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Unassigned Requests"
        description={`${bookings.length} requests outside territory coverage`}
        icon={MapPin}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load unassigned requests" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading unassigned requests…" />
      ) : bookings.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="All requests assigned" description="All booking requests have been resolved to a society." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Booking</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Customer</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Service</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Location</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Reason</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Nearest Society</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking: any) => (
                <tr key={booking.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-fg">{booking.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(booking.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg">{booking.customer_name}</td>
                  <td className="px-4 py-3 text-muted">{booking.service_name}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted max-w-[150px] truncate">{booking.address || "—"}</div>
                    {booking.lat && booking.lng && (
                      <div className="text-xs text-muted">{booking.lat.toFixed(4)}, {booking.lng.toFixed(4)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                      {reasonForUnassigned(booking)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {booking.nearestSociety ? (
                      <div>
                        <div className="text-xs text-fg">{booking.nearestSociety.cooperative_name}</div>
                        <div className="text-xs text-muted">{booking.nearestSociety.distance_km?.toFixed(1)} km</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {assigningId === booking.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedSociety}
                          onChange={(e) => setSelectedSociety(e.target.value)}
                          className="px-2 py-1 border border-border rounded text-xs"
                        >
                          <option value="">Select society</option>
                          {societies?.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (selectedSociety) {
                              assignMutation.mutate({ bookingId: booking.id, cooperativeId: selectedSociety })
                            }
                          }}
                          disabled={!selectedSociety || assignMutation.isPending}
                          className="p-1 bg-ok text-white rounded text-xs disabled:opacity-50"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningId(booking.id)}
                        className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90"
                      >
                        Assign
                      </button>
                    )}
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
