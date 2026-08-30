import axios, { AxiosError } from "axios"
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios"
import { env } from "./env"
import type {
  AdminUser,
  WorkersListParams,
  WorkersListResponse,
  Worker,
  WorkerSkill,
  WorkerServiceArea,
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
  Zone,
  ZonePricing,
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
    return {
      data: {
        workers: response.data.workers?.map((w: any) => ({
          id: w.id,
          workerCode: w.worker_code,
          verificationStatus: w.verification_status,
          rating: w.rating != null ? Number(w.rating) : null,
          currentStatus: w.current_status,
          experienceYears: w.experience_years,
          serviceRadiusKm: w.service_radius_km != null ? Number(w.service_radius_km) : null,
          name: w.name,
          phone: w.phone,
          email: w.email,
          avatarUrl: w.avatar_url,
          cooperativeName: w.cooperative_name,
          district: w.district,
          state: w.state,
        })) ?? [],
        total: response.data.total,
        page: response.data.page,
        limit: response.data.limit,
      },
      status: response.status,
    }
  },

  async getWorker(id: string): Promise<ApiResponse<{ worker: Worker; skills: WorkerSkill[]; serviceAreas: WorkerServiceArea[] }>> {
    const response = await api.get(`/workers/${id}`)
    const data = response.data
    return {
      data: {
        worker: {
          id: data.worker.id,
          workerCode: data.worker.worker_code,
          verificationStatus: data.worker.verification_status,
          rating: data.worker.rating != null ? Number(data.worker.rating) : null,
          currentStatus: data.worker.current_status,
          experienceYears: data.worker.experience_years,
          serviceRadiusKm: data.worker.service_radius_km,
          name: data.worker.name,
          phone: data.worker.phone,
          email: data.worker.email,
          avatarUrl: data.worker.avatar_url,
          cooperativeName: data.worker.cooperative_name,
          district: data.worker.district,
          state: data.worker.state,
          bio: data.worker.bio,
          totalJobs: data.worker.total_jobs,
          completedJobs: data.worker.completed_jobs,
          cancelledJobs: data.worker.cancelled_jobs,
        },
        skills: data.skills?.map((s: any) => ({
          skillId: s.skill_id,
          name: s.name,
          category: s.category,
          level: s.level,
          verified: s.verified,
          yearsExperience: s.years_experience,
        })) ?? [],
        serviceAreas: data.serviceAreas?.map((sa: any) => ({
          serviceId: sa.service_id,
          name: sa.name,
          radiusKm: sa.radius_km,
        })) ?? [],
      },
      status: response.status,
    }
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

  async getAdminSociety(id: string): Promise<ApiResponse<{ society: AdminCooperative }>> {
    const response = await api.get(`/admin/cooperatives/${id}`)
    return { data: { society: response.data.cooperative }, status: response.status }
  },

  async getAdminSocieties(params?: { status?: string; page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ societies: AdminCooperative[]; total: number }>> {
    const response = await api.get("/admin/cooperatives", { params })
    return { data: { societies: response.data.cooperatives, total: response.data.total }, status: response.status }
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

  async getDemandForecast(): Promise<ApiResponse<any>> {
    const response = await api.get("/ai/demand-forecast")
    return { data: response.data, status: response.status }
  },

  async getWorkforceAllocation(): Promise<ApiResponse<any>> {
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
  // ZONE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async getZones(): Promise<ApiResponse<{ zones: Zone[] }>> {
    const response = await api.get("/admin/zones")
    return { data: response.data, status: response.status }
  },

  async createZone(data: { name: string; polygon: { type: "Polygon"; coordinates: number[][][] }; basePrice: number; demandMultiplier?: number; status?: string }): Promise<ApiResponse<{ zone: Zone }>> {
    const response = await api.post("/admin/zones", data)
    return { data: response.data, status: response.status }
  },

  async updateZone(id: string, data: Partial<{ name: string; polygon: { type: "Polygon"; coordinates: number[][][] }; basePrice: number; demandMultiplier: number; status: string }>): Promise<ApiResponse<{ zone: Zone }>> {
    const response = await api.patch(`/admin/zones/${id}`, data)
    return { data: response.data, status: response.status }
  },

  async deleteZone(id: string): Promise<ApiResponse<void>> {
    const response = await api.delete(`/admin/zones/${id}`)
    return { data: response.data, status: response.status }
  },

  async getCooperativeZonePricing(cooperativeId: string): Promise<ApiResponse<{ zonePricing: ZonePricing[] }>> {
    const response = await api.get(`/admin/cooperatives/${cooperativeId}/zones`)
    return { data: response.data, status: response.status }
  },

  async updateCooperativeZonePricing(cooperativeId: string, zoneId: string, data: { priceOverride?: number; demandMultiplier?: number; enabled?: boolean }): Promise<ApiResponse<{ zonePricing: ZonePricing }>> {
    const response = await api.put(`/admin/cooperatives/${cooperativeId}/zones/${zoneId}`, data)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIETY TERRITORIES
  // ═══════════════════════════════════════════════════════════════════

  async createTerritory(cooperativeId: string, data: { polygon: { type: "Polygon"; coordinates: number[][][] }; status?: string }): Promise<ApiResponse<{ territory: any }>> {
    const response = await api.post(`/territories/cooperatives/${cooperativeId}/territory`, data)
    return { data: response.data, status: response.status }
  },

  async getTerritory(cooperativeId: string): Promise<ApiResponse<{ territory: any }>> {
    const response = await api.get(`/territories/cooperatives/${cooperativeId}/territory`)
    return { data: response.data, status: response.status }
  },

  async updateTerritory(cooperativeId: string, data: { polygon?: { type: "Polygon"; coordinates: number[][][] }; status?: string }): Promise<ApiResponse<{ territory: any }>> {
    const response = await api.patch(`/territories/cooperatives/${cooperativeId}/territory`, data)
    return { data: response.data, status: response.status }
  },

  async validateTerritory(data: { polygon: { type: "Polygon"; coordinates: number[][][] }; federationId: string; cooperativeId?: string }): Promise<ApiResponse<{ valid: boolean; errors: string[]; warnings: string[]; conflicts: any[] }>> {
    const response = await api.post("/territories/validate", data)
    return { data: response.data, status: response.status }
  },

  async previewTerritory(data: { polygon: { type: "Polygon"; coordinates: number[][][] } }): Promise<ApiResponse<{ bookingCount: number; workerCount: number; activeWorkerCount: number; customerCount: number; areaKm2: number }>> {
    const response = await api.post("/territories/preview", data)
    return { data: response.data, status: response.status }
  },

  async resolveTerritory(lat: number, lng: number): Promise<ApiResponse<{ matched: boolean; cooperative?: any; territory?: any }>> {
    const response = await api.get("/territories/resolve", { params: { lat, lng } })
    return { data: response.data, status: response.status }
  },

  async getFederationTerritories(federationId: string): Promise<ApiResponse<{ territories: any[] }>> {
    const response = await api.get(`/territories/federations/${federationId}/territories`)
    return { data: response.data, status: response.status }
  },

  async getTerritoryStatistics(cooperativeId: string): Promise<ApiResponse<any>> {
    const response = await api.get(`/territories/cooperatives/${cooperativeId}/territory/statistics`)
    return { data: response.data, status: response.status }
  },

  async getTerritoryUnassignedBookings(): Promise<ApiResponse<{ bookings: any[] }>> {
    const response = await api.get("/territories/unassigned")
    return { data: response.data, status: response.status }
  },

  async assignBooking(bookingId: string, cooperativeId: string): Promise<ApiResponse<{ success: boolean }>> {
    const response = await api.post("/territories/assign-booking", { bookingId, cooperativeId })
    return { data: response.data, status: response.status }
  },

async getFederationCoverageStats(federationId: string): Promise<ApiResponse<any>> {
    const response = await api.get(`/territories/federations/${federationId}/coverage-stats`)
    return { data: response.data, status: response.status }
  },

  async getTerritoryGaps(federationId: string): Promise<ApiResponse<{ gaps: any[] }>> {
    const response = await api.get(`/territories/federations/${federationId}/gaps`)
    return { data: response.data, status: response.status }
  },

  async resolveWorkerTerritory(workerId: string): Promise<ApiResponse<{ territory: any; cooperativeId: string }>> {
    const response = await api.get(`/territories/worker/${workerId}/resolve`)
    return { data: response.data, status: response.status }
  },

  // ═══════════════════════════════════════════════════════════════════
  // SOCIETY ADMIN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async createSocietyAdmin(cooperativeId: string, data: { name: string; email: string; phone: string }): Promise<ApiResponse<{ user: any; temporaryPassword: string; message: string }>> {
    const response = await api.post(`/admin/cooperatives/${cooperativeId}/admin`, data)
    return { data: response.data, status: response.status }
  },

  async getSocietyAdmin(cooperativeId: string): Promise<ApiResponse<{ admin: any }>> {
    const response = await api.get(`/admin/cooperatives/${cooperativeId}/admin`)
    return { data: response.data, status: response.status }
  },

  async updateSocietyStatus(cooperativeId: string, status: string): Promise<ApiResponse<{ cooperative: any }>> {
    const response = await api.patch(`/admin/cooperatives/${cooperativeId}/status`, { status })
    return { data: response.data, status: response.status }
  },

  async getCooperatives(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ cooperatives: AdminCooperative[]; total: number }>> {
    const response = await api.get("/admin/cooperatives", { params })
    return { data: { cooperatives: response.data.cooperatives, total: response.data.total }, status: response.status }
  },

  async getAuditLog(params?: { actorId?: string; action?: string; resourceType?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }): Promise<ApiResponse<{ events: AuditEvent[]; total: number }>> {
    const response = await api.get("/admin/audit-log", { params })
    return { data: response.data, status: response.status }
  },

  async getNotificationTemplates(): Promise<ApiResponse<{ templates: NotificationTemplate[] }>> {
    const response = await api.get("/admin/notifications/templates")
    return { data: response.data, status: response.status }
  },

  async getReports(params?: { type?: string; fromDate?: string; toDate?: string }): Promise<ApiResponse<{ reports: any[] }>> {
    const response = await api.get("/reports/reports", { params })
    return { data: response.data, status: response.status }
  },

  async getSupportTicket(id: string): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.get(`/admin/support/tickets/${id}`)
    return { data: response.data, status: response.status }
  },

  async replySupportTicket(id: string, message: string): Promise<ApiResponse<{ ticket: SupportTicket }>> {
    const response = await api.post(`/admin/support/tickets/${id}/reply`, { message })
    return { data: response.data, status: response.status }
  },
}

export default api