import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { workerApi } from "../lib/api"
import type { Worker, WorkerDocument } from "../lib/types"
import { LoadingState } from "../components/ui/EmptyState"
import { FileUpload } from "../components/ui/FileUpload"
import {
  User, MapPin, Phone, FileText, Wallet, Clock, CheckCircle,
  XCircle, HardHat, Bank, NavigationArrow,
  Play, Stop, Receipt
} from "@phosphor-icons/react"

type Tab = "home" | "jobs" | "earnings" | "profile"

export function WorkerApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home")

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["worker-profile"],
    queryFn: () => workerApi.getProfile().then((r) => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ["worker-stats"],
    queryFn: () => workerApi.getStats().then((r) => r.data),
  })

  if (profileLoading) return <LoadingState message="Loading..." />

  if (!profile?.worker) {
    return <WorkerRegistration />
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "home", label: "Home", icon: <HardHat size={20} /> },
    { key: "jobs", label: "Jobs", icon: <Clock size={20} /> },
    { key: "earnings", label: "Earnings", icon: <Wallet size={20} /> },
    { key: "profile", label: "Profile", icon: <User size={20} /> },
  ]

  return (
    <div className="min-h-screen bg-bg pb-20">
      <div className="bg-accent text-white p-4 rounded-b-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-lg font-bold">{profile.worker.name?.charAt(0) ?? "W"}</span>
            </div>
            <div>
              <h2 className="font-semibold">{profile.worker.name}</h2>
              <p className="text-xs text-white/70">{profile.worker.workerCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs rounded-full ${
              profile.worker.verificationStatus === "verified" ? "bg-green-500" :
              profile.worker.verificationStatus === "rejected" ? "bg-red-500" : "bg-yellow-500"
            }`}>
              {profile.worker.verificationStatus}
            </span>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{stats.completedJobs}</p>
              <p className="text-xs text-white/70">Jobs Done</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold">{stats.rating?.toFixed(1) ?? "—"}</p>
              <p className="text-xs text-white/70">Rating</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold">₹{stats.earnings?.toFixed(0) ?? "0"}</p>
              <p className="text-xs text-white/70">Earned</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        {activeTab === "home" && <WorkerHome worker={profile.worker} />}
        {activeTab === "jobs" && <WorkerJobs />}
        {activeTab === "earnings" && <WorkerEarnings />}
        {activeTab === "profile" && <WorkerProfile worker={profile} />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around py-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors ${
              activeTab === tab.key ? "text-accent" : "text-muted"
            }`}
          >
            {tab.icon}
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function WorkerHome({ worker }: { worker: Worker }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-fg mb-3">Status</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Availability</span>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            worker.currentStatus === "available" ? "bg-green-100 text-green-700" :
            worker.currentStatus === "busy" ? "bg-yellow-100 text-yellow-700" :
            "bg-gray-100 text-gray-700"
          }`}>
            {worker.currentStatus}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-fg mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction icon={<Clock size={20} />} label="My Jobs" />
          <QuickAction icon={<Wallet size={20} />} label="Earnings" />
          <QuickAction icon={<NavigationArrow size={20} />} label="Update Location" />
          <QuickAction icon={<Receipt size={20} />} label="Invoices" />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-fg mb-3">Verification Status</h3>
        <VerificationStatus status={worker.verificationStatus} />
      </div>
    </div>
  )
}

function QuickAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-bg rounded-lg">
      <div className="text-accent">{icon}</div>
      <span className="text-sm text-fg">{label}</span>
    </div>
  )
}

function VerificationStatus({ status }: { status: string }) {
  const steps = [
    { key: "pending", label: "Registered", icon: <User size={16} /> },
    { key: "submitted", label: "Documents Uploaded", icon: <FileText size={16} /> },
    { key: "under_review", label: "Under Review", icon: <Clock size={16} /> },
    { key: "verified", label: "Verified", icon: <CheckCircle size={16} /> },
  ]

  const currentIndex = steps.findIndex((s) => s.key === status)

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            i <= currentIndex ? "bg-accent text-white" : "bg-muted/20 text-muted"
          }`}>
            {step.icon}
          </div>
          <span className={`text-sm ${i <= currentIndex ? "text-fg" : "text-muted"}`}>
            {step.label}
          </span>
          {i === currentIndex && (
            <span className="ml-auto text-xs text-accent font-medium">Current</span>
          )}
        </div>
      ))}
    </div>
  )
}

