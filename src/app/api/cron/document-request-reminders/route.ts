import { NextResponse } from "next/server";
import { pageTypeOf } from "@/lib/types";
import { engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import {
  activeStaffRecipients,
  fetchPages,
  getRecipientsByBrain,
  matterPermissionsBySlug,
  recipientsForMatter,
} from "@/lib/cron-utils";
import type { MatterPermissions } from "@/lib/matter-access";
import { createDocumentRequestNotification } from "@/lib/comments";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { normalizePhone } from "@/lib/whatsapp/types";
import { issueRegisteredPortalLink } from "@/lib/portal-link-issue";
import { reminderDecision } from "@/lib/legal/document-request-reminder";

export const dynamic = "force-dynamic";

interface DocumentRequestItem {
  key: string;
  label: string;
  required: boolean;
  received_document_slug?: string;
  /** Client upload waiting for the firm's check — not reminded again. */
  submitted_document_slug?: string;
}

interface DocumentRequestFm {
  recipient_phone?: string;
  type: "document_request";
  case_slug: string;
  status: string;
  items: DocumentRequestItem[];
  sent_at?: string;
  reminder_sent_at?: string;
  reminder_count?: number;
  /** The request offers the portal; the link is issued fresh per message. */
  portal_link?: boolean;
  /** Older requests stored a link; it only tells that the portal was offered. */
  portal_url?: string;
  message_draft?: string;
}

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

  for (const [brainId, brainUsers] of recipientsByBrain) {
    const pages = await fetchPages(brainId, "document_request", 250);
    if (pages.length === 0) continue;
    // Active firm staff only; per matter only people who may see the matter.
    const staff = activeStaffRecipients(brainUsers);
    let matterPermissions: Map<string, MatterPermissions> | null = null;

    const pendingRequests = pages.filter((page) => {
      const fm = page.frontmatter as Record<string, unknown>;
      return (
        pageTypeOf(page) === "document_request" &&
        (fm.status === "sent" || fm.status === "partially_fulfilled") &&
        fm.sent_at
      );
    });

    report.total += pendingRequests.length;

    for (const page of pendingRequests) {
      const fm = page.frontmatter as unknown as DocumentRequestFm;
      const decision = reminderDecision(fm, now);
      if (!decision.shouldRemind) {
        report.skipped++;
        report.details.push({ slug: page.slug, reason: decision.reason });
        continue;
      }
      const { daysSinceSent } = decision;
      const reminderCount = fm.reminder_count ?? 0;
      // Items the client already uploaded (awaiting the firm's check) are
      // not requested again.
      const openItems = (fm.items ?? []).filter(
        (item) => !item.received_document_slug && !item.submitted_document_slug
      );

      try {
        const headers = engineHeadersForBrain(brainId);

        if (!matterPermissions) {
          // Unreadable matters → empty lookup → only admins are told (fail-closed).
          matterPermissions = matterPermissionsBySlug(
            await fetchPages(brainId, "legal_case", 10_000).catch(() => [])
          );
        }
        const recipients = recipientsForMatter(staff, fm.case_slug, matterPermissions);

        // In-app notifications to the staff who may see the matter
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

        // WhatsApp reminder — only to the number the request was made for.
        // (It used to go to the firm's first WhatsApp identity, i.e. to
        // whoever happened to be registered first.)
        const recipientPhone =
          typeof fm.recipient_phone === "string" ? normalizePhone(fm.recipient_phone) : "";
        if (recipientPhone) {
          try {
            const itemList = openItems.map((i) => `• ${i.label}`).join("\n");
            // A fresh, registered link — never one read back from storage.
            const portalLink =
              fm.portal_link === true || typeof fm.portal_url === "string"
                ? await issueRegisteredPortalLink({
                    headers,
                    brainId,
                    caseSlug: fm.case_slug,
                    createdBy: "system:document-request-reminder",
                    purpose: `document_request:${page.slug}`,
                  })
                : null;
            const freeform = `Erinnerung: Bitte laden Sie folgende Unterlagen hoch:\n${itemList}${
              portalLink ? `\n\nPortal: ${portalLink}` : ""
            }`;
            await sendProactiveMessage({
              to: recipientPhone,
              brainId,
              scope: "client_reminder",
              freeform,
            });
          } catch (err) {
            report.details.push({
              slug: page.slug,
              reason: `whatsapp_failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
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
