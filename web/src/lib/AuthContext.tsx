import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { adminApi, setTokens, getAccessToken } from "./api"
import type { AdminUser, AdminScope, ScopeOption } from "./types"

interface AuthContextValue {
  user: AdminUser | null
  scope: AdminScope | null
  scopeOptions: ScopeOption[]
  isLoading: boolean
  login: (identifier: string, password: string, totpCode?: string) => Promise<void>
  logout: () => Promise<void>
  setScope: (scope: AdminScope) => void
  refreshScopeOptions: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [scope, setScopeState] = useState<AdminScope | null>(null)
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadSession = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    try {
      const [meRes, scopeRes, scopesRes] = await Promise.all([
        adminApi.getMe(),
        adminApi.getScope(),
        adminApi.getScopeOptions(),
      ])

      setUser(meRes.data.user)
      setScopeState(scopeRes.data.scope)
      setScopeOptions(scopesRes.data.scopes)
    } catch {
      setTokens(null, null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const login = async (identifier: string, password: string, totpCode?: string) => {
    const res = await adminApi.login(identifier, password, totpCode)
    const { user: loggedInUser, accessToken, refreshToken, expiresIn } = res.data
    setTokens(accessToken, refreshToken)
    setUser(loggedInUser)

    const [scopeRes, scopesRes] = await Promise.all([
      adminApi.getScope(),
      adminApi.getScopeOptions(),
    ])
    setScopeState(scopeRes.data.scope)
    setScopeOptions(scopesRes.data.scopes)
  }

  const logout = async () => {
    await adminApi.logout()
    setTokens(null, null)
    setUser(null)
    setScopeState(null)
    setScopeOptions([])
    window.location.href = "/login"
  }

  const setScope = (newScope: AdminScope) => {
    setScopeState(newScope)
  }

  const refreshScopeOptions = async () => {
    const res = await adminApi.getScopeOptions()
    setScopeOptions(res.data.scopes)
  }

  return (
    <AuthContext.Provider value={{ user, scope, scopeOptions, isLoading, login, logout, setScope, refreshScopeOptions }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}