import { NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { createCronHandler } from "@/lib/api-handler";
import {
  type EnginePage,
  activeStaffRecipients,
  fetchPages,
  getRecipientsByBrain,
  createDailyDedup,
  matterPermissionsBySlug,
  mayReceiveMatterNotice,
} from "@/lib/cron-utils";
import { env } from "@/lib/env";
import { engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createRetentionNotification } from "@/lib/comments";
import { classifyRetention, isRetentionCandidate, yearsSinceClosure } from "@/lib/legal/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/retention — tägliche Aufbewahrungsfrist-Prüfung.
 *
 * Läuft als supercronic Cron (Netcup) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/retention
 *
 * Pro Brain (Kanzlei): sammelt geschlossene Akten (legal_case mit closed_at),
 * berechnet Jahre seit Abschluss und benachrichtigt bei:
 *   - ≥ 7 Jahren: "Prüfung empfohlen" (Aufbewahrungsfrist §§ 131, 132 BAO abgelaufen)
 *   - ≥ 10 Jahren: "Löschfällig" (3 Jahre Karenz nach Fristablauf)
 *
 * Empfänger: nur aktive Kanzlei-Mitarbeiter; jede Akte nur an Personen, die
 * sie öffnen dürfen (Sichtbarkeit, Team, Freigaben, Ethical Wall). Jede
 * Person bekommt eine eigene Mail mit genau ihren Akten.
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

async function fetchClosedCases(brainId: string): Promise<EnginePage[]> {
  const pages = await fetchPages(brainId, "legal_case", 500);
  // Closed matters; Legal Hold is excluded from retention/deletion.
  return pages.filter((p) => isRetentionCandidate(p.frontmatter));
}

const alreadyNotifiedToday = createDailyDedup("subsumio_retention_notify_log");

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let mailsSent = 0;
  let itemsFound = 0;

  for (const [brainId, brainUsers] of recipientsByBrain) {
    brainsChecked++;
    const recipients = activeStaffRecipients(brainUsers);
    if (recipients.length === 0) continue;
    const closedCases = await fetchClosedCases(brainId);
    // Every item IS a closed matter, so its access rules come from the same read.
    const matterPermissions = matterPermissionsBySlug(closedCases);

    const items: RetentionItem[] = [];
    for (const page of closedCases) {
      const fm = page.frontmatter ?? {};
      const closedAt = String(fm.closed_at ?? "");
      if (!closedAt) continue;
      const action = classifyRetention(closedAt);
      if (!action) continue;
      const years = Math.round(yearsSinceClosure(closedAt) * 10) / 10;
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

    // In-app notifications + frontmatter marking (merged from retention-check)
    const headers = engineHeadersForBrain(brainId);
    for (const item of items) {
      try {
        const fm = closedCases.find((p) => p.slug === item.slug)?.frontmatter ?? {};
        const lastNotified = fm.retention_notified_at
          ? new Date(String(fm.retention_notified_at))
          : null;
        const daysSinceNotification = lastNotified
          ? Math.floor((Date.now() - lastNotified.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity;
        if (daysSinceNotification < 30) continue;

        for (const user of recipients) {
          if (!mayReceiveMatterNotice(user, item.slug, matterPermissions)) continue;
          try {
            await createRetentionNotification({
              userId: user.id,
              brainId,
              caseSlug: item.slug,
              caseTitle: item.title,
              caseNumber: item.caseNumber,
              action: item.action,
              yearsSinceClosure: item.yearsSinceClosure,
            });
          } catch {
            // non-fatal — email is still sent below
          }
        }

        await enginePatchPage(
          headers,
          {
            slug: item.slug,
            frontmatter: {
              retention_notified_at: new Date().toISOString(),
              retention_action: item.action,
              retention_years: item.yearsSinceClosure,
            },
          },
          { timeoutMs: 10_000 }
        );
      } catch {
        // non-fatal — email is still sent below
      }
    }

    if (await alreadyNotifiedToday(brainId)) continue;

    for (const user of recipients) {
      const visible = items.filter((i) => mayReceiveMatterNotice(user, i.slug, matterPermissions));
      if (visible.length === 0) continue;
      const { subject, text } = renderRetentionDigest(visible, appUrl);
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

/** One person's digest — only the matters they may see. */
function renderRetentionDigest(
  items: RetentionItem[],
  appUrl: string
): { subject: string; text: string } {
  const toDelete = items.filter((i) => i.action === "delete");
  const toReview = items.filter((i) => i.action === "review");

  const parts: string[] = [];
  if (toDelete.length > 0) {
    parts.push("🔴 LÖSCHFÄLLIG (≥ 10 Jahre nach Abschluss):");
    for (const i of toDelete) {
      parts.push(
        `  • ${i.caseNumber} — ${i.title} (geschlossen ${i.closedAt}, ${i.yearsSinceClosure} J.)`
      );
    }
    parts.push("");
  }
  if (toReview.length > 0) {
    parts.push("🟡 PRÜFUNG EMPFOHLEN (≥ 7 Jahre nach Abschluss, §§ 131, 132 BAO):");
    for (const i of toReview) {
      parts.push(
        `  • ${i.caseNumber} — ${i.title} (geschlossen ${i.closedAt}, ${i.yearsSinceClosure} J.)`
      );
    }
    parts.push("");
  }
  parts.push(`Löschfristen-Übersicht: ${appUrl}/dashboard/compliance/retention`);
  parts.push("");
  parts.push("Fertigen Sie vor der Löschung stets eine Sicherungskopie an.");

  const subject = `📦 Aufbewahrungsfristen: ${toDelete.length} löschfällig, ${toReview.length} zu prüfen`;
  return { subject, text: parts.join("\n") };
}
