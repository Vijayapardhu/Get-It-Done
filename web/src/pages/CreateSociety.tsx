import { useState, useRef, useCallback, useEffect } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { adminApi } from "../lib/api"
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapPin, Check, Warning, ArrowLeft } from "@phosphor-icons/react"

interface PolygonPoint {
  lat: number
  lng: number
}

function MapController({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onMapReady(map) }, [map, onMapReady])
  return null
}

export function CreateSociety() {
  const navigate = useNavigate()
  const mapRef = useRef<L.Map | null>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState({
    name: "",
    code: "",
    district: "",
    state: "",
    federationId: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    commissionRate: "10",
  })
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    phone: "",
  })

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<PolygonPoint[]>([])
  const [polygon, setPolygon] = useState<PolygonPoint[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)

  const { data: federations } = useQuery({
    queryKey: ["federations"],
    queryFn: () => adminApi.getFederations().then((r) => r.data.federations),
  })

  const validateMutation = useMutation({
    mutationFn: (data: any) => adminApi.validateTerritory(data),
    onSuccess: (res) => {
      setValidationErrors(res.data.errors || [])
      setConflicts(res.data.conflicts || [])
    },
  })

  const previewMutation = useMutation({
    mutationFn: (data: any) => adminApi.previewTerritory(data),
    onSuccess: (res) => setPreview(res.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.createSociety(data),
    onSuccess: (res) => {
      if (polygon.length >= 3 && res.data.cooperative?.id) {
        createTerritoryMutation.mutate({
          cooperativeId: res.data.cooperative.id,
          polygon: { type: "Polygon", coordinates: [polygon.map(p => [p.lng, p.lat])] },
        })
      }
      setCreatedSocietyId(res.data.cooperative.id)
    },
  })

  const [createdSocietyId, setCreatedSocietyId] = useState<string | null>(null)
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)

  const createAdminMutation = useMutation({
    mutationFn: (data: { name: string; email: string; phone: string }) =>
      createdSocietyId ? adminApi.createSocietyAdmin(createdSocietyId, data) : Promise.reject(),
    onSuccess: () => {
      navigate(`/societies/${createdSocietyId}`)
    },
  })

  const createTerritoryMutation = useMutation({
    mutationFn: ({ cooperativeId, polygon }: { cooperativeId: string; polygon: any }) =>
      adminApi.createTerritory(cooperativeId, { polygon }),
  })

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return
      const { lat, lng } = e.latlng
      setDrawPoints((prev) => [...prev, { lat, lng }])
    })
  }, [isDrawing])

  const startDrawing = () => {
    setIsDrawing(true)
    setDrawPoints([])
    setPolygon([])
    setValidationErrors([])
    setConflicts([])
    setPreview(null)
  }

  const finishDrawing = () => {
    if (drawPoints.length >= 3) {
      setPolygon([...drawPoints])
      setIsDrawing(false)
    }
  }

  const clearPolygon = () => {
    setPolygon([])
    setDrawPoints([])
    setValidationErrors([])
    setConflicts([])
    setPreview(null)
  }

  const validateAndPreview = () => {
    if (polygon.length < 3 || !form.federationId) return
    const polygonData = { type: "Polygon" as const, coordinates: [polygon.map(p => [p.lng, p.lat])] }
    validateMutation.mutate({ polygon: polygonData, federationId: form.federationId })
    previewMutation.mutate({ polygon: polygonData })
  }

  const canProceed = polygon.length >= 3 && validationErrors.length === 0 && conflicts.length === 0

  useEffect(() => {
    if (polygon.length >= 3 && form.federationId) {
      validateAndPreview()
    }
  }, [polygon.length, form.federationId])

  const polygonPositions = polygon.map(p => [p.lat, p.lng] as [number, number])

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/societies")} className="p-2 rounded-lg hover:bg-muted/50">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-fg">Create Society</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${step >= 1 ? "bg-primary text-white" : "bg-muted/30"}`}>1. Details</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${step >= 2 ? "bg-primary text-white" : "bg-muted/30"}`}>2. Territory</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${step >= 3 ? "bg-primary text-white" : "bg-muted/30"}`}>3. Admin</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {step === 1 && (
          <>
            <div className="w-96 border-r border-border p-6 overflow-y-auto bg-white">
              <h2 className="text-sm font-semibold text-fg mb-4">Society Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-muted mb-1">Society Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="e.g. Vijayawada East Cooperative" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Code *</label>
                  <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="e.g. VWDE" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">District *</label>
                    <input type="text" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">State *</label>
                    <input type="text" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Federation *</label>
                  <select value={form.federationId} onChange={e => setForm({ ...form, federationId: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                    <option value="">Select federation</option>
                    {federations?.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Contact Email</label>
                  <input type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Phone</label>
                  <input type="tel" value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Address</label>
                  <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" rows={2} />
                </div>
                <button onClick={() => setStep(2)} disabled={!form.name || !form.code || !form.district || !form.state || !form.federationId} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  Next: Define Territory
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-muted/20">
              <div className="text-center text-muted">
                <MapPin size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Complete society details to continue</p>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="w-80 border-r border-border p-4 overflow-y-auto bg-white">
              <h2 className="text-sm font-semibold text-fg mb-3">Service Territory</h2>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={startDrawing} disabled={isDrawing} className="flex-1 py-2 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50">
                    {isDrawing ? "Drawing..." : "Draw Polygon"}
                  </button>
                  {isDrawing && drawPoints.length >= 3 && (
                    <button onClick={finishDrawing} className="px-3 py-2 bg-ok text-white rounded-lg text-xs">Done</button>
                  )}
                  <button onClick={clearPolygon} className="px-3 py-2 border border-border rounded-lg text-xs">Clear</button>
                </div>
                {polygon.length > 0 && (
                  <div className="p-3 bg-muted/20 rounded-lg text-xs space-y-1">
                    <p className="font-medium">Territory ({polygon.length} points)</p>
                    <p>Click "Draw Polygon" to start, then click on map to add points</p>
                  </div>
                )}
                {validationErrors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-red-700 flex items-start gap-1"><Warning size={12} className="mt-0.5 shrink-0" />{err}</p>
                    ))}
                  </div>
                )}
                {conflicts.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs font-medium text-yellow-800 mb-1">Territory Overlaps:</p>
                    {conflicts.map((c, i) => (
                      <p key={i} className="text-xs text-yellow-700">{c.cooperativeName} ({(c.intersectionAreaKm2).toFixed(2)} km²)</p>
                    ))}
                  </div>
                )}
                {preview && canProceed && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-green-800">Territory Preview</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted">Coverage:</span> <span className="font-medium">{preview.areaKm2} km²</span></div>
                      <div><span className="text-muted">Bookings:</span> <span className="font-medium">{preview.bookingCount}</span></div>
                      <div><span className="text-muted">Workers:</span> <span className="font-medium">{preview.workerCount}</span></div>
                      <div><span className="text-muted">Customers:</span> <span className="font-medium">{preview.customerCount}</span></div>
                    </div>
                  </div>
                )}
                {canProceed && (
                  <button onClick={() => setStep(3)} className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium">
                    Next: Create Admin
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 relative">
              <MapContainer center={[16.5, 80.6]} zoom={12} className="h-full w-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController onMapReady={handleMapReady} />
                {polygon.length > 0 && (
                  <Polygon positions={polygonPositions} pathOptions={{ color: canProceed ? "#16a34a" : "#dc2626", fillOpacity: 0.2 }} />
                )}
                {isDrawing && drawPoints.length > 0 && (
                  <Polygon positions={[...drawPoints.map(p => [p.lat, p.lng] as [number, number])]} pathOptions={{ color: "#2563eb", fillOpacity: 0.1, dashArray: "5,5" }} />
                )}
              </MapContainer>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="w-96 border-r border-border p-6 overflow-y-auto bg-white">
              {!createdSocietyId ? (
                <>
                  <h2 className="text-sm font-semibold text-fg mb-4">Society Administrator</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-muted mb-1">Full Name *</label>
                      <input type="text" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">Email *</label>
                      <input type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-1">Phone *</label>
                      <input type="tel" value={adminForm.phone} onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                    </div>
                    <button
                      onClick={() => createMutation.mutate({ ...form, commissionRate: Number(form.commissionRate) })}
                      disabled={!adminForm.name || !adminForm.email || !adminForm.phone || createMutation.isPending}
                      className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Society"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-fg mb-4">Create Admin Account</h2>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <p className="text-xs text-green-700">Society created successfully!</p>
                  </div>
                  {!showCreateAdmin ? (
                    <div className="space-y-3">
                      <button
                        onClick={() => setShowCreateAdmin(true)}
                        className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium"
                      >
                        Create Admin Account
                      </button>
                      <button
                        onClick={() => navigate(`/societies/${createdSocietyId}`)}
                        className="w-full py-2 border border-border rounded-lg text-sm"
                      >
                        Skip for now
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-muted mb-1">Full Name *</label>
                        <input type="text" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Email *</label>
                        <input type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-muted mb-1">Phone *</label>
                        <input type="tel" value={adminForm.phone} onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                      </div>
                      <button
                        onClick={() => createAdminMutation.mutate(adminForm)}
                        disabled={!adminForm.name || !adminForm.email || !adminForm.phone || createAdminMutation.isPending}
                        className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {createAdminMutation.isPending ? "Creating..." : "Create Admin"}
                      </button>
                      {createAdminMutation.isSuccess && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs text-green-700 font-medium">Admin created!</p>
                          <p className="text-xs text-green-600 mt-1">
                            Temporary password: <code className="bg-green-100 px-1 rounded">{createAdminMutation.data?.data?.temporaryPassword}</code>
                          </p>
                          <p className="text-xs text-green-600">Share this securely with the admin.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center bg-muted/20">
              <div className="text-center text-muted">
                <Check size={48} className="mx-auto mb-3 text-ok" />
                <p className="text-sm">Society: {form.name}</p>
                <p className="text-xs mt-1">Territory: {polygon.length} points</p>
                {createdSocietyId && <p className="text-xs mt-1 text-green-600">Created successfully!</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
