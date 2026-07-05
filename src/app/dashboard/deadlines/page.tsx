"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Calculator,
  Mail,
  FileSearch,
  Loader2,
  RotateCcw,
  Plus,
  ShieldCheck,
  EyeOff,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { cn, encodeSlugPath } from "@/lib/utils";
import { STATUS_TEXT, STATUS_BG, STATUS_BORDER, type StatusColor } from "@/lib/status-colors";
import { OFFLINE_KEYS, getCache, setCache } from "@/lib/offline-store";
import {
  DEADLINE_RULES,
  computeDeadlineStatus,
  computeDueDate,
  type DeadlineRule,
} from "@/lib/legal-deadlines";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { DeadlineQuickCreateDialog } from "@/components/legal/DeadlineQuickCreateDialog";
import { useMe } from "@/lib/queries/auth";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { getRechtsraumParams } from "@/lib/legal/rechtsraum";

interface DeadlineItem {
  id: string;
  date: string;
  description: string;
  caseSlug?: string;
  caseTitle?: string;
  source?: string;
  status: "pending" | "warning" | "critical" | "overdue" | "done" | "completed" | "vorfrist";
  type: "deadline" | "event" | "hearing" | "filing";
  reviewStatus?: string;
  law?: string;
  reminderSentAt?: string;
  slug?: string;
  confidence?: string;
  vorfristDate?: string;
  isNotfrist?: boolean;
  secondCheckRequired?: boolean;
  secondCheckBy?: string;
  secondCheckAt?: string;
  ervZustelldatum?: string;
}

const STATUS_CONFIG: Record<
  string,
  { labelKey: DashboardKey; color: StatusColor; icon: React.ElementType }
> = {
  pending: { labelKey: "deadlines.status_pending", color: "blue", icon: Clock },
  warning: { labelKey: "deadlines.status_warning", color: "amber", icon: AlertTriangle },
  critical: { labelKey: "deadlines.status_critical", color: "red", icon: AlertTriangle },
  overdue: { labelKey: "deadlines.status_overdue", color: "rose", icon: XCircle },
  done: { labelKey: "deadlines.status_done", color: "emerald", icon: CheckCircle2 },
  vorfrist: { labelKey: "deadlines.vorfrist_reached", color: "blue", icon: Clock },
};

const TYPE_CONFIG: Record<string, DashboardKey> = {
  deadline: "deadlines.type_deadline",
  event: "deadlines.type_event",
  hearing: "deadlines.type_hearing",
  filing: "deadlines.type_filing",
};

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculateDeadline(
  rule: DeadlineRule,
  startDate: string,
  state?: string,
  country?: string
): { dueDate: Date; label: string; law: string; note: string } {
  const { dueDate, note } = computeDueDate(rule, startDate, state as never, country as never);
  return { dueDate: new Date(`${dueDate}T12:00:00Z`), label: rule.label, law: rule.law, note };
}

export default function DeadlinesPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const meQuery = useMe();
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [rechtsraum, setRechtsraum] = useState<{ state?: string; country?: string }>({});
  const [secondCheckTarget, setSecondCheckTarget] = useState<DeadlineItem | null>(null);
  const [secondCheckBusy, setSecondCheckBusy] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [calcTemplate, setCalcTemplate] = useState<DeadlineRule>(DEADLINE_RULES[0]);
  const [calcDate, setCalcDate] = useState(new Date().toISOString().split("T")[0]);
  const [calcResult, setCalcResult] = useState<{
    dueDate: Date;
    label: string;
    law: string;
    note: string;
  } | null>(null);
  const [showAiDetect, setShowAiDetect] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiResults, setAiResults] = useState<
    Array<{ type: string; description: string; date?: string; confidence: string }>
  >([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [savingDetected, setSavingDetected] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadDeadlines = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Unified fristen API merges fristenbuch + legal_deadline + legal_case
      const fristenData = await api.legal.fristen();
      const items: DeadlineItem[] = fristenData.fristen.map((f) => ({
        id: f.id,
        slug: f.source_slug,
        date: f.due_date,
        description: f.title,
        caseSlug: f.case_slug,
        caseTitle: f.case_title,
        source: f.source,
        status: f.status as DeadlineItem["status"],
        type: (["deadline", "event", "hearing", "filing"].includes(f.type)
          ? f.type
          : "deadline") as DeadlineItem["type"],
        reviewStatus: f.review_status,
        law: f.law,
        reminderSentAt: f.reminder_sent_at,
        vorfristDate: f.vorfrist_date,
        isNotfrist: f.is_notfrist,
        secondCheckRequired: f.second_check_required,
        secondCheckBy: f.second_check_by,
        secondCheckAt: f.second_check_at,
        ervZustelldatum: f.erv_zustelldatum,
      }));

      // Appointments are not part of the fristen read-model — load separately
      const batch = await api.brain.batchListPages(["appointment"], 300);
      const appointmentPages = batch["appointment"] ?? [];
      for (const page of appointmentPages) {
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        const date = String(fm.date ?? "");
        if (!date) continue;
        const status = String(fm.status ?? "");
        if (status === "cancelled" || status === "completed") continue;
        items.push({
          id: page.slug || `appointment-${date}`,
          slug: page.slug,
          date,
          description: String(fm.title ?? page.title ?? t("deadlines.appointment")),
          caseSlug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
          caseTitle: typeof fm.case_title === "string" ? fm.case_title : undefined,
          source: String(fm.source ?? page.slug ?? ""),
          status: computeDeadlineStatus(date, status),
          type: "event",
          reviewStatus: typeof fm.review_status === "string" ? fm.review_status : undefined,
        });
      }

      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      await setCache(OFFLINE_KEYS.deadlines, items);
      setDeadlines(items);
    } catch (err) {
      const cached = await getCache<DeadlineItem[]>(OFFLINE_KEYS.deadlines);
      if (cached) {
        setDeadlines(cached);
        setLoadError(t("deadlines.error_offline"));
      } else {
        setLoadError(err instanceof Error ? err.message : t("deadlines.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C1: Load rechtsraum settings for correct holiday-aware calculation
  useEffect(() => {
    loadKanzleiSettings()
      .then((settings) => {
        const rr = getRechtsraumParams(settings);
        if (rr.country) setRechtsraum({ state: rr.state, country: rr.country });
      })
      .catch(() => {});
  }, []);

  // P0: Vier-Augen second-check confirmation handler
  async function confirmSecondCheck(item: DeadlineItem) {
    if (!item.slug) return;
    const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "Unknown";
    const now = new Date().toISOString();
    setSecondCheckBusy(true);
    try {
      await api.brain.updatePage({
        slug: item.slug,
        frontmatter: {
          status: "done",
          completed_at: now,
          second_check_required: true,
          second_check_by: userName,
          second_check_at: now,
        },
      });
      addToast({ type: "success", title: t("deadlines.second_check_done") });
      await loadDeadlines();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("deadlines.update_failed"),
      });
    } finally {
      setSecondCheckBusy(false);
      setSecondCheckTarget(null);
    }
  }

  async function updateDeadlinePage(item: DeadlineItem, frontmatter: Record<string, unknown>) {
    if (!item.slug) return;
    setActionBusy(item.slug);
    try {
      await api.brain.updatePage({
        slug: item.slug,
        frontmatter,
      });
      await loadDeadlines();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("deadlines.update_failed"),
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function saveDetectedDeadline(
    result: { type: string; description: string; date?: string; confidence: string },
    index: number
  ) {
    if (!result.date) return;
    setSavingDetected(index);
    try {
      const now = new Date();
      const datePart = result.date.replace(/[^0-9-]/g, "");
      const titlePart = result.description
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      const slug = `legal/deadlines/${datePart}-${titlePart || "ki-erkannt"}-${now.getTime().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: result.description,
        type: "legal_deadline",
        content: aiText,
        frontmatter: {
          type: "legal_deadline",
          event_type: result.type || "deadline",
          due_date: result.date,
          description: result.description,
          status: "pending",
          review_status: result.confidence === "low" ? "needs_review" : "unreviewed",
          source: "ai_deadline_detection",
          confidence: result.confidence,
          created_at: now.toISOString(),
        },
      });
      addToast({ type: "success", title: t("deadlines.detect_saved") });
      await loadDeadlines();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("deadlines.detect_save_failed"),
      });
    } finally {
      setSavingDetected(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadDeadlines();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDeadlines]);

  useEffect(() => {
    const handler = () => setQuickCreateOpen(true);
    window.addEventListener("subsumio:create-deadline", handler);
    return () => window.removeEventListener("subsumio:create-deadline", handler);
  }, []);

  async function sendReminders() {
    addToast({ type: "info", title: t("deadlines.toast_sending") });
    try {
      const res = await csrfFetch("/api/cron/deadline-reminders", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        addToast({
          type: "success",
          title: `${data.sentCount} ${t("deadlines.toast_sent")}`,
          duration: 5000,
        });
      } else {
        addToast({
          type: "warning",
          title:
            data.error === "smtp_not_configured"
              ? t("deadlines.toast_smtp")
              : `${t("deadlines.error_prefix")}: ${data.error}`,
        });
      }
    } catch {
      addToast({ type: "error", title: t("deadlines.toast_fail") });
    }
  }

  const filtered = deadlines.filter((d) => {
    const matchesSearch =
      search === "" ||
      d.description.toLowerCase().includes(search.toLowerCase()) ||
      (d.caseTitle || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      d.status === filter ||
      (filter === "unreviewed" && d.reviewStatus === "unreviewed") ||
      (filter === "notfrist" && d.isNotfrist) ||
      (filter === "vorfrist" && d.vorfristDate && new Date(d.vorfristDate) <= new Date());
    return matchesSearch && matchesFilter;
  });

  const counts = deadlines.reduce(
    (acc, d) => {
      acc[d.status] = (acc[d.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const sourceCounts = deadlines.reduce(
    (acc, d) => {
      const key = d.source?.includes("bea")
        ? "bea"
        : d.source?.includes("ai")
          ? "ai"
          : d.source?.includes("manual")
            ? "manual"
            : d.slug
              ? "direct"
              : "case";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const reviewOpenCount = deadlines.filter(
    (d) => d.reviewStatus && d.reviewStatus !== "approved"
  ).length;
  const unreviewedCount = deadlines.filter((d) => d.reviewStatus === "unreviewed").length;
  const notfristCount = deadlines.filter((d) => d.isNotfrist).length;
  const vorfristReachedCount = deadlines.filter(
    (d) => d.vorfristDate && new Date(d.vorfristDate) <= new Date()
  ).length;

  const columns: Column<DeadlineItem>[] = [
    {
      key: "description",
      header: t("deadlines.col_title"),
      sortable: true,
      sortAccessor: (d) => d.description,
      cell: (d) => {
        const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
        const StatusIcon = statusCfg.icon;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                STATUS_BG[statusCfg.color],
                STATUS_BORDER[statusCfg.color]
              )}
              aria-hidden="true"
            >
              <StatusIcon size={16} className={STATUS_TEXT[statusCfg.color]} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-[color:var(--ds-text)]">
                {d.description}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge
                  variant="default"
                  className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                >
                  {t(TYPE_CONFIG[d.type] || "deadlines.type_deadline")}
                </Badge>
                {d.reviewStatus && (
                  <Badge
                    variant="default"
                    className={cn(
                      "border text-xs",
                      d.reviewStatus === "approved"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                        : d.reviewStatus === "needs_review"
                          ? "border-red-500/20 bg-red-500/10 text-red-600"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                    )}
                  >
                    {d.reviewStatus === "approved"
                      ? t("deadlines.review_approved")
                      : d.reviewStatus === "needs_review"
                        ? t("deadlines.review_needed")
                        : t("deadlines.review_open")}
                  </Badge>
                )}
                {d.law && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {d.law}
                  </Badge>
                )}
                {d.isNotfrist && (
                  <Badge
                    variant="default"
                    className="flex items-center gap-0.5 border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700"
                  >
                    <ShieldCheck size={10} />
                    {t("deadlines.notfrist")}
                  </Badge>
                )}
                {d.vorfristDate &&
                  new Date(d.vorfristDate) <= new Date() &&
                  d.status !== "done" && (
                    <Badge
                      variant="default"
                      className="border border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                    >
                      {t("deadlines.vorfrist_reached")}
                    </Badge>
                  )}
                {d.ervZustelldatum && (
                  <Badge
                    variant="default"
                    className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {t("deadlines.erv_date")}:{" "}
                    {new Date(d.ervZustelldatum).toLocaleDateString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </Badge>
                )}
                {d.reviewStatus === "unreviewed" && (
                  <Badge
                    variant="default"
                    className="flex items-center gap-0.5 border border-slate-400/20 bg-slate-400/10 text-xs text-slate-600"
                  >
                    <EyeOff size={10} />
                    {t("deadlines.unreviewed")}
                  </Badge>
                )}
                {d.secondCheckRequired && !d.secondCheckAt && (
                  <Badge
                    variant="default"
                    className="border border-orange-500/20 bg-orange-500/10 text-xs text-orange-600"
                  >
                    {t("deadlines.second_check_pending")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "caseTitle",
      header: t("deadlines.col_case"),
      sortable: true,
      sortAccessor: (d) => d.caseTitle || "",
      hideOnMobile: true,
      cell: (d) =>
        d.caseTitle ? (
          <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
            <FileText size={10} />
            {d.caseTitle}
          </span>
        ) : (
          <span className="text-[color:var(--ds-text-subtle)]">—</span>
        ),
    },
    {
      key: "date",
      header: t("deadlines.col_date"),
      sortable: true,
      sortAccessor: (d) => new Date(d.date).getTime(),
      cell: (d) => {
        const days = getDaysUntil(d.date);
        return (
          <div className="text-right">
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                days < 0
                  ? "text-red-600"
                  : days <= 3
                    ? "text-amber-600"
                    : "text-[color:var(--ds-text)]"
              )}
            >
              {new Date(d.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
            </div>
            <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              {days < 0
                ? `${Math.abs(days)} ${t("deadlines.days_overdue")}`
                : days === 0
                  ? t("deadlines.today")
                  : days === 1
                    ? t("deadlines.tomorrow")
                    : `${t("deadlines.in_days")} ${days} ${t("deadlines.days")}`}
            </div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: t("deadlines.col_actions"),
      hideOnMobile: true,
      cell: (d) => {
        const busy = actionBusy === d.slug;
        return d.slug ? (
          <div className="flex justify-end gap-1.5">
            {d.reviewStatus !== "approved" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void updateDeadlinePage(d, {
                    review_status: "approved",
                    reviewed_at: new Date().toISOString(),
                  });
                }}
                className="gap-1 text-xs"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {t("deadlines.approve")}
              </Button>
            )}
            {d.status !== "done" && d.isNotfrist && !d.secondCheckAt && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setSecondCheckTarget(d);
                }}
                className="gap-1 border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 hover:bg-amber-500/20"
              >
                <ShieldCheck size={13} />
                {t("deadlines.second_check")}
              </Button>
            )}
            {d.status !== "done" && (!d.isNotfrist || d.secondCheckAt) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void updateDeadlinePage(d, {
                    status: "done",
                    completed_at: new Date().toISOString(),
                  });
                }}
                className="gap-1 text-xs"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {t("deadlines.mark_done")}
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("deadlines.case_embedded")}
          </span>
        );
      },
    },
  ];

  return (
    <div
      data-tour="deadlines-widget"
      className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8"
    >
      <PageHeader
        title={t("deadlines.title")}
        description={`${deadlines.length} ${t("deadlines.count")}`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("deadlines.title") }]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 text-xs"
            >
              <Printer size={14} />
              {t("deadlines.fristenbuch_print")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setQuickCreateOpen(true)}
              className="gap-2 text-xs"
            >
              <Plus size={14} />
              {t("deadlines.create")}
            </Button>
            <Button variant="ghost" size="sm" onClick={sendReminders} className="gap-2 text-xs">
              <Mail size={14} />
              {t("deadlines.send_reminders")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCalc(!showCalc)}
              className="gap-2 text-xs"
            >
              <Calculator size={14} />
              {t("deadlines.calculate")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAiDetect(!showAiDetect)}
              className="gap-2 text-xs"
            >
              <FileSearch size={14} />
              {t("deadlines.detect")}
            </Button>
          </div>
        }
      />

      {/* Quick create dialog */}
      <DeadlineQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => void loadDeadlines()}
      />

      {/* Deadline Calculator */}
      {showCalc && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("deadlines.calc_title")}
            </h2>
            <button
              onClick={() => setShowCalc(false)}
              aria-label={t("cmd.close")}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <XCircle size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="calc-template" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("deadlines.calc_type")}
              </Label>
              <Select
                value={calcTemplate.key}
                onValueChange={(v) =>
                  setCalcTemplate(DEADLINE_RULES.find((r) => r.key === v) || DEADLINE_RULES[0])
                }
              >
                <SelectTrigger id="calc-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_RULES.map((rule) => (
                    <SelectItem key={rule.key} value={rule.key}>
                      {rule.label} ({rule.law})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {calcTemplate.description}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="calc-date" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("deadlines.calc_start_date")}
              </Label>
              <Input
                id="calc-date"
                type="date"
                value={calcDate}
                onChange={(e) => setCalcDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() =>
                  setCalcResult(
                    calculateDeadline(calcTemplate, calcDate, rechtsraum.state, rechtsraum.country)
                  )
                }
                className="brand-bg flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
              >
                <Calculator size={14} />
                {t("deadlines.calc_button")}
              </button>
            </div>
          </div>
          {calcResult && (
            <div className="brand-border brand-soft rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="brand-text text-xs font-medium">
                    {calcResult.label} — {calcResult.law}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--ds-text)]">
                    {t("deadlines.calc_due")}{" "}
                    <strong>
                      {calcResult.dueDate.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {calcResult.note}
                  </p>
                </div>
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {Math.ceil(
                    (calcResult.dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  )}{" "}
                  {t("deadlines.calc_remaining")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Deadline Detection */}
      {showAiDetect && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSearch size={16} className="text-[color:var(--brand-primary)]" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("deadlines.detect_title")}
              </h2>
            </div>
            <button
              onClick={() => setShowAiDetect(false)}
              aria-label={t("deadlines.detect_title")}
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              <XCircle size={16} />
            </button>
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("deadlines.detect_desc")}</p>
          <div className="flex gap-2">
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t("deadlines.detect_placeholder")}
              rows={4}
              className="flex-1 resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
          <button
            onClick={async () => {
              if (!aiText.trim()) return;
              setAiLoading(true);
              try {
                const res = await csrfFetch("/api/legal/ai-deadlines", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: aiText }),
                });
                const data = await res.json();
                if (res.ok) {
                  setAiResults(data.detected || []);
                  addToast({
                    type: "success",
                    title: `${data.detected?.length || 0} ${t("deadlines.detect_result")}`,
                  });
                }
              } finally {
                setAiLoading(false);
              }
            }}
            disabled={aiLoading || !aiText.trim()}
            className="brand-bg flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
            {aiLoading ? t("deadlines.detect_analyzing") : t("deadlines.detect_button")}
          </button>

          {aiResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[color:var(--ds-text)]">
                {aiResults.length} {t("deadlines.detect_result")}
              </h3>
              {aiResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${r.confidence === "high" ? "bg-emerald-400" : r.confidence === "medium" ? "bg-amber-400" : "bg-red-400"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[color:var(--ds-text)]">{r.description}</div>
                    {r.date && (
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {new Date(r.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant="default"
                    className={`text-xs ${r.confidence === "high" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}
                  >
                    {r.confidence}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.date || savingDetected === i}
                    onClick={() => void saveDetectedDeadline(r, i)}
                    className="shrink-0 text-xs"
                  >
                    {savingDetected === i ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    {t("deadlines.detect_save")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alert banner */}
      {(counts.critical || 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle size={18} className="shrink-0 text-red-600" />
          <p className="text-sm text-red-600">
            {counts.critical}{" "}
            {counts.critical === 1
              ? t("deadlines.alert_critical")
              : t("deadlines.alert_critical_plural")}{" "}
            {t("deadlines.alert_in_days")}
          </p>
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: t("deadlines.source_case"), value: sourceCounts.case || 0 },
          { label: t("deadlines.source_direct"), value: sourceCounts.direct || 0 },
          { label: t("deadlines.source_bea"), value: sourceCounts.bea || 0 },
          { label: t("deadlines.source_ai"), value: sourceCounts.ai || 0 },
          { label: t("deadlines.review_open_count"), value: reviewOpenCount },
        ].map((item) => (
          <div key={item.label} className="bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div className="mt-1 text-2xl leading-none font-semibold text-[color:var(--ds-text)] tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label={t("deadlines.all")}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = counts[key] || 0;
          return (
            <FilterChip
              key={key}
              label={`${t(cfg.labelKey)} (${count})`}
              active={filter === key}
              onClick={() => setFilter(filter === key ? "all" : key)}
            />
          );
        })}
        {unreviewedCount > 0 && (
          <FilterChip
            label={`${t("deadlines.filter_unreviewed")} (${unreviewedCount})`}
            active={filter === "unreviewed"}
            onClick={() => setFilter(filter === "unreviewed" ? "all" : "unreviewed")}
          />
        )}
        {notfristCount > 0 && (
          <FilterChip
            label={`${t("deadlines.filter_notfrist")} (${notfristCount})`}
            active={filter === "notfrist"}
            onClick={() => setFilter(filter === "notfrist" ? "all" : "notfrist")}
          />
        )}
        {vorfristReachedCount > 0 && (
          <FilterChip
            label={`${t("deadlines.filter_vorfrist")} (${vorfristReachedCount})`}
            active={filter === "vorfrist"}
            onClick={() => setFilter(filter === "vorfrist" ? "all" : "vorfrist")}
          />
        )}
      </div>

      {/* Search */}
      <SearchBar
        placeholder={t("deadlines.search")}
        onSearch={setSearch}
        onClear={() => setSearch("")}
        className="max-w-md"
      />

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDeadlines()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("deadlines.retry")}
          </Button>
        </div>
      )}

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle={t("deadlines.empty_title")}
        emptyDescription={
          deadlines.length === 0 ? t("deadlines.empty_no_data") : t("deadlines.empty_filtered")
        }
        emptyIcon={CalendarClock}
        emptyActionLabel={deadlines.length === 0 ? t("deadlines.empty_create") : undefined}
        onEmptyAction={deadlines.length === 0 ? () => setQuickCreateOpen(true) : undefined}
        onRowClick={(d) =>
          d.caseSlug && router.push(`/dashboard/cases/${encodeSlugPath(d.caseSlug)}`)
        }
        rowKey={(d) => d.id}
        pageSize={20}
      />

      {/* P0: Vier-Augen second-check confirmation modal */}
      {secondCheckTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !secondCheckBusy && setSecondCheckTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[color:var(--ds-surface)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
                <ShieldCheck size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("deadlines.second_check")}
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("deadlines.notfrist")} — {secondCheckTarget.description}
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "This is a statutory deadline (Notfrist). Marking it as done requires a second confirmation by a different person (four-eyes principle). By confirming, you attest that you have verified the deadline completion."
                : "Dies ist eine Notfrist. Die Erledigung erfordert eine zweite Bestätigung durch eine weitere Person (Vier-Augen-Prinzip). Mit der Bestätigung belegen Sie, dass Sie die Fristwahrung geprüft haben."}
            </p>
            <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
              <strong>{t("deadlines.second_check_by")}:</strong>{" "}
              {meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "—"}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={secondCheckBusy}
                onClick={() => setSecondCheckTarget(null)}
                className="text-xs"
              >
                {lang === "en" ? "Cancel" : "Abbrechen"}
              </Button>
              <Button
                size="sm"
                disabled={secondCheckBusy}
                onClick={() => void confirmSecondCheck(secondCheckTarget)}
                className="gap-1.5 bg-amber-600 text-xs text-white hover:bg-amber-500"
              >
                {secondCheckBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ShieldCheck size={13} />
                )}
                {t("deadlines.second_check_done")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
