import axios, { AxiosError } from "axios"
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios"
import { env } from "./env"
import type {
  AdminUser,
  WorkersListParams,
  WorkersListResponse,
  Worker,
  BulkStatusAction,
  DashboardOverview,
  ScopeOption,
  AdminScope,
  OperationsData,
  AnalyticsData,
  AreaDemandResponse,
  SupportTicket,
  Service,
  ServiceFaq,
  ServiceCategory,
  Cooperative,
  PricingRule,
  SurgeRule,
  TravelFee,
  TaxRule,
  AdminUserRow,
  RoleRow,
  AuditEvent,
  FederationOverview,
  RegionalDemandRow,
  SocietyPerformanceRow,
  FederationAiForecasts,
  AiRecommendation,
  AdminCooperative,
  LiveOperations,
  EmergencyBooking,
  RevenueAnalytics,
  BookingAnalytics,
  WorkerAnalytics,
  Settlement,
  Refund,
  SecurityEvent,
  NotificationTemplate,
} from "./types"

let accessToken: string | null = null
let refreshToken: string | null = null
let refreshPromise: Promise<string> | null = null

const SESSION_COOKIE = "gid_session"
const SESSION_DURATION_DAYS = 1

function setCookie(name: string, value: string, days: number) {
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`
}

function getCookie(name: string): string | null {
  const nameEQ = `${name}=`
  const cookies = document.cookie.split(";")
  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i].trim()
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length))
    }
  }
  return null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`
}

export function setTokens(at: string | null, rt: string | null) {
  accessToken = at
  refreshToken = rt
  if (at && rt) {
    setCookie(SESSION_COOKIE, JSON.stringify({ at, rt }), SESSION_DURATION_DAYS)
  } else {
    deleteCookie(SESSION_COOKIE)
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken
  // Try to restore from cookie
  const session = getCookie(SESSION_COOKIE)
  if (session) {
    try {
      const { at, rt } = JSON.parse(session)
      accessToken = at
      refreshToken = rt
      return at
    } catch {
      deleteCookie(SESSION_COOKIE)
    }
  }
  return null
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  deleteCookie(SESSION_COOKIE)
}

const api = axios.create({
  baseURL: env.VITE_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  config.headers["X-Request-ID"] = crypto.randomUUID()
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
      originalRequest._retry = true

      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const response = await axios.post(
              `${env.VITE_API_URL}/auth/refresh`,
              { refreshToken },
              { withCredentials: true }
            )
            const newAccessToken = response.data.accessToken
            const newRefreshToken = response.data.refreshToken
            accessToken = newAccessToken
            refreshToken = newRefreshToken
            return newAccessToken
          })()
        }

        const newAccessToken = await refreshPromise
        refreshPromise = null

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        refreshPromise = null
        clearTokens()
        window.location.href = "/login"
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export interface ApiResponse<T> {
  data: T
  status: number
}

export interface ListParams {
  page?: number
  limit?: number
  search?: string
  [key: string]: unknown
}

export async function apiGet<T>(url: string, params?: ListParams): Promise<ApiResponse<T>> {
  const response = await api.get(url, { params })
  return { data: response.data, status: response.status }
}

export async function apiPost<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await api.post(url, data)
  return { data: response.data, status: response.status }
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
  const response = await api.patch(url, data)
  return { data: response.data, status: response.status }
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  const response = await api.delete(url)
  return { data: response.data, status: response.status }
}

