"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/csrf";
import { apiGet } from "@/lib/queries/settings";

export interface AgentStep {
  id: string;
  specialist: string;
  prompt: string;
  depends_on?: number;
}

export type AgentRole =
  | "planning"
  | "review"
  | "summary"
  | "research"
  | "draft"
  | "supervisor"
  | "custom";

export const AGENT_ROLES: { value: AgentRole; label: string; description: string }[] = [
  { value: "planning", label: "Planungs-Agent", description: "Rundown, Briefing, Fristen-Planung" },
  { value: "review", label: "Review-Agent", description: "Vertrags-Check, Qualitätskontrolle" },
  { value: "summary", label: "Summary-Agent", description: "Zusammenfassungen, Digests, Berichte" },
  {
    value: "research",
    label: "Recherche-Agent",
    description: "Recherche, Präzedenzfälle, Quellen",
  },
  { value: "draft", label: "Drafting-Agent", description: "Schriftsätze, Anträge, Verträge" },
  { value: "supervisor", label: "Supervisor", description: "Orchestriert andere Agenten" },
  { value: "custom", label: "Spezial-Agent", description: "Custom Use-Case" },
];

export interface AgentTemplate {
  slug: string;
  name: string;
  description: string;
  model?: string;
  role?: AgentRole;
  prompt_template: string;
  steps: AgentStep[];
  playbook_ref?: string;
  force_specialists?: string[];
  skip_critic: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateInput {
  name: string;
  description?: string;
  model?: string;
  role?: AgentRole;
  prompt_template: string;
  steps?: AgentStep[];
  playbook_ref?: string;
  force_specialists?: string[];
  skip_critic?: boolean;
}

export const SPECIALISTS = [
  {
    value: "legal-researcher",
    label: "Legal Researcher",
    description: "Recherche zu Rechtsfragen mit exakten Zitaten",
  },
  {
    value: "legal-analyst",
    label: "Legal Analyst",
    description: "Bewertung von Fällen, Chancen/Risiko-Analyse",
  },
  {
    value: "legal-strategist",
    label: "Legal Strategist",
    description: "Prozessstrategie, Settlement-Empfehlungen",
  },
  {
    value: "legal-drafter",
    label: "Legal Drafter",
    description: "Formulierung von Schriftsätzen, Anträgen, Verträgen",
  },
  {
    value: "legal-deadline-extractor",
    label: "Deadline Extractor",
    description: "Extraktion von Fristen und Terminen aus Dokumenten",
  },
] as const;

export const MODEL_OPTIONS = [
  { value: "", label: "Auto (Engine-Default)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (schnell)" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (ausgewogen)" },
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 (stark)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o mini (schnell)" },
] as const;

export function useAgentTemplates(search?: string) {
  return useQuery<AgentTemplate[]>({
    queryKey: ["agent-templates", search ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const data = await apiGet<{ templates?: AgentTemplate[] }>(`/api/agent-templates?${params.toString()}`);
      return (data?.templates ?? []) as AgentTemplate[];
    },
  });
}

export function useCreateAgentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentTemplateInput) => {
      const res = await csrfFetch("/api/agent-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "create_failed");
      }
      return res.json() as Promise<{ slug: string; success: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-templates"] }),
  });
}

export function useUpdateAgentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, ...input }: AgentTemplateInput & { slug: string }) => {
      const parts = slug.split("/");
      const res = await csrfFetch(
        `/api/agent-templates/${parts.map(encodeURIComponent).join("/")}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "update_failed");
      }
      return res.json() as Promise<{ slug: string; success: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-templates"] }),
  });
}

export function useDeleteAgentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const parts = slug.split("/");
      const res = await csrfFetch(
        `/api/agent-templates/${parts.map(encodeURIComponent).join("/")}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "delete_failed");
      }
      return res.json() as Promise<{ success: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-templates"] }),
  });
}

export function useRunAgentTemplate() {
  return useMutation({
    mutationFn: async ({ slug, input }: { slug: string; input?: string }) => {
      const parts = slug.split("/");
      const res = await csrfFetch(
        `/api/agent-templates/${parts.map(encodeURIComponent).join("/")}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "run_failed");
      }
      return res.json() as Promise<{ jobId: number | null; success: boolean }>;
    },
  });
}
