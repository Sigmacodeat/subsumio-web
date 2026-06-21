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
import type { BrainPage } from "@/lib/types";
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
  { label: string; icon: React.ElementType; color: StatusColor }
> = {
  open: { label: "Offen", icon: Clock, color: "blue" },
  pending: { label: "Anhängig", icon: PauseCircle, color: "amber" },
  settled: { label: "Erledigt", icon: CheckCircle2, color: "emerald" },
  won: { label: "Gewonnen", icon: CheckCircle2, color: "emerald" },
  lost: { label: "Verloren", icon: XCircle, color: "red" },
  appealed: { label: "Berufung", icon: AlertTriangle, color: "orange" },
  dormant: { label: "Ruhend", icon: PauseCircle, color: "gray" },
};

const TABS = [
  { key: "overview", label: "Übersicht", icon: FileText },
  { key: "timeline", label: "Timeline", icon: CalendarClock },
  { key: "documents", label: "Dokumente", icon: FileText },
  { key: "deadlines", label: "Fristen", icon: CalendarClock },
  { key: "tasks", label: "Aufgaben", icon: ListChecks },
  { key: "evidence", label: "Beweismittel", icon: ShieldAlert },
  { key: "time", label: "Zeit", icon: Timer },
  { key: "expenses", label: "Auslagen", icon: Receipt },
  { key: "graph", label: "Graph", icon: Network },
  { key: "superbrain", label: "Superbrain", icon: Sparkles },
  { key: "audit", label: "Audit", icon: ShieldCheck },
  { key: "query", label: "Query", icon: MessageSquare },
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
  const { t } = useLang();
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
          setConflictWarning(
            `Diese Akte wurde gerade von einem anderen Nutzer bearbeitet (Version ${remoteVersion}). Bitte aktualisieren.`
          );
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
      setSaveError(
        "Die Akte wurde zwischenzeitlich von einem anderen Nutzer bearbeitet. Bitte lade die Seite neu, bevor du weitere Änderungen speicherst."
      );
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
          ? "Aufgaben bearbeitet"
          : changedFields.includes("timeEntries")
            ? "Zeiterfassung bearbeitet"
            : changedFields.includes("expenses")
              ? "Auslagen bearbeitet"
              : changedFields.includes("deadlines")
                ? "Fristen bearbeitet"
                : changedFields.includes("evidence")
                  ? "Beweismittel bearbeitet"
                  : changedFields.includes("documents")
                    ? "Dokumente bearbeitet"
                    : changedFields.includes("status")
                      ? "Status geändert"
                      : "Akte bearbeitet",
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
        await api.brain.updatePage({
          slug: caseData.slug,
          title: caseData.title,
          content: caseData.facts,
          frontmatter,
        });
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
      setQueryResult("Fehler bei der Abfrage. Bitte versuche es erneut.");
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
        <p className="text-[color:var(--ds-text-muted)]">Akte nicht gefunden</p>
        <Link href="/dashboard/cases">
          <Button variant="primary" className="brand-bg brand-bg gap-2 text-white">
            <ArrowLeft size={16} />
            Zurück zu den Akten
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
              Jetzt aktualisieren
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
          <span className="text-xs text-[color:var(--ds-text-muted)]">Akten</span>
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
              {statusCfg.label}
            </Badge>
            {caseData.estimatedValue && (
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Streitwert: {caseData.estimatedValue.min.toLocaleString()}–
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
              Mandant:{" "}
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
              Gegner:{" "}
              <span className="text-[color:var(--ds-text-muted)]">{caseData.opponentName}</span>
            </span>
          )}
          {caseData.courtName && (
            <span className="flex items-center gap-1">
              <Briefcase size={10} />
              Gericht:{" "}
              <span className="text-[color:var(--ds-text-muted)]">{caseData.courtName}</span>
            </span>
          )}
          {caseData.ownLawyerName && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              Anwalt:{" "}
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
                  "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all",
                  activeTab === tab.key
                    ? "brand-text border-[color:var(--brand-primary)]"
                    : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={14} />
                {tab.label}
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
                  setQuery("Welche Strategie empfiehlst du für diese Akte?");
                }}
              >
                <Lightbulb size={14} />
                Strategie generieren
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowStatusDialog(true)}
              >
                <ChevronRight size={14} />
                Status ändern
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => {
                  setActiveTab("query");
                  setQuery("Bewerte die Erfolgsaussichten dieser Akte.");
                }}
              >
                <Scale size={14} />
                Chancen bewerten
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
                    {caseData.portalEnabled ? "Portal freigegeben" : "Für Portal freigeben"}
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
                            setSaveError("Portal-Link konnte nicht generiert werden.");
                          }
                        } catch (err) {
                          console.error(
                            "[portal] generate failed:",
                            err instanceof Error ? err.message : String(err)
                          );
                          setSaveError("Portal-Link konnte nicht generiert werden.");
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
                        ? "Wird erstellt…"
                        : copied
                          ? "Link kopiert!"
                          : "Portal-Link"}
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
                    Aktenstatus ändern
                  </h3>
                  <button
                    onClick={() => {
                      setShowStatusDialog(false);
                      setStatusError(null);
                      setPendingStatus(null);
                    }}
                    className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  >
                    Abbrechen
                  </button>
                </div>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Aktueller Status:{" "}
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
                            setStatusError(result.reason || "Übergang nicht erlaubt");
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                          pendingStatus === target
                            ? "brand-bg border-transparent text-white"
                            : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)]"
                        )}
                      >
                        <Icon size={12} />
                        {cfg?.label ?? STATUS_LABELS_DE[target] ?? target}
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
                      Bestätigen
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Portal link display */}
            {portalUrl && (userRole === "admin" || userRole === "lawyer") && (
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="mb-1 text-xs font-medium text-emerald-600">
                  Portal-Link (30 Tage gültig)
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
                    {copied ? "Kopiert" : "Kopieren"}
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
                          setSaveError("Portal-Link konnte nicht widerrufen werden.");
                        }
                      } catch {
                        setSaveError("Portal-Link konnte nicht widerrufen werden.");
                      }
                    }}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    Widerrufen
                  </button>
                </div>
              </div>
            )}

            {/* Stammdaten — Kontakte verknüpfen */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Stammdaten</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Client */}
                <div className="space-y-1">
                  <label className="text-xs text-[color:var(--ds-text-muted)]">Mandant</label>
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
                    <option value="">— Auswählen —</option>
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
                  <label className="text-xs text-[color:var(--ds-text-muted)]">Gegner</label>
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
                    <option value="">— Auswählen —</option>
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
                  <label className="text-xs text-[color:var(--ds-text-muted)]">Gericht</label>
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
                    <option value="">— Auswählen —</option>
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
                  Kontakte werden geladen…
                </p>
              )}
              {contacts.length === 0 && !contactsLoading && (
                <p className="text-xs text-amber-600">
                  Noch keine Kontakte angelegt.{" "}
                  <Link href="/dashboard/contacts" className="brand-text hover:underline">
                    Kontakt anlegen →
                  </Link>
                </p>
              )}
            </div>

            {/* Facts */}
            {caseData.facts && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  Sachverhalt
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
                  Ansprüche / Klageanträge
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
                  Verteidigung / Einwände
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
                <h3 className="brand-text mb-2 text-sm font-semibold">Empfohlene Strategie</h3>
                <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
                  {caseData.strategy.recommended}
                </p>
                {caseData.strategy.risks && caseData.strategy.risks.length > 0 && (
                  <div className="mt-3">
                    <h4 className="mb-1 text-xs font-semibold text-red-600">Risiken</h4>
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
                  setQuery(
                    "Erstelle eine Timeline für diese Akte mit allen wichtigen Ereignissen."
                  );
                }}
              >
                <CalendarClock size={14} />
                Timeline generieren
              </Button>
            </div>
            <div className="relative space-y-4 pl-6">
              <div className="absolute top-0 bottom-0 left-2 w-px bg-[color:var(--ds-border)]" />
              {/* Creation */}
              <div className="relative">
                <div className="brand-soft absolute -left-4 h-2 w-2 rounded-full" />
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(caseData.createdAt).toLocaleDateString("de-DE")}
                  </div>
                  <div className="text-sm text-[color:var(--ds-text)]">Akte erstellt</div>
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
                      {ev.date ? new Date(ev.date).toLocaleDateString("de-DE") : "—"}
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
                      {new Date(caseData.updatedAt).toLocaleDateString("de-DE")}
                    </div>
                    <div className="text-sm text-[color:var(--ds-text)]">
                      Status geändert: {STATUS_CONFIG[caseData.status]?.label || caseData.status}
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
                      ).toLocaleDateString("de-DE")}
                    </div>
                    <div className="text-sm text-[color:var(--ds-text)]">Strategie generiert</div>
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
                      setUploadError("Offline — Datei-Upload erfordert Internetverbindung.");
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
                      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
                    }
                  }}
                />
                <span className="brand-bg brand-bg inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors">
                  <Plus size={14} /> Dokument hochladen
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
                <p className="text-[color:var(--ds-text-muted)]">
                  Noch keine Dokumente zugeordnet.
                </p>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Nutze den Upload-Button um Verträge, Gutachten oder Schriftsätze anzuhängen.
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
                        {new Date(doc.uploadedAt).toLocaleDateString("de-DE")}
                        {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
                        {doc.kind ? ` · ${doc.kind}` : ""}
                      </div>
                    </div>
                    {(doc.slug || doc.url) && (
                      <Link
                        href={`/dashboard/brain/${encodeURIComponent(doc.slug || doc.url || "")}`}
                        className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                      >
                        Öffnen
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
                {editingDeadlineIndex !== null ? "Frist bearbeiten" : "Frist / Termin hinzufügen"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    Titel
                  </label>
                  <input
                    {...deadlineForm.register("title")}
                    placeholder="z.B. Klageerwiderung"
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
                    Fälligkeitsdatum
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
                    Typ
                  </label>
                  <select
                    {...deadlineForm.register("type")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="deadline">Frist</option>
                    <option value="hearing">Verhandlung</option>
                    <option value="meeting">Besprechung</option>
                    <option value="filing">Schriftstück</option>
                    <option value="reminder">Erinnerung</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    Status
                  </label>
                  <select
                    {...deadlineForm.register("status")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="pending">Ausstehend</option>
                    <option value="warning">Bald fällig</option>
                    <option value="critical">Kritisch</option>
                    <option value="overdue">Überfällig</option>
                    <option value="done">Erledigt</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  Beschreibung
                </label>
                <textarea
                  {...deadlineForm.register("description")}
                  rows={2}
                  placeholder="Beschreibung…"
                  className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="brand-border brand-soft/5 space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-text text-xs font-medium">Frist aus Regel berechnen</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Erzeugt eine prüfbare Frist mit Rechtsgrundlage und Audit-Eintrag.
                    </p>
                  </div>
                  <Badge variant="default" className="brand-soft brand-border brand-text text-xs">
                    Review erforderlich
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
                    Berechnen
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
                  {editingDeadlineIndex !== null ? "Speichern" : "Hinzufügen"}
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
                    Abbrechen
                  </Button>
                )}
              </div>
            </div>

            {/* AI Deadline Detection */}
            <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">KI-Fristen-Erkennung</span>
                </div>
                <Badge
                  variant="default"
                  className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                >
                  Beta
                </Badge>
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Fügen Sie E-Mail-Text oder ein Schriftstück ein — die KI erkennt automatisch Fristen
                und Termine.
              </p>
              <textarea
                value={aiDetectText}
                onChange={(e) => setAiDetectText(e.target.value)}
                rows={3}
                placeholder="Z. B.: 'Binnen 4 Wochen ab Zustellung des Urteils vom 15.06.2026 können Berufung eingelegt werden…'"
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
                  {aiDetecting ? "Analysiere…" : "Fristen erkennen"}
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
                    Zurücksetzen
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
                          <Plus size={12} /> Hinzufügen
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
                  Noch keine Fristen für diese Akte.
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Fügen Sie oben Fristen und Termine hinzu.
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
                      label: "Ausstehend",
                      color: "text-blue-600",
                      border: "border-blue-500/20 bg-blue-500/5",
                    },
                    warning: {
                      label: "Bald fällig",
                      color: "text-amber-600",
                      border: "border-amber-500/20 bg-amber-500/5",
                    },
                    critical: {
                      label: "Kritisch",
                      color: "text-red-600",
                      border: "border-red-500/20 bg-red-500/5",
                    },
                    overdue: {
                      label: "Überfällig",
                      color: "text-rose-600",
                      border: "border-rose-500/20 bg-rose-500/5",
                    },
                    done: {
                      label: "Erledigt",
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
                              ? "Freigegeben"
                              : dl.review_status === "rejected"
                                ? "Abgelehnt"
                                : dl.review_status === "reviewed"
                                  ? "Geprüft"
                                  : "Ungeprüft"}
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
                                        reviewed_by: caseData.ownLawyerName || "Kanzlei",
                                      },
                                      "reviewed",
                                      item.review_status === "approved"
                                        ? "Freigabe zurückgenommen"
                                        : "Frist freigegeben"
                                    )
                                  : item
                              );
                              setDeadlinesList(updated);
                              saveCaseUpdate({ deadlines: updated });
                            }}
                            className="px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-emerald-600"
                          >
                            {dl.review_status === "approved" ? "Prüfung offen" : "Freigeben"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingDeadlineIndex(i);
                              deadlineForm.reset(dl as DeadlineFormData);
                            }}
                            className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                          >
                            Bearbeiten
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
                          {dlDate.toLocaleDateString("de-DE", {
                            weekday: "short",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {!isOverdue && status !== "done" && (
                          <span className={cfg.color}>({daysUntil} Tage)</span>
                        )}
                        {isOverdue && (
                          <span className="text-rose-600">
                            ({Math.abs(daysUntil)} Tage überfällig)
                          </span>
                        )}
                        {dl.type && (
                          <Badge
                            variant="default"
                            className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                          >
                            {dl.type === "deadline"
                              ? "Frist"
                              : dl.type === "hearing"
                                ? "Verhandlung"
                                : dl.type === "meeting"
                                  ? "Besprechung"
                                  : dl.type === "filing"
                                    ? "Schriftstück"
                                    : "Erinnerung"}
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
                          Berechnung: {dl.calculation_note}
                        </p>
                      )}
                      {dl.reviewed_at && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                          Geprüft von {dl.reviewed_by || "Kanzlei"} am{" "}
                          {new Date(dl.reviewed_at).toLocaleString("de-DE")}
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
                  placeholder="Neue Aufgabe…"
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
                Hinzufügen
              </Button>
            </div>

            {tasks.length === 0 ? (
              <div className="space-y-2 py-10 text-center">
                <ListChecks size={32} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Noch keine Aufgaben für diese Akte.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
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
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all",
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Mandant</div>
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Gegner</div>
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Gericht</div>
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Anwalt</div>
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Ansprüche</div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.claims.length} Klageanträge
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Beweismittel</div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {evidenceList.length} Mittel
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Dokumente</div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {caseData.documents.length} Dateien
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
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Fristen</div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {deadlinesList.length} Termine
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Linked pages / Norms from citations */}
            {caseData.facts && (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
                  Zitierte Normen
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const citations = parseCitations(caseData.facts)
                      .filter((s) => s.isCitation)
                      .map((s) => s.text);
                    if (citations.length === 0)
                      return (
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Keine Normen im Sachverhalt zitiert.
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
                  ? "Beweismittel bearbeiten"
                  : "Beweismittel hinzufügen"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    Titel
                  </label>
                  <input
                    {...evidenceForm.register("title")}
                    placeholder="z.B. Vertrag vom 01.03.2026"
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
                    Typ
                  </label>
                  <select
                    {...evidenceForm.register("type")}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">Typ wählen…</option>
                    <option value="Dokument">Dokument</option>
                    <option value="Zeugnis">Zeugnis</option>
                    <option value="Sachverständigengutachten">Sachverständigengutachten</option>
                    <option value="Vertrag">Vertrag</option>
                    <option value="Fotos/Videos">Fotos/Videos</option>
                    <option value="E-Mail/Schriftverkehr">E-Mail/Schriftverkehr</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  Beschreibung
                </label>
                <textarea
                  {...evidenceForm.register("description")}
                  rows={2}
                  placeholder="Beschreibung des Beweismittels…"
                  className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    Quelle
                  </label>
                  <input
                    {...evidenceForm.register("source")}
                    placeholder="z.B. Akte 2026-001"
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                    Beweisstärke ({Math.round((evidenceForm.watch("weight") ?? 0.5) * 100)}%)
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
                  {editingEvidenceIndex !== null ? "Speichern" : "Hinzufügen"}
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
                    Abbrechen
                  </Button>
                )}
              </div>
            </div>

            {/* Evidence List */}
            {evidenceList.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <ShieldAlert size={40} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Noch keine Beweismittel erfasst.
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Fügen Sie oben Beweismittel hinzu, um die Beweislage zu dokumentieren.
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
                          {ev.title || "Beweismittel"}
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
                          Bearbeiten
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
                          Quelle: {ev.source}
                        </span>
                      )}
                      <div className="flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
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
                          Beweisstärke: {Math.round((ev.weight || 0) * 100)}%
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
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Zeiterfassung</h3>

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
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-all hover:bg-emerald-600/25"
                  >
                    <Play size={14} /> Start
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
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-600/15 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:bg-red-600/25"
                  >
                    <Square size={14} /> Stop
                  </button>
                )}
                {elapsedSeconds > 0 && !timerRunning && (
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    → {timeForm.watch("minutes")} Min. übernommen
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_110px_110px]">
                <input
                  {...timeForm.register("description")}
                  placeholder="Tätigkeit…"
                  aria-label={t("cases.activity")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...timeForm.register("minutes")}
                  type="number"
                  placeholder="Min."
                  aria-label={t("cases.minutes")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...timeForm.register("rate")}
                  type="number"
                  placeholder="€/h"
                  aria-label={t("cases.hourly_rate")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[150px_1fr_auto_auto]">
                <select
                  {...timeForm.register("activity_type")}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option>Beratung</option>
                  <option>Telefonat</option>
                  <option>E-Mail</option>
                  <option>Schriftsatz</option>
                  <option>Gerichtstermin</option>
                  <option>Recherche</option>
                  <option>Aktenstudium</option>
                </select>
                <input
                  {...timeForm.register("lawyer")}
                  placeholder="Bearbeiter / Anwalt"
                  aria-label={t("cases.assignee")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    {...timeForm.register("billable")}
                    className="accent-[var(--brand-primary)]"
                  />
                  abrechenbar
                </label>
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={timeForm.handleSubmit(onTimeSubmit)}
                >
                  <Plus size={14} />
                  Buchen
                </Button>
              </div>
            </div>

            {timeEntries.length > 0 && (
              <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Buchungen</h3>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    Gesamt: {Math.floor(timeEntries.reduce((s, e) => s + e.minutes, 0) / 60)}h{" "}
                    {timeEntries.reduce((s, e) => s + e.minutes, 0) % 60}min
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
                              abgerechnet
                            </Badge>
                          )}
                          {entry.billable === false && (
                            <Badge variant="warning" className="text-xs">
                              intern
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {new Date(entry.date).toLocaleDateString("de-DE")}
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
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all hover:bg-red-500/10 hover:text-red-600"
                            title="Buchung löschen"
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
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Auslagen</h3>
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_130px_auto_auto]">
                <input
                  {...expenseForm.register("description")}
                  placeholder="z. B. Gerichtskosten, Porto, Fahrtkosten"
                  aria-label={t("cases.expense")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <input
                  {...expenseForm.register("amount")}
                  type="number"
                  step="0.01"
                  placeholder="Betrag €"
                  aria-label={t("cases.amount")}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    {...expenseForm.register("billable")}
                    className="accent-[var(--brand-primary)]"
                  />
                  abrechenbar
                </label>
                <Button
                  variant="primary"
                  className="brand-bg brand-bg gap-2 text-sm text-white"
                  onClick={expenseForm.handleSubmit(onExpenseSubmit)}
                >
                  <Plus size={14} />
                  Erfassen
                </Button>
              </div>
            </div>

            {expensesList.length > 0 && (
              <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    Auslagenliste
                  </h3>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    Gesamt: {expensesList.reduce((s, e) => s + e.amount, 0).toFixed(2)} €
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
                              abgerechnet
                            </Badge>
                          )}
                          {entry.billable === false && (
                            <Badge variant="warning" className="text-xs">
                              intern
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          {new Date(entry.date).toLocaleDateString("de-DE")}
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
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all hover:bg-red-500/10 hover:text-red-600"
                            title="Auslage löschen"
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
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Audit-Trail</h3>
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
                            {entry.actor} · {new Date(entry.at).toLocaleString("de-DE")}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
                  Noch keine Audit-Einträge vorhanden.
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
                title={`Akten-Chat: ${caseData.title}`}
              />
            </div>
          </div>
        )}

        {activeTab === "query" && (
          <div className="max-w-3xl space-y-4">
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
                Stelle eine Frage im Kontext dieser Akte. Das Brain durchsucht alle zugehörigen
                Dokumente und Gesetze.
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
                    placeholder="Frage zur Akte…"
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
                  Senden
                </Button>
              </div>
            </div>

            {queryResult && (
              <div className="brand-border brand-soft space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="brand-text text-xs font-medium">KI-Antwort</span>
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
