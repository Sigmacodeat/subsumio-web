"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Download,
  Send,
  Loader2,
  Check,
  X,
  PenSquare,
  FileText,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { generateDraftPdf } from "@/lib/legal-draft-pdf";

export interface DraftInfo {
  slug: string;
  title: string;
  draftType: string;
  status: string;
  content: string;
  attorneyReviewRequired: boolean;
  caseRef?: string;
}

interface DraftEditorProps {
  draft: DraftInfo;
  caseSlug: string;
  caseTitle?: string;
  kanzleiName?: string;
  recipientEmail?: string;
  recipientName?: string;
  onSaved?: () => void;
}

type EditorMode = "view" | "edit";

export function DraftEditor({
  draft,
  caseSlug,
  caseTitle: _caseTitle,
  kanzleiName,
  recipientEmail,
  recipientName,
  onSaved,
}: DraftEditorProps) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<EditorMode>("view");
  const [content, setContent] = useState(draft.content);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState(recipientEmail || "");
  const [emailSubject, setEmailSubject] = useState(draft.title);
  const [emailBody, setEmailBody] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setContent(draft.content);
  }, [draft.content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const slugPath = draft.slug.split("/").map(encodeURIComponent).join("/");
      const res = await csrfFetch(`/api/pages/${slugPath}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          frontmatter: {
            status: "reviewed",
            attorney_reviewed_at: new Date().toISOString(),
          },
          merge: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(new Date().toISOString());
      setMode("view");
      addToast({
        type: "success",
        title: "Schriftsatz gespeichert",
        description: "Die Änderungen wurden übernommen.",
        duration: 3000,
      });
      onSaved?.();
    } catch (err) {
      addToast({
        type: "error",
        title: "Speichern fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }, [content, draft.slug, addToast, onSaved]);

  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      const doc = generateDraftPdf({
        title: draft.title,
        caseRef: caseSlug,
        draftType: draft.draftType,
        content: mode === "edit" ? content : draft.content,
        kanzlei: { name: kanzleiName },
      });
      const fileName = `${draft.draftType}-${caseSlug}.pdf`;
      doc.save(fileName);
      addToast({
        type: "success",
        title: "PDF exportiert",
        description: fileName,
        duration: 3000,
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "PDF-Export fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setExporting(false);
    }
  }, [draft, caseSlug, content, mode, kanzleiName, addToast]);

  const handleSendEmail = useCallback(async () => {
    if (!emailTo.trim()) {
      addToast({
        type: "error",
        title: "Empfänger fehlt",
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
        duration: 3000,
      });
      return;
    }
    setSendingEmail(true);
    try {
      const draftContent = mode === "edit" ? content : draft.content;
      const emailText = emailBody.trim() ? `${emailBody}\n\n---\n\n${draftContent}` : draftContent;

      const res = await csrfFetch("/api/email/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject || draft.title,
          text: emailText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const sent = data.message?.status === "sent";
      addToast({
        type: sent ? "success" : "info",
        title: sent ? "E-Mail gesendet" : "E-Mail queued",
        description: sent
          ? `Schriftsatz an ${emailTo} gesendet.`
          : "E-Mail-Provider nicht konfiguriert — Inhalt wurde protokolliert.",
        duration: 5000,
      });
      setShowEmailDialog(false);
      setEmailBody("");
    } catch (err) {
      addToast({
        type: "error",
        title: "E-Mail senden fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        duration: 5000,
      });
    } finally {
      setSendingEmail(false);
    }
  }, [emailTo, emailSubject, emailBody, content, draft, mode, addToast]);

  const isDraft = draft.status === "draft";

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[color:var(--ds-text-muted)]" />
          <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">{draft.title}</h4>
          <Badge
            variant="default"
            className={
              isDraft
                ? "border border-amber-500/30 bg-amber-500/10 text-xs text-amber-600"
                : "border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600"
            }
          >
            {isDraft ? "Entwurf" : draft.status === "reviewed" ? "Geprüft" : draft.status}
          </Badge>
          {draft.attorneyReviewRequired && (
            <Badge
              variant="default"
              className="border border-orange-500/30 bg-orange-500/10 text-xs text-orange-600"
            >
              Anwaltsprüfung erforderlich
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mode === "view" ? (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)]"
              onClick={() => setMode("edit")}
            >
              <PenSquare size={12} />
              Bearbeiten
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  setMode("view");
                  setContent(draft.content);
                }}
              >
                <X size={12} />
                Abbrechen
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="brand-bg gap-1.5 text-xs text-white"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : savedAt ? (
                  <Check size={12} />
                ) : (
                  <Save size={12} />
                )}
                Speichern
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)]"
            disabled={exporting}
            onClick={handleExportPdf}
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)]"
            onClick={() => {
              setEmailSubject(draft.title);
              setShowEmailDialog(true);
            }}
          >
            <Send size={12} />
            Per E-Mail
          </Button>
        </div>
      </div>

      {/* Content / Editor */}
      {mode === "view" ? (
        <div className="max-h-[500px] overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-4">
          <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
            {draft.content}
          </pre>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="h-[500px] w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-4 text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          placeholder="Schriftsatz bearbeiten..."
        />
      )}

      {/* Email Dialog */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Mail size={18} className="brand-text" />
              <h3 className="text-base font-semibold text-[color:var(--ds-text)]">
                Schriftsatz per E-Mail versenden
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Empfänger
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="empfaenger@gericht.gv.at"
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                {recipientName && !emailTo && recipientEmail && (
                  <button
                    onClick={() => setEmailTo(recipientEmail)}
                    className="mt-1 text-xs text-[color:var(--brand-primary)] hover:underline"
                  >
                    {recipientName} verwenden
                  </button>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Betreff
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  Begleitschreiben (optional)
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={4}
                  placeholder="Sehr geehrte Damen und Herren, anbei übersende ich..."
                  className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  Der Schriftsatz wird als Text an das Begleitschreiben angehängt.
                </p>
              </div>
            </div>

            {draft.attorneyReviewRequired && (
              <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-orange-600" />
                <p className="text-xs text-orange-700">
                  Dieser Schriftsatz wurde noch nicht von einem Anwalt geprüft. Bitte prüfen Sie den
                  Inhalt vor dem Versand.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => setShowEmailDialog(false)}
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="brand-bg gap-1.5 text-xs text-white"
                disabled={sendingEmail || !emailTo.trim()}
                onClick={handleSendEmail}
              >
                {sendingEmail ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Senden
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
