"use client";

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Briefcase,
  Loader2,
  ArrowLeft,
  FileText,
  CalendarClock,
  Network,
  Scale,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  MessageSquare,
  Send,
  Copy,
  Check,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  ListChecks,
  Timer,
  Receipt,
  Plus,
  Trash2,
  Landmark,
  User,
  Play,
  Square,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { isOnline, enqueueMutation } from "@/lib/offline-store";
import { usePresence } from "@/lib/use-presence";
import type { BrainPage } from "@/lib/types";
import type { DashboardKey } from "@/content/dashboard";
import { CitationLink, parseCitations } from "@/components/legal/CitationLink";
import CommentThread from "@/components/legal/CommentThread";
import { MatterContextPanel } from "@/components/legal/MatterContextPanel";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  STATUS_TEXT,
  STATUS_BG,
  STATUS_BORDER,
  statusBadgeClasses,
  type StatusColor,
} from "@/lib/status-colors";
import {
  caseFrontmatter,
  type EvidenceEntry,
  type StrategyInfo,
  type TaskEntry,
  type TimeEntry,
  type TimelineEntry,
  type DocumentEntry,
  type DeadlineEntry,
  type ExpenseEntry,
  type AuditLogEntry,
} from "@/lib/legal-types";
import {
  DEADLINE_RULES,
  calculateDeadline,
  computeDeadlineStatus,
  timelineToDeadline,
  withDeadlineAudit,
} from "@/lib/legal-deadlines";
import {
  validateTransition,
  getAllowedTransitions,
  transitionDescription,
  STATUS_LABELS_DE,
  type CaseStatus,
} from "@/lib/case-status";
import {
  deadlineFormSchema,
  evidenceFormSchema,
  timeEntryFormSchema,
  expenseFormSchema,
  type DeadlineFormData,
  type EvidenceFormData,
  type TimeEntryFormData,
  type ExpenseFormData,
} from "@/lib/schemas/case-detail";

interface CaseDetail {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  legalArea: string;
  subArea?: string;
  priority: string;
  opponentId?: string;
  opponentName?: string;
  ownLawyerId?: string;
  ownLawyerName?: string;
  ownLawyerSlug?: string;
  courtId?: string;
  courtName?: string;
  clientId?: string;
  clientName?: string;
  clientSlug?: string;
  opponentSlugs?: string[];
  courtSlug?: string;
  facts: string;
  claims: string[];
  defenses: string[];
  evidence: EvidenceEntry[];
  strategy?: StrategyInfo;
  outcome?: Record<string, unknown>;
  estimatedValue?: { min: number; max: number; currency: string };
  tags: string[];
  createdAt: string;
  updatedAt: string;
  tasks: TaskEntry[];
  timeEntries: TimeEntry[];
  expenses: ExpenseEntry[];
  timelineEvents: TimelineEntry[];
  documents: DocumentEntry[];
  deadlines: DeadlineEntry[];
  portalEnabled: boolean;
  portalNote?: string;
  auditLog?: AuditLogEntry[];
  version: number;
}

const STATUS_CONFIG: Record<
  string,
  { labelKey: string; icon: React.ElementType; color: StatusColor }
> = {
  open: { labelKey: "cases.status_open", icon: Clock, color: "blue" },
  pending: { labelKey: "cases.status_pending", icon: PauseCircle, color: "amber" },
  settled: { labelKey: "cases.status_settled", icon: CheckCircle2, color: "emerald" },
  won: { labelKey: "cases.status_won", icon: CheckCircle2, color: "emerald" },
  lost: { labelKey: "cases.status_lost", icon: XCircle, color: "red" },
  appealed: { labelKey: "cases.status_appealed", icon: AlertTriangle, color: "orange" },
  dormant: { labelKey: "cases.status_dormant", icon: PauseCircle, color: "gray" },
};

const TABS = [
  { key: "overview", labelKey: "cases.detail_tab_overview", icon: FileText },
  { key: "timeline", labelKey: "cases.detail_tab_timeline", icon: CalendarClock },
  { key: "documents", labelKey: "cases.detail_tab_documents", icon: FileText },
  { key: "deadlines", labelKey: "cases.detail_tab_deadlines", icon: CalendarClock },
  { key: "tasks", labelKey: "cases.detail_tab_tasks", icon: ListChecks },
  { key: "evidence", labelKey: "cases.detail_tab_evidence", icon: ShieldAlert },
  { key: "time", labelKey: "cases.detail_tab_time", icon: Timer },
  { key: "expenses", labelKey: "cases.detail_tab_expenses", icon: Receipt },
  { key: "graph", labelKey: "cases.detail_tab_graph", icon: Network },
  { key: "superbrain", labelKey: "cases.detail_tab_superbrain", icon: Sparkles },
  { key: "audit", labelKey: "cases.detail_tab_audit", icon: ShieldCheck },
  { key: "query", labelKey: "cases.detail_tab_query", icon: MessageSquare },
];

function parseCaseDetail(page: BrainPage): CaseDetail {
  const fm = caseFrontmatter(page);
  return {
    slug: page.slug,
    title: page.title,
    caseNumber: fm.case_number || page.slug,
    status: fm.status || "open",
    legalArea: fm.legal_area || "",
    subArea: fm.sub_area || undefined,
    priority: fm.priority || "medium",
    opponentId: fm.opponent_id || undefined,
    opponentName: fm.opponent_name || undefined,
    ownLawyerId: fm.own_lawyer_id || undefined,
    ownLawyerName: fm.own_lawyer_name || undefined,
    ownLawyerSlug: fm.own_lawyer_slug || undefined,
    courtId: fm.court_id || undefined,
    courtName: fm.court_name || undefined,
    clientId: fm.client_id || undefined,
    clientName: fm.client_name || undefined,
    clientSlug: fm.client_slug || undefined,
    opponentSlugs: fm.opponent_slugs || undefined,
    courtSlug: fm.court_slug || undefined,
    facts: page.content || "",
    claims: fm.claims || [],
    defenses: fm.defenses || [],
    evidence: fm.evidence || [],
    strategy: fm.strategy || undefined,
    outcome: fm.outcome || undefined,
    estimatedValue: fm.estimated_value || undefined,
    tags: fm.tags || [],
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    tasks: fm.tasks || [],
    timeEntries: fm.time_entries || [],
    expenses: fm.expenses || [],
    timelineEvents: fm.timeline_events || [],
    documents: fm.documents || [],
    deadlines: fm.deadlines || [],
    portalEnabled: fm.portal_enabled || false,
    portalNote: fm.portal_note || undefined,
    auditLog: (fm.audit_log || []) as AuditLogEntry[],
    version: (fm.version as number) || 0,
  };
}

