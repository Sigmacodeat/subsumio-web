// Admin mailbox — production inbox backed by the DB-backed mail store
// (src/lib/email/mailbox.ts). Receives via the Resend webhook, lists/replies
// via /api/email/*. In dev (no Postgres pool) it transparently reads the local
// .data/mailbox.json that `subsumio`'s dev catcher / dev-catch endpoint writes.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import {
  listMailMessages,
  getUnreadCounts,
  getMailSnippet,
  type MailFolder,
} from "@/lib/email/mailbox";
import { siteUrl } from "@/lib/mail";
import MailboxClient, { type MailMessageView } from "./MailboxClient";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata = { title: "Mailbox" };
export const dynamic = "force-dynamic";

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
  if (!me) redirect("/login?next=/dashboard/admin/mailbox");
  if (me.role !== "admin") redirect("/dashboard");

  let messages: MailMessageView[] = [];
  let unreadCounts: Record<string, number> = {};
  let loadError: string | null = null;
  try {
    const [rows, counts] = await Promise.all([
      listMailMessages(me, { limit: 100, folder: "inbox" }),
      getUnreadCounts(me),
    ]);
    unreadCounts = counts;
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
      folder: m.folder ?? (m.direction === "outbound" ? "sent" : "inbox"),
      isRead: m.isRead ?? false,
      snippet: getMailSnippet(m),
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const address = receivingAddress();
  const webhookUrl = `${siteUrl().replace(/\/$/, "")}/api/email/webhook/resend`;

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Mailbox" breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin", href: "/dashboard/admin" }, { label: "Mailbox" }]} />
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          <ArrowLeft size={14} /> Zum Admin
        </Link>
      </div>

      {loadError && loadError !== "mailbox_database_not_configured" && (
        <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          Mailbox konnte nicht geladen werden: {loadError}
        </div>
      )}

      <MailboxClient
        initialMessages={messages}
        initialUnreadCounts={unreadCounts as Record<MailFolder, number>}
        receivingAddress={address}
        webhookUrl={webhookUrl}
        mailConfigured={Boolean(process.env.RESEND_API_KEY)}
        inboundConfigured={Boolean(process.env.RESEND_WEBHOOK_SECRET)}
      />
    </div>
  );
}