export const adminApi = {
  async login(identifier: string, password: string, totpCode?: string): Promise<ApiResponse<{ user: AdminUser; accessToken: string; refreshToken: string; expiresIn: string }>> {
    const response = await api.post("/auth/login", { identifier, password, totpCode })
    return { data: response.data, status: response.status }
  },

  async adminLogin(identifier: string, password: string, totpCode?: string): Promise<ApiResponse<{ user: AdminUser; accessToken: string; refreshToken: string; expiresIn: string }>> {
    const response = await api.post("/auth/admin/login", { identifier, password, totp: totpCode })
    return { data: response.data, status: response.status }
  },

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post("/auth/forgot-password", { email })
    return { data: response.data, status: response.status }
  },

  async resetPassword(token: string, password: string): Promise<ApiResponse<{ message: string }>> {
    const response = await api.post("/auth/reset-password", { token, password })
    return { data: response.data, status: response.status }
  },

  async getMe(): Promise<ApiResponse<{ user: AdminUser }>> {
    const response = await api.get("/auth/me")
    return { data: response.data, status: response.status }
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout-all")
  },

  async getScopeOptions(): Promise<ApiResponse<{ scopes: ScopeOption[] }>> {
    const response = await api.get("/admin/scopes")
    return { data: response.data, status: response.status }
  },

  async getDashboardOverview(): Promise<ApiResponse<{ overview: DashboardOverview }>> {
    const response = await api.get("/admin/dashboard/overview")
    return { data: response.data, status: response.status }
  },

  async getWorkers(params: WorkersListParams): Promise<ApiResponse<WorkersListResponse>> {
    const response = await api.get("/workers", { params })
    return { data: response.data, status: response.status }
  },

  async getWorker(id: string): Promise<ApiResponse<{ worker: Worker }>> {
    const response = await api.get(`/workers/${id}`)
    return { data: response.data, status: response.status }
  },

  async approveVerification(id: string): Promise<ApiResponse<{ worker: Worker }>> {
    const response = await api.post(`/admin/verifications/${id}/approve`)
    return { data: response.data, status: response.status }
  },

  async rejectVerification(id: string, reason: string): Promise<ApiResponse<{ worker: Worker }>> {
    const response = await api.post(`/admin/verifications/${id}/reject`, { reason })
    return { data: response.data, status: response.status }
  },

  async suspendVerification(id: string, reason: string): Promise<ApiResponse<{ worker: Worker }>> {
    const response = await api.post(`/admin/verifications/${id}/suspend`, { reason })
    return { data: response.data, status: response.status }
  },

  async bulkWorkerStatus(action: BulkStatusAction): Promise<ApiResponse<{ updated: number }>> {
    const response = await api.post("/admin/workers/bulk-status", action)
    return { data: response.data, status: response.status }
  },

  async getScope(): Promise<ApiResponse<{ scope: AdminScope }>> {
    const response = await api.get("/admin/scope")
    return { data: response.data, status: response.status }
  },

  // ── Operations ──
  async getOperations(): Promise<ApiResponse<OperationsData>> {
    const response = await api.get("/admin/dashboard/operations")
    return { data: response.data, status: response.status }
  },

  // ── Analytics ──
  async getAnalytics(): Promise<ApiResponse<AnalyticsData>> {
    const response = await api.get("/admin/dashboard/analytics")
    return { data: response.data, status: response.status }
  },

  async getAreaDemand(): Promise<ApiResponse<AreaDemandResponse>> {
    const response = await api.get("/admin/dashboard/area-demand")
    return { data: response.data, status: response.status }
  },

  // ── Support ──
  async getTickets(params?: { status?: string }): Promise<ApiResponse<{ tickets: SupportTicket[] }>> {
    const response = await api.get("/support/tickets", { params })
    return { data: response.data, status: response.status }
  },

  async getTicket(id: string): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.get(`/support/tickets/${id}`)
    return { data: response.data, status: response.status }
  },

  async updateTicket(id: string, data: { status?: string; priority?: string; assigneeId?: string }): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.patch(`/support/tickets/${id}`, data)
    return { data: response.data, status: response.status }
  },

  async resolveTicket(id: string, resolution: string): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.post(`/support/tickets/${id}/resolve`, { resolution })
    return { data: response.data, status: response.status }
  },

  // ── Catalogue / Services ──
  async getServices(): Promise<ApiResponse<{ services: Service[] }>> {
    const response = await api.get("/services")
    return { data: response.data, status: response.status }
  },

  async getServiceCategories(): Promise<ApiResponse<{ categories: ServiceCategory[] }>> {
    const response = await api.get("/services/categories")
    return { data: response.data, status: response.status }
  },

  async getAdminCategories(): Promise<ApiResponse<{ categories: Array<{ id: string; name: string; description: string | null; icon: string | null; displayOrder: number; status: string; imageUrl?: string | null; animationUrl?: string | null; accentColor?: string | null }> }>> {
    const response = await api.get("/service-areas/categories")
    return { data: response.data, status: response.status }
  },

  async createCategory(data: { name: string; description?: string; icon?: string; displayOrder?: number; status?: string }): Promise<ApiResponse<{ category: { id: string; name: string } }>> {
    const response = await api.post("/service-areas/categories", data)
    return { data: response.data, status: response.status }
  },

  async updateCategoryArtwork(name: string, data: { imageUrl?: string | null; animationUrl?: string | null; accentColor?: string | null }): Promise<ApiResponse<{ category: { name: string; imageUrl: string | null; animationUrl: string | null; accentColor: string | null } }>> {
    const response = await api.put(`/services/categories/${encodeURIComponent(name)}/artwork`, data)
    return { data: response.data, status: response.status }
  },

  // ── Cooperatives / Federations ──
  async getSocieties(): Promise<ApiResponse<{ cooperatives: Cooperative[] }>> {
    const response = await api.get("/cooperatives/societies")
    return { data: response.data, status: response.status }
  },

  async getFederations(): Promise<ApiResponse<{ federations: Cooperative[] }>> {
    const response = await api.get("/cooperatives/federations")
    return { data: response.data, status: response.status }
  },

  // ── Pricing ──
  async getPricingRules(): Promise<ApiResponse<{ rules: PricingRule[] }>> {
    const response = await api.get("/pricing/rules")
    return { data: response.data, status: response.status }
  },

  async getSurgeRules(): Promise<ApiResponse<{ rules: SurgeRule[] }>> {
    const response = await api.get("/pricing/surge-rules")
    return { data: response.data, status: response.status }
  },

  async getTravelFees(): Promise<ApiResponse<{ fees: TravelFee[] }>> {
    const response = await api.get("/pricing/travel-fees")
    return { data: response.data, status: response.status }
  },

  async getTaxRules(): Promise<ApiResponse<{ rules: TaxRule[] }>> {
    const response = await api.get("/pricing/tax-rules")
    return { data: response.data, status: response.status }
  },

  // ── System / Admin ──
  async getAdminUsers(): Promise<ApiResponse<{ users: AdminUserRow[] }>> {
    const response = await api.get("/admin/users")
    return { data: response.data, status: response.status }
  },

  async getRoles(): Promise<ApiResponse<{ roles: RoleRow[] }>> {
    const response = await api.get("/admin/roles")
    return { data: response.data, status: response.status }
  },

  async getAuditEvents(): Promise<ApiResponse<{ events: AuditEvent[] }>> {
    const response = await api.get("/admin/audit-events")
    return { data: response.data, status: response.status }
  },

  async getAiRecommendations(): Promise<ApiResponse<{ recommendations: Array<{ id: string; type: string; title: string; description: string; priority: "low" | "medium" | "high"; status: string }> }>> {
    const response = await api.get("/admin/ai/recommendations")
    return { data: response.data, status: response.status }
  },

  // ── TOTP / 2FA ──
  async enrolTotp(): Promise<ApiResponse<{ secret: string; otpauthUrl: string; qrDataUrl: string }>> {
    const response = await api.post("/auth/admin/totp/enrol")
    return { data: response.data, status: response.status }
  },

  async confirmTotp(secret: string, totp: string): Promise<ApiResponse<void>> {
    const response = await api.post("/auth/admin/totp/confirm", { secret, totp })
    return { data: response.data, status: response.status }
  },

  async resetTotp(userId: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/auth/admin/totp/${userId}`)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FEDERATION DASHBOARD
  // ═══════════════════════════════════════════════════════════════════

  async getFederationOverview(): Promise<ApiResponse<{ overview: FederationOverview }>> {
    const response = await api.get("/admin/federation/overview")
    return { data: response.data, status: response.status }
  },

  async getRegionalDemand(): Promise<ApiResponse<{ regionalDemand: RegionalDemandRow[] }>> {
    const response = await api.get("/admin/federation/regional-demand")
    return { data: response.data, status: response.status }
  },

  async getSocietyPerformance(): Promise<ApiResponse<{ societyPerformance: SocietyPerformanceRow[] }>> {
    const response = await api.get("/admin/federation/society-performance")
    return { data: response.data, status: response.status }
  },

  async getFederationAiForecasts(): Promise<ApiResponse<FederationAiForecasts>> {
    const response = await api.get("/admin/federation/ai-forecasts")
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FEDERATION SOCIETIES MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async getFederationSocieties(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ cooperatives: AdminCooperative[]; total: number; page: number; limit: number }>> {
    const response = await api.get("/admin/cooperatives", { params })
    return { data: response.data, status: response.status }
  },

  async getSociety(id: string): Promise<ApiResponse<{ cooperative: AdminCooperative }>> {
    const response = await api.get(`/admin/cooperatives/${id}`)
    return { data: response.data, status: response.status }
  },

  async createSociety(data: { name: string; code: string; district: string; state: string; federationId: string; contactEmail?: string; contactPhone?: string; address?: string; commissionRate?: number; minWorkers?: number; maxWorkers?: number }): Promise<ApiResponse<{ cooperative: AdminCooperative }>> {
    const response = await api.post("/admin/cooperatives", data)
    return { data: response.data, status: response.status }
  },

  async updateSociety(id: string, data: Partial<{ name: string; code: string; district: string; state: string; contactEmail: string; contactPhone: string; address: string; commissionRate: number; minWorkers: number; maxWorkers: number }>): Promise<ApiResponse<{ cooperative: AdminCooperative }>> {
    const response = await api.patch(`/admin/cooperatives/${id}`, data)
    return { data: response.data, status: response.status }
  },

  async getSocietyWorkers(id: string, params?: { page?: number; limit?: number; verificationStatus?: string; availability?: string }): Promise<ApiResponse<{ workers: Worker[]; total: number; page: number; limit: number }>> {
    const response = await api.get(`/admin/cooperatives/${id}/workers`, { params })
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // OPERATIONS COMMAND CENTER
  // ═══════════════════════════════════════════════════════════════════

  async getLiveOperations(): Promise<ApiResponse<LiveOperations>> {
    const response = await api.get("/admin/operations/live")
    return { data: response.data, status: response.status }
  },

  async getActiveEmergencies(): Promise<ApiResponse<{ emergencies: EmergencyBooking[] }>> {
    const response = await api.get("/admin/operations/emergency")
    return { data: response.data, status: response.status }
  },

  async getUnassignedBookings(): Promise<ApiResponse<{ unassigned: LiveOperations["activeBookings"] }>> {
    const response = await api.get("/admin/operations/unassigned")
    return { data: response.data, status: response.status }
  },

  async getDelayedBookings(): Promise<ApiResponse<{ delayed: Array<{ id: string; booking_number: string; status: string; created_at: string; service_name: string; minutes_pending: number }> }>> {
    const response = await api.get("/admin/operations/delayed")
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // EMERGENCY CENTER
  // ═══════════════════════════════════════════════════════════════════

  async escalateEmergency(id: string, data?: { newRadiusKm?: number; notifySupervisors?: boolean }): Promise<ApiResponse<{ emergency: EmergencyBooking }>> {
    const response = await api.post(`/emergency/${id}/escalate`, data ?? {})
    return { data: response.data, status: response.status }
  },

  async resolveEmergency(id: string): Promise<ApiResponse<{ emergency: EmergencyBooking }>> {
    const response = await api.post(`/emergency/${id}/resolve`)
    return { data: response.data, status: response.status }
  },

  async reassignEmergency(id: string, data: { workerId: string }): Promise<ApiResponse<{ emergency: EmergencyBooking }>> {
    const response = await api.post(`/emergency/${id}/reassign`, data)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // AI INSIGHTS
  // ═══════════════════════════════════════════════════════════════════

  async getDemandForecast(): Promise<ApiResponse<{ predictions?: Array<{ date?: string; area?: string; service?: string; predicted_requests?: number; confidence?: number }> }>> {
    const response = await api.get("/ai/demand-forecast")
    return { data: response.data, status: response.status }
  },

  async getWorkforceAllocation(): Promise<ApiResponse<{ recommendations?: Array<{ society?: string; region?: string; recommended_workers?: number; current_workers?: number; reasoning?: string }> }>> {
    const response = await api.get("/ai/workforce-allocation")
    return { data: response.data, status: response.status }
  },

  async approveAiRecommendation(id: string): Promise<ApiResponse<{ recommendation: AiRecommendation }>> {
    const response = await api.post(`/ai/recommendations/${id}/approve`)
    return { data: response.data, status: response.status }
  },

  async rejectAiRecommendation(id: string, reason?: string): Promise<ApiResponse<{ recommendation: AiRecommendation }>> {
    const response = await api.post(`/ai/recommendations/${id}/reject`, { reason })
    return { data: response.data, status: response.status }
  },

  async applyAiRecommendation(id: string): Promise<ApiResponse<{ recommendation: AiRecommendation }>> {
    const response = await api.post(`/ai/recommendations/${id}/apply`)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════

  async getAnalyticsOverview(): Promise<ApiResponse<{ totalBookings?: number; totalRevenue?: number; totalWorkers?: number; totalCustomers?: number }>> {
    const response = await api.get("/analytics/overview")
    return { data: response.data, status: response.status }
  },

  async getBookingAnalytics(params?: { fromDate?: string; toDate?: string; serviceId?: string; cooperativeId?: string }): Promise<ApiResponse<BookingAnalytics>> {
    const response = await api.get("/analytics/bookings", { params })
    return { data: response.data, status: response.status }
  },

  async getWorkerAnalytics(params?: { fromDate?: string; toDate?: string }): Promise<ApiResponse<WorkerAnalytics>> {
    const response = await api.get("/analytics/workers", { params })
    return { data: response.data, status: response.status }
  },

  async getRevenueAnalytics(params?: { fromDate?: string; toDate?: string; cooperativeId?: string }): Promise<ApiResponse<RevenueAnalytics>> {
    const response = await api.get("/analytics/revenue", { params })
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FINANCE
  // ═══════════════════════════════════════════════════════════════════

  async getRefunds(params?: { status?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }): Promise<ApiResponse<{ refunds: Refund[]; total: number }>> {
    const response = await api.get("/admin/payments/refunds", { params })
    return { data: response.data, status: response.status }
  },

  async getReconciliation(params?: { fromDate?: string; toDate?: string }): Promise<ApiResponse<{ summary?: Array<{ provider: string; total: number; count: number }>; total_amount?: number }>> {
    const response = await api.get("/admin/payments/reconciliation", { params })
    return { data: response.data, status: response.status }
  },

  async getSettlements(params?: { cooperativeId?: string; status?: string }): Promise<ApiResponse<{ settlements: Settlement[] }>> {
    const response = await api.get("/admin/settlements", { params })
    return { data: response.data, status: response.status }
  },

  async generateSettlements(data?: { periodStart?: string; periodEnd?: string; cooperativeId?: string }): Promise<ApiResponse<{ generated: number }>> {
    const response = await api.post("/admin/settlements/generate", data ?? {})
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // SERVICES CRUD
  // ═══════════════════════════════════════════════════════════════════

  async getAdminServices(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ services: Service[]; total: number }>> {
    const response = await api.get("/admin/services", { params })
    return { data: response.data, status: response.status }
  },

  async getAdminService(id: string): Promise<ApiResponse<{ service: Service }>> {
    const response = await api.get(`/admin/services/${id}`)
    return { data: response.data, status: response.status }
  },

  async createService(data: { name: string; category: string; description?: string; basePrice: number; emergencySupported?: boolean; pricePerMinute?: number; minMinutes?: number; maxMinutes?: number; defaultMinutes?: number; listPrice?: number; heroImageUrl?: string; includes?: string[]; excludes?: string[]; steps?: string[]; faqs?: ServiceFaq[] }): Promise<ApiResponse<{ service: Service }>> {
    const response = await api.post("/admin/services", data)
    return { data: response.data, status: response.status }
  },

  async updateService(id: string, data: Partial<{ name: string; category: string; description: string; basePrice: number; emergencySupported: boolean; pricePerMinute: number; minMinutes: number; maxMinutes: number; defaultMinutes: number; listPrice: number; heroImageUrl: string; includes: string[]; excludes: string[]; steps: string[]; faqs: ServiceFaq[] }>): Promise<ApiResponse<{ service: Service }>> {
    const response = await api.patch(`/admin/services/${id}`, data)
    return { data: response.data, status: response.status }
  },

  async deleteService(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/admin/services/${id}`)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // PRICING MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async createSurgeRule(data: { area: object; serviceId?: string; multiplier: number; trigger: string; demandThreshold?: number; startsAt?: string; endsAt?: string }): Promise<ApiResponse<{ surgeRule: SurgeRule }>> {
    const response = await api.post("/admin/pricing/surge-rules", data)
    return { data: response.data, status: response.status }
  },

  async deleteSurgeRule(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/admin/pricing/surge-rules/${id}`)
    return { data: response.data, status: response.status }
  },

  async createTravelFee(data: { cooperativeId: string; baseKm?: number; baseFee?: number; perKmRate?: number; maxDistanceKm?: number }): Promise<ApiResponse<{ travelFee: TravelFee }>> {
    const response = await api.post("/admin/pricing/travel-fees", data)
    return { data: response.data, status: response.status }
  },

  async createTaxRule(data: { name: string; rate: number; appliesTo: string; jurisdiction: string }): Promise<ApiResponse<{ taxRule: TaxRule }>> {
    const response = await api.post("/admin/pricing/tax-rules", data)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // SUPPORT (ADMIN-SCOPED)
  // ═══════════════════════════════════════════════════════════════════

  async getAdminSupportTickets(params?: { status?: string; category?: string; page?: number; limit?: number }): Promise<ApiResponse<{ tickets: SupportTicket[]; total: number }>> {
    const response = await api.get("/admin/support/tickets", { params })
    return { data: response.data, status: response.status }
  },

  async assignSupportTicket(id: string, assignedTo: string): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.post(`/admin/support/tickets/${id}/assign`, { assignedTo })
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY & SYSTEM
  // ═══════════════════════════════════════════════════════════════════

  async getSecurityEvents(params?: { userId?: string; eventType?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }): Promise<ApiResponse<{ events: SecurityEvent[]; total: number }>> {
    const response = await api.get("/admin/security-events", { params })
    return { data: response.data, status: response.status }
  },

  async updateUserStatus(id: string, status: "active" | "inactive" | "suspended"): Promise<ApiResponse<{ user: AdminUserRow }>> {
    const response = await api.patch(`/admin/users/${id}/status`, { status })
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // ROLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async createRole(data: { name: string; description?: string; permissions?: string[] }): Promise<ApiResponse<{ role: RoleRow }>> {
    const response = await api.post("/admin/roles", data)
    return { data: response.data, status: response.status }
  },

  async updateRole(id: string, data: Partial<{ name: string; description: string; permissions: string[] }>): Promise<ApiResponse<{ role: RoleRow }>> {
    const response = await api.patch(`/admin/roles/${id}`, data)
    return { data: response.data, status: response.status }
  },

  async deleteRole(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/admin/roles/${id}`)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // NOTIFICATION TEMPLATES
  // ═══════════════════════════════════════════════════════════════════

  async getNotificationTemplates(): Promise<ApiResponse<{ templates: NotificationTemplate[] }>> {
    const response = await api.get("/admin/notifications/templates")
    return { data: response.data, status: response.status }
  },

  async createNotificationTemplate(data: { name: string; type: string; titleTemplate: string; bodyTemplate: string; channels?: string[]; language?: string; variables?: string[] }): Promise<ApiResponse<{ template: NotificationTemplate }>> {
    const response = await api.post("/admin/notifications/templates", data)
    return { data: response.data, status: response.status }
  },

  async updateNotificationTemplate(id: string, data: Partial<{ titleTemplate: string; bodyTemplate: string; channels: string[]; language: string; isActive: boolean }>): Promise<ApiResponse<{ template: NotificationTemplate }>> {
    const response = await api.patch(`/admin/notifications/templates/${id}`, data)
    return { data: response.data, status: response.status }
  },
}

export default api