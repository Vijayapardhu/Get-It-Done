import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "../../lib/api"
import type { WorkersListParams, WorkersListResponse, Worker, VerificationAction, BulkStatusAction } from "../../lib/types"

export function useWorkers(params: WorkersListParams) {
  return useQuery({
    queryKey: ["workers", params],
    queryFn: () => adminApi.getWorkers(params),
    select: (res) => res.data,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
}

export function useWorker(id: string, enabled = true) {
  return useQuery({
    queryKey: ["worker", id],
    queryFn: () => adminApi.getWorker(id),
    select: (res) => res.data.worker,
    enabled: enabled && !!id,
    staleTime: 30_000,
  })
}

export function useApproveVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminApi.approveVerification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      queryClient.invalidateQueries({ queryKey: ["worker"] })
    },
  })
}

export function useRejectVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: VerificationAction & { id: string }) => adminApi.rejectVerification(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      queryClient.invalidateQueries({ queryKey: ["worker"] })
    },
  })
}

export function useSuspendVerification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: VerificationAction & { id: string }) => adminApi.suspendVerification(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
      queryClient.invalidateQueries({ queryKey: ["worker"] })
    },
  })
}

export function useBulkWorkerStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: BulkStatusAction) => adminApi.bulkWorkerStatus(action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] })
    },
  })
}