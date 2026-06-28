"use client";

import { useState } from "react";
import { PenTool, Send, Loader2, FileText, Plus, Trash2 } from "lucide-react";
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
import { useLang } from "@/lib/use-lang";

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
      // Fetch documents as base64
      const docs = await Promise.all(
        documents
          .filter((d) => d.url)
          .map(async (d, i) => {
            const res = await fetch(d.url!);
            const blob = await res.blob();
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
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

      const res = await fetch("/api/docusign/send", {
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

      const data = await res.json();
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
    } catch {
      addToast({ title: t("docusign.sent_error"), type: "error" });
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
        </DialogHeader>

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
                    type="email"
                    placeholder="email@example.com"
                    value={signer.email}
                    onChange={(e) => updateSigner(idx, "email", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Name"
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
            disabled={sending || !subject || signers.every((s) => !s.email)}
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