export default function CaseDetailPage() {
  const { t, lang } = useLang();
  const params = useParams();
  const slug = decodeURIComponent(params.slug as string);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [generatingPortal, setGeneratingPortal] = useState(false);
  const [userRole, setUserRole] = useState<string>("lawyer");
  const [currentUserName, setCurrentUserName] = useState<string>("System");
  const [currentUserId, setCurrentUserId] = useState<string>("system");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<CaseStatus | null>(null);

  // Tasks state
  const [tasks, setTasks] = useState<
    Array<{ id: string; text: string; done: boolean; createdAt: string }>
  >([]);
  const [newTask, setNewTask] = useState("");

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);

  // Live timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartAt, setTimerStartAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [expensesList, setExpensesList] = useState<ExpenseEntry[]>([]);

  // Contacts linked to this case
  const [contacts, setContacts] = useState<{ slug: string; name: string; role: string }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Evidence CRUD state
  const [evidenceList, setEvidenceList] = useState<EvidenceEntry[]>([]);
  const [editingEvidenceIndex, setEditingEvidenceIndex] = useState<number | null>(null);

  // Deadlines CRUD state
  const [deadlinesList, setDeadlinesList] = useState<DeadlineEntry[]>([]);
  const [editingDeadlineIndex, setEditingDeadlineIndex] = useState<number | null>(null);
  const [deadlineRuleKey, setDeadlineRuleKey] = useState(DEADLINE_RULES[0].key);
  const [deadlineStartDate, setDeadlineStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [aiDetectText, setAiDetectText] = useState("");
  const [aiDetecting, setAiDetecting] = useState(false);
  const [aiDetectedDeadlines, setAiDetectedDeadlines] = useState<
    Array<{ title: string; date: string; type: string; confidence: number }>
  >([]);

  // RHF forms
  const deadlineForm = useForm<DeadlineFormData>({
    resolver: zodResolver(deadlineFormSchema),
    defaultValues: {
      title: "",
      due_date: "",
      type: "deadline",
      status: "pending",
      description: "",
    },
  });
  const evidenceForm = useForm<EvidenceFormData>({
    resolver: zodResolver(evidenceFormSchema),
    defaultValues: { title: "", type: "", description: "", source: "", weight: 0.5 },
  });
  const timeForm = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      description: "",
      minutes: "",
      rate: "200",
      lawyer: "",
      activity_type: "Beratung",
      billable: true,
    },
  });
  const expenseForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { description: "", amount: "", billable: true },
  });

  useUnsavedChanges(
    deadlineForm.formState.isDirty ||
      evidenceForm.formState.isDirty ||
      timeForm.formState.isDirty ||
      expenseForm.formState.isDirty
  );

  const onDeadlineSubmit = useCallback(
    (data: DeadlineFormData) => {
      const date = data.due_date;
      const entry: DeadlineEntry = {
        ...withDeadlineAudit(
          data as DeadlineEntry,
          editingDeadlineIndex !== null ? "updated" : "created"
        ),
        id: data.id || `dl-${Date.now()}`,
        due_date: date,
        date,
        status: computeDeadlineStatus(date, data.status),
        review_status: data.review_status ?? "unreviewed",
      };
      let updated: DeadlineEntry[];
      if (editingDeadlineIndex !== null) {
        updated = deadlinesList.map((dl, i) => (i === editingDeadlineIndex ? entry : dl));
        setEditingDeadlineIndex(null);
      } else {
        updated = [...deadlinesList, entry];
      }
      setDeadlinesList(updated);
      deadlineForm.reset({
        title: "",
        due_date: "",
        type: "deadline",
        status: "pending",
        description: "",
      });
      saveCaseUpdate({ deadlines: updated });
    },
    [deadlinesList, editingDeadlineIndex]
  );

  const onEvidenceSubmit = useCallback(
    (data: EvidenceFormData) => {
      let updated: EvidenceEntry[];
      if (editingEvidenceIndex !== null) {
        updated = evidenceList.map((ev, i) => (i === editingEvidenceIndex ? data : ev));
        setEditingEvidenceIndex(null);
      } else {
        updated = [...evidenceList, data as EvidenceEntry];
      }
      setEvidenceList(updated);
      evidenceForm.reset({ title: "", type: "", description: "", source: "", weight: 0.5 });
      saveCaseUpdate({ evidence: updated });
    },
    [evidenceList, editingEvidenceIndex]
  );

  const onTimeSubmit = useCallback(
    (data: TimeEntryFormData) => {
      const mins = parseInt(data.minutes, 10);
      const rate = parseFloat(data.rate || "");
      if (data.description.trim() && Number.isFinite(mins) && mins > 0) {
        const updated: TimeEntry[] = [
          ...timeEntries,
          {
            id: Date.now().toString(),
            description: data.description.trim(),
            minutes: mins,
            date: new Date().toISOString(),
            rate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
            billable: data.billable,
            billed: false,
            lawyer: data.lawyer?.trim() || undefined,
            activity_type: data.activity_type,
          },
        ];
        setTimeEntries(updated);
        timeForm.reset({
          description: "",
          minutes: "",
          rate: "200",
          lawyer: "",
          activity_type: "Beratung",
          billable: true,
        });
        saveCaseUpdate({ timeEntries: updated });
      }
    },
    [timeEntries]
  );

  const onExpenseSubmit = useCallback(
    (data: ExpenseFormData) => {
      const amount = parseFloat(data.amount);
      if (data.description.trim() && Number.isFinite(amount) && amount > 0) {
        const updated: ExpenseEntry[] = [
          ...expensesList,
          {
            id: Date.now().toString(),
            description: data.description.trim(),
            amount: Math.round(amount * 100) / 100,
            date: new Date().toISOString(),
            billable: data.billable,
            billed: false,
          },
        ];
        setExpensesList(updated);
        expenseForm.reset({ description: "", amount: "", billable: true });
        saveCaseUpdate({ expenses: updated });
      }
    },
    [expensesList]
  );

  // Live timer interval
  useEffect(() => {
    if (!timerRunning || !timerStartAt) return;
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStartAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerStartAt]);

  // Initialize from brain page
  const meQuery = useMe();

  useEffect(() => {
    if (meQuery.data?.user?.role) setUserRole(meQuery.data.user.role);
    if (meQuery.data?.user?.name) setCurrentUserName(meQuery.data.user.name);
    if (meQuery.data?.user?.id) setCurrentUserId(meQuery.data.user.id);
  }, [meQuery.data]);

  // Live presence — who else is viewing this case?
  const presenceUser = meQuery.data?.user
    ? { id: meQuery.data.user.id, email: meQuery.data.user.email || "" }
    : null;
  const activeUsers = usePresence(slug, presenceUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const [page, allContacts] = await Promise.all([
          api.brain.getPage(slug),
          api.brain.listPages({ type: "legal_contact", limit: 200 }).catch(() => [] as BrainPage[]),
        ]);
        if (!cancelled) {
          const detail = parseCaseDetail(page);
          setCaseData(detail);
          setTasks(detail.tasks);
          setTimeEntries(detail.timeEntries);
          setExpensesList(detail.expenses);
          timeForm.setValue("lawyer", detail.ownLawyerName || "");
          setEvidenceList(detail.evidence || []);
          setDeadlinesList(
            detail.deadlines.length > 0
              ? detail.deadlines
              : detail.timelineEvents.map((entry) => timelineToDeadline(entry, detail.slug))
          );
          setContacts(
            allContacts.map((p) => {
              const fm = p.frontmatter as Record<string, unknown>;
              return {
                slug: p.slug,
                name: String(fm.name ?? p.title ?? ""),
                role: String(fm.role ?? "other"),
              };
            })
          );
        }
      } catch (err) {
        console.error(
          "[case-detail] failed to load case:",
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setContactsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Live sync: poll every 30s and warn if version changed
  useEffect(() => {
    if (!caseData) return;
    const id = setInterval(async () => {
      try {
        const page = await api.brain.getPage(slug);
        const fm = caseFrontmatter(page);
        const remoteVersion = (fm.version as number) || 0;
        if (remoteVersion > caseData.version) {
          setConflictWarning(t("cases.detail_conflict_warning") + ` (${remoteVersion})`);
        }
      } catch {
        // ignore polling errors
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.version, slug]);

  // Auto-save tasks and time entries back to brain page
  async function saveCaseUpdate(updates: Partial<CaseDetail>) {
    if (!caseData) return;
    if (conflictWarning) {
      setSaveError(t("cases.detail_conflict_save_error"));
      return;
    }
    try {
      // Build audit entry from update keys
      const changedFields = Object.keys(updates).filter((k) => k !== "auditLog");
      const auditEntry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: "updated" as const,
        actor: currentUserName,
        field: changedFields.join(", ") || "general",
        note: changedFields.includes("tasks")
          ? t("cases.detail_audit_tasks")
          : changedFields.includes("timeEntries")
            ? t("cases.detail_audit_time")
            : changedFields.includes("expenses")
              ? t("cases.detail_audit_expenses")
              : changedFields.includes("deadlines")
                ? t("cases.detail_audit_deadlines")
                : changedFields.includes("evidence")
                  ? t("cases.detail_audit_evidence")
                  : changedFields.includes("documents")
                    ? t("cases.detail_audit_documents")
                    : changedFields.includes("status")
                      ? t("cases.detail_audit_status")
                      : t("cases.detail_audit_general"),
      };
      const existingAudit = caseData.auditLog ?? [];
      const newAudit = [...existingAudit, auditEntry];

      const frontmatter: Record<string, unknown> = {
        type: "legal_case",
        case_number: caseData.caseNumber,
        status: caseData.status,
        legal_area: caseData.legalArea,
        priority: caseData.priority,
        opponent_name: caseData.opponentName,
        opponent_slugs: updates.opponentSlugs ?? caseData.opponentSlugs,
        client_name: caseData.clientName,
        client_slug: updates.clientSlug ?? caseData.clientSlug,
        court_name: caseData.courtName,
        court_slug: updates.courtSlug ?? caseData.courtSlug,
        own_lawyer_name: caseData.ownLawyerName,
        own_lawyer_slug: updates.ownLawyerSlug ?? caseData.ownLawyerSlug,
        claims: caseData.claims,
        defenses: caseData.defenses,
        tags: caseData.tags,
        tasks: updates.tasks ?? tasks,
        time_entries: updates.timeEntries ?? timeEntries,
        expenses: updates.expenses ?? expensesList,
        timeline_events: updates.timelineEvents ?? caseData.timelineEvents,
        documents: updates.documents ?? caseData.documents,
        evidence: updates.evidence ?? evidenceList,
        deadlines: updates.deadlines ?? deadlinesList,
        portal_enabled: updates.portalEnabled ?? caseData.portalEnabled,
        portal_note: updates.portalNote ?? caseData.portalNote,
        audit_log: newAudit,
        version: (caseData.version || 0) + 1,
      };
      if (isOnline()) {
        const slugPath = caseData.slug.split("/").map(encodeURIComponent).join("/");
        const res = await csrfFetch(`/api/pages/${slugPath}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(caseData.version || 0),
          },
          body: JSON.stringify({
            title: caseData.title,
            content: caseData.facts,
            frontmatter,
          }),
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          setConflictWarning(
            t("cases.detail_conflict_warning_v2") +
              ` (${data.currentVersion ?? t("cases.detail_unknown")})`
          );
          setSaveError(null);
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
      } else {
        await enqueueMutation({
          type: "updatePage",
          payload: {
            slug: caseData.slug,
            title: caseData.title,
            content: caseData.facts,
            frontmatter,
          },
        });
      }
      setSaveError(null);
    } catch (e) {
      // Speicherfehler MÜSSEN sichtbar sein — sonst verschwinden Tasks und
      // Zeiteinträge beim nächsten Reload kommentarlos.
      setSaveError(
        e instanceof Error
          ? `Speichern fehlsgeschlagen: ${e.message}`
          : "Speichern fehlgeschlagen — Änderungen sind nur lokal sichtbar."
      );
    }
  }

  async function handleQuery() {
    if (!query.trim() || !caseData) return;
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await api.query.think(
        `Im Kontext der Akte "${caseData.title}" (${caseData.caseNumber}): ${query}`,
        {
          mode: "tokenmax",
          queryMode: "deep_matter",
          caseSlug: caseData.slug,
        }
      );
      setQueryResult(res.answer);
    } catch {
      setQueryResult(t("cases.detail_query_error"));
    } finally {
      setQueryLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="brand-text animate-spin" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4">
        <Briefcase size={48} className="text-[color:var(--ds-border)]" />
        <p className="text-[color:var(--ds-text-muted)]">{t("cases.detail_not_found")}</p>
        <Link href="/dashboard/cases">
          <Button variant="primary" className="brand-bg brand-bg gap-2 text-white">
            <ArrowLeft size={16} />
            {t("cases.detail_back")}
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[caseData.status] || STATUS_CONFIG.open;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Save errors must be visible (tasks/time entries would silently vanish) */}
      <div aria-live="assertive">
        {saveError && (
          <div
            className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-sm text-red-600"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {saveError}
          </div>
        )}
        {conflictWarning && (
          <div
            className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-6 py-2 text-sm text-amber-600"
            role="alert"
          >
            <AlertTriangle size={14} aria-hidden="true" />
            {conflictWarning}
            <button
              onClick={() => window.location.reload()}
              className="brand-text ml-auto text-xs hover:underline"
            >
              {t("cases.detail_refresh_now")}
            </button>
          </div>
        )}
      </div>
      {/* Header */}
      <div className="shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-6 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Link
            href="/dashboard/cases"
            aria-label={t("aria.back_to_cases")}
            className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {t("cases.detail_breadcrumb")}
          </span>
          <ChevronRight size={12} className="text-[color:var(--ds-text-muted)]" />
          <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
            {caseData.caseNumber}
          </span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border",
                STATUS_BG[statusCfg.color],
                STATUS_BORDER[statusCfg.color]
              )}
              aria-hidden="true"
            >
              <StatusIcon size={22} className={STATUS_TEXT[statusCfg.color]} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[color:var(--ds-text)]">{caseData.title}</h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant="default"
                  className={cn(
                    "border text-xs",
                    caseData.priority === "critical"
                      ? "border-red-500/20 bg-red-500/10 text-red-600"
                      : caseData.priority === "high"
                        ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                        : caseData.priority === "low"
                          ? "border-gray-500/20 bg-gray-500/10 text-gray-400"
                          : "border-blue-500/20 bg-blue-500/10 text-blue-600"
                  )}
                >
                  {caseData.priority}
                </Badge>
                {caseData.legalArea && (
                  <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                    <Scale size={10} />
                    {caseData.legalArea}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <Badge
              variant="default"
              className={cn("border text-xs", statusBadgeClasses(statusCfg.color))}
            >
              {t(statusCfg.labelKey as DashboardKey)}
            </Badge>
            {activeUsers.length > 0 && (
              <div className="mt-1.5 flex items-center justify-end gap-1">
                {activeUsers.slice(0, 4).map((u) => (
                  <div
                    key={u.userId}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--ds-surface)] bg-emerald-500/20 text-[10px] font-medium text-emerald-600"
                    title={`${u.email} ist gerade hier aktiv`}
                  >
                    {u.email.slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {activeUsers.length > 4 && (
                  <span className="text-[10px] text-[color:var(--ds-text-muted)]">
                    +{activeUsers.length - 4}
                  </span>
                )}
              </div>
            )}
            {caseData.estimatedValue && (
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_streitwert")}: {caseData.estimatedValue.min.toLocaleString()}–
                {caseData.estimatedValue.max.toLocaleString()} {caseData.estimatedValue.currency}
              </p>
            )}
          </div>
        </div>

        {/* Meta bar */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
          {caseData.clientName && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {t("cases.detail_client")}:{" "}
              {caseData.clientSlug ? (
                <Link
                  href={`/dashboard/contacts?highlight=${encodeURIComponent(caseData.clientSlug)}`}
                  className="brand-text hover:underline"
                >
                  {caseData.clientName}
                </Link>
              ) : (
                <span className="text-[color:var(--ds-text-muted)]">{caseData.clientName}</span>
              )}
            </span>
          )}
          {caseData.opponentName && (
            <span className="flex items-center gap-1">
              <ShieldAlert size={10} />
              {t("cases.detail_opponent")}:{" "}
              <span className="text-[color:var(--ds-text-muted)]">{caseData.opponentName}</span>
            </span>
          )}
          {caseData.courtName && (
            <span className="flex items-center gap-1">
              <Briefcase size={10} />
              {t("cases.detail_court")}:{" "}
              <span className="text-[color:var(--ds-text-muted)]">{caseData.courtName}</span>
            </span>
          )}
          {caseData.ownLawyerName && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {t("cases.detail_lawyer")}:{" "}
              <span className="text-[color:var(--ds-text-muted)]">{caseData.ownLawyerName}</span>
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  activeTab === tab.key
                    ? "brand-text border-[color:var(--brand-primary)]"
                    : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={14} />
                {t(tab.labelKey as DashboardKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "overview" && (
          <div className="max-w-3xl space-y-4">
            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={() => {
                  setActiveTab("query");
                  setQuery(t("cases.detail_qb_strategy"));
                }}
              >
                <Lightbulb size={14} />
                {t("cases.detail_btn_strategy")}
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowStatusDialog(true)}
              >
                <ChevronRight size={14} />
                {t("cases.detail_btn_status_change")}
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => {
                  setActiveTab("query");
                  setQuery(t("cases.detail_qb_chances"));
                }}
              >
                <Scale size={14} />
                {t("cases.detail_btn_assess")}
              </Button>
              {(userRole === "admin" || userRole === "lawyer") && (
                <>
                  <Button
                    variant="secondary"
                    className={cn(
                      "border text-sm",
                      caseData.portalEnabled
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                    )}
                    onClick={() => {
                      const updated = { ...caseData, portalEnabled: !caseData.portalEnabled };
                      setCaseData(updated);
                      saveCaseUpdate({
                        ...updated,
                      });
                    }}
                  >
                    {caseData.portalEnabled
                      ? t("cases.detail_btn_portal_enabled")
                      : t("cases.detail_btn_portal_enable")}
                  </Button>
                  {caseData.portalEnabled && (
                    <Button
                      variant="secondary"
                      className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                      onClick={async () => {
                        setGeneratingPortal(true);
                        try {
                          const res = await csrfFetch("/api/portal/generate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ caseSlug: caseData.slug }),
                          });
                          const data = await res.json();
                          if (res.ok && data.url) {
                            const fullUrl = `${window.location.origin}${data.url}`;
                            setPortalUrl(fullUrl);
                            await navigator.clipboard.writeText(fullUrl);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          } else {
                            setSaveError(t("cases.detail_portal_error"));
                          }
                        } catch (err) {
                          console.error(
                            "[portal] generate failed:",
                            err instanceof Error ? err.message : String(err)
                          );
                          setSaveError(t("cases.detail_portal_error"));
                        } finally {
                          setGeneratingPortal(false);
                        }
                      }}
                      disabled={generatingPortal}
                    >
                      {generatingPortal ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Copy size={14} />
                      )}
                      {generatingPortal
                        ? t("cases.detail_btn_portal_generating")
                        : copied
                          ? t("cases.detail_btn_portal_copied")
                          : t("cases.detail_btn_portal_link")}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Status Change Dialog */}
            {showStatusDialog && (
              <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("cases.detail_status_dialog_title")}
                  </h3>
                  <button
                    onClick={() => {
                      setShowStatusDialog(false);
                      setStatusError(null);
                      setPendingStatus(null);
                    }}
                    className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  >
                    {t("cases.detail_status_dialog_cancel")}
                  </button>
                </div>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_status_current")}{" "}
                  <span className="font-semibold">
                    {STATUS_LABELS_DE[caseData.status as CaseStatus] ?? caseData.status}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {getAllowedTransitions(caseData.status as CaseStatus).map((target) => {
                    const cfg = STATUS_CONFIG[target];
                    const Icon = cfg?.icon ?? ChevronRight;
                    return (
                      <button
                        key={target}
                        onClick={() => {
                          const result = validateTransition(caseData.status as CaseStatus, target);
                          if (result.allowed) {
                            setPendingStatus(target);
                            setStatusError(null);
                          } else {
                            setStatusError(
                              result.reason || t("cases.detail_status_transition_not_allowed")
                            );
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                          pendingStatus === target
                            ? "brand-bg border-transparent text-white"
                            : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)]"
                        )}
                      >
                        <Icon size={12} />
                        {cfg
                          ? t(cfg.labelKey as DashboardKey)
                          : (STATUS_LABELS_DE[target] ?? target)}
                      </button>
                    );
                  })}
                </div>
                {statusError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600">
                    <AlertTriangle size={12} />
                    {statusError}
                  </p>
                )}
                {pendingStatus && (
                  <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-2">
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {transitionDescription(caseData.status as CaseStatus, pendingStatus)}
                    </p>
                    <Button
                      variant="primary"
                      className="brand-bg gap-1.5 text-xs text-white"
                      onClick={() => {
                        const updated = { ...caseData, status: pendingStatus };
                        setCaseData(updated);
                        saveCaseUpdate(updated);
                        setShowStatusDialog(false);
                        setPendingStatus(null);
                        setStatusError(null);
                      }}
                    >
                      <Check size={12} />
                      {t("cases.detail_status_confirm")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Portal link display */}
            {portalUrl && (userRole === "admin" || userRole === "lawyer") && (
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="mb-1 text-xs font-medium text-emerald-600">
                  {t("cases.detail_portal_valid")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs break-all text-[color:var(--ds-text-muted)]">
                    {portalUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(portalUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="brand-text shrink-0 text-xs hover:underline"
                  >
                    {copied ? t("cases.detail_portal_copied") : t("cases.detail_portal_copy")}
                  </button>
                  <button
                    onClick={async () => {
                      const token = portalUrl.split("/portal/")[1];
                      if (!token) return;
                      try {
                        const res = await csrfFetch("/api/portal/revoke", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token }),
                        });
                        if (res.ok) {
                          setPortalUrl(null);
                          setSaveError(null);
                        } else {
                          setSaveError(t("cases.detail_portal_revoke_error"));
                        }
                      } catch {
                        setSaveError(t("cases.detail_portal_revoke_error"));
                      }
                    }}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    {t("cases.detail_portal_revoke")}
                  </button>
                </div>
              </div>
            )}

            {/* Stammdaten — Kontakte verknüpfen */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_stammdaten")}
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Client */}
                <div className="space-y-1">
                  <label className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_client")}
                  </label>
                  <select
                    value={caseData.clientSlug || ""}
                    onChange={(e) => {
                      const selected = contacts.find((c) => c.slug === e.target.value);
                      const updated: CaseDetail = {
                        ...caseData,
                        clientSlug: e.target.value || undefined,
                        clientName: selected?.name ?? caseData.clientName,
                      };
                      setCaseData(updated);
                      saveCaseUpdate({
                        clientSlug: updated.clientSlug,
                        clientName: updated.clientName,
                      });
                    }}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">{t("cases.detail_select_placeholder")}</option>
                    {contacts
                      .filter((c) => c.role === "client")
                      .map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                {/* Opponent */}
                <div className="space-y-1">
                  <label className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_opponent")}
                  </label>
                  <select
                    value={(caseData.opponentSlugs ?? [])[0] || ""}
                    onChange={(e) => {
                      const selected = contacts.find((c) => c.slug === e.target.value);
                      const slugs = e.target.value ? [e.target.value] : undefined;
                      const updated: CaseDetail = {
                        ...caseData,
                        opponentSlugs: slugs,
                        opponentName: selected?.name ?? caseData.opponentName,
                      };
                      setCaseData(updated);
                      saveCaseUpdate({
                        opponentSlugs: updated.opponentSlugs,
                        opponentName: updated.opponentName,
                      });
                    }}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">{t("cases.detail_select_placeholder")}</option>
                    {contacts
                      .filter((c) => c.role === "opponent")
                      .map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                {/* Court */}
                <div className="space-y-1">
                  <label className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_court")}
                  </label>
                  <select
                    value={caseData.courtSlug || ""}
                    onChange={(e) => {
                      const selected = contacts.find((c) => c.slug === e.target.value);
                      const updated: CaseDetail = {
                        ...caseData,
                        courtSlug: e.target.value || undefined,
                        courtName: selected?.name ?? caseData.courtName,
                      };
                      setCaseData(updated);
                      saveCaseUpdate({
                        courtSlug: updated.courtSlug,
                        courtName: updated.courtName,
                      });
                    }}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">{t("cases.detail_select_placeholder")}</option>
                    {contacts
                      .filter((c) => c.role === "court")
                      .map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {contactsLoading && (
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_contacts_loading")}
                </p>
              )}
              {contacts.length === 0 && !contactsLoading && (
                <p className="text-xs text-amber-600">
                  {t("cases.detail_no_contacts")}{" "}
                  <Link href="/dashboard/contacts" className="brand-text hover:underline">
                    {t("cases.detail_create_contact")}
                  </Link>
                </p>
              )}
            </div>

            {/* Facts */}
            {caseData.facts && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cases.detail_facts")}
                </h3>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                  {parseCitations(caseData.facts).map((segment, i) =>
                    segment.isCitation ? (
                      <CitationLink key={i} citation={segment.text} />
                    ) : (
                      <span key={i}>{segment.text}</span>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Claims */}
            {caseData.claims.length > 0 && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cases.detail_claims")}
                </h3>
                <ul className="space-y-1.5">
                  {caseData.claims.map((claim, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                    >
                      <span className="brand-text mt-0.5">•</span>
                      {claim}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Defenses */}
            {caseData.defenses.length > 0 && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cases.detail_defenses")}
                </h3>
                <ul className="space-y-1.5">
                  {caseData.defenses.map((def, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                    >
                      <span className="mt-0.5 text-emerald-600">•</span>
                      {def}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Strategy */}
            {caseData.strategy && (
              <div className="brand-border brand-soft rounded-xl border p-4">
                <h3 className="brand-text mb-2 text-sm font-semibold">
                  {t("cases.detail_strategy")}
                </h3>
                <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
                  {caseData.strategy.recommended}
                </p>
                {caseData.strategy.risks && caseData.strategy.risks.length > 0 && (
                  <div className="mt-3">
                    <h4 className="mb-1 text-xs font-semibold text-red-600">
                      {t("cases.detail_risks")}
                    </h4>
                    <ul className="space-y-1">
                      {(caseData.strategy.risks ?? []).map((r, i) => (
                        <li key={i} className="text-xs text-[color:var(--ds-text-muted)]">
                          • {r.description} ({r.probability} / {r.impact})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            {caseData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {caseData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="default"
                    className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="max-w-3xl space-y-4">
            <div className="mb-4 flex items-center gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={() => {
                  setActiveTab("query");
                  setQuery(t("cases.detail_qb_timeline"));
                }}
              >
                <CalendarClock size={14} />
                {t("cases.detail_timeline_generate")}
              </Button>
            </div>
            <div className="relative space-y-4 pl-6">
              <div className="absolute top-0 bottom-0 left-2 w-px bg-[color:var(--ds-border)]" />
              {/* Creation */}
              <div className="relative">
                <div className="brand-soft absolute -left-4 h-2 w-2 rounded-full" />
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(caseData.createdAt).toLocaleDateString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </div>
                  <div className="text-sm text-[color:var(--ds-text)]">
                    {t("cases.detail_timeline_case_created")}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {caseData.caseNumber}
                  </div>
                </div>
              </div>
              {/* Dynamic timeline events from frontmatter */}
              {caseData.timelineEvents?.map((ev) => (
                <div key={ev.id} className="relative">
                  <div
                    className={`absolute -left-4 h-2 w-2 rounded-full ${
                      ev.type === "deadline"
                        ? "bg-amber-500"
                        : ev.type === "hearing"
                          ? "bg-blue-500"
                          : ev.type === "filing"
                            ? "bg-emerald-500"
                            : ev.type === "status_change"
                              ? "brand-soft"
                              : "bg-[color:var(--ds-text-subtle)]"
                    }`}
                  />
                  <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {ev.date
                        ? new Date(ev.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")
                        : "—"}
                    </div>
                    <div className="text-sm text-[color:var(--ds-text)]">{ev.title}</div>
                    {ev.description && (
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {ev.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* Status changes */}
              {caseData.status !== "open" && (
                <div className="relative">
                  <div className="absolute -left-4 h-2 w-2 rounded-full bg-amber-500" />
                  <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {new Date(caseData.updatedAt).toLocaleDateString(
                        lang === "en" ? "en-GB" : "de-DE"
                      )}
                    </div>
                    <div className="text-sm text-[color:var(--ds-text)]">
                      {t("cases.detail_timeline_status_changed")}{" "}
                      {STATUS_CONFIG[caseData.status]
                        ? t(STATUS_CONFIG[caseData.status].labelKey as DashboardKey)
                        : caseData.status}
                    </div>
                  </div>
                </div>
              )}
              {/* Strategy generated */}
              {caseData.strategy && (
                <div className="relative">
                  <div className="absolute -left-4 h-2 w-2 rounded-full bg-emerald-500" />
                  <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {new Date(
                        caseData.strategy.generatedAt || caseData.updatedAt
                      ).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                    </div>
                    <div className="text-sm text-[color:var(--ds-text)]">
                      {t("cases.detail_timeline_strategy_generated")}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {caseData.strategy.recommendedApproach}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !caseData) return;
                    if (!isOnline()) {
                      setUploadError(t("cases.detail_doc_offline"));
                      return;
                    }
                    try {
                      const res = await api.upload.file(file, {
                        title: file.name,
                        source: "legal_case",
                        tags: [caseData.slug],
                      });
                      const updated = [
                        ...caseData.documents,
                        {
                          id: Date.now().toString(),
                          name: file.name,
                          url: res.slug,
                          uploadedAt: new Date().toISOString(),
                          size: file.size,
                        },
                      ];
                      setCaseData({ ...caseData, documents: updated });
                      saveCaseUpdate({ documents: updated });
                      setUploadError(null);
                    } catch (err) {
                      setUploadError(
                        err instanceof Error ? err.message : t("cases.detail_doc_upload_failed")
                      );
                    }
                  }}
                />
                <span className="brand-bg brand-bg inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors">
                  <Plus size={14} /> {t("cases.detail_doc_upload")}
                </span>
              </label>
            </div>

            {uploadError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
                {uploadError}
              </div>
            )}

            {caseData.documents.length === 0 ? (
              <div className="space-y-4 py-20 text-center">
                <FileText size={48} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-[color:var(--ds-text-muted)]">{t("cases.detail_doc_empty")}</p>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_doc_empty_hint")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {caseData.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5"
                  >
                    <FileText size={16} className="brand-text shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</div>
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {new Date(doc.uploadedAt).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )}
                        {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
                        {doc.kind ? ` · ${doc.kind}` : ""}
                      </div>
                    </div>
                    {(doc.slug || doc.url) && (
                      <Link
                        href={`/dashboard/brain/${encodeURIComponent(doc.slug || doc.url || "")}`}
                        className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                      >
                        {t("cases.detail_doc_open")}
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        const updated = caseData.documents.filter((d) => d.id !== doc.id);
                        setCaseData({ ...caseData, documents: updated });
                        saveCaseUpdate({ documents: updated });
                      }}
                      className="text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "deadlines" && (
          <div className="max-w-3xl space-y-4">
            {/* Add/Edit Form */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {editingDeadlineIndex !== null
                  ? t("cases.detail_dl_edit")
                  : t("cases.detail_dl_add")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_dl_title")}
                  </label>
                  <input
                    {...deadlineForm.register("title")}
                    placeholder={t("cases.detail_dl_title_ph")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  {deadlineForm.formState.errors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {deadlineForm.formState.errors.title.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_dl_due_date")}
                  </label>
                  <input
                    type="date"
                    {...deadlineForm.register("due_date")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  {deadlineForm.formState.errors.due_date && (
                    <p className="mt-1 text-xs text-red-600">
                      {deadlineForm.formState.errors.due_date.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_dl_type")}
                  </label>
                  <select
                    {...deadlineForm.register("type")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="deadline">{t("cases.detail_dl_type_deadline")}</option>
                    <option value="hearing">{t("cases.detail_dl_type_hearing")}</option>
                    <option value="meeting">{t("cases.detail_dl_type_meeting")}</option>
                    <option value="filing">{t("cases.detail_dl_type_filing")}</option>
                    <option value="reminder">{t("cases.detail_dl_type_reminder")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_dl_status")}
                  </label>
                  <select
                    {...deadlineForm.register("status")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="pending">{t("cases.detail_dl_status_pending")}</option>
                    <option value="warning">{t("cases.detail_dl_status_warning")}</option>
                    <option value="critical">{t("cases.detail_dl_status_critical")}</option>
                    <option value="overdue">{t("cases.detail_dl_status_overdue")}</option>
                    <option value="done">{t("cases.detail_dl_status_done")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_description")}
                </label>
                <textarea
                  {...deadlineForm.register("description")}
                  rows={2}
                  placeholder={t("cases.detail_dl_description_ph")}
                  className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="brand-border brand-soft/5 space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-text text-xs font-medium">
                      {t("cases.detail_dl_calc_rule")}
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_dl_calc_rule_desc")}
                    </p>
                  </div>
                  <Badge variant="default" className="brand-soft brand-border brand-text text-xs">
                    {t("cases.detail_dl_review_required")}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <select
                    value={deadlineRuleKey}
                    onChange={(e) => setDeadlineRuleKey(e.target.value)}
                    className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    {DEADLINE_RULES.map((rule) => (
                      <option key={rule.key} value={rule.key}>
                        {rule.label} ({rule.law})
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={deadlineStartDate}
                    onChange={(e) => setDeadlineStartDate(e.target.value)}
                    className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => {
                      const rule =
                        DEADLINE_RULES.find((r) => r.key === deadlineRuleKey) ?? DEADLINE_RULES[0];
                      const calculated = calculateDeadline(rule, deadlineStartDate);
                      deadlineForm.reset(calculated as DeadlineFormData);
                    }}
                  >
                    {t("cases.detail_dl_calculate")}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={deadlineForm.handleSubmit(onDeadlineSubmit)}
                >
                  <Plus size={14} />
                  {editingDeadlineIndex !== null
                    ? t("cases.detail_dl_save")
                    : t("cases.detail_dl_add_btn")}
                </Button>
                {editingDeadlineIndex !== null && (
                  <Button
                    variant="ghost"
                    className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    onClick={() => {
                      setEditingDeadlineIndex(null);
                      deadlineForm.reset({
                        title: "",
                        due_date: "",
                        type: "deadline",
                        status: "pending",
                        description: "",
                      });
                    }}
                  >
                    {t("cases.detail_dl_cancel")}
                  </Button>
                )}
              </div>
            </div>

            {/* AI Deadline Detection */}
            <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">
                    {t("cases.detail_dl_ai_title")}
                  </span>
                </div>
                <Badge
                  variant="default"
                  className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                >
                  Beta
                </Badge>
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_dl_ai_desc")}
              </p>
              <textarea
                value={aiDetectText}
                onChange={(e) => setAiDetectText(e.target.value)}
                rows={3}
                placeholder={t("cases.detail_dl_ai_ph")}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-blue-500/50 focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
                  onClick={async () => {
                    if (!aiDetectText.trim()) return;
                    setAiDetecting(true);
                    try {
                      const res = await csrfFetch("/api/legal/ai-deadlines", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: aiDetectText, caseSlug: slug }),
                      });
                      const data = await res.json();
                      if (data.detected?.length > 0) {
                        setAiDetectedDeadlines(data.detected);
                      } else {
                        setAiDetectedDeadlines([]);
                      }
                    } catch {
                      setAiDetectedDeadlines([]);
                    } finally {
                      setAiDetecting(false);
                    }
                  }}
                  disabled={aiDetecting || !aiDetectText.trim()}
                >
                  {aiDetecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {aiDetecting ? t("cases.detail_dl_ai_analyzing") : t("cases.detail_dl_ai_detect")}
                </Button>
                {aiDetectedDeadlines.length > 0 && (
                  <Button
                    variant="ghost"
                    className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    onClick={() => {
                      setAiDetectedDeadlines([]);
                      setAiDetectText("");
                    }}
                  >
                    {t("cases.detail_dl_ai_reset")}
                  </Button>
                )}
              </div>
              {aiDetectedDeadlines.length > 0 && (
                <div className="space-y-2">
                  {aiDetectedDeadlines.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-[color:var(--ds-text)]">{d.title}</div>
                        <div className="text-xs text-[color:var(--ds-text-muted)]">
                          {d.date} · {d.type}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="default"
                          className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                        >
                          {Math.round(d.confidence * 100)}%
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
                          onClick={() => {
                            const entry: DeadlineEntry = {
                              id: `dl-${Date.now()}`,
                              title: d.title,
                              date: d.date,
                              due_date: d.date,
                              type: d.type as DeadlineEntry["type"],
                              status: "pending",
                              review_status: "unreviewed",
                            };
                            const updated = [...deadlinesList, entry];
                            setDeadlinesList(updated);
                            saveCaseUpdate({ deadlines: updated });
                            setAiDetectedDeadlines((prev) => prev.filter((_, idx) => idx !== i));
                          }}
                        >
                          <Plus size={12} /> {t("cases.detail_dl_add_btn")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deadlines List */}
            {deadlinesList.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <CalendarClock size={40} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_empty")}
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_dl_empty_hint")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {deadlinesList.map((dl, i) => {
                  const dlDate = new Date(dl.due_date || dl.date || Date.now());
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const daysUntil = Math.ceil(
                    (dlDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isOverdue = daysUntil < 0;
                  const isCritical = daysUntil >= 0 && daysUntil <= 3;
                  const isWarning = daysUntil > 3 && daysUntil <= 7;
                  const status =
                    dl.status === "done"
                      ? "done"
                      : isOverdue
                        ? "overdue"
                        : isCritical
                          ? "critical"
                          : isWarning
                            ? "warning"
                            : "pending";
                  const statusConfig: Record<
                    string,
                    { label: string; color: string; border: string }
                  > = {
                    pending: {
                      label: t("cases.detail_dl_status_pending"),
                      color: "text-blue-600",
                      border: "border-blue-500/20 bg-blue-500/5",
                    },
                    warning: {
                      label: t("cases.detail_dl_status_warning"),
                      color: "text-amber-600",
                      border: "border-amber-500/20 bg-amber-500/5",
                    },
                    critical: {
                      label: t("cases.detail_dl_status_critical"),
                      color: "text-red-600",
                      border: "border-red-500/20 bg-red-500/5",
                    },
                    overdue: {
                      label: t("cases.detail_dl_status_overdue"),
                      color: "text-rose-600",
                      border: "border-rose-500/20 bg-rose-500/5",
                    },
                    done: {
                      label: t("cases.detail_dl_status_done"),
                      color: "text-emerald-600",
                      border: "border-emerald-500/20 bg-emerald-500/5",
                    },
                  };
                  const cfg = statusConfig[status];
                  return (
                    <div key={i} className={cn("rounded-xl border p-4", cfg.border)}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[color:var(--ds-text)]">
                            {dl.title}
                          </span>
                          <Badge
                            variant="default"
                            className={cn(
                              "border text-xs",
                              statusBadgeClasses(status as StatusColor)
                            )}
                          >
                            {cfg.label}
                          </Badge>
                          <Badge
                            variant="default"
                            className={cn(
                              "border text-xs",
                              dl.review_status === "approved"
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                : dl.review_status === "rejected"
                                  ? "border-red-500/20 bg-red-500/10 text-red-600"
                                  : dl.review_status === "reviewed"
                                    ? "border-blue-500/20 bg-blue-500/10 text-blue-600"
                                    : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                            )}
                          >
                            {dl.review_status === "approved"
                              ? t("cases.detail_dl_review_approved")
                              : dl.review_status === "rejected"
                                ? t("cases.detail_dl_review_rejected")
                                : dl.review_status === "reviewed"
                                  ? t("cases.detail_dl_review_reviewed")
                                  : t("cases.detail_dl_review_unreviewed")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const updated = deadlinesList.map((item, idx) =>
                                idx === i
                                  ? withDeadlineAudit(
                                      {
                                        ...item,
                                        review_status:
                                          item.review_status === "approved"
                                            ? "reviewed"
                                            : "approved",
                                        reviewed_at: new Date().toISOString(),
                                        reviewed_by:
                                          caseData.ownLawyerName || t("cases.detail_dl_firm"),
                                      },
                                      "reviewed",
                                      item.review_status === "approved"
                                        ? t("cases.detail_dl_audit_unapprove")
                                        : t("cases.detail_dl_audit_approve")
                                    )
                                  : item
                              );
                              setDeadlinesList(updated);
                              saveCaseUpdate({ deadlines: updated });
                            }}
                            className="px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-emerald-600"
                          >
                            {dl.review_status === "approved"
                              ? t("cases.detail_dl_review_open")
                              : t("cases.detail_dl_review_approve")}
                          </button>
                          <button
                            onClick={() => {
                              setEditingDeadlineIndex(i);
                              deadlineForm.reset(dl as DeadlineFormData);
                            }}
                            className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                          >
                            {t("cases.detail_dl_edit_btn")}
                          </button>
                          <button
                            onClick={() => {
                              const updated = deadlinesList.filter((_, idx) => idx !== i);
                              setDeadlinesList(updated);
                              saveCaseUpdate({ deadlines: updated });
                            }}
                            className="px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                        <span>
                          {dlDate.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                            weekday: "short",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {!isOverdue && status !== "done" && (
                          <span className={cfg.color}>
                            ({daysUntil} {t("cases.detail_dl_days")})
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-rose-600">
                            ({Math.abs(daysUntil)} {t("cases.detail_dl_days_overdue")})
                          </span>
                        )}
                        {dl.type && (
                          <Badge
                            variant="default"
                            className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                          >
                            {dl.type === "deadline"
                              ? t("cases.detail_dl_type_deadline")
                              : dl.type === "hearing"
                                ? t("cases.detail_dl_type_hearing")
                                : dl.type === "meeting"
                                  ? t("cases.detail_dl_type_meeting")
                                  : dl.type === "filing"
                                    ? t("cases.detail_dl_type_filing")
                                    : t("cases.detail_dl_type_reminder")}
                          </Badge>
                        )}
                        {dl.law && (
                          <Badge
                            variant="default"
                            className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                          >
                            {dl.law}
                          </Badge>
                        )}
                      </div>
                      {dl.description && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                          {dl.description}
                        </p>
                      )}
                      {dl.calculation_note && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                          {t("cases.detail_dl_calc_note")} {dl.calculation_note}
                        </p>
                      )}
                      {dl.reviewed_at && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                          {t("cases.detail_dl_reviewed_by")}{" "}
                          {dl.reviewed_by || t("cases.detail_dl_firm")}{" "}
                          {t("cases.detail_dl_reviewed_at")}{" "}
                          {new Date(dl.reviewed_at).toLocaleString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                        </p>
                      )}
                      <div className="mt-3 border-t border-[color:var(--ds-border)]/50 pt-3">
                        <CommentThread
                          parentSlug={`${slug}/deadline/${i}`}
                          parentType="deadline"
                          currentUserId={currentUserId}
                          currentUserName={currentUserName}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTask.trim()) {
                      const updated = [
                        ...tasks,
                        {
                          id: Date.now().toString(),
                          text: newTask.trim(),
                          done: false,
                          createdAt: new Date().toISOString(),
                        },
                      ];
                      setTasks(updated);
                      setNewTask("");
                      saveCaseUpdate({ tasks: updated });
                    }
                  }}
                  placeholder={t("cases.new_task")}
                  aria-label={t("cases.new_task")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={() => {
                  if (newTask.trim()) {
                    const updated = [
                      ...tasks,
                      {
                        id: Date.now().toString(),
                        text: newTask.trim(),
                        done: false,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                    setTasks(updated);
                    setNewTask("");
                    saveCaseUpdate({ tasks: updated });
                  }
                }}
              >
                <Plus size={14} />
                {t("cases.detail_tasks_add")}
              </Button>
            </div>

            {tasks.length === 0 ? (
              <div className="space-y-2 py-10 text-center">
                <ListChecks size={32} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_tasks_empty")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      task.done
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                    )}
                  >
                    <button
                      onClick={() => {
                        const updated = tasks.map((t) =>
                          t.id === task.id ? { ...t, done: !t.done } : t
                        );
                        setTasks(updated);
                        saveCaseUpdate({ tasks: updated });
                      }}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                        task.done
                          ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-600"
                          : "hover:brand-border border-[color:var(--ds-border)]"
                      )}
                    >
                      {task.done && <Check size={12} />}
                    </button>
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        task.done
                          ? "text-[color:var(--ds-text-muted)] line-through"
                          : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {task.text}
                    </span>
                    <button
                      onClick={() => {
                        const updated = tasks.filter((t) => t.id !== task.id);
                        setTasks(updated);
                        saveCaseUpdate({ tasks: updated });
                      }}
                      className="text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "graph" && (
          <div className="max-w-3xl space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Case entity (center) */}
              <div className="brand-border brand-soft flex items-center gap-3 rounded-xl border p-4 md:col-span-2">
                <div className="brand-soft flex h-10 w-10 items-center justify-center rounded-lg">
                  <Briefcase size={20} className="brand-text" />
                </div>
                <div>
                  <div className="brand-text text-sm font-semibold">{caseData.title}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {caseData.caseNumber} · {caseData.legalArea}
                  </div>
                </div>
              </div>

              {/* Client */}
              {caseData.clientName && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/15">
                    <Users size={20} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_client")}
                    </div>
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.clientName}
                    </div>
                  </div>
                </div>
              )}

              {/* Opponent */}
              {caseData.opponentName && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/15">
                    <ShieldAlert size={20} className="text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_opponent")}
                    </div>
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.opponentName}
                    </div>
                  </div>
                </div>
              )}

              {/* Court */}
              {caseData.courtName && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/15">
                    <Landmark size={20} className="text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_court")}
                    </div>
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.courtName}
                    </div>
                  </div>
                </div>
              )}

              {/* Lawyer */}
              {caseData.ownLawyerName && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/15">
                    <User size={20} className="text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_lawyer")}
                    </div>
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.ownLawyerName}
                    </div>
                  </div>
                </div>
              )}

              {/* Claims count */}
              {caseData.claims.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="brand-soft flex h-10 w-10 items-center justify-center rounded-lg">
                    <Scale size={20} className="brand-text" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_claims")}
                    </div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.claims.length} {t("cases.detail_graph_claims_count")}
                    </div>
                  </div>
                </div>
              )}

              {/* Evidence count */}
              {evidenceList.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600/15">
                    <ShieldAlert size={20} className="text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_evidence")}
                    </div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {evidenceList.length} {t("cases.detail_graph_evidence_count")}
                    </div>
                  </div>
                </div>
              )}

              {/* Documents count */}
              {caseData.documents.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-600/15">
                    <FileText size={20} className="text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_documents")}
                    </div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.documents.length} {t("cases.detail_graph_documents_count")}
                    </div>
                  </div>
                </div>
              )}

              {/* Deadlines count */}
              {deadlinesList.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-600/15">
                    <CalendarClock size={20} className="text-pink-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_graph_deadlines")}
                    </div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {deadlinesList.length} {t("cases.detail_graph_deadlines_count")}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Linked pages / Norms from citations */}
            {caseData.facts && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cases.detail_graph_cited_norms")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const citations = parseCitations(caseData.facts)
                      .filter((s) => s.isCitation)
                      .map((s) => s.text);
                    if (citations.length === 0)
                      return (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          {t("cases.detail_graph_no_norms")}
                        </p>
                      );
                    return citations.map((c, i) => (
                      <Link
                        key={i}
                        href={`/dashboard/norms?citation=${encodeURIComponent(c)}`}
                        className="brand-soft brand-text brand-border hover:brand-soft rounded-lg border px-2.5 py-1 text-xs transition-colors"
                      >
                        {c}
                      </Link>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "evidence" && (
          <div className="max-w-3xl space-y-4">
            {/* Add/Edit Form */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {editingEvidenceIndex !== null
                  ? t("cases.detail_ev_edit")
                  : t("cases.detail_ev_add")}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_ev_title")}
                  </label>
                  <input
                    {...evidenceForm.register("title")}
                    placeholder={t("cases.detail_ev_title_ph")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  {evidenceForm.formState.errors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {evidenceForm.formState.errors.title.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_ev_type")}
                  </label>
                  <select
                    {...evidenceForm.register("type")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">{t("cases.detail_ev_type_ph")}</option>
                    <option value="Dokument">{t("cases.detail_ev_type_document")}</option>
                    <option value="Zeugnis">{t("cases.detail_ev_type_testimony")}</option>
                    <option value="Sachverständigengutachten">
                      {t("cases.detail_ev_type_expert")}
                    </option>
                    <option value="Vertrag">{t("cases.detail_ev_type_contract")}</option>
                    <option value="Fotos/Videos">{t("cases.detail_ev_type_media")}</option>
                    <option value="E-Mail/Schriftverkehr">{t("cases.detail_ev_type_email")}</option>
                    <option value="Sonstiges">{t("cases.detail_ev_type_other")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_description")}
                </label>
                <textarea
                  {...evidenceForm.register("description")}
                  rows={2}
                  placeholder={t("cases.detail_ev_description_ph")}
                  className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_ev_source")}
                  </label>
                  <input
                    {...evidenceForm.register("source")}
                    placeholder={t("cases.detail_ev_source_ph")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_ev_weight")} (
                    {Math.round((evidenceForm.watch("weight") ?? 0.5) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    {...evidenceForm.register("weight", { valueAsNumber: true })}
                    className="w-full accent-[var(--brand-primary)]"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={evidenceForm.handleSubmit(onEvidenceSubmit)}
                >
                  <Plus size={14} />
                  {editingEvidenceIndex !== null
                    ? t("cases.detail_ev_save")
                    : t("cases.detail_ev_add_btn")}
                </Button>
                {editingEvidenceIndex !== null && (
                  <Button
                    variant="ghost"
                    className="text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    onClick={() => {
                      setEditingEvidenceIndex(null);
                      evidenceForm.reset({
                        title: "",
                        type: "",
                        description: "",
                        source: "",
                        weight: 0.5,
                      });
                    }}
                  >
                    {t("cases.detail_ev_cancel")}
                  </Button>
                )}
              </div>
            </div>

            {/* Evidence List */}
            {evidenceList.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <ShieldAlert size={40} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_empty")}
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_ev_empty_hint")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {evidenceList.map((ev, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {ev.type && (
                          <Badge
                            variant="default"
                            className="brand-soft brand-border/10 brand-text text-xs"
                          >
                            {ev.type}
                          </Badge>
                        )}
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {ev.title || t("cases.detail_ev_default_title")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingEvidenceIndex(i);
                            evidenceForm.reset(ev as EvidenceFormData);
                          }}
                          className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                        >
                          {t("cases.detail_ev_edit_btn")}
                        </button>
                        <button
                          onClick={() => {
                            const updated = evidenceList.filter((_, idx) => idx !== i);
                            setEvidenceList(updated);
                            saveCaseUpdate({ evidence: updated });
                          }}
                          className="px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {ev.description && (
                      <p className="mb-2 text-sm text-[color:var(--ds-text-muted)]">
                        {ev.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      {ev.source && (
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {t("cases.detail_ev_source_label")} {ev.source}
                        </span>
                      )}
                      <div className="flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                              (ev.weight || 0) >= 0.7
                                ? "bg-emerald-500"
                                : (ev.weight || 0) >= 0.4
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            )}
                            style={{ width: `${Math.round((ev.weight || 0) * 100)}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-right text-xs text-[color:var(--ds-text-muted)]">
                          {t("cases.detail_ev_weight_label")} {Math.round((ev.weight || 0) * 100)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
                      <CommentThread
                        parentSlug={`${slug}/evidence/${i}`}
                        parentType="evidence"
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "time" && (
          <div className="max-w-3xl space-y-4">
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_time_title")}
              </h3>

              {/* Live Timer */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "font-mono text-2xl font-bold tracking-tight",
                    timerRunning ? "text-emerald-600" : "text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                  {String(elapsedSeconds % 60).padStart(2, "0")}
                </div>
                {!timerRunning ? (
                  <button
                    onClick={() => {
                      setTimerRunning(true);
                      setTimerStartAt(Date.now());
                      setElapsedSeconds(0);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-emerald-600/25"
                  >
                    <Play size={14} /> {t("cases.detail_time_start")}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const durationMs = Date.now() - (timerStartAt ?? Date.now());
                      const minutes = Math.max(1, Math.round(durationMs / 60000));
                      setTimerRunning(false);
                      setTimerStartAt(null);
                      setElapsedSeconds(0);
                      timeForm.setValue("minutes", String(minutes));
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-600/15 px-3 py-1.5 text-xs font-medium text-red-600 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-600/25"
                  >
                    <Square size={14} /> {t("cases.detail_time_stop")}
                  </button>
                )}
                {elapsedSeconds > 0 && !timerRunning && (
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    → {timeForm.watch("minutes")} {t("cases.detail_time_taken")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_110px_110px]">
                <input
                  {...timeForm.register("description")}
                  placeholder={t("cases.detail_time_activity_ph")}
                  aria-label={t("cases.activity")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...timeForm.register("minutes")}
                  type="number"
                  placeholder={t("cases.detail_time_min_ph")}
                  aria-label={t("cases.minutes")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...timeForm.register("rate")}
                  type="number"
                  placeholder={t("cases.detail_time_rate_ph")}
                  aria-label={t("cases.hourly_rate")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[150px_1fr_auto_auto]">
                <select
                  {...timeForm.register("activity_type")}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="Beratung">{t("cases.detail_time_act_consultation")}</option>
                  <option value="Telefonat">{t("cases.detail_time_act_phone")}</option>
                  <option value="E-Mail">{t("cases.detail_time_act_email")}</option>
                  <option value="Schriftsatz">{t("cases.detail_time_act_filing")}</option>
                  <option value="Gerichtstermin">{t("cases.detail_time_act_court")}</option>
                  <option value="Recherche">{t("cases.detail_time_act_research")}</option>
                  <option value="Aktenstudium">{t("cases.detail_time_act_study")}</option>
                </select>
                <input
                  {...timeForm.register("lawyer")}
                  placeholder={t("cases.detail_time_lawyer_ph")}
                  aria-label={t("cases.assignee")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    {...timeForm.register("billable")}
                    className="accent-[var(--brand-primary)]"
                  />
                  {t("cases.detail_time_billable")}
                </label>
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={timeForm.handleSubmit(onTimeSubmit)}
                >
                  <Plus size={14} />
                  {t("cases.detail_time_book")}
                </Button>
              </div>
            </div>

            {timeEntries.length > 0 && (
              <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("cases.detail_time_bookings")}
                  </h3>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {`${t("cases.detail_time_total")} ${Math.floor(timeEntries.reduce((s, e) => s + e.minutes, 0) / 60)}h ${timeEntries.reduce((s, e) => s + e.minutes, 0) % 60}min`}
                  </span>
                </div>
                {timeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-[color:var(--ds-border)] py-2 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-[color:var(--ds-text)]">
                            {entry.description}
                          </span>
                          {entry.activity_type && (
                            <Badge
                              variant="default"
                              className="brand-border brand-soft brand-text border text-xs"
                            >
                              {entry.activity_type}
                            </Badge>
                          )}
                          {entry.billed && (
                            <Badge variant="success" className="text-xs">
                              {t("cases.detail_time_billed")}
                            </Badge>
                          )}
                          {entry.billable === false && (
                            <Badge variant="warning" className="text-xs">
                              {t("cases.detail_time_internal")}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {new Date(entry.date).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                          {entry.lawyer ? ` · ${entry.lawyer}` : ""}
                          {entry.rate ? ` · ${entry.rate.toFixed(2)} €/h` : ""}
                          {entry.invoice_number ? ` · ${entry.invoice_number}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-sm text-[color:var(--ds-text-muted)]">
                          {entry.minutes} min
                        </span>
                        {!entry.billed && (
                          <button
                            onClick={() => {
                              const updated = timeEntries.filter((e) => e.id !== entry.id);
                              setTimeEntries(updated);
                              saveCaseUpdate({ timeEntries: updated });
                            }}
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
                            title={t("cases.detail_time_delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <CommentThread
                        parentSlug={`${slug}/time/${entry.id}`}
                        parentType="time_entry"
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "expenses" && (
          <div className="max-w-3xl space-y-4">
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_exp_title")}
              </h3>
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_130px_auto_auto]">
                <input
                  {...expenseForm.register("description")}
                  placeholder={t("cases.detail_exp_desc_ph")}
                  aria-label={t("cases.expense")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...expenseForm.register("amount")}
                  type="number"
                  step="0.01"
                  placeholder={t("cases.detail_exp_amount_ph")}
                  aria-label={t("cases.amount")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    {...expenseForm.register("billable")}
                    className="accent-[var(--brand-primary)]"
                  />
                  {t("cases.detail_exp_billable")}
                </label>
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={expenseForm.handleSubmit(onExpenseSubmit)}
                >
                  <Plus size={14} />
                  {t("cases.detail_exp_add")}
                </Button>
              </div>
            </div>

            {expensesList.length > 0 && (
              <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("cases.detail_exp_list")}
                  </h3>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_exp_total")}{" "}
                    {expensesList.reduce((s, e) => s + e.amount, 0).toFixed(2)} €
                  </span>
                </div>
                {expensesList.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-[color:var(--ds-border)] py-2 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-[color:var(--ds-text)]">
                            {entry.description}
                          </span>
                          {entry.billed && (
                            <Badge variant="success" className="text-xs">
                              {t("cases.detail_exp_billed")}
                            </Badge>
                          )}
                          {entry.billable === false && (
                            <Badge variant="warning" className="text-xs">
                              {t("cases.detail_exp_internal")}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {new Date(entry.date).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                          {entry.invoice_number ? ` · ${entry.invoice_number}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-sm text-[color:var(--ds-text-muted)]">
                          {entry.amount.toFixed(2)} €
                        </span>
                        {!entry.billed && (
                          <button
                            onClick={() => {
                              const updated = expensesList.filter((e) => e.id !== entry.id);
                              setExpensesList(updated);
                              saveCaseUpdate({ expenses: updated });
                            }}
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-600"
                            title={t("cases.detail_exp_delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <CommentThread
                        parentSlug={`${slug}/expense/${entry.id}`}
                        parentType="expense"
                        currentUserId={currentUserId}
                        currentUserName={currentUserName}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="max-w-3xl space-y-4">
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("cases.detail_audit_title")}
              </h3>
              {caseData.auditLog && caseData.auditLog.length > 0 ? (
                <div className="space-y-2">
                  {caseData.auditLog
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
                      >
                        <div className="brand-bg mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-[color:var(--ds-text)]">
                              {entry.note}
                            </span>
                            <Badge
                              variant="default"
                              className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                            >
                              {entry.field}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                            {entry.actor} ·{" "}
                            {new Date(entry.at).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_audit_empty")}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "superbrain" && (
          <div className="max-w-3xl space-y-4">
            <MatterContextPanel caseSlug={caseData.slug} defaultOpen={true} />
            <div className="h-[500px]">
              <ChatPanel
                context={{ type: "case", caseSlug: caseData.slug }}
                features={{
                  caseSelector: false,
                  jurisdictionSelector: true,
                  modelSelector: true,
                  modeSelector: true,
                  fileUpload: true,
                  sessionHistory: true,
                  tokenWidget: true,
                  brainStatus: true,
                  exampleQueries: true,
                  exportChat: true,
                  messageActions: true,
                }}
                className="h-full"
                title={`${t("cases.detail_chat_title")}: ${caseData.title}`}
              />
            </div>
          </div>
        )}

        {activeTab === "query" && (
          <div className="max-w-3xl space-y-4">
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
                {t("cases.detail_query_desc")}
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare
                    size={14}
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                    placeholder={t("cases.detail_query_ph")}
                    aria-label={t("cases.ask_case")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <Button
                  onClick={handleQuery}
                  disabled={queryLoading || !query.trim()}
                  className="brand-bg brand-bg gap-2 text-white"
                >
                  {queryLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {t("cases.detail_query_send")}
                </Button>
              </div>
            </div>

            {queryResult && (
              <div className="brand-border brand-soft space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="brand-text text-xs font-medium">
                    {t("cases.detail_query_ai_answer")}
                  </span>
                  <button
                    onClick={() => copyToClipboard(queryResult)}
                    className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                  {queryResult}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
