import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { createCronHandler } from "@/lib/api-handler";
import {
  type EnginePage,
  fetchPages,
  getRecipientsByBrain,
  createDailyDedup,
} from "@/lib/cron-utils";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/retention — tägliche Aufbewahrungsfrist-Prüfung.
 *
 * Läuft als supercronic Cron (Hetzner) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/retention
 *
 * Pro Brain (Kanzlei): sammelt geschlossene Akten (legal_case mit closed_at),
 * berechnet Jahre seit Abschluss und benachrichtigt bei:
 *   - ≥ 6 Jahren: "Prüfung empfohlen" (§ 147 AO Frist abgelaufen)
 *   - ≥ 10 Jahren: "Löschfällig" (§ 50 BRAO Frist abgelaufen)
 *
 * Dedupe: maximal eine Mail pro Brain pro Kalendertag.
 */

interface RetentionItem {
  slug: string;
  title: string;
  caseNumber: string;
  closedAt: string;
  yearsSinceClosure: number;
  action: "review" | "delete";
}

const REVIEW_YEARS = 6;
const DELETE_YEARS = 10;

async function fetchClosedCases(brainId: string): Promise<EnginePage[]> {
  const pages = await fetchPages(brainId, "legal_case", 500);
  return pages.filter((p) => {
    const fm = p.frontmatter ?? {};
    return fm.closed_at || fm.status === "closed";
  });
}

function classifyRetention(closedAt: string): RetentionItem["action"] | null {
  const years = (Date.now() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (years >= DELETE_YEARS) return "delete";
  if (years >= REVIEW_YEARS) return "review";
  return null;
}

const alreadyNotifiedToday = createDailyDedup("subsumio_retention_notify_log");

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.eu";

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let mailsSent = 0;
  let itemsFound = 0;

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const closedCases = await fetchClosedCases(brainId);

    const items: RetentionItem[] = [];
    for (const page of closedCases) {
      const fm = page.frontmatter ?? {};
      const closedAt = String(fm.closed_at ?? "");
      if (!closedAt) continue;
      const action = classifyRetention(closedAt);
      if (!action) continue;
      const years =
        Math.round(
          ((Date.now() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24 * 365)) * 10
        ) / 10;
      items.push({
        slug: page.slug,
        title: page.title,
        caseNumber: String(fm.case_number ?? page.slug),
        closedAt: closedAt.slice(0, 10),
        yearsSinceClosure: years,
        action,
      });
    }

    if (items.length === 0) continue;
    itemsFound += items.length;

    if (await alreadyNotifiedToday(brainId)) continue;

    const toDelete = items.filter((i) => i.action === "delete");
    const toReview = items.filter((i) => i.action === "review");

    const parts: string[] = [];
    if (toDelete.length > 0) {
      parts.push("🔴 LÖSCHFÄLLIG (≥ 10 Jahre nach Abschluss, § 50 BRAO):");
      for (const i of toDelete) {
        parts.push(
          `  • ${i.caseNumber} — ${i.title} (geschlossen ${i.closedAt}, ${i.yearsSinceClosure} J.)`
        );
      }
      parts.push("");
    }
    if (toReview.length > 0) {
      parts.push("🟡 PRÜFUNG EMPFOHLEN (≥ 6 Jahre nach Abschluss, § 147 AO):");
      for (const i of toReview) {
        parts.push(
          `  • ${i.caseNumber} — ${i.title} (geschlossen ${i.closedAt}, ${i.yearsSinceClosure} J.)`
        );
      }
      parts.push("");
    }
    parts.push(`Löschfristen-Übersicht: ${appUrl}/dashboard/compliance/retention`);
    parts.push("");
    parts.push("Vor Löschung stets eine Datenträgerkopie anfertigen (§ 50 BRAO Abs. 2).");

    const subject = `📦 Aufbewahrungsfristen: ${toDelete.length} löschfällig, ${toReview.length} zu prüfen`;
    const text = parts.join("\n");

    for (const user of recipients) {
      const result = await sendMail({ to: user.email, subject, text });
      if (result.sent) mailsSent++;
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    items_found: itemsFound,
    mails_sent: mailsSent,
  });
});
