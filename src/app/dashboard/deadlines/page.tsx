"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calculator,
  Mail,
  FileSearch,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Printer,
  Sparkles,
  MoreHorizontal,
  BookOpen,
  CalendarDays,
  Pencil,
} from "lucide-react";
import Link from "next/link";
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
import { api, ApiRequestError } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import { toLocalIsoDate } from "@/lib/calendar-conflicts";
import { buildApprovedDeadlinePage } from "@/lib/deadline-approval";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OFFLINE_KEYS, getCache, setCache } from "@/lib/offline-store";
import { computeDeadlineStatus } from "@/lib/legal-deadlines";
import { computeFrist, fristOptionsFor } from "@/lib/legal/frist-options";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { DeadlineQuickCreateDialog } from "@/components/legal/DeadlineQuickCreateDialog";
import { DeadlineEditDialog, type DeadlineEditValues } from "@/components/legal/DeadlineEditDialog";
import { AiDeadlineSuggestions } from "@/components/legal/AiDeadlineSuggestions";
import { useMe } from "@/lib/queries/auth";
import { loadKanzleiSettingsStrict } from "@/lib/kanzlei-settings";
import { getRechtsraumParams } from "@/lib/legal/rechtsraum";
import {
  deadlineWriteTarget,
  patchEmbeddedDeadline,
  type EmbeddedDeadlineRef,
} from "@/lib/deadline-row-actions";

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
  reviewedBy?: string;
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
  /** Stand-in while the responsible lawyer is away (Urlaubsvertretung). */
  deputy?: string;
  /**
   * Set for a deadline inside a matter's `deadlines[]` (source `legal_case`):
   * `slug` is then the MATTER, and every write must target this entry.
   */
  embedded?: EmbeddedDeadlineRef;
}

const TYPE_CONFIG: Record<string, DashboardKey> = {
  deadline: "deadlines.type_deadline",
  event: "deadlines.type_event",
  hearing: "deadlines.type_hearing",
  filing: "deadlines.type_filing",
};

type DeadlineFilter =
  | "open"
  | "all"
  | "overdue"
  | "week"
  | "notfrist"
  | "unreviewed"
  | "vorfrist"
  | "done";

const BADGE_BASE = "border text-xs whitespace-nowrap";

/**
 * Nur Abweichungen vom Normalfall bekommen ein Abzeichen (Notfrist, ungeprüft,
 * Zweitprüfung, Vorfrist, Termin statt Frist). Eine gewöhnliche, freigegebene
 * Frist bleibt ohne Abzeichen.
 */
function DeadlineBadges({
  d,
  open,
  vorfrist,
  t,
}: {
  d: DeadlineItem;
  open: boolean;
  vorfrist: boolean;
  t: (key: DashboardKey) => string;
}) {
  const badges: React.ReactNode[] = [];
  if (d.isNotfrist) {
    badges.push(
      <Badge
        key="notfrist"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
        )}
      >
        {t("deadlines.notfrist")}
      </Badge>
    );
  }
  if (d.type !== "deadline") {
    badges.push(
      <Badge
        key="type"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
        )}
      >
        {t(TYPE_CONFIG[d.type] || "deadlines.type_event")}
      </Badge>
    );
  }
  if (open && d.reviewStatus === "needs_review") {
    badges.push(
      <Badge
        key="review"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
        )}
      >
        {t("deadlines.review_needed")}
      </Badge>
    );
  } else if (open && d.reviewStatus && d.reviewStatus !== "approved") {
    badges.push(
      <Badge
        key="review"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]"
        )}
      >
        {t("deadlines.unreviewed")}
      </Badge>
    );
  }
  if (open && d.isNotfrist && !d.secondCheckAt && d.reviewStatus === "approved") {
    badges.push(
      <Badge
        key="second"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]"
        )}
      >
        {t("deadlines.second_check_pending")}
      </Badge>
    );
  }
  if (vorfrist) {
    badges.push(
      <Badge
        key="vorfrist"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
        )}
      >
        {t("deadlines.vorfrist_reached")}
      </Badge>
    );
  }
  if (!open) {
    badges.push(
      <Badge
        key="done"
        variant="default"
        className={cn(
          BADGE_BASE,
          "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
        )}
      >
        {t("deadlines.status_done")}
      </Badge>
    );
  }
  if (badges.length === 0) return null;
  return <div className="flex flex-col items-start gap-1">{badges}</div>;
}

const RECHTSRAUM_UNAVAILABLE = "rechtsraum_unavailable";