function WorkerJobs() {
  const { data, isLoading } = useQuery({
    queryKey: ["worker-jobs"],
    queryFn: () => workerApi.getJobs().then((r) => r.data),
  })

  const [selectedJob, setSelectedJob] = useState<string | null>(null)

  if (isLoading) return <LoadingState message="Loading jobs..." />

  const jobs = data?.jobs ?? []
  const activeJobs = jobs.filter((j: any) => !["completed", "cancelled"].includes(j.status))
  const completedJobs = jobs.filter((j: any) => j.status === "completed")

  if (selectedJob) {
    return <JobDetail jobId={selectedJob} onBack={() => setSelectedJob(null)} />
  }

  return (
    <div className="space-y-4">
      {activeJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-fg mb-2">Active Jobs</h3>
          <div className="space-y-3">
            {activeJobs.map((job: any) => (
              <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job.id)} />
            ))}
          </div>
        </div>
      )}

      {completedJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-fg mb-2">Completed</h3>
          <div className="space-y-3">
            {completedJobs.slice(0, 5).map((job: any) => (
              <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job.id)} />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="bg-white rounded-xl p-8 border border-border text-center">
          <HardHat size={40} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-fg font-medium">No jobs yet</p>
          <p className="text-xs text-muted mt-1">Jobs will appear here when assigned.</p>
        </div>
      )}
    </div>
  )
}

function JobCard({ job, onClick }: { job: any; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    assigned: "bg-blue-100 text-blue-700",
    accepted: "bg-indigo-100 text-indigo-700",
    en_route: "bg-purple-100 text-purple-700",
    arrived: "bg-orange-100 text-orange-700",
    started: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-4 border border-border cursor-pointer hover:border-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-fg">{job.serviceName}</p>
          <p className="text-xs text-muted mt-1">{job.address}</p>
          <p className="text-xs text-muted mt-1">
            {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Scheduled"}
          </p>
          {job.customerName && (
            <p className="text-xs text-muted mt-1">Customer: {job.customerName}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`px-2 py-1 text-xs rounded-full ${statusColors[job.status] || "bg-gray-100 text-gray-700"}`}>
            {job.status}
          </span>
          {job.price && (
            <p className="text-sm font-medium text-accent mt-2">₹{job.price}</p>
          )}
        </div>
      </div>
      {job.paymentStage && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className={`text-xs ${
            job.paymentStage === "fully_paid" ? "text-green-600" :
            job.paymentStage === "advance_paid" ? "text-yellow-600" :
            "text-muted"
          }`}>
            Payment: {job.paymentStage.replace("_", " ")}
          </span>
        </div>
      )}
    </div>
  )
}

function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["job-detail", jobId],
    queryFn: () => workerApi.getJobDetail(jobId).then((r) => r.data),
  })

  const [otp, setOtp] = useState("")
  const queryClient = useQueryClient()

  const verifyStartMutation = useMutation({
    mutationFn: (otp: string) => workerApi.verifyStart(jobId, otp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-detail", jobId] })
      queryClient.invalidateQueries({ queryKey: ["worker-jobs"] })
    },
  })

  const verifyCompleteMutation = useMutation({
    mutationFn: (otp: string) => workerApi.verifyComplete(jobId, otp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-detail", jobId] })
      queryClient.invalidateQueries({ queryKey: ["worker-jobs"] })
      queryClient.invalidateQueries({ queryKey: ["worker-earnings"] })
    },
  })

  if (isLoading) return <LoadingState message="Loading job details..." />
  const job = data?.job ?? data

  if (!job) return <div>Job not found</div>

  const canStart = ["assigned", "accepted", "en_route", "arrived"].includes(job.status) && !job.startVerified
  const canComplete = job.status === "started" && !job.completionVerified

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-accent font-medium">
        ← Back to Jobs
      </button>

      <div className="bg-white rounded-xl p-4 border border-border">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">{job.serviceName}</h2>
            <p className="text-sm text-muted mt-1">{job.address}</p>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            job.status === "completed" ? "bg-green-100 text-green-700" :
            job.status === "started" ? "bg-yellow-100 text-yellow-700" :
            "bg-blue-100 text-blue-700"
          }`}>
            {job.status}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted">Customer</span>
            <span className="text-sm text-fg">{job.customerName}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted">Phone</span>
            <a href={`tel:${job.customerPhone}`} className="text-sm text-accent">{job.customerPhone}</a>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted">Price</span>
            <span className="text-sm font-medium text-fg">₹{job.price}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted">Advance Paid</span>
            <span className={`text-sm ${job.advancePaid ? "text-green-600" : "text-yellow-600"}`}>
              {job.advancePaid ? `₹${job.advanceAmount} ✓` : "Pending"}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span className="text-sm text-muted">Balance Due</span>
            <span className="text-sm font-medium text-fg">₹{job.balanceDue}</span>
          </div>
          {job.description && (
            <div className="py-2">
              <span className="text-sm text-muted block mb-1">Notes</span>
              <p className="text-sm text-fg">{job.description}</p>
            </div>
          )}
        </div>
      </div>

      {canStart && (
        <div className="bg-white rounded-xl p-4 border border-border">
          <h3 className="text-sm font-medium text-fg mb-3">Start Job</h3>
          <p className="text-xs text-muted mb-3">Enter the 6-digit OTP from the customer to start the job.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter OTP"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm tracking-widest text-center"
              maxLength={6}
            />
            <button
              onClick={() => verifyStartMutation.mutate(otp)}
              disabled={otp.length !== 6 || verifyStartMutation.isPending}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Play size={16} />
              Start
            </button>
          </div>
          {verifyStartMutation.isError && (
            <p className="text-xs text-red-600 mt-2">Invalid OTP. Please try again.</p>
          )}
        </div>
      )}

      {canComplete && (
        <div className="bg-white rounded-xl p-4 border border-border">
          <h3 className="text-sm font-medium text-fg mb-3">Complete Job</h3>
          <p className="text-xs text-muted mb-3">Enter the 6-digit completion OTP from the customer.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter OTP"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm tracking-widest text-center"
              maxLength={6}
            />
            <button
              onClick={() => verifyCompleteMutation.mutate(otp)}
              disabled={otp.length !== 6 || verifyCompleteMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              <Stop size={16} />
              Complete
            </button>
          </div>
          {verifyCompleteMutation.isError && (
            <p className="text-xs text-red-600 mt-2">Invalid OTP. Please try again.</p>
          )}
          {verifyCompleteMutation.isSuccess && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-700">Job completed successfully!</p>
              <p className="text-xs text-green-600 mt-1">
                Customer will now pay the remaining balance of ₹{verifyCompleteMutation.data?.data?.balanceDue}
              </p>
            </div>
          )}
        </div>
      )}

      {job.status === "completed" && (
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600" />
            <span className="text-sm font-medium text-green-700">Job Completed</span>
          </div>
          <p className="text-xs text-green-600 mt-2">
            Payment stage: {job.paymentStage?.replace("_", " ") || "pending"}
          </p>
        </div>
      )}
    </div>
  )
}

function WorkerEarnings() {
  const { data, isLoading } = useQuery({
    queryKey: ["worker-earnings"],
    queryFn: () => workerApi.getEarnings().then((r) => r.data),
  })

  if (isLoading) return <LoadingState message="Loading earnings..." />

  const summary = data?.summary ?? { totalEarnings: 0, totalPayouts: 0, balance: 0, completedJobs: 0 }
  const transactions = data?.transactions ?? []

  return (
    <div className="space-y-4">
      <div className="bg-accent text-white rounded-xl p-4">
        <p className="text-xs text-white/70">Available Balance</p>
        <p className="text-2xl font-bold mt-1">₹{summary.balance?.toFixed(2) ?? "0.00"}</p>
        <div className="flex items-center justify-between mt-3">
          <div>
            <p className="text-xs text-white/70">Total Earned</p>
            <p className="text-sm font-medium">₹{summary.totalEarnings?.toFixed(2) ?? "0.00"}</p>
          </div>
          <div>
            <p className="text-xs text-white/70">Withdrawn</p>
            <p className="text-sm font-medium">₹{summary.totalPayouts?.toFixed(2) ?? "0.00"}</p>
          </div>
          <div>
            <p className="text-xs text-white/70">Jobs</p>
            <p className="text-sm font-medium">{summary.completedJobs}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-fg mb-3">Recent Transactions</h3>
        {transactions.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between p-2 bg-bg rounded-lg">
                <div>
                  <p className="text-sm text-fg capitalize">{tx.entryType}</p>
                  <p className="text-xs text-muted">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  {tx.reference && (
                    <p className="text-xs text-muted">{tx.reference}</p>
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  tx.entryType === "earning" ? "text-green-600" : 
                  tx.entryType === "payout" ? "text-red-600" :
                  "text-yellow-600"
                }`}>
                  {tx.entryType === "earning" ? "+" : tx.entryType === "payout" ? "-" : "±"}₹{tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkerProfile({ worker }: { worker: any }) {
  const [showAddAccount, setShowAddAccount] = useState(false)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-fg mb-3">Personal Details</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <User size={16} className="text-muted" />
            <div>
              <p className="text-xs text-muted">Name</p>
              <p className="text-sm text-fg">{worker.worker.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-muted" />
            <div>
              <p className="text-xs text-muted">Phone</p>
              <p className="text-sm text-fg">{worker.worker.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-muted" />
            <div>
              <p className="text-xs text-muted">Address</p>
              <p className="text-sm text-fg">{worker.worker.address ?? "Not set"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-fg">Documents</h3>
          <button className="text-xs text-accent font-medium">+ Add</button>
        </div>
        <div className="space-y-2">
          {worker.documents?.map((doc: WorkerDocument) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-bg rounded-lg">
              <FileText size={20} className="text-accent" />
              <div className="flex-1">
                <p className="text-sm text-fg capitalize">{doc.type.replace("_", " ")}</p>
                <p className="text-xs text-muted">{doc.status}</p>
              </div>
              {doc.status === "verified" ? (
                <CheckCircle size={16} className="text-green-500" />
              ) : doc.status === "rejected" ? (
                <XCircle size={16} className="text-red-500" />
              ) : (
                <Clock size={16} className="text-yellow-500" />
              )}
            </div>
          )) ?? (
            <p className="text-xs text-muted text-center py-4">No documents uploaded</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-fg">Payout Account</h3>
          <button
            onClick={() => setShowAddAccount(true)}
            className="text-xs text-accent font-medium"
          >
            + Add
          </button>
        </div>
        {worker.payoutAccount ? (
          <div className="flex items-center gap-3 p-3 bg-bg rounded-lg">
            <Bank size={20} className="text-accent" />
            <div>
              <p className="text-sm text-fg">{worker.payoutAccount.provider}</p>
              <p className="text-xs text-muted">{worker.payoutAccount.accountReference || worker.payoutAccount.upiId}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted text-center py-4">No payout account added</p>
        )}
      </div>

      {showAddAccount && <AddPayoutAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}

function AddPayoutAccountModal({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<"bank" | "upi">("bank")
  const [accountHolder, setAccountHolder] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [ifscCode, setIfscCode] = useState("")
  const [upiId, setUpiId] = useState("")
  const queryClient = useQueryClient()

  const addMutation = useMutation({
    mutationFn: () => workerApi.addPayoutAccount({
      provider,
      accountHolder,
      accountNumber: provider === "bank" ? accountNumber : undefined,
      ifscCode: provider === "bank" ? ifscCode : undefined,
      upiId: provider === "upi" ? upiId : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-profile"] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-fg">Add Payout Account</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/50">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setProvider("bank")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border ${
                  provider === "bank" ? "border-accent bg-accent/10 text-accent" : "border-border"
                }`}
              >
                <Bank size={16} className="mx-auto mb-1" />
                Bank Account
              </button>
              <button
                onClick={() => setProvider("upi")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border ${
                  provider === "upi" ? "border-accent bg-accent/10 text-accent" : "border-border"
                }`}
              >
                <Phone size={16} className="mx-auto mb-1" />
                UPI
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1">Account Holder Name</label>
            <input
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              placeholder="Full name"
            />
          </div>

          {provider === "bank" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-fg mb-1">Account Number</label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="Bank account number"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-fg mb-1">IFSC Code</label>
                <input
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="IFSC code"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-fg mb-1">UPI ID</label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="yourname@upi"
              />
            </div>
          )}

          <button
            onClick={() => addMutation.mutate()}
            disabled={!accountHolder || (provider === "bank" ? (!accountNumber || !ifscCode) : !upiId) || addMutation.isPending}
            className="w-full py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {addMutation.isPending ? "Adding..." : "Add Account"}
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkerRegistration() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    aadharKey: undefined as string | null | undefined,
    panKey: undefined as string | null | undefined,
  })
  const queryClient = useQueryClient()

  const registerMutation = useMutation({
    mutationFn: () => workerApi.register(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-profile"] })
    },
  })

  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }))
      })
    }
  }

  const handleSubmit = () => {
    registerMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-bg p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-fg">Worker Registration</h1>
          <p className="text-sm text-muted mt-1">Step {step} of 3</p>
        </div>

        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full ${s <= step ? "bg-accent" : "bg-muted/30"}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white rounded-xl p-4 border border-border space-y-4">
            <h3 className="text-sm font-medium text-fg">Personal Details</h3>
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Full Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Phone Number *</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="+91 XXXXX XXXXX"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Address *</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none"
                rows={3}
                placeholder="Your full address"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg mb-1">Location</label>
              <button
                type="button"
                onClick={detectLocation}
                className="w-full py-2 border border-border rounded-lg text-sm text-accent font-medium flex items-center justify-center gap-2"
              >
                <MapPin size={16} />
                {form.latitude ? `${form.latitude.toFixed(4)}, ${form.longitude?.toFixed(4)}` : "Detect My Location"}
              </button>
              <p className="text-xs text-muted mt-1">Your territory will be auto-assigned based on location</p>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!form.name || !form.phone || !form.address}
              className="w-full py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl p-4 border border-border space-y-4">
            <h3 className="text-sm font-medium text-fg">Upload Documents</h3>
            <p className="text-xs text-muted">Upload your Aadhar and PAN card for verification.</p>

            <FileUpload
              value={form.aadharKey}
              onChange={(key) => setForm((f) => ({ ...f, aadharKey: key }))}
              type="worker-aadhar"
              label="Aadhar Card *"
              description="Upload front side of your Aadhar card"
              aspectRatio="video"
            />

            <FileUpload
              value={form.panKey}
              onChange={(key) => setForm((f) => ({ ...f, panKey: key }))}
              type="worker-pan"
              label="PAN Card *"
              description="Upload your PAN card"
              aspectRatio="video"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-2 border border-border rounded-lg text-sm font-medium"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!form.aadharKey || !form.panKey}
                className="flex-1 py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-xl p-4 border border-border space-y-4">
            <h3 className="text-sm font-medium text-fg">Review & Submit</h3>

            <div className="space-y-3 p-3 bg-bg rounded-lg">
              <div className="flex justify-between">
                <span className="text-xs text-muted">Name</span>
                <span className="text-xs text-fg">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted">Phone</span>
                <span className="text-xs text-fg">{form.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted">Location</span>
                <span className="text-xs text-fg">
                  {form.latitude ? "Detected" : "Not set"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted">Aadhar</span>
                <span className="text-xs text-fg">{form.aadharKey ? "Uploaded" : "Missing"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted">PAN</span>
                <span className="text-xs text-fg">{form.panKey ? "Uploaded" : "Missing"}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                Your cooperative/territory will be automatically assigned based on your location after submission.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-2 border border-border rounded-lg text-sm font-medium"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={registerMutation.isPending}
                className="flex-1 py-2 bg-accent text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {registerMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
