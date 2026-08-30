import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { Service } from "../lib/types"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatMoney } from "../lib/utils"
import { Package, Plus, Pencil, Trash, ArrowLeft } from "@phosphor-icons/react"
import { useState } from "react"

export function CategoryView() {
  const { categoryName } = useParams<{ categoryName: string }>()
  const decodedCategory = decodeURIComponent(categoryName ?? "")
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["category-services", decodedCategory],
    queryFn: () => adminApi.getAdminServices({ search: decodedCategory }).then((r) => r.data.services.filter(s => s.category === decodedCategory)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-services"] })
      queryClient.invalidateQueries({ queryKey: ["service-categories"] })
      setDeleteConfirm(null)
    },
  })

  const services: Service[] = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/categories" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-fg">{decodedCategory}</h1>
          <p className="text-xs text-muted">{services.length} services in this category</p>
        </div>
        <Link
          to={`/services/new?category=${encodeURIComponent(decodedCategory)}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add Service
        </Link>
      </div>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load services" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading services…" />
      ) : services.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No services" description="This category has no services yet." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Service</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Base Price</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Duration</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {service.heroImageUrl || service.hero_image_url ? (
                        <img
                          src={service.heroImageUrl ?? service.hero_image_url}
                          alt=""
                          className="w-10 h-10 rounded-md object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted/30 flex items-center justify-center">
                          <Package size={16} className="text-muted" />
                        </div>
                      )}
                      <div>
                        <Link to={`/services/${service.id}`} className="font-medium text-fg hover:text-primary transition-colors">
                          {service.name}
                        </Link>
                        {service.description && (
                          <p className="text-xs text-muted truncate max-w-[200px]">{service.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-tabular">
                    {service.basePrice ?? service.base_price ? formatMoney((service.basePrice ?? service.base_price ?? 0)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {service.defaultMinutes ?? service.default_minutes ? `${service.defaultMinutes ?? service.default_minutes} min` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {service.emergencySupported ?? service.emergency_supported ? (
                      <Badge variant="warning" size="sm">Emergency</Badge>
                    ) : (
                      <span className="text-xs text-muted">Standard</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/services/${service.id}/edit`}
                        className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} className="text-muted" />
                      </Link>
                      {deleteConfirm === service.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate(service.id)}
                            className="px-2 py-0.5 text-[10px] font-medium bg-danger text-white rounded"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-0.5 text-[10px] font-medium bg-muted text-fg rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(service.id)}
                          className="p-1.5 rounded-md hover:bg-danger/10 transition-colors"
                          title="Delete"
                        >
                          <Trash size={14} className="text-danger" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
