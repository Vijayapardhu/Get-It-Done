import { useQuery } from "@tanstack/react-query"
import { useState, useMemo } from "react"
import { adminApi } from "../lib/api"
import { MapContainer, TileLayer, Polygon, useMap, Tooltip } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapPin, Warning, CheckCircle, XCircle, MagnifyingGlass } from "@phosphor-icons/react"
import type { Territory, TerritoryGap } from "../lib/types"

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"]

function MapController({ bounds }: { bounds: [number, number][] }) {
  const map = useMap()
  if (bounds.length > 0) {
    const latLngs = bounds.map(([lat, lng]) => L.latLng(lat, lng))
    map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] })
  }
  return null
}

function getStatusIcon(status: string) {
  switch (status) {
    case "active": return <CheckCircle size={14} className="text-green-600" />
    case "draft": return <Warning size={14} className="text-yellow-600" />
    case "inactive": return <XCircle size={14} className="text-red-600" />
    default: return <Warning size={14} className="text-gray-500" />
  }
}

export function FederationTerritories() {
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showGaps, setShowGaps] = useState(true)
  const [showConflicts, setShowConflicts] = useState(true)

  const { data: federations } = useQuery({
    queryKey: ["federations"],
    queryFn: () => adminApi.getFederations().then((r) => r.data.federations),
  })

  const [selectedFederation, setSelectedFederation] = useState<string>("")

  const { data: territories, isLoading } = useQuery({
    queryKey: ["federation-territories", selectedFederation],
    queryFn: () => adminApi.getFederationTerritories(selectedFederation).then((r) => r.data.territories),
    enabled: !!selectedFederation,
  })

  const { data: coverageStats } = useQuery({
    queryKey: ["coverage-stats", selectedFederation],
    queryFn: () => adminApi.getFederationCoverageStats(selectedFederation).then((r) => r.data),
    enabled: !!selectedFederation,
  })

  const { data: gaps } = useQuery({
    queryKey: ["territory-gaps", selectedFederation],
    queryFn: () => adminApi.getTerritoryGaps(selectedFederation).then((r) => r.data.gaps),
    enabled: !!selectedFederation && showGaps,
  })

  const filteredTerritories = useMemo(() => {
    if (!territories) return []
    return territories.filter((t: Territory) =>
      !searchQuery || t.cooperative_name?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [territories, searchQuery])

  const allBounds = useMemo(() => {
    const bounds: [number, number][] = []
    filteredTerritories.forEach((t: Territory) => {
      if (t.geometry?.coordinates?.[0]) {
        t.geometry.coordinates[0].forEach(([lng, lat]: number[]) => {
          bounds.push([lat, lng])
        })
      }
    })
    return bounds
  }, [filteredTerritories])

  const getColor = (index: number) => COLORS[index % COLORS.length]

  const selectedFederationName = federations?.find((f: any) => f.id === selectedFederation)?.name

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-fg">Federation Territories</h1>
          <select
            value={selectedFederation}
            onChange={(e) => setSelectedFederation(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm"
          >
            <option value="">Select Federation</option>
            {federations?.map((f: any) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {selectedFederationName && (
            <span className="text-sm text-muted">{selectedFederationName}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {coverageStats && (
            <>
              <span className="text-xs text-muted flex items-center gap-1">
                <CheckCircle size={12} className="text-green-600" />
                <strong>{coverageStats.societyCount}</strong> Societies
              </span>
              <span className="text-xs text-muted flex items-center gap-1">
                <MapPin size={12} />
                <strong>{coverageStats.territoryCount}</strong> Territories
              </span>
              <span className="text-xs text-muted flex items-center gap-1">
                <strong>{coverageStats.workerCount}</strong> Workers
              </span>
              <span className="text-xs text-muted flex items-center gap-1">
                <Warning size={12} className="text-orange-500" />
                <strong>{coverageStats.unassignedCount}</strong> Unassigned
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex">
        <div className="w-80 border-r border-border bg-white overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search societies..."
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGaps}
                  onChange={(e) => setShowGaps(e.target.checked)}
                  className="rounded"
                />
                Show Gaps
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showConflicts}
                  onChange={(e) => setShowConflicts(e.target.checked)}
                  className="rounded"
                />
                Conflicts
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="p-4 text-center text-muted text-sm">Loading territories...</div>
          ) : filteredTerritories.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm">No territories found</div>
          ) : (
            <div className="divide-y divide-border flex-1 overflow-y-auto">
              {filteredTerritories.map((territory: Territory, index: number) => (
                <button
                  key={territory.id}
                  onClick={() => setSelectedTerritory(territory)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selectedTerritory?.id === territory.id ? "bg-accent-light" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getColor(index) }} />
                    <span className="text-sm font-medium text-fg truncate">{territory.cooperative_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusIcon(territory.status)}
                    <span className="text-xs text-muted">
                      {territory.area_km2 ? `${territory.area_km2} km²` : "—"} · v{territory.version}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {gaps && gaps.length > 0 && (
            <div className="border-t border-border p-3">
              <p className="text-xs font-medium text-orange-700 mb-2 flex items-center gap-1">
                <Warning size={12} />
                Coverage Gaps ({gaps.length})
              </p>
              <div className="space-y-1">
                {gaps.slice(0, 5).map((gap: TerritoryGap, i: number) => (
                  <div key={i} className="text-xs text-muted">
                    Gap {i + 1}: {gap.area_km2?.toFixed(2)} km²
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          {selectedFederation ? (
            <MapContainer center={[16.5, 80.6]} zoom={10} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController bounds={allBounds} />

              {filteredTerritories.map((territory: Territory, index: number) => {
                const coords = territory.geometry?.coordinates?.[0] || []
                const positions = coords.map(([lng, lat]: number[]) => [lat, lng] as [number, number])
                if (positions.length === 0) return null

                const isSelected = selectedTerritory?.id === territory.id
                const fillColor = territory.status === "active" ? getColor(index) : "#9ca3af"

                return (
                  <Polygon
                    key={territory.id}
                    positions={positions}
                    pathOptions={{
                      color: isSelected ? "#1e40af" : fillColor,
                      fillColor,
                      fillOpacity: isSelected ? 0.4 : 0.2,
                      weight: isSelected ? 3 : 2,
                      dashArray: territory.status !== "active" ? "5,5" : undefined,
                    }}
                    eventHandlers={{
                      click: () => setSelectedTerritory(territory),
                    }}
                  >
                    <Tooltip sticky>
                      <div className="text-xs">
                        <strong>{territory.cooperative_name}</strong>
                        {territory.area_km2 && <div>{territory.area_km2} km²</div>}
                        <div className="capitalize">Status: {territory.status}</div>
                        <div>Version: {territory.version}</div>
                      </div>
                    </Tooltip>
                  </Polygon>
                )
              })}

              {showGaps && gaps?.map((gap: TerritoryGap, index: number) => {
                const coords = gap.geometry?.coordinates?.[0] || []
                const positions = coords.map(([lng, lat]: number[]) => [lat, lng] as [number, number])
                if (positions.length === 0) return null

                return (
                  <Polygon
                    key={`gap-${index}`}
                    positions={positions}
                    pathOptions={{
                      color: "#dc2626",
                      fillColor: "#dc2626",
                      fillOpacity: 0.15,
                      weight: 2,
                      dashArray: "8,4",
                    }}
                  >
                    <Tooltip>
                      <div className="text-xs text-red-700">
                        <strong>Coverage Gap</strong>
                        <div>{gap.area_km2?.toFixed(2)} km²</div>
                      </div>
                    </Tooltip>
                  </Polygon>
                )
              })}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted">
              <div className="text-center">
                <MapPin size={48} className="mx-auto mb-3 opacity-50" />
                <p>Select a federation to view territories</p>
              </div>
            </div>
          )}

          {selectedTerritory && (
            <div className="absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg border border-border p-4 max-w-md">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-fg">{selectedTerritory.cooperative_name}</h3>
                <button onClick={() => setSelectedTerritory(null)} className="text-xs text-muted hover:text-fg">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted">Area:</span>{" "}
                  <strong>{selectedTerritory.area_km2 || "—"} km²</strong>
                </div>
                <div>
                  <span className="text-muted">Version:</span>{" "}
                  <strong>{selectedTerritory.version}</strong>
                </div>
                <div>
                  <span className="text-muted">Center:</span>{" "}
                  <strong>
                    {selectedTerritory.center_lat?.toFixed(4)}, {selectedTerritory.center_lng?.toFixed(4)}
                  </strong>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(selectedTerritory.status)}
                  <span className="capitalize">{selectedTerritory.status}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
