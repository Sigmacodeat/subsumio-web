"use client";

import { useEffect, useState } from "react";
import {
  Save,
  FileText,
  Info,
  Loader2,
  Inbox,
  Send,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { AI_BADGE_LABEL, AI_FRONTMATTER } from "@/lib/ai-act";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  createFilingPackage,
  submitForApproval,
  approveFiling,
  cancelFiling,
  getFilingStatusLabel,
  type FilingPackage,
} from "@/lib/efiling-architecture";

interface BeaDraft {
  slug: string;
  subject: string;
  recipient: string;
  caseNumber?: string;
  createdAt: string;
  aiGenerated?: boolean;
}

/** Brain-page slug for a draft's filing package — one package per draft. */
function filingSlugForDraft(draftSlug: string): string {
  return draftSlug.replace("legal/bea-drafts/", "legal/bea-filings/");
}

interface BeaImported {
  slug: string;
  subject: string;
  sender: string;
  sentDate: string;
}

export default function BeaPage() {
  const { t } = useLang();
  const [drafts, setDrafts] = useState<BeaDraft[]>([]);
  const [imported, setImported] = useState<BeaImported[]>([]);
  const [filings, setFilings] = useState<Record<string, FilingPackage>>({});
  const [filingBusy, setFilingBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [body, setBody] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingSlug, setExportingSlug] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<
    Record<string, { confirmationCode: string; receivedAt: string; isSuccess: boolean }>
  >({});
  const [sendingSlug, setSendingSlug] = useState<string | null>(null);
  const [retryingSlug, setRetryingSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const batch = await api.brain.batchListPages(
          ["bea_draft", "bea_message", "filing_package", "bea_receipt"],
          50
        );
        if (cancelled) return;
        const draftPages = batch["bea_draft"] ?? [];
        const importedPages = batch["bea_message"] ?? [];
        const filingPages = batch["filing_package"] ?? [];
        const receiptPages = batch["bea_receipt"] ?? [];
        const receiptsByFiling: Record<
          string,
          { confirmationCode: string; receivedAt: string; isSuccess: boolean }
        > = {};
        for (const p of receiptPages) {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          const filingId = String(fm.filing_id ?? "");
          if (filingId) {
            receiptsByFiling[filingId] = {
              confirmationCode: String(fm.confirmation_code ?? ""),
              receivedAt: String(fm.received_at ?? ""),
              isSuccess: fm.is_success === true,
            };
          }
        }
        setReceipts(receiptsByFiling);
        const filingsBySlug: Record<string, FilingPackage> = {};
        for (const p of filingPages) {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          if (fm.draft_slug && typeof fm.draft_slug === "string") {
            filingsBySlug[fm.draft_slug] = fm.package as FilingPackage;
          }
        }
        setFilings(filingsBySlug);
        setDrafts(
          draftPages.map((p) => {
            const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
            return {
              slug: p.slug,
              subject: String(fm.subject ?? p.title),
              recipient: String(fm.recipient ?? "—"),
              caseNumber: fm.case_reference ? String(fm.case_reference) : undefined,
              createdAt: p.updated_at?.split("T")[0] ?? "",
              aiGenerated: fm.ai_generated === true,
            };
          })
        );
        setImported(
          importedPages.map((p) => {
            const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
            return {
              slug: p.slug,
              subject: String(fm.subject ?? p.title),
              sender: String(fm.sender ?? "—"),
              sentDate: String(fm.sent_date ?? "").split("T")[0],
            };
          })
        );
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("bea.error_load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function saveDraft() {
    if (!subject.trim() || !recipient.trim()) {
      setStatusMessage(t("bea.required_fields"));
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    const now = new Date();
    const slug = `legal/bea-drafts/${now.toISOString().split("T")[0]}-${subject
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 60)}`;
    try {
      await api.brain.createPage({
        slug,
        title: `beA-Entwurf: ${subject.trim()}`,
        type: "bea_draft",
        content: body,
        frontmatter: {
          subject: subject.trim(),
          recipient: recipient.trim(),
          case_reference: caseNumber.trim() || undefined,
          status: "draft",
          ...(aiGenerated ? AI_FRONTMATTER : {}),
        },
      });
      setDrafts((prev) => [
        {
          slug,
          subject: subject.trim(),
          recipient: recipient.trim(),
          caseNumber: caseNumber.trim() || undefined,
          createdAt: now.toISOString().split("T")[0],
          aiGenerated,
        },
        ...prev,
      ]);
      setShowCompose(false);
      setSubject("");
      setRecipient("");
      setCaseNumber("");
      setBody("");
      setAiGenerated(false);
      setStatusMessage(t("bea.draft_saved"));
    } catch (e) {
      setStatusMessage(
        e instanceof Error ? `${t("bea.save_failed")} ${e.message}` : t("bea.save_failed")
      );
    } finally {
      setSaving(false);
    }
  }

  /** Persist a FilingPackage (create-or-update) as its dedicated brain page. */
  async function saveFilingPackage(draftSlug: string, pkg: FilingPackage): Promise<void> {
    await api.brain.createPage({
      slug: filingSlugForDraft(draftSlug),
      title: `Filing-Paket: ${pkg.court_case_number ?? draftSlug}`,
      type: "filing_package",
      frontmatter: { draft_slug: draftSlug, package: pkg },
    });
    setFilings((prev) => ({ ...prev, [draftSlug]: pkg }));
  }

  async function createPackageForDraft(draft: BeaDraft): Promise<void> {
    setFilingBusy(draft.slug);
    try {
      const pkg = createFilingPackage({
        case_slug: draft.caseNumber ?? draft.slug,
        brain_id: "default",
        org_id: "default",
        channel: "beA",
        court_case_number: draft.caseNumber,
        created_by: "dashboard-user",
      });
      await saveFilingPackage(draft.slug, pkg);
      setStatusMessage(t("bea.filing_created"));
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : t("bea.filing_create_failed"));
    } finally {
      setFilingBusy(null);
    }
  }

  async function advanceFiling(
    draftSlug: string,
    action: "submit" | "approve" | "cancel"
  ): Promise<void> {
    const pkg = filings[draftSlug];
    if (!pkg) return;
    setFilingBusy(draftSlug);
    try {
      const next =
        action === "submit"
          ? submitForApproval(pkg, "dashboard-user")
          : action === "approve"
            ? approveFiling(pkg, "dashboard-user")
            : cancelFiling(pkg, "dashboard-user", "Manuell verworfen im Dashboard");
      await saveFilingPackage(draftSlug, next);
      setStatusMessage(`${t("bea.filing_status")} ${getFilingStatusLabel(next.status)}.`);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : t("bea.filing_update_failed"));
    } finally {
      setFilingBusy(null);
    }
  }

  async function exportXJustiz(draft: BeaDraft): Promise<void> {
    setExportingSlug(draft.slug);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/bea/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getCsrfHeaders()),
        },
        body: JSON.stringify({
          case_slug: draft.slug,
          court: draft.recipient || "Amtsgericht",
          case_number: draft.caseNumber,
          subject: draft.subject,
          sender_name: "Kanzlei",
          priority: "normal",
          documents: [
            {
              title: draft.subject,
              file_path: draft.slug,
              mime_type: "application/pdf",
              size_bytes: 0,
              file_hash: "pending",
              is_main_document: true,
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const blob = new Blob([data.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xjustiz-${data.filingId}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage("XJustiz-Paket heruntergeladen. Im beA-Portal hochladen.");
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setExportingSlug(null);
    }
  }

  async function sendViaMiddleware(draft: BeaDraft): Promise<void> {
    const pkg = filings[draft.slug];
    if (!pkg) return;
    setSendingSlug(draft.slug);
    setStatusMessage(null);
    try {
      const res = await api.bea.send({
        filing_slug: filingSlugForDraft(draft.slug),
        draft_slug: draft.slug,
        court: draft.recipient || "Amtsgericht",
        case_number: draft.caseNumber,
        subject: draft.subject,
        sender_name: "Kanzlei",
        priority: pkg.priority ?? "normal",
        deadline_date: pkg.deadline_date,
        deadline_id: pkg.deadline_id,
        documents: pkg.documents.map((d) => ({
          title: d.title,
          file_path: d.file_path,
          mime_type: d.mime_type,
          size_bytes: d.size_bytes,
          file_hash: d.file_hash,
          is_main_document: d.is_main_document,
        })),
      });
      const data = res as Record<string, unknown>;
      if (data.status === "sent") {
        setStatusMessage(`beA-Versand erfolgreich. Bestätigungscode: ${data.confirmation_code}`);
      } else if (data.status === "sending" && !data.middleware_configured) {
        const xml = data.xml as string;
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `xjustiz-${data.filing_id}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatusMessage(
          "Keine Middleware konfiguriert — XJustiz-XML heruntergeladen. Bitte manuell im beA-Portal hochladen."
        );
      } else {
        setStatusMessage(`Versand-Status: ${data.status}`);
      }
      // Reload filings to get updated state
      const batch = await api.brain.batchListPages(["filing_package"], 50);
      const filingPages = batch["filing_package"] ?? [];
      const filingsBySlug: Record<string, FilingPackage> = {};
      for (const p of filingPages) {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        if (fm.draft_slug && typeof fm.draft_slug === "string") {
          filingsBySlug[fm.draft_slug] = fm.package as FilingPackage;
        }
      }
      setFilings(filingsBySlug);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : "Versand fehlgeschlagen");
    } finally {
      setSendingSlug(null);
    }
  }

  async function retrySend(draft: BeaDraft): Promise<void> {
    const pkg = filings[draft.slug];
    if (!pkg) return;
    setRetryingSlug(draft.slug);
    setStatusMessage(null);
    try {
      const res = await api.bea.retry({
        filing_slug: filingSlugForDraft(draft.slug),
        draft_slug: draft.slug,
        court: draft.recipient || "Amtsgericht",
        case_number: draft.caseNumber,
        subject: draft.subject,
        sender_name: "Kanzlei",
        priority: pkg.priority ?? "normal",
        deadline_date: pkg.deadline_date,
        deadline_id: pkg.deadline_id,
      });
      const data = res as Record<string, unknown>;
      if (data.is_success) {
        setStatusMessage(`Retry erfolgreich. Bestätigungscode: ${data.confirmation_code}`);
      } else {
        setStatusMessage(`Retry fehlgeschlagen: ${data.status}`);
      }
      const batch = await api.brain.batchListPages(["filing_package"], 50);
      const filingPages = batch["filing_package"] ?? [];
      const filingsBySlug: Record<string, FilingPackage> = {};
      for (const p of filingPages) {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        if (fm.draft_slug && typeof fm.draft_slug === "string") {
          filingsBySlug[fm.draft_slug] = fm.package as FilingPackage;
        }
      }
      setFilings(filingsBySlug);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : "Retry fehlgeschlagen");
    } finally {
      setRetryingSlug(null);
    }
  }

  async function getCsrfHeaders(): Promise<Record<string, string>> {
    const match = document.cookie.match(/sb_csrf=([^;]+)/);
    return match ? { "x-csrf-token": match[1] } : {};
  }

  async function confirmReceipt(draft: BeaDraft): Promise<void> {
    const pkg = filings[draft.slug];
    if (!pkg) return;
    const confirmationCode = prompt("Empfangsbestätigungs-Code eingeben:")?.trim();
    if (!confirmationCode) return;
    setReceiptBusy(draft.slug);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/bea/receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getCsrfHeaders()),
        },
        body: JSON.stringify({
          filing_id: pkg.id,
          case_slug: draft.caseNumber ?? draft.slug,
          receipt_id: `receipt-${Date.now()}`,
          received_at: new Date().toISOString(),
          confirmation_code: confirmationCode,
          is_success: true,
          deadline_id: pkg.deadline_id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReceipts((prev) => ({
        ...prev,
        [pkg.id]: {
          confirmationCode,
          receivedAt: new Date().toISOString(),
          isSuccess: true,
        },
      }));
      setStatusMessage(
        data.deadline_updated
          ? `Empfangsbestätigung gespeichert. Frist als erledigt markiert.`
          : `Empfangsbestätigung gespeichert.`
      );
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : "Bestätigung fehlgeschlagen");
    } finally {
      setReceiptBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("bea.title")}
        description={t("bea.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("bea.breadcrumb") },
        ]}
        actions={
          <Button
            variant="primary"
            className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
            onClick={() => setShowCompose(!showCompose)}
            aria-expanded={showCompose}
          >
            <FileText size={14} aria-hidden="true" />
            {t("bea.compose")}
          </Button>
        }
      />

      {/* Honest framing: Subsumio does NOT send via beA */}
      <div
        className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
        role="note"
      >
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="text-sm text-amber-600">
          <p className="mb-1 font-medium">{t("bea.no_send_title")}</p>
          <p className="text-xs leading-relaxed">{t("bea.no_send_desc")}</p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Status feedback for save actions */}
      <div aria-live="polite" className="min-h-5 text-xs text-[color:var(--ds-text-muted)]">
        {statusMessage}
      </div>

      {/* Compose */}
      {showCompose && (
        <form
          className="space-y-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft();
          }}
        >
          <h2 className="text-sm font-semibold text-blue-600">{t("bea.compose_title")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="bea-recipient" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("bea.recipient_label")}
              </Label>
              <Input
                id="bea-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={t("bea.recipient_placeholder")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bea-case" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("bea.case_label")}
              </Label>
              <Input
                id="bea-case"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="2026-001"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bea-subject" className="text-xs text-[color:var(--ds-text-muted)]">
              {t("bea.subject_label")}
            </Label>
            <Input
              id="bea-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("bea.subject_placeholder")}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bea-body" className="text-xs text-[color:var(--ds-text-muted)]">
              {t("bea.body_label")}
            </Label>
            <textarea
              id="bea-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={t("bea.body_placeholder")}
              className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          {/* EU AI Act Art. 50: Nutzer markiert KI-generierten Inhalt, damit der
              Entwurf sichtbar + maschinenlesbar als KI-Output gekennzeichnet wird. */}
          <label htmlFor="bea-ai" className="flex cursor-pointer items-start gap-2">
            <input
              id="bea-ai"
              type="checkbox"
              checked={aiGenerated}
              onChange={(e) => setAiGenerated(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("bea.ai_label").replace("{label}", AI_BADGE_LABEL)}
            </span>
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={saving}
            className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={14} aria-hidden="true" />
            )}
            {t("bea.save_draft")}
          </Button>
        </form>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("bea.loading_aria")}
        >
          <Loader2 size={24} className="animate-spin text-blue-600" aria-hidden="true" />
        </div>
      ) : (
        <>
          {/* Drafts */}
          <section aria-labelledby="bea-drafts-heading">
            <h2
              id="bea-drafts-heading"
              className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]"
            >
              {t("bea.drafts")} ({drafts.length})
            </h2>
            <div className="space-y-2">
              {drafts.length === 0 ? (
                <p className="py-4 text-sm text-[color:var(--ds-text-muted)]">
                  {t("bea.no_drafts")}
                </p>
              ) : (
                drafts.map((msg) => (
                  <div
                    key={msg.slug}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10"
                      aria-hidden="true"
                    >
                      <FileText size={14} className="text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {msg.subject}
                        </span>
                        <Badge
                          variant="default"
                          className="border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
                        >
                          {t("bea.draft_badge")}
                        </Badge>
                        {msg.aiGenerated && (
                          <Badge
                            variant="default"
                            className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-700"
                          >
                            {AI_BADGE_LABEL}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("bea.to")} {msg.recipient}{" "}
                        {msg.caseNumber && `· ${t("bea.case")} ${msg.caseNumber}`} · {msg.createdAt}
                      </div>
                      {/* Filing-Paket: State-Machine aus efiling-architecture.ts.
                          "Versand" bleibt bewusst aus (siehe Hinweisbanner oben) —
                          dies verwaltet nur draft -> pending_approval -> approved/cancelled. */}
                      <div className="mt-2 flex items-center gap-2">
                        {filings[msg.slug] ? (
                          <>
                            <Badge
                              variant="default"
                              className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                            >
                              {t("bea.filing")} {getFilingStatusLabel(filings[msg.slug].status)}
                            </Badge>
                            {filings[msg.slug].status === "draft" && (
                              <Button
                                variant="secondary"
                                className="h-7 gap-1 px-2 text-xs"
                                disabled={filingBusy === msg.slug}
                                onClick={() => void advanceFiling(msg.slug, "submit")}
                              >
                                {t("bea.submit_for_approval")}
                              </Button>
                            )}
                            {filings[msg.slug].status === "pending_approval" && (
                              <>
                                <Button
                                  variant="secondary"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={filingBusy === msg.slug}
                                  onClick={() => void advanceFiling(msg.slug, "approve")}
                                >
                                  {t("bea.approve")}
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={filingBusy === msg.slug}
                                  onClick={() => void advanceFiling(msg.slug, "cancel")}
                                >
                                  {t("bea.discard")}
                                </Button>
                              </>
                            )}
                            {filings[msg.slug].status === "approved" && (
                              <>
                                <span className="text-xs text-[color:var(--ds-text-muted)]">
                                  {t("bea.approved_send_hint")}
                                </span>
                                <Button
                                  variant="primary"
                                  className="h-7 gap-1 bg-blue-600 px-2 text-xs text-white hover:bg-blue-500"
                                  disabled={sendingSlug === msg.slug || exportingSlug === msg.slug}
                                  onClick={() => void sendViaMiddleware(msg)}
                                >
                                  {sendingSlug === msg.slug ? (
                                    <Loader2
                                      size={12}
                                      className="animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Send size={12} aria-hidden="true" />
                                  )}
                                  {t("bea.send_via_middleware")}
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={exportingSlug === msg.slug || sendingSlug === msg.slug}
                                  onClick={() => void exportXJustiz(msg)}
                                >
                                  {exportingSlug === msg.slug ? (
                                    <Loader2
                                      size={12}
                                      className="animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Download size={12} aria-hidden="true" />
                                  )}
                                  XJustiz-Export
                                </Button>
                                {receipts[filings[msg.slug].id] ? (
                                  <Badge
                                    variant="default"
                                    className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                                  >
                                    <CheckCircle2 size={10} className="mr-1" aria-hidden="true" />
                                    {receipts[filings[msg.slug].id].confirmationCode}
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    className="h-7 gap-1 px-2 text-xs"
                                    disabled={receiptBusy === msg.slug}
                                    onClick={() => void confirmReceipt(msg)}
                                  >
                                    {receiptBusy === msg.slug ? (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <CheckCircle2 size={12} aria-hidden="true" />
                                    )}
                                    {t("bea.confirm_receipt")}
                                  </Button>
                                )}
                              </>
                            )}
                            {(filings[msg.slug].status === "sending" ||
                              filings[msg.slug].status === "retrying") && (
                              <Badge
                                variant="default"
                                className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                              >
                                <Loader2
                                  size={10}
                                  className="mr-1 animate-spin"
                                  aria-hidden="true"
                                />
                                {getFilingStatusLabel(filings[msg.slug].status)}
                              </Badge>
                            )}
                            {filings[msg.slug].status === "sent" && (
                              <Badge
                                variant="default"
                                className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                              >
                                <CheckCircle2 size={10} className="mr-1" aria-hidden="true" />
                                {getFilingStatusLabel(filings[msg.slug].status)}
                              </Badge>
                            )}
                            {filings[msg.slug].status === "failed" && (
                              <>
                                <Badge
                                  variant="default"
                                  className="border-red-500/20 bg-red-500/10 text-xs text-red-600"
                                >
                                  <AlertTriangle size={10} className="mr-1" aria-hidden="true" />
                                  {getFilingStatusLabel(filings[msg.slug].status)}
                                </Badge>
                                {filings[msg.slug].last_error && (
                                  <span
                                    className="text-xs text-red-600"
                                    title={filings[msg.slug].last_error}
                                  >
                                    {filings[msg.slug].last_error!.slice(0, 80)}
                                  </span>
                                )}
                                {filings[msg.slug].retry_count < filings[msg.slug].max_retries && (
                                  <Button
                                    variant="secondary"
                                    className="h-7 gap-1 px-2 text-xs"
                                    disabled={retryingSlug === msg.slug}
                                    onClick={() => void retrySend(msg)}
                                  >
                                    {retryingSlug === msg.slug ? (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <RotateCcw size={12} aria-hidden="true" />
                                    )}
                                    {t("bea.retry_send")}
                                  </Button>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={filingBusy === msg.slug}
                            onClick={() => void createPackageForDraft(msg)}
                          >
                            <Send size={12} aria-hidden="true" />
                            {t("bea.create_filing")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Imported messages from the bea-import connector */}
          <section aria-labelledby="bea-imported-heading">
            <h2
              id="bea-imported-heading"
              className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]"
            >
              {t("bea.imported_messages")} ({imported.length})
            </h2>
            <div className="space-y-2">
              {imported.length === 0 ? (
                <div className="space-y-1 py-4 text-sm text-[color:var(--ds-text-muted)]">
                  <p>{t("bea.no_imported")}</p>
                  <p className="text-xs">
                    {t("bea.import_hint")}{" "}
                    <code className="font-mono text-blue-600">
                      subsumio connector add bea-import --watch-dir ~/Downloads/bea
                    </code>
                  </p>
                </div>
              ) : (
                imported.map((msg) => (
                  <div
                    key={msg.slug}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10"
                      aria-hidden="true"
                    >
                      <Inbox size={14} className="text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {msg.subject}
                      </span>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {t("bea.from")} {msg.sender} · {msg.sentDate}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
