"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Mail,
  Inbox,
  Send,
  RefreshCw,
  Reply,
  PenSquare,
  X,
  Copy,
  Check,
  AlertTriangle,
  Calendar,
  Loader2,
  Eye,
  MousePointerClick,
  Forward,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";

export interface MailMessageView {
  id: string;
  direction: "inbound" | "outbound";
  status: "received" | "sent" | "failed";
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  createdAt: string;
  trackingStatus?: string;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
}

type Filter = "all" | "inbound" | "outbound";

interface Props {
  initialMessages: MailMessageView[];
  receivingAddress: string;
  webhookUrl: string;
  mailConfigured: boolean;
  inboundConfigured: boolean;
}

const fmt = (iso: string, lang: Lang = "de") => {
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "de-DE");
  } catch {
    return iso;
  }
};

export default function MailboxClient({
  initialMessages,
  receivingAddress,
  webhookUrl,
  mailConfigured,
  inboundConfigured,
}: Props) {
  const { lang } = useLang();
  const [messages, setMessages] = useState<MailMessageView[]>(initialMessages);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialMessages[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email/messages?limit=100", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { messages: MailMessageView[] };
      setMessages(data.messages);
      if (data.messages.length > 0 && !data.messages.some((m) => m.id === selectedId)) {
        setSelectedId(data.messages[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const filtered = useMemo(
    () => (filter === "all" ? messages : messages.filter((m) => m.direction === filter)),
    [messages, filter]
  );
  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId]
  );

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(receivingAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-6">
      {/* Receiving-address / setup card */}
      <div className="space-y-4 rounded-xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mb-1 text-sm font-semibold [color:var(--mk-text)]">Empfangsadresse</h2>
            <p className="text-xs [color:var(--mk-text-muted)]">
              Diese Adresse bei Supabase (und anderen Diensten) als Konto-E-Mail verwenden —
              eingehende Mails landen unten in dieser Mailbox.
            </p>
          </div>
          <button
            onClick={copyAddress}
            className="inline-flex items-center gap-1.5 rounded-lg border [border-color:var(--mk-border-strong)] px-3 py-2 font-mono text-sm text-violet-300 [background:var(--mk-surface)] hover:[background:var(--mk-surface)]"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {receivingAddress}
          </button>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <StatusPill
            ok={mailConfigured}
            okText="Versand aktiv (Resend)"
            badText="Versand nicht konfiguriert — RESEND_API_KEY fehlt (Mails werden nur geloggt)"
          />
          <StatusPill
            ok={inboundConfigured}
            okText="Empfang aktiv (Resend Webhook)"
            badText="Empfang nicht konfiguriert — RESEND_WEBHOOK_SECRET fehlt"
          />
        </div>

        {!inboundConfigured && (
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle size={13} /> Damit Supabase-Mails ankommen:
            </p>
            <ol className="list-decimal space-y-0.5 pl-5 text-amber-100/70">
              <li>
                In Resend die Domain von <span className="font-mono">{receivingAddress}</span>{" "}
                verifizieren (MX-Records).
              </li>
              <li>
                Resend → Receiving → Webhook auf{" "}
                <span className="font-mono break-all">{webhookUrl}</span> setzen, Event{" "}
                <span className="font-mono">email.received</span>.
              </li>
              <li>
                <span className="font-mono">RESEND_WEBHOOK_SECRET</span> aus Resend in die Env
                eintragen und neu deployen.
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border [border-color:var(--mk-border)] p-1 [background:var(--mk-surface)]">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            icon={Mail}
            label="Alle"
          />
          <FilterTab
            active={filter === "inbound"}
            onClick={() => setFilter("inbound")}
            icon={Inbox}
            label="Empfangen"
          />
          <FilterTab
            active={filter === "outbound"}
            onClick={() => setFilter("outbound")}
            icon={Send}
            label="Gesendet"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border [border-color:var(--mk-border-strong)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface)] hover:[background:var(--mk-surface)]"
          >
            <PenSquare size={14} /> Neue Mail
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border [border-color:var(--mk-border-strong)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface)] hover:[background:var(--mk-surface)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{" "}
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          Fehler beim Laden: {error}
        </div>
      )}

      {/* List + detail */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
          <div className="flex items-center justify-between border-b [border-color:var(--mk-border)] px-4 py-3">
            <span className="text-xs font-semibold [color:var(--mk-text)]">E-Mails</span>
            <span className="text-xs [color:var(--mk-text-subtle)]">{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Mail size={28} className="mx-auto mb-2 [color:var(--mk-border-strong)]" />
              <p className="text-sm [color:var(--mk-text-subtle)]">Noch keine E-Mails.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-[color:var(--mk-border)] overflow-y-auto">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full px-4 py-3 text-left hover:[background:var(--mk-surface)]/60 ${
                      m.id === selectedId ? "[background:var(--mk-surface)]" : ""
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-2">
                      {m.direction === "inbound" ? (
                        <Inbox size={12} className="brand-text shrink-0" />
                      ) : (
                        <Send
                          size={12}
                          className={`${m.status === "failed" ? "text-red-400" : "text-emerald-400"} shrink-0`}
                        />
                      )}
                      <span className="truncate text-xs font-medium [color:var(--mk-text)]">
                        {m.direction === "inbound"
                          ? m.fromName || m.fromEmail
                          : m.toEmails.join(", ") || "—"}
                      </span>
                    </div>
                    <p className="truncate text-xs [color:var(--mk-text-muted)]">
                      {m.subject || "(kein Betreff)"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-xs [color:var(--mk-text-subtle)]">
                        {fmt(m.createdAt, lang)}
                      </p>
                      {m.direction === "outbound" && m.trackingStatus && (
                        <TrackingBadge
                          status={m.trackingStatus}
                          openCount={m.openCount}
                          clickCount={m.clickCount}
                          forwarded={m.forwarded}
                        />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
          {selected ? (
            <MessageDetail message={selected} onSent={refresh} />
          ) : (
            <div className="px-5 py-24 text-center">
              <Mail size={28} className="mx-auto mb-2 [color:var(--mk-border-strong)]" />
              <p className="text-sm [color:var(--mk-text-subtle)]">Wähle links eine E-Mail aus.</p>
            </div>
          )}
        </div>
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/5 text-amber-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span>{ok ? okText : badText}</span>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
        active
          ? "[color:var(--mk-text)] [background:var(--mk-surface)]"
          : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function MessageDetail({ message, onSent }: { message: MailMessageView; onSent: () => void }) {
  const { lang } = useLang();
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b [border-color:var(--mk-border)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold [color:var(--mk-text)]">
            {message.subject || "(kein Betreff)"}
          </h2>
          {message.direction === "inbound" && (
            <button
              onClick={() => setReplyOpen((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border [border-color:var(--mk-border-strong)] px-3 py-1.5 text-sm [color:var(--mk-text)] [background:var(--mk-surface)] hover:[background:var(--mk-surface)]"
            >
              <Reply size={13} /> Antworten
            </button>
          )}
        </div>
        <div className="mt-2 space-y-0.5 text-xs [color:var(--mk-text-muted)]">
          <p>
            <span className="[color:var(--mk-text-subtle)]">Von:</span>{" "}
            {message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}
          </p>
          <p>
            <span className="[color:var(--mk-text-subtle)]">An:</span>{" "}
            {message.toEmails.join(", ") || "—"}
          </p>
          <p className="flex items-center gap-1">
            <Calendar size={11} /> {fmt(message.createdAt, lang)}
            {message.direction === "outbound" && (
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                  message.status === "failed"
                    ? "bg-red-500/15 text-red-300"
                    : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {message.status === "failed" ? "Fehlgeschlagen" : "Gesendet"}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
        {message.text ? (
          <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap [color:var(--mk-text-muted)]">
            {message.text}
          </pre>
        ) : message.html ? (
          <div
            className="prose prose-invert max-w-none text-sm [color:var(--mk-text-muted)]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.html) }}
          />
        ) : (
          <p className="text-sm [color:var(--mk-text-subtle)]">Kein Inhalt.</p>
        )}
      </div>

      {message.direction === "outbound" && message.trackingStatus && (
        <TrackingTimeline
          status={message.trackingStatus}
          openCount={message.openCount}
          clickCount={message.clickCount}
          forwarded={message.forwarded}
          firstOpenedAt={message.firstOpenedAt}
          lastOpenedAt={message.lastOpenedAt}
        />
      )}

      {replyOpen && (
        <ReplyForm
          messageId={message.id}
          onSent={() => {
            setReplyOpen(false);
            onSent();
          }}
          onCancel={() => setReplyOpen(false)}
        />
      )}
    </div>
  );
}

function ReplyForm({
  messageId,
  onSent,
  onCancel,
}: {
  messageId: string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) {
      setErr("Bitte einen Text eingeben.");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await csrfFetch(`/api/email/messages/${messageId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setText("");
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "send_failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 border-t [border-color:var(--mk-border)] px-5 py-4 [background:var(--mk-surface-2)]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Antwort schreiben…"
        className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
      />
      {err && <p className="text-xs text-red-300">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
        >
          Abbrechen
        </button>
        <button
          onClick={send}
          disabled={sending}
          className="brand-bg brand-bg inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Senden
        </button>
      </div>
    </div>
  );
}

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      setErr("Empfänger, Betreff und Text sind erforderlich.");
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const res = await csrfFetch("/api/email/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.split(",").map((s) => s.trim()), subject, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "send_failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-3 rounded-xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold [color:var(--mk-text)]">
            <PenSquare size={15} /> Neue E-Mail
          </h2>
          <button
            onClick={onClose}
            className="[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
          >
            <X size={16} />
          </button>
        </div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="An (mehrere mit Komma)"
          className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Betreff"
          className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Nachricht…"
          className="w-full rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        {err && <p className="text-xs text-red-300">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm [color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
          >
            Abbrechen
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="brand-bg brand-bg inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Senden
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackingBadge({
  status,
  openCount,
  clickCount,
  forwarded,
}: {
  status: string;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
}) {
  const config: Record<string, { icon: typeof Eye; color: string; label: string }> = {
    sent: { icon: Send, color: "text-slate-400", label: "Gesendet" },
    delivered: { icon: CheckCircle2, color: "text-emerald-400", label: "Zugestellt" },
    opened: { icon: Eye, color: "text-blue-400", label: "Geöffnet" },
    clicked: { icon: MousePointerClick, color: "text-violet-400", label: "Geklickt" },
    bounced: { icon: XCircle, color: "text-red-400", label: "Bounce" },
    complained: { icon: AlertTriangle, color: "text-amber-400", label: "Spam" },
  };

  const cfg = config[status] ?? config.sent;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
      {openCount && openCount > 0 ? ` (${openCount}x)` : ""}
      {forwarded && (
        <span className="inline-flex items-center gap-0.5 text-amber-400" title="Weitergeleitet">
          <Forward size={10} />
        </span>
      )}
    </span>
  );
}

function TrackingTimeline({
  status,
  openCount,
  clickCount,
  forwarded,
  firstOpenedAt,
  lastOpenedAt,
}: {
  status: string;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
}) {
  const { lang } = useLang();

  const steps: { label: string; done: boolean; icon: typeof Eye; color: string }[] = [
    { label: "Gesendet", done: true, icon: Send, color: "text-slate-400" },
    {
      label: "Zugestellt",
      done: ["delivered", "opened", "clicked"].includes(status),
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Geöffnet",
      done: ["opened", "clicked"].includes(status),
      icon: Eye,
      color: "text-blue-400",
    },
    {
      label: "Geklickt",
      done: status === "clicked",
      icon: MousePointerClick,
      color: "text-violet-400",
    },
  ];

  if (status === "bounced" || status === "complained") {
    steps.length = 0;
  }

  return (
    <div className="border-t [border-color:var(--mk-border)] px-5 py-4 [background:var(--mk-surface-2)]">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold [color:var(--mk-text)]">Tracking</h3>
        {status === "bounced" && (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
            <XCircle size={11} /> Email gebounct
          </span>
        )}
        {status === "complained" && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
            <AlertTriangle size={11} /> Spam-Beschwerde
          </span>
        )}
        {forwarded && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
            <Forward size={11} /> Weitergeleitet
          </span>
        )}
      </div>

      {steps.length > 0 ? (
        <div className="flex items-center gap-1">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
                    step.done ? step.color : "text-[color:var(--mk-text-subtle)] opacity-50"
                  }`}
                >
                  <Icon size={12} />
                  {step.label}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-px w-4 ${step.done ? "bg-[color:var(--brand-primary)]" : "bg-[color:var(--mk-border)]"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 grid gap-1 text-xs [color:var(--mk-text-muted)]">
        {openCount !== undefined && openCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Eye size={11} className="text-blue-400" />
            <span>{openCount}x geöffnet</span>
            {firstOpenedAt && (
              <span className="[color:var(--mk-text-subtle)]">
                — zuerst {fmt(firstOpenedAt, lang)}
              </span>
            )}
            {lastOpenedAt && lastOpenedAt !== firstOpenedAt && (
              <span className="[color:var(--mk-text-subtle)]">
                — zuletzt {fmt(lastOpenedAt, lang)}
              </span>
            )}
          </div>
        )}
        {clickCount !== undefined && clickCount > 0 && (
          <div className="flex items-center gap-1.5">
            <MousePointerClick size={11} className="text-violet-400" />
            <span>{clickCount}x geklickt</span>
          </div>
        )}
        {openCount === 0 && clickCount === 0 && status !== "bounced" && status !== "complained" && (
          <p className="[color:var(--mk-text-subtle)]">Noch keine Interaktion erfasst.</p>
        )}
      </div>
    </div>
  );
}
