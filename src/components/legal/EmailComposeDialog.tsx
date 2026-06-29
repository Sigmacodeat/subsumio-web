"use client";

import { useState } from "react";
import { Mail, Send, Loader2 } from "lucide-react";
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

interface EmailComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseSlug?: string;
  caseNumber?: string;
  recipientEmail?: string;
  recipientName?: string;
}

export function EmailComposeDialog({
  open,
  onOpenChange,
  caseSlug,
  caseNumber,
  recipientEmail,
  recipientName,
}: EmailComposeDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [to, setTo] = useState(recipientEmail ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(caseNumber ? `Akte ${caseNumber}` : "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    try {
      const res = await fetch("/api/cases/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc: cc || undefined, subject, body, caseSlug }),
      });
      const data = await res.json();
      if (data.ok) {
        addToast({ title: t("email.sent_ok"), type: "success" });
        onOpenChange(false);
        setTo("");
        setCc("");
        setSubject("");
        setBody("");
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
              placeholder="Sehr geehrte/r..."
            />
          </div>
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
