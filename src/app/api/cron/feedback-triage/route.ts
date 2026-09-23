import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { sendMail } from "@/lib/mail";
import { createCronHandler } from "@/lib/api-handler";
import { filterNewIds } from "@/lib/caselaw-dedup";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import {
  detractorsSince,
  escalatedCaseSlugs,
  staffRecipients,
  DETRACTOR_MAX,
  type FeedbackPage,
} from "@/lib/nps-triage";
import { env } from "@/lib/env";

import { logger } from "@/lib/logger";
const log = logger("api/cron/feedback-triage");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/feedback-triage — NPS-Detraktor-Triage.
 *
 * Läuft täglich (supercronic). Für jede Kanzlei (Brain):
 *   1. Liest client_feedback-Pages (geschrieben von /api/portal/feedback)
 *   2. Filtert Detraktoren (Score ≤ 6) der letzten 48h
 *   3. Dedup via subsumio_caselaw_seen (Prefix "nps:") — jedes Feedback
 *      wird nur einmal gemeldet
 *   4. Mail an alle Brain-Nutzer mit Score, Kommentar und Akten-Link
 *
 * Bewusst Mail statt neuer Page-Typ: der Weg zur Akte ist ein Link,
 * kein weiterer Review-Schritt nötig.
 */

const LOOKBACK_MS = 48 * 3600 * 1000;
/** Wiederholte Kritik an derselben Akte innerhalb von 30 Tagen → Eskalation. */
const ESCALATION_WINDOW_MS = 30 * 24 * 3600 * 1000;
const ESCALATION_THRESHOLD = 2;

async function listFeedback(brainId: string): Promise<FeedbackPage[]> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=client_feedback&slug_prefix=${encodeURIComponent("feedback-")}&limit=500`,
      { headers: engineHeadersForBrain(brainId), signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : (data.pages ?? [])) as FeedbackPage[];
  } catch {
    return [];
  }
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";
  const recipientsByBrain = await getRecipientsByBrain();
  const cutoff = Date.now() - LOOKBACK_MS;

  let brainsChecked = 0;
  let detractorsFound = 0;
  let mailsSent = 0;

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    try {
      const pages = await listFeedback(brainId);
      const detractors = detractorsSince(pages, cutoff);
      if (detractors.length === 0) continue;

      // Eskalation: ≥2 Detraktoren derselben Akte innerhalb von 30 Tagen.
      const escalated = escalatedCaseSlugs(pages, ESCALATION_THRESHOLD, ESCALATION_WINDOW_MS);

      // Dedup: jede Feedback-Page wird nur einmal gemeldet.
      const fresh = await filterNewIds(
        brainId,
        "nps",
        detractors.map((p) => p.slug)
      );
      const freshDetractors = detractors.filter((_, i) => fresh.has(i));
      if (freshDetractors.length === 0) continue;
      detractorsFound += freshDetractors.length;

      const hasEscalation = freshDetractors.some((p) =>
        escalated.has(p.frontmatter?.case_slug ?? "")
      );

      const lines = freshDetractors.map((p) => {
        const fm = p.frontmatter ?? {};
        const caseUrl = `${appUrl}/dashboard/cases/${encodeURIComponent(fm.case_slug ?? "")}`;
        const comment = fm.comment?.trim() ? ` — „${fm.comment.trim().slice(0, 300)}"` : "";
        const flag = escalated.has(fm.case_slug ?? "") ? " [WIEDERHOLTE KRITIK]" : "";
        return `• Score ${fm.nps_score}/10 (${fm.submitted_at?.slice(0, 10) ?? "?"})${comment}${flag}\n  Akte: ${caseUrl}`;
      });

      const subject = hasEscalation
        ? `[Subsumio] ESKALATION: wiederholte kritische Feedbacks (${freshDetractors.length} neu)`
        : `[Subsumio] ${freshDetractors.length} kritische(s) Mandanten-Feedback(s)`;
      const text =
        `Neue Bewertung(en) mit Score ≤ ${DETRACTOR_MAX} im Mandantenportal:\n\n` +
        lines.join("\n") +
        (hasEscalation
          ? `\n\nACHTUNG: Mindestens eine Akte hat ≥${ESCALATION_THRESHOLD} kritische Feedbacks in 30 Tagen — bitte kurzfristig klären.`
          : "") +
        `\n\nAuswertung: ${appUrl}/dashboard/client-portal`;

      // Kritisches Mandanten-Feedback geht nur an Anwälte/Admins —
      // nicht an client_viewer-Rollen.
      for (const user of staffRecipients(recipients)) {
        const r = await sendMail({ to: user.email, subject, text });
        if (r.sent) mailsSent++;
      }
    } catch (err) {
      log.error(
        `[feedback-triage] brain ${brainId} failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    detractors_found: detractorsFound,
    mails_sent: mailsSent,
  });
});
