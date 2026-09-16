"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Link2,
  Link2Off,
  Loader2,
  Mail,
  PenLine,
  Reply,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";

interface MailItem {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  caseSlug?: string | null;
  createdAt: string;
  isRead?: boolean;
}

interface ImportedEmail {
  id: string;
  name: string;
  uploadedAt: string;
  notes?: string;
}

interface Composer {
  mode: "new" | "reply";
  replyToId?: string;
  to: string;
  subject: string;
  text: string;
}

const COPY = {
  de: {
    title: "E-Mails zur Akte",
    address: "Mails an diese Adresse landen im Kanzlei-Posteingang:",
    newMail: "Neue E-Mail",
    filed: "Zur Akte abgelegt",
    filedEmpty: "Noch keine E-Mails zu dieser Akte",
    unassigned: "Nicht zugeordnete Eingänge",
    unassignedEmpty: "Keine offenen Eingänge",
    assign: "Dieser Akte zuordnen",
    unassign: "Zuordnung entfernen",
    reply: "Antworten",
    outlook: "Über Outlook abgelegt",
    to: "An",
    subject: "Betreff",
    message: "Nachricht",
    send: "Senden",
    cancel: "Abbrechen",
    sent: "E-Mail gesendet",
    queued: "E-Mail gespeichert, Versand ausstehend",
    failed: "Aktion fehlgeschlagen",
    loadFailed: "E-Mails konnten nicht geladen werden",
    noBody: "(kein Textinhalt)",
    from: "Von",
  },
  en: {
    title: "Matter e-mails",
    address: "Mail sent to this address arrives in the firm inbox:",
    newMail: "New e-mail",
    filed: "Filed to matter",
    filedEmpty: "No e-mails filed to this matter yet",
    unassigned: "Unassigned incoming mail",
    unassignedEmpty: "No open incoming mail",
    assign: "File to this matter",
    unassign: "Remove from matter",
    reply: "Reply",
    outlook: "Filed via Outlook",
    to: "To",
    subject: "Subject",
    message: "Message",
    send: "Send",
    cancel: "Cancel",
    sent: "E-mail sent",
    queued: "E-mail stored, delivery pending",
    failed: "Action failed",
    loadFailed: "E-mails could not be loaded",
    noBody: "(no text content)",
    from: "From",
  },
} as const;

