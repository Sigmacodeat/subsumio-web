"use client";

/**
 * SmsSendDialog — SMS an einen Kontakt senden (WP-8.53).
 *
 * Geht über POST /api/sms/send → sendGuardedSms (Einwilligungs-Prüfung,
 * Quiet-Hours, Rate-Limits). Ohne Twilio-Config antwortet die Route
 * ehrlich `not_configured` — der Dialog zeigt das als Fehlertext.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { Loader2, MessageSquare, AlertTriangle } from "lucide-react";

const SMS_MAX_BODY = 1600;

interface SmsSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empfänger-Telefonnummer (aus dem Kontakt). */
  phone: string;
  /** Name für den Dialog-Titel. */
  contactName: string;
}

export function SmsSendDialog({ open, onOpenChange, phone, contactName }: SmsSendDialogProps) {
  const { addToast } = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = SMS_MAX_BODY - message.length;

  async function send() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone, message: message.trim(), scope: "client_reminder" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(
          data.message ??
            (data.error === "sms_not_configured"
              ? "SMS-Versand ist nicht konfiguriert (Twilio-Zugangsdaten fehlen)."
              : "Die SMS konnte nicht gesendet werden.")
        );
        return;
      }
      addToast({ type: "success", description: `SMS an ${contactName} wurde gesendet.` });
      setMessage("");
      onOpenChange(false);
    } catch {
      setError("Die SMS konnte nicht gesendet werden. Bitte erneut versuchen.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={16} aria-hidden="true" /> SMS an {contactName}
          </DialogTitle>
          <DialogDescription>{phone}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="sms-body" className="text-xs font-medium text-[color:var(--ds-text)]">
            Nachricht
          </label>
          <textarea
            id="sms-body"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, SMS_MAX_BODY))}
            rows={4}
            maxLength={SMS_MAX_BODY}
            placeholder="Nachrichtentext …"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-[color:var(--ds-text-subtle)]">
              Versand erfolgt über die Kanzlei-SMS-Verbindung.
            </span>
            <Badge variant={remaining < 160 ? "warning" : "default"} className="tabular-nums">
              {remaining}
            </Badge>
          </div>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Abbrechen
          </Button>
          <Button onClick={() => void send()} disabled={!message.trim() || sending}>
            {sending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
