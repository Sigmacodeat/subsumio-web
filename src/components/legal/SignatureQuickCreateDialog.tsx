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
import { Checkbox } from "@/components/ui/checkbox";
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
import { enqueueMutation, isOnline } from "@/lib/offline-store";
import { buildNdaTemplate } from "@/lib/nda-template";

type DocumentTemplate = "manual" | "nda";

interface SignatureQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  presetCaseSlug?: string;
}

export function SignatureQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  presetCaseSlug,
}: SignatureQuickCreateDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [template, setTemplate] = useState<DocumentTemplate>("manual");
  // A request can only be sent through the client portal of its matter —
  // without a preset, the matter is chosen here.
  const [pickedCaseSlug, setPickedCaseSlug] = useState("");
  const caseSlug = presetCaseSlug || pickedCaseSlug;

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
    setTemplate("manual");
    setPickedCaseSlug("");
  }, [sigForm]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  const { data: drafts } = useDialogFetch<BrainPage[]>(open, async () => {
    return await api.brain.listAllPages({ type: "legal_document", max: 100 });
  });

  const { data: matters } = useDialogFetch<BrainPage[]>(open && !presetCaseSlug, async () => {
    return await api.brain.listAllPages({ type: "legal_case", max: 2000 });
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isValid = await sigForm.trigger();
    if (!isValid) return;
    if (!caseSlug) {
      addToast({ type: "error", title: "Bitte eine Akte auswählen." });
      return;
    }
    const data = sigForm.getValues();
    setSaving(true);
    const now = new Date();
    const slug = `legal/signatures/${now.toISOString().split("T")[0]}-${data.documentName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 60)}`;
    const expiresAt = new Date(Date.now() + parseInt(data.expiresDays) * 86400000).toISOString();
    const content =
      template === "nda"
        ? buildNdaTemplate({ recipientName: data.recipientName.trim() })
        : `Empfänger: ${data.recipientName} <${data.recipientEmail}>`;
    try {
      const payload = {
        slug,
        title: `Signatur: ${data.documentName.trim()}`,
        type: "signature_request",
        content,
        frontmatter: {
          type: "signature_request",
          document_name: data.documentName.trim(),
          recipient_name: data.recipientName.trim(),
          recipient_email: data.recipientEmail.trim(),
          status: "draft",
          expires_at: expiresAt,
          created_at: now.toISOString(),
          // "template": the text stored on this page IS the document — the
          // portal renders it before signing. "external": this row only
          // tracks who needs to sign what; the actual document lives
          // elsewhere (paper, DocuSign, an emailed PDF).
          provider: template === "nda" ? "template" : "external",
          case_slug: caseSlug,
        },
      };
      if (isOnline()) await api.brain.createPage(payload);
      else await enqueueMutation({ type: "createPage", payload });
      addToast({ type: "success", title: t("signature.quick_created" as DashboardKey) });
      if (createAnother) {
        resetForm();
        return;
      }
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
    !!caseSlug &&
    !!sigForm.watch("documentName") &&
    !!sigForm.watch("recipientName") &&
    !!sigForm.watch("recipientEmail");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-category-indigo-border)] bg-[color:var(--ds-category-indigo-bg)]">
                <FileSignature size={16} className="text-[color:var(--ds-category-indigo-text)]" />
              </div>
              <DialogTitle>{t("signature.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("signature.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Template selector */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-sig-template" className="text-xs">
                {t("signature.quick_template" as DashboardKey)}
              </Label>
              <Select
                value={template}
                onValueChange={(v) => {
                  const next = v as DocumentTemplate;
                  setTemplate(next);
                  if (next === "nda" && !sigForm.getValues("documentName")) {
                    sigForm.setValue(
                      "documentName",
                      t("signature.quick_template_nda" as DashboardKey)
                    );
                  }
                }}
              >
                <SelectTrigger id="quick-sig-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    {t("signature.quick_template_manual" as DashboardKey)}
                  </SelectItem>
                  <SelectItem value="nda">
                    {t("signature.quick_template_nda" as DashboardKey)}
                  </SelectItem>
                </SelectContent>
              </Select>
              {template === "nda" && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("signature.quick_template_nda_hint" as DashboardKey)}
                </p>
              )}
            </div>

            {/* Matter (only when not opened from a matter) */}
            {!presetCaseSlug && (
              <div className="space-y-1.5">
                <Label htmlFor="quick-sig-case" className="text-xs">
                  Akte *
                </Label>
                <Select value={pickedCaseSlug} onValueChange={setPickedCaseSlug}>
                  <SelectTrigger id="quick-sig-case">
                    <SelectValue placeholder="Akte auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {(matters ?? []).map((m) => (
                      <SelectItem key={m.slug} value={m.slug}>
                        {m.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                placeholder={t("sigqc.placeholder_title")}
                autoFocus
              />
              {sigForm.formState.errors.documentName && (
                <p className="text-xs text-[color:var(--ds-danger-text)]">
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
                  autoComplete="email"
                  inputMode="email"
                  {...sigForm.register("recipientEmail")}
                  placeholder="max@example.com"
                />
                {sigForm.formState.errors.recipientEmail && (
                  <p className="text-xs text-[color:var(--ds-danger-text)]">
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
              <Input
                id="quick-sig-expires"
                type="number"
                inputMode="numeric"
                {...sigForm.register("expiresDays")}
              />
              {sigForm.formState.errors.expiresDays && (
                <p className="text-xs text-[color:var(--ds-danger-text)]">
                  {sigForm.formState.errors.expiresDays.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="signature-create-another"
                checked={createAnother}
                onCheckedChange={(v) => setCreateAnother(v === true)}
              />
              <Label
                htmlFor="signature-create-another"
                className="text-xs font-normal text-[color:var(--ds-text-muted)]"
              >
                {t("common.create_another")}
              </Label>
            </div>
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
                className="gap-2 bg-[color:var(--ds-category-indigo-text)] text-white hover:opacity-90"
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
