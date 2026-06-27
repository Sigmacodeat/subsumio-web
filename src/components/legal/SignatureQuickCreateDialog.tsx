"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDialogFetch } from "@/lib/use-dialog-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PenTool, FileSignature } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { signatureRequestSchema, type SignatureRequestFormData } from "@/lib/schemas/signature";
import type { BrainPage } from "@/lib/types";

interface SignatureQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function SignatureQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: SignatureQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);

  const sigForm = useForm<SignatureRequestFormData>({
    resolver: zodResolver(signatureRequestSchema) as never,
    defaultValues: {
      documentName: "",
      recipientName: "",
      recipientEmail: "",
      expiresDays: "14",
    },
  });

  const resetForm = useCallback(() => {
    sigForm.reset({ documentName: "", recipientName: "", recipientEmail: "", expiresDays: "14" });
  }, [sigForm]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  const { data: drafts } = useDialogFetch<BrainPage[]>(open, async () => {
    return await api.brain.listPages({ type: "legal_document", limit: 100 });
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isValid = await sigForm.trigger();
    if (!isValid) return;
    const data = sigForm.getValues();
    setSaving(true);
    const now = new Date();
    const slug = `legal/signatures/${now.toISOString().split("T")[0]}-${data.documentName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 60)}`;
    const expiresAt = new Date(Date.now() + parseInt(data.expiresDays) * 86400000).toISOString();
    try {
      await api.brain.createPage({
        slug,
        title: `Signatur: ${data.documentName.trim()}`,
        type: "signature_request",
        content: `Empfänger: ${data.recipientName} <${data.recipientEmail}>`,
        frontmatter: {
          type: "signature_request",
          document_name: data.documentName.trim(),
          recipient_name: data.recipientName.trim(),
          recipient_email: data.recipientEmail.trim(),
          status: "draft",
          expires_at: expiresAt,
          created_at: now.toISOString(),
          provider: "external",
        },
      });
      addToast({ type: "success", title: t("signature.quick_created" as DashboardKey) });
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      const msg =
        err instanceof Error
          ? `${t("signature.error_save" as DashboardKey)}: ${err.message}`
          : t("signature.error_save" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    !!sigForm.watch("documentName") &&
    !!sigForm.watch("recipientName") &&
    !!sigForm.watch("recipientEmail");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
                <FileSignature size={16} className="text-indigo-600" />
              </div>
              <DialogTitle>{t("signature.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("signature.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Draft selector */}
            {(drafts ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="quick-sig-draft" className="text-xs">
                  {t("signature.quick_select_draft" as DashboardKey)}
                </Label>
                <Select
                  value=""
                  onValueChange={(v) => {
                    const draft = (drafts ?? []).find((d) => d.slug === v);
                    if (draft) sigForm.setValue("documentName", draft.title);
                  }}
                >
                  <SelectTrigger id="quick-sig-draft">
                    <SelectValue placeholder={t("signature.quick_manual" as DashboardKey)} />
                  </SelectTrigger>
                  <SelectContent>
                    {(drafts ?? []).map((d) => (
                      <SelectItem key={d.slug} value={d.slug}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Document name */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-sig-doc" className="text-xs">
                {t("signature.quick_document" as DashboardKey)} *
              </Label>
              <Input
                id="quick-sig-doc"
                {...sigForm.register("documentName")}
                placeholder={
                  lang === "en" ? "e.g. Mandate agreement GmbH" : "z.B. Mandatsvereinbarung GmbH"
                }
                autoFocus
              />
              {sigForm.formState.errors.documentName && (
                <p className="text-xs text-red-600">
                  {sigForm.formState.errors.documentName.message}
                </p>
              )}
            </div>

            {/* Recipient name + email */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-sig-name" className="text-xs">
                  {t("signature.quick_recipient" as DashboardKey)} *
                </Label>
                <Input
                  id="quick-sig-name"
                  {...sigForm.register("recipientName")}
                  placeholder="Max Mustermann"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-sig-email" className="text-xs">
                  {t("signature.quick_email" as DashboardKey)} *
                </Label>
                <Input
                  id="quick-sig-email"
                  type="email"
                  {...sigForm.register("recipientEmail")}
                  placeholder="max@example.com"
                />
                {sigForm.formState.errors.recipientEmail && (
                  <p className="text-xs text-red-600">
                    {sigForm.formState.errors.recipientEmail.message}
                  </p>
                )}
              </div>
            </div>

            {/* Expires days */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-sig-expires" className="text-xs">
                {t("signature.quick_expires" as DashboardKey)}
              </Label>
              <Input id="quick-sig-expires" type="number" {...sigForm.register("expiresDays")} />
              {sigForm.formState.errors.expiresDays && (
                <p className="text-xs text-red-600">
                  {sigForm.formState.errors.expiresDays.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {t("signature.btn_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !canSubmit}
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-500"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
                {t("signature.quick_save" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
