"use client";

import { useState, useCallback } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  X,
  MessageSquareText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { issuePortalLink } from "@/lib/portal-link-client";

interface DocumentRequestComposerProps {
  slug: string;
  caseSlug: string;
  messageDraft?: string;
  /** The request offers the client portal; a fresh link is issued on send. */
  portalLink?: boolean;
  items: string[];
  recipientPhone?: string;
  recipientEmail?: string;
  onSent?: () => void;
  onFulfilled?: () => void;
  onClose?: () => void;
}

type SendChannel = "whatsapp" | "email" | "portal";

export function DocumentRequestComposer({
  slug,
  caseSlug,
  messageDraft,
  portalLink,
  items,
  recipientPhone,
  recipientEmail,
  onSent,
  onFulfilled,
  onClose,
}: DocumentRequestComposerProps) {
  const { addToast } = useToast();
  const [message, setMessage] = useState(
    messageDraft ||
      `Bitte laden Sie folgende Unterlagen hoch:\n${items.map((i) => `- ${i}`).join("\n")}`
  );
  const [channel, setChannel] = useState<SendChannel>(
    recipientPhone ? "whatsapp" : recipientEmail ? "email" : "portal"
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const availableChannels: Array<{
    key: SendChannel;
    label: string;
    icon: React.ElementType;
    available: boolean;
  }> = [
    { key: "whatsapp", label: "WhatsApp", icon: MessageSquareText, available: !!recipientPhone },
    { key: "email", label: "E-Mail", icon: Mail, available: !!recipientEmail },
    { key: "portal", label: "Portal", icon: ExternalLink, available: !!portalLink },
  ];

  const updateStatus = useCallback(
    async (status: "sent" | "fulfilled", recipientEmailForReminders?: string) => {
      const res = await csrfFetch("/api/document-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          status,
          sent_at: status === "sent" ? new Date().toISOString() : undefined,
          message_draft: message,
          // Reminders follow the channel the request went out on.
          recipient_email: recipientEmailForReminders,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : "Update fehlgeschlagen");
      }
    },
    [slug, message]
  );

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      if (channel === "whatsapp" && recipientPhone) {
        await api.whatsapp.sendText(recipientPhone, message);
        await updateStatus("sent");
        addToast({ type: "success", title: "Dokumentenanfrage per WhatsApp versendet" });
      } else if (channel === "email" && recipientEmail) {
        const res = await csrfFetch("/api/cases/send-email", {
          method: "POST",
          // Long-running: csrfFetch would otherwise abort after 30s.
          signal: AbortSignal.timeout(300_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipientEmail,
            subject: `Dokumentenanfrage: ${caseSlug.split("/").pop() || caseSlug}`,
            body: message,
            caseSlug,
          }),
        });
        if (!res.ok) throw new Error("E-Mail-Versand fehlgeschlagen");
        await updateStatus("sent", recipientEmail);
        addToast({ type: "success", title: "Dokumentenanfrage per E-Mail versendet" });
      } else if (channel === "portal" && portalLink) {
        // Not stored anywhere: issued (and hash-registered) for this send.
        const url = await issuePortalLink(caseSlug);
        await navigator.clipboard.writeText(url);
        await updateStatus("sent");
        addToast({
          type: "success",
          title: "Portal-Link kopiert und Anfrage als versendet markiert",
        });
      } else {
        await updateStatus("sent");
        addToast({ type: "success", title: "Dokumentenanfrage als versendet markiert" });
      }
      setSent(true);
      onSent?.();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Versand fehlgeschlagen",
      });
    } finally {
      setSending(false);
    }
  }, [
    channel,
    recipientPhone,
    recipientEmail,
    portalLink,
    message,
    caseSlug,
    updateStatus,
    addToast,
    onSent,
  ]);

  const handleFulfilled = useCallback(async () => {
    setSending(true);
    try {
      await updateStatus("fulfilled");
      addToast({ type: "success", title: "Dokumentenanfrage als erledigt markiert" });
      onFulfilled?.();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Aktualisierung fehlgeschlagen",
      });
    } finally {
      setSending(false);
    }
  }, [updateStatus, addToast, onFulfilled]);

  if (sent) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-3">
        <div className="flex items-center gap-2 text-sm text-[color:var(--ds-success-text)]">
          <CheckCircle2 size={15} />
          Dokumentenanfrage versendet
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-[color:var(--ds-success-text)]"
            disabled={sending}
            onClick={() => void handleFulfilled()}
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Als erledigt markieren
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[color:var(--ds-text)]">
          Dokumentenanfrage senden
        </span>
        <button
          onClick={onClose}
          className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          aria-label="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      {/* Message editor */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        placeholder="Nachricht an den Mandanten..."
      />

      {/* Channel selection */}
      <div className="flex flex-wrap items-center gap-1.5">
        {availableChannels.map((ch) => {
          const Icon = ch.icon;
          const isActive = channel === ch.key;
          return (
            <button
              key={ch.key}
              onClick={() => ch.available && setChannel(ch.key)}
              disabled={!ch.available}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
                !ch.available && "cursor-not-allowed opacity-40",
                isActive
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]"
                  : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
              )}
            >
              <Icon size={13} />
              {ch.label}
              {!ch.available && (
                <span className="text-[10px] opacity-60">
                  {ch.key === "whatsapp"
                    ? "(keine Tel.)"
                    : ch.key === "email"
                      ? "(keine E-Mail)"
                      : "(kein Portal)"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Recipient info */}
      {channel === "whatsapp" && recipientPhone && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Empfänger: <span className="font-mono">{recipientPhone}</span>
        </p>
      )}
      {channel === "email" && recipientEmail && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Empfänger: <span className="font-mono">{recipientEmail}</span>
        </p>
      )}
      {channel === "portal" && portalLink && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Beim Senden wird ein neuer Portal-Link erzeugt und kopiert.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-[color:var(--ds-success-text)]"
          disabled={sending}
          onClick={() => void handleFulfilled()}
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          Direkt als erledigt markieren
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="h-8 gap-1.5 text-xs"
          disabled={sending || !message.trim()}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : channel === "portal" ? (
            <Copy size={13} />
          ) : (
            <Send size={13} />
          )}
          {channel === "portal" ? "Link kopieren & senden" : "Senden"}
        </Button>
      </div>
    </div>
  );
}
