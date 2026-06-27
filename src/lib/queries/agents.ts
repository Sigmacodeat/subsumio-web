"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";

export type AgentStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "paused"
  | "partial_success"
  | "needs_review"
  | "monitoring";

export type AgentRole =
  | "planning"
  | "review"
  | "summary"
  | "research"
  | "draft"
  | "supervisor"
  | "custom";

export const ROLE_LABELS: Record<AgentRole, { de: string; en: string; icon: string }> = {
  planning: { de: "Planungs-Agent", en: "Planning Agent", icon: "CalendarCheck" },
  review: { de: "Review-Agent", en: "Review Agent", icon: "ClipboardCheck" },
  summary: { de: "Summary-Agent", en: "Summary Agent", icon: "FileText" },
  research: { de: "Recherche-Agent", en: "Research Agent", icon: "Search" },
  draft: { de: "Drafting-Agent", en: "Drafting Agent", icon: "PenTool" },
  supervisor: { de: "Supervisor", en: "Supervisor", icon: "Cpu" },
  custom: { de: "Spezial-Agent", en: "Custom Agent", icon: "Bot" },
};

function inferRole(job: { name: string; subagentDef?: string }): AgentRole {
  const text = `${job.name} ${job.subagentDef ?? ""}`.toLowerCase();
  if (text.includes("supervisor")) return "supervisor";
  if (text.includes("plan") || text.includes("rundown") || text.includes("briefing"))
    return "planning";
  if (text.includes("review") || text.includes("critic") || text.includes("check")) return "review";
  if (
    text.includes("summary") ||
    text.includes("summari") ||
    text.includes("digest") ||
    text.includes("report")
  )
    return "summary";
  if (text.includes("research") || text.includes("recherch") || text.includes("search"))
    return "research";
  if (text.includes("draft") || text.includes("writ") || text.includes("schriftsatz"))
    return "draft";
  return "custom";
}

export interface AgentJob {
  id: number;
  name: string;
  status: AgentStatus;
  role: AgentRole;
  prompt: string;
  model?: string;
  progress?: { step: number; total: number; message: string };
  tokens?: { input: number; output: number; cache: number };
  cost?: number;
  startedAt?: string;
  completedAt?: string;
  parentId?: number;
  subagentDef?: string;
  result?: string;
  isRundown?: boolean;
}

export interface InboxMessage {
  id: number;
  job_id: number;
  sender: string;
  payload: unknown;
  sent_at: string;
  read_at: string | null;
}

function mapJob(j: Record<string, unknown>): AgentJob {
  const name = String(j.name ?? "");
  const subagentDef = j.subagent_def ? String(j.subagent_def) : undefined;
  const rawStatus = String(j.status ?? "waiting");
  const status = (
    [
      "waiting",
      "active",
      "completed",
      "failed",
      "paused",
      "partial_success",
      "needs_review",
      "monitoring",
    ].includes(rawStatus)
      ? rawStatus
      : "waiting"
  ) as AgentStatus;
  const explicitRole = j.role ? String(j.role) : undefined;
  const role = (
    ["planning", "review", "summary", "research", "draft", "supervisor", "custom"].includes(
      explicitRole ?? ""
    )
      ? explicitRole
      : inferRole({ name, subagentDef })
  ) as AgentRole;
  return {
    id: Number(j.id),
    name,
    status,
    role,
    prompt: String(j.prompt ?? ""),
    model: j.model ? String(j.model) : undefined,
    progress: j.progress
      ? (j.progress as { step: number; total: number; message: string })
      : undefined,
    tokens: j.tokens ? (j.tokens as { input: number; output: number; cache: number }) : undefined,
    cost: j.tokens
      ? (() => {
          const t = j.tokens as { input: number; output: number; cache: number };
          return (t.input * 3 + t.output * 15 + t.cache * 0.3) / 1_000_000;
        })()
      : undefined,
    startedAt: j.startedAt ? String(j.startedAt) : undefined,
    completedAt: j.finishedAt ? String(j.finishedAt) : undefined,
    parentId: j.parentId ? Number(j.parentId) : undefined,
    subagentDef,
    result: j.result
      ? typeof j.result === "string"
        ? j.result
        : JSON.stringify(j.result)
      : undefined,
    isRundown: Boolean(j.is_rundown ?? name.toLowerCase().includes("rundown")),
  };
}

export function useAgents() {
  return useQuery<AgentJob[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/api/agents", { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.jobs || data.jobs.length === 0) return [];
      return data.jobs.map(mapJob);
    },
    refetchInterval: (query) => {
      const jobs = query.state.data;
      const hasActive = jobs?.some((j) => j.status === "active" || j.status === "waiting");
      return hasActive ? 3000 : false;
    },
  });
}

export function useAgentInbox(jobId: number, enabled: boolean) {
  return useQuery<InboxMessage[]>({
    queryKey: ["agents", jobId, "inbox"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${jobId}/inbox`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.messages ?? []) as InboxMessage[];
    },
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
}

export function useSendInboxMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, text }: { jobId: number; text: string }) => {
      const res = await csrfFetch(`/api/agents/${jobId}/inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: text }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.message as InboxMessage | null;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["agents", vars.jobId, "inbox"] });
    },
  });
}

export function usePauseAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      csrfFetch(`/api/agents/${id}/pause`, { method: "POST" }).then((r) => r.ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useResumeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      csrfFetch(`/api/agents/${id}/resume`, { method: "POST" }).then((r) => r.ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useCancelAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      csrfFetch(`/api/agents/${id}/cancel`, { method: "POST" }).then((r) => r.ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useReplayAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await csrfFetch(`/api/agents/${id}/replay`, { method: "POST" });
      if (!res.ok) return null;
      const data = await res.json();
      return data.newJobId as number | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useSubmitSupervisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      prompt: string;
      forceSpecialists?: string[];
      skipCritic?: boolean;
    }) => {
      const res = await csrfFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: input.prompt,
          ...(input.forceSpecialists ? { force_specialists: input.forceSpecialists } : {}),
          ...(input.skipCritic ? { skip_critic: true } : {}),
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.jobId as number | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useRundown() {
  return useQuery<AgentJob[]>({
    queryKey: ["agents", "rundown"],
    queryFn: async () => {
      const res = await fetch("/api/agents?filter=rundown", { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.jobs) return [];
      return data.jobs.map(mapJob);
    },
    refetchInterval: (query) => {
      const jobs = query.state.data;
      const hasActive = jobs?.some((j) => j.status === "active" || j.status === "waiting");
      return hasActive ? 5000 : false;
    },
  });
}

export function useTriggerRundown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await csrfFetch("/api/agents/rundown", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.jobId as number | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agents", "rundown"] });
    },
  });
}
