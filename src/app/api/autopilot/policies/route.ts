import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createPolicy, type AutoPilotPolicy } from "@/lib/autopilot";

const createPolicySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  trigger: z.enum([
    "new_intake",
    "deadline_approaching",
    "case_status_change",
    "document_uploaded",
    "frist_detected",
    "rundown_stale",
  ]),
  action: z.enum([
    "generate_rundown",
    "draft_response",
    "summarize_document",
    "check_frist",
    "escalate_to_human",
    "create_task",
  ]),
  conditions: z
    .object({
      deadlineHoursBefore: z.number().int().min(1).max(720).optional(),
      caseStatuses: z.array(z.string()).optional(),
      intakeSources: z.array(z.string()).optional(),
      legalAreas: z.array(z.string()).optional(),
      minUrgency: z.enum(["low", "medium", "high", "critical"]).optional(),
    })
    .optional(),
  jobConfig: z.object({
    prompt: z.string().min(1).max(2000),
    forceSpecialists: z.array(z.string()).optional(),
    skipCritic: z.boolean().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  }),
  maxExecutionsPerHour: z.number().int().min(1).max(100).default(5),
});

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: createPolicySchema,
  },
  async (ctx, body) => {
    const policy = createPolicy({
      name: body.name,
      description: body.description ?? "",
      trigger: body.trigger,
      action: body.action,
      conditions: body.conditions,
      jobConfig: body.jobConfig,
      maxExecutionsPerHour: body.maxExecutionsPerHour,
    });

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/autopilot-policies/${policy.id}`,
        title: `Autopilot: ${policy.name}`,
        type: "autopilot_policy",
        frontmatter: policy,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ policy });
  }
);

export const GET = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
  },
  async (ctx, _body, _query) => {
    const params = new URLSearchParams({ type: "autopilot_policy", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
      slug: string;
    }>;
    const policies = pages.map((p) => p.frontmatter as unknown as AutoPilotPolicy);
    return apiSuccess({ policies });
  }
);

const patchPolicySchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  name: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export const PATCH = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: patchPolicySchema,
  },
  async (ctx, body) => {
    const params = new URLSearchParams({ type: "autopilot_policy", limit: "100" });
    const listRes = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!listRes.ok) return apiError("engine_error", "Engine request failed", 502);
    const listData = await listRes.json();
    const pages = (Array.isArray(listData) ? listData : (listData.pages ?? [])) as Array<{
      frontmatter: Record<string, unknown>;
      slug: string;
    }>;
    const page = pages.find((p) => {
      const fm = p.frontmatter as Record<string, unknown>;
      return fm.id === body.id;
    });

    if (!page) {
      return apiError("policy_not_found", "Policy nicht gefunden", 404);
    }

    const existing = page.frontmatter as unknown as AutoPilotPolicy;
    const updated: AutoPilotPolicy = {
      ...existing,
      enabled: body.enabled ?? existing.enabled,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      updated_at: new Date().toISOString(),
    };

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: page.slug,
        title: `Autopilot: ${updated.name}`,
        type: "autopilot_policy",
        frontmatter: updated,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ policy: updated });
  }
);
