import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { ErrorState } from "../components/ui/EmptyState"
import { formatMoney, toNumber } from "../lib/utils"
import { Tag, ArrowCircleUp, MapPin } from "@phosphor-icons/react"
import type { PricingRule, SurgeRule, TravelFee } from "../lib/types"

export function Pricing() {
  const rules = useQuery({ queryKey: ["pricing-rules"], queryFn: () => adminApi.getPricingRules().then((r) => r.data.rules) })
  const surge = useQuery({ queryKey: ["surge-rules"], queryFn: () => adminApi.getSurgeRules().then((r) => r.data.rules) })
  const travel = useQuery({ queryKey: ["travel-fees"], queryFn: () => adminApi.getTravelFees().then((r) => r.data.fees) })

  const ruleColumns: Column<PricingRule>[] = [
    { key: "name", header: "Rule" },
    { key: "serviceCategory", header: "Category" },
    { key: "minPrice", header: "Min", align: "right", render: (_v, r) => r.minPrice != null ? <span className="font-tabular">{formatMoney(r.minPrice)}</span> : "—" },
    { key: "maxPrice", header: "Max", align: "right", render: (_v, r) => r.maxPrice != null ? <span className="font-tabular">{formatMoney(r.maxPrice)}</span> : "—" },
  ]
  const surgeColumns: Column<SurgeRule>[] = [
    { key: "name", header: "Rule" },
    { key: "multiplier", header: "Multiplier", align: "right", render: (_v, r) => r.multiplier != null ? <span className="font-tabular">{toNumber(r.multiplier)}x</span> : "—" },
    { key: "condition", header: "Condition" },
  ]
  const travelColumns: Column<TravelFee>[] = [
    { key: "name", header: "Fee" },
    { key: "perKm", header: "Per km", align: "right", render: (_v, r) => r.perKm != null ? <span className="font-tabular">{formatMoney(r.perKm)}</span> : "—" },
    { key: "minFee", header: "Min", align: "right", render: (_v, r) => r.minFee != null ? <span className="font-tabular">{formatMoney(r.minFee)}</span> : "—" },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="Pricing rules for your services"
        icon={Tag}
      />

      <Section title="Service Pricing" subtitle="Base price ranges" icon={Tag} data={rules.data} loading={rules.isLoading} error={rules.isError} refetch={rules.refetch} columns={ruleColumns} keyExtractor={(r: PricingRule) => r.id ?? r.name ?? Math.random().toString()} />
      <Section title="Surge Pricing" subtitle="Demand-based multipliers" icon={ArrowCircleUp} data={surge.data} loading={surge.isLoading} error={surge.isError} refetch={surge.refetch} columns={surgeColumns} keyExtractor={(r: SurgeRule) => r.id ?? r.name ?? Math.random().toString()} />
      <Section title="Travel Fees" subtitle="Distance-based charges" icon={MapPin} data={travel.data} loading={travel.isLoading} error={travel.isError} refetch={travel.refetch} columns={travelColumns} keyExtractor={(r: TravelFee) => r.id ?? r.name ?? Math.random().toString()} />
    </div>
  )
}

function Section<T extends { id?: string; name?: string }>({ title, subtitle, icon: Icon, data, loading, error, refetch, columns, keyExtractor }: { title: string; subtitle: string; icon: React.ComponentType<{ size?: number; className?: string }>; data?: T[]; loading: boolean; error: boolean; refetch: () => void; columns: Column<T>[]; keyExtractor: (r: T) => string }) {
  return (
    <div className="bg-surface rounded-xl border border-muted/20 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-accent/10">
          <Icon size={16} className="text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {error ? <ErrorState message={`Failed to load ${title.toLowerCase()}`} size="sm" onRetry={refetch} /> :
        <DataTable columns={columns} data={data ?? []} keyExtractor={keyExtractor} loading={loading} emptyMessage={`No ${title.toLowerCase()}`} />}
    </div>
  )
}
