import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { broadcastDeadlineAlert } from "@/lib/realtime-bus";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatch";
import { logger } from "@/lib/logger";

const log = logger("deadline-alerts");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DeadlinePage {
  slug: string;
  frontmatter: {
    case_slug?: string;
    due_date?: string;
    status?: string;
    urgency?: string;
    brain_id?: string;
  };
}

/**
 * Resolve the brainId for a deadline by looking up the associated case.
 * Falls back to "system" if the case cannot be found or has no brain_id.
 */
async function resolveBrainIdFromCase(
  caseSlug: string | undefined,
  headers: HeadersInit
): Promise<string> {
  if (!caseSlug) return "system";
  try {
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (caseRes.ok) {
      const caseData = await caseRes.json();
      const fm = caseData.frontmatter ?? {};
      if (fm.brain_id && typeof fm.brain_id === "string") return fm.brain_id;
    }
  } catch {
    // best-effort
  }
  return "system";
}

async function deadlineAlertHandler(_req: NextRequest): Promise<Response> {
  const headers = engineHeadersForBrain("system");

  // Fetch all deadline pages
  const params = new URLSearchParams({ type: "deadline", limit: "200" });
  const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch deadlines" }, { status: 500 });
  }

  const data = await res.json();
  const deadlines = (Array.isArray(data) ? data : (data.pages ?? [])) as DeadlinePage[];

  const now = new Date();
  const alertThresholds = [
    { hours: 24, urgency: "urgent" as const },
    { hours: 72, urgency: "warning" as const },
    { hours: 168, urgency: "normal" as const },
  ];

  const alertsSent: Array<{
    caseSlug: string;
    deadlineId: string;
    urgency: string;
    dueDate: string;
    brainId: string;
  }> = [];

  for (const deadline of deadlines) {
    const fm = deadline.frontmatter;
    if (!fm.due_date || fm.status === "completed") continue;

    const dueDate = new Date(fm.due_date);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Check if deadline is within alert thresholds
    for (const threshold of alertThresholds) {
      if (hoursUntilDue <= threshold.hours && hoursUntilDue > threshold.hours - 24) {
        // Resolve actual brainId from case_slug or deadline frontmatter
        const brainId = fm.brain_id ?? (await resolveBrainIdFromCase(fm.case_slug, headers));

        broadcastDeadlineAlert(brainId, {
          caseSlug: fm.case_slug ?? "unknown",
          deadlineId: deadline.slug,
          urgency: threshold.urgency,
          dueDate: fm.due_date,
        });

        // Fire outgoing webhook for critical (urgent) deadlines
        if (threshold.urgency === "urgent") {
          try {
            await dispatchWebhookEvent("deadline.critical", {
              case_slug: fm.case_slug ?? "unknown",
              deadline_id: deadline.slug,
              due_date: fm.due_date,
              urgency: threshold.urgency,
              brain_id: brainId,
            });
          } catch {
            // best-effort — webhook delivery should not block alert processing
          }
        }

        alertsSent.push({
          caseSlug: fm.case_slug ?? "unknown",
          deadlineId: deadline.slug,
          urgency: threshold.urgency,
          dueDate: fm.due_date,
          brainId,
        });
        break; // Only send one alert per deadline per run
      }
    }
  }

  log.info("Deadline alerts processed", { total: alertsSent.length });

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    totalAlerts: alertsSent.length,
    alerts: alertsSent,
  });
}

export const POST = createCronHandler(deadlineAlertHandler, { maxDuration: 60 });
