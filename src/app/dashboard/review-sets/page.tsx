"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSearch,
  Plus,
  Search,
  Trash2,
  ChevronRight,
  Download,
  AlertCircle,
  RefreshCw,
  Loader2,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { BrainPage } from "@/lib/types";
import {
  REVIEW_DECISION_LABELS_DE,
  PRIVILEGE_TYPE_LABELS_DE,
  REDACTION_CODE_LABELS_DE,
  exportPrivilegeLog,
  type ReviewSetDocument,
  type ReviewDecision,
  type PrivilegeType,
  type RedactionCode,
} from "@/lib/review-sets";

interface ReviewSet {
  slug: string;
  title?: string;
  frontmatter?: {
    type?: string;
    title?: string;
    case_slug?: string;
    case_title?: string;
    status?: "draft" | "in_review" | "produced" | "archived";
    description?: string;
    documents?: ReviewSetDocument[];
    statistics?: Record<string, number>;
    created_at?: string;
    updated_at?: string;
  };
}

/** Decision colours through the semantic tokens (no fixed hex values). */
const DECISION_TOKEN: Record<ReviewDecision, string> = {
  responsive: "var(--ds-success-text)",
  non_responsive: "var(--ds-text-muted)",
  privileged: "var(--ds-warning-text)",
  redact: "var(--ds-danger-text)",
  withhold: "var(--ds-info-text)",
};

/** Plain-language failure text — never the raw server message. */
const SAVE_FAILED = "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.";

const DECISIONS: ReviewDecision[] = [
  "responsive",
  "non_responsive",
  "privileged",
  "redact",
  "withhold",
];
const PRIVILEGES: PrivilegeType[] = [
  "none",
  "attorney_client",
  "work_product",
  "joint_defense",
  "settlement",
];
const REDACTIONS: RedactionCode[] = [
  "PRIV_ATTORNEY_CLIENT",
  "PRIV_WORK_PRODUCT",
  "PRIV_SETTLEMENT",
  "PERSONAL_DATA",
  "CONFIDENTIAL",
  "TRADE_SECRET",
  "THIRD_PARTY",
];

