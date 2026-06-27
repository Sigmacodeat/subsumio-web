"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

export class ApiGetError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    const snippet = body.slice(0, 200);
    super(`HTTP ${status} on ${path}: ${snippet}`);
    this.name = "ApiGetError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { signal: AbortSignal.timeout(30_000) });

  if (res.status === 401 && typeof window !== "undefined") {
    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set("next", window.location.pathname);
    window.location.href = loginUrl.toString();
    throw new ApiGetError(401, "redirected to login", path);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiGetError(res.status, body, path);
  }

  const text = await res.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiGetError(res.status, `Invalid JSON response: ${text.slice(0, 200)}`, path);
  }
}

// ── API Keys ──

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  createdBy?: string;
}

interface ApiKeyResponse {
  keys: ApiKey[];
}

export function useApiKeys() {
  return useQuery({
    queryKey: ["settings", "api-keys"],
    queryFn: () => apiGet<ApiKeyResponse>("/api/api-keys"),
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

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface TeamResponse {
  members: TeamMember[];
}

export function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: () => apiGet<TeamResponse>("/api/team"),
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
    queryFn: () => apiGet("/api/org"),
  });
}

interface OrgUpdateInput {
  modelPolicy: "any" | "eu_only";
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrgUpdateInput) =>
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
    queryFn: () => apiGet("/api/usage"),
  });
}

// ── Data Export ──

export function useDataExportBackup() {
  return useQuery({
    queryKey: ["data-export", "backup"],
    queryFn: () => apiGet("/api/data-export/backup"),
  });
}

// ── Settings API Keys (engine keys, not the REST API keys above) ──

export function useSettingsApiKeys() {
  return useQuery({
    queryKey: ["settings", "engine-api-keys"],
    queryFn: () => apiGet<{ ok: boolean; openaiKey?: string; anthropicKey?: string; zeroEntropyKey?: string } | null>("/api/settings/api-keys"),
  });
}

interface SettingsApiKeysInput {
  openaiKey?: string;
  anthropicKey?: string;
  zeroEntropyKey?: string;
}

export function useSaveSettingsApiKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsApiKeysInput) =>
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
    dataResidency: "eu" | "non_eu";
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
    dataResidency: "eu" | "non_eu";
  } | null;
  brainId: string;
  modelPolicy: "any" | "eu_only";
}

export function useModelPreference() {
  return useQuery({
    queryKey: ["settings", "model"],
    queryFn: () =>
      apiGet<{ data: ModelPreferenceResponse }>("/api/settings/model"),
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

// ── ACL Groups (Subsumio R3: Document-Level ACLs) ──

export interface AclGroup {
  id: string;
  source_id: string;
  name: string;
  created_at: string;
  member_count?: number;
}

export interface AclGroupMember {
  user_id: string;
  created_at: string;
}

export interface AclPagePermission {
  page_id: number;
  group_id: string;
  group_name?: string;
  permission: "read" | "write";
  created_at: string;
}

export function useAclGroups() {
  return useQuery({
    queryKey: ["acls", "groups"],
    queryFn: () => apiGet<AclGroup[]>("/api/acls/groups"),
  });
}

export function useCreateAclGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      csrfFetch("/api/acls/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls", "groups"] }),
  });
}

export function useDeleteAclGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      csrfFetch(`/api/acls/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" }).then((r) =>
        r.json()
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls", "groups"] }),
  });
}

export function useAclGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ["acls", "groups", groupId, "members"],
    enabled: !!groupId,
    queryFn: () =>
      apiGet<AclGroupMember[]>(`/api/acls/groups/${encodeURIComponent(groupId!)}/members`),
  });
}

export function useAddAclGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; userId: string }) =>
      csrfFetch(`/api/acls/groups/${encodeURIComponent(input.groupId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: input.userId }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls", "groups"] }),
  });
}

export function useRemoveAclGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; userId: string }) =>
      csrfFetch(
        `/api/acls/groups/${encodeURIComponent(input.groupId)}/members/${encodeURIComponent(input.userId)}`,
        {
          method: "DELETE",
        }
      ).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acls", "groups"] }),
  });
}

export function usePagePermissions(slug: string | undefined) {
  return useQuery({
    queryKey: ["acls", "permissions", slug],
    enabled: !!slug,
    queryFn: () =>
      apiGet<AclPagePermission[]>(`/api/acls/permissions/${encodeURIComponent(slug!)}`),
  });
}

export function useSetPagePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; groupId: string; permission: "read" | "write" }) =>
      csrfFetch("/api/acls/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: input.slug,
          group_id: input.groupId,
          permission: input.permission,
        }),
      }).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["acls", "permissions", variables.slug] });
    },
  });
}

export function useRemovePagePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; groupId: string }) =>
      csrfFetch(
        `/api/acls/permissions/${encodeURIComponent(input.slug)}/${encodeURIComponent(input.groupId)}`,
        {
          method: "DELETE",
        }
      ).then((r) => r.json()),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["acls", "permissions", variables.slug] });
    },
  });
}
