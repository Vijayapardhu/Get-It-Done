import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useRef, useCallback } from "react"
import { adminApi } from "../lib/api"
import type { Zone } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { formatMoney } from "../lib/utils"
import { MapPin, Plus, Pencil, Trash, SquaresFour } from "@phosphor-icons/react"
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

function MapController({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap()
  onMapReady(map)
  return null
}

export function ZoneManagement() {
  const queryClient = useQueryClient()
  const mapRef = useRef<L.Map | null>(null)

  const [isCreating, setIsCreating] = useState(false)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [form, setForm] = useState({
    name: "",
    basePrice: "",
    demandMultiplier: "1.0",
    status: "active",
  })
  const [currentPolygon, setCurrentPolygon] = useState<number[][][] | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["zones"],
    queryFn: () => adminApi.getZones().then((r) => r.data.zones),
  })

  const zones: Zone[] = data ?? []

  const createMutation = useMutation({
    mutationFn: () => adminApi.createZone({
      name: form.name,
      polygon: { type: "Polygon", coordinates: currentPolygon! },
      basePrice: Number(form.basePrice),
      demandMultiplier: Number(form.demandMultiplier),
      status: form.status,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] })
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => adminApi.updateZone(editingZone!.id, {
      name: form.name,
      basePrice: Number(form.basePrice),
      demandMultiplier: Number(form.demandMultiplier),
      status: form.status,
      ...(currentPolygon ? { polygon: { type: "Polygon", coordinates: currentPolygon } } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteZone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] })
      setDeleteConfirm(null)
    },
  })

  const resetForm = () => {
    setIsCreating(false)
    setEditingZone(null)
    setForm({ name: "", basePrice: "", demandMultiplier: "1.0", status: "active" })
    setCurrentPolygon(null)
    setDrawPoints([])
    setIsDrawing(false)
  }

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return
      const { lat, lng } = e.latlng
      setDrawPoints((prev) => [...prev, [lat, lng]])
    })
  }, [isDrawing])

  const finishDrawing = () => {
    if (drawPoints.length >= 3) {
      const coordinates = [drawPoints.map(([lat, lng]) => [lng, lat] as [number, number])]
      coordinates[0].push(coordinates[0][0])
      setCurrentPolygon(coordinates)
    }
    setIsDrawing(false)
  }

  const startDrawing = () => {
    setIsDrawing(true)
    setDrawPoints([])
    setCurrentPolygon(null)
  }

  const startEdit = (zone: Zone) => {
    setEditingZone(zone)
    setForm({
      name: zone.name,
      basePrice: zone.basePrice?.toString() ?? zone.base_price?.toString() ?? "",
      demandMultiplier: zone.demandMultiplier?.toString() ?? zone.demand_multiplier?.toString() ?? "1.0",
      status: zone.status,
    })
    setCurrentPolygon(zone.geometry?.coordinates ?? zone.polygon?.coordinates ?? null)
    setIsCreating(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPolygon) return
    if (editingZone) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const polygonColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

  const getPolygonPositions = (coords: number[][][] | undefined): [number, number][] => {
    if (!coords) return []
    return coords[0].map(([lng, lat]) => [lat, lng] as [number, number])
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zone Management"
        description={`${zones.length} pricing zones configured`}
        icon={MapPin}
      >
        <button
          onClick={() => { setIsCreating(true); setEditingZone(null) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          New Zone
        </button>
      </PageHeader>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load zones" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading zones…" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="bg-white border border-border rounded-lg overflow-hidden" style={{ height: "500px" }}>
              <MapContainer
                center={[16.5062, 80.6480]}
                zoom={11}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController onMapReady={handleMapReady} />
                {zones.map((zone, idx) => {
                  const positions = getPolygonPositions(zone.geometry?.coordinates ?? zone.polygon?.coordinates)
                  if (positions.length === 0) return null
                  return (
                    <Polygon
                      key={zone.id}
                      positions={positions}
                      pathOptions={{
                        color: polygonColors[idx % polygonColors.length],
                        fillColor: polygonColors[idx % polygonColors.length],
                        fillOpacity: 0.2,
                        weight: 2,
                      }}
                    />
                  )
                })}
                {isDrawing && drawPoints.length > 0 && (
                  <Polygon
                    positions={drawPoints}
                    pathOptions={{
                      color: "#6366f1",
                      fillColor: "#6366f1",
                      fillOpacity: 0.3,
                      weight: 2,
                      dashArray: "5, 5",
                    }}
                  />
                )}
              </MapContainer>
            </div>
          </div>

          <div className="space-y-4">
            {isCreating && (
              <div className="bg-white border border-border rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-medium text-fg">
                  {editingZone ? "Edit Zone" : "Create Zone"}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">Zone Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g., Vijayawada Central"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">Base Price (₹) *</label>
                    <input
                      type="number"
                      value={form.basePrice}
                      onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                      placeholder="500"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">Demand Multiplier</label>
                    <input
                      type="number"
                      value={form.demandMultiplier}
                      onChange={(e) => setForm((f) => ({ ...f, demandMultiplier: e.target.value }))}
                      min="0.5"
                      max="5"
                      step="0.1"
                      className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-fg">Zone Boundary</span>
                      {!isDrawing ? (
                        <button
                          type="button"
                          onClick={startDrawing}
                          className="text-xs text-primary hover:text-primary/80"
                        >
                          {currentPolygon ? "Redraw" : "Draw on Map"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={finishDrawing}
                          disabled={drawPoints.length < 3}
                          className="text-xs text-ok hover:text-ok/80 disabled:opacity-50"
                        >
                          Finish ({drawPoints.length} points)
                        </button>
                      )}
                    </div>
                    {isDrawing && (
                      <p className="text-xs text-muted">Click on the map to add points. Need at least 3 points.</p>
                    )}
                    {currentPolygon && !isDrawing && (
                      <div className="bg-ok/10 border border-ok/20 rounded p-1.5">
                        <p className="text-xs text-ok font-medium">Polygon defined</p>
                      </div>
                    )}
                  </div>

                  {(createMutation.isError || updateMutation.isError) && (
                    <div className="bg-danger/10 border border-danger/20 rounded-md p-2">
                      <p className="text-xs text-danger">Failed to save zone</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 px-3 py-2 text-xs font-medium text-fg bg-muted rounded-md hover:bg-muted/80 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!currentPolygon || createMutation.isPending || updateMutation.isPending}
                      className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingZone ? "Update" : "Create"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-fg flex items-center gap-2">
                  <SquaresFour size={16} />
                  Zones
                </h3>
              </div>
              {zones.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon="box" title="No zones" description="Create your first pricing zone by clicking on the map." />
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                  {zones.map((zone, idx) => (
                    <div key={zone.id} className="p-3 hover:bg-muted/10">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: polygonColors[idx % polygonColors.length] }}
                          />
                          <div>
                            <p className="text-sm font-medium text-fg">{zone.name}</p>
                            <p className="text-xs text-muted">
                              Base: {formatMoney(zone.basePrice ?? zone.base_price ?? 0)} | Mult: {zone.demandMultiplier ?? zone.demand_multiplier ?? 1}x
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(zone)}
                            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Pencil size={14} className="text-muted" />
                          </button>
                          {deleteConfirm === zone.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => deleteMutation.mutate(zone.id)}
                                className="px-2 py-0.5 text-[10px] font-medium bg-danger text-white rounded"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-0.5 text-[10px] font-medium bg-muted text-fg rounded"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(zone.id)}
                              className="p-1.5 rounded-md hover:bg-danger/10 transition-colors"
                            >
                              <Trash size={14} className="text-danger" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 ml-5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${zone.status === "active" ? "bg-ok/10 text-ok" : "bg-muted text-muted"}`}>
                          {zone.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
