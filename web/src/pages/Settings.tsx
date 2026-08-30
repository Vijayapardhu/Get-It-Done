import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useAuth } from "../lib/AuthContext"
import { adminApi } from "../lib/api"
import { ShieldCheck, Key, Warning, CheckCircle, Copy, QrCode } from "@phosphor-icons/react"

type TotpStep = "idle" | "qr" | "confirm" | "success"

export function Settings() {
  const { user } = useAuth()
  const [step, setStep] = useState<TotpStep>("idle")
  const [secret, setSecret] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [confirmCode, setConfirmCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const enrolMutation = useMutation({
    mutationFn: () => adminApi.enrolTotp(),
    onSuccess: (res) => {
      setSecret(res.data.secret)
      setQrDataUrl(res.data.qrDataUrl)
      setStep("qr")
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error
      if (code?.includes("already enrolled")) {
        setError("2FA is already enabled on this account.")
      } else {
        setError("Failed to start 2FA setup. Try again.")
      }
    },
  })

  const confirmMutation = useMutation({
    mutationFn: () => adminApi.confirmTotp(secret, confirmCode),
    onSuccess: () => {
      setStep("success")
    },
    onError: () => {
      setError("That code didn't match. Check your authenticator and try again.")
    },
  })

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement("textarea")
      ta.value = secret
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const startEnrolment = () => {
    setError(null)
    setStep("idle")
    enrolMutation.mutate()
  }

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (confirmCode.length !== 6) return
    setError(null)
    confirmMutation.mutate()
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-ink text-2xl font-bold mb-1">Settings</h1>
      <p className="text-muted text-sm mb-8">Manage your account security and preferences.</p>

      {/* 2FA Section */}
      <div className="bg-surface rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(46, 95, 217, 0.1)" }}>
            <ShieldCheck size={20} style={{ color: "#2E5FD9" }} />
          </div>
          <div className="flex-1">
            <h2 className="text-ink text-lg font-semibold">Two-factor authentication</h2>
            <p className="text-muted text-sm mt-1">
              Add an extra layer of security using any authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)
            </p>

            {step === "idle" && (
              <div className="mt-4">
                <button
                  onClick={startEnrolment}
                  disabled={enrolMutation.isPending}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-all disabled:opacity-50 flex items-center gap-2"
                  style={{ background: "#2E5FD9" }}
                >
                  {enrolMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  ) : (
                    <Key size={16} />
                  )}
                  Enable 2FA
                </button>
              </div>
            )}

            {step === "qr" && (
              <div className="mt-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* QR Code */}
                  <div className="flex flex-col items-center">
                    <div className="p-3 bg-white rounded-xl border border-muted/20">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" width={160} height={160} />
                      ) : (
                        <QrCode size={160} />
                      )}
                    </div>
                    <p className="text-xs text-muted mt-2 text-center">Scan with your authenticator app</p>
                  </div>

                  {/* Manual entry */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-sm text-ink font-medium mb-2">Can't scan? Enter this code manually:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-dark-bg rounded-lg text-sm text-ink font-mono break-all" style={{ border: "1px solid rgba(148, 163, 184, 0.2)" }}>
                          {secret}
                        </code>
                        <button
                          onClick={copySecret}
                          className="p-2 rounded-lg hover:bg-dark-bg transition-colors shrink-0"
                          style={{ border: "1px solid rgba(148, 163, 184, 0.2)", color: "#94A3B8" }}
                          aria-label="Copy secret"
                        >
                          {copied ? <CheckCircle size={16} style={{ color: "#059669" }} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm */}
                    <form onSubmit={submitCode} className="space-y-3">
                      <div>
                        <label htmlFor="confirm-totp" className="block text-sm font-medium text-ink mb-1.5">
                          Enter the 6-digit code from your app
                        </label>
                        <input
                          id="confirm-totp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={confirmCode}
                          onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="w-full max-w-[200px] px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E5FD9]/20 focus:border-[#2E5FD9] transition-all font-mono tracking-widest text-center"
                          style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#0F172A" }}
                          placeholder="000000"
                          maxLength={6}
                        />
                      </div>

                      {error && (
                        <div className="text-sm rounded-lg p-3 flex items-start gap-2" style={{ color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA" }} role="alert">
                          <Warning size={16} className="shrink-0 mt-0.5" />
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={confirmCode.length !== 6 || confirmMutation.isPending}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-all disabled:opacity-50 flex items-center gap-2"
                        style={{ background: "#2E5FD9" }}
                      >
                        {confirmMutation.isPending ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                        Verify & Enable
                      </button>
                    </form>
                  </div>
                </div>

                <button
                  onClick={() => setStep("idle")}
                  className="mt-4 text-sm text-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {step === "success" && (
              <div className="mt-4 p-4 rounded-lg" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                <div className="flex items-start gap-3">
                  <CheckCircle size={20} style={{ color: "#059669" }} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#065F46" }}>2FA enabled successfully!</p>
                    <p className="text-sm mt-1" style={{ color: "#047857" }}>
                      Next time you sign in, you'll need to enter a code from your authenticator app.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && step === "idle" && (
              <div className="mt-4 text-sm rounded-lg p-3 flex items-start gap-2" style={{ color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA" }} role="alert">
                <Warning size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="bg-surface rounded-xl p-6 mt-6">
        <h2 className="text-ink text-lg font-semibold mb-4">Account</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.2)" }}>
            <span className="text-sm text-muted">Name</span>
            <span className="text-sm text-ink">{user?.name || "—"}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "rgba(148, 163, 184, 0.2)" }}>
            <span className="text-sm text-muted">Email</span>
            <span className="text-sm text-ink">{user?.email || "—"}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-muted">Role</span>
            <span className="text-sm text-ink capitalize">{user?.role?.replace("_", " ") || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
