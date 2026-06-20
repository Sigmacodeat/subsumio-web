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
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";

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
}

type Filter = "all" | "inbound" | "outbound";

interface Props {
  initialMessages: MailMessageView[];
  receivingAddress: string;
  webhookUrl: string;
  mailConfigured: boolean;
  inboundConfigured: boolean;
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("de-DE");
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
    [messages, filter],
  );
  const selected = useMemo(() => messages.find((m) => m.id === selectedId) ?? null, [messages, selectedId]);

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
      <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[#e8e8f0] mb-1">Empfangsadresse</h2>
            <p className="text-xs text-[#8888aa]">
              Diese Adresse bei Supabase (und anderen Diensten) als Konto-E-Mail verwenden — eingehende
              Mails landen unten in dieser Mailbox.
            </p>
          </div>
          <button
            onClick={copyAddress}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#12122a] px-3 py-2 text-sm font-mono text-violet-300 hover:bg-[#1a1a36]"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {receivingAddress}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 text-xs">
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
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90 space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <AlertTriangle size={13} /> Damit Supabase-Mails ankommen:
            </p>
            <ol className="list-decimal pl-5 space-y-0.5 text-amber-100/70">
              <li>In Resend die Domain von <span className="font-mono">{receivingAddress}</span> verifizieren (MX-Records).</li>
              <li>Resend → Receiving → Webhook auf <span className="font-mono break-all">{webhookUrl}</span> setzen, Event <span className="font-mono">email.received</span>.</li>
              <li><span className="font-mono">RESEND_WEBHOOK_SECRET</span> aus Resend in die Env eintragen und neu deployen.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-[#1e1e3a] bg-[#0d0d1a] p-1">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")} icon={Mail} label="Alle" />
          <FilterTab active={filter === "inbound"} onClick={() => setFilter("inbound")} icon={Inbox} label="Empfangen" />
          <FilterTab active={filter === "outbound"} onClick={() => setFilter("outbound")} icon={Send} label="Gesendet" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#12122a] px-3 py-2 text-sm text-[#e8e8f0] hover:bg-[#1a1a36]"
          >
            <PenSquare size={14} /> Neue Mail
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#12122a] px-3 py-2 text-sm text-[#e8e8f0] hover:bg-[#1a1a36] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Aktualisieren
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
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e1e3a] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#e8e8f0]">E-Mails</span>
            <span className="text-xs text-[#7878a0]">{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <Mail size={28} className="mx-auto text-[#2a2a4a] mb-2" />
              <p className="text-sm text-[#7878a0]">Noch keine E-Mails.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1e1e3a] max-h-[60vh] overflow-y-auto">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-[#12122a]/60 ${
                      m.id === selectedId ? "bg-[#12122a]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {m.direction === "inbound" ? (
                        <Inbox size={12} className="brand-text shrink-0" />
                      ) : (
                        <Send size={12} className={`${m.status === "failed" ? "text-red-400" : "text-emerald-400"} shrink-0`} />
                      )}
                      <span className="text-xs font-medium text-[#e8e8f0] truncate">
                        {m.direction === "inbound"
                          ? m.fromName || m.fromEmail
                          : m.toEmails.join(", ") || "—"}
                      </span>
                    </div>
                    <p className="text-xs text-[#aaaac4] truncate">{m.subject || "(kein Betreff)"}</p>
                    <p className="text-[10px] text-[#7878a0] mt-0.5">{fmt(m.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
          {selected ? (
            <MessageDetail message={selected} onSent={refresh} />
          ) : (
            <div className="px-5 py-24 text-center">
              <Mail size={28} className="mx-auto text-[#2a2a4a] mb-2" />
              <p className="text-sm text-[#7878a0]">Wähle links eine E-Mail aus.</p>
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
        ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-amber-500/30 bg-amber-500/5 text-amber-200"
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
        active ? "bg-[#1a1a36] text-[#e8e8f0]" : "text-[#8888aa] hover:text-[#e8e8f0]"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function MessageDetail({ message, onSent }: { message: MailMessageView; onSent: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#1e1e3a]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-[#e8e8f0]">{message.subject || "(kein Betreff)"}</h2>
          {message.direction === "inbound" && (
            <button
              onClick={() => setReplyOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a4a] bg-[#12122a] px-3 py-1.5 text-sm text-[#e8e8f0] hover:bg-[#1a1a36] shrink-0"
            >
              <Reply size={13} /> Antworten
            </button>
          )}
        </div>
        <div className="mt-2 space-y-0.5 text-xs text-[#8888aa]">
          <p>
            <span className="text-[#7878a0]">Von:</span>{" "}
            {message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}
          </p>
          <p>
            <span className="text-[#7878a0]">An:</span> {message.toEmails.join(", ") || "—"}
          </p>
          <p className="flex items-center gap-1">
            <Calendar size={11} /> {fmt(message.createdAt)}
            {message.direction === "outbound" && (
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                  message.status === "failed" ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {message.status === "failed" ? "Fehlgeschlagen" : "Gesendet"}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 overflow-y-auto max-h-[50vh]">
        {message.text ? (
          <pre className="whitespace-pre-wrap text-sm text-[#c4c4dc] leading-relaxed font-sans">{message.text}</pre>
        ) : message.html ? (
          <div
            className="text-sm text-[#c4c4dc] prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.html) }}
          />
        ) : (
          <p className="text-sm text-[#7878a0]">Kein Inhalt.</p>
        )}
      </div>

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
      const res = await fetch(`/api/email/messages/${messageId}/reply`, {
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
    <div className="border-t border-[#1e1e3a] px-5 py-4 space-y-3 bg-[#0a0a18]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Antwort schreiben…"
        className="w-full rounded-lg border border-[#1e1e3a] bg-[#080812] px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#7878a0] focus:border-[color:var(--brand-primary)] focus:outline-none"
      />
      {err && <p className="text-xs text-red-300">{err}</p>}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-[#8888aa] hover:text-[#e8e8f0]">
          Abbrechen
        </button>
        <button
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-lg brand-bg px-4 py-2 text-sm font-medium text-white brand-bg disabled:opacity-50"
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
      const res = await fetch("/api/email/messages", {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#e8e8f0] flex items-center gap-1.5">
            <PenSquare size={15} /> Neue E-Mail
          </h2>
          <button onClick={onClose} className="text-[#8888aa] hover:text-[#e8e8f0]">
            <X size={16} />
          </button>
        </div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="An (mehrere mit Komma)"
          className="w-full rounded-lg border border-[#1e1e3a] bg-[#080812] px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#7878a0] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Betreff"
          className="w-full rounded-lg border border-[#1e1e3a] bg-[#080812] px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#7878a0] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Nachricht…"
          className="w-full rounded-lg border border-[#1e1e3a] bg-[#080812] px-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#7878a0] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        {err && <p className="text-xs text-red-300">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[#8888aa] hover:text-[#e8e8f0]">
            Abbrechen
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-lg brand-bg px-4 py-2 text-sm font-medium text-white brand-bg disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Senden
          </button>
        </div>
      </div>
    </div>
  );
}
