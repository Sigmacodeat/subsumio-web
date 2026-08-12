"use client";

import * as React from "react";
import { Loader2, PenTool, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignaturePad, type SignaturePadChange } from "@/components/ui/signature-pad";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import {
  LEGAL_LEVEL_LABELS,
  type SignatureFormat,
  type SignatureLegalLevel,
} from "@/lib/signature-capture";

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Brain page slug of the document to sign. */
  documentSlug: string;
  /** Document type for audit + storage. */
  documentType: "signature_request" | "power_of_attorney" | "legal_document";
  /** Document title shown in the dialog header. */
  documentTitle: string;
  /** Pre-filled signer name (e.g. from case/client data). */
  signerName?: string;
  /** Pre-filled signer email. */
  signerEmail?: string;
  /** Legal level — defaults to "simple" (canvas/typed). */
  legalLevel?: SignatureLegalLevel;
  /** Called after successful capture. */
  onSigned?: (signatureId: string) => void;
  /** Whether this is a client-facing (portal) context. */
  isClientFacing?: boolean;
}

export function SignatureDialog({
  open,
  onOpenChange,
  documentSlug,
  documentType,
  documentTitle,
  signerName = "",
  signerEmail,
  legalLevel = "simple",
  onSigned,
  isClientFacing = false,
}: SignatureDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [signature, setSignature] = React.useState<SignaturePadChange | null>(null);
  const [name, setName] = React.useState(signerName);
  const [email, setEmail] = React.useState(signerEmail ?? "");
  const [saving, setSaving] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSignature(null);
      setName(signerName);
      setEmail(signerEmail ?? "");
      setConfirmed(false);
    }
  }, [open, signerName, signerEmail]);

  const levelLabels = LEGAL_LEVEL_LABELS[legalLevel];
  const canSubmit =
    !!signature && !signature.empty && name.trim().length >= 2 && confirmed && !saving;

  async function handleSign() {
    if (!signature || signature.empty || name.trim().length < 2) return;
    setSaving(true);
    try {
      const format: SignatureFormat =
        signature.mode === "draw" ? "canvas_png" : "typed_name";
      const res = await csrfFetch("/api/signature/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_slug: documentSlug,
          document_type: documentType,
          signer_name: name.trim(),
          signer_email: email.trim() || undefined,
          signature_format: format,
          signature_data: signature.dataUrl,
          signature_paths: signature.paths,
          legal_level: legalLevel,
        }),
      });
      const data = await res.json();
      if (data.ok && data.signature) {
        addToast({
          title: t("sigdialog.signed_ok"),
          description: t("sigdialog.signed_desc"),
          type: "success",
        });
        onSigned?.(data.signature.id as string);
        onOpenChange(false);
      } else {
        addToast({
          title: t("sigdialog.signed_error"),
          description: data.error ?? undefined,
          type: "error",
        });
      }
    } catch (err) {
      addToast({
        title: t("sigdialog.signed_error"),
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <PenTool size={18} />
            {t("sigdialog.title")}
          </DialogTitle>
          <DialogDescription>
            {documentTitle} — {t("sigdialog.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-2">
          {/* Legal level badge — DACH requirement */}
          <div
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              legalLevel === "qualified"
                ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
                : legalLevel === "advanced"
                  ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]"
                  : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
            }`}
            role="alert"
          >
            {legalLevel === "qualified" ? (
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]" />
            ) : (
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {t("sigdialog.legal_level")}:{" "}
                  <Badge variant="default" className="ml-1 text-xs">
                    {levelLabels.de}
                  </Badge>
                </span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {levelLabels.warning_de}
              </p>
            </div>
          </div>

          {/* Signer name + email */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="sigdialog-name"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("sigdialog.signer_name")} *
              </label>
              <input
                id="sigdialog-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="min-h-11 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-base text-[color:var(--ds-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 sm:min-h-0 sm:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="sigdialog-email"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("sigdialog.signer_email")}
                {isClientFacing ? " *" : ""}
              </label>
              <input
                id="sigdialog-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={isClientFacing}
                autoComplete="email"
                inputMode="email"
                className="min-h-11 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-base text-[color:var(--ds-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 sm:min-h-0 sm:text-sm"
              />
            </div>
          </div>

          {/* Signature pad */}
          <SignaturePad
            onChange={setSignature}
            instructions={t("sigdialog.instructions")}
            canvasAriaLabel={t("sigdialog.canvas_aria")}
          />

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border)] accent-[color:var(--brand-primary)]"
            />
            <span className="text-[color:var(--ds-text-muted)]">
              {t("sigdialog.confirm")}
            </span>
          </label>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSign}
            disabled={!canSubmit}
            className="brand-bg gap-2 text-white active:scale-[0.98]"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <PenTool size={16} />
            )}
            {t("sigdialog.btn_sign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
