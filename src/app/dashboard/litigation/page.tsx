"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
  Gavel,
  Plus,
  Search,
  Trash2,
  ChevronRight,
  FileSearch,
  FileText,
  CalendarClock,
  CheckCircle,
  ArrowUpCircle,
  Shield,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  PHASE_ORDER,
  getNextPhases,
  getPhaseProgress,
  generateDefaultSteps,
  type LitigationPhase,
  type LitigationStep,
  type StepStatus,
} from "@/lib/litigation-flow";

interface Matter {
  slug: string;
  title?: string;
  frontmatter?: {
    type?: string;
    case_slug?: string;
    case_title?: string;
    phase?: LitigationPhase;
    court?: string;
    court_file_number?: string;
    instance?: string;
    steps?: LitigationStep[];
    phase_history?: Array<{ phase: LitigationPhase; changedAt: string; changedBy?: string }>;
    settlement?: {
      status: string;
      amount?: number;
      currency?: string;
      date?: string;
      notes?: string;
    };
    judgment?: {
      outcome: string;
      date?: string;
      summary?: string;
      appealable: boolean;
      appealedAt?: string;
    };
    created_at?: string;
    updated_at?: string;
  };
  content?: string;
}

const PHASE_ICONS: Record<LitigationPhase, React.ReactNode> = {
  pre_filing: <FileSearch size={16} />,
  filing: <FileText size={16} />,
  discovery: <Search size={16} />,
  pre_trial: <CalendarClock size={16} />,
  trial: <Gavel size={16} />,
  post_trial: <CheckCircle size={16} />,
  appeal: <ArrowUpCircle size={16} />,
  enforcement: <Shield size={16} />,
  closed: <CheckCircle size={16} />,
};

const STEP_STATUS_COLORS: Record<StepStatus, string> = {
  pending: "var(--ds-text-muted)",
  in_progress: "var(--brand-primary)",
  completed: "#22c55e",
  blocked: "#ef4444",
  skipped: "var(--ds-text-subtle)",
};

