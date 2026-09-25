import { z } from "zod";
import { NextResponse } from "next/server";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { revokeAllSessions } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { sendMail } from "@/lib/mail";
import { logUserAudit } from "@/lib/audit-user";

import { logger } from "@/lib/logger";
const log = logger("api/auth/email/confirm-change");

const confirmSchema = z.object({
  token: z.string().min(10).max(2048),
});

/**
 * POST /api/auth/email/confirm-change
 *
 * Second half of the OWASP email-change flow. The signed token is the only
 * proof needed (it was mailed to the NEW address, so clicking the link
 * proves control of that mailbox) — the caller need not be signed in.
 *
 * On success the registered email is swapped and ALL sessions are revoked:
 * every session token embeds the old email, so none of them may outlive
 * the change. The user signs in again with the new address.
 */
export const POST = createPublicHandler(
  {
    body: confirmSchema,
    rateLimitKey: (req) => `email-confirm:ip:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 15 * 60_000,
  },
  async (_req, body) => {
    const payload = await verifyActionToken(body.token, "email_change");
    if (!payload || !payload.email) {
      return apiError(
        "invalid_token",
        "Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.",
        400
      );
    }
    const newEmail = payload.email;

    const store = getStore();
    const user = await store.getById(payload.uid);
    if (!user) {
      return apiError("invalid_token", "Der Bestätigungslink ist ungültig.", 400);
    }

    // Single-use enforcement: the bind covers the old+new pair, so a token
    // whose change was already applied (or whose account email moved on)
    // no longer matches.
    const expectedBind = await bindFragment(`${user.id}:${user.email}:${newEmail}`);
    if (payload.bind !== expectedBind) {
      return apiError(
        "invalid_token",
        "Der Bestätigungslink wurde bereits verwendet oder ist nicht mehr gültig.",
        400
      );
    }

    // Re-check availability — another account may have taken the address
    // between request and confirm.
    const existing = await store.getByEmail(newEmail);
    if (existing && existing.id !== user.id) {
      return apiError(
        "email_taken",
        "Diese E-Mail-Adresse wird inzwischen von einem anderen Konto verwendet.",
        409
      );
    }

    const oldEmail = user.email;
    const updated = await store.update(user.id, { email: newEmail });
    if (!updated) {
      return apiError("user_not_found", "Benutzer nicht gefunden.", 404);
    }

    // Every issued session embeds the old email — revoke them all so none
    // outlives the identity change (the session model has no email refresh).
    await revokeAllSessions(user.id);
    void logUserAudit("user.email_changed", "user", updated, {
      entityId: user.id,
      details: { oldDomain: oldEmail.split("@")[1] ?? "", newDomain: newEmail.split("@")[1] ?? "" },
    });

    // Confirmation notice → old address (OWASP notification step).
    const lang = user.locale === "de" ? "de" : "en";
    void sendMail({
      to: oldEmail,
      subject: lang === "de" ? "Subsumio — E-Mail-Adresse geändert" : "Subsumio — e-mail changed",
      text:
        lang === "de"
          ? `Guten Tag ${user.name},\n\ndie E-Mail-Adresse Ihres Subsumio-Kontos wurde auf ${newEmail} geändert. Alle bestehenden Anmeldungen wurden beendet.\n\nFalls Sie das nicht waren, wenden Sie sich bitte umgehend an Ihre Kanzleiverwaltung und an support@subsum.io.\n\n— Subsumio`
          : `Hi ${user.name},\n\nthe e-mail address of your Subsumio account was changed to ${newEmail}. All existing sessions were signed out.\n\nIf this wasn't you, please contact your firm administrator and support@subsum.io immediately.\n\n— Subsumio`,
    }).catch((err) =>
      log.warn("[email-change] old-address notice failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    );

    return NextResponse.json({ ok: true });
  }
);
