"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import type { CaseContact, CaseDetail } from "@/lib/matter-detail-types";

interface WhatsAppClientInviteResponse {
  ok: boolean;
  inviteSlug: string;
  expiresAt: string;
  message: string;
  identity: {
    id: string;
    role: string;
    matterScope: string[] | "all";
    status: string;
    verifiedAt: string | null;
    phoneHash: string;
  };
}

export function WhatsAppClientInvitePanel({
  caseData,
  clientContact,
  disabled,
}: {
  caseData: CaseDetail;
  clientContact?: CaseContact;
  disabled?: boolean;
}) {
  const { addToast } = useToast();
  const [phone, setPhone] = useState(clientContact?.phone ?? "");
  const [clientName, setClientName] = useState(caseData.clientName ?? clientContact?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<WhatsAppClientInviteResponse | null>(null);

  const canSubmit = useMemo(
    () => phone.trim().length >= 6 && !loading && !disabled,
    [phone, loading, disabled]
  );

  async function createInvite() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await csrfFetch("/api/whatsapp/client-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          caseSlug: caseData.slug,
          clientName: clientName.trim() || caseData.clientName || clientContact?.name,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | WhatsAppClientInviteResponse
        | { message?: string; error?: string };
      if (!res.ok || !("inviteSlug" in data)) {
        const errorData = data as { message?: string; error?: string };
        throw new Error(
          errorData.message || errorData.error || "Einladung konnte nicht erstellt werden"
        );
      }
      setInvite(data);
      addToast({
        type: "success",
        title: "WhatsApp-Einladung erstellt",
        description: "Der Mandant kann die Nummer nun per Code bestätigen.",
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "WhatsApp-Einladung fehlgeschlagen",
        description: err instanceof Error ? err.message : "Bitte später erneut versuchen.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function copyInvite() {
    if (!invite?.message) return;
    try {
      await navigator.clipboard.writeText(invite.message);
      addToast({ type: "success", title: "Einladung kopiert" });
    } catch {
      addToast({ type: "error", title: "Kopieren nicht möglich" });
    }
  }

  return (
    <section className="rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]">
          <MessageCircle size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Mandant per WhatsApp verbinden
            </h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-success-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-success-text)]">
              <ShieldCheck size={12} aria-hidden="true" />
              Code-Bestätigung
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            Erst nach Bestätigung darf diese Nummer Unterlagen direkt zu dieser Akte einreichen. Bis
            dahin landen Nachrichten nicht automatisch in der Aktenbasis.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="wa-client-name" className="text-xs">
                Mandantenname
              </Label>
              <Input
                id="wa-client-name"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="z.B. Max Mustermann"
                disabled={disabled || loading}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wa-client-phone" className="text-xs">
                WhatsApp-Telefonnummer
              </Label>
              <Input
                id="wa-client-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+43..."
                inputMode="tel"
                disabled={disabled || loading}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void createInvite()}
              disabled={!canSubmit}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <MessageCircle size={14} aria-hidden="true" />
              )}
              Einladung erstellen
            </Button>
            {invite && (
              <Button type="button" size="sm" variant="outline" onClick={() => void copyInvite()}>
                <Copy size={14} aria-hidden="true" />
                Text kopieren
              </Button>
            )}
          </div>

          {invite && (
            <div className="mt-4 grid gap-2">
              <Label htmlFor="wa-client-invite-message" className="text-xs">
                Einladungstext für WhatsApp
              </Label>
              <Textarea
                id="wa-client-invite-message"
                value={invite.message}
                readOnly
                rows={6}
                className="text-xs"
              />
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Gültig bis {new Date(invite.expiresAt).toLocaleString("de-DE")}. Nach Antwort mit
                dem Code wird die Nummer für diese Akte freigeschaltet.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
