import { useQuery } from "@tanstack/react-query"
import { adminApi } from "../lib/api"
import { ErrorState, EmptyState, LoadingState } from "../components/ui/EmptyState"
import { DataTable, type Column } from "../components/ui/DataTable"
import { PageHeader } from "../components/ui/PageHeader"
import { Avatar } from "../components/ui/Badge"
import { formatRelativeTime } from "../lib/utils"
import { User } from "@phosphor-icons/react"

interface CustomerRow {
  id: string
  name: string
  phone: string
  lastBooking: string
  totalBookings: number
}

export function Customers() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["operations"],
    queryFn: () => adminApi.getOperations().then((r) => r.data),
  })

  const byCustomer = new Map<string, CustomerRow>()
  ;(data?.currentBookings ?? []).forEach((b) => {
    const existing = byCustomer.get(b.customer_name)
    if (existing) { existing.totalBookings += 1; if (b.createdAt > existing.lastBooking) existing.lastBooking = b.createdAt }
    else byCustomer.set(b.customer_name, { id: b.customer_name, name: b.customer_name, phone: b.customer_phone, lastBooking: b.createdAt, totalBookings: 1 })
  })
  const rows = Array.from(byCustomer.values()).sort((a, b) => b.lastBooking.localeCompare(a.lastBooking))

  const columns: Column<CustomerRow>[] = [
    { key: "name", header: "Customer", render: (_v, r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.name} size="sm" />
        <div><div className="text-sm font-medium text-ink">{r.name}</div><div className="text-xs text-muted">{r.phone}</div></div>
      </div>
    ) },
    { key: "totalBookings", header: "Bookings", align: "right", render: (_v, r) => <span className="font-tabular">{r.totalBookings}</span> },
    { key: "lastBooking", header: "Last booking", render: (_v, r) => formatRelativeTime(r.lastBooking) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Customers from your cooperative's bookings"
        icon={User}
      />

      {isError ? (
        <div className="max-w-md mx-auto">
          <ErrorState message="Failed to load customers" description="We couldn't fetch the customer data. Check your connection and try again." onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading customers…" />
      ) : rows.length === 0 ? (
        <div className="py-8">
          <EmptyState icon="users" title="No customers yet" description="Customers will appear here once bookings are made through your cooperative." />
        </div>
      ) : (
        <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} loading={false} />
      )}
    </div>
  )
}