function calculateDeadline(
  key: string,
  startDate: string,
  state?: string,
  country?: string
): { dueDate: string; label: string; law: string; note: string } {
  const r = computeFrist(key, startDate, { state, country });
  return {
    dueDate: r.dueDate,
    label: r.label,
    law: r.law,
    note: r.hinweise.join(" · "),
  };
}

export default function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const meQuery = useMe();
  const currentUserName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "Unbekannt";
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A deadline source failed server-side: the list may be incomplete.
  const [partialWarning, setPartialWarning] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DeadlineFilter>("open");
  const [caseFilter, setCaseFilter] = useState<string | null>(null);
  const [rechtsraum, setRechtsraum] = useState<{ state?: string; country?: string }>({});
  const calcOptions = useMemo(() => fristOptionsFor(rechtsraum.country), [rechtsraum.country]);
  const [secondCheckTarget, setSecondCheckTarget] = useState<DeadlineItem | null>(null);
  const [secondCheckBusy, setSecondCheckBusy] = useState(false);
  const secondCheckConfirmRef = useRef<HTMLButtonElement | null>(null);
  // Mirror of secondCheckBusy so the Escape handler (registered on open) sees
  // the current value without re-registering the listener.
  const secondCheckBusyRef = useRef(false);
  secondCheckBusyRef.current = secondCheckBusy;

  // A11y for the four-eyes modal: autofocus on open, focus restoration on
  // close. Self-contained — the global dashboard focus trap only covers
  // layout-registered overlays.
  useEffect(() => {
    if (!secondCheckTarget) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => secondCheckConfirmRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, [secondCheckTarget]);

  // Keyboard handling for the four-eyes modal: Escape closes (unless busy),
  // Tab cycles focus within the dialog.
  useEffect(() => {
    if (!secondCheckTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!secondCheckBusyRef.current) {
          event.preventDefault();
          setSecondCheckTarget(null);
        }
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("second-check-dialog");
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [secondCheckTarget]);
  const [showCalc, setShowCalc] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [calcKey, setCalcKey] = useState("");
  const [calcError, setCalcError] = useState<string | null>(null);
  // The Rechtsraum could not be read: the calculator must not guess one.
  const [rechtsraumFailed, setRechtsraumFailed] = useState(false);
  const calcOption = calcOptions.find((o) => o.key === calcKey) ?? calcOptions[0];
  const [calcDate, setCalcDate] = useState(() => toLocalIsoDate(new Date()));
  const [calcResult, setCalcResult] = useState<{
    dueDate: string;
    label: string;
    law: string;
    note: string;
  } | null>(null);
  const [showAiDetect, setShowAiDetect] = useState(false);
  // ?ai=1 deep-links straight to the KI-Vorschläge (demo tour chapter 3,
  // intake "Frist prüfen" CTA) — the HITL review must be reachable by URL.
  const [showAiSuggestions, setShowAiSuggestions] = useState(() => searchParams.get("ai") === "1");
  const [aiText, setAiText] = useState("");
  const [aiResults, setAiResults] = useState<
    Array<{ type: string; description: string; date?: string; confidence: string }>
  >([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savingDetected, setSavingDetected] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DeadlineItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const loadDeadlines = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartialWarning(false);
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
        reviewedBy: f.reviewed_by,
        law: f.law,
        reminderSentAt: f.reminder_sent_at,
        vorfristDate: f.vorfrist_date,
        isNotfrist: f.is_notfrist,
        secondCheckRequired: f.second_check_required,
        secondCheckBy: f.second_check_by,
        secondCheckAt: f.second_check_at,
        ervZustelldatum: f.erv_zustelldatum,
        deputy: f.deputy,
        embedded: f.source === "legal_case" ? f.deadline_ref : undefined,
      }));
      if (fristenData.partial) setPartialWarning(true);

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
    } catch {
      const cached = await getCache<DeadlineItem[]>(OFFLINE_KEYS.deadlines);
      if (cached) {
        setDeadlines(cached);
        setLoadError(t("deadlines.error_offline"));
      } else {
        setLoadError(t("deadlines.error_load"));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C1: Load rechtsraum settings for correct holiday-aware calculation
  useEffect(() => {
    loadKanzleiSettingsStrict()
      .then((settings) => {
        const rr = getRechtsraumParams(settings);
        if (rr.country) setRechtsraum({ state: rr.state, country: rr.country });
      })
      .catch(() => setRechtsraumFailed(true));
  }, []);

  // The approver may not also perform the second check (four-eyes). Shown
  // inline in the modal and enforced again in confirmSecondCheck().
  const currentUserNameForCheck =
    meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "Unknown";
  const secondCheckSelfBlocked =
    !!secondCheckTarget?.reviewedBy && secondCheckTarget.reviewedBy === currentUserNameForCheck;

  // P0: Vier-Augen second-check confirmation handler
  async function confirmSecondCheck(item: DeadlineItem) {
    const target = deadlineWriteTarget(item);
    if (target.kind === "none") return;
    const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "Unknown";
    if (item.reviewedBy && item.reviewedBy === userName) {
      addToast({
        type: "error",
        title: t("deadlines.second_check_self_blocked"),
      });
      return;
    }
    setSecondCheckBusy(true);
    try {
      // Server-enforced four-eyes check — see api/legal/fristen/second-check.
      // The client-side secondCheckSelfBlocked guard above is UX only; the
      // route re-derives the caller's identity from the session and rejects
      // if it matches the first checker, so this can't be bypassed by
      // calling api.brain.updatePage directly.
      // A matter-embedded deadline is addressed by the matter slug plus the
      // entry's id (or title + due_date); a deadline page by its own slug.
      if (target.kind === "embedded") {
        await api.legal.fristenSecondCheck(target.caseSlug, target.ref);
      } else {
        await api.legal.fristenSecondCheck(target.slug);
      }
      addToast({ type: "success", title: t("deadlines.second_check_done") });
      await loadDeadlines();
    } catch (err) {
      addToast({
        type: "error",
        title:
          err instanceof ApiRequestError && err.code === "second_check_self_blocked"
            ? t("deadlines.second_check_self_blocked")
            : t("deadlines.update_failed"),
      });
    } finally {
      setSecondCheckBusy(false);
      setSecondCheckTarget(null);
    }
  }

  async function updateDeadlinePage(
    item: DeadlineItem,
    frontmatter: Record<string, unknown>,
    pageTitle?: string
  ): Promise<boolean> {
    const target = deadlineWriteTarget(item);
    if (target.kind === "none") return false;
    setActionBusy(item.id);
    try {
      if (target.kind === "embedded") {
        // Patch only this entry of the matter's deadlines[] — writing the
        // fields to the matter page itself would close or re-review the Akte.
        const casePage = await api.brain.getPage(target.caseSlug);
        const caseFm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
        const deadlines = patchEmbeddedDeadline(caseFm.deadlines, target.ref, frontmatter);
        if (!deadlines) throw new Error("embedded deadline not found");
        await api.brain.updatePage({ slug: target.caseSlug, frontmatter: { deadlines } });
      } else {
        await api.brain.updatePage({
          slug: target.slug,
          frontmatter,
          ...(pageTitle ? { title: pageTitle } : {}),
        });
      }
      await loadDeadlines();
      return true;
    } catch {
      addToast({
        type: "error",
        title: t("deadlines.update_failed"),
      });
      return false;
    } finally {
      setActionBusy(null);
    }
  }

  /**
   * Cockpit edit: writes date/label/Notfrist changes through the same
   * embedded-vs-page resolution as Erledigt/Freigeben. An approved deadline
   * falls back to "unreviewed" — a changed Frist must be re-recognised, not
   * silently keep its approval (BGH XII ZB 338/24 pattern used by
   * deadline-approval).
   */
  async function saveEditedDeadline(d: DeadlineItem, values: DeadlineEditValues) {
    setEditSaving(true);
    const patch: Record<string, unknown> = {
      // Pages render fm.description (fm.title as fallback); embedded entries
      // render d.title. Patching both covers every source shape. `date` covers
      // appointment pages, which store the day under `date`, not `due_date`.
      description: values.description,
      title: values.description,
      due_date: values.dueDate,
      date: values.dueDate,
      vorfrist_date: values.vorfristDate || null,
      law: values.law || null,
      is_notfrist: values.isNotfrist,
      second_check_required: values.isNotfrist,
      updated_at: new Date().toISOString(),
    };
    if (d.reviewStatus === "approved") {
      patch.review_status = "unreviewed";
      patch.reviewed_by = null;
      patch.reviewed_at = null;
      patch.second_check_at = null;
      patch.second_check_by = null;
    }
    const ok = await updateDeadlinePage(d, patch, values.description);
    setEditSaving(false);
    if (ok) {
      addToast({ type: "success", title: t("deadlines.edit_saved") });
      setEditTarget(null);
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
    } catch {
      addToast({
        type: "error",
        title: t("deadlines.detect_save_failed"),
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

  // Apply URL filter params from deep-link navigation (e.g. ?case=xxx&status=critical)
  useEffect(() => {
    const caseParam = searchParams.get("case");
    const statusParam = searchParams.get("status");
    if (caseParam) setCaseFilter(caseParam);
    if (statusParam === "critical" || statusParam === "week") setFilter("week");
    else if (statusParam === "overdue") setFilter("overdue");
    else if (statusParam === "open") setFilter("open");
  }, [searchParams]);

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
              : "Die Erinnerungen konnten nicht versendet werden. Bitte versuchen Sie es später erneut.",
        });
      }
    } catch {
      addToast({ type: "error", title: t("deadlines.toast_fail") });
    }
  }

  const isOpen = (d: DeadlineItem) => d.status !== "done" && d.status !== "completed";
  const isUnreviewed = (d: DeadlineItem) =>
    isOpen(d) && !!d.reviewStatus && d.reviewStatus !== "approved";
  const vorfristReached = (d: DeadlineItem) =>
    isOpen(d) && !!d.vorfristDate && (daysUntil(d.vorfristDate) ?? 1) <= 0;
  const dueThisWeek = (d: DeadlineItem) => {
    const days = daysUntil(d.date);
    return isOpen(d) && days !== null && days >= 0 && days <= 7;
  };
  const isOverdue = (d: DeadlineItem) => isOpen(d) && (daysUntil(d.date) ?? 0) < 0;

  const FILTER_PREDICATES: Record<DeadlineFilter, (d: DeadlineItem) => boolean> = {
    open: isOpen,
    all: () => true,
    overdue: isOverdue,
    week: dueThisWeek,
    notfrist: (d) => isOpen(d) && !!d.isNotfrist,
    unreviewed: isUnreviewed,
    vorfrist: vorfristReached,
    done: (d) => !isOpen(d),
  };

  const needle = search.trim().toLowerCase();
  const filtered = deadlines.filter((d) => {
    const matchesSearch =
      needle === "" ||
      d.description.toLowerCase().includes(needle) ||
      (d.caseTitle || "").toLowerCase().includes(needle) ||
      (d.law || "").toLowerCase().includes(needle);
    const matchesCase =
      !caseFilter || d.caseSlug === caseFilter || d.caseSlug === `cases/${caseFilter}`;
    return matchesSearch && matchesCase && FILTER_PREDICATES[filter](d);
  });

  const counts = Object.fromEntries(
    (Object.keys(FILTER_PREDICATES) as DeadlineFilter[]).map((k) => [
      k,
      deadlines.filter(FILTER_PREDICATES[k]).length,
    ])
  ) as Record<DeadlineFilter, number>;
  const criticalCount = deadlines.filter((d) => {
    const days = daysUntil(d.date);
    return isOpen(d) && days !== null && days >= 0 && days <= 3;
  }).length;

  /** Die eine naheliegende Aktion je Zeile; alles Weitere liegt im Menü. */
  function primaryAction(d: DeadlineItem): "approve" | "second_check" | "done" | null {
    if (deadlineWriteTarget(d).kind === "none" || !isOpen(d)) return null;
    if (d.reviewStatus && d.reviewStatus !== "approved") return "approve";
    if (d.isNotfrist && !d.secondCheckAt) return "second_check";
    return "done";
  }

  /**
   * Register-only rows (e.g. the AI deadline calendar: source "fristenbuch", no own
   * page) can only be approved; approval writes a legal_deadline page that then
   * takes precedence over the row in /api/legal/fristen.
   */
  const isRegisterOnly = (d: DeadlineItem) => !d.slug && d.source === "fristenbuch";

  async function approveRegisterOnly(d: DeadlineItem) {
    setActionBusy(d.id);
    try {
      await api.brain.createPage(
        buildApprovedDeadlinePage({
          caseSlug: d.caseSlug,
          title: d.description,
          date: d.date,
          law: d.law,
          vorfristDate: d.vorfristDate,
          reviewedBy: currentUserName,
        })
      );
      addToast({ type: "success", title: t("deadlines.review_approved") });
      await loadDeadlines();
    } catch {
      addToast({ type: "error", title: t("deadlines.update_failed") });
    } finally {
      setActionBusy(null);
    }
  }

  function approve(d: DeadlineItem) {
    if (isRegisterOnly(d)) {
      void approveRegisterOnly(d);
      return;
    }
    void updateDeadlinePage(d, {
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      // Needed for the four-eyes check: the second check must be
      // done by someone other than the approver.
      reviewed_by: currentUserName,
    });
  }

  function markDone(d: DeadlineItem) {
    void updateDeadlinePage(d, {
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: currentUserName,
    });
  }

  const columns: Column<DeadlineItem>[] = [
    {
      key: "date",
      header: t("deadlines.col_date"),
      sortable: true,
      sortAccessor: (d) => d.date,
      width: "w-[1%] whitespace-nowrap",
      cell: (d) => {
        const days = daysUntil(d.date);
        const open = isOpen(d);
        return (
          <div className="tabular-nums">
            <div
              className={cn(
                "text-sm font-semibold",
                !open
                  ? "text-[color:var(--ds-text-muted)]"
                  : days !== null && days < 0
                    ? "text-[color:var(--ds-danger-text)]"
                    : days !== null && days <= 3
                      ? "text-[color:var(--ds-warning-text)]"
                      : "text-[color:var(--ds-text)]"
              )}
            >
              {formatDate(d.date)}
            </div>
            <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              {open ? formatDaysUntil(days) : t("deadlines.status_done")}
            </div>
          </div>
        );
      },
    },
    {
      key: "description",
      header: t("deadlines.col_title"),
      sortable: true,
      sortAccessor: (d) => d.description,
      width: "w-full max-w-0",
      cell: (d) => {
        const meta = [
          d.caseTitle,
          d.law,
          d.ervZustelldatum ? `zugestellt ${formatDate(d.ervZustelldatum)}` : null,
          // The responsible lawyer is away: the row names who stands in.
          d.deputy ? `Vertretung: ${d.deputy}` : null,
        ].filter(Boolean);
        return (
          <div className="min-w-0">
            <div
              className={cn(
                "line-clamp-2 font-medium text-[color:var(--ds-text)]",
                !isOpen(d) && "text-[color:var(--ds-text-muted)] line-through"
              )}
              title={d.description}
            >
              {d.description}
            </div>
            {meta.length > 0 && (
              <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                {meta.join(" · ")}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: t("deadlines.col_status"),
      width: "w-[1%] whitespace-nowrap",
      cell: (d) => <DeadlineBadges d={d} open={isOpen(d)} vorfrist={vorfristReached(d)} t={t} />,
    },
    {
      key: "actions",
      header: "",
      hideOnMobile: true,
      width: "w-[1%] whitespace-nowrap",
      cell: (d) => {
        if (isRegisterOnly(d)) {
          if (!isOpen(d) || d.reviewStatus === "approved") return null;
          const busy = actionBusy === d.id;
          return (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stops the row click; the control inside is a real button.
            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => approve(d)}
                className="gap-1 text-xs whitespace-nowrap"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {t("deadlines.approve")}
              </Button>
            </div>
          );
        }
        // Timeline events and rows without a writable target open the Akte
        // via the row click; they get no write actions here.
        if (deadlineWriteTarget(d).kind === "none") return null;
        const busy = actionBusy === d.id;
        const action = primaryAction(d);
        return (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stops the row click; the controls inside are real buttons.
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {action && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  action === "approve"
                    ? approve(d)
                    : action === "second_check"
                      ? setSecondCheckTarget(d)
                      : markDone(d)
                }
                className="gap-1 text-xs whitespace-nowrap"
              >
                {busy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : action === "second_check" ? (
                  <ShieldCheck size={13} />
                ) : (
                  <CheckCircle2 size={13} />
                )}
                {action === "approve"
                  ? t("deadlines.approve")
                  : action === "second_check"
                    ? "Zweitprüfung"
                    : t("deadlines.mark_done")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Weitere Aktionen für ${d.description}`}
                  disabled={busy}
                >
                  <MoreHorizontal size={15} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {d.caseSlug && (
                  <DropdownMenuItem
                    onClick={() => router.push(`/dashboard/cases/${encodeSlugPath(d.caseSlug!)}`)}
                    className="gap-2 text-xs"
                  >
                    <BookOpen size={13} /> Akte öffnen
                  </DropdownMenuItem>
                )}
                {isOpen(d) && deadlineWriteTarget(d).kind !== "none" && (
                  <DropdownMenuItem onClick={() => setEditTarget(d)} className="gap-2 text-xs">
                    <Pencil size={13} /> {t("deadlines.edit")}
                  </DropdownMenuItem>
                )}
                {isOpen(d) && action !== "approve" && d.reviewStatus !== "approved" && (
                  <DropdownMenuItem onClick={() => approve(d)} className="gap-2 text-xs">
                    <CheckCircle2 size={13} /> {t("deadlines.approve")}
                  </DropdownMenuItem>
                )}
                {isOpen(d) && action === "approve" && (!d.isNotfrist || d.secondCheckAt) && (
                  <DropdownMenuItem onClick={() => markDone(d)} className="gap-2 text-xs">
                    <CheckCircle2 size={13} /> Als erledigt markieren
                  </DropdownMenuItem>
                )}
                {isOpen(d) && d.isNotfrist && !d.secondCheckAt && action !== "second_check" && (
                  <DropdownMenuItem
                    onClick={() => setSecondCheckTarget(d)}
                    className="gap-2 text-xs"
                  >
                    <ShieldCheck size={13} /> {t("deadlines.second_check")}
                  </DropdownMenuItem>
                )}
                {!isOpen(d) && !d.isNotfrist && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        void updateDeadlinePage(d, {
                          status: "pending",
                          completed_at: null,
                          completed_by: null,
                        })
                      }
                      className="gap-2 text-xs"
                    >
                      <RotateCcw size={13} /> Wieder öffnen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  const kpis: Array<{ key: DeadlineFilter; label: string; value: number; tone: string }> = [
    {
      key: "overdue",
      label: t("deadlines.status_overdue"),
      value: counts.overdue,
      tone: "text-[color:var(--ds-danger-text)]",
    },
    {
      key: "week",
      label: "Diese Woche fällig",
      value: counts.week,
      tone: "text-[color:var(--ds-warning-text)]",
    },
    {
      key: "notfrist",
      label: "Offene Notfristen",
      value: counts.notfrist,
      tone: "text-[color:var(--ds-danger-text)]",
    },
    {
      key: "unreviewed",
      label: t("deadlines.unreviewed"),
      value: counts.unreviewed,
      tone: "text-[color:var(--ds-warning-text)]",
    },
  ];

  const chips: Array<{ key: DeadlineFilter; label: string; always?: boolean }> = [
    { key: "open", label: t("tasks.open"), always: true },
    { key: "week", label: "Diese Woche" },
    { key: "overdue", label: t("deadlines.status_overdue") },
    { key: "notfrist", label: t("deadlines.filter_notfrist") },
    { key: "unreviewed", label: t("deadlines.filter_unreviewed") },
    { key: "vorfrist", label: t("deadlines.filter_vorfrist") },
    { key: "done", label: t("deadlines.status_done") },
    { key: "all", label: t("deadlines.all"), always: true },
  ];

  return (
    <div data-tour="deadlines-widget" className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("deadlines.title")}
        description="Alle Fristen und Termine Ihrer Akten nach Fälligkeit — prüfen, freigeben und als erledigt vermerken."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("deadlines.title") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCalc(!showCalc)}
              aria-expanded={showCalc}
              className="gap-2 whitespace-nowrap"
            >
              <Calculator size={14} />
              {t("deadlines.calculate")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAiDetect(!showAiDetect)}
              aria-expanded={showAiDetect}
              className="gap-2 whitespace-nowrap"
            >
              <FileSearch size={14} />
              {t("deadlines.detect")}
            </Button>
            <PrimaryAction onClick={() => setQuickCreateOpen(true)}>
              {t("deadlines.create")}
            </PrimaryAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() => setShowAiSuggestions(!showAiSuggestions)}
                  className="gap-2 text-xs"
                >
                  <Sparkles size={13} />
                  {showAiSuggestions ? "KI-Vorschläge ausblenden" : "KI-Vorschläge anzeigen"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void sendReminders()} className="gap-2 text-xs">
                  <Mail size={13} />
                  {t("deadlines.send_reminders")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="gap-2 text-xs">
                  <Link href="/dashboard/fristenbuch">
                    <BookOpen size={13} />
                    {t("deadlines.fristenbuch")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="gap-2 text-xs">
                  <Link href="/dashboard/calendar">
                    <CalendarDays size={13} />
                    Kalender
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()} className="gap-2 text-xs">
                  <Printer size={13} />
                  {t("deadlines.fristenbuch_print")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      {/* Quick create dialog */}
      <DeadlineQuickCreateDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onCreated={() => void loadDeadlines()}
      />
      {/* Edit dialog — corrects date/Vorfrist/Notfrist straight from the cockpit */}
      <DeadlineEditDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        deadline={
          editTarget
            ? {
                description: editTarget.description,
                date: editTarget.date,
                vorfristDate: editTarget.vorfristDate,
                isNotfrist: editTarget.isNotfrist,
                law: editTarget.law,
                reviewStatus: editTarget.reviewStatus,
              }
            : null
        }
        saving={editSaving}
        onSave={(values) => {
          if (editTarget) void saveEditedDeadline(editTarget, values);
        }}
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
              className="rounded-md p-0.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
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
                value={calcOption.key}
                onValueChange={(v) => {
                  setCalcKey(v);
                  setCalcResult(null);
                  setCalcError(null);
                }}
              >
                <SelectTrigger id="calc-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {calcOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.group ? `${option.group}: ` : ""}
                      {option.label} ({option.law})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[color:var(--ds-text-muted)]">{calcOption.description}</p>
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
                onClick={() => {
                  if (rechtsraumFailed) {
                    setCalcResult(null);
                    setCalcError(RECHTSRAUM_UNAVAILABLE);
                    return;
                  }
                  try {
                    setCalcResult(
                      calculateDeadline(
                        calcOption.key,
                        calcDate,
                        rechtsraum.state,
                        rechtsraum.country
                      )
                    );
                    setCalcError(null);
                  } catch (err) {
                    setCalcResult(null);
                    setCalcError(err instanceof Error ? err.message : String(err));
                  }
                }}
                className="brand-bg flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-[var(--ds-duration-fast)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ds-surface)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
              >
                <Calculator size={14} />
                {t("deadlines.calc_button")}
              </button>
            </div>
          </div>
          {calcError && (
            <div
              role="alert"
              className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
            >
              {calcError === RECHTSRAUM_UNAVAILABLE
                ? "Die Kanzlei-Einstellungen (Rechtsraum) konnten nicht geladen werden — die Frist wird nicht berechnet, damit kein fremdes Fristenrecht angewendet wird. Bitte Seite neu laden."
                : t("deadlines.at_engine_error")}
            </div>
          )}
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
                      {new Intl.DateTimeFormat("de-AT", { weekday: "long" }).format(
                        new Date(`${calcResult.dueDate}T12:00:00`)
                      )}
                      , {formatDate(calcResult.dueDate)}
                    </strong>
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {calcResult.note}
                  </p>
                </div>
                <span className="shrink-0 text-xs whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  {formatDaysUntil(daysUntil(calcResult.dueDate))}
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
              className="rounded-md p-0.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
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
              className="flex-1 resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
          </div>
          <button
            onClick={async () => {
              if (!aiText.trim()) return;
              setAiLoading(true);
              setAiError(null);
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
                } else {
                  setAiResults([]);
                  setAiError(
                    res.status === 429
                      ? "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es in einer Minute erneut."
                      : "Die Fristen-Erkennung ist derzeit nicht verfügbar. Bitte erfassen Sie die Frist manuell über „Frist anlegen“."
                  );
                }
              } catch {
                setAiResults([]);
                setAiError(
                  "Die Fristen-Erkennung ist derzeit nicht erreichbar. Bitte erfassen Sie die Frist manuell über „Frist anlegen“."
                );
              } finally {
                setAiLoading(false);
              }
            }}
            disabled={aiLoading || !aiText.trim()}
            className="brand-bg flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-[var(--ds-duration-fast)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ds-surface)] focus-visible:outline-none active:scale-[0.99] disabled:opacity-50 motion-reduce:transition-none"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
            {aiLoading ? t("deadlines.detect_analyzing") : t("deadlines.detect_button")}
          </button>

          {aiError && (
            <div
              role="alert"
              className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
            >
              {aiError}
            </div>
          )}

          {aiResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[color:var(--ds-text)]">
                {aiResults.length} {t("deadlines.detect_result")}
              </h3>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                KI-Entwurf — anwaltlich zu prüfen. Gespeicherte Vorschläge erscheinen als
                „Ungeprüft“ und müssen freigegeben werden.
              </p>
              {aiResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                >
                  <div
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${r.confidence === "high" ? "bg-[color:var(--ds-success-solid)]" : r.confidence === "medium" ? "bg-[color:var(--ds-warning-solid)]" : "bg-[color:var(--ds-danger-solid)]"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[color:var(--ds-text)]">{r.description}</div>
                    {r.date && (
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {formatDate(r.date)} · {formatDaysUntil(daysUntil(r.date))}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant="default"
                    className={`shrink-0 text-xs whitespace-nowrap ${r.confidence === "high" ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]" : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"}`}
                  >
                    {r.confidence === "high"
                      ? "Sicher erkannt"
                      : r.confidence === "medium"
                        ? "Wahrscheinlich"
                        : "Unsicher"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.date || savingDetected === i}
                    onClick={() => void saveDetectedDeadline(r, i)}
                    className="shrink-0 gap-1 text-xs whitespace-nowrap"
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

      {/* AI Deadline Suggestions — global consolidated view */}
      {showAiSuggestions && (
        <div id="ai-suggestions" data-tour="ai-suggestions">
          <AiDeadlineSuggestions />
        </div>
      )}

      {/* Alert banner */}
      {(counts.overdue > 0 || criticalCount > 0) && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3"
        >
          <AlertTriangle size={18} className="shrink-0 text-[color:var(--ds-danger-text)]" />
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            {[
              counts.overdue > 0
                ? `${counts.overdue} ${counts.overdue === 1 ? "Frist ist überfällig" : "Fristen sind überfällig"}`
                : null,
              criticalCount > 0
                ? `${criticalCount} ${criticalCount === 1 ? "Frist endet" : "Fristen enden"} in den nächsten 3 Tagen`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] lg:grid-cols-4">
        {kpis.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(filter === item.key ? "open" : item.key)}
            aria-pressed={filter === item.key}
            className={cn(
              "bg-[color:var(--ds-surface)] px-4 py-3 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none",
              filter === item.key && "bg-[color:var(--ds-surface-2)]"
            )}
          >
            <div className="text-xs text-[color:var(--ds-text-muted)]">{item.label}</div>
            <div
              className={cn(
                "mt-1 text-2xl leading-none font-semibold tabular-nums",
                item.value > 0 ? item.tone : "text-[color:var(--ds-text)]"
              )}
            >
              {item.value}
            </div>
          </button>
        ))}
      </div>

      {/* Status filter chips — counts only when > 0 */}
      <div className="filter-strip">
        {caseFilter && (
          <FilterChip
            label={`${t("deadlines.filter_case" as never)}: ${
              deadlines.find((d) => d.caseSlug === caseFilter)?.caseTitle ??
              caseFilter.replace(/^(legal\/)?cases\//, "")
            }`}
            active
            onClick={() => setCaseFilter(null)}
          />
        )}
        {chips
          .filter((c) => c.always || counts[c.key] > 0 || filter === c.key)
          .map((c) => (
            <FilterChip
              key={c.key}
              label={
                counts[c.key] > 0 && c.key !== "all" ? `${c.label} (${counts[c.key]})` : c.label
              }
              active={filter === c.key}
              onClick={() => setFilter(filter === c.key && c.key !== "open" ? "open" : c.key)}
            />
          ))}
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDeadlines()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} />
            {t("deadlines.retry")}
          </Button>
        </div>
      )}

      {partialWarning && !loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            {t("deadlines.error_partial")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDeadlines()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-warning-bg)] hover:text-[color:var(--ds-warning-text)]"
          >
            <RotateCcw size={13} />
            {t("deadlines.retry")}
          </Button>
        </div>
      )}

      {/* Data table — hidden when loading failed and nothing is cached */}
      {!(loadError && deadlines.length === 0) && (
        <DataTable
          density="dense"
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
      )}

      {/* P0: Vier-Augen second-check confirmation modal */}
      {secondCheckTarget && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !secondCheckBusy) setSecondCheckTarget(null);
          }}
        >
          <div
            id="second-check-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="second-check-title"
            aria-describedby="second-check-desc"
            className="w-full max-w-md rounded-2xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--ds-warning-bg)]">
                <ShieldCheck size={20} className="text-[color:var(--ds-warning-text)]" />
              </div>
              <div>
                <h3
                  id="second-check-title"
                  className="text-sm font-semibold text-[color:var(--ds-text)]"
                >
                  {t("deadlines.second_check")}
                </h3>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("deadlines.notfrist")} — {secondCheckTarget.description}
                </p>
              </div>
            </div>
            <p id="second-check-desc" className="mb-4 text-sm text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "This is a statutory deadline (Notfrist). Marking it as done requires a second confirmation by a different person (four-eyes principle). By confirming, you attest that you have verified the deadline completion."
                : "Dies ist eine Notfrist. Die Erledigung erfordert eine zweite Bestätigung durch eine weitere Person (Vier-Augen-Prinzip). Mit der Bestätigung belegen Sie, dass Sie die Fristwahrung geprüft haben."}
            </p>
            <div className="mb-4 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
              <strong>{t("deadlines.second_check_by")}:</strong>{" "}
              {meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "—"}
            </div>
            {secondCheckSelfBlocked && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
              >
                {t("deadlines.second_check_self_blocked")}
              </div>
            )}
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
                ref={secondCheckConfirmRef}
                size="sm"
                disabled={secondCheckBusy || secondCheckSelfBlocked}
                onClick={() => void confirmSecondCheck(secondCheckTarget)}
                className="gap-1.5 bg-[color:var(--ds-warning-solid)] text-xs text-white hover:bg-[color:var(--ds-warning-solid)]"
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
