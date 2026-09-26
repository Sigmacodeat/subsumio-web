"use client";

/**
 * SmsSendDialog — SMS an einen Kontakt senden (WP-8.53).
 *
 * Geht über POST /api/sms/send → sendGuardedSms (Einwilligungs-Prüfung,
 * Quiet-Hours, Rate-Limits). Ohne Twilio-Config antwortet die Route
 * ehrlich `not_configured` — der Dialog zeigt das als Fehlertext.
 *
 * Bei `no_consent` wird statt einer Sackgasse ein Einwilligungs-Block
 * angeboten: die Kanzlei dokumentiert das Opt-in mit Nachweis
 * (POST /api/sms/consent), danach ist der Versand freigeschaltet.
 */

import { useCallback, useEffect, useState } from "react";
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
import { normalizePhone } from "@/lib/whatsapp/types";
import {
  Loader2,
  MessageSquare,
  AlertTriangle,
  ShieldCheck,
  CheckCheck,
  XCircle,
} from "lucide-react";

const SMS_MAX_BODY = 1600;

interface SmsSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empfänger-Telefonnummer (aus dem Kontakt). */
  phone: string;
  /** Name für den Dialog-Titel. */
  contactName: string;
  /** Kontakt-Slug als subjectRef der Einwilligung (optional). */
  contactRef?: string;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: { reason?: string };
}

interface SmsDeliveryRow {
  status: string;
  errorCode: string | null;
  timestamp: string;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "in Warteschlange",
  sending: "wird gesendet",
  sent: "gesendet",
  delivered: "zugestellt",
  undelivered: "nicht zustellbar",
  failed: "fehlgeschlagen",
  read: "gelesen",
};

/** SHA-256 of the normalised number — the same hash the server stores. */
async function smsPhoneHash(phone: string): Promise<string> {
  const data = new TextEncoder().encode(normalizePhone(phone));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SmsSendDialog({
  open,
  onOpenChange,
  phone,
  contactName,
  contactRef,
}: SmsSendDialogProps) {
  const { addToast } = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentProof, setConsentProof] = useState("");
  const [consenting, setConsenting] = useState(false);
  const [deliveries, setDeliveries] = useState<SmsDeliveryRow[] | null>(null);

  const remaining = SMS_MAX_BODY - message.length;

  const loadDeliveries = useCallback(async () => {
    try {
      // Only the hash of the number goes into the URL (access logs).
      const res = await fetch(`/api/sms/status?hash=${await smsPhoneHash(phone)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { deliveries?: SmsDeliveryRow[] };
      setDeliveries(data.deliveries ?? []);
    } catch {
      // Status optional — Versand funktioniert auch ohne Delivery-Anzeige.
    }
  }, [phone]);

  useEffect(() => {
    if (open) void loadDeliveries();
  }, [open, loadDeliveries]);

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
      const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
      if (!res.ok) {
        if (data.details?.reason === "no_consent") setNeedsConsent(true);
        setError(data.error ?? "Die SMS konnte nicht gesendet werden.");
        return;
      }
      addToast({ type: "success", description: `SMS an ${contactName} wurde gesendet.` });
      setMessage("");
      // Zustellstatus kommt per Twilio-Webhook verzögert — einmal
      // verzögert nachladen, damit „delivered" direkt sichtbar ist.
      setTimeout(() => void loadDeliveries(), 4000);
      onOpenChange(false);
    } catch {
      setError("Die SMS konnte nicht gesendet werden. Bitte erneut versuchen.");
    } finally {
      setSending(false);
    }
  }

  async function recordConsent() {
    // Nachweis ist Pflicht — eine Einwilligung ohne dokumentierten Beleg
    // (Mandatsvertrag, Formular, E-Mail) ist vor BAO/DSGVO nicht haltbar.
    if (consenting || !consentProof.trim()) return;
    setConsenting(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/sms/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          scopes: ["client_reminder", "appointment_reminder"],
          subjectType: "client",
          subjectRef: contactRef || contactName,
          proof: {
            basis: consentProof.trim(),
            recorded_via: "sms_send_dialog",
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
        setError(data.error ?? "Einwilligung konnte nicht gespeichert werden.");
        return;
      }
      setNeedsConsent(false);
      setError(null);
      addToast({
        type: "success",
        description: `SMS-Einwilligung für ${contactName} dokumentiert.`,
      });
    } catch {
      setError("Einwilligung konnte nicht gespeichert werden.");
    } finally {
      setConsenting(false);
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

          {deliveries && deliveries.length > 0 && (
            <div className="space-y-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
              <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                Letzte Zustellungen
              </p>
              <ul className="space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
                {deliveries.map((d, i) => {
                  const failed = d.status === "failed" || d.status === "undelivered";
                  const done = d.status === "delivered" || d.status === "read";
                  return (
                    <li key={i} className="flex items-center gap-1.5">
                      {failed ? (
                        <XCircle
                          size={12}
                          className="shrink-0 text-[color:var(--ds-danger-text)]"
                          aria-hidden="true"
                        />
                      ) : done ? (
                        <CheckCheck
                          size={12}
                          className="shrink-0 text-[color:var(--ds-success-text)]"
                          aria-hidden="true"
                        />
                      ) : (
                        <Loader2
                          size={12}
                          className="shrink-0 text-[color:var(--ds-text-subtle)]"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        {STATUS_LABEL[d.status] ?? d.status}
                        {d.errorCode ? ` (Fehler ${d.errorCode})` : ""} —{" "}
                        {new Date(d.timestamp).toLocaleString("de-AT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {needsConsent && (
            <div className="space-y-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-warning-text)]">
                <ShieldCheck size={13} aria-hidden="true" />
                Keine SMS-Einwilligung — vor dem ersten Versand dokumentieren:
              </p>
              <input
                type="text"
                value={consentProof}
                onChange={(e) => setConsentProof(e.target.value)}
                placeholder="Nachweis (Pflicht), z. B. „Mandatsvertrag vom 12.03.“"
                aria-label="Nachweis der Einwilligung (Pflichtfeld)"
                aria-required="true"
                className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void recordConsent()}
                disabled={consenting || !consentProof.trim()}
              >
                {consenting && <Loader2 size={12} className="mr-1.5 animate-spin" />}
                Einwilligung dokumentieren
              </Button>
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
