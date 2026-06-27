import { NextResponse } from "next/server";
import { engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { fetchPages, getRecipientsByBrain } from "@/lib/cron-utils";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";

async function updateAppointmentReminderSent(brainId: string, slug: string): Promise<void> {
  const headers = engineHeadersForBrain(brainId);
  try {
    // Engine merge-update (no PATCH/If-Match route). Setting the reminder flag is
    // idempotent, so last-writer-wins is acceptable.
    await enginePatchPage(
      headers,
      {
        slug,
        frontmatter: { reminder_sent: true, reminder_sent_at: new Date().toISOString() },
      },
      { timeoutMs: 30_000 }
    );
  } catch {
    // Non-blocking
  }
}

export const GET = createCronHandler(async () => {
  const now = new Date();
  const recipientsByBrain = await getRecipientsByBrain();
  const identityStore = getWhatsAppIdentityStore();

  let brainsChecked = 0;
  let totalSent = 0;
  const errors: string[] = [];

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const appointments = await fetchPages(brainId, "appointment", 500);
    if (appointments.length === 0) continue;

    for (const appt of appointments) {
      const fm = appt.frontmatter ?? {};
      const reminderSent = fm.reminder_sent === true;
      const status = String(fm.status ?? "");
      if (reminderSent || status === "cancelled" || status === "completed") continue;

      const reminderAtStr = String(fm.reminder_at ?? "");
      if (!reminderAtStr) continue;

      const reminderAt = new Date(reminderAtStr);
      if (reminderAt > now) continue;

      const date = String(fm.date ?? "");
      const time = String(fm.time ?? "");
      const title = String(fm.title ?? appt.title ?? "Termin");
      const location = String(fm.location ?? "");
      const caseTitle = String(fm.case_title ?? "");

      const bodyLines = [
        `📅 Termin-Erinnerung:`,
        `Datum: ${date}`,
        `Uhrzeit: ${time}`,
        `Thema: ${title}`,
        location ? `Ort: ${location}` : "",
        caseTitle ? `Akte: ${caseTitle}` : "",
        "",
        "Bitte rechtzeitig vorbereiten.",
      ].filter(Boolean);

      const messageBody = bodyLines.join("\n");

      // Collect all WhatsApp identities for this brain's orgs
      const orgIds = new Set<string>();
      for (const recipient of recipients) {
        if (recipient.orgId) orgIds.add(recipient.orgId);
      }
      const allIdentities: Array<{ userId: string; phone: string }> = [];
      for (const orgId of orgIds) {
        try {
          const identities = await identityStore.listByOrg(orgId);
          for (const id of identities) {
            if (id.phone && id.userId) {
              allIdentities.push({ userId: id.userId, phone: id.phone });
            }
          }
        } catch {
          // Non-blocking
        }
      }

      // Send WhatsApp reminder to each recipient with a linked identity
      for (const recipient of recipients) {
        const identityEntry = allIdentities.find((id) => id.userId === recipient.id);
        if (!identityEntry) continue;

        try {
          await sendProactiveMessage({
            to: normalizePhone(identityEntry.phone),
            brainId,
            scope: "appointment_reminder",
            freeform: messageBody,
            urgent: true,
          });
          totalSent++;
        } catch (err) {
          errors.push(
            `Failed to send reminder to ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Mark reminder as sent
      await updateAppointmentReminderSent(brainId, appt.slug);
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  });
});
