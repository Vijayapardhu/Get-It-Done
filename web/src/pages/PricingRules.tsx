import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import type { PricingRule } from "../lib/types"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { Tag, Plus } from "@phosphor-icons/react"
import { useState } from "react"

export function PricingRules() {
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: () => adminApi.getPricingRules().then((r) => r.data.rules),
  })

  const rules: PricingRule[] = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pricing Rules"
        description={`${rules.length} pricing rules configured`}
        icon={Tag}
      >
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add Rule
        </button>
      </PageHeader>

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load pricing rules" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading pricing rules…" />
      ) : rules.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="box" title="No pricing rules" description="Create your first pricing rule to get started." />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Service</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Multiplier</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Valid From</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium text-fg">{rule.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{rule.serviceCategory ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{rule.basePrice != null ? `₹${rule.basePrice}` : "—"}</td>
                  <td className="px-4 py-3 text-muted">{rule.minPrice != null ? `₹${rule.minPrice}` : "—"}</td>
                  <td className="px-4 py-3 text-muted">{rule.maxPrice != null ? `₹${rule.maxPrice}` : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="success" size="sm">Active</Badge>
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
