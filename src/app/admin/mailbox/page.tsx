// Admin mailbox — production inbox backed by the DB-backed mail store
// (src/lib/email/mailbox.ts). Receives via the Resend webhook, lists/replies
// via /api/email/*. In dev (no Postgres pool) it transparently reads the local
// .data/mailbox.json that `gbrain`'s dev catcher / dev-catch endpoint writes.

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
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const address = receivingAddress();
  const webhookUrl = `${siteUrl().replace(/\/$/, "")}/api/email/webhook/resend`;

  return (
    <div data-tone="dark" className="min-h-screen bg-[#06060f] px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail size={18} className="brand-text" />
              <h1 className="text-2xl font-bold text-[#e8e8f0]">Mailbox</h1>
            </div>
            <p className="text-sm text-[#8888aa]">Eingehende und gesendete E-Mails von Subsumio.</p>
          </div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-[#8888aa] hover:text-[#e8e8f0]">
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
