import { NextResponse } from "next/server";
import { engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { fetchPages, getRecipientsByBrain } from "@/lib/cron-utils";
import { createDocumentRequestNotification } from "@/lib/comments";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";

interface DocumentRequestItem {
  key: string;
  label: string;
  required: boolean;
  received_document_slug?: string;
}

interface DocumentRequestFm {
  type: "document_request";
  case_slug: string;
  status: string;
  items: DocumentRequestItem[];
  sent_at?: string;
  reminder_sent_at?: string;
  reminder_count?: number;
  portal_url?: string;
  message_draft?: string;
}

const REMINDER_INTERVAL_DAYS = 7;
const MAX_REMINDERS = 3;

export const GET = createCronHandler(async (_req) => {
  const now = new Date();
  const report = {
    total: 0,
    reminded: 0,
    skipped: 0,
    failed: 0,
    details: [] as Array<{ slug: string; reason: string }>,
  };

  const recipientsByBrain = await getRecipientsByBrain();

  for (const [brainId, recipients] of recipientsByBrain) {
    const pages = await fetchPages(brainId, "document_request", 250);
    if (pages.length === 0) continue;

    const pendingRequests = pages.filter((page) => {
      const fm = page.frontmatter as Record<string, unknown>;
      return (
        fm.type === "document_request" &&
        (fm.status === "sent" || fm.status === "partially_fulfilled") &&
        fm.sent_at
      );
    });

    report.total += pendingRequests.length;

    for (const page of pendingRequests) {
      const fm = page.frontmatter as unknown as DocumentRequestFm;
      const sentAt = fm.sent_at ? new Date(fm.sent_at) : null;
      if (!sentAt) {
        report.skipped++;
        report.details.push({ slug: page.slug, reason: "no_sent_at" });
        continue;
      }

      const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24));

      const lastReminder = fm.reminder_sent_at ? new Date(fm.reminder_sent_at) : null;
      const reminderCount = fm.reminder_count ?? 0;

      if (reminderCount >= MAX_REMINDERS) {
        report.skipped++;
        report.details.push({ slug: page.slug, reason: "max_reminders_reached" });
        continue;
      }

      if (lastReminder) {
        const daysSinceReminder = Math.floor(
          (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceReminder < REMINDER_INTERVAL_DAYS) {
          report.skipped++;
          report.details.push({ slug: page.slug, reason: "too_soon_after_last_reminder" });
          continue;
        }
      } else if (daysSinceSent < REMINDER_INTERVAL_DAYS) {
        report.skipped++;
        report.details.push({ slug: page.slug, reason: "too_soon_after_sent" });
        continue;
      }

      const openItems = (fm.items ?? []).filter((item) => !item.received_document_slug);

      if (openItems.length === 0) {
        report.skipped++;
        report.details.push({ slug: page.slug, reason: "no_open_items" });
        continue;
      }

      try {
        const headers = engineHeadersForBrain(brainId);

        // In-app notifications to all recipients
        for (const recipient of recipients) {
          try {
            await createDocumentRequestNotification({
              userId: recipient.id,
              brainId,
              caseSlug: fm.case_slug,
              caseTitle: fm.case_slug,
              requestSlug: page.slug,
              itemCount: openItems.length,
              isReminder: true,
              daysSinceSent,
            });
          } catch (err) {
            report.failed++;
            report.details.push({
              slug: page.slug,
              reason: `notification_failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }

        // WhatsApp reminder
        try {
          const identityStore = getWhatsAppIdentityStore();
          const orgId = recipients.find((r) => r.orgId)?.orgId;
          if (orgId) {
            const identities = await identityStore.listByOrg(orgId);
            const identity = identities[0];
            if (identity?.phone) {
              const phone = normalizePhone(identity.phone);
              const itemList = openItems.map((i) => `• ${i.label}`).join("\n");
              const freeform = `Erinnerung: Bitte laden Sie folgende Unterlagen hoch:\n${itemList}${
                fm.portal_url ? `\n\nPortal: ${fm.portal_url}` : ""
              }`;
              await sendProactiveMessage({
                to: phone,
                brainId,
                scope: "client_reminder",
                freeform,
              });
            }
          }
        } catch (err) {
          report.details.push({
            slug: page.slug,
            reason: `whatsapp_failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }

        // Update reminder tracking
        await enginePatchPage(
          headers,
          {
            slug: page.slug,
            frontmatter: {
              reminder_sent_at: now.toISOString(),
              reminder_count: reminderCount + 1,
              updated_at: now.toISOString(),
            },
          },
          { timeoutMs: 10_000 }
        );

        report.reminded++;
      } catch (err) {
        report.failed++;
        report.details.push({
          slug: page.slug,
          reason: `reminder_failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, report });
});
