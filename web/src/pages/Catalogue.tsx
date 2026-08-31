import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { ServiceCategory } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Package, Plus } from "@phosphor-icons/react"
import { Link } from "react-router-dom"

export function Catalogue() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service-categories"],
    queryFn: () => adminApi.getServiceCategories().then((r) => r.data.categories),
  })

  const categories: ServiceCategory[] = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description={`${categories.length} service categories`}
        icon={Package}
      >
        <Link
          to="/categories/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          New Category
        </Link>
      </PageHeader>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load categories" description="We couldn't fetch the categories. Check your connection and try again." onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading categories…" />
      ) : categories.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No categories yet" description="Create your first service category to get started." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.category}
              to={`/categories/${encodeURIComponent(cat.category)}`}
              className="group bg-white border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-video bg-muted/30 relative overflow-hidden">
                {cat.imageKey ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(cat.imageKey)}`}
                    alt={cat.category}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt={cat.category}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={40} className="text-muted/50" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-white/90 backdrop-blur-sm rounded-full text-fg/70">
                    {cat.services.length} {cat.services.length === 1 ? "service" : "services"}
                  </span>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-sm text-fg truncate">{cat.category}</h3>
                <p className="text-xs text-muted mt-0.5 capitalize">{cat.category}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
