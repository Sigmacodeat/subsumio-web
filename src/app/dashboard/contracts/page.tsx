"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import {
  ShieldCheck,
  Plus,
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
import type { BrainPage, TabularReviewResponse } from "@/lib/types";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { RotateCcw, GitCompare } from "lucide-react";
import { ContractRedlineViewer } from "@/components/contract-redline-viewer";

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
  low: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  high: "bg-red-500/10 border-red-500/20 text-red-600",
  critical: "bg-red-600/20 border-red-500/30 text-red-700",
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
  reviewed: "brand-soft brand-border brand-text",
  approved: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  signed: "bg-blue-500/10 border-blue-500/20 text-blue-600",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  reviewed: "Geprüft",
  approved: "Freigegeben",
  signed: "Unterzeichnet",
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
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
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
  const [creating, setCreating] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("Kaufvertrag");
  const [newParties, setNewParties] = useState("");
  const [newContent, setNewContent] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [analyzingSlug, setAnalyzingSlug] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [_analysisLoading, setAnalysisLoading] = useState(false);

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

  useEffect(() => {
    loadContracts();
  }, []);

  async function loadContracts() {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.brain.listPages({ type: "legal_contract", limit: 100 });
      const nextContracts = pages.map(parseContract);
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
    } catch (err) {
      const cached = await getCache<ContractItem[]>(OFFLINE_KEYS.contracts);
      if (cached) {
        setContracts(cached);
        setLoadError(
          "Cloud-Brain gerade nicht erreichbar. Es werden zwischengespeicherte Verträge angezeigt."
        );
      } else {
        setLoadError(err instanceof Error ? err.message : "Verträge konnten nicht geladen werden.");
      }
    } finally {
      setLoading(false);
    }
  }

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

  async function createContract() {
    if (!newTitle.trim() || !newContent.trim()) {
      setCreateError("Titel und Vertragstext sind erforderlich.");
      return;
    }
    setCreateError(null);
    try {
      const slug = `legal/contracts/${newTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const payload = {
        slug,
        title: newTitle,
        type: "legal_contract",
        content: newContent,
        frontmatter: {
          contract_type: newType,
          parties: newParties,
          contract_status: "draft",
          risk_level: null,
          risk_score: null,
        },
      };
      if (isOnline()) {
        await api.brain.createPage(payload);
      } else {
        await enqueueMutation({ type: "createPage", payload });
      }
      const nextContracts = [
        parseContract({
          slug,
          title: newTitle,
          type: "legal_contract",
          content: newContent,
          frontmatter: payload.frontmatter,
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as BrainPage),
        ...contracts,
      ];
      setContracts(nextContracts);
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
      setNewTitle("");
      setNewParties("");
      setNewContent("");
      setNewType("Kaufvertrag");
      setCreating(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("contracts.error_create"));
    }
  }

  async function analyzeContract(contract: ContractItem) {
    setAnalyzingSlug(contract.slug);
    setAnalysisResult(null);
    setAnalysisLoading(true);
    try {
      const prompt = `Analysiere den folgenden Vertrag nach deutschem Recht (BGB, AGB-Recht, DSGVO). Erstelle eine strukturierte Analyse:\n\nVERTRAGSTEXT:\n${contract.content.slice(0, 12000)}\n\nGIB DEINE ANTWORT IN DIESER STRUKTUR:\n## Vertragsanalyse — ${contract.title}\n\n### Übersicht\n- **Vertragstyp:** [Typ]\n- **Parteien:** [Parteien]\n- **Gesamtrisiko:** 🟢 Niedrig / 🟡 Mittel / 🔴 Hoch / 🚨 Kritisch\n- **Risiko-Score:** [0-100]\n\n### Klauselmatrix\n| Klausel | Bewertung | Risiko | Empfehlung |\n|---------|-----------|--------|------------|\n| [Klausel 1] | [Zusammenfassung] | 🟢/🟡/🔴 | [Vorschlag] |\n\n### Rote Flaggen\n1. [Klausel]: [Problem] — [Rechtliche Grundlage]\n\n### Fehlende Standardklauseln\n- [ ] [Klausel]\n\n### Empfohlene Änderungen\n1. [Konkreter Textvorschlag]\n\nENDE DER ANALYSE.`;
      const result = await api.query.think(prompt, {
        mode: "tokenmax",
        queryMode: "deep_matter",
      });
      setAnalysisResult(result.answer);
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
    } catch (_err) {
      /* analysis shown inline */
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function runReview() {
    const qs = reviewQuestions.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) {
      setReviewError("Mindestens eine Frage angeben.");
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
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Massen-Review fehlgeschlagen.");
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
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("contracts.error_delete"));
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
      setEditError("Titel ist erforderlich.");
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
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("contracts.error_save"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Vertrags-Intelligenz"
        description="KI-gestützte Vertragsanalyse, Risikobewertung und Massen-Review"
        breadcrumbs={[
          { label: "Übersicht", href: "/dashboard" },
          { label: "Vertrags-Intelligenz" },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
              onClick={() => setShowReview(!showReview)}
            >
              <Table2 size={14} /> Massen-Review
            </Button>
            <Button
              onClick={() => setCreating(!creating)}
              className="brand-bg brand-bg gap-2 text-white"
            >
              <Plus size={14} /> Vertrag anlegen
            </Button>
          </>
        }
      />

      <div className="grid gap-2 sm:grid-cols-4">
        <HubLink href="/dashboard/clause-library" icon={Library} label={t("nav.clause_library")} />
        <HubLink
          href="/dashboard/obligation-tracking"
          icon={ClipboardCheck}
          label={t("nav.obligation_tracking")}
        />
        <HubLink href="/dashboard/tabular-review" icon={Table2} label={t("nav.tabular_review")} />
        <HubLink href="/dashboard/drafting" icon={PenTool} label={t("nav.drafting")} />
      </div>

      {creating && (
        <div className="brand-border space-y-4 rounded-xl border bg-[color:var(--ds-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Neuer Vertrag</h3>
            <button
              onClick={() => setCreating(false)}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Vertragsbezeichnung"
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
            <input
              value={newParties}
              onChange={(e) => setNewParties(e.target.value)}
              placeholder="Parteien (z.B. Käufer A — Verkäufer B)"
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none md:w-auto"
          >
            {[
              "Kaufvertrag",
              "Dienstvertrag",
              "Werkvertrag",
              "Mietvertrag",
              "NDA / Geheimhaltung",
              "Arbeitsvertrag",
              "Lizenzvertrag",
              "GmbH-Vertrag",
              "Sonstige",
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={8}
            placeholder="Vertragstext hier einfügen…"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex justify-end">
            <Button
              onClick={createContract}
              disabled={!newTitle.trim()}
              className="brand-bg brand-bg gap-2 text-white"
            >
              <Save size={14} /> Speichern
            </Button>
          </div>
        </div>
      )}

      {showReview && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Massen-Review über alle Verträge
            </h3>
            <button
              onClick={() => setShowReview(false)}
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
                  className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <button
                  onClick={() => setReviewQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                  className="text-[color:var(--ds-text-muted)] hover:text-red-600"
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
                + Frage hinzufügen
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={runReview}
              disabled={reviewLoading}
              className="brand-bg brand-bg gap-2 text-white"
            >
              {reviewLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSearch size={14} />
              )}
              {reviewLoading ? "Wird analysiert…" : "Massen-Review starten"}
            </Button>
            {reviewResult && reviewResult.rows.length > 0 && (
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
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
                  a.download = `contract-review-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={14} /> CSV Export
              </Button>
            )}
          </div>
          {reviewError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
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
        </div>
      )}

      <SearchBar
        placeholder="Verträge suchen…"
        onSearch={setQuery}
        onClear={() => setQuery("")}
        className="max-w-md"
      />

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadContracts()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} /> Erneut versuchen
          </Button>
        </div>
      )}

      {/* Summary stats */}
      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
              <BarChart3 size={14} className="brand-text" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)]">{contracts.length}</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Verträge</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <ShieldCheck size={14} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)]">
                {contracts.filter((c) => c.status === "approved" || c.status === "signed").length}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Freigegeben</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
              <AlertTriangle size={14} className="text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)]">
                {
                  contracts.filter(
                    (c) =>
                      c.riskLevel === "medium" ||
                      c.riskLevel === "high" ||
                      c.riskLevel === "critical"
                  ).length
                }
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Risiko</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
              <AlertTriangle size={14} className="text-red-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-[color:var(--ds-text)]">
                {contracts.filter((c) => c.riskLevel === "critical").length}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Kritisch</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <FileText size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            Keine Verträge gefunden
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {contracts.length === 0
              ? "Lege deinen ersten Vertrag an über den „Vertrag anlegen“-Button oben."
              : "Passe deine Suche an."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((contract) => {
            const isEditing = editingSlug === contract.slug;
            const isAnalyzing = analyzingSlug === contract.slug;
            if (isEditing) {
              return (
                <div
                  key={contract.slug}
                  className="brand-border space-y-4 rounded-xl border bg-[color:var(--ds-surface)] p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                      Vertrag bearbeiten
                    </h3>
                    <button
                      onClick={() => setEditingSlug(null)}
                      className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titel"
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    />
                    <input
                      value={editParties}
                      onChange={(e) => setEditParties(e.target.value)}
                      placeholder="Parteien"
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      placeholder="Vertragstyp"
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    />
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as ContractItem["status"])}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    >
                      {Object.entries(STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={6}
                    placeholder="Vertragstext"
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  {editError && <p className="text-xs text-red-600">{editError}</p>}
                  <div className="flex justify-end">
                    <Button
                      onClick={saveEdit}
                      disabled={!editTitle.trim()}
                      className="brand-bg brand-bg gap-2 text-white"
                    >
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
                        <Badge
                          variant="default"
                          className="brand-border brand-soft brand-text border text-xs"
                        >
                          {contract.contractType}
                        </Badge>
                      )}
                      <Badge
                        variant="default"
                        className={`border text-xs ${STATUS_COLORS[contract.status || "draft"]}`}
                      >
                        {STATUS_LABELS[contract.status || "draft"]}
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
                            className={`h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                              contract.riskLevel === "low"
                                ? "bg-emerald-400"
                                : contract.riskLevel === "medium"
                                  ? "bg-amber-400"
                                  : contract.riskLevel === "high"
                                    ? "bg-red-400"
                                    : "bg-red-500"
                            }`}
                            style={{
                              width: `${contract.riskScore ?? (contract.riskLevel === "low" ? 25 : contract.riskLevel === "medium" ? 50 : contract.riskLevel === "high" ? 75 : 95)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`text-xs font-medium whitespace-nowrap ${
                            contract.riskLevel === "low"
                              ? "text-emerald-600"
                              : contract.riskLevel === "medium"
                                ? "text-amber-600"
                                : contract.riskLevel === "high"
                                  ? "text-red-600"
                                  : "text-red-700"
                          }`}
                        >
                          {contract.riskScore !== undefined
                            ? `${contract.riskScore}/100`
                            : RISK_LABELS[contract.riskLevel]}{" "}
                          — {RISK_LABELS[contract.riskLevel]}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => analyzeContract(contract)}
                      disabled={isAnalyzing}
                      className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      title="Analyse"
                    >
                      {isAnalyzing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <PenTool size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => setRedlineContract(contract)}
                      className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      title="Redline"
                    >
                      <GitCompare size={14} />
                    </button>
                    <button
                      onClick={() => startEdit(contract)}
                      className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      title={t("contracts.btn_edit")}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteContract(contract.slug)}
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
                      title={t("contracts.btn_delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                  {contract.content.slice(0, 200)}…
                </div>
                {isAnalyzing && (
                  <div className="brand-text flex items-center gap-2 text-xs">
                    <Loader2 size={14} className="animate-spin" /> KI analysiert Vertrag…
                  </div>
                )}
                {analyzingSlug === contract.slug && analysisResult && (
                  <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                        KI-Analyse
                      </h4>
                      <button
                        onClick={() => {
                          setAnalysisResult(null);
                          setAnalyzingSlug(null);
                        }}
                        className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div
                      className="prose prose-invert prose-sm max-h-[400px] max-w-none overflow-auto text-[color:var(--ds-text-muted)]"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(analysisResult) }}
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
