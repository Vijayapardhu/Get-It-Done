import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios"
import { env } from "./env"
import type { AdminUser, WorkersListParams, WorkersListResponse, Worker, VerificationAction, BulkStatusAction, DashboardOverview, ScopeOption, AdminScope } from "./types"

let accessToken: string | null = null
let refreshToken: string | null = null
let refreshPromise: Promise<string> | null = null

export function setTokens(at: string | null, rt: string | null) {
  accessToken = at
  refreshToken = rt
}

export function getAccessToken(): string | null {
  return accessToken
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
        accessToken = null
        refreshToken = null
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
    const response = await api.get("/admin/dashboard/workforce", { params })
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
}

export default api