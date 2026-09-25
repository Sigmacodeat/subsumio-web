"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import Link from "next/link";
import { useLang, type TFunc } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import {
  ShieldCheck,
  Loader2,
  FileText,
  X,
  Trash2,
  Pencil,
  Save,
  FileSearch,
  PenTool,
  Table2,
  Download,
  AlertTriangle,
  BarChart3,
  Library,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";
import type { BrainPage, TabularReviewResponse } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { SearchBar } from "@/components/dashboard/search-bar";
import { RotateCcw, GitCompare } from "lucide-react";
import dynamic from "next/dynamic";
import { MoreVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ContractRedlineViewer = dynamic(() =>
  import("@/components/contract-redline-viewer").then((m) => m.ContractRedlineViewer)
);
const ContractQuickCreateDialog = dynamic(() =>
  import("@/components/legal/ContractQuickCreateDialog").then((m) => m.ContractQuickCreateDialog)
);

interface ContractItem {
  slug: string;
  title: string;
  parties?: string;
  contractType?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  riskScore?: number;
  status?: "draft" | "reviewed" | "approved" | "signed";
  createdAt: string;
  content: string;
}

const _RISK_COLORS: Record<string, string> = {
  low: "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
  medium:
    "bg-[color:var(--ds-warning-bg)] border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
  high: "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
  critical:
    "bg-[color:var(--ds-danger-bg)] border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
};

const RISK_LABELS: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const STATUS_COLORS: Record<string, string> = {
  draft:
    "bg-[color:var(--ds-hover)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]",
  reviewed:
    "bg-[color:var(--ds-info-bg)] border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
  approved:
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
  signed:
    "bg-[color:var(--ds-success-bg)] border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
};

/** Plain-language failure for the AI surfaces — never the raw provider text. */
const AI_UNAVAILABLE =
  "Der Assistent ist gerade nicht erreichbar. Bitte versuchen Sie es in einigen Minuten erneut.";

const STATUS_LABELS: Record<string, (t: TFunc) => string> = {
  draft: (t) => t("contracts.status_draft"),
  reviewed: (t) => t("contracts.status_reviewed"),
  approved: (t) => t("contracts.status_approved"),
  signed: (t) => t("contracts.status_signed"),
};

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none motion-reduce:transition-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function parseContract(page: BrainPage): ContractItem {
  const fm = page.frontmatter ?? {};
  return {
    slug: page.slug,
    title: page.title,
    parties: (fm.parties as string) || undefined,
    contractType: (fm.contract_type as string) || undefined,
    riskLevel: (fm.risk_level as ContractItem["riskLevel"]) || undefined,
    riskScore: (fm.risk_score as number) || undefined,
    status: (fm.contract_status as ContractItem["status"]) || "draft",
    createdAt:
      ((page as unknown as Record<string, unknown>).createdAt as string) ||
      ((page as unknown as Record<string, unknown>).created_at as string) ||
      new Date().toISOString(),
    content: page.content || "",
  };
}

export default function ContractsPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const [analyzingSlug, setAnalyzingSlug] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisCitations, setAnalysisCitations] = useState<
    Array<{ slug: string; title: string }>
  >([]);
  const [analysisGaps, setAnalysisGaps] = useState<string[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [showReview, setShowReview] = useState(false);
  const [redlineContract, setRedlineContract] = useState<ContractItem | null>(null);
  const [reviewQuestions, setReviewQuestions] = useState<string[]>([
    "Welche Haftungsklauseln enthält der Vertrag?",
    "Sind AGB-rechtliche Vorschriften beachtet?",
    "Gibt es Kündigungsfristen und sind diese angemessen?",
  ]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<TabularReviewResponse | null>(null);

  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editParties, setEditParties] = useState("");
  const [editStatus, setEditStatus] = useState<ContractItem["status"]>();
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  useUnsavedChanges(editingSlug !== null);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.brain.listAllPages({ type: "legal_contract", max: 100 });
      const nextContracts = pages.map(parseContract);
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
    } catch {
      const cached = await getCache<ContractItem[]>(OFFLINE_KEYS.contracts);
      if (cached) {
        setContracts(cached);
        setLoadError(t("contracts.error_cloud_unreachable"));
      } else {
        setLoadError(t("contracts.error_load"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    const handler = () => setQuickCreateOpen(true);
    window.addEventListener("subsumio:create-contract", handler);
    return () => window.removeEventListener("subsumio:create-contract", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return contracts;
    const q = query.toLowerCase();
    return contracts.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.parties?.toLowerCase().includes(q) ?? false) ||
        (c.contractType?.toLowerCase().includes(q) ?? false)
    );
  }, [contracts, query]);

  async function analyzeContract(contract: ContractItem) {
    setAnalyzingSlug(contract.slug);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const prompt = `Analysiere den folgenden Vertrag nach österreichischem Recht (ABGB, KSchG, DSGVO). Erstelle eine strukturierte Analyse:\n\nVERTRAGSTEXT:\n${contract.content.slice(0, 12000)}\n\nGIB DEINE ANTWORT IN DIESER STRUKTUR:\n## Vertragsanalyse — ${contract.title}\n\n### Übersicht\n- **Vertragstyp:** [Typ]\n- **Parteien:** [Parteien]\n- **Gesamtrisiko:** 🟢 Niedrig / 🟡 Mittel / 🔴 Hoch / 🚨 Kritisch\n- **Risiko-Score:** [0-100]\n\n### Klauselmatrix\n| Klausel | Bewertung | Risiko | Empfehlung |\n|---------|-----------|--------|------------|\n| [Klausel 1] | [Zusammenfassung] | 🟢/🟡/🔴 | [Vorschlag] |\n\n### Rote Flaggen\n1. [Klausel]: [Problem] — [Rechtliche Grundlage]\n\n### Fehlende Standardklauseln\n- [ ] [Klausel]\n\n### Empfohlene Änderungen\n1. [Konkreter Textvorschlag]\n\nENDE DER ANALYSE.`;
      const result = await api.query.think(prompt, {
        mode: "tokenmax",
        queryMode: "deep_matter",
      });
      setAnalysisResult(result.answer);
      setAnalysisCitations(result.citations ?? []);
      setAnalysisGaps(result.gaps ?? []);
      const riskMatch = result.answer.match(/🟢|🟡|🔴|🚨/);
      const riskLevel: ContractItem["riskLevel"] = riskMatch
        ? riskMatch[0] === "🚨"
          ? "critical"
          : riskMatch[0] === "🔴"
            ? "high"
            : riskMatch[0] === "🟡"
              ? "medium"
              : "low"
        : undefined;
      const scoreMatch = result.answer.match(/Risiko-Score:\s*(\d+)/);
      const riskScore = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;
      const updatePayload = {
        slug: contract.slug,
        frontmatter: {
          risk_level: riskLevel,
          risk_score: riskScore,
          analysis_date: new Date().toISOString(),
        },
      };
      await api.brain.updatePage(updatePayload);
      const nextContracts = contracts.map((c) =>
        c.slug === contract.slug ? { ...c, riskLevel, riskScore } : c
      );
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
    } catch {
      setAnalysisError(AI_UNAVAILABLE);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function runReview() {
    const qs = reviewQuestions.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) {
      setReviewError("Bitte geben Sie mindestens eine Frage ein.");
      return;
    }
    setReviewLoading(true);
    setReviewError(null);
    setReviewResult(null);
    try {
      const res = await api.legal.tabularReview({
        type: "legal_contract",
        questions: qs,
        limit: 50,
      });
      setReviewResult(res);
      if (res.rows.length === 0) setReviewError(t("contracts.error_review_empty"));
    } catch {
      setReviewError(AI_UNAVAILABLE);
    } finally {
      setReviewLoading(false);
    }
  }

  async function deleteContract(slug: string) {
    const ok = await confirm({
      title: t("contracts.confirm_delete_title"),
      message: t("contracts.confirm_delete_msg"),
      confirmLabel: t("contracts.btn_delete"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      const nextContracts = contracts.filter((c) => c.slug !== slug);
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
    } catch {
      setLoadError(t("contracts.error_delete"));
    }
  }

  function startEdit(contract: ContractItem) {
    setEditingSlug(contract.slug);
    setEditTitle(contract.title);
    setEditType(contract.contractType || "");
    setEditParties(contract.parties || "");
    setEditStatus(contract.status);
    setEditContent(contract.content);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editTitle.trim()) {
      setEditError("Bitte geben Sie einen Titel ein.");
      return;
    }
    try {
      const payload = {
        slug: editingSlug!,
        title: editTitle,
        content: editContent,
        frontmatter: { contract_type: editType, parties: editParties, contract_status: editStatus },
      };
      if (isOnline()) {
        await api.brain.updatePage(payload);
      } else {
        await enqueueMutation({ type: "updatePage", payload });
      }
      const nextContracts = contracts.map((contract) =>
        contract.slug === editingSlug
          ? {
              ...contract,
              title: editTitle,
              content: editContent,
              contractType: editType,
              parties: editParties,
              status: editStatus,
            }
          : contract
      );
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
      setEditingSlug(null);
    } catch {
      setEditError(t("contracts.error_save"));
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("contracts.title")}
        description={t("contracts.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("contracts.breadcrumb") },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              className="gap-2 whitespace-nowrap"
              onClick={() => setShowReview(!showReview)}
            >
              <Table2 size={14} /> Massenprüfung
            </Button>
            <PrimaryAction onClick={() => setQuickCreateOpen(true)}>Vertrag anlegen</PrimaryAction>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <HubLink href="/dashboard/clause-library" icon={Library} label={t("nav.clause_library")} />
        <HubLink
          href="/dashboard/obligation-tracking"
          icon={ClipboardCheck}
          label={t("nav.obligation_tracking")}
        />
        <HubLink href="/dashboard/tabular-review" icon={Table2} label={t("nav.tabular_review")} />
        <HubLink href="/dashboard/drafting" icon={PenTool} label={t("nav.drafting")} />
      </div>

      {/* Quick create dialog */}
      <ContractQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => void loadContracts()}
      />

      {showReview && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("contracts.bulk_review_title")}
            </h3>
            <button
              onClick={() => setShowReview(false)}
              aria-label="Schließen"
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {reviewQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={q}
                  onChange={(e) =>
                    setReviewQuestions((qs) =>
                      qs.map((qq, idx) => (idx === i ? e.target.value : qq))
                    )
                  }
                  placeholder={`Frage ${i + 1}`}
                  aria-label={`Frage ${i + 1}`}
                  className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
                <button
                  onClick={() => setReviewQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                  aria-label={`Frage ${i + 1} entfernen`}
                  className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {reviewQuestions.length < 8 && (
              <button
                onClick={() => setReviewQuestions((qs) => [...qs, ""])}
                className="brand-text text-xs hover:underline"
              >
                {t("contracts.add_question")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={runReview}
              disabled={reviewLoading}
              className="gap-2 whitespace-nowrap"
            >
              {reviewLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSearch size={14} />
              )}
              {reviewLoading ? "Wird analysiert…" : "Massenprüfung starten"}
            </Button>
            {reviewResult && reviewResult.rows.length > 0 && (
              <Button
                variant="secondary"
                className="gap-2 whitespace-nowrap"
                onClick={() => {
                  const csv = [
                    ["Vertrag", ...reviewResult.questions].join(";"),
                    ...reviewResult.rows.map((r) =>
                      [r.title, ...r.cells.map((cell) => cell.answer.replace(/"/g, '""'))].join(";")
                    ),
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `vertragspruefung-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={14} /> CSV exportieren
              </Button>
            )}
          </div>
          {reviewError && (
            <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
              {reviewError}
            </div>
          )}
          {reviewResult && reviewResult.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)]">
                    <th className="px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]">
                      Vertrag
                    </th>
                    {reviewResult.questions.map((q, i) => (
                      <th
                        key={i}
                        className="min-w-[200px] px-3 py-2 text-left font-medium text-[color:var(--ds-text-muted)]"
                      >
                        {q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewResult.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-hover)]"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-[color:var(--ds-text)]">
                        {row.title}
                      </td>
                      {row.cells.map((cell, j) => (
                        <td
                          key={j}
                          className="max-w-xs truncate px-3 py-2 text-[color:var(--ds-text-muted)]"
                          title={cell.answer}
                        >
                          {cell.answer}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reviewResult && reviewResult.rows.length > 0 && (
            <GroundedOutputPanel
              text={reviewResult.rows
                .flatMap((r) => r.cells.map((cell) => cell.answer))
                .join("\n\n")}
              citations={reviewResult.rows.flatMap((r) => r.cells.flatMap((c) => c.citations))}
            />
          )}
        </div>
      )}

      <SearchBar
        placeholder={t("contracts.search_placeholder")}
        onSearch={setQuery}
        onClear={() => setQuery("")}
        className="max-w-md"
      />

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadContracts()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} /> Erneut versuchen
          </Button>
        </div>
      )}

      {/* Summary stats */}
      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
              <BarChart3 size={14} className="text-[color:var(--ds-text-muted)]" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)] tabular-nums">
                {contracts.length}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("contracts.count_label")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
              <ShieldCheck size={14} className="text-[color:var(--ds-text-muted)]" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)] tabular-nums">
                {contracts.filter((c) => c.status === "approved" || c.status === "signed").length}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Freigegeben</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
              <AlertTriangle size={14} className="text-[color:var(--ds-text-muted)]" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)] tabular-nums">
                {
                  contracts.filter(
                    (c) =>
                      c.riskLevel === "medium" ||
                      c.riskLevel === "high" ||
                      c.riskLevel === "critical"
                  ).length
                }
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Mit Risiko</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                contracts.some((c) => c.riskLevel === "critical")
                  ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]"
              }`}
            >
              <AlertTriangle
                size={14}
                className={
                  contracts.some((c) => c.riskLevel === "critical")
                    ? "text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                }
              />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)] tabular-nums">
                {contracts.filter((c) => c.riskLevel === "critical").length}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Kritisch</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label={t("aria.loading")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("contracts.empty_title")}
          description={
            contracts.length === 0
              ? t("contracts.empty_no_contracts")
              : t("contracts.empty_adjust_search")
          }
          actionLabel={contracts.length === 0 ? "Vertrag anlegen" : undefined}
          onAction={contracts.length === 0 ? () => setQuickCreateOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((contract) => {
            const isEditing = editingSlug === contract.slug;
            const isAnalyzing = analyzingSlug === contract.slug;
            if (isEditing) {
              return (
                <div
                  key={contract.slug}
                  className="space-y-4 rounded-xl border border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                      Vertrag bearbeiten
                    </h3>
                    <button
                      onClick={() => setEditingSlug(null)}
                      aria-label="Bearbeitung abbrechen"
                      className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder={t("contracts.ph_title")}
                      aria-label={t("contracts.ph_title")}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    />
                    <input
                      value={editParties}
                      onChange={(e) => setEditParties(e.target.value)}
                      placeholder={t("contracts.ph_parties")}
                      aria-label={t("contracts.ph_parties")}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      placeholder={t("contracts.ph_type")}
                      aria-label={t("contracts.ph_type")}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    />
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as ContractItem["status"])}
                      aria-label="Status"
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    >
                      {Object.entries(STATUS_LABELS).map(([key, labelFn]) => (
                        <option key={key} value={key}>
                          {labelFn(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    placeholder={t("contracts.ph_text")}
                    aria-label={t("contracts.ph_text")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                  />
                  {editError && (
                    <p className="text-xs text-[color:var(--ds-danger-text)]">{editError}</p>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={saveEdit} disabled={!editTitle.trim()} className="gap-2">
                      <Save size={14} /> Speichern
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={contract.slug}
                className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[color:var(--ds-text)]">
                        {contract.title}
                      </span>
                      {contract.contractType && (
                        <Badge variant="default" className="text-xs">
                          {contract.contractType}
                        </Badge>
                      )}
                      <Badge
                        variant="default"
                        className={`border text-xs ${STATUS_COLORS[contract.status || "draft"]}`}
                      >
                        {STATUS_LABELS[contract.status || "draft"](t)}
                      </Badge>
                    </div>
                    {contract.parties && (
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        {contract.parties}
                      </p>
                    )}
                    {/* Risk score bar */}
                    {contract.riskLevel && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                          <div
                            className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                              contract.riskLevel === "low"
                                ? "bg-[color:var(--ds-success-solid)]"
                                : contract.riskLevel === "medium"
                                  ? "bg-[color:var(--ds-warning-solid)]"
                                  : contract.riskLevel === "high"
                                    ? "bg-[color:var(--ds-danger-solid)]"
                                    : "bg-[color:var(--ds-danger-solid)]"
                            }`}
                            style={{
                              width: `${contract.riskScore ?? (contract.riskLevel === "low" ? 25 : contract.riskLevel === "medium" ? 50 : contract.riskLevel === "high" ? 75 : 95)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-xs font-medium whitespace-nowrap ${
                            contract.riskLevel === "low"
                              ? "text-[color:var(--ds-success-text)]"
                              : contract.riskLevel === "medium"
                                ? "text-[color:var(--ds-warning-text)]"
                                : contract.riskLevel === "high"
                                  ? "text-[color:var(--ds-danger-text)]"
                                  : "text-[color:var(--ds-danger-text)]"
                          }`}
                        >
                          {contract.riskScore !== undefined
                            ? `${contract.riskScore}/100 — ${RISK_LABELS[contract.riskLevel]}`
                            : RISK_LABELS[contract.riskLevel]}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => analyzeContract(contract)}
                      disabled={isAnalyzing && analysisLoading}
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                      title={t("contracts.aria_analysis")}
                      aria-label={t("contracts.aria_analysis")}
                    >
                      {isAnalyzing && analysisLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <PenTool size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(contract)}
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                      title={t("contracts.btn_edit")}
                      aria-label={t("contracts.btn_edit")}
                    >
                      <Pencil size={14} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                          aria-label="Weitere Aktionen"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => setRedlineContract(contract)}
                          className="gap-2 text-xs"
                        >
                          <GitCompare size={13} />
                          {t("contracts.aria_redline")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void deleteContract(contract.slug)}
                          className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
                        >
                          <Trash2 size={13} />
                          {t("contracts.btn_delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                  {contract.content.slice(0, 200)}
                  {contract.content.length > 200 ? "…" : ""}
                </div>
                {isAnalyzing && analysisLoading && (
                  <div
                    className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 size={14} className="animate-spin" /> Vertrag wird analysiert …
                  </div>
                )}
                {isAnalyzing && analysisError && (
                  <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]">
                    {analysisError}
                  </div>
                )}
                {analyzingSlug === contract.slug && analysisResult && (
                  <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                        Vertragsanalyse
                      </h4>
                      <button
                        onClick={() => {
                          setAnalysisResult(null);
                          setAnalyzingSlug(null);
                        }}
                        aria-label="Analyse schließen"
                        className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div
                      className="prose prose-sm dark:prose-invert max-h-[400px] max-w-none overflow-auto text-[color:var(--ds-text-muted)]"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(analysisResult) }}
                    />
                    <GroundedOutputPanel
                      text={analysisResult}
                      citations={analysisCitations}
                      gaps={analysisGaps}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {redlineContract && (
        <ContractRedlineViewer
          originalText={redlineContract.content}
          contractType={redlineContract.contractType}
          onClose={() => setRedlineContract(null)}
        />
      )}
    </div>
  );
}
