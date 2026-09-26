"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestAiRelease, type ReleaseSummary } from "@/lib/ai-release-client";

/**
 * Schritt „Prüfen und freigeben“ vor Export/Versand von KI-Text: der Server
 * prüft die Zitate genau dieses Textes und stellt die anwaltliche Freigabe
 * aus (bei nicht verifizierten Zitaten nur mit Begründung, protokolliert).
 * Die Freigabe gilt nur für diesen Text — jede Änderung verlangt eine neue.
 */
export function AiReleasePanel({
  content,
  slug,
  title,
  released,
  onReleased,
}: {
  content?: string;
  slug?: string;
  title?: string;
  /** Token already issued for this exact text (parent keeps it). */
  released: string | null;
  onReleased: (token: string, releasedBy?: string, overrideReason?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState<ReleaseSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [releasedBy, setReleasedBy] = useState<string | null>(null);

  // A new text starts the release over.
  useEffect(() => {
    setNeedsReason(null);
    setReason("");
    setMessage(null);
  }, [content, slug]);

  async function release() {
    setBusy(true);
    setMessage(null);
    const result = await requestAiRelease({
      content,
      slug,
      title,
      overrideReason: needsReason ? reason : undefined,
    });
    setBusy(false);
    if (result.kind === "released") {
      setNeedsReason(null);
      setReleasedBy(result.releasedBy ?? null);
      onReleased(result.token, result.releasedBy, needsReason ? reason.trim() : undefined);
    } else if (result.kind === "reason_required") {
      setNeedsReason(
        result.summary ?? {
          state: "NEEDS_HUMAN_REVIEW",
          citations_verified: 0,
          citations_unverified: 0,
          warning: null,
          override_required: true,
        }
      );
      if (needsReason) setMessage("Bitte eine Begründung mit mindestens 10 Zeichen angeben.");
    } else {
      setMessage(result.message);
    }
  }

  if (released) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-3 py-2 text-xs text-[color:var(--ds-text)]"
      >
        <CheckCircle2 size={14} className="text-[color:var(--ds-success-text)]" />
        Zitate geprüft und anwaltlich freigegeben{releasedBy ? ` (${releasedBy})` : ""} — Export und
        Versand sind für diesen Text möglich.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] px-3 py-3 text-xs">
      <p className="flex items-center gap-2 font-medium text-[color:var(--ds-text)]">
        <ShieldCheck size={14} />
        Vor Export oder Versand: 1. Zitate prüfen · 2. anwaltlich freigeben · 3. exportieren
      </p>
      {needsReason && (
        <div className="space-y-2">
          <p className="flex items-start gap-2 text-[color:var(--ds-warning-text)]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {needsReason.citations_unverified} von{" "}
            {needsReason.citations_unverified + needsReason.citations_verified} Zitat(en) konnten
            nicht verifiziert werden. Eine Freigabe ist nur mit Begründung möglich; sie wird
            protokolliert.
          </p>
          <Textarea
            aria-label="Begründung der Freigabe"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z. B. Zitate händisch im RIS geprüft"
            rows={2}
          />
        </div>
      )}
      {message && (
        <p role="alert" className="text-[color:var(--ds-danger-text)]">
          {message}
        </p>
      )}
      <Button
        size="sm"
        onClick={release}
        disabled={busy || (!content && !slug) || (!!needsReason && reason.trim().length < 10)}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        {needsReason ? "Mit Begründung freigeben" : "Prüfen und freigeben"}
      </Button>
    </div>
  );
}

/** Modal wrapper for surfaces that only learn at export time that a release is needed. */
export function AiReleaseDialog({
  open,
  content,
  title,
  reason,
  onClose,
  onReleased,
}: {
  open: boolean;
  content: string;
  title?: string;
  /** The server's explanation why the export was refused. */
  reason?: string | null;
  onClose: () => void;
  onReleased: (token: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>KI-Text freigeben</DialogTitle>
        </DialogHeader>
        {reason && <p className="text-sm text-[color:var(--ds-text-muted)]">{reason}</p>}
        <AiReleasePanel
          content={content}
          title={title}
          released={null}
          onReleased={(token) => onReleased(token)}
        />
      </DialogContent>
    </Dialog>
  );
}
