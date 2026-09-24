import { z } from "zod";
import { NextResponse } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { verifyPassword } from "@/lib/auth/password";
import { signActionToken, bindFragment, EMAIL_CHANGE_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { sendMail, siteUrl } from "@/lib/mail";
import { env } from "@/lib/env";

import { logger } from "@/lib/logger";
const log = logger("api/auth/email/request-change");

const requestSchema = z.object({
  newEmail: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

/**
 * POST /api/auth/email/request-change
 *
 * OWASP change-of-email flow: re-authenticate with the password, then send
 * a single-use confirm link to the NEW address and a notification-only mail
 * to the still-current address. The account's registered email is not
 * touched until the link is confirmed.
 */
export const POST = createHandler(
  {
    action: "auth.email_change",
    rateTier: "standard",
    body: requestSchema,
    audit: (ctx) => ({
      action: "user.email_change_requested",
      entityType: "user",
      entityId: ctx.user.id,
    }),
  },
  async (ctx, body) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "Benutzer nicht gefunden.", 404);

    // Re-authentication — an unattended unlocked session must not be enough
    // to redirect the account's identity address.
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      return apiError("invalid_password", "Das Passwort ist nicht korrekt.", 403);
    }

    const newEmail = body.newEmail.trim().toLowerCase();
    if (newEmail === user.email.toLowerCase()) {
      return apiError("same_email", "Das ist bereits Ihre aktuelle E-Mail-Adresse.", 400);
    }
    const existing = await store.getByEmail(newEmail);
    if (existing) {
      return apiError(
        "email_taken",
        "Diese E-Mail-Adresse wird bereits von einem anderen Konto verwendet.",
        409
      );
    }

    // Bind ties the token to the current+proposed pair — it dies the moment
    // the change is applied (single-use without server-side storage).
    const token = await signActionToken(
      {
        uid: user.id,
        purpose: "email_change",
        bind: await bindFragment(`${user.id}:${user.email}:${newEmail}`),
        email: newEmail,
      },
      EMAIL_CHANGE_TOKEN_TTL_SECONDS
    );
    const lang = user.locale === "de" ? "de" : "en";
    const confirmUrl = `${siteUrl()}${lang === "en" ? "/de" : "/at"}/email-bestaetigen?token=${encodeURIComponent(token)}`;

    // 1) Confirm link → NEW address (proves control of the mailbox).
    const confirmResult = await sendMail({
      to: newEmail,
      subject:
        lang === "de"
          ? "Subsumio — E-Mail-Adresse bestätigen"
          : "Subsumio — confirm your e-mail address",
      text:
        lang === "de"
          ? `Guten Tag,\n\nfür Ihr Subsumio-Konto wurde die Änderung der E-Mail-Adresse auf diese Adresse beantragt.\n\nLink (1 Stunde gültig):\n${confirmUrl}\n\nFalls Sie das nicht beantragt haben, können Sie diese Nachricht ignorieren.\n\n— Subsumio`
          : `Hello,\n\na change of the e-mail address for your Subsumio account to this address was requested.\n\nLink (valid for 1 hour):\n${confirmUrl}\n\nIf you did not request this, you can ignore this message.\n\n— Subsumio`,
    });
    if (!confirmResult.sent) {
      // Dev convenience, same pattern as /api/auth/forgot — without a mail
      // provider the confirm link comes back in the response so local and
      // E2E testing works end to end. NEVER in production.
      if (env("NODE_ENV") !== "production") {
        return NextResponse.json({ ok: true, devConfirmUrl: confirmUrl });
      }
      log.error("[email-change] confirm mail failed", { error: confirmResult.error });
      return apiError(
        "mail_failed",
        "Die Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.",
        502
      );
    }

    // 2) Notification-only mail → OLD address (OWASP: unexpected-change alert).
    void sendMail({
      to: user.email,
      subject:
        lang === "de"
          ? "Subsumio — Änderung der E-Mail-Adresse beantragt"
          : "Subsumio — e-mail change requested",
      text:
        lang === "de"
          ? `Guten Tag ${user.name},\n\nfür Ihr Konto wurde die Änderung der E-Mail-Adresse auf ${newEmail} beantragt. Die Änderung wird erst wirksam, wenn sie über den Link an der neuen Adresse bestätigt wird.\n\nFalls Sie das nicht beantragt haben, wenden Sie sich bitte umgehend an Ihre Kanzleiverwaltung und ändern Sie Ihr Passwort.\n\n— Subsumio`
          : `Hi ${user.name},\n\na change of the e-mail address for your account to ${newEmail} was requested. The change only takes effect once it is confirmed via the link sent to the new address.\n\nIf you did not request this, please contact your firm administrator and change your password immediately.\n\n— Subsumio`,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }
);
