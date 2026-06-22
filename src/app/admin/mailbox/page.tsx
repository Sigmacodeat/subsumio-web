// Admin mailbox — production inbox backed by the DB-backed mail store
// (src/lib/email/mailbox.ts). Receives via the Resend webhook, lists/replies
// via /api/email/*. In dev (no Postgres pool) it transparently reads the local
// .data/mailbox.json that `subsumio`'s dev catcher / dev-catch endpoint writes.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import { listMailMessages } from "@/lib/email/mailbox";
import { siteUrl } from "@/lib/mail";
import MailboxClient, { type MailMessageView } from "./MailboxClient";

export const metadata = { title: "Mailbox" };
export const dynamic = "force-dynamic";

/** Derive the inbound receiving address from MAIL_REPLY_TO / MAIL_FROM. */
function receivingAddress(): string {
  const replyTo = process.env.MAIL_REPLY_TO?.trim();
  if (replyTo) {
    const m = replyTo.match(/<([^>]+)>/);
    return (m ? m[1] : replyTo).toLowerCase();
  }
  const from = (process.env.MAIL_FROM || "Subsumio <hello@subsum.io>").trim();
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).toLowerCase();
}

export default async function MailboxPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin/mailbox");
  if (me.role !== "admin") redirect("/dashboard");

  let messages: MailMessageView[] = [];
  let loadError: string | null = null;
  try {
    const rows = await listMailMessages(me, { limit: 100 });
    messages = rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      status: m.status,
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmails: m.toEmails,
      ccEmails: m.ccEmails,
      subject: m.subject,
      text: m.text,
      html: m.html,
      createdAt: m.createdAt,
      trackingStatus: m.trackingStatus,
      openCount: m.openCount,
      clickCount: m.clickCount,
      forwarded: m.forwarded,
      firstOpenedAt: m.firstOpenedAt,
      lastOpenedAt: m.lastOpenedAt,
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const address = receivingAddress();
  const webhookUrl = `${siteUrl().replace(/\/$/, "")}/api/email/webhook/resend`;

  return (
    <div data-tone="dark" className="min-h-screen px-6 py-10 [background:var(--mk-bg)]">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Mail size={18} className="brand-text" />
              <h1 className="text-2xl font-bold [color:var(--mk-text)]">Mailbox</h1>
            </div>
            <p className="text-sm [color:var(--mk-text-muted)]">
              Eingehende und gesendete E-Mails von Subsumio.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
          >
            <ArrowLeft size={14} /> Zum Admin
          </Link>
        </div>

        {loadError && loadError !== "mailbox_database_not_configured" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            Mailbox konnte nicht geladen werden: {loadError}
          </div>
        )}

        <MailboxClient
          initialMessages={messages}
          receivingAddress={address}
          webhookUrl={webhookUrl}
          mailConfigured={Boolean(process.env.RESEND_API_KEY)}
          inboundConfigured={Boolean(process.env.RESEND_WEBHOOK_SECRET)}
        />
      </div>
    </div>
  );
}
