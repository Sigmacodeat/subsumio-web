import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { batchFetchPages, getRecipientsByBrain } from "@/lib/cron-utils";
import { broadcastDeadlineAlert } from "@/lib/realtime-bus";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import {
  alertSentFields,
  collectDueAlerts,
  markCaseAlerts,
  type AlertDeadline,
  type AlertPage,
  type DueAlert,
} from "@/lib/deadline-alerts";
import { logger } from "@/lib/logger";

const log = logger("deadline-alerts");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Deadlines and matters of one firm. */
async function loadBrain(brainId: string): Promise<{ cases: AlertPage[]; deadlines: AlertPage[] }> {
  const pages = await batchFetchPages(brainId, ["legal_case", "legal_deadline"], 500);
  return {
    cases: (pages["legal_case"] ?? []) as unknown as AlertPage[],
    deadlines: (pages["legal_deadline"] ?? []) as unknown as AlertPage[],
  };
}

/** Record the sent stage, so the next run half an hour later stays quiet. */
async function markSent(brainId: string, items: DueAlert[], nowIso: string): Promise<void> {
  const headers = engineHeadersForBrain(brainId);

  for (const item of items) {
    if (item.ref.kind !== "page") continue;
    try {
      const path = item.ref.slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const page = (await res.json()) as { frontmatter?: AlertDeadline };
      await enginePatchPage(
        headers,
        {
          slug: item.ref.slug,
          frontmatter: alertSentFields(
            page.frontmatter ?? {},
            item.urgency,
            nowIso,
            item.unreviewedAi
          ),
        },
        { timeoutMs: 30_000 }
      );
    } catch {
      // One failed write must not stop the run — the stage simply fires again.
    }
  }

  // Deadlines inside a matter: re-read the matter and write only its deadline
  // list back, so documents or edits saved meanwhile are not overwritten.
  const byCase = new Map<string, DueAlert[]>();
  for (const item of items) {
    if (item.ref.kind !== "case") continue;
    const list = byCase.get(item.ref.caseSlug) ?? [];
    list.push(item);
    byCase.set(item.ref.caseSlug, list);
  }
  for (const [caseSlug, caseItems] of byCase) {
    try {
      const path = caseSlug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
      const current = Array.isArray(page.frontmatter?.deadlines)
        ? (page.frontmatter.deadlines as AlertDeadline[])
        : [];
      const { deadlines, changed } = markCaseAlerts(current, caseItems, nowIso);
      if (changed) {
        await enginePatchPage(
          headers,
          { slug: caseSlug, frontmatter: { deadlines } },
          {
            timeoutMs: 30_000,
          }
        );
      }
    } catch {
      // Same here: a failed write only means the alert repeats once.
    }
  }
}

/**
 * Live alerts for deadlines coming due — into the open dashboard, and as a
 * `deadline.critical` webhook for the ones inside 24 hours (reviewed
 * deadlines only; unreviewed AI suggestions stay in-app, labelled).
 *
 * Two faults fixed on 2026-09-20: the job read the "system" brain and
 * therefore never saw a firm's deadlines, and it had no memory, so every
 * 30-minute run resent the same alert. It now walks every firm's own brain
 * and records each stage on the deadline itself.
 */
async function deadlineAlertHandler(_req: NextRequest): Promise<Response> {
  const now = new Date();
  const nowIso = now.toISOString();
  const brains = [...(await getRecipientsByBrain()).keys()];

  let totalAlerts = 0;
  const perBrain: Array<{ brainId: string; alerts: number }> = [];

  for (const brainId of brains) {
    let items: DueAlert[] = [];
    try {
      const { cases, deadlines } = await loadBrain(brainId);
      items = collectDueAlerts(cases, deadlines, now);
    } catch (err) {
      log.warn("brain unreadable", { brainId, error: err instanceof Error ? err.message : err });
      continue;
    }
    if (items.length === 0) continue;

    for (const item of items) {
      broadcastDeadlineAlert(brainId, {
        caseSlug: item.caseSlug ?? "unknown",
        deadlineId: item.ref.kind === "page" ? item.ref.slug : `${item.ref.caseSlug}#${item.title}`,
        urgency: item.urgency,
        dueDate: item.dueDate,
        title: item.title,
        unreviewed: item.unreviewedAi,
        ...(item.label ? { label: item.label } : {}),
      });

      // External systems only hear about deadlines a lawyer has confirmed —
      // an unreviewed AI suggestion stays an in-app hint.
      if (item.urgency === "urgent" && !item.unreviewedAi) {
        try {
          await dispatchWebhookEvent("deadline.critical", {
            case_slug: item.caseSlug ?? "unknown",
            deadline_id:
              item.ref.kind === "page" ? item.ref.slug : `${item.ref.caseSlug}#${item.title}`,
            title: item.title,
            due_date: item.dueDate,
            urgency: item.urgency,
            brain_id: brainId,
          });
        } catch {
          // Webhook delivery must not block the alerts.
        }
      }
    }

    await markSent(brainId, items, nowIso);
    totalAlerts += items.length;
    perBrain.push({ brainId, alerts: items.length });
  }

  log.info("deadline alerts processed", { brains: brains.length, total: totalAlerts });

  return NextResponse.json({
    executedAt: nowIso,
    brainsChecked: brains.length,
    totalAlerts,
    perBrain,
  });
}

export const POST = createCronHandler(deadlineAlertHandler, { maxDuration: 60 });
