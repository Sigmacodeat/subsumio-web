"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";
import { apiGet } from "@/lib/queries/settings";

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncResult: {
    usersProcessed: number;
    usersCreated: number;
    usersUpdated: number;
    usersDeactivated: number;
    groupsProcessed: number;
    errors: string[];
    startedAt: string;
    completedAt: string;
  } | null;
  configured: boolean;
  workosDirectorySyncConfigured: boolean;
  totalScimUsers: number;
  activeScimUsers: number;
  deactivatedScimUsers: number;
}

export function useScimStatus() {
  return useQuery({
    queryKey: ["scim", "status"],
    queryFn: () => apiGet<{ data: SyncStatus }>("/api/scim/status"),
    staleTime: 30 * 1000,
  });
}

export function useScimSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => csrfFetch("/api/scim/sync", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scim", "status"] });
    },
  });
}
