import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { ServiceFaq } from "../lib/types"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { ArrowLeft, Plus, X, Image } from "@phosphor-icons/react"
import { useState, useEffect } from "react"
import { FileUpload } from "../components/ui/FileUpload"

export function ServiceForm() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = Boolean(serviceId)
  const presetCategory = searchParams.get("category") ?? ""

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => adminApi.getAdminService(serviceId!).then((r) => r.data.service),
    enabled: isEdit,
  })

  const [form, setForm] = useState({
    name: "",
    category: "",
    description: "",
    basePrice: "",
    emergencySupported: false,
    pricePerMinute: "",
    minMinutes: "",
    maxMinutes: "",
    defaultMinutes: "",
    listPrice: "",
    heroImageKey: null as string | null,
    includes: [] as string[],
    excludes: [] as string[],
    steps: [] as string[],
    faqs: [] as ServiceFaq[],
  })

  const [includeInput, setIncludeInput] = useState("")
  const [excludeInput, setExcludeInput] = useState("")
  const [stepInput, setStepInput] = useState("")
  const [faqQuestion, setFaqQuestion] = useState("")
  const [faqAnswer, setFaqAnswer] = useState("")

  useEffect(() => {
    if (data) {
      const rawSteps = data.steps
      const normalizedSteps: string[] = Array.isArray(rawSteps)
        ? rawSteps.map((s) => typeof s === "string" ? s : s?.title ?? "")
        : []
      setForm({
        name: data.name ?? "",
        category: data.category ?? "",
        description: data.description ?? "",
        basePrice: data.basePrice?.toString() ?? data.base_price?.toString() ?? "",
        emergencySupported: data.emergencySupported ?? data.emergency_supported ?? false,
        pricePerMinute: data.pricePerMinute?.toString() ?? data.price_per_minute?.toString() ?? "",
        minMinutes: data.minMinutes?.toString() ?? data.min_minutes?.toString() ?? "",
        maxMinutes: data.maxMinutes?.toString() ?? data.max_minutes?.toString() ?? "",
        defaultMinutes: data.defaultMinutes?.toString() ?? data.default_minutes?.toString() ?? "",
        listPrice: data.listPrice?.toString() ?? data.list_price?.toString() ?? "",
        heroImageKey: data.hero_image_url ?? null,
        includes: data.includes ?? [],
        excludes: data.excludes ?? [],
        steps: normalizedSteps,
        faqs: data.faqs ?? [],
      })
    } else if (presetCategory) {
      setForm((f) => ({ ...f, category: presetCategory }))
    }
  }, [data, presetCategory])

  const createMutation = useMutation({
    mutationFn: () => adminApi.createService({
      name: form.name,
      category: form.category,
      description: form.description || undefined,
      basePrice: Number(form.basePrice),
      emergencySupported: form.emergencySupported,
      pricePerMinute: form.pricePerMinute ? Number(form.pricePerMinute) : undefined,
      minMinutes: form.minMinutes ? Number(form.minMinutes) : undefined,
      maxMinutes: form.maxMinutes ? Number(form.maxMinutes) : undefined,
      defaultMinutes: form.defaultMinutes ? Number(form.defaultMinutes) : undefined,
      listPrice: form.listPrice ? Number(form.listPrice) : undefined,
      heroImageKey: form.heroImageKey || undefined,
      includes: form.includes.length > 0 ? form.includes : undefined,
      excludes: form.excludes.length > 0 ? form.excludes : undefined,
      steps: form.steps.length > 0 ? form.steps : undefined,
      faqs: form.faqs.length > 0 ? form.faqs : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service", serviceId] })
      queryClient.invalidateQueries({ queryKey: ["category-services"] })
      queryClient.invalidateQueries({ queryKey: ["service-categories"] })
      navigate(`/services/${serviceId}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => adminApi.updateService(serviceId!, {
      name: form.name,
      category: form.category,
      description: form.description || undefined,
      basePrice: Number(form.basePrice),
      emergencySupported: form.emergencySupported,
      pricePerMinute: form.pricePerMinute ? Number(form.pricePerMinute) : undefined,
      minMinutes: form.minMinutes ? Number(form.minMinutes) : undefined,
      maxMinutes: form.maxMinutes ? Number(form.maxMinutes) : undefined,
      defaultMinutes: form.defaultMinutes ? Number(form.defaultMinutes) : undefined,
      listPrice: form.listPrice ? Number(form.listPrice) : undefined,
      heroImageKey: form.heroImageKey || undefined,
      includes: form.includes.length > 0 ? form.includes : undefined,
      excludes: form.excludes.length > 0 ? form.excludes : undefined,
      steps: form.steps.length > 0 ? form.steps : undefined,
      faqs: form.faqs.length > 0 ? form.faqs : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service", serviceId] })
      queryClient.invalidateQueries({ queryKey: ["category-services"] })
      queryClient.invalidateQueries({ queryKey: ["service-categories"] })
      navigate(`/services/${serviceId}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isEdit) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  const addInclude = () => {
    if (includeInput.trim()) {
      setForm((f) => ({ ...f, includes: [...f.includes, includeInput.trim()] }))
      setIncludeInput("")
    }
  }

  const addExclude = () => {
    if (excludeInput.trim()) {
      setForm((f) => ({ ...f, excludes: [...f.excludes, excludeInput.trim()] }))
      setExcludeInput("")
    }
  }

  const addStep = () => {
    if (stepInput.trim()) {
      setForm((f) => ({ ...f, steps: [...f.steps, stepInput.trim()] }))
      setStepInput("")
    }
  }

  const addFaq = () => {
    if (faqQuestion.trim() && faqAnswer.trim()) {
      setForm((f) => ({ ...f, faqs: [...f.faqs, { question: faqQuestion.trim(), answer: faqAnswer.trim() }] }))
      setFaqQuestion("")
      setFaqAnswer("")
    }
  }

  if (isEdit && isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load service" onRetry={() => refetch()} />
      </div>
    )
  }

  if (isEdit && isLoading) {
    return <LoadingState message="Loading service…" />
  }

  const mutation = isEdit ? updateMutation : createMutation

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/categories" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-fg">{isEdit ? "Edit Service" : "New Service"}</h1>
          <p className="text-xs text-muted">{isEdit ? "Update service details" : "Add a new service to the catalogue"}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Basic Information</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Category *</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <FileUpload
                value={form.heroImageKey}
                onChange={(key) => setForm((f) => ({ ...f, heroImageKey: key }))}
                type="service-hero"
                label="Hero Image"
                description="Upload a hero image for this service. Recommended size: 1200x675px"
                aspectRatio="video"
              />
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Pricing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Base Price *</label>
                  <input
                    type="number"
                    value={form.basePrice}
                    onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">List Price</label>
                  <input
                    type="number"
                    value={form.listPrice}
                    onChange={(e) => setForm((f) => ({ ...f, listPrice: e.target.value }))}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Per Minute</label>
                  <input
                    type="number"
                    value={form.pricePerMinute}
                    onChange={(e) => setForm((f) => ({ ...f, pricePerMinute: e.target.value }))}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Duration (minutes)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Min</label>
                  <input
                    type="number"
                    value={form.minMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, minMinutes: e.target.value }))}
                    min="5"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Max</label>
                  <input
                    type="number"
                    value={form.maxMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, maxMinutes: e.target.value }))}
                    min="5"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Default</label>
                  <input
                    type="number"
                    value={form.defaultMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, defaultMinutes: e.target.value }))}
                    min="5"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.emergencySupported}
                  onChange={(e) => setForm((f) => ({ ...f, emergencySupported: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="text-fg">Emergency Supported</span>
              </label>
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Steps</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={stepInput}
                  onChange={(e) => setStepInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStep())}
                  placeholder="Add a step..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addStep}
                  className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              {form.steps.length > 0 && (
                <ol className="space-y-1.5">
                  {form.steps.map((step, i) => (
                    <li key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-md px-3 py-1.5">
                      <span><span className="font-medium text-muted mr-2">{i + 1}.</span>{step}</span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))}
                        className="text-muted hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Includes</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={includeInput}
                  onChange={(e) => setIncludeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())}
                  placeholder="What's included..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addInclude}
                  className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              {form.includes.length > 0 && (
                <ul className="space-y-1.5">
                  {form.includes.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-sm bg-ok/10 rounded-md px-3 py-1.5">
                      <span className="text-ok">✓</span>
                      <span className="flex-1 ml-2">{item}</span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, includes: f.includes.filter((_, idx) => idx !== i) }))}
                        className="text-muted hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Excludes</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclude())}
                  placeholder="What's excluded..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addExclude}
                  className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              {form.excludes.length > 0 && (
                <ul className="space-y-1.5">
                  {form.excludes.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-sm bg-danger/10 rounded-md px-3 py-1.5">
                      <span className="text-danger">✗</span>
                      <span className="flex-1 ml-2">{item}</span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, excludes: f.excludes.filter((_, idx) => idx !== i) }))}
                        className="text-muted hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">FAQs</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  placeholder="Question"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={faqAnswer}
                    onChange={(e) => setFaqAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFaq())}
                    placeholder="Answer"
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={addFaq}
                    className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              {form.faqs.length > 0 && (
                <div className="space-y-2">
                  {form.faqs.map((faq, i) => (
                    <div key={i} className="bg-muted/20 rounded-md p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-fg">{faq.question}</p>
                          <p className="text-xs text-muted mt-1">{faq.answer}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, faqs: f.faqs.filter((_, idx) => idx !== i) }))}
                          className="text-muted hover:text-danger"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3">Preview</h3>
              {form.heroImageKey ? (
                <div className="aspect-video rounded-md overflow-hidden bg-muted/30 mb-3">
                  <img src={`${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(form.heroImageKey)}`} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video rounded-md bg-muted/30 flex items-center justify-center mb-3">
                  <Image size={32} className="text-muted/50" />
                </div>
              )}
              <h4 className="font-medium text-fg">{form.name || "Service Name"}</h4>
              <p className="text-xs text-muted mt-0.5">{form.category || "Category"}</p>
              {form.basePrice && (
                <p className="text-sm font-medium text-primary mt-2">₹{form.basePrice}</p>
              )}
            </div>

            {mutation.isError && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-3">
                <p className="text-xs text-danger">
                  {(mutation.error as Error)?.message ?? "Failed to save service"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link
            to="/categories"
            className="px-4 py-2 text-sm font-medium text-fg bg-white border border-border rounded-md hover:bg-muted/50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? "Saving..." : isEdit ? "Update Service" : "Create Service"}
          </button>
        </div>
      </form>
    </div>
  )
}
