"use client";

import * as React from "react";
import {
  MessageCircle,
  Mail,
  Link as LinkIcon,
  Loader2,
  Check,
  Phone,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";

interface SendLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful send (whatsapp/email/copy) — parent should reload */
  onSent?: () => void;
  caseSlug: string;
  documentSlug: string;
  documentTitle: string;
  documentType: "signature_request" | "power_of_attorney" | "legal_document";
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  contactSlug?: string;
}

type Channel = "whatsapp" | "email" | "copy";

export function SendLinkDialog({
  open,
  onOpenChange,
  caseSlug,
  documentSlug,
  documentTitle,
  documentType,
  recipientName,
  recipientEmail,
  recipientPhone,
  contactSlug,
  onSent,
}: SendLinkDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [channel, setChannel] = React.useState<Channel | null>(null);
  const [phone, setPhone] = React.useState(recipientPhone ?? "");
  const [email, setEmail] = React.useState(recipientEmail ?? "");
  const [sending, setSending] = React.useState<Channel | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setChannel(null);
      setPhone(recipientPhone ?? "");
      setEmail(recipientEmail ?? "");
      setCopied(false);
    }
  }, [open, recipientPhone, recipientEmail]);

  const hasPhone = Boolean(recipientPhone);
  const hasEmail = Boolean(recipientEmail);

  async function send(channel: Channel) {
    setChannel(channel);
    setSending(channel);
    try {
      const body: Record<string, unknown> = {
        case_slug: caseSlug,
        document_slug: documentSlug,
        document_title: documentTitle,
        document_type: documentType,
        channel,
        recipient_name: recipientName,
      };
      if (channel === "whatsapp") {
        body.recipient_phone = phone;
        if (!hasPhone && contactSlug) {
          body.save_phone_to_contact = true;
          body.contact_slug = contactSlug;
        }
      }
      if (channel === "email") {
        body.recipient_email = email;
      }
      const res = await csrfFetch("/api/portal/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (channel === "copy") {
          await navigator.clipboard.writeText(data.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          addToast({ type: "success", title: t("sendlink.copied_ok") });
        } else if (channel === "whatsapp") {
          addToast({
            type: "success",
            title: t("sendlink.whatsapp_ok"),
            description: t("sendlink.whatsapp_desc"),
          });
        } else if (channel === "email") {
          addToast({
            type: "success",
            title: t("sendlink.email_ok"),
            description: t("sendlink.email_desc"),
          });
        }
        onOpenChange(false);
        onSent?.();
      } else {
        addToast({
          type: "error",
          title: t("sendlink.error"),
          description: data.error ?? undefined,
        });
      }
    } catch (err) {
      addToast({
        type: "error",
        title: t("sendlink.error"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon size={18} />
            {t("sendlink.title")}
          </DialogTitle>
          <DialogDescription>
            {t("sendlink.desc")}: {documentTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-2">
          {/* Channel selection */}
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setChannel("whatsapp")}
              className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] ${
                channel === "whatsapp"
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
              }`}
            >
              <MessageCircle size={18} className="shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t("sendlink.whatsapp")}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {hasPhone
                    ? recipientPhone
                    : t("sendlink.whatsapp_no_phone")}
                </div>
              </div>
            </button>

            <button
              onClick={() => setChannel("email")}
              className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] ${
                channel === "email"
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
              }`}
            >
              <Mail size={18} className="shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t("sendlink.email")}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {hasEmail ? recipientEmail : t("sendlink.email_empty")}
                </div>
              </div>
            </button>

            <button
              onClick={() => setChannel("copy")}
              className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] ${
                channel === "copy"
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
              }`}
            >
              <LinkIcon size={18} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t("sendlink.copy")}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("sendlink.copy_desc")}
                </div>
              </div>
            </button>
          </div>

          {/* Phone input (if WhatsApp selected and no phone stored) */}
          {channel === "whatsapp" && !hasPhone && (
            <div className="space-y-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <Label
                htmlFor="sendlink-phone"
                className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]"
              >
                <Phone size={12} />
                {t("sendlink.phone_label")}
              </Label>
              <Input
                id="sendlink-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+49 170 1234567"
                inputMode="tel"
                autoComplete="tel"
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
              />
              {contactSlug && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("sendlink.phone_save_hint")}
                </p>
              )}
            </div>
          )}

          {/* Email input (if Email selected and no email stored) */}
          {channel === "email" && !hasEmail && (
            <div className="space-y-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <Label
                htmlFor="sendlink-email"
                className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]"
              >
                <Mail size={12} />
                {t("sendlink.email_label")}
              </Label>
              <Input
                id="sendlink-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mandant@example.com"
                inputMode="email"
                autoComplete="email"
                className="min-h-11 text-base sm:min-h-0 sm:text-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          {channel === "copy" && (
            <Button
              onClick={() => send("copy")}
              disabled={sending !== null}
              className="brand-bg gap-2 text-white active:scale-[0.98]"
            >
              {sending === "copy" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : copied ? (
                <Check size={16} />
              ) : (
                <LinkIcon size={16} />
              )}
              {copied ? t("sendlink.copied") : t("sendlink.btn_copy")}
            </Button>
          )}
          {channel === "whatsapp" && (
            <Button
              onClick={() => send("whatsapp")}
              disabled={sending !== null || phone.trim().length < 6}
              className="gap-2 bg-green-600 text-white hover:bg-green-500 active:scale-[0.98]"
            >
              {sending === "whatsapp" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <MessageCircle size={16} />
              )}
              {t("sendlink.btn_whatsapp")}
            </Button>
          )}
          {channel === "email" && (
            <Button
              onClick={() => send("email")}
              disabled={sending !== null || !email.includes("@")}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]"
            >
              {sending === "email" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mail size={16} />
              )}
              {t("sendlink.btn_email")}
            </Button>
          )}
          {!channel && (
            <Button disabled className="brand-bg gap-2 text-white">
              {t("sendlink.select_channel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
