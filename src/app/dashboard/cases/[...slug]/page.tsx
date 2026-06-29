"use client";

import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useLang } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { recordMatterVisit } from "@/lib/use-recent-matters";
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
  Receipt,
  Plus,
  Trash2,
  Download,
  FolderOpen,
  Landmark,
  User,
  Play,
  Square,
  PenTool,
  Sparkles,
  X,
  Archive,
  RotateCcw,
  CloudUpload,
  Activity,
  RefreshCw,
  Lock,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { maxUploadSizeFor } from "@/lib/upload-validation";
import {
  isSupportedUploadName,
  UPLOAD_ACCEPT_ATTRIBUTE,
  UPLOAD_FOLDER_ACCEPT_RE,
} from "@/lib/upload-formats";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { isOnline, enqueueMutation, enqueueFileUpload, getCache } from "@/lib/offline-store";
import { useMutationQueue } from "@/lib/use-mutation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRealtime } from "@/lib/realtime";
import { usePresence } from "@/lib/use-presence";
import type { BrainPage, SearchResult } from "@/lib/types";
import type { DashboardKey } from "@/content/dashboard";
import { CitationLink, parseCitations } from "@/components/legal/CitationLink";
import CommentThread from "@/components/legal/CommentThread";
import { RetrievalFeedbackButtons } from "@/components/legal/RetrievalFeedbackButtons";
import {
  ContactCreateDialog,
  type ContactCreateResult,
} from "@/components/legal/ContactCreateDialog";
import { CaseOverviewWidgets } from "@/components/legal/CaseOverviewWidgets";
import { PipelinePanel } from "@/components/legal/PipelinePanel";
import { EmailComposeDialog } from "@/components/legal/EmailComposeDialog";
import { DocuSignSendDialog } from "@/components/legal/DocuSignSendDialog";
import {
  checkInternalConflict,
  type ContactRef,
  type ConflictCheckResult,
} from "@/lib/contact-conflict";
import { cn } from "@/lib/utils";
import {
  uploadFiles as presignedUploadFiles,
  type UploadProgress as PresignedProgress,
} from "@/lib/presigned-upload";
const ChatPanel = lazy(() =>
  import("@/components/chat/chat-panel").then((m) => ({ default: m.ChatPanel }))
);
const MatterContextPanel = lazy(() =>
  import("@/components/legal/MatterContextPanel").then((m) => ({ default: m.MatterContextPanel }))
);
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
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

export interface CaseDetail {
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
  conflictStatus?: string;
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
  suggestedDeadlines?: SuggestedDeadline[];
  suggestedParties?: SuggestedParty[];
  contradictions?: ContradictionFinding[];
  portalEnabled: boolean;
  portalNote?: string;
  auditLog?: AuditLogEntry[];
  archivedAt?: string;
  archivedBy?: string;
  version: number;
}

interface SuggestedDeadline {
  title: string;
  due_date: string;
  urgency: string;
  source: string;
  source_quote: string;
  confirmed: boolean;
}

interface SuggestedParty {
  name: string;
  role: string;
  source: string;
  confirmed: boolean;
}

interface ContradictionFinding {
  doc_a_slug: string;
  doc_b_slug: string;
  field: string;
  value_a: string;
  value_b: string;
  severity: "high" | "medium" | "low";
  description: string;
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
  archived: { labelKey: "cases.status_archived", icon: Archive, color: "gray" },
};

const WORKSPACE_TABS_DE: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Übersicht", icon: FileText },
  { key: "documents", label: "Dokumente", icon: FolderOpen },
  { key: "deadlines_tasks", label: "Fristen", icon: CalendarClock },
  { key: "evidence", label: "Belege", icon: ShieldAlert },
  { key: "contradictions", label: "Widersprüche", icon: AlertTriangle },
  { key: "pipeline", label: "Pipeline", icon: Activity },
  { key: "strategy", label: "KI", icon: Sparkles },
  { key: "billing", label: "Abrechnung", icon: Receipt },
  { key: "activity", label: "Verlauf", icon: Activity },
];

const WORKSPACE_TABS_EN: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "deadlines_tasks", label: "Deadlines", icon: CalendarClock },
  { key: "evidence", label: "Evidence", icon: ShieldAlert },
  { key: "contradictions", label: "Contradictions", icon: AlertTriangle },
  { key: "pipeline", label: "Pipeline", icon: Activity },
  { key: "strategy", label: "AI", icon: Sparkles },
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "activity", label: "Activity", icon: Activity },
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
    conflictStatus:
      typeof fm.conflict_status === "string" ? (fm.conflict_status as string) : undefined,
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
    timelineEvents: [...(fm.timeline || []), ...(fm.timeline_events || [])],
    documents: fm.documents || [],
    deadlines: fm.deadlines || [],
    suggestedDeadlines: (fm.suggested_deadlines || []) as SuggestedDeadline[],
    suggestedParties: (fm.suggested_parties || []) as SuggestedParty[],
    contradictions: (Array.isArray(fm.contradictions)
      ? fm.contradictions
      : []) as ContradictionFinding[],
    portalEnabled: fm.portal_enabled || false,
    portalNote: fm.portal_note || undefined,
    auditLog: (fm.audit_log || []) as AuditLogEntry[],
    archivedAt: typeof fm.archived_at === "string" ? fm.archived_at : undefined,
    archivedBy: typeof fm.archived_by === "string" ? fm.archived_by : undefined,
    version: (fm.version as number) || 0,
  };
}

function normalizeDeadlineKey(deadline: DeadlineEntry) {
  return [deadline.id, deadline.title?.trim().toLowerCase(), deadline.due_date || deadline.date]
    .filter(Boolean)
    .join(":");
}

function standaloneDeadlineForCase(page: BrainPage, detail: CaseDetail): DeadlineEntry | null {
  const fm = page.frontmatter ?? {};
  const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : undefined;
  const caseTitle = typeof fm.case_title === "string" ? fm.case_title : undefined;
  const caseNumber = typeof fm.case_number === "string" ? fm.case_number : undefined;
  const linked =
    caseSlug === detail.slug ||
    caseTitle === detail.title ||
    (caseNumber && caseNumber === detail.caseNumber);
  if (!linked) return null;

  const dueDate =
    typeof fm.due_date === "string"
      ? fm.due_date
      : typeof fm.date === "string"
        ? fm.date
        : undefined;
  return {
    id: `page:${page.slug}`,
    title: typeof fm.title === "string" ? fm.title : page.title,
    description: typeof fm.description === "string" ? fm.description : undefined,
    date: dueDate,
    due_date: dueDate,
    status: typeof fm.status === "string" ? fm.status : undefined,
    type: typeof fm.deadline_type === "string" ? fm.deadline_type : (fm.type as string | undefined),
    source: typeof fm.source === "string" ? fm.source : "Fristenmodul",
    law: typeof fm.law === "string" ? fm.law : undefined,
    calculation_note: typeof fm.calculation_note === "string" ? fm.calculation_note : undefined,
    review_status:
      fm.review_status === "approved" ||
      fm.review_status === "reviewed" ||
      fm.review_status === "rejected" ||
      fm.review_status === "unreviewed"
        ? fm.review_status
        : "unreviewed",
    reviewed_by: typeof fm.reviewed_by === "string" ? fm.reviewed_by : undefined,
    reviewed_at: typeof fm.reviewed_at === "string" ? fm.reviewed_at : undefined,
    created_at: page.created_at,
    updated_at: page.updated_at,
  };
}

function mergeCaseDeadlines(detail: CaseDetail, deadlinePages: BrainPage[] = []) {
  const base =
    detail.deadlines.length > 0
      ? detail.deadlines
      : detail.timelineEvents.map((entry) => timelineToDeadline(entry, detail.slug));
  const linked = deadlinePages
    .map((page) => standaloneDeadlineForCase(page, detail))
    .filter((deadline): deadline is DeadlineEntry => Boolean(deadline));
  const merged = new Map<string, DeadlineEntry>();
  [...base, ...linked].forEach((deadline) => {
    merged.set(normalizeDeadlineKey(deadline), deadline);
  });
  return [...merged.values()];
}

export default function CaseDetailPage() {
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : (params.slug as string);
  useEffect(() => {
    if (slug) recordMatterVisit(slug);
  }, [slug]);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { pendingCount: offlinePendingCount, syncing: offlineSyncing } = useMutationQueue();
  const [activeTab, setActiveTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentPassword, setDocumentPassword] = useState("");
  const [uploadQueue, setUploadQueue] = useState<
    Array<{
      id: string;
      fileName: string;
      fileSize: number;
      uploadedBytes: number;
      progress: number;
      status: "queued" | "preparing" | "uploading" | "processing" | "done" | "error";
      startedAt?: number;
      speedBps?: number;
      etaSeconds?: number;
      error?: string;
    }>
  >([]);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState<SearchResult[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [probeFindings, setProbeFindings] = useState<
    Array<{
      chunk_a: string;
      chunk_b: string;
      severity: "high" | "medium" | "low" | "info";
      axis: string | null;
      explanation: string;
      slug: string;
    }>
  >([]);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeLastRun, setProbeLastRun] = useState<string | null>(null);
  const [probeAvailable, setProbeAvailable] = useState(false);
  const [generatingPortal, setGeneratingPortal] = useState(false);
  const [userRole, setUserRole] = useState<string>("lawyer");
  const [currentUserName, setCurrentUserName] = useState<string>("System");
  const [currentUserId, setCurrentUserId] = useState<string>("system");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showDocuSignDialog, setShowDocuSignDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<CaseStatus | null>(null);

  // IDE-style folder import (Chromium File System Access API), feature-detected.
  const [folderApi, setFolderApi] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  useEffect(() => {
    setFolderApi(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

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
  const [contacts, setContacts] = useState<
    { slug: string; name: string; role: string; email?: string; phone?: string }[]
  >([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // P2.1: Inline contact creation dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogRole, setContactDialogRole] = useState<
    "client" | "opponent" | "court" | "lawyer" | "other"
  >("client");
  const [contactDialogName, setContactDialogName] = useState<string | undefined>(undefined);
  // B4: Track which suggested party index is pending contact creation
  const [pendingSuggestedPartyIndex, setPendingSuggestedPartyIndex] = useState<number | null>(null);

  // P2.2: Interessenkollision re-check when client + opponent are assigned
  const [contactConflict, setContactConflict] = useState<ConflictCheckResult | null>(null);

  // Restore: loading state for unarchive operation
  const [restoring, setRestoring] = useState(false);

  // Evidence CRUD state
  const [evidenceList, setEvidenceList] = useState<EvidenceEntry[]>([]);
  const [editingEvidenceIndex, setEditingEvidenceIndex] = useState<number | null>(null);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);

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

  const [aiEvidenceCards, setAiEvidenceCards] = useState<
    Array<{
      docName: string;
      docSlug: string;
      documentType: string;
      keyFacts: string[];
      parties: Array<{ name: string; role: string }>;
      evidenceRefs: string[];
      citedStatutes: string[];
    }>
  >([]);
  const [aiEvidenceLoading, setAiEvidenceLoading] = useState(false);

  // P3: Strategy generation loading state
  const [strategyLoading, setStrategyLoading] = useState(false);

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
  // Beweismittel-Quelle: entweder ein bereits hochgeladenes Dokument dieser Akte
  // referenzieren, oder eine nicht-dokumentäre Quelle (Zeugenaussage, mündliche
  // Aussage, etc.) als Freitext erfassen. Verhindert Verwechslung mit der Akte selbst.
  const [evidenceSourceMode, setEvidenceSourceMode] = useState<"document" | "other">("other");
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

  function onDeadlineSubmit(data: DeadlineFormData) {
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
    void saveCaseUpdate({ deadlines: updated });
  }

  function onEvidenceSubmit(data: EvidenceFormData) {
    let updated: EvidenceEntry[];
    if (editingEvidenceIndex !== null) {
      updated = evidenceList.map((ev, i) => (i === editingEvidenceIndex ? data : ev));
      setEditingEvidenceIndex(null);
    } else {
      updated = [...evidenceList, data as EvidenceEntry];
    }
    setEvidenceList(updated);
    evidenceForm.reset({ title: "", type: "", description: "", source: "", weight: 0.5 });
    setShowEvidenceForm(false);
    void saveCaseUpdate({ evidence: updated });
  }

  function onTimeSubmit(data: TimeEntryFormData) {
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
      void saveCaseUpdate({ timeEntries: updated });
    }
  }

  function onExpenseSubmit(data: ExpenseFormData) {
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
      void saveCaseUpdate({ expenses: updated });
    }
  }

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
  const presenceUser = useMemo(
    () =>
      meQuery.data?.user
        ? { id: meQuery.data.user.id, email: meQuery.data.user.email || "" }
        : null,
    [meQuery.data?.user]
  );
  const activeUsers = usePresence(slug, presenceUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const [page, batch] = await Promise.all([
          api.brain.getPage(slug),
          api.brain
            .batchListPages(["legal_contact", "legal_deadline"], 300)
            .catch(() => ({}) as Record<string, BrainPage[]>),
        ]);
        const allContacts = batch["legal_contact"] ?? [];
        const allDeadlinePages = batch["legal_deadline"] ?? [];
        if (!cancelled) {
          const detail = parseCaseDetail(page);
          const mergedDeadlines = mergeCaseDeadlines(detail, allDeadlinePages);
          setCaseData(detail);
          setTasks(detail.tasks);
          setTimeEntries(detail.timeEntries);
          setExpensesList(detail.expenses);
          timeForm.setValue("lawyer", detail.ownLawyerName || "");
          setEvidenceList(detail.evidence || []);
          setDeadlinesList(mergedDeadlines);
          setContacts(
            allContacts.map((p) => {
              const fm = p.frontmatter as Record<string, unknown>;
              return {
                slug: p.slug,
                name: String(fm.name ?? p.title ?? ""),
                role: String(fm.role ?? "other"),
                email: fm.email as string | undefined,
                phone: fm.phone as string | undefined,
              };
            })
          );
        }
      } catch (err) {
        console.error(
          "[case-detail] failed to load case:",
          err instanceof Error ? err.message : String(err)
        );
        // Offline fallback: try loading from cache (e.g. case created offline)
        try {
          const cached = await getCache<BrainPage>(`page:${slug}`);
          if (cached && !cancelled) {
            const detail = parseCaseDetail(cached);
            setCaseData(detail);
            setTasks(detail.tasks);
            setTimeEntries(detail.timeEntries);
            setExpensesList(detail.expenses);
            setEvidenceList(detail.evidence || []);
            setDeadlinesList(detail.deadlines || []);
          }
        } catch {
          // cache miss — leave caseData as null (shows "Akte nicht gefunden")
        }
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

  // P0-1: Single-Writer — reload case data from engine instead of client-side documents writes.
  // The server-side reconcileCaseDocuments is the authoritative writer for the documents array.
  async function refreshCaseData() {
    if (!caseData) return;
    try {
      const page = await api.brain.getPage(slug);
      const deadlinePages = await api.brain
        .listPages({ type: "legal_deadline", limit: 300 })
        .catch(() => [] as BrainPage[]);
      const detail = parseCaseDetail(page);
      setCaseData(detail);
      setTasks(detail.tasks);
      setTimeEntries(detail.timeEntries);
      setExpensesList(detail.expenses);
      setEvidenceList(detail.evidence || []);
      setDeadlinesList(mergeCaseDeadlines(detail, deadlinePages));
    } catch {
      // best effort — UI continues with stale data
    }
  }

  // P0-2: Confirm or reject a KI-suggested deadline by PATCHing the case frontmatter
  async function confirmSuggestedDeadline(index: number, confirmed: boolean) {
    if (!caseData?.suggestedDeadlines) return;
    if (caseData.status === "archived") {
      setSaveError(t("casesdetail.archived_msg"));
      return;
    }
    const updated = caseData.suggestedDeadlines.map((sd, i) =>
      i === index ? { ...sd, confirmed } : sd
    );
    setCaseData({ ...caseData, suggestedDeadlines: updated });
    try {
      const slugPath = caseData.slug.split("/").map(encodeURIComponent).join("/");
      await csrfFetch(`/api/pages/${slugPath}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(caseData.version || 0),
        },
        body: JSON.stringify({
          frontmatter: { suggested_deadlines: updated },
          merge: true,
        }),
      });
    } catch {
      // best effort
    }
  }

  // B4: Confirm or reject a KI-suggested party by PATCHing the case frontmatter
  async function confirmSuggestedParty(index: number, confirmed: boolean) {
    if (!caseData?.suggestedParties) return;
    if (caseData.status === "archived") {
      setSaveError(t("casesdetail.archived_msg"));
      return;
    }
    const updated = caseData.suggestedParties.map((sp, i) =>
      i === index ? { ...sp, confirmed } : sp
    );
    setCaseData({ ...caseData, suggestedParties: updated });
    try {
      const slugPath = caseData.slug.split("/").map(encodeURIComponent).join("/");
      await csrfFetch(`/api/pages/${slugPath}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(caseData.version || 0),
        },
        body: JSON.stringify({
          frontmatter: { suggested_parties: updated },
          merge: true,
        }),
      });
    } catch {
      // best effort
    }
  }

  // P2.3: Refresh contacts when the window regains focus (cross-tab sync)
  useEffect(() => {
    const onFocus = () => {
      api.brain
        .listPages({ type: "legal_contact", limit: 200 })
        .then((pages) => {
          setContacts(
            pages.map((p) => {
              const fm = p.frontmatter as Record<string, unknown>;
              return {
                slug: p.slug,
                name: String(fm.name ?? p.title ?? ""),
                role: String(fm.role ?? "other"),
                email: fm.email as string | undefined,
                phone: fm.phone as string | undefined,
              };
            })
          );
        })
        .catch((err) =>
          console.warn(
            "[case] Failed to reload parties on focus:",
            err instanceof Error ? err.message : err
          )
        );
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // P2.2: Re-check Interessenkollision whenever client/opponent assignment changes
  useEffect(() => {
    const refs: ContactRef[] = [];
    if (caseData?.clientName?.trim()) {
      refs.push({ slug: caseData.clientSlug, name: caseData.clientName.trim(), role: "client" });
    }
    if (caseData?.opponentName?.trim()) {
      refs.push({
        slug: (caseData.opponentSlugs ?? [])[0],
        name: caseData.opponentName.trim(),
        role: "opponent",
      });
    }
    if (refs.length < 2) {
      setContactConflict(null);
      return;
    }
    const result = checkInternalConflict(refs);
    setContactConflict(result.hasConflict ? result : null);
  }, [caseData?.clientName, caseData?.clientSlug, caseData?.opponentName, caseData?.opponentSlugs]);

  // Live sync: poll every 30s and warn if version changed
  useEffect(() => {
    if (!caseData) return;
    const id = setInterval(async () => {
      try {
        const page = await api.brain.getPage(slug);
        const fm = caseFrontmatter(page);
        const remoteVersion = (fm.version as number) || 0;
        if (remoteVersion > caseData.version) {
          const remoteStatus = (fm.status as string) || undefined;
          if (remoteStatus === "archived" && caseData.status !== "archived") {
            setCaseData((prev) =>
              prev
                ? {
                    ...prev,
                    status: "archived",
                    archivedAt: typeof fm.archived_at === "string" ? fm.archived_at : undefined,
                    archivedBy: typeof fm.archived_by === "string" ? fm.archived_by : undefined,
                    version: remoteVersion,
                  }
                : prev
            );
            addToast({
              type: "info",
              title: lang === "en" ? "Case archived" : "Akte archiviert",
              description:
                lang === "en"
                  ? "This case was archived by another user."
                  : "Diese Akte wurde von einem anderen Nutzer archiviert.",
              duration: 8000,
            });
          } else {
            setConflictWarning(t("cases.detail_conflict_warning") + ` (${remoteVersion})`);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.version, slug]);

  // SSE: immediate reload when another user archives or restores this case
  useRealtime("case.deleted", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) {
      void refreshCaseData();
    }
  });
  useRealtime("case.restored", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) {
      void refreshCaseData();
    }
  });
  useRealtime("case.updated", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) {
      void refreshCaseData();
    }
  });

  // P3: Fetch KI-extrahierte Belege from auto_analysis when evidence tab is active
  useEffect(() => {
    if (!caseData || activeTab !== "evidence") return;
    let cancelled = false;
    (async () => {
      const docsWithSlugs = caseData.documents.filter((d) => d.slug || d.url);
      if (docsWithSlugs.length === 0) return;
      setAiEvidenceLoading(true);
      try {
        const cards: typeof aiEvidenceCards = [];
        const slugsToFetch = docsWithSlugs.slice(0, 20).map((d) => d.slug || d.url!);
        const pagesMap = await api.brain.getPages(slugsToFetch);

        for (const doc of docsWithSlugs.slice(0, 20)) {
          const slug = doc.slug || doc.url!;
          const page = pagesMap[slug];
          if (!page) continue;
          const fm = page.frontmatter ?? {};
          const meta = fm.meta as Record<string, unknown> | undefined;
          const analysis = meta?.auto_analysis as Record<string, unknown> | undefined;
          if (!analysis) continue;
          const keyFacts = Array.isArray(analysis.key_facts)
            ? (analysis.key_facts as string[]).slice(0, 5)
            : [];
          const parties = Array.isArray(analysis.parties)
            ? (analysis.parties as Array<Record<string, unknown>>)
                .map((p) => ({
                  name: String(p.name ?? p.party ?? ""),
                  role: String(p.role ?? ""),
                }))
                .filter((p) => p.name)
            : [];
          const evidenceRefs = Array.isArray(analysis.evidence_references)
            ? (analysis.evidence_references as string[]).slice(0, 5)
            : [];
          const citedStatutes = Array.isArray(analysis.cited_statutes)
            ? (analysis.cited_statutes as Array<Record<string, unknown>>)
                .map((c) => String(c.section ?? c.statute ?? ""))
                .filter(Boolean)
                .slice(0, 5)
            : [];
          const documentType = String(analysis.document_type ?? doc.kind ?? "");
          if (keyFacts.length > 0 || evidenceRefs.length > 0 || parties.length > 0) {
            cards.push({
              docName: doc.name,
              docSlug: doc.slug || doc.url || "",
              documentType,
              keyFacts,
              parties,
              evidenceRefs,
              citedStatutes,
            });
          }
        }
        if (!cancelled) setAiEvidenceCards(cards);
      } finally {
        if (!cancelled) setAiEvidenceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, caseData?.documents.length]);

  // Fetch semantic contradiction probe findings when contradictions tab is active
  useEffect(() => {
    if (!caseData || activeTab !== "contradictions") return;
    let cancelled = false;
    setProbeLoading(true);
    (async () => {
      try {
        const result = await api.legal.contradictionProbe(caseData.slug);
        if (!cancelled) {
          setProbeFindings(result.findings);
          setProbeLastRun(result.last_run);
          setProbeAvailable(result.probe_available);
        }
      } catch {
        if (!cancelled) {
          setProbeFindings([]);
          setProbeAvailable(false);
        }
      } finally {
        if (!cancelled) setProbeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, caseData?.slug]);

  // P3.1/P3.5: Multi-file upload with progress + client-side validation
  async function handleMultiUpload(files: File[]) {
    if (!caseData) return;
    if (caseData.status === "archived") {
      setUploadError(t("casesdetail.archived_upload_msg"));
      return;
    }
    setUploadError(null);

    const validFiles: File[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[0] ?? "";
      if (!isSupportedUploadName(file.name)) {
        setUploadError(`${ext || file.name} ${t("casesdetail.upload.err_format")}`);
        continue;
      }
      const maxSize = maxUploadSizeFor(file.name, file.type);
      if (file.size > maxSize) {
        setUploadError(
          `${file.name} ${t("casesdetail.upload.err_too_large")} ${formatUploadBytes(maxSize)}.`
        );
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    if (!isOnline()) {
      if (documentPassword) {
        setUploadError(
          "Passwortgeschützte Dokumente können aus Sicherheitsgründen nicht offline gespeichert werden."
        );
        return;
      }
      // C2: Enqueue files in IndexedDB instead of rejecting — they'll sync
      // automatically when the connection is restored.
      for (const file of validFiles) {
        const bytes = await file.arrayBuffer();
        await enqueueFileUpload({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          bytes,
          metadata: {
            title: file.name,
            source: "legal_case",
            tags: [caseData.slug],
            case_slug: caseData.slug,
          },
        });
      }
      setUploadError(`${validFiles.length} ${t("casesdetail.upload.offline_queued")}`);
      return;
    }

    // Add all files to the queue
    const queueItems = validFiles.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 6)}`,
      fileName: file.name,
      fileSize: file.size,
      uploadedBytes: 0,
      progress: 0,
      startedAt: Date.now(),
      status: "queued" as const,
    }));
    setUploadQueue((prev) => [...prev, ...queueItems]);

    // Presigned URL upload flow: direct-to-storage with adaptive concurrency.
    // Falls back to streaming PUT for local storage deployments.
    const fileMap = new Map<string, string>();
    validFiles.forEach((f, i) => fileMap.set(f.name, queueItems[i].id));

    const results = await presignedUploadFiles(validFiles, {
      caseSlug: caseData.slug,
      source: "legal_case",
      password: documentPassword || undefined,
      onProgress: (p: PresignedProgress) => {
        const qId = fileMap.get(p.filename);
        if (!qId) return;
        const now = Date.now();
        setUploadQueue((prev) =>
          prev.map((q) => {
            if (q.id !== qId) return q;
            const startedAt = q.startedAt ?? now;
            const elapsedSeconds = Math.max(0.25, (now - startedAt) / 1000);
            const uploadedBytes =
              p.phase === "uploading" || p.phase === "confirming" || p.phase === "done"
                ? p.totalBytes
                : p.uploadedBytes;
            const speedBps =
              p.phase === "uploading" && uploadedBytes > 0
                ? uploadedBytes / elapsedSeconds
                : q.speedBps;
            const etaSeconds =
              speedBps && p.phase === "uploading"
                ? Math.max(0, (p.totalBytes - uploadedBytes) / speedBps)
                : undefined;
            return {
              ...q,
              status:
                p.phase === "done"
                  ? "done"
                  : p.phase === "error"
                    ? "error"
                    : p.phase === "confirming"
                      ? "processing"
                      : p.phase === "uploading"
                        ? "uploading"
                        : "preparing",
              progress: p.percent,
              uploadedBytes,
              speedBps,
              etaSeconds,
            };
          })
        );
      },
    });

    // Process results
    for (const r of results) {
      const qId = fileMap.get(r.file.name);
      if (!qId) continue;
      if (r.error) {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === qId ? { ...q, status: "error", progress: 0, error: r.error } : q
          )
        );
      } else {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === qId ? { ...q, status: "done", progress: 100, uploadedBytes: r.file.size } : q
          )
        );
        // Remove from queue after 2s
        setTimeout(() => {
          setUploadQueue((prev) => prev.filter((q) => q.id !== qId));
        }, 2000);
      }
    }

    // Refresh case data to pick up new documents
    await refreshCaseData();
    setDocumentPassword("");
  }

  // IDE-style "ganzen Ordner einlesen": recursively walk a chosen folder and feed
  // every supported file into the same staggered upload queue as handleMultiUpload.
  async function pickFolderForCase() {
    interface FsHandle {
      kind: "file" | "directory";
      getFile?: () => Promise<File>;
      values?: () => AsyncIterable<FsHandle>;
    }
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FsHandle> })
      .showDirectoryPicker;
    if (!picker || !caseData) return;
    try {
      setScanningFolder(true);
      const dir = await picker();
      const out: File[] = [];
      const walk = async (handle: FsHandle, depth: number) => {
        if (depth > 5 || !handle.values) return;
        for await (const entry of handle.values()) {
          if (entry.kind === "file" && entry.getFile) {
            const f = await entry.getFile();
            if (UPLOAD_FOLDER_ACCEPT_RE.test(f.name) && f.size <= maxUploadSizeFor(f.name, f.type))
              out.push(f);
          } else if (entry.kind === "directory") {
            await walk(entry, depth + 1);
          }
        }
      };
      await walk(dir, 0);
      if (out.length > 0) await handleMultiUpload(out);
    } catch {
      // user dismissed the picker or the browser blocked it — no-op
    } finally {
      setScanningFolder(false);
    }
  }

  // Auto-save tasks and time entries back to brain page
  async function saveCaseUpdate(updates: Partial<CaseDetail>) {
    if (!caseData) return;
    if (caseData.status === "archived") {
      setSaveError(t("casesdetail.archived_msg"));
      return;
    }
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
                      : changedFields.includes("clientSlug") || changedFields.includes("clientName")
                        ? `Mandant zugewiesen: ${updates.clientName ?? caseData.clientName ?? "—"}`
                        : changedFields.includes("opponentSlugs") ||
                            changedFields.includes("opponentName")
                          ? `Gegner zugewiesen: ${updates.opponentName ?? caseData.opponentName ?? "—"}`
                          : changedFields.includes("courtSlug") ||
                              changedFields.includes("courtName")
                            ? `Gericht zugewiesen: ${updates.courtName ?? caseData.courtName ?? "—"}`
                            : t("cases.detail_audit_general"),
      };
      const existingAudit = caseData.auditLog ?? [];
      const newAudit = [...existingAudit, auditEntry];

      const frontmatter: Record<string, unknown> = {
        type: "legal_case",
        case_number: updates.caseNumber ?? caseData.caseNumber,
        status: updates.status ?? caseData.status,
        legal_area: updates.legalArea ?? caseData.legalArea,
        sub_area: updates.subArea ?? caseData.subArea,
        priority: updates.priority ?? caseData.priority,
        opponent_name: updates.opponentName ?? caseData.opponentName,
        opponent_slugs: updates.opponentSlugs ?? caseData.opponentSlugs,
        client_name: updates.clientName ?? caseData.clientName,
        client_slug: updates.clientSlug ?? caseData.clientSlug,
        court_name: updates.courtName ?? caseData.courtName,
        court_slug: updates.courtSlug ?? caseData.courtSlug,
        own_lawyer_name: updates.ownLawyerName ?? caseData.ownLawyerName,
        own_lawyer_slug: updates.ownLawyerSlug ?? caseData.ownLawyerSlug,
        claims: updates.claims ?? caseData.claims,
        defenses: updates.defenses ?? caseData.defenses,
        tags: updates.tags ?? caseData.tags,
        tasks: updates.tasks ?? tasks,
        time_entries: updates.timeEntries ?? timeEntries,
        expenses: updates.expenses ?? expensesList,
        timeline_events: updates.timelineEvents ?? caseData.timelineEvents,
        // P0-1: documents are NOT written here — the server-side reconcileCaseDocuments
        // is the single writer. Including them would clobber concurrent server writes.
        evidence: updates.evidence ?? evidenceList,
        deadlines: updates.deadlines ?? deadlinesList,
        portal_enabled: updates.portalEnabled ?? caseData.portalEnabled,
        portal_note: updates.portalNote ?? caseData.portalNote,
        audit_log: newAudit,
        // C3: version is NOT set here — the server computes it from the If-Match header.
        // Setting it client-side was redundant and could mask concurrent updates.
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
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.message || t("casesdetail.archived_msg"));
          void refreshCaseData();
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        // B3: Handle server-side conflict check result
        const data = await res.json().catch(() => ({}));
        if (data.conflictWarning?.matches?.length > 0) {
          const names = data.conflictWarning.matches
            .map((m: { name: string }) => m.name)
            .join(", ");
          setContactConflict({
            hasConflict: true,
            severity: "critical",
            hits: data.conflictWarning.matches.map(
              (m: { name: string; slug: string; type: string }) => ({
                name: m.name,
                slug: m.slug,
                type: m.type,
                reason: "Server-seitig erkannt",
                similarity: 1,
                matchType: "exact" as const,
              })
            ),
            checkedContacts: 0,
            warning: `Interessenkollision erkannt (server-seitig): ${names}`,
          });
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
          ? `${t("casesdetail.error_save")}: ${e.message}`
          : t("casesdetail.error_save")
      );
    }
  }

  // Restore an archived case: PATCH status back to active and untombstone documents
  async function handleRestore(targetStatus: CaseStatus = "open") {
    if (!caseData) return;
    const statusLabel = STATUS_LABELS_DE[targetStatus] ?? targetStatus;
    const confirmed = await confirm({
      title: lang === "en" ? "Restore case" : "Akte wiederherstellen",
      message:
        lang === "en"
          ? `Restore case "${caseData.title}" from archive as "${statusLabel}"? All linked documents will be reactivated.`
          : `Akte "${caseData.title}" aus dem Archiv als "${statusLabel}" wiederherstellen? Alle verknüpften Dokumente werden reaktiviert.`,
      confirmLabel: lang === "en" ? "Restore" : "Wiederherstellen",
      cancelLabel: lang === "en" ? "Cancel" : "Abbrechen",
      variant: "primary",
    });
    if (!confirmed) return;
    setRestoring(true);
    try {
      const slugPath = caseData.slug.split("/").map(encodeURIComponent).join("/");
      const res = await csrfFetch(`/api/pages/${slugPath}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(caseData.version || 0),
        },
        body: JSON.stringify({
          frontmatter: {
            status: targetStatus,
            restored_at: new Date().toISOString(),
            archived_at: null,
            archived_by: null,
          },
          merge: true,
        }),
      });
      if (res.ok) {
        setCaseData({
          ...caseData,
          status: targetStatus,
          archivedAt: undefined,
          archivedBy: undefined,
          version: caseData.version + 1,
        });
        addToast({
          type: "success",
          title: lang === "en" ? "Case restored" : "Akte wiederhergestellt",
          description:
            lang === "en"
              ? `"${caseData.title}" is now active again.`
              : `"${caseData.title}" ist wieder aktiv.`,
          duration: 5000,
        });
        // Reload documents that were un-tombstoned by the restore cascade
        void refreshCaseData();
      } else if (res.status === 403) {
        addToast({
          type: "error",
          title: lang === "en" ? "Access denied" : "Zugriff verweigert",
          description:
            lang === "en"
              ? "You don't have permission to restore this case."
              : "Sie haben keine Berechtigung, diese Akte wiederherzustellen.",
        });
      } else if (res.status === 409) {
        setConflictWarning(t("casesdetail.conflict_warning"));
      } else {
        addToast({
          type: "error",
          title: lang === "en" ? "Restore failed" : "Wiederherstellung fehlgeschlagen",
          description: `HTTP ${res.status}`,
        });
      }
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `Wiederherstellung fehlgeschlagen: ${e.message}`
          : "Wiederherstellung fehlgeschlagen."
      );
    } finally {
      setRestoring(false);
    }
  }

  async function handleQuery() {
    if (!query.trim() || !caseData) return;
    if (caseData.status === "archived") {
      setQueryResult(t("casesdetail.archived_query_msg"));
      return;
    }
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
  const evidenceDocumentPattern =
    /beweis|evidence|gutachten|expert|vertrag|contract|korrespondenz|email|e-mail|foto|photo|video|zeug/i;
  const evidenceDocuments = caseData.documents.filter((doc) =>
    evidenceDocumentPattern.test(`${doc.kind ?? ""} ${doc.name}`)
  );
  const evidenceSourceCount = evidenceDocuments.length + evidenceList.length;

  function docProcessingStatus(doc: {
    extraction_status?: string;
    extraction_error_code?: string;
    ocr_status?: string;
    extraction_unverified?: boolean;
    analysis_status?: string;
  }) {
    // Analysis status takes priority — if analysis failed or is retrying,
    // that's the most actionable signal for the user.
    const as = doc.analysis_status;
    if (as === "failed")
      return { key: "analysis_failed", color: "bg-red-500/10 border-red-500/20 text-red-600" };
    if (as === "retrying")
      return { key: "analysis_retrying", color: "bg-blue-500/10 border-blue-500/20 text-blue-600" };
    if (as === "permanently_failed")
      return {
        key: "analysis_permanently_failed",
        color: "bg-red-500/10 border-red-500/20 text-red-600",
      };

    const es = doc.extraction_status;
    // Terminal extraction failure (incl. the async extract-document worker's
    // machine-readable error codes). Without this, a failed extraction fell
    // through to the gray "uploaded" badge — silently hiding the failure.
    if (es === "failed" || es === "error") {
      const code = doc.extraction_error_code;
      if (code === "password_required" || code === "invalid_document_password")
        return {
          key: "extraction_password",
          color: "bg-amber-500/10 border-amber-500/20 text-amber-600",
        };
      if (code === "unsupported_format")
        return {
          key: "extraction_unsupported",
          color: "bg-red-500/10 border-red-500/20 text-red-600",
        };
      return { key: "extraction_failed", color: "bg-red-500/10 border-red-500/20 text-red-600" };
    }
    if (es === "confirmed" || (es === "text_layer" && !doc.extraction_unverified))
      return {
        key: "confirmed",
        color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
      };
    if (es === "analyzed" || (es === "text_layer" && doc.extraction_unverified))
      return { key: "review_open", color: "bg-amber-500/10 border-amber-500/20 text-amber-600" };
    if (es === "ocr_complete")
      return { key: "analyzed", color: "bg-blue-500/10 border-blue-500/20 text-blue-600" };
    if (es === "ocr_processing")
      return { key: "ocr_processing", color: "bg-blue-500/10 border-blue-500/20 text-blue-600" };
    if (es === "ocr_needed" || es === "ocr_failed")
      return { key: "ocr_needed", color: "bg-red-500/10 border-red-500/20 text-red-600" };
    if (es === "processing")
      return { key: "uploaded", color: "bg-gray-500/10 border-gray-500/20 text-gray-600" };
    if (es === "uploaded")
      return { key: "uploaded", color: "bg-gray-500/10 border-gray-500/20 text-gray-600" };
    const ocr = doc.ocr_status;
    if (ocr === "ocr_complete")
      return { key: "analyzed", color: "bg-blue-500/10 border-blue-500/20 text-blue-600" };
    if (ocr === "ocr_needed" || ocr === "unknown")
      return { key: "ocr_needed", color: "bg-red-500/10 border-red-500/20 text-red-600" };
    if (ocr === "text_layer")
      return {
        key: "text_layer",
        color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
      };
    return { key: "uploaded", color: "bg-gray-500/10 border-gray-500/20 text-gray-600" };
  }

  function formatUploadBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatUploadEta(seconds?: number): string {
    if (!seconds || !Number.isFinite(seconds) || seconds < 1) return "< 1s";
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.ceil(seconds % 60);
    return `${minutes}m ${rest}s`;
  }

  function uploadStatusLabel(
    status: "queued" | "preparing" | "uploading" | "processing" | "done" | "error"
  ) {
    switch (status) {
      case "queued":
        return t("casesdetail.upload.queued");
      case "preparing":
        return t("casesdetail.upload.preparing");
      case "uploading":
        return t("casesdetail.upload.uploading");
      case "processing":
        return t("casesdetail.upload.processing");
      case "done":
        return t("casesdetail.upload.done");
      case "error":
        return t("casesdetail.upload.error");
    }
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeDeadlines = deadlinesList.filter((dl) => dl.status !== "done");
  const criticalDeadlineCount = activeDeadlines.filter((dl) => {
    const due = new Date(dl.due_date || dl.date || "");
    if (Number.isNaN(due.getTime())) return false;
    const days = Math.ceil((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    return days <= 3;
  }).length;
  const openTaskCount = tasks.filter((task) => !task.done).length;
  const documentReviewCount = caseData.documents.filter((doc) => {
    const status = docProcessingStatus(doc).key;
    return status === "review_open" || status === "ocr_needed" || status === "ocr_processing";
  }).length;
  const unbilledMinutes = timeEntries
    .filter((entry) => entry.billable !== false && !entry.billed)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const unbilledExpenses = expensesList
    .filter((entry) => entry.billable !== false && !entry.billed)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const conflictNeedsReview =
    Boolean(contactConflict) || caseData.conflictStatus === "conflict_pending";
  const formatMinutes = (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`;
  const uploadStats = {
    totalFiles: uploadQueue.length,
    completedFiles: uploadQueue.filter((item) => item.status === "done").length,
    failedFiles: uploadQueue.filter((item) => item.status === "error").length,
    totalBytes: uploadQueue.reduce((sum, item) => sum + item.fileSize, 0),
    uploadedBytes: uploadQueue.reduce(
      (sum, item) =>
        sum +
        (item.status === "done" || item.status === "processing"
          ? item.fileSize
          : Math.min(item.uploadedBytes, item.fileSize)),
      0
    ),
  };
  const uploadOverallProgress =
    uploadStats.totalBytes > 0
      ? Math.round((uploadStats.uploadedBytes / uploadStats.totalBytes) * 100)
      : 0;

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
        {caseData?.status === "archived" && (
          <div
            className="flex items-center gap-2 border-b border-gray-500/20 bg-gray-500/10 px-6 py-2.5 text-sm text-gray-700"
            role="status"
          >
            <Archive size={14} aria-hidden="true" className="shrink-0" />
            <span>
              {lang === "en"
                ? `Archived${caseData.archivedAt ? ` on ${new Date(caseData.archivedAt).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}` : ""}${caseData.archivedBy ? ` by ${caseData.archivedBy}` : ""}`
                : `Archiviert${caseData.archivedAt ? ` am ${new Date(caseData.archivedAt).toLocaleDateString("de-DE")}` : ""}${caseData.archivedBy ? ` von ${caseData.archivedBy}` : ""}`}
            </span>
            {userRole === "admin" || userRole === "lawyer" ? (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => handleRestore("open")}
                  disabled={restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-500/10 hover:text-gray-900 disabled:opacity-50"
                >
                  {restoring ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {lang === "en" ? "Restore as Open" : "Als Offen wiederherstellen"}
                </button>
                <button
                  onClick={() => handleRestore("dormant")}
                  disabled={restoring}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-500/10 hover:text-gray-900 disabled:opacity-50"
                >
                  <PauseCircle size={12} />
                  {lang === "en" ? "as Dormant" : "als Ruhend"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {/* Workspace Header — Linear-style compact bar */}
      <div className="shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            aria-label={t("aria.back_to_cases")}
            className="flex items-center gap-1 text-[13px] text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{lang === "en" ? "Home" : "Home"}</span>
          </Link>
          <ChevronRight size={12} className="text-[color:var(--ds-text-subtle)]" />
          <Link
            href="/dashboard/cases"
            className="text-[13px] text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            {t("cases.detail_breadcrumb")}
          </Link>
          <ChevronRight size={12} className="text-[color:var(--ds-text-subtle)]" />
          <span className="truncate text-[13px] font-medium text-[color:var(--ds-text)]">
            {caseData.title}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-[color:var(--ds-text-subtle)]">
            {caseData.caseNumber}
          </span>
          <span
            className={cn(
              "ml-1 h-1.5 w-1.5 shrink-0 rounded-full",
              statusCfg.color === "emerald"
                ? "bg-emerald-500"
                : statusCfg.color === "blue"
                  ? "bg-blue-500"
                  : statusCfg.color === "amber"
                    ? "bg-amber-500"
                    : statusCfg.color === "red"
                      ? "bg-red-500"
                      : statusCfg.color === "orange"
                        ? "bg-orange-500"
                        : "bg-gray-400"
            )}
            aria-hidden
          />
          <div className="ml-auto flex items-center gap-2">
            {activeUsers.length > 0 && (
              <div className="flex items-center gap-1">
                {activeUsers.slice(0, 3).map((u) => (
                  <div
                    key={u.userId}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--ds-surface)] bg-emerald-500/20 text-[9px] font-medium text-emerald-600"
                    title={`${u.email} ${lang === "en" ? "is active" : "ist aktiv"}`}
                  >
                    {u.email.slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {activeUsers.length > 3 && (
                  <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                    +{activeUsers.length - 3}
                  </span>
                )}
              </div>
            )}
            {caseData.status !== "archived" && (
              <button
                onClick={() => setShowStatusDialog(true)}
                className="rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-[11px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              >
                {t(statusCfg.labelKey as DashboardKey)}
              </button>
            )}
          </div>
        </div>

        {/* Meta bar — inline, subtle */}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--ds-text-subtle)]">
          {caseData.clientName && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {caseData.clientSlug ? (
                <Link
                  href={`/dashboard/contacts?highlight=${encodeURIComponent(caseData.clientSlug)}`}
                  className="brand-text hover:underline"
                >
                  {caseData.clientName}
                </Link>
              ) : (
                <span>{caseData.clientName}</span>
              )}
            </span>
          )}
          {caseData.opponentName && (
            <span className="flex items-center gap-1">
              <ShieldAlert size={10} />
              {caseData.opponentName}
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

        <div className="mt-4 border-t border-[color:var(--ds-border)] pt-3">
          <div className="flex flex-wrap gap-2">
            {[
              {
                target: "deadlines_tasks",
                label: t("cases.detail_health_deadlines"),
                value: criticalDeadlineCount,
                detail: `${activeDeadlines.length} ${t("cases.detail_health_open")}`,
                icon: CalendarClock,
                alert: criticalDeadlineCount > 0,
              },
              {
                target: "deadlines_tasks",
                label: t("cases.detail_health_tasks"),
                value: openTaskCount,
                detail: t("cases.detail_health_open"),
                icon: ListChecks,
                alert: openTaskCount > 0,
              },
              {
                target: "documents",
                label: t("cases.detail_health_docs"),
                value: documentReviewCount,
                detail: `${caseData.documents.length} ${t("cases.detail_health_total")}`,
                icon: FileText,
                alert: documentReviewCount > 0,
              },
              {
                target: "billing",
                label: t("cases.detail_health_billing"),
                value: unbilledMinutes > 0 ? formatMinutes(unbilledMinutes) : "0",
                detail: `${unbilledExpenses.toFixed(2)} €`,
                icon: Receipt,
                alert: unbilledMinutes > 0 || unbilledExpenses > 0,
              },
              {
                target: "overview",
                label: t("cases.detail_health_conflict"),
                value: conflictNeedsReview
                  ? t("cases.detail_health_review")
                  : t("cases.detail_health_clear"),
                detail: caseData.conflictStatus || t("cases.detail_health_checked"),
                icon: conflictNeedsReview ? ShieldAlert : ShieldCheck,
                alert: conflictNeedsReview,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveTab(item.target)}
                  className={cn(
                    "inline-flex min-h-10 min-w-[150px] items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    item.alert
                      ? "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] hover:border-[color:var(--ds-border-strong)]"
                  )}
                >
                  <Icon
                    size={13}
                    className={cn(
                      "shrink-0 text-[color:var(--ds-text-muted)]",
                      item.alert && "text-amber-600"
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs text-[color:var(--ds-text-muted)]">
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold text-[color:var(--ds-text)]",
                          item.alert && "text-amber-600"
                        )}
                      >
                        {item.value}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-[color:var(--ds-text-muted)]">
                      {item.detail}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workspace Tabs — Linear-style compact */}
      <div className="shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4">
        <div className="flex gap-0.5 overflow-x-auto">
          {(lang === "en" ? WORKSPACE_TABS_EN : WORKSPACE_TABS_DE).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-[border-color,color] duration-120 ease-[var(--ds-ease-smooth)]",
                  isActive
                    ? "brand-text border-[color:var(--brand-primary)]"
                    : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Workspace Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "overview" && (
          <div className="max-w-3xl space-y-4">
            <CaseOverviewWidgets caseData={caseData} onTabChange={(tab) => setActiveTab(tab)} />

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={() => {
                  setActiveTab("strategy");
                  setQuery(t("cases.detail_qb_strategy"));
                }}
              >
                <Lightbulb size={14} />
                {t("cases.detail_btn_strategy")}
              </Button>
              <Button
                variant="secondary"
                disabled={userRole !== "admin" && userRole !== "lawyer"}
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowStatusDialog(true)}
              >
                <ChevronRight size={14} />
                {t("cases.detail_btn_status_change")}
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowEmailDialog(true)}
              >
                <Mail size={14} />
                {t("email.compose_title")}
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => setShowDocuSignDialog(true)}
              >
                <PenTool size={14} />
                {t("docusign.send_title")}
              </Button>
              <Button
                variant="secondary"
                className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                onClick={() => {
                  setActiveTab("strategy");
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
                    disabled={caseData.status === "archived"}
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
                        if (caseData.status === "archived") {
                          // Restore from archived — use dedicated restore handler
                          setShowStatusDialog(false);
                          setStatusError(null);
                          void handleRestore(pendingStatus);
                          setPendingStatus(null);
                        } else {
                          const updated = { ...caseData, status: pendingStatus };
                          setCaseData(updated);
                          saveCaseUpdate(updated);
                          setShowStatusDialog(false);
                          setPendingStatus(null);
                          setStatusError(null);
                        }
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
              {/* P2.2: Interessenkollision warning */}
              {contactConflict && (
                <div
                  role="alert"
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs",
                    contactConflict.severity === "critical"
                      ? "border-red-500/30 bg-red-500/5 text-red-600"
                      : "border-amber-500/30 bg-amber-500/5 text-amber-600"
                  )}
                >
                  {contactConflict.severity === "critical" ? (
                    <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold">{contactConflict.warning}</p>
                    {contactConflict.hits.slice(0, 3).map((hit, i) => (
                      <p key={i} className="opacity-90">
                        {hit.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* B4: KI-extrahierte Parteien-Vorschläge */}
              {caseData.suggestedParties && caseData.suggestedParties.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--ds-text)]">
                    <Sparkles size={12} className="text-amber-500" />
                    {t("casesdetail.ai_parties")}
                  </div>
                  {caseData.suggestedParties
                    .filter((sp) => !sp.confirmed)
                    .map((sp, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="text-sm text-[color:var(--ds-text)]">{sp.name}</span>
                          <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                            {sp.role} · Quelle: {sp.source}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={caseData?.status === "archived"}
                            className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
                            onClick={() => {
                              setContactDialogRole(
                                sp.role === "Kläger" ||
                                  sp.role === "Mandant" ||
                                  sp.role === "Klient" ||
                                  sp.role === "client"
                                  ? "client"
                                  : sp.role === "Beklagter" ||
                                      sp.role === "Gegner" ||
                                      sp.role === "opponent"
                                    ? "opponent"
                                    : sp.role === "Gericht" ||
                                        sp.role === "Behörde" ||
                                        sp.role === "court" ||
                                        sp.role === "authority"
                                      ? "court"
                                      : "other"
                              );
                              setContactDialogName(sp.name);
                              setContactDialogOpen(true);
                              // B4 FIX: Don't mark as confirmed here — wait until
                              // the contact dialog actually creates the contact.
                              // The confirm callback is wired in onContactCreated.
                              setPendingSuggestedPartyIndex(i);
                            }}
                          >
                            <Plus size={12} /> Als Kontakt
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={caseData?.status === "archived"}
                            className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                            onClick={() => confirmSuggestedParty(i, false)}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Client */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_client")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setContactDialogRole("client");
                        setContactDialogName(caseData.clientName);
                        setContactDialogOpen(true);
                        setPendingSuggestedPartyIndex(null);
                      }}
                      className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                      aria-label="Neuen Mandanten erstellen"
                    >
                      <Plus size={12} /> erstellen
                    </button>
                  </div>
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_opponent")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setContactDialogRole("opponent");
                        setContactDialogName(caseData.opponentName);
                        setContactDialogOpen(true);
                        setPendingSuggestedPartyIndex(null);
                      }}
                      className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                      aria-label="Neuen Gegner erstellen"
                    >
                      <Plus size={12} /> erstellen
                    </button>
                  </div>
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("cases.detail_court")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setContactDialogRole("court");
                        setContactDialogName(caseData.courtName);
                        setContactDialogOpen(true);
                        setPendingSuggestedPartyIndex(null);
                      }}
                      className="brand-text flex items-center gap-0.5 text-xs hover:underline"
                      aria-label="Neues Gericht erstellen"
                    >
                      <Plus size={12} /> erstellen
                    </button>
                  </div>
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

            {/* P2.1: Inline contact creation dialog */}
            <ContactCreateDialog
              open={contactDialogOpen}
              onOpenChange={(open) => {
                setContactDialogOpen(open);
                if (!open) setPendingSuggestedPartyIndex(null);
              }}
              defaultRole={contactDialogRole}
              defaultName={contactDialogName}
              existingContacts={contacts}
              onCreated={(contact: ContactCreateResult) => {
                // Add to contacts list
                setContacts((prev) => [
                  ...prev,
                  {
                    slug: contact.slug,
                    name: contact.name,
                    role: contact.role,
                    email: contact.email,
                    phone: contact.phone,
                  },
                ]);
                // B4: Confirm the suggested party if one was pending
                if (pendingSuggestedPartyIndex !== null) {
                  confirmSuggestedParty(pendingSuggestedPartyIndex, true);
                  setPendingSuggestedPartyIndex(null);
                }
                // Assign to case based on role
                if (contact.role === "client") {
                  const updated: CaseDetail = {
                    ...caseData,
                    clientSlug: contact.slug,
                    clientName: contact.name,
                  };
                  setCaseData(updated);
                  saveCaseUpdate({
                    clientSlug: updated.clientSlug,
                    clientName: updated.clientName,
                  });
                } else if (contact.role === "opponent") {
                  const updated: CaseDetail = {
                    ...caseData,
                    opponentSlugs: [contact.slug],
                    opponentName: contact.name,
                  };
                  setCaseData(updated);
                  saveCaseUpdate({
                    opponentSlugs: updated.opponentSlugs,
                    opponentName: updated.opponentName,
                  });
                } else if (contact.role === "court") {
                  const updated: CaseDetail = {
                    ...caseData,
                    courtSlug: contact.slug,
                    courtName: contact.name,
                  };
                  setCaseData(updated);
                  saveCaseUpdate({ courtSlug: updated.courtSlug, courtName: updated.courtName });
                }
              }}
            />
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
            <div className="brand-border brand-soft rounded-xl border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="brand-text text-sm font-semibold">{t("cases.detail_strategy")}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={caseData?.status === "archived" || strategyLoading}
                  onClick={async () => {
                    if (!caseData) return;
                    setStrategyLoading(true);
                    try {
                      const result = await api.legal.caseStrategy(caseData.slug);
                      setCaseData({
                        ...caseData,
                        strategy: {
                          summary: result.summary,
                          recommended: result.recommended,
                          recommendedApproach: result.recommendedApproach,
                          risks: result.risks.map((r) => ({
                            description: r.description,
                            probability: r.probability,
                            impact: r.impact,
                          })),
                          generatedAt: result.generatedAt,
                        },
                      });
                    } catch (err) {
                      setSaveError(
                        err instanceof Error ? err.message : "Strategie-Generierung fehlgeschlagen"
                      );
                    } finally {
                      setStrategyLoading(false);
                    }
                  }}
                  className="text-xs"
                >
                  {strategyLoading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {caseData?.strategy ? "Neu generieren" : "Strategie generieren"}
                </Button>
              </div>
              {caseData?.strategy ? (
                <>
                  <p className="mb-3 text-sm text-[color:var(--ds-text-muted)]">
                    {caseData.strategy.recommended}
                  </p>
                  {caseData.strategy.recommendedApproach && (
                    <p className="mb-3 text-xs text-[color:var(--ds-text-muted)]">
                      {caseData.strategy.recommendedApproach}
                    </p>
                  )}
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
                </>
              ) : (
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Noch keine Strategie generiert. Klicken Sie auf &ldquo;Strategie generieren&rdquo;
                  für eine KI-gestützte Empfehlung.
                </p>
              )}
            </div>

            {/* Contradictions */}
            {caseData.contradictions && caseData.contradictions.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-700">
                    Widersprüche erkannt ({caseData.contradictions.length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {caseData.contradictions.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Badge
                          variant={c.severity === "high" ? "danger" : "warning"}
                          className="text-[10px]"
                        >
                          {c.severity}
                        </Badge>
                        <span className="text-xs font-medium text-[color:var(--ds-text)]">
                          {c.field}
                        </span>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text-muted)]">{c.description}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[color:var(--ds-text-muted)]">
                        <span className="truncate">{c.value_a}</span>
                        <span className="shrink-0 text-amber-600">vs</span>
                        <span className="truncate">{c.value_b}</span>
                      </div>
                    </div>
                  ))}
                </div>
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

        {activeTab === "activity" && (
          <div className="max-w-3xl space-y-4">
            <div className="mb-4 flex items-center gap-2">
              <Button
                variant="primary"
                className="brand-bg brand-bg gap-2 text-sm text-white"
                onClick={() => {
                  setActiveTab("strategy");
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
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {ev.timestamp || ev.date
                          ? new Date(ev.timestamp || ev.date || "").toLocaleString(
                              lang === "en" ? "en-GB" : "de-DE"
                            )
                          : "—"}
                      </div>
                      {ev.type === "status_change" && (
                        <span className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                          {lang === "en" ? "Status Change" : t("casesdetail.status_change")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--ds-text)]">{ev.title}</div>
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
          <div className="max-w-5xl space-y-4">
            {/* P3.1: Multi-file drag-drop upload zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add(
                  "border-[color:var(--brand-primary)]",
                  "bg-[color:var(--brand-primary)]/5"
                );
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove(
                  "border-[color:var(--brand-primary)]",
                  "bg-[color:var(--brand-primary)]/5"
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove(
                  "border-[color:var(--brand-primary)]",
                  "bg-[color:var(--brand-primary)]/5"
                );
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0 && caseData) {
                  handleMultiUpload(files);
                }
              }}
              className={cn(
                "rounded-xl border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center transition-colors focus:border-[color:var(--brand-primary)] focus:outline-none",
                caseData?.status === "archived" && "pointer-events-none opacity-50"
              )}
              tabIndex={caseData?.status === "archived" ? -1 : 0}
              role="button"
              aria-label="Dateien hochladen"
              aria-disabled={caseData?.status === "archived"}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const input = e.currentTarget.querySelector(
                    'input[type="file"]'
                  ) as HTMLInputElement | null;
                  input?.click();
                }
              }}
            >
              <FileText size={24} className="mx-auto mb-2 text-[color:var(--ds-text-muted)]" />
              <p className="text-sm font-medium text-[color:var(--ds-text)]">
                Dokumente hochladen oder hier ablegen
              </p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                PDF, Office/iWork, E-Mail/PST, ZIP, Bild, Audio oder Text · bis 500 MB (Tabellen 20
                MB) · wird automatisch dieser Akte zugeordnet
              </p>
              {!isOnline() && (
                <p className="mt-2 text-xs text-amber-600">
                  {t("casesdetail.upload.offline_mode")}
                </p>
              )}
              <label className="mt-3 inline-block cursor-pointer">
                <input
                  type="file"
                  accept={UPLOAD_ACCEPT_ATTRIBUTE}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0 && caseData) {
                      handleMultiUpload(files);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="brand-bg brand-bg inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors">
                  <Plus size={14} /> {t("cases.detail_doc_upload")}
                </span>
              </label>
              <div className="mx-auto mt-3 max-w-sm text-left">
                <label
                  htmlFor="case-upload-document-password"
                  className="mb-1 flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]"
                >
                  <Lock size={11} /> Dokumentkennwort (optional, wird nicht gespeichert)
                </label>
                <input
                  id="case-upload-document-password"
                  type="password"
                  autoComplete="off"
                  maxLength={255}
                  value={documentPassword}
                  onChange={(event) => setDocumentPassword(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  disabled={!isOnline()}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none"
                />
              </div>
              {folderApi && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pickFolderForCase();
                  }}
                  disabled={scanningFolder || !isOnline() || caseData?.status === "archived"}
                  className="mt-3 ml-2 inline-flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text)] transition-colors hover:border-[color:var(--ds-border-strong)] disabled:opacity-50"
                >
                  <FolderOpen size={14} />
                  {scanningFolder ? "Ordner wird eingelesen…" : "Ganzen Ordner einlesen"}
                </button>
              )}
            </div>

            {/* P3.1: Upload progress queue */}
            {uploadQueue.length > 0 && (
              <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {t("casesdetail.upload.in_progress")}
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      {uploadStats.completedFiles}/{uploadStats.totalFiles}{" "}
                      {t("casesdetail.upload.files_label")} ·{" "}
                      {formatUploadBytes(uploadStats.uploadedBytes)} von{" "}
                      {formatUploadBytes(uploadStats.totalBytes)}
                      {uploadStats.failedFiles > 0 ? ` · ${uploadStats.failedFiles} Fehler` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {uploadOverallProgress}%
                  </div>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadOverallProgress}
                  aria-label="Gesamtfortschritt Upload"
                >
                  <div
                    className="brand-bg h-full rounded-full transition-all"
                    style={{ width: `${uploadOverallProgress}%` }}
                  />
                </div>
                {uploadQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5"
                  >
                    {item.status === "preparing" ||
                    item.status === "uploading" ||
                    item.status === "processing" ? (
                      <Loader2 size={16} className="brand-text shrink-0 animate-spin" />
                    ) : item.status === "done" ? (
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                    ) : item.status === "error" ? (
                      <XCircle size={16} className="shrink-0 text-red-500" />
                    ) : (
                      <FileText size={16} className="brand-text shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {item.fileName}
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-[color:var(--ds-text)]">
                          {item.progress}%
                        </div>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                        <span>{uploadStatusLabel(item.status)}</span>
                        {item.status === "preparing" ? (
                          <span>
                            Verbindung wird vorbereitet · {formatUploadBytes(item.fileSize)}
                          </span>
                        ) : item.status === "processing" ? (
                          <span>{t("casesdetail.upload.server_processing")}</span>
                        ) : (
                          <span>
                            {formatUploadBytes(
                              item.status === "done" ? item.fileSize : item.uploadedBytes
                            )}{" "}
                            / {formatUploadBytes(item.fileSize)}
                          </span>
                        )}
                        {item.status === "uploading" && item.speedBps ? (
                          <span>
                            {formatUploadBytes(item.speedBps)}/s · Rest{" "}
                            {formatUploadEta(item.etaSeconds)}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.progress}
                        aria-label={`Upload ${item.fileName}`}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            item.status === "error" ? "bg-red-500" : "brand-bg"
                          )}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      {item.status === "error" && (
                        <div className="mt-1 text-xs text-red-600">{item.error}</div>
                      )}
                    </div>
                    {item.status === "error" && (
                      <button
                        onClick={() => {
                          setUploadQueue((q) => q.filter((i) => i.id !== item.id));
                        }}
                        className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {uploadError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
                {uploadError}
              </div>
            )}

            {offlinePendingCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700">
                <CloudUpload size={14} className="shrink-0" />
                <span>
                  {offlinePendingCount}{" "}
                  {lang === "en"
                    ? "pending offline upload(s)"
                    : t("casesdetail.upload.offline_queue")}
                  {offlineSyncing ? ` — ${t("casesdetail.upload.syncing")}` : ""}
                </span>
              </div>
            )}

            {/* P3.4: Link existing document */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                <span className="font-medium text-[color:var(--ds-text)]">Dokumentenliste</span>
                <select
                  value={docTypeFilter}
                  onChange={(e) => setDocTypeFilter(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="all">Alle Typen</option>
                  <option value="Vollmacht">Vollmacht</option>
                  <option value="Klage">Klage</option>
                  <option value="Schriftsatz">Schriftsatz</option>
                  <option value="Beweis">Beweis</option>
                  <option value="Korrespondenz">Korrespondenz</option>
                  <option value="Vertrag">Vertrag</option>
                  <option value="Sonstiges">Sonstiges</option>
                  <option value="witness_statement">Zeugenaussage</option>
                  <option value="expert_report">Gutachten</option>
                  <option value="medical_report">Arztbericht</option>
                  <option value="court_order">Gerichtsbeschluss</option>
                  <option value="court_judgment">Urteil</option>
                  <option value="pleading">Schriftsatz (KI)</option>
                  <option value="invoice">Rechnung</option>
                  <option value="police_report">Ermittlungsakte</option>
                  <option value="financial_record">Finanzunterlage</option>
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLinkDialog(true)}
                disabled={caseData?.status === "archived"}
                className="gap-1.5 text-xs"
              >
                <Network size={13} /> {t("casesdetail.link_existing")}
              </Button>
            </div>

            {/* P3.4: Link existing document dialog */}
            {showLinkDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="w-full max-w-lg rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {t("casesdetail.link_document")}
                    </h3>
                    <button
                      onClick={() => setShowLinkDialog(false)}
                      className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={linkSearchQuery}
                    onChange={(e) => {
                      setLinkSearchQuery(e.target.value);
                      if (e.target.value.trim().length > 2) {
                        setLinkSearching(true);
                        api.brain
                          .search(e.target.value, 10)
                          .then((results) => {
                            setLinkSearchResults(results);
                            setLinkSearching(false);
                          })
                          .catch(() => setLinkSearching(false));
                      } else {
                        setLinkSearchResults([]);
                      }
                    }}
                    placeholder={t("casesdetail.search_placeholder")}
                    className="mb-3 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    autoFocus
                  />
                  {linkSearching && (
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("casesdetail.searching")}
                    </p>
                  )}
                  {!linkSearching && linkSearchResults.length > 0 && (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                      {linkSearchResults.map((page) => {
                        const alreadyLinked = caseData?.documents.some((d) => d.slug === page.slug);
                        return (
                          <button
                            key={page.slug}
                            disabled={alreadyLinked}
                            onClick={async () => {
                              if (!caseData) return;
                              // PATCH the document page to set case_slug
                              try {
                                const docSlugPath = page.slug
                                  .split("/")
                                  .map(encodeURIComponent)
                                  .join("/");
                                await csrfFetch(`/api/pages/${docSlugPath}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    frontmatter: {
                                      case_slug: caseData.slug,
                                      assignment_status: "assigned",
                                    },
                                    merge: true,
                                  }),
                                });
                                // P0-1: Refresh from engine — fetchCaseDocumentsBySlug picks up the case_slug stamp
                                await refreshCaseData();
                                setShowLinkDialog(false);
                                setLinkSearchQuery("");
                                setLinkSearchResults([]);
                              } catch (err) {
                                setUploadError(
                                  err instanceof Error ? err.message : t("casesdetail.link_failed")
                                );
                              }
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              alreadyLinked
                                ? "cursor-not-allowed border-[color:var(--ds-border)] opacity-50"
                                : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"
                            }`}
                          >
                            <FileText
                              size={14}
                              className="shrink-0 text-[color:var(--ds-text-muted)]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[color:var(--ds-text)]">
                                {page.title}
                              </div>
                              <div className="text-xs text-[color:var(--ds-text-muted)]">
                                {page.slug}
                              </div>
                            </div>
                            {alreadyLinked && (
                              <Badge variant="default" className="shrink-0 text-xs">
                                {t("casesdetail.already_linked")}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!linkSearching &&
                    linkSearchQuery.trim().length > 2 &&
                    linkSearchResults.length === 0 && (
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        Keine Ergebnisse gefunden.
                      </p>
                    )}
                </div>
              </div>
            )}

            {caseData.documents.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-6 text-center">
                <FileText size={30} className="mx-auto text-[color:var(--ds-border)]" />
                <p className="mt-2 text-sm font-medium text-[color:var(--ds-text)]">
                  {t("cases.detail_doc_empty")}
                </p>
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {t("casesdetail.doc_empty_desc")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {caseData.documents
                  .filter(
                    (d) =>
                      docTypeFilter === "all" ||
                      d.kind === docTypeFilter ||
                      d.doc_type === docTypeFilter
                  )
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5"
                    >
                      <FileText size={16} className="brand-text shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-[color:var(--ds-text)]">
                            {doc.name}
                          </span>
                          {doc.kind && (
                            <Badge variant="accent" className="shrink-0 text-[10px]">
                              {doc.kind}
                            </Badge>
                          )}
                          {doc.doc_type_label &&
                            doc.doc_type &&
                            doc.doc_type !== "legal_document" && (
                              <Badge variant="info" className="shrink-0 text-[10px]">
                                {doc.doc_type_label}
                              </Badge>
                            )}
                          {doc.privileged && (
                            <Badge variant="warning" className="shrink-0 text-[10px]">
                              {lang === "en" ? "Privileged" : "Privilegiert"}
                            </Badge>
                          )}
                          {(() => {
                            const ps = docProcessingStatus(doc);
                            const labelMap: Record<string, string> = {
                              confirmed: t("cases.detail_doc_status_confirmed"),
                              review_open: t("cases.detail_doc_status_review_open"),
                              analyzed: t("cases.detail_doc_status_analyzed"),
                              ocr_processing: t("cases.detail_doc_status_ocr_processing"),
                              ocr_needed: t("cases.detail_doc_status_ocr_needed"),
                              text_layer: t("cases.detail_doc_status_text_layer"),
                              uploaded: t("cases.detail_doc_status_uploaded"),
                              analysis_failed: "Analyse fehlgeschlagen",
                              analysis_retrying: "Analyse wird wiederholt",
                              analysis_permanently_failed: "Analyse dauerhaft fehlgeschlagen",
                              extraction_failed:
                                lang === "en" ? "Extraction failed" : "Extraktion fehlgeschlagen",
                              extraction_password:
                                lang === "en"
                                  ? "Password required — re-upload"
                                  : "Passwort nötig — neu hochladen",
                              extraction_unsupported:
                                lang === "en" ? "Unsupported format" : "Format nicht unterstützt",
                            };
                            return (
                              <span
                                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${ps.color}`}
                              >
                                {labelMap[ps.key] ?? ps.key}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-[color:var(--ds-text-muted)]">
                          {new Date(doc.uploadedAt).toLocaleDateString(
                            lang === "en" ? "en-GB" : "de-DE"
                          )}
                          {doc.size ? ` · ${(doc.size / 1024).toFixed(0)} KB` : ""}
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
                      {(doc.slug || doc.url) && (
                        <a
                          href={`/api/files/${(doc.slug || doc.url || "")
                            .split("/")
                            .map(encodeURIComponent)
                            .join("/")}`}
                          className="hover:brand-text px-2 py-1 text-[color:var(--ds-text-muted)] transition-colors"
                          title="Originaldatei herunterladen"
                          aria-label="Originaldatei herunterladen"
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        disabled={caseData?.status === "archived"}
                        onClick={async () => {
                          const docSlug = doc.slug || doc.url;
                          // P1.3: Tombstone the document page in the engine (authoritative action)
                          if (docSlug && isOnline()) {
                            try {
                              const docSlugPath = docSlug
                                .split("/")
                                .map(encodeURIComponent)
                                .join("/");
                              await csrfFetch(`/api/pages/${docSlugPath}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  frontmatter: {
                                    case_slug: null,
                                    assignment_status: "unassigned",
                                    tombstoned_at: new Date().toISOString(),
                                  },
                                  merge: true,
                                }),
                              });
                            } catch {
                              /* best effort */
                            }
                          }
                          // P0-1: Refresh from engine — single writer, no client-side documents mutation
                          await refreshCaseData();
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

        {activeTab === "deadlines_tasks" && (
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
                  disabled={caseData?.status === "archived"}
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
                  <PenTool size={16} className="text-blue-600" />
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
                  disabled={aiDetecting || !aiDetectText.trim() || caseData?.status === "archived"}
                >
                  {aiDetecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <PenTool size={14} />
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
                          disabled={caseData?.status === "archived"}
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

            {/* P0-2: KI-extrahierte Fristenvorschläge aus Dokumentanalyse */}
            {caseData.suggestedDeadlines && caseData.suggestedDeadlines.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  <Sparkles size={14} className="text-amber-500" />
                  {t("casesdetail.ai_deadlines")}
                </div>
                {caseData.suggestedDeadlines
                  .filter((sd) => !sd.confirmed)
                  .map((sd, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-[color:var(--ds-text)]">{sd.title}</div>
                        <div className="text-xs text-[color:var(--ds-text-muted)]">
                          {sd.due_date} · {sd.urgency}
                          {sd.source_quote && (
                            <span className="mt-0.5 block italic">
                              &bdquo;{sd.source_quote}&ldquo;
                            </span>
                          )}
                          <span className="mt-0.5 block">Quelle: {sd.source}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={caseData?.status === "archived"}
                          className="border-emerald-500/30 text-xs text-emerald-600 hover:bg-emerald-500/10"
                          onClick={async () => {
                            const entry: DeadlineEntry = {
                              id: `dl-${Date.now()}`,
                              title: sd.title,
                              date: sd.due_date,
                              due_date: sd.due_date,
                              type: "custom" as DeadlineEntry["type"],
                              status: "pending",
                              review_status: "unreviewed",
                            };
                            const updated = [...deadlinesList, entry];
                            setDeadlinesList(updated);
                            saveCaseUpdate({ deadlines: updated });
                            // Mark suggestion as confirmed
                            await confirmSuggestedDeadline(i, true);
                          }}
                        >
                          <Check size={12} /> {t("casesdetail.accept")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={caseData?.status === "archived"}
                          className="text-xs text-[color:var(--ds-text-muted)] hover:text-red-600"
                          onClick={() => confirmSuggestedDeadline(i, false)}
                        >
                          <X size={12} /> {t("casesdetail.reject")}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

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
                            disabled={caseData?.status === "archived"}
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
                            disabled={caseData?.status === "archived"}
                            onClick={() => {
                              setEditingDeadlineIndex(i);
                              deadlineForm.reset(dl as DeadlineFormData);
                            }}
                            className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                          >
                            {t("cases.detail_dl_edit_btn")}
                          </button>
                          <button
                            disabled={caseData?.status === "archived"}
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

        {activeTab === "deadlines_tasks" && (
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
                  disabled={caseData?.status === "archived"}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
                />
              </div>
              <Button
                variant="primary"
                disabled={caseData?.status === "archived"}
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
                      disabled={caseData?.status === "archived"}
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
                      disabled={caseData?.status === "archived"}
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

        {activeTab === "activity" && (
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
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("cases.detail_evidence_position_title")}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_evidence_position_desc")}
                  </p>
                </div>
                <Badge
                  variant={evidenceSourceCount > 0 ? "success" : "warning"}
                  className="shrink-0"
                >
                  {evidenceSourceCount} {t("cases.detail_evidence_sources")}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                  <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                    {caseData.documents.length}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_evidence_metric_documents")}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                  <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                    {evidenceDocuments.length}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_evidence_metric_relevant")}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                  <div className="text-xl font-semibold text-[color:var(--ds-text)]">
                    {evidenceList.length}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {t("cases.detail_evidence_metric_manual")}
                  </div>
                </div>
              </div>
            </div>

            {/* KI-extrahierte Belege aus auto_analysis */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600" />
                  <h3 className="text-sm font-semibold text-blue-600">
                    {t("cases.detail_evidence_ai_title")}
                  </h3>
                </div>
                <Badge
                  variant="default"
                  className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                >
                  {aiEvidenceCards.length}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {t("cases.detail_evidence_ai_desc")}
              </p>
              {aiEvidenceLoading && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                  <Loader2 size={14} className="animate-spin" />
                  {t("cases.detail_evidence_ai_loading")}
                </div>
              )}
              {!aiEvidenceLoading && aiEvidenceCards.length === 0 && (
                <p className="mt-3 text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_evidence_ai_empty")}
                </p>
              )}
              {!aiEvidenceLoading && aiEvidenceCards.length > 0 && (
                <div className="mt-3 space-y-3">
                  {aiEvidenceCards.map((card, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <FileText size={14} className="shrink-0 text-blue-600" />
                        <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {card.docName}
                        </span>
                        {card.documentType && (
                          <Badge variant="accent" className="shrink-0 text-[10px]">
                            {card.documentType}
                          </Badge>
                        )}
                        {card.docSlug && (
                          <Link
                            href={`/dashboard/brain/${encodeURIComponent(card.docSlug)}`}
                            className="ml-auto text-xs text-blue-600 hover:underline"
                          >
                            {t("cases.detail_doc_open")}
                          </Link>
                        )}
                      </div>
                      {card.keyFacts.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                            {t("cases.detail_evidence_ai_keyfacts")}
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {card.keyFacts.map((fact, j) => (
                              <li key={j} className="text-xs text-[color:var(--ds-text)]">
                                • {fact}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {card.parties.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                            {t("cases.detail_evidence_ai_parties")}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {card.parties.map((p, j) => (
                              <span
                                key={j}
                                className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text)]"
                              >
                                {p.name}
                                {p.role && ` (${p.role})`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {card.evidenceRefs.length > 0 && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                            {t("cases.detail_evidence_ai_refs")}
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {card.evidenceRefs.map((ref, j) => (
                              <li key={j} className="text-xs text-[color:var(--ds-text)]">
                                • {ref}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {card.citedStatutes.length > 0 && (
                        <div>
                          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                            {t("cases.detail_evidence_ai_statutes")}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {card.citedStatutes.map((s, j) => (
                              <span
                                key={j}
                                className="rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[10px] text-amber-700"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {evidenceDocuments.length > 0 && (
              <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("cases.detail_evidence_documents_title")}
                  </h3>
                  <button
                    onClick={() => setActiveTab("documents")}
                    className="brand-text text-xs font-medium hover:underline"
                  >
                    {t("cases.detail_evidence_open_documents")}
                  </button>
                </div>
                {evidenceDocuments.map((doc) => (
                  <div
                    key={doc.slug ?? doc.id}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
                  >
                    <FileText size={15} className="brand-text shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-[color:var(--ds-text)]">{doc.name}</div>
                      <div className="text-xs text-[color:var(--ds-text-muted)]">
                        {doc.kind ?? t("cases.detail_ev_type_document")} ·{" "}
                        {new Date(doc.uploadedAt).toLocaleDateString(
                          lang === "en" ? "en-GB" : "de-DE"
                        )}
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
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cases.detail_evidence_manual_title")}
                </h3>
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {t("cases.detail_evidence_manual_desc")}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={caseData?.status === "archived"}
                onClick={() => {
                  if (showEvidenceForm || editingEvidenceIndex !== null) {
                    setEditingEvidenceIndex(null);
                    evidenceForm.reset({
                      title: "",
                      type: "",
                      description: "",
                      source: "",
                      weight: 0.5,
                    });
                    setShowEvidenceForm(false);
                  } else {
                    setShowEvidenceForm(true);
                  }
                }}
                className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
              >
                <Plus size={13} />
                {showEvidenceForm || editingEvidenceIndex !== null
                  ? t("cases.detail_ev_cancel")
                  : t("cases.detail_evidence_manual_add")}
              </Button>
            </div>

            {/* Add/Edit Form */}
            {(showEvidenceForm || editingEvidenceIndex !== null) && (
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
                      <option value="E-Mail/Schriftverkehr">
                        {t("cases.detail_ev_type_email")}
                      </option>
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
                    {caseData.documents.length > 0 && (
                      <select
                        value={evidenceSourceMode}
                        onChange={(e) => {
                          const mode = e.target.value as "document" | "other";
                          setEvidenceSourceMode(mode);
                          if (mode === "document")
                            evidenceForm.setValue("source", "", { shouldDirty: true });
                        }}
                        className="mb-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                      >
                        <option value="document">
                          {t("cases.detail_ev_source_mode_document")}
                        </option>
                        <option value="other">{t("cases.detail_ev_source_mode_other")}</option>
                      </select>
                    )}
                    {evidenceSourceMode === "document" && caseData.documents.length > 0 ? (
                      <select
                        {...evidenceForm.register("source")}
                        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                      >
                        <option value="">{t("cases.detail_ev_source_select_ph")}</option>
                        {caseData.documents.map((doc) => (
                          <option key={doc.slug ?? doc.id} value={doc.name}>
                            {doc.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...evidenceForm.register("source")}
                        placeholder={t("cases.detail_ev_source_ph")}
                        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                      />
                    )}
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
                        setShowEvidenceForm(false);
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
            )}

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
                          disabled={caseData?.status === "archived"}
                          onClick={() => {
                            setEditingEvidenceIndex(i);
                            setShowEvidenceForm(true);
                            evidenceForm.reset(ev as EvidenceFormData);
                          }}
                          className="hover:brand-text px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors"
                        >
                          {t("cases.detail_ev_edit_btn")}
                        </button>
                        <button
                          disabled={caseData?.status === "archived"}
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

        {activeTab === "contradictions" && (
          <div className="max-w-3xl space-y-4">
            {/* Semantic contradiction probe findings */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-[color:var(--ds-text-secondary)]" />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {lang === "en" ? "Semantic Contradictions" : "Semantische Widersprüche"}
                  </h3>
                </div>
                {probeLastRun && (
                  <span className="text-xs text-[color:var(--ds-text-secondary)]">
                    {lang === "en" ? "Last probe:" : "Letzter Scan:"}{" "}
                    {new Date(probeLastRun).toLocaleDateString(lang === "en" ? "en-US" : "de-DE", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>

              {probeLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-[color:var(--ds-text-secondary)]">
                  <Loader2 size={14} className="animate-spin" />
                  {lang === "en"
                    ? "Loading contradiction findings..."
                    : "Widersprüche werden geladen..."}
                </div>
              ) : probeFindings.length > 0 ? (
                <div className="space-y-2">
                  {probeFindings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Badge
                          variant={
                            f.severity === "high"
                              ? "danger"
                              : f.severity === "medium"
                                ? "warning"
                                : f.severity === "low"
                                  ? "info"
                                  : "default"
                          }
                        >
                          {f.severity.toUpperCase()}
                        </Badge>
                        {f.axis && (
                          <span className="text-xs text-[color:var(--ds-text-secondary)]">
                            {f.axis}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div>
                          <span className="font-medium text-[color:var(--ds-text)]">A: </span>
                          <span className="text-[color:var(--ds-text-secondary)]">
                            {f.chunk_a.slice(0, 200)}
                            {f.chunk_a.length > 200 ? "..." : ""}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-[color:var(--ds-text)]">B: </span>
                          <span className="text-[color:var(--ds-text-secondary)]">
                            {f.chunk_b.slice(0, 200)}
                            {f.chunk_b.length > 200 ? "..." : ""}
                          </span>
                        </div>
                        {f.explanation && (
                          <div className="pt-1 text-xs text-[color:var(--ds-text-secondary)] italic">
                            {f.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : probeAvailable ? (
                <div className="py-4 text-center text-sm text-[color:var(--ds-text-secondary)]">
                  {lang === "en"
                    ? "No contradictions found in the latest probe."
                    : "Keine Widersprüche im letzten Scan gefunden."}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-[color:var(--ds-text-secondary)]">
                  {lang === "en"
                    ? "No contradiction probe has run yet. The nightly probe scans for semantic contradictions automatically."
                    : "Es wurde noch kein Widerspruchs-Scan durchgeführt. Der nächtliche Scan sucht automatisch nach semantischen Widersprüchen."}
                </div>
              )}
            </div>

            {/* Structured contradictions from frontmatter (field-level) */}
            {caseData && caseData.contradictions && caseData.contradictions.length > 0 && (
              <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks size={16} className="text-[color:var(--ds-text-secondary)]" />
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {lang === "en" ? "Field-Level Contradictions" : "Feld-Ebene Widersprüche"}
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={caseData.status === "archived"}
                    onClick={async () => {
                      try {
                        await api.legal.contradictionsCheck(caseData.slug);
                        window.location.reload();
                      } catch (err) {
                        setSaveError(
                          err instanceof Error ? err.message : "Widerspruchsprüfung fehlgeschlagen"
                        );
                      }
                    }}
                    className="text-xs"
                  >
                    <RefreshCw size={12} />
                    {lang === "en" ? "Re-check" : "Neu prüfen"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {caseData.contradictions.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Badge
                          variant={
                            c.severity === "high"
                              ? "danger"
                              : c.severity === "medium"
                                ? "warning"
                                : "info"
                          }
                        >
                          {c.severity.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs text-[color:var(--ds-text-secondary)]">
                          {c.field}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div>
                          <span className="font-medium text-[color:var(--ds-text)]">A: </span>
                          <span className="text-[color:var(--ds-text-secondary)]">{c.value_a}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[color:var(--ds-text)]">B: </span>
                          <span className="text-[color:var(--ds-text-secondary)]">{c.value_b}</span>
                        </div>
                        {c.description && (
                          <div className="pt-1 text-xs text-[color:var(--ds-text-secondary)] italic">
                            {c.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "billing" && (
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
                  disabled={caseData?.status === "archived"}
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
                            disabled={caseData?.status === "archived"}
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

        {activeTab === "billing" && (
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
                  disabled={caseData?.status === "archived"}
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
                            disabled={caseData?.status === "archived"}
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

        {activeTab === "activity" && (
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

        {activeTab === "pipeline" && (
          <div className="max-w-4xl space-y-4">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
                </div>
              }
            >
              <PipelinePanel
                caseSlug={caseData.slug}
                caseTitle={caseData.title}
                kanzleiName={caseData.ownLawyerName}
                recipientName={caseData.opponentName ?? undefined}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "strategy" && (
          <div className="max-w-3xl space-y-4">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
                </div>
              }
            >
              <MatterContextPanel caseSlug={caseData.slug} defaultOpen={true} />
            </Suspense>
            <div className="h-[500px]">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-muted)]" />
                  </div>
                }
              >
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
              </Suspense>
            </div>
          </div>
        )}

        {activeTab === "strategy" && (
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
                    disabled={caseData?.status === "archived"}
                    className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
                  />
                </div>
                <Button
                  onClick={handleQuery}
                  disabled={queryLoading || !query.trim() || caseData?.status === "archived"}
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
                <div className="flex items-center justify-end pt-1">
                  <RetrievalFeedbackButtons
                    query={query}
                    resultSlug={caseData?.slug ?? "ai-answer"}
                    resultTitle={t("cases.detail_query_ai_answer")}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showEmailDialog && (
        <EmailComposeDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          caseSlug={caseData?.slug}
          caseNumber={caseData?.caseNumber}
        />
      )}

      {showDocuSignDialog && (
        <DocuSignSendDialog
          open={showDocuSignDialog}
          onOpenChange={setShowDocuSignDialog}
          caseSlug={caseData?.slug}
          caseTitle={caseData?.title}
          documents={
            caseData?.documents?.map((d) => ({
              name: d.name || "Dokument",
              slug: d.slug || "",
              url: d.url,
            })) ?? []
          }
        />
      )}
    </div>
  );
}
