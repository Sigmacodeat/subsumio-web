import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { batchFetchPages, getRecipientsByBrain, mapWithConcurrency } from "@/lib/cron-utils";
import { engineHeadersForBrain } from "@/lib/engine";
import {
  applyAgentTaskResult,
  buildAgentTaskPrompt,
  collectPendingAgentTasks,
} from "@/lib/agent-tasks";
import { engineComplete, isEngineLLMAvailable } from "@/lib/engine-llm";
import { ENGINE_URL } from "@/lib/engine";
import { logger } from "@/lib/logger";
import type { TaskEntry } from "@/lib/legal-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = logger("cron/agent-tasks");

/** Pro Lauf maximal so viele Agenten-Tasks — Budget-Schutz. */
const MAX_TASKS_PER_RUN = 10;

/**
 * WP-7.42 — Agent-Tasks: Aufgaben mit assigneeType "agent" und
 * agentStatus "pending" werden vom Agenten mit Aktenkontext bearbeitet.
 * Ergebnis landet als `agentResult` + `needs_review` in der Akte —
 * anwaltliche Prüfung bleibt Pflicht.
 */
export const GET = createCronHandler(async () => {
  if (!isEngineLLMAvailable()) {
    return NextResponse.json({ skipped: "engine_llm_unavailable" });
  }
  const recipientsByBrain = await getRecipientsByBrain();
  let processed = 0;
  let failed = 0;

  for (const brainId of recipientsByBrain.keys()) {
    if (processed >= MAX_TASKS_PER_RUN) break;
    const headers = engineHeadersForBrain(brainId);
    const { case: cases } = await batchFetchPages(brainId, ["case"], 200);
    const pending = collectPendingAgentTasks(cases);
    if (pending.length === 0) continue;

    // Pro Akte einmal patchen — Tasks derselben Akte sammeln.
    const byCase = new Map<string, typeof pending>();
    for (const p of pending) {
      const list = byCase.get(p.caseSlug) ?? [];
      list.push(p);
      byCase.set(p.caseSlug, list);
    }

    await mapWithConcurrency(
      [...byCase.entries()],
      async ([slug, items]) => {
        const page = cases.find((c) => c.slug === slug);
        if (!page) return;
        let tasks = Array.isArray(page.frontmatter?.tasks)
          ? ([...page.frontmatter.tasks] as TaskEntry[])
          : [];
        let dirty = false;
        for (const item of items) {
          if (processed >= MAX_TASKS_PER_RUN) break;
          const { system, prompt } = buildAgentTaskPrompt(item.task, page);
          const result = await engineComplete(headers, {
            purpose: "agent_task",
            tier: "reasoning",
            system,
            prompt,
            maxTokens: 1_200,
            timeoutMs: 30_000,
          });
          if (result?.text?.trim()) {
            tasks = applyAgentTaskResult(tasks, item.task.id, result.text.trim());
            dirty = true;
            processed += 1;
          } else {
            failed += 1;
            log.warn("agent task produced no result", { slug, taskId: item.task.id });
          }
        }
        if (!dirty) return;
        const patch = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ slug, merge: true, frontmatter: { tasks } }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!patch.ok) {
          failed += 1;
          log.warn("agent task patch failed", { slug, status: patch.status });
        }
      },
      3
    );
  }

  return NextResponse.json({ processed, failed });
});
