import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { useAuth } from "../lib/AuthContext"
import { adminApi } from "../lib/api"
import { Envelope, Lock, Eye, EyeSlash, ArrowRight, Key, CheckCircle } from "@phosphor-icons/react"

type LoginView = "login" | "forgot" | "reset-sent"

export function Login() {
  const [view, setView] = useState<LoginView>("login")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requireTotp, setRequireTotp] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  // Forgot password state
  const [resetEmail, setResetEmail] = useState("")
  const [forgotSuccess, setForgotSuccess] = useState(false)

  const loginMutation = useMutation({
    mutationFn: () => login(identifier, password, totpCode || undefined),
    onSuccess: () => navigate("/"),
    onError: (e: any) => {
      const status = e?.response?.status
      const code = e?.response?.data?.code

      if (status === 401 && code === "TOTP_REQUIRED") {
        setRequireTotp(true)
        setError("Enter your authenticator code to continue.")
        return
      }
      const msg = e?.response?.data?.error || (e instanceof Error ? e.message : "Login failed")
      setError(msg)
    },
  })

  const forgotMutation = useMutation({
    mutationFn: () => adminApi.forgotPassword(resetEmail),
    onSuccess: () => {
      setForgotSuccess(true)
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to send reset link"
      setError(msg)
    },
  })

  const submitLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    loginMutation.mutate()
  }

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    forgotMutation.mutate()
  }

  const backToLogin = () => {
    setView("login")
    setRequireTotp(false)
    setTotpCode("")
    setError(null)
  }

  // ── Forgot password view ──
  if (view === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: "#F8FAFC" }}>
        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#2E5FD9" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
              </svg>
            </div>
            <span className="text-base font-semibold" style={{ color: "#0F172A" }}>The Cooperative Desk</span>
          </div>

          {forgotSuccess ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#ECFDF5" }}>
                <CheckCircle size={24} style={{ color: "#059669" }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#0F172A" }}>Check your email</h2>
              <p className="text-sm mb-6" style={{ color: "#64748B" }}>
                If an account exists for <strong>{resetEmail}</strong>, we've sent a password reset link. It expires in 15 minutes.
              </p>
              <button
                onClick={backToLogin}
                className="text-sm font-medium hover:underline focus:outline-none"
                style={{ color: "#2E5FD9" }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#0F172A" }}>Forgot password?</h2>
              <p className="text-sm mb-6" style={{ color: "#64748B" }}>
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={submitForgot} className="space-y-5">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium mb-1.5" style={{ color: "#334155" }}>Email</label>
                  <div className="relative">
                    <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} aria-hidden="true" />
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5FD9]/20 focus:border-[#2E5FD9] transition-all"
                      style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A" }}
                      placeholder="admin@coop.org"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm rounded-lg p-3 flex items-start gap-2" style={{ color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA" }} role="alert">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#DC2626" }} aria-hidden="true" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotMutation.isPending}
                  className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: "#2E5FD9" }}
                >
                  {forgotMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Key size={16} />
                      Send reset link
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={backToLogin}
                className="block text-center text-sm font-medium mt-6 w-full hover:underline focus:outline-none"
                style={{ color: "#2E5FD9" }}
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Login view ──
  return (
    <div className="min-h-screen flex" style={{ background: "#F8FAFC" }}>
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-center px-16 xl:px-24" style={{ background: "#FFFFFF" }}>
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#2E5FD9" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <path d="M12 4v16M5 8l7 4 7-4" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
              </svg>
            </div>
            <span className="text-lg font-semibold" style={{ color: "#0F172A" }}>The Cooperative Desk</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight" style={{ color: "#0F172A" }}>
            Manage your cooperative workforce with confidence.
          </h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "#64748B" }}>
            Verify workers, manage operations, track finances, and grow your cooperative — all from one place.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { title: "Worker Verification", desc: "Onboard and verify your workforce" },
              { title: "Operations", desc: "Track jobs, delays, and emergencies" },
              { title: "Finance", desc: "Monitor earnings and payouts" },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0" style={{ background: "#EBF2FF" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#2E5FD9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: "#0F172A" }}>{f.title}</div>
                  <div className="text-xs" style={{ color: "#64748B" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#2E5FD9" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4l7 4v8l-7 4-7-4V8l7-4z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
              </svg>
            </div>
            <span className="text-base font-semibold" style={{ color: "#0F172A" }}>The Cooperative Desk</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold" style={{ color: "#0F172A" }}>Welcome back</h2>
            <p className="text-sm mt-1 mb-8" style={{ color: "#64748B" }}>Sign in to your cooperative workspace</p>

            <form onSubmit={submitLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: "#334155" }}>Email</label>
                <div className="relative">
                  <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5FD9]/20 focus:border-[#2E5FD9] transition-all"
                    style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A" }}
                    placeholder="admin@coop.org"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium" style={{ color: "#334155" }}>Password</label>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(null) }}
                    className="text-xs font-medium hover:underline focus:outline-none"
                    style={{ color: "#2E5FD9" }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#94A3B8" }} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5FD9]/20 focus:border-[#2E5FD9] transition-all"
                    style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A" }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 focus:outline-none"
                    style={{ color: "#94A3B8" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {requireTotp && (
                <div>
                  <label htmlFor="totp" className="block text-sm font-medium mb-1.5" style={{ color: "#334155" }}>
                    Authenticator code
                  </label>
                  <input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5FD9]/20 focus:border-[#2E5FD9] transition-all font-tabular tracking-widest"
                    style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A" }}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                </div>
              )}

              {error && (
                <div className="text-sm rounded-lg p-3 flex items-start gap-2" style={{ color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA" }} role="alert">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#DC2626" }} aria-hidden="true" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loginMutation.isPending || (requireTotp && totpCode.length < 6)}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "#2E5FD9" }}
                onMouseEnter={(e) => !loginMutation.isPending && (e.currentTarget.style.background = "#254DB0")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#2E5FD9")}
              >
                {loginMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-8" style={{ color: "#94A3B8" }}>
            © 2026 Get It Done
          </p>
        </div>
      </div>
    </div>
  )
}
