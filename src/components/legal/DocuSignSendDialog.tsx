"use client";

import { useEffect, useState } from "react";
import { PenTool, Send, Loader2, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";

import { unwrapApiBody } from "@/lib/api-body";
interface DocuSignSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseSlug?: string;
  caseTitle?: string;
  documents?: Array<{ name: string; slug: string; url?: string }>;
}

interface Signer {
  email: string;
  name: string;
}

class DocumentFetchError extends Error {
  constructor(readonly documentName: string) {
    super(`document fetch failed: ${documentName}`);
    this.name = "DocumentFetchError";
  }
}

export function DocuSignSendDialog({
  open,
  onOpenChange,
  caseSlug,
  caseTitle,
  documents = [],
}: DocuSignSendDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [subject, setSubject] = useState(caseTitle ? `Zur Unterschrift: ${caseTitle}` : "");
  const [blurb, setBlurb] = useState("");
  const [signers, setSigners] = useState<Signer[]>([{ email: "", name: "" }]);
  const [sending, setSending] = useState(false);
  // null while checking; false when DocuSign is not set up for this installation.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/docusign/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (b: {
          configured?: boolean;
          environment?: string;
          data?: { configured?: boolean; environment?: string };
        }) => {
          if (cancelled) return;
          setAvailable(Boolean(b.configured ?? b.data?.configured));
          setEnvironment(b.environment ?? b.data?.environment ?? null);
        }
      )
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  function addSigner() {
    setSigners([...signers, { email: "", name: "" }]);
  }

  function removeSigner(idx: number) {
    setSigners(signers.filter((_, i) => i !== idx));
  }

  function updateSigner(idx: number, field: keyof Signer, value: string) {
    setSigners(signers.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  async function handleSend() {
    const validSigners = signers.filter((s) => s.email && s.name);
    if (validSigners.length === 0 || !subject) return;

    setSending(true);
    try {
      // Fetch documents as base64 (chunked to avoid stack overflow on large files)
      const docs = await Promise.all(
        documents
          .filter((d) => d.url)
          .map(async (d, i) => {
            const res = await fetch(d.url!);
            // A failed download (expired session, missing file) must never be
            // sent as the "document".
            if (!res.ok) throw new DocumentFetchError(d.name);
            const blob = await res.blob();
            const buffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            const CHUNK = 0x8000;
            for (let j = 0; j < bytes.length; j += CHUNK) {
              binary += String.fromCharCode(...bytes.subarray(j, j + CHUNK));
            }
            const base64 = btoa(binary);
            return {
              documentBase64: base64,
              name: d.name,
              documentId: `doc-${i + 1}`,
            };
          })
      );

      if (docs.length === 0) {
        addToast({
          title: t("docusign.no_documents"),
          type: "error",
        });
        setSending(false);
        return;
      }

      const res = await csrfFetch("/api/docusign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailSubject: subject,
          emailBlurb: blurb || undefined,
          documents: docs,
          recipients: {
            signers: validSigners.map((s, i) => ({
              email: s.email,
              name: s.name,
              recipientId: `signer-${i + 1}`,
              routingOrder: String(i + 1),
            })),
          },
          status: "sent",
          caseSlug,
          caseTitle,
        }),
      });

      const data = unwrapApiBody(await res.json());
      if (data.ok) {
        addToast({ title: t("docusign.sent_ok"), type: "success" });
        onOpenChange(false);
      } else {
        addToast({
          title: t("docusign.sent_error"),
          description: data.error ?? "Unknown error",
          type: "error",
        });
      }
    } catch (err) {
      addToast({
        title: t("docusign.sent_error"),
        ...(err instanceof DocumentFetchError
          ? {
              description: `Das Dokument „${err.documentName}" konnte nicht geladen werden. Es wurde nichts versendet.`,
            }
          : {}),
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            {t("docusign.send_title")}
          </DialogTitle>
          <DialogDescription>{t("docusign.send_desc")}</DialogDescription>
        </DialogHeader>

        {available === false && (
          <p
            role="status"
            className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-sm text-[color:var(--ds-warning-text)]"
          >
            DocuSign ist für diese Installation noch nicht eingerichtet. Solange können Sie
            Dokumente über den Portal-Link unterschreiben lassen (einfache elektronische Signatur).
          </p>
        )}
        {available && environment === "demo" && (
          <p
            role="status"
            className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-sm text-[color:var(--ds-warning-text)]"
          >
            DocuSign-Testumgebung: Unterschriften hier sind nicht rechtsverbindlich.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="ds-subject">{t("email.subject")}</Label>
            <Input id="ds-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="ds-blurb">{t("docusign.blurb")}</Label>
            <Textarea
              id="ds-blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              placeholder="Optionaler Begleittext..."
            />
          </div>

          <div>
            <Label>{t("docusign.documents")}</Label>
            <div className="space-y-1">
              {documents.length === 0 ? (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("docusign.no_documents_hint")}
                </p>
              ) : (
                documents.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <FileText size={14} className="text-[color:var(--ds-text-muted)]" />
                    {d.name}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>{t("docusign.signers")}</Label>
              <Button variant="secondary" size="sm" onClick={addSigner} type="button">
                <Plus size={12} className="mr-1" />
                {t("docusign.add_signer")}
              </Button>
            </div>
            <div className="space-y-2">
              {signers.map((signer, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    id={`ds-signer-email-${idx}`}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="email@example.com"
                    aria-label={t("docusign.signer_email_aria")}
                    value={signer.email}
                    onChange={(e) => updateSigner(idx, "email", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    id={`ds-signer-name-${idx}`}
                    placeholder="Name"
                    aria-label={t("docusign.signer_name_aria")}
                    value={signer.name}
                    onChange={(e) => updateSigner(idx, "name", e.target.value)}
                    className="flex-1"
                  />
                  {signers.length > 1 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removeSigner(idx)}
                      type="button"
                      aria-label={t("docusign.remove_signer_aria")}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || available !== true || !subject || signers.every((s) => !s.email)}
          >
            {sending ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Send size={16} className="mr-2" />
            )}
            {t("docusign.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
