import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import {
  loadKanzleiSettingsForBrain,
  KanzleiSettingsUnavailableError,
} from "@/lib/kanzlei-settings-server";
import {
  DEFAULT_POLICIES,
  buildApprovalGatedJob,
  buildPromptForPolicy,
  reserveAutopilotBudget,
  shouldPolicyFire,
  type AutoPilotPolicy,
  type AutopilotExecution,
  type AutopilotTrigger,
} from "@/lib/autopilot";

import { logger } from "@/lib/logger";
const log = logger("api/cron/autopilot");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Page {
  slug: string;
  frontmatter: Record<string, unknown>;
}

interface Candidate {
  trigger: AutopilotTrigger;
  page: Page;
  context: Parameters<typeof shouldPolicyFire>[1];
}

const TRIGGER_SOURCES: Array<{ trigger: AutopilotTrigger; type: string }> = [
  { trigger: "new_intake", type: "intake_request" },
  { trigger: "deadline_approaching", type: "legal_deadline" },
  { trigger: "document_uploaded", type: "document" },
  { trigger: "rundown_stale", type: "agent_action" },
];

function pagesFrom(data: unknown): Page[] {
  if (Array.isArray(data)) return data as Page[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    return (data as { pages: Page[] }).pages;
  }
  return [];
}

function candidateFromPage(
  trigger: AutopilotTrigger,
  page: Page,
  now = Date.now()
): Candidate | null {
  const fm = page.frontmatter;
  if (trigger === "new_intake" && fm.status !== "new") return null;
  if (trigger === "deadline_approaching") {
    if (["done", "completed", "cancelled"].includes(String(fm.status ?? ""))) return null;
    const due = new Date(String(fm.due_at ?? fm.date ?? fm.deadline_at ?? "")).getTime();
    if (!Number.isFinite(due) || due < now) return null;
    return { trigger, page, context: { trigger, deadlineHours: (due - now) / 3_600_000 } };
  }
  if (trigger === "document_uploaded") {
    if (fm.autopilot_processed_at) return null;
  }
  if (trigger === "rundown_stale") {
    if (String(fm.status ?? "") !== "pending") return null;
    const updated = new Date(String(fm.updated_at ?? fm.created_at ?? "")).getTime();
    if (!Number.isFinite(updated) || now - updated < 24 * 3_600_000) return null;
  }
  return {
    trigger,
    page,
    context: {
      trigger,
      urgency: String(fm.urgency ?? "low"),
      legalArea: String(fm.legal_area ?? ""),
      intakeSource: String(fm.source ?? ""),
      caseStatus: String(fm.status ?? ""),
    },
  };
}

async function listPages(type: string, headers: Record<string, string>): Promise<Page[]> {
  const params = new URLSearchParams({ type, limit: "100" });
  const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok ? pagesFrom(await response.json()) : [];
}

