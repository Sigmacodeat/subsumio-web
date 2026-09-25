"use client";

import { useEffect, useState } from "react";
import { Mail, Send, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";

interface EmailDocument {
  name: string;
  slug: string;
}

interface EmailComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseSlug?: string;
  caseNumber?: string;
  recipientEmail?: string;
  recipientName?: string;
  /** Documents of the case that can be attached. When omitted and caseSlug is
   *  set, the dialog lists the case's legal_document pages itself. */
  documents?: EmailDocument[];
}

export function EmailComposeDialog({
  open,
  onOpenChange,
  caseSlug,
  caseNumber,
  recipientEmail,
  recipientName,
  documents,
}: EmailComposeDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [to, setTo] = useState(recipientEmail ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(caseNumber ? `Akte ${caseNumber}` : "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<EmailDocument[]>(documents ?? []);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  // No documents prop → list the case's documents ourselves.
  useEffect(() => {
    if (!open || documents !== undefined || !caseSlug) return;
    let cancelled = false;
    api.brain
      .listAllPages({ type: "legal_document", max: 200 })
      .then((pages) => {
        if (cancelled) return;
        setAvailableDocs(
          pages
            .filter((p) => {
              const fm = (p.frontmatter ?? {}) as { case_slug?: string };
              return fm.case_slug === caseSlug || p.slug.startsWith(`${caseSlug}/`);
            })
            .map((p) => ({ name: p.title || p.slug.split("/").pop() || p.slug, slug: p.slug }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, caseSlug, documents]);

  useEffect(() => {
    if (documents) setAvailableDocs(documents);
  }, [documents]);

  function toggleDoc(slug: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else if (next.size < 5) next.add(slug);
      return next;
    });
  }

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    try {
      const res = await csrfFetch("/api/cases/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          subject,
          body,
          caseSlug,
          attachment_slugs: selectedDocs.size > 0 ? [...selectedDocs] : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast({ title: t("email.sent_ok"), type: "success" });
        onOpenChange(false);
        setTo("");
        setCc("");
        setSubject("");
        setBody("");
        setSelectedDocs(new Set());
      } else {
        addToast({
          title: t("email.sent_error"),
          description: data.error ?? "Unknown error",
          type: "error",
        });
      }
    } catch {
      addToast({ title: t("email.sent_error"), type: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={18} />
            {t("email.compose_title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email-to">{t("email.to")}</Label>
            <Input
              id="email-to"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={
                recipientName ? `${recipientName} <email@example.com>` : "empfaenger@example.com"
              }
            />
          </div>

          <div>
            <Label htmlFor="email-cc">CC</Label>
            <Input
              id="email-cc"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com (optional)"
            />
          </div>

          <div>
            <Label htmlFor="email-subject">{t("email.subject")}</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="email-body">{t("email.body")}</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder={t("email.body_placeholder")}
            />
          </div>

          {caseSlug && availableDocs.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--ds-text)]">
                <Paperclip size={14} aria-hidden="true" />
                {t("email.attachments")}
                {selectedDocs.size > 0 && (
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    ({selectedDocs.size}/5)
                  </span>
                )}
              </legend>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-[color:var(--ds-border)] p-2">
                {availableDocs.map((doc) => (
                  <label
                    key={doc.slug}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[color:var(--ds-surface-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.slug)}
                      onChange={() => toggleDoc(doc.slug)}
                      disabled={!selectedDocs.has(doc.slug) && selectedDocs.size >= 5}
                      className="h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-[var(--brand-primary)]"
                    />
                    <span className="truncate">{doc.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSend} disabled={sending || !to || !subject || !body}>
            {sending ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Send size={16} className="mr-2" />
            )}
            {t("email.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
