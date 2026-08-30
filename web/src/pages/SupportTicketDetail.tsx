import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import type { SupportTicket } from "../lib/types"
import { ErrorState, LoadingState } from "../components/ui/EmptyState"
import { Badge } from "../components/ui/Badge"
import { formatDateTime } from "../lib/utils"
import { ArrowLeft, PaperPlaneRight } from "@phosphor-icons/react"
import { useState } from "react"

export function SupportTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const queryClient = useQueryClient()
  const [reply, setReply] = useState("")

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => adminApi.getSupportTicket(ticketId!).then((r) => r.data.ticket),
    enabled: !!ticketId,
  })

  const ticket: SupportTicket | undefined = data

  const replyMutation = useMutation({
    mutationFn: () => adminApi.replySupportTicket(ticketId!, reply),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-ticket"] })
      setReply("")
    },
  })

  if (isError) {
    return (
      <div className="max-w-md mx-auto">
        <ErrorState message="Failed to load ticket" onRetry={() => refetch()} />
      </div>
    )
  }

  if (isLoading || !ticket) {
    return <LoadingState message="Loading ticket details…" />
  }

  const statusVariant = ticket.status === "resolved" || ticket.status === "closed" ? "success" :
    ticket.status === "in_progress" ? "warning" : "info"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/support" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-fg">{ticket.subject ?? "Untitled Ticket"}</h1>
          <p className="text-xs text-muted">Ticket #{ticket.id.slice(0, 8)}</p>
        </div>
        <Badge variant={statusVariant} size="sm">{ticket.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Description</h3>
            <p className="text-sm text-muted">{ticket.description ?? "No description provided"}</p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Messages</h3>
            <div className="space-y-3">
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-fg">{ticket.user?.name ?? "Customer"}</span>
                  <span className="text-xs text-muted">{formatDateTime(ticket.createdAt)}</span>
                </div>
                <p className="text-sm text-muted">{ticket.description ?? "No message"}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => replyMutation.mutate()}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <PaperPlaneRight size={14} />
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-fg mb-3">Details</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Category</span>
                <span className="text-fg">{ticket.category ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Priority</span>
                <span className="text-fg capitalize">{ticket.priority ?? "normal"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Created</span>
                <span className="text-fg">{formatDateTime(ticket.createdAt)}</span>
              </div>
              {ticket.updatedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Updated</span>
                  <span className="text-fg">{formatDateTime(ticket.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
