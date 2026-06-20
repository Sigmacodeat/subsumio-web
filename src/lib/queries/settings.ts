"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

// ── API Keys ──

export function useApiKeys() {
  return useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: () => fetch("/api/api-keys").then((r) => r.json()),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      csrfFetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "api-keys"] }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      csrfFetch(`/api/api-keys/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "api-keys"] }),
  });
}

// ── Team ──

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => fetch("/api/team").then((r) => r.json()),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role?: string }) =>
      csrfFetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      csrfFetch(`/api/team/${userId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
}

export function useUpdateTeamRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      csrfFetch("/api/team/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });
}

// ── Organization ──

export function useOrg() {
  return useQuery({
    queryKey: ["org"],
    queryFn: () => fetch("/api/org").then((r) => r.json()),
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      csrfFetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      csrfFetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
}

export function useInviteMemberOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      csrfFetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
}

export function useRemoveMemberOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      csrfFetch("/api/org/member", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
}

export function useLeaveOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => csrfFetch("/api/org", { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });
}

// ── Usage ──

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: () => fetch("/api/usage").then((r) => r.json()),
  });
}

// ── Data Export ──

export function useDataExportBackup() {
  return useQuery({
    queryKey: ["data-export", "backup"],
    queryFn: () => fetch("/api/data-export/backup").then((r) => r.json()),
  });
}

// ── Settings API Keys (engine keys, not the REST API keys above) ──

export function useSettingsApiKeys() {
  return useQuery({
    queryKey: ["settings", "engine-api-keys"],
    queryFn: () => fetch("/api/settings/api-keys").then((r) => (r.ok ? r.json() : null)),
  });
}

export function useSaveSettingsApiKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      csrfFetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "engine-api-keys"] }),
  });
}

// ── Billing Checkout ──

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: string) =>
      csrfFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

// ── AI Model Preference ──

export interface ModelPreferenceResponse {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    costPer1MInput: number;
    costPer1MOutput: number;
    speedRating: number;
    description: string;
    capabilities: string[];
    brainScoped: boolean;
  }>;
  preferredModelId: string;
  preferredModel: {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    costPer1MInput: number;
    costPer1MOutput: number;
    speedRating: number;
    description: string;
    capabilities: string[];
    brainScoped: boolean;
  } | null;
  brainId: string;
}

export function useModelPreference() {
  return useQuery({
    queryKey: ["settings", "model"],
    queryFn: () =>
      fetch("/api/settings/model").then((r) => r.json()) as Promise<{ data: ModelPreferenceResponse }>,
  });
}

export function useUpdateModelPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) =>
      csrfFetch("/api/settings/model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "model"] });
    },
  });
}
