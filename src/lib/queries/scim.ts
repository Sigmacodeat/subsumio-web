"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

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
    queryFn: async () => {
      const res = await fetch("/api/scim/status", { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useScimSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      csrfFetch("/api/scim/sync", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scim", "status"] });
    },
  });
}