export default function LitigationFlowPage() {
  const { t, lang } = useLang();

  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<LitigationPhase | "all">("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPhaseDialog, setShowPhaseDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form state
  const [newCaseSlug, setNewCaseSlug] = useState("");
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [newCourt, setNewCourt] = useState("");
  const [newFileNumber, setNewFileNumber] = useState("");
  const [newInstance, setNewInstance] = useState("1. Instanz");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadMatters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.legal.litigation.list({ limit: 100 });
      setMatters(data as unknown as Matter[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatters();
  }, [loadMatters]);

  const filtered = useMemo(() => {
    return matters.filter((m) => {
      const fm = m.frontmatter;
      if (!fm) return false;
      if (phaseFilter !== "all" && fm.phase !== phaseFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const title = (fm.case_title ?? m.title ?? "").toLowerCase();
        const court = (fm.court ?? "").toLowerCase();
        const fileNo = (fm.court_file_number ?? "").toLowerCase();
        if (!title.includes(q) && !court.includes(q) && !fileNo.includes(q)) return false;
      }
      return true;
    });
  }, [matters, search, phaseFilter]);

  const selectedMatter = useMemo(
    () => matters.find((m) => m.slug === selectedSlug),
    [matters, selectedSlug]
  );

  async function handleCreate() {
    if (!newCaseSlug || !newCaseTitle) return;
    setSaving(true);
    try {
      await api.legal.litigation.create({
        caseSlug: newCaseSlug,
        caseTitle: newCaseTitle,
        court: newCourt || undefined,
        courtFileNumber: newFileNumber || undefined,
        instance: newInstance,
      });
      showToast(t("litigation.success_created" as DashboardKey));
      setShowCreate(false);
      setNewCaseSlug("");
      setNewCaseTitle("");
      setNewCourt("");
      setNewFileNumber("");
      setNewInstance("1. Instanz");
      await loadMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvancePhase(newPhase: LitigationPhase) {
    if (!selectedMatter) return;
    setSaving(true);
    try {
      await api.legal.litigation.update(selectedMatter.slug, { phase: newPhase });
      showToast(t("litigation.success_saved" as DashboardKey));
      setShowPhaseDialog(false);
      await loadMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStepStatusChange(stepId: string, newStatus: StepStatus) {
    if (!selectedMatter?.frontmatter?.steps) return;
    const updatedSteps = selectedMatter.frontmatter.steps.map((s) =>
      s.id === stepId
        ? {
            ...s,
            status: newStatus,
            completedAt: newStatus === "completed" ? new Date().toISOString() : s.completedAt,
          }
        : s
    );
    setSaving(true);
    try {
      await api.legal.litigation.update(selectedMatter.slug, { steps: updatedSteps });
      await loadMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSteps() {
    if (!selectedMatter?.frontmatter?.phase) return;
    const phase = selectedMatter.frontmatter.phase;
    const existing = selectedMatter.frontmatter.steps ?? [];
    const newSteps = generateDefaultSteps(phase);
    const allSteps = [...existing, ...newSteps];
    setSaving(true);
    try {
      await api.legal.litigation.update(selectedMatter.slug, { steps: allSteps });
      showToast(t("litigation.success_saved" as DashboardKey));
      await loadMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedMatter) return;
    if (!confirm(t("litigation.delete_confirm" as DashboardKey))) return;
    setSaving(true);
    try {
      await api.legal.litigation.delete(selectedMatter.slug);
      showToast(t("litigation.success_deleted" as DashboardKey));
      setSelectedSlug(null);
      await loadMatters();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const completedSteps = (steps?: LitigationStep[]) => {
    if (!steps) return { done: 0, total: 0 };
    return { done: steps.filter((s) => s.status === "completed").length, total: steps.length };
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading && matters.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("litigation.title" as DashboardKey)}
        description={t("litigation.description" as DashboardKey)}
        actions={
          <Button
            variant="primary"
            className="brand-bg gap-2 text-sm text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("litigation.new" as DashboardKey)}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} />
          {error}
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] shadow-lg">
          {toast}
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
            placeholder={t("litigation.search" as DashboardKey)}
            className="pl-9"
          />
        </div>
        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value as LitigationPhase | "all")}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
        >
          <option value="all">{t("litigation.all_phases" as DashboardKey)}</option>
          {PHASE_ORDER.map((p) => (
            <option key={p} value={p}>
              {t(`litigation.phase_${p}` as DashboardKey)}
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={loadMatters} className="gap-2 text-sm">
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border)] py-16 text-center">
          <Gavel size={32} className="mb-3 text-[color:var(--ds-text-subtle)]" />
          <p className="max-w-md text-sm text-[color:var(--ds-text-muted)]">
            {t("litigation.empty" as DashboardKey)}
          </p>
          <Button
            variant="primary"
            className="brand-bg mt-4 gap-2 text-sm text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("litigation.new" as DashboardKey)}
          </Button>
        </div>
      )}

      {/* Matter cards */}
      {filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const fm = m.frontmatter!;
            const phase = fm.phase ?? "pre_filing";
            const progress = getPhaseProgress(phase);
            const { done, total } = completedSteps(fm.steps);
            return (
              <button
                key={m.slug}
                onClick={() => setSelectedSlug(m.slug)}
                className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-all hover:border-[color:var(--brand-primary)] hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {PHASE_ICONS[phase]}
                    <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {fm.case_title ?? m.title}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-1"
                  />
                </div>
                <div className="space-y-2 text-xs text-[color:var(--ds-text-muted)]">
                  {fm.court && <div>{fm.court}</div>}
                  {fm.court_file_number && <div>AZ: {fm.court_file_number}</div>}
                  <div>{fm.instance}</div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    {t(`litigation.phase_${phase}` as DashboardKey)}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {done}/{total} {t("litigation.steps" as DashboardKey)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-hover)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: "var(--brand-primary)" }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Detail Dialog ────────────────────────────────────────────── */}
      {selectedMatter && (
        <Dialog open={!!selectedSlug} onOpenChange={(open) => !open && setSelectedSlug(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {PHASE_ICONS[selectedMatter.frontmatter?.phase ?? "pre_filing"]}
                {selectedMatter.frontmatter?.case_title ?? selectedMatter.title}
              </DialogTitle>
              <DialogDescription>
                {selectedMatter.frontmatter?.court}{" "}
                {selectedMatter.frontmatter?.court_file_number &&
                  `· AZ: ${selectedMatter.frontmatter.court_file_number}`}
              </DialogDescription>
            </DialogHeader>

            {/* Phase Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[color:var(--ds-text-muted)]">
                <span>{t("litigation.progress" as DashboardKey)}</span>
                <span>{getPhaseProgress(selectedMatter.frontmatter?.phase ?? "pre_filing")}%</span>
              </div>
              <div className="flex gap-1">
                {PHASE_ORDER.map((p, i) => {
                  const currentIdx = PHASE_ORDER.indexOf(
                    selectedMatter.frontmatter?.phase ?? "pre_filing"
                  );
                  const isDone = i < currentIdx;
                  const isCurrent = i === currentIdx;
                  return (
                    <div
                      key={p}
                      className={`h-2 flex-1 rounded-full transition-all ${
                        isDone
                          ? "bg-[color:var(--brand-primary)]"
                          : isCurrent
                            ? "brand-bg"
                            : "bg-[color:var(--ds-hover)]"
                      }`}
                      title={t(`litigation.phase_${p}` as DashboardKey)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Phase + Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="gap-1.5">
                {PHASE_ICONS[selectedMatter.frontmatter?.phase ?? "pre_filing"]}
                {t(
                  `litigation.phase_${selectedMatter.frontmatter?.phase ?? "pre_filing"}` as DashboardKey
                )}
              </Badge>
              {getNextPhases(selectedMatter.frontmatter?.phase ?? "pre_filing").length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowPhaseDialog(true)}
                >
                  <ArrowUpCircle size={14} />
                  {t("litigation.advance_phase" as DashboardKey)}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleGenerateSteps}
                disabled={saving}
              >
                <Plus size={14} />
                {t("litigation.generate_steps" as DashboardKey)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-xs text-red-400 hover:text-red-500"
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 size={14} />
                {t("litigation.delete" as DashboardKey)}
              </Button>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("litigation.steps" as DashboardKey)}
              </h4>
              {(selectedMatter.frontmatter?.steps ?? []).length === 0 ? (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("litigation.no_steps" as DashboardKey)}
                </p>
              ) : (
                (selectedMatter.frontmatter?.steps ?? []).map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                  >
                    <div className="mt-0.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: STEP_STATUS_COLORS[step.status] }}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {step.title}
                        </span>
                        <Badge variant="default" className="text-[10px]">
                          {t(`litigation.step_${step.type}` as DashboardKey)}
                        </Badge>
                      </div>
                      {step.description && (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          {step.description}
                        </p>
                      )}
                      {step.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-subtle)]">
                          <Clock size={11} />
                          {new Date(step.dueDate).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                        </div>
                      )}
                    </div>
                    <select
                      value={step.status}
                      onChange={(e) =>
                        handleStepStatusChange(step.id, e.target.value as StepStatus)
                      }
                      disabled={saving}
                      className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                    >
                      {(
                        [
                          "pending",
                          "in_progress",
                          "completed",
                          "blocked",
                          "skipped",
                        ] as StepStatus[]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {t(`litigation.status_${s}` as DashboardKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>

            {/* Settlement + Judgment */}
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedMatter.frontmatter?.settlement &&
                selectedMatter.frontmatter.settlement.status !== "none" && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                    <h5 className="mb-2 text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                      {t("litigation.settlement" as DashboardKey)}
                    </h5>
                    <Badge variant="default" className="text-xs">
                      {t(
                        `litigation.settlement_${selectedMatter.frontmatter.settlement.status}` as DashboardKey
                      )}
                    </Badge>
                    {selectedMatter.frontmatter.settlement.amount && (
                      <p className="mt-2 text-sm text-[color:var(--ds-text)]">
                        {selectedMatter.frontmatter.settlement.amount.toLocaleString("de-DE")}{" "}
                        {selectedMatter.frontmatter.settlement.currency ?? "EUR"}
                      </p>
                    )}
                  </div>
                )}
              {selectedMatter.frontmatter?.judgment &&
                selectedMatter.frontmatter.judgment.outcome !== "pending" && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                    <h5 className="mb-2 text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                      {t("litigation.judgment" as DashboardKey)}
                    </h5>
                    <Badge variant="default" className="text-xs">
                      {t(
                        `litigation.judgment_${selectedMatter.frontmatter.judgment.outcome}` as DashboardKey
                      )}
                    </Badge>
                    {selectedMatter.frontmatter.judgment.date && (
                      <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                        {new Date(selectedMatter.frontmatter.judgment.date).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )}
                      </p>
                    )}
                  </div>
                )}
            </div>

            {/* Phase History */}
            {(selectedMatter.frontmatter?.phase_history ?? []).length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase">
                  {t("litigation.phase_history" as DashboardKey)}
                </h5>
                <div className="space-y-1">
                  {(selectedMatter.frontmatter?.phase_history ?? []).map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]"
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)]" />
                      <span>{t(`litigation.phase_${h.phase}` as DashboardKey)}</span>
                      <span>
                        ·{" "}
                        {new Date(h.changedAt).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )}
                      </span>
                      {h.changedBy && <span>· {h.changedBy}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Phase Advance Dialog ─────────────────────────────────────── */}
      {showPhaseDialog && selectedMatter && (
        <Dialog open={showPhaseDialog} onOpenChange={setShowPhaseDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("litigation.advance_phase" as DashboardKey)}</DialogTitle>
              <DialogDescription>
                {t(`litigation.phase_${selectedMatter.frontmatter?.phase}` as DashboardKey)} → ?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {getNextPhases(selectedMatter.frontmatter?.phase ?? "pre_filing").map((p) => (
                <button
                  key={p}
                  onClick={() => handleAdvancePhase(p)}
                  disabled={saving}
                  className="flex w-full items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-left transition-all hover:border-[color:var(--brand-primary)]"
                >
                  {PHASE_ICONS[p]}
                  <span className="text-sm text-[color:var(--ds-text)]">
                    {t(`litigation.phase_${p}` as DashboardKey)}
                  </span>
                  <ChevronRight size={14} className="ml-auto text-[color:var(--ds-text-subtle)]" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Create Dialog ────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("litigation.create_title" as DashboardKey)}</DialogTitle>
            <DialogDescription>{t("litigation.create_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("litigation.case" as DashboardKey)} *
              </label>
              <Input
                value={newCaseSlug}
                onChange={(e) => setNewCaseSlug(e.target.value)}
                placeholder="case-slug"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("litigation.case" as DashboardKey)} *
              </label>
              <Input
                value={newCaseTitle}
                onChange={(e) => setNewCaseTitle(e.target.value)}
                placeholder="Muster ./. Beispiel"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("litigation.court" as DashboardKey)}
              </label>
              <Input
                value={newCourt}
                onChange={(e) => setNewCourt(e.target.value)}
                placeholder="LG Wien"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("litigation.file_number" as DashboardKey)}
              </label>
              <Input
                value={newFileNumber}
                onChange={(e) => setNewFileNumber(e.target.value)}
                placeholder="12 O 345/23"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("litigation.instance" as DashboardKey)}
              </label>
              <Input value={newInstance} onChange={(e) => setNewInstance(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              {t("litigation.cancel" as DashboardKey)}
            </Button>
            <Button
              variant="primary"
              className="brand-bg text-white"
              onClick={handleCreate}
              disabled={saving || !newCaseSlug || !newCaseTitle}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("litigation.save" as DashboardKey)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