/** Plain-text view of a message. HTML mail is never rendered as markup. */
function messageText(mail: MailItem): string {
  if (mail.text?.trim()) return mail.text;
  if (!mail.html) return "";
  return mail.html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function quote(mail: MailItem, lang: "de" | "en"): string {
  const date = new Date(mail.createdAt).toLocaleString(lang === "en" ? "en-GB" : "de-DE");
  const who = mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail;
  const body = messageText(mail)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\n${lang === "en" ? `On ${date}, ${who} wrote:` : `Am ${date} schrieb ${who}:`}\n${body}`;
}

export function EmailsTab() {
  const { lang } = useLang();
  const copy = COPY[lang === "en" ? "en" : "de"];
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const caseSlug = ctx.caseData?.slug ?? "";
  const caseNumber = ctx.caseData?.caseNumber ?? "";

  const [filed, setFiled] = useState<MailItem[]>([]);
  const [unassigned, setUnassigned] = useState<MailItem[]>([]);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [sending, setSending] = useState(false);

  const imported = useMemo<ImportedEmail[]>(
    () =>
      ((ctx.caseData?.documents ?? []) as unknown as Array<ImportedEmail & { type?: string }>)
        .filter((doc) => doc.type === "email")
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [ctx.caseData?.documents]
  );

  const load = useCallback(async () => {
    if (!caseSlug) return;
    setError(null);
    try {
      const [filedRes, inboxRes] = await Promise.all([
        fetch(`/api/email/messages?case=${encodeURIComponent(caseSlug)}&limit=200`),
        fetch("/api/email/messages?folder=inbox&limit=50"),
      ]);
      if (!filedRes.ok) throw new Error(String(filedRes.status));
      const filedBody = await filedRes.json();
      setFiled(filedBody.messages ?? []);
      setAddress(filedBody.address ?? "");
      if (inboxRes.ok) {
        const inboxBody = await inboxRes.json();
        setUnassigned(
          ((inboxBody.messages ?? []) as MailItem[]).filter(
            (m) => m.direction === "inbound" && !m.caseSlug
          )
        );
      }
    } catch {
      setError(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [caseSlug, copy.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await csrfFetch(`/api/email/messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : copy.failed);
      }
      await load();
    } catch (err) {
      addToast({ type: "error", title: err instanceof Error ? err.message : copy.failed });
    } finally {
      setBusyId(null);
    }
  }

  function openMail(mail: MailItem) {
    const next = openId === mail.id ? null : mail.id;
    setOpenId(next);
    if (next && mail.direction === "inbound" && !mail.isRead) void patch(mail.id, { isRead: true });
  }

  function startReply(mail: MailItem) {
    setComposer({
      mode: "reply",
      replyToId: mail.id,
      to: mail.direction === "inbound" ? mail.fromEmail : mail.toEmails.join(", "),
      subject: /^re:/i.test(mail.subject) ? mail.subject : `Re: ${mail.subject}`,
      text: quote(mail, lang === "en" ? "en" : "de"),
    });
  }

  function startNew() {
    setComposer({
      mode: "new",
      to: "",
      subject: caseNumber && caseNumber !== caseSlug ? `[${caseNumber}] ` : "",
      text: "",
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!composer) return;
    setSending(true);
    try {
      const payload = {
        to: composer.to
          .split(/[,;]/)
          .map((v) => v.trim())
          .filter(Boolean),
        subject: composer.subject.trim(),
        text: composer.text,
      };
      const res =
        composer.mode === "reply" && composer.replyToId
          ? await csrfFetch(`/api/email/messages/${encodeURIComponent(composer.replyToId)}/reply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await csrfFetch("/api/email/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, case_slug: caseSlug }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : copy.failed);
      }
      addToast({
        type: data.message?.status === "sent" ? "success" : "info",
        title: data.message?.status === "sent" ? copy.sent : copy.queued,
      });
      setComposer(null);
      await load();
    } catch (err) {
      addToast({ type: "error", title: err instanceof Error ? err.message : copy.failed });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-live="polite">
        <Loader2 size={20} className="brand-text animate-spin" />
      </div>
    );
  }

  const renderMail = (mail: MailItem, variant: "filed" | "unassigned") => {
    const open = openId === mail.id;
    const inbound = mail.direction === "inbound";
    const counterpart = inbound
      ? (mail.fromName ?? mail.fromEmail)
      : `${copy.to}: ${mail.toEmails.join(", ")}`;
    return (
      <li key={mail.id} className="border-b border-[color:var(--ds-border)] last:border-0">
        <button
          type="button"
          onClick={() => openMail(mail)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
        >
          {inbound ? (
            <ArrowDownLeft
              size={15}
              className="mt-0.5 shrink-0 text-[color:var(--ds-info-text)]"
              aria-hidden
            />
          ) : (
            <ArrowUpRight
              size={15}
              className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
              aria-hidden
            />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm text-[color:var(--ds-text)]",
                inbound && !mail.isRead && "font-semibold"
              )}
            >
              {mail.subject || "—"}
            </span>
            <span className="block truncate text-xs text-[color:var(--ds-text-muted)]">
              {counterpart}
            </span>
          </span>
          <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
            {new Date(mail.createdAt).toLocaleString(locale, {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </button>
        {open && (
          <div className="space-y-3 px-4 pb-4 pl-11">
            {inbound && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {copy.from}:{" "}
                {mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail}
              </p>
            )}
            <pre className="max-h-96 overflow-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-sans text-sm whitespace-pre-wrap text-[color:var(--ds-text)]">
              {messageText(mail) || copy.noBody}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => startReply(mail)}
              >
                <Reply size={13} /> {copy.reply}
              </Button>
              {variant === "unassigned" ? (
                <Button
                  size="sm"
                  className="gap-1.5"
                  loading={busyId === mail.id}
                  onClick={() => void patch(mail.id, { case_slug: caseSlug })}
                >
                  <Link2 size={13} /> {copy.assign}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  loading={busyId === mail.id}
                  onClick={() => void patch(mail.id, { case_slug: null })}
                >
                  <Link2Off size={13} /> {copy.unassign}
                </Button>
              )}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[color:var(--ds-text)]">
            <Mail size={16} aria-hidden /> {copy.title}
          </h2>
          {address && (
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {copy.address}{" "}
              <span className="font-mono text-[color:var(--ds-text)]">{address}</span>
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5" onClick={startNew}>
          <PenLine size={13} /> {copy.newMail}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
        >
          {error}
        </div>
      )}

      {composer && (
        <form
          onSubmit={send}
          className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {composer.mode === "reply" ? copy.reply : copy.newMail}
            </p>
            <button
              type="button"
              onClick={() => setComposer(null)}
              aria-label={copy.cancel}
              className="rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-to">{copy.to}</Label>
            <Input
              id="mail-to"
              type="text"
              inputMode="email"
              required
              value={composer.to}
              onChange={(e) => setComposer({ ...composer, to: e.target.value })}
              placeholder="mandant@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-subject">{copy.subject}</Label>
            <Input
              id="mail-subject"
              required
              value={composer.subject}
              onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-text">{copy.message}</Label>
            <Textarea
              id="mail-text"
              required
              rows={8}
              value={composer.text}
              onChange={(e) => setComposer({ ...composer, text: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComposer(null)}>
              {copy.cancel}
            </Button>
            <Button type="submit" loading={sending}>
              {copy.send}
            </Button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <h3 className="border-b border-[color:var(--ds-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--ds-text)]">
          {copy.filed} ({filed.length})
        </h3>
        {filed.length === 0 ? (
          <EmptyState
            title={copy.filedEmpty}
            className="rounded-none border-0 bg-transparent py-8"
          />
        ) : (
          <ul>{filed.map((mail) => renderMail(mail, "filed"))}</ul>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <h3 className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--ds-text)]">
          <Inbox size={14} aria-hidden /> {copy.unassigned} ({unassigned.length})
        </h3>
        {unassigned.length === 0 ? (
          <EmptyState
            title={copy.unassignedEmpty}
            className="rounded-none border-0 bg-transparent py-8"
          />
        ) : (
          <ul>{unassigned.map((mail) => renderMail(mail, "unassigned"))}</ul>
        )}
      </section>

      {imported.length > 0 && (
        <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <h3 className="border-b border-[color:var(--ds-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--ds-text)]">
            {copy.outlook} ({imported.length})
          </h3>
          <ul>
            {imported.map((doc) => (
              <li
                key={doc.id}
                className="border-b border-[color:var(--ds-border)] px-4 py-3 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-[color:var(--ds-text)]">
                    {doc.name.replace(/^E-Mail:\s*/, "")}
                  </span>
                  <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                  </span>
                </div>
                {doc.notes && (
                  <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {doc.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