export default function ReviewSetsPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [cases, setCases] = useState<BrainPage[]>([]);

  const [sets, setSets] = useState<ReviewSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newCaseSlug, setNewCaseSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBatesPrefix, setNewBatesPrefix] = useState("");
  const [newBatesStart, setNewBatesStart] = useState(1);

  const showToast = useCallback(
    (msg: string) => addToast({ type: "success", title: msg }),
    [addToast]
  );

  useEffect(() => {
    let cancelled = false;
    api.cases
      .list({ limit: 200 })
      .then((list) => {
        if (!cancelled) setCases(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.legal.reviewSets.list({ limit: 100 });
      setSets(data as unknown as ReviewSet[]);
    } catch {
      setError("Die Prüfsets konnten nicht geladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const filtered = useMemo(() => {
    return sets.filter((s) => {
      const fm = s.frontmatter;
      if (!fm) return false;
      if (statusFilter !== "all" && fm.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const title = (fm.title ?? s.title ?? "").toLowerCase();
        if (!title.includes(q)) return false;
      }
      return true;
    });
  }, [sets, search, statusFilter]);

  const selectedSet = useMemo(
    () => sets.find((s) => s.slug === selectedSlug),
    [sets, selectedSlug]
  );

  async function handleCreate() {
    if (!newTitle) return;
    setSaving(true);
    try {
      await api.legal.reviewSets.create({
        title: newTitle,
        caseSlug: newCaseSlug || undefined,
        description: newDescription || undefined,
        production: {
          batesPrefix: newBatesPrefix || undefined,
          batesStart: newBatesStart,
          format: "pdf",
        },
      });
      showToast(t("review_sets.success_created" as DashboardKey));
      setShowCreate(false);
      setNewTitle("");
      setNewCaseSlug("");
      setNewDescription("");
      setNewBatesPrefix("");
      setNewBatesStart(1);
      await loadSets();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  async function handleDocDecision(docSlug: string, decision: ReviewDecision) {
    if (!selectedSet?.frontmatter?.documents) return;
    const docs = selectedSet.frontmatter.documents.map((d) =>
      d.slug === docSlug ? { ...d, decision, decisionAt: new Date().toISOString() } : d
    );
    setSaving(true);
    try {
      await api.legal.reviewSets.update(selectedSet.slug, { documents: docs });
      await loadSets();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  async function handleDocPrivilege(docSlug: string, privilegeType: PrivilegeType) {
    if (!selectedSet?.frontmatter?.documents) return;
    const docs = selectedSet.frontmatter.documents.map((d) =>
      d.slug === docSlug ? { ...d, privilegeType } : d
    );
    setSaving(true);
    try {
      await api.legal.reviewSets.update(selectedSet.slug, { documents: docs });
      await loadSets();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  async function handleDocRedaction(docSlug: string, redactionCode: RedactionCode | "") {
    if (!selectedSet?.frontmatter?.documents) return;
    const docs = selectedSet.frontmatter.documents.map((d) =>
      d.slug === docSlug ? { ...d, redactionCode: redactionCode || undefined } : d
    );
    setSaving(true);
    try {
      await api.legal.reviewSets.update(selectedSet.slug, { documents: docs });
      await loadSets();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  function handleExportPrivilegeLog() {
    if (!selectedSet?.frontmatter?.documents) return;
    const csv = exportPrivilegeLog(selectedSet.frontmatter.documents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `privilegienverzeichnis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleDelete() {
    if (!selectedSet) return;
    const ok = await confirm({ message: t("review_sets.delete_confirm" as DashboardKey) });
    if (!ok) return;
    setSaving(true);
    try {
      await api.legal.reviewSets.delete(selectedSet.slug);
      showToast(t("review_sets.success_deleted" as DashboardKey));
      setSelectedSlug(null);
      await loadSets();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("review_sets.title" as DashboardKey)}
        description={t("review_sets.description" as DashboardKey)}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("review_sets.title" as DashboardKey) },
        ]}
        actions={
          <Button
            variant="primary"
            className="gap-2 whitespace-nowrap"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("review_sets.new" as DashboardKey)}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <AlertCircle size={16} />
          {error}
          <button
            className="ml-auto rounded px-1 text-base leading-none"
            onClick={() => setError(null)}
            aria-label="Hinweis schließen"
          >
            ×
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("review_sets.search" as DashboardKey)}
            aria-label={t("review_sets.search" as DashboardKey)}
            className="pl-9"
          />
        </div>
        <select
          aria-label={t("review_sets.filter_status" as DashboardKey)}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
        >
          <option value="all">{t("review_sets.all_status" as DashboardKey)}</option>
          {(["draft", "in_review", "produced", "archived"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`review_sets.status_${s}` as DashboardKey)}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={loadSets}
          className="gap-2 text-sm"
          aria-label={t("common.refresh" as DashboardKey)}
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      {loading && sets.length === 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={FileSearch}
          title={
            sets.length === 0
              ? t("review_sets.empty" as DashboardKey)
              : "Keine Prüfsets für diese Auswahl."
          }
          actionLabel={sets.length === 0 ? t("review_sets.new" as DashboardKey) : undefined}
          onAction={sets.length === 0 ? () => setShowCreate(true) : undefined}
        />
      )}

      {/* Set cards */}
      {filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const fm = s.frontmatter!;
            const stats = fm.statistics ?? {
              total: 0,
              responsive: 0,
              privileged: 0,
              redacted: 0,
              unreviewed: 0,
            };
            return (
              <button
                key={s.slug}
                onClick={() => setSelectedSlug(s.slug)}
                className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-[background-color,border-color,box-shadow] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSearch size={16} className="text-[color:var(--ds-text-muted)]" />
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {fm.title ?? s.title}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {t(`review_sets.status_${fm.status ?? "draft"}` as DashboardKey)}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {stats.total} {t("review_sets.documents" as DashboardKey)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  <span>
                    {stats.responsive} {t("review_sets.stats_responsive" as DashboardKey)}
                  </span>
                  <span>
                    {stats.privileged} {t("review_sets.stats_privileged" as DashboardKey)}
                  </span>
                  <span>
                    {stats.redacted} {t("review_sets.stats_redacted" as DashboardKey)}
                  </span>
                  <span>
                    {stats.unreviewed} {t("review_sets.stats_unreviewed" as DashboardKey)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      {selectedSet && (
        <Dialog open={!!selectedSlug} onOpenChange={(open) => !open && setSelectedSlug(null)}>
          <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSearch size={18} />
                {selectedSet.frontmatter?.title ?? selectedSet.title}
              </DialogTitle>
              <DialogDescription>
                {selectedSet.frontmatter?.case_title &&
                  `Akte: ${selectedSet.frontmatter.case_title}`}
              </DialogDescription>
            </DialogHeader>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                {
                  label: t("review_sets.stats_total" as DashboardKey),
                  value: selectedSet.frontmatter?.statistics?.total ?? 0,
                  color: "var(--ds-text)",
                },
                {
                  label: t("review_sets.stats_responsive" as DashboardKey),
                  value: selectedSet.frontmatter?.statistics?.responsive ?? 0,
                  color: "var(--ds-success-text)",
                },
                {
                  label: t("review_sets.stats_privileged" as DashboardKey),
                  value: selectedSet.frontmatter?.statistics?.privileged ?? 0,
                  color: "var(--ds-warning-text)",
                },
                {
                  label: t("review_sets.stats_redacted" as DashboardKey),
                  value: selectedSet.frontmatter?.statistics?.redacted ?? 0,
                  color: "var(--ds-danger-text)",
                },
                {
                  label: t("review_sets.stats_unreviewed" as DashboardKey),
                  value: selectedSet.frontmatter?.statistics?.unreviewed ?? 0,
                  color: "var(--ds-text-subtle)",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-center"
                >
                  <div className="text-lg font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleExportPrivilegeLog}
              >
                <Download size={14} />
                {t("review_sets.export_privilege_log" as DashboardKey)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:text-[color:var(--ds-danger-text)]"
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 size={14} />
                {t("review_sets.delete" as DashboardKey)}
              </Button>
            </div>

            {/* Documents */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("review_sets.documents" as DashboardKey)}
              </h4>
              {(selectedSet.frontmatter?.documents ?? []).length === 0 ? (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("review_sets.no_docs" as DashboardKey)}
                </p>
              ) : (
                (selectedSet.frontmatter?.documents ?? []).map((doc) => (
                  <div
                    key={doc.slug}
                    className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-[color:var(--ds-text-muted)]" />
                      <span className="flex-1 text-sm font-medium text-[color:var(--ds-text)]">
                        {doc.title}
                      </span>
                      {doc.batesNumber && (
                        <Badge variant="default" className="font-mono text-xs">
                          {doc.batesNumber}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="mb-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                          {t("review_sets.decision" as DashboardKey)}
                        </label>
                        <select
                          value={doc.decision}
                          aria-label={`${t("review_sets.decision" as DashboardKey)}: ${doc.title}`}
                          onChange={(e) =>
                            handleDocDecision(doc.slug, e.target.value as ReviewDecision)
                          }
                          disabled={saving}
                          className="w-full rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs"
                          style={{ color: DECISION_TOKEN[doc.decision] }}
                        >
                          {DECISIONS.map((d) => (
                            <option key={d} value={d}>
                              {REVIEW_DECISION_LABELS_DE[d]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                          {t("review_sets.privilege_type" as DashboardKey)}
                        </label>
                        <select
                          value={doc.privilegeType}
                          aria-label={`${t("review_sets.privilege_type" as DashboardKey)}: ${doc.title}`}
                          onChange={(e) =>
                            handleDocPrivilege(doc.slug, e.target.value as PrivilegeType)
                          }
                          disabled={saving}
                          className="w-full rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs"
                        >
                          {PRIVILEGES.map((p) => (
                            <option key={p} value={p}>
                              {PRIVILEGE_TYPE_LABELS_DE[p]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                          {t("review_sets.redaction_code" as DashboardKey)}
                        </label>
                        <select
                          value={doc.redactionCode ?? ""}
                          aria-label={`${t("review_sets.redaction_code" as DashboardKey)}: ${doc.title}`}
                          onChange={(e) =>
                            handleDocRedaction(doc.slug, e.target.value as RedactionCode)
                          }
                          disabled={saving}
                          className="w-full rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {REDACTIONS.map((r) => (
                            <option key={r} value={r}>
                              {REDACTION_CODE_LABELS_DE[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("review_sets.create_title" as DashboardKey)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("review_sets.title_label" as DashboardKey)} *
              </label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("reviewsets.ph_name")}
                aria-label={t("review_sets.title_label" as DashboardKey)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("review_sets.case" as DashboardKey)}
              </label>
              <select
                value={newCaseSlug}
                onChange={(e) => setNewCaseSlug(e.target.value)}
                aria-label={t("review_sets.case" as DashboardKey)}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              >
                <option value="">Ohne Aktenbezug</option>
                {cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("review_sets.description_label" as DashboardKey)}
              </label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                aria-label={t("review_sets.description_label" as DashboardKey)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("review_sets.bates_prefix" as DashboardKey)}
                </label>
                <Input
                  value={newBatesPrefix}
                  onChange={(e) => setNewBatesPrefix(e.target.value)}
                  aria-label={t("review_sets.bates_prefix" as DashboardKey)}
                  placeholder="SUB-"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("review_sets.bates_start" as DashboardKey)}
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={newBatesStart}
                  onChange={(e) => setNewBatesStart(Number(e.target.value))}
                  aria-label={t("review_sets.bates_start" as DashboardKey)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              {t("review_sets.cancel" as DashboardKey)}
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving || !newTitle}>
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("review_sets.save" as DashboardKey)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