async function persistExecution(execution: AutopilotExecution, headers: Record<string, string>) {
  await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/autopilot-executions/${execution.id}`,
      title: `Autopilot: ${execution.policyName}`,
      type: "autopilot_execution",
      frontmatter: { ...execution, approval_required: true, approval_status: "pending" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Runs the trigger-scan + policy-fire loop for ONE firm's own brain. Every
 * execution is approval-gated (buildApprovalGatedJob: approval_required,
 * may_finalize: false) — autopilot only ever proposes, never finalizes.
 */
async function runForBrain(
  brainId: string,
  capCents: number
): Promise<{
  totalExecutions: number;
  budgetSpentCents: number;
  budgetExhausted: boolean;
  executions: AutopilotExecution[];
}> {
  const headers = engineHeadersForBrain(brainId);
  const storedPolicies = await listPages("autopilot_policy", headers);
  const policies = storedPolicies.length
    ? storedPolicies.map((page) => page.frontmatter as unknown as AutoPilotPolicy)
    : DEFAULT_POLICIES;

  let budget = { capCents, spentCents: 0 };
  const executions: AutopilotExecution[] = [];
  let budgetExhausted = false;

  for (const source of TRIGGER_SOURCES) {
    const candidates = (await listPages(source.type, headers))
      .map((page) => candidateFromPage(source.trigger, page))
      .filter((candidate): candidate is Candidate => candidate !== null);

    for (const candidate of candidates) {
      for (const policy of policies) {
        if (!shouldPolicyFire(policy, candidate.context)) continue;
        const hourlyCount = executions.filter((item) => item.policyId === policy.id).length;
        if (hourlyCount >= policy.maxExecutionsPerHour) continue;

        const reservation = reserveAutopilotBudget(budget, policy.estimatedCostCents ?? 5);
        if (!reservation.allowed) {
          budgetExhausted = true;
          break;
        }
        budget = reservation.budget;
        const fm = candidate.page.frontmatter;
        const prompt = buildPromptForPolicy(policy, {
          caseSlug: String(fm.case_slug ?? fm.caseSlug ?? "") || undefined,
          intakeSlug: candidate.trigger === "new_intake" ? candidate.page.slug : undefined,
          deadlineDate: String(fm.due_at ?? fm.date ?? "") || undefined,
          summary: String(fm.summary ?? fm.title ?? "") || undefined,
        });
        const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const execution: AutopilotExecution = {
          id,
          policyId: policy.id,
          policyName: policy.name,
          trigger: candidate.trigger,
          action: policy.action,
          caseSlug: String(fm.case_slug ?? fm.caseSlug ?? "") || undefined,
          intakeSlug: candidate.trigger === "new_intake" ? candidate.page.slug : undefined,
          executedAt: new Date().toISOString(),
          status: "failed",
        };

        try {
          const response = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(
              buildApprovalGatedJob(policy, prompt, capCents - budget.spentCents)
            ),
            signal: AbortSignal.timeout(15_000),
          });
          const data = response.ok
            ? ((await response.json()) as { jobId?: number; id?: number })
            : {};
          execution.jobId = data.jobId ?? data.id;
          execution.status = execution.jobId ? "submitted" : "failed";
          if (!response.ok) execution.error = `Engine returned ${response.status}`;
        } catch (error) {
          execution.error = error instanceof Error ? error.message : String(error);
        }
        executions.push(execution);
        await persistExecution(execution, headers).catch(() => undefined);
      }
      if (budgetExhausted) break;
    }
    if (budgetExhausted) break;
  }

  return {
    totalExecutions: executions.length,
    budgetSpentCents: budget.spentCents,
    budgetExhausted,
    executions,
  };
}

/**
 * POST /api/cron/autopilot — runs once per firm that opted in.
 *
 * Before 2026-09-25 this ran ONCE against a hardcoded "system" brain, which
 * is not any real firm's data — even once the method bug (GET vs POST, see
 * the crontab entry) was fixed, no firm's cases were ever actually scanned.
 * Now: every firm with kanzleiSettings.autopilotEnabled === true gets its
 * own scan against its own brain and its own nightly budget
 * (AUTOPILOT_NIGHTLY_BUDGET_CENTS per firm, not shared). Opt-in, default
 * off — a firm that never turned this on sees nothing change. Fail-closed:
 * a firm whose settings can't be read is skipped this run, not assumed
 * enabled or disabled.
 */
async function autopilotHandler(_req: NextRequest): Promise<Response> {
  if (process.env.DISABLE_AUTOPILOT_CRON === "true") {
    return NextResponse.json({ disabled: true, reason: "DISABLE_AUTOPILOT_CRON" });
  }

  const capCents = Math.max(
    0,
    Number.parseInt(process.env.AUTOPILOT_NIGHTLY_BUDGET_CENTS ?? "100", 10) || 0
  );

  const recipientsByBrain = await getRecipientsByBrain();
  let brainsChecked = 0;
  let brainsEnabled = 0;
  let brainsSkippedUnreadable = 0;
  let totalExecutions = 0;
  const perBrain: Array<{
    brainId: string;
    executions: number;
    budgetSpentCents: number;
    budgetExhausted: boolean;
  }> = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    let enabled: boolean;
    try {
      const settings = await loadKanzleiSettingsForBrain(brainId);
      enabled = settings.autopilotEnabled === true;
    } catch (err) {
      if (err instanceof KanzleiSettingsUnavailableError) {
        brainsSkippedUnreadable++;
        log.warn(`[autopilot] brain ${brainId}: settings unreadable, skipped this run`, {
          error: err.message,
        });
        continue;
      }
      throw err;
    }
    if (!enabled) continue;

    brainsEnabled++;
    const result = await runForBrain(brainId, capCents);
    totalExecutions += result.totalExecutions;
    perBrain.push({
      brainId,
      executions: result.totalExecutions,
      budgetSpentCents: result.budgetSpentCents,
      budgetExhausted: result.budgetExhausted,
    });
  }

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    brainsChecked,
    brainsEnabled,
    brainsSkippedUnreadable,
    totalExecutions,
    perBrain,
  });
}

export const POST = createCronHandler(autopilotHandler, { maxDuration: 300 });
