import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { Service } from "../lib/types"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatMoney } from "../lib/utils"
import { ArrowLeft, Pencil, Trash, Clock, CurrencyDollar, ListChecks, Question } from "@phosphor-icons/react"
import { useState } from "react"

export function ServiceView() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => adminApi.getAdminService(serviceId!).then((r) => r.data.service),
  })

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteService(serviceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-services"] })
      queryClient.invalidateQueries({ queryKey: ["service-categories"] })
    },
  })

  const service: Service | undefined = data

  if (isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load service" onRetry={() => refetch()} />
      </div>
    )
  }

  if (isLoading || !service) {
    return <LoadingState message="Loading service…" />
  }

  const heroImage = service.heroImageKey ?? service.hero_image_key
  const heroImageUrl = heroImage ? `${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(heroImage)}` : null
  const basePrice = service.basePrice ?? service.base_price
  const listPrice = service.listPrice ?? service.list_price
  const pricePerMinute = service.pricePerMinute ?? service.price_per_minute
  const minMinutes = service.minMinutes ?? service.min_minutes
  const maxMinutes = service.maxMinutes ?? service.max_minutes
  const defaultMinutes = service.defaultMinutes ?? service.default_minutes
  const emergencySupported = service.emergencySupported ?? service.emergency_supported
  const includes = service.includes ?? []
  const excludes = service.excludes ?? []
  const steps = service.steps ?? []
  const faqs = service.faqs ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/categories" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-fg">{service.name}</h1>
          <p className="text-xs text-muted">{service.category}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/services/${service.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-border rounded-md hover:bg-muted/50 transition-colors"
          >
            <Pencil size={14} />
            Edit
          </Link>
          {deleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => deleteMutation.mutate()}
                className="px-3 py-1.5 text-xs font-medium bg-danger text-white rounded-md"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs font-medium bg-muted text-fg rounded-md"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger border border-danger/30 rounded-md hover:bg-danger/10 transition-colors"
            >
              <Trash size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {heroImageUrl && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted/30">
              <img src={heroImageUrl} alt={service.name} className="w-full h-full object-cover" />
            </div>
          )}

          {service.description && (
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-2">Description</h3>
              <p className="text-sm text-muted leading-relaxed">{service.description}</p>
            </div>
          )}

          {steps.length > 0 && (
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3 flex items-center gap-2">
                <ListChecks size={16} />
                Steps
              </h3>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-muted">{typeof step === "string" ? step : step.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {faqs.length > 0 && (
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3 flex items-center gap-2">
                <Question size={16} />
                FAQs
              </h3>
              <div className="space-y-3">
                {faqs.map((faq, i) => (
                  <div key={i} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-fg">{faq.question}</p>
                    <p className="text-sm text-muted mt-1">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Pricing</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted flex items-center gap-1.5"><CurrencyDollar size={14} />Base Price</span>
                <span className="font-tabular font-medium">{basePrice != null ? formatMoney(basePrice) : "—"}</span>
              </div>
              {listPrice != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">List Price</span>
                  <span className="font-tabular">{formatMoney(listPrice)}</span>
                </div>
              )}
              {pricePerMinute != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Per Minute</span>
                  <span className="font-tabular">{formatMoney(pricePerMinute)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Duration</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted flex items-center gap-1.5"><Clock size={14} />Default</span>
                <span className="font-tabular">{defaultMinutes ? `${defaultMinutes} min` : "—"}</span>
              </div>
              {minMinutes != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Min</span>
                  <span className="font-tabular">{minMinutes} min</span>
                </div>
              )}
              {maxMinutes != null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Max</span>
                  <span className="font-tabular">{maxMinutes} min</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Settings</h3>
            <div className="flex items-center gap-2">
              {emergencySupported ? (
                <Badge variant="warning" size="sm">Emergency Supported</Badge>
              ) : (
                <Badge variant="neutral" size="sm">Standard Only</Badge>
              )}
            </div>
          </div>

          {includes.length > 0 && (
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3">Includes</h3>
              <ul className="space-y-1.5">
                {includes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted">
                    <span className="text-ok mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {excludes.length > 0 && (
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3">Excludes</h3>
              <ul className="space-y-1.5">
                {excludes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted">
                    <span className="text-danger mt-0.5">✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
