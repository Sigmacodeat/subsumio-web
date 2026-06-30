"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useLang } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useMe } from "@/lib/queries/auth";
import { useRealtime } from "@/lib/realtime";
import { usePresence } from "@/lib/use-presence";
import { useMutationQueue } from "@/lib/use-mutation";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { isOnline, enqueueMutation, enqueueFileUpload, getCache } from "@/lib/offline-store";
import { maxUploadSizeFor } from "@/lib/upload-validation";
import { isSupportedUploadName, UPLOAD_FOLDER_ACCEPT_RE } from "@/lib/upload-formats";
import {
  uploadFiles as presignedUploadFiles,
  type UploadProgress as PresignedProgress,
} from "@/lib/presigned-upload";
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
  expenseFormSchema,
  type DeadlineFormData,
  type EvidenceFormData,
  type ExpenseFormData,
} from "@/lib/schemas/case-detail";
import {
  checkInternalConflict,
  type ContactRef,
  type ConflictCheckResult,
} from "@/lib/contact-conflict";
import type { BrainPage, SearchResult } from "@/lib/types";
import type { DashboardKey } from "@/content/dashboard";
import {
  caseFrontmatter,
  type EvidenceEntry,
  type TaskEntry,
  type TimeEntry,
  type TimelineEntry,
  type DocumentEntry,
  type DeadlineEntry,
  type ExpenseEntry,
  type AuditLogEntry,
} from "@/lib/legal-types";
import { useMatterData } from "@/lib/matter-data-context";
import {
  type CaseDetail,
  type SuggestedDeadline,
  type SuggestedParty,
  type ContradictionFinding,
  type UploadQueueItem,
  type AiEvidenceCard,
  type ProbeFinding,
  type CaseContact,
  parseCaseDetail,
  mergeCaseDeadlines,
} from "@/lib/matter-detail-types";

// ── Status Config ─────────────────────────────────────────────────────

import { Clock, PauseCircle, CheckCircle2, XCircle, AlertTriangle, Archive } from "lucide-react";
import type { StatusColor } from "@/lib/status-colors";

export const STATUS_CONFIG: Record<
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

// ── Context Type ──────────────────────────────────────────────────────

interface MatterDetailContextValue {
  // Core data
  slug: string;
  caseData: CaseDetail | null;
  loading: boolean;
  setCaseData: (data: CaseDetail | null) => void;

  // Tab navigation
  activeTab: string;
  navigateToTab: (tab: string) => void;

  // User info
  userRole: string;
  currentUserName: string;
  currentUserId: string;

  // Tasks
  tasks: Array<{ id: string; text: string; done: boolean; createdAt: string }>;
  setTasks: React.Dispatch<
    React.SetStateAction<Array<{ id: string; text: string; done: boolean; createdAt: string }>>
  >;
  newTask: string;
  setNewTask: (v: string) => void;

  // Time entries
  timeEntries: TimeEntry[];
  setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;

  // Expenses
  expensesList: ExpenseEntry[];
  setExpensesList: React.Dispatch<React.SetStateAction<ExpenseEntry[]>>;

  // Evidence
  evidenceList: EvidenceEntry[];
  setEvidenceList: React.Dispatch<React.SetStateAction<EvidenceEntry[]>>;
  editingEvidenceIndex: number | null;
  setEditingEvidenceIndex: (v: number | null) => void;
  showEvidenceForm: boolean;
  setShowEvidenceForm: (v: boolean) => void;
  evidenceSourceMode: "document" | "other";
  setEvidenceSourceMode: (v: "document" | "other") => void;

  // Deadlines
  deadlinesList: DeadlineEntry[];
  setDeadlinesList: React.Dispatch<React.SetStateAction<DeadlineEntry[]>>;
  editingDeadlineIndex: number | null;
  setEditingDeadlineIndex: (v: number | null) => void;
  deadlineRuleKey: string;
  setDeadlineRuleKey: (v: string) => void;
  deadlineStartDate: string;
  setDeadlineStartDate: (v: string) => void;

  // AI detect
  aiDetectText: string;
  setAiDetectText: (v: string) => void;
  aiDetecting: boolean;
  setAiDetecting: (v: boolean) => void;
  aiDetectedDeadlines: Array<{ title: string; date: string; type: string; confidence: number }>;
  setAiDetectedDeadlines: React.Dispatch<
    React.SetStateAction<Array<{ title: string; date: string; type: string; confidence: number }>>
  >;

  // AI evidence
  aiEvidenceCards: AiEvidenceCard[];
  setAiEvidenceCards: React.Dispatch<React.SetStateAction<AiEvidenceCard[]>>;
  aiEvidenceLoading: boolean;

  // Strategy
  strategyLoading: boolean;
  setStrategyLoading: (v: boolean) => void;

  // Contacts
  contacts: CaseContact[];
  setContactsList: React.Dispatch<React.SetStateAction<CaseContact[]>>;
  contactsLoading: boolean;
  contactDialogOpen: boolean;
  setContactDialogOpen: (v: boolean) => void;
  contactDialogRole: "client" | "opponent" | "court" | "lawyer" | "other";
  setContactDialogRole: (v: "client" | "opponent" | "court" | "lawyer" | "other") => void;
  contactDialogName: string | undefined;
  setContactDialogName: (v: string | undefined) => void;
  pendingSuggestedPartyIndex: number | null;
  setPendingSuggestedPartyIndex: (v: number | null) => void;
  contactConflict: ConflictCheckResult | null;

  // Upload
  uploadQueue: UploadQueueItem[];
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadQueueItem[]>>;
  documentPassword: string;
  setDocumentPassword: (v: string) => void;
  uploadError: string | null;
  setUploadError: (v: string | null) => void;
  folderApi: boolean;
  scanningFolder: boolean;
  handleMultiUpload: (files: File[]) => Promise<void>;
  pickFolderForCase: () => Promise<void>;

  // Documents
  docTypeFilter: string;
  setDocTypeFilter: (v: string) => void;
  showLinkDialog: boolean;
  setShowLinkDialog: (v: boolean) => void;
  linkSearchQuery: string;
  setLinkSearchQuery: (v: string) => void;
  linkSearchResults: SearchResult[];
  setLinkSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>;
  linkSearching: boolean;
  setLinkSearching: (v: boolean) => void;

  // Query / AI
  query: string;
  setQuery: (v: string) => void;
  queryLoading: boolean;
  queryResult: string | null;
  handleQuery: () => Promise<void>;
  copied: boolean;
  setCopied: (v: boolean) => void;
  copyToClipboard: (text: string) => void;

  // Errors / warnings
  saveError: string | null;
  setSaveError: (v: string | null) => void;
  conflictWarning: string | null;
  setConflictWarning: (v: string | null) => void;

  // Portal
  portalUrl: string | null;
  setPortalUrl: (v: string | null) => void;
  generatingPortal: boolean;
  setGeneratingPortal: (v: boolean) => void;

  // Probe
  probeFindings: ProbeFinding[];
  setProbeFindings: React.Dispatch<React.SetStateAction<ProbeFinding[]>>;
  probeLoading: boolean;
  probeLastRun: string | null;
  probeAvailable: boolean;

  // Status dialog
  showStatusDialog: boolean;
  setShowStatusDialog: (v: boolean) => void;
  showEmailDialog: boolean;
  setShowEmailDialog: (v: boolean) => void;
  showDocuSignDialog: boolean;
  setShowDocuSignDialog: (v: boolean) => void;
  pendingStatus: CaseStatus | null;
  setPendingStatus: (v: CaseStatus | null) => void;
  statusError: string | null;
  setStatusError: (v: string | null) => void;

  // Restore
  restoring: boolean;
  handleRestore: (targetStatus?: CaseStatus) => Promise<void>;

  // Forms
  deadlineForm: ReturnType<typeof useForm<DeadlineFormData>>;
  evidenceForm: ReturnType<typeof useForm<EvidenceFormData>>;
  expenseForm: ReturnType<typeof useForm<ExpenseFormData>>;
  onDeadlineSubmit: (data: DeadlineFormData) => void;
  onEvidenceSubmit: (data: EvidenceFormData) => void;
  onExpenseSubmit: (data: ExpenseFormData) => void;

  // Core handlers
  saveCaseUpdate: (updates: Partial<CaseDetail>) => Promise<void>;
  refreshCaseData: () => Promise<void>;
  confirmSuggestedDeadline: (index: number, confirmed: boolean) => Promise<void>;
  confirmSuggestedParty: (index: number, confirmed: boolean) => Promise<void>;

  // Utilities
  docProcessingStatus: (doc: {
    extraction_status?: string;
    extraction_error_code?: string;
    ocr_status?: string;
    extraction_unverified?: boolean;
    analysis_status?: string;
  }) => { key: string; color: string };
  formatUploadBytes: (bytes: number) => string;
  formatUploadEta: (seconds?: number) => string;
  uploadStatusLabel: (
    status: "queued" | "preparing" | "uploading" | "processing" | "done" | "error"
  ) => string;

  // Computed values
  activeDeadlines: DeadlineEntry[];
  criticalDeadlineCount: number;
  openTaskCount: number;
  documentReviewCount: number;
  unbilledExpenses: number;
  conflictNeedsReview: boolean;
  uploadStats: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    totalBytes: number;
    uploadedBytes: number;
  };
  uploadOverallProgress: number;
  evidenceSourceCount: number;
  evidenceDocuments: DocumentEntry[];
  activeUsers: ReturnType<typeof usePresence>;
  offlinePendingCount: number;
  offlineSyncing: boolean;
}

const MatterDetailContext = createContext<MatterDetailContextValue | null>(null);

export function useMatterDetail(): MatterDetailContextValue {
  const ctx = useContext(MatterDetailContext);
  if (!ctx) throw new Error("useMatterDetail must be used within MatterDetailProvider");
  return ctx;
}

export function MatterDetailProvider({ children }: { children: React.ReactNode }) {
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug.join("/") : (params.slug as string);
  const router = useRouter();
  const { activeTab: contextTab, caseSlug: contextCaseSlug } = useMatterData();
  const { pendingCount: offlinePendingCount, syncing: offlineSyncing } = useMutationQueue();

  const activeTab: string = contextTab === "deadlines" ? "deadlines_tasks" : contextTab;

  function navigateToTab(tab: string) {
    const mapped = tab === "deadlines_tasks" ? "deadlines" : tab;
    const encoded = contextCaseSlug.split("/").map(encodeURIComponent).join("/");
    const url =
      mapped === "overview"
        ? `/dashboard/cases/${encoded}`
        : `/dashboard/cases/${encoded}/${mapped}`;
    router.push(url);
  }

  // ── State ───────────────────────────────────────────────────────────

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentPassword, setDocumentPassword] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState<SearchResult[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [probeFindings, setProbeFindings] = useState<ProbeFinding[]>([]);
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

  const [folderApi, setFolderApi] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  useEffect(() => {
    setFolderApi(typeof window !== "undefined" && "showDirectoryPicker" in window);
  }, []);

  const [tasks, setTasks] = useState<
    Array<{ id: string; text: string; done: boolean; createdAt: string }>
  >([]);
  const [newTask, setNewTask] = useState("");
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [expensesList, setExpensesList] = useState<ExpenseEntry[]>([]);

  const [contacts, setContacts] = useState<CaseContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogRole, setContactDialogRole] = useState<
    "client" | "opponent" | "court" | "lawyer" | "other"
  >("client");
  const [contactDialogName, setContactDialogName] = useState<string | undefined>(undefined);
  const [pendingSuggestedPartyIndex, setPendingSuggestedPartyIndex] = useState<number | null>(null);
  const [contactConflict, setContactConflict] = useState<ConflictCheckResult | null>(null);

  const [restoring, setRestoring] = useState(false);

  const [evidenceList, setEvidenceList] = useState<EvidenceEntry[]>([]);
  const [editingEvidenceIndex, setEditingEvidenceIndex] = useState<number | null>(null);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);

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

  const [aiEvidenceCards, setAiEvidenceCards] = useState<AiEvidenceCard[]>([]);
  const [aiEvidenceLoading, setAiEvidenceLoading] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);

  // ── Forms ───────────────────────────────────────────────────────────

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
  const [evidenceSourceMode, setEvidenceSourceMode] = useState<"document" | "other">("other");
  const expenseForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { description: "", amount: "", billable: true },
  });

  useUnsavedChanges(
    deadlineForm.formState.isDirty ||
      evidenceForm.formState.isDirty ||
      expenseForm.formState.isDirty
  );

  // ── User info ───────────────────────────────────────────────────────

  const meQuery = useMe();
  useEffect(() => {
    if (meQuery.data?.user?.role) setUserRole(meQuery.data.user.role);
    if (meQuery.data?.user?.name) setCurrentUserName(meQuery.data.user.name);
    if (meQuery.data?.user?.id) setCurrentUserId(meQuery.data.user.id);
  }, [meQuery.data]);

  const presenceUser = useMemo(
    () =>
      meQuery.data?.user
        ? { id: meQuery.data.user.id, email: meQuery.data.user.email || "" }
        : null,
    [meQuery.data?.user]
  );
  const activeUsers = usePresence(slug, presenceUser);

  // ── Quick create event listener ─────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      if (detail?.caseSlug && detail.caseSlug !== contextCaseSlug) return;
      const eventType = e.type;
      if (eventType === "subsumio:create-deadline" || eventType === "subsumio:create-task") {
        navigateToTab("deadlines_tasks");
      } else if (eventType === "subsumio:upload-document") {
        navigateToTab("documents");
      } else if (eventType === "subsumio:log-time") {
        navigateToTab("billing");
      } else if (eventType === "subsumio:create-contact") {
        navigateToTab("contacts");
      } else if (eventType === "subsumio:create-communication") {
        navigateToTab("communications");
      }
    };
    const events = [
      "subsumio:create-deadline",
      "subsumio:create-task",
      "subsumio:upload-document",
      "subsumio:log-time",
      "subsumio:create-contact",
      "subsumio:create-communication",
    ];
    events.forEach((evt) => window.addEventListener(evt, handler));
    return () => events.forEach((evt) => window.removeEventListener(evt, handler));
  }, [contextCaseSlug]);

  // ── Data loading ────────────────────────────────────────────────────

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
          // cache miss
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
  }, [slug]);

  // ── Refresh ─────────────────────────────────────────────────────────

  const refreshCaseData = useCallback(async () => {
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
      // best effort
    }
  }, [caseData, slug]);

  // ── Confirm suggested deadline ──────────────────────────────────────

  const confirmSuggestedDeadline = useCallback(
    async (index: number, confirmed: boolean) => {
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
          body: JSON.stringify({ frontmatter: { suggested_deadlines: updated }, merge: true }),
        });
      } catch {
        /* best effort */
      }
    },
    [caseData, t]
  );

  // ── Confirm suggested party ─────────────────────────────────────────

  const confirmSuggestedParty = useCallback(
    async (index: number, confirmed: boolean) => {
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
          body: JSON.stringify({ frontmatter: { suggested_parties: updated }, merge: true }),
        });
      } catch {
        /* best effort */
      }
    },
    [caseData, t]
  );

  // ── Contact conflict check ──────────────────────────────────────────

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

  // ── Contacts refresh on focus ───────────────────────────────────────

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
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ── Live sync polling ───────────────────────────────────────────────

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
        /* ignore */
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData?.version, slug]);

  // ── Realtime ────────────────────────────────────────────────────────

  useRealtime("case.deleted", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) void refreshCaseData();
  });
  useRealtime("case.restored", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) void refreshCaseData();
  });
  useRealtime("case.updated", (payload) => {
    const p = payload as { slug?: string };
    if (p?.slug === slug) void refreshCaseData();
  });

  // ── AI evidence fetch ───────────────────────────────────────────────

  useEffect(() => {
    if (!caseData || activeTab !== "evidence") return;
    let cancelled = false;
    (async () => {
      const docsWithSlugs = caseData.documents.filter((d) => d.slug || d.url);
      if (docsWithSlugs.length === 0) return;
      setAiEvidenceLoading(true);
      try {
        const cards: AiEvidenceCard[] = [];
        const slugsToFetch = docsWithSlugs.slice(0, 20).map((d) => d.slug || d.url!);
        const pagesMap = await api.brain.getPages(slugsToFetch);
        for (const doc of docsWithSlugs.slice(0, 20)) {
          const docSlug = doc.slug || doc.url!;
          const page = pagesMap[docSlug];
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
                .map((p) => ({ name: String(p.name ?? p.party ?? ""), role: String(p.role ?? "") }))
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
              docSlug,
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

  // ── Probe findings ──────────────────────────────────────────────────

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

  // ── saveCaseUpdate ──────────────────────────────────────────────────

  const saveCaseUpdate = useCallback(
    async (updates: Partial<CaseDetail>) => {
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
                        : changedFields.includes("clientSlug") ||
                            changedFields.includes("clientName")
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
          evidence: updates.evidence ?? evidenceList,
          deadlines: updates.deadlines ?? deadlinesList,
          portal_enabled: updates.portalEnabled ?? caseData.portalEnabled,
          portal_note: updates.portalNote ?? caseData.portalNote,
          audit_log: newAudit,
        };
        if (isOnline()) {
          const slugPath = caseData.slug.split("/").map(encodeURIComponent).join("/");
          const res = await csrfFetch(`/api/pages/${slugPath}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "If-Match": String(caseData.version || 0),
            },
            body: JSON.stringify({ title: caseData.title, content: caseData.facts, frontmatter }),
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
        setSaveError(
          e instanceof Error
            ? `${t("casesdetail.error_save")}: ${e.message}`
            : t("casesdetail.error_save")
        );
      }
    },
    [
      caseData,
      conflictWarning,
      currentUserName,
      tasks,
      timeEntries,
      expensesList,
      evidenceList,
      deadlinesList,
      t,
      refreshCaseData,
    ]
  );

  // ── handleMultiUpload ───────────────────────────────────────────────

  const handleMultiUpload = useCallback(
    async (files: File[]) => {
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
            `${file.name} ${t("casesdetail.upload.err_too_large")} ${formatUploadBytesLocal(maxSize)}.`
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
          setTimeout(() => {
            setUploadQueue((prev) => prev.filter((q) => q.id !== qId));
          }, 2000);
        }
      }
      await refreshCaseData();
      setDocumentPassword("");
    },
    [caseData, documentPassword, t, refreshCaseData]
  );

  // ── pickFolderForCase ───────────────────────────────────────────────

  const pickFolderForCase = useCallback(async () => {
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
      /* user dismissed */
    } finally {
      setScanningFolder(false);
    }
  }, [caseData, handleMultiUpload]);

  // ── handleRestore ───────────────────────────────────────────────────

  const handleRestore = useCallback(
    async (targetStatus: CaseStatus = "open") => {
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
          void refreshCaseData();
        } else if (res.status === 403) {
          addToast({
            type: "error",
            title: lang === "en" ? "Access denied" : "Zugriff verweigert",
            description:
              lang === "en"
                ? "You don't have permission to restore this case."
                : "Du hast keine Berechtigung, diese Akte wiederherzustellen.",
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
    },
    [caseData, confirm, lang, t, addToast, refreshCaseData]
  );

  // ── handleQuery ─────────────────────────────────────────────────────

  const handleQuery = useCallback(async () => {
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
        { mode: "tokenmax", queryMode: "deep_matter", caseSlug: caseData.slug }
      );
      setQueryResult(res.answer);
    } catch {
      setQueryResult(t("cases.detail_query_error"));
    } finally {
      setQueryLoading(false);
    }
  }, [query, caseData, t]);

  // ── copyToClipboard ─────────────────────────────────────────────────

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // ── Form submit handlers ────────────────────────────────────────────

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
      void saveCaseUpdate({ deadlines: updated });
    },
    [editingDeadlineIndex, deadlinesList, deadlineForm, saveCaseUpdate]
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
      setShowEvidenceForm(false);
      void saveCaseUpdate({ evidence: updated });
    },
    [editingEvidenceIndex, evidenceList, evidenceForm, saveCaseUpdate]
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
        void saveCaseUpdate({ expenses: updated });
      }
    },
    [expensesList, expenseForm, saveCaseUpdate]
  );

  // ── Utility functions ───────────────────────────────────────────────

  function docProcessingStatus(doc: {
    extraction_status?: string;
    extraction_error_code?: string;
    ocr_status?: string;
    extraction_unverified?: boolean;
    analysis_status?: string;
  }) {
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

  function formatUploadBytesLocal(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatUploadBytes(bytes: number): string {
    return formatUploadBytesLocal(bytes);
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

  // ── Computed values ─────────────────────────────────────────────────

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
  const documentReviewCount =
    caseData?.documents.filter((doc) => {
      const status = docProcessingStatus(doc).key;
      return status === "review_open" || status === "ocr_needed" || status === "ocr_processing";
    }).length ?? 0;
  const unbilledExpenses = expensesList
    .filter((entry) => entry.billable !== false && !entry.billed)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const conflictNeedsReview =
    Boolean(contactConflict) || caseData?.conflictStatus === "conflict_pending";
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

  const evidenceDocumentPattern =
    /beweis|evidence|gutachten|expert|vertrag|contract|korrespondenz|email|e-mail|foto|photo|video|zeug/i;
  const evidenceDocuments =
    caseData?.documents.filter((doc) =>
      evidenceDocumentPattern.test(`${doc.kind ?? ""} ${doc.name}`)
    ) ?? [];
  const evidenceSourceCount = evidenceDocuments.length + evidenceList.length;

  // ── Context value ───────────────────────────────────────────────────

  const value: MatterDetailContextValue = {
    slug,
    caseData,
    loading,
    setCaseData,
    activeTab,
    navigateToTab,
    userRole,
    currentUserName,
    currentUserId,
    tasks,
    setTasks,
    newTask,
    setNewTask,
    timeEntries,
    setTimeEntries,
    expensesList,
    setExpensesList,
    evidenceList,
    setEvidenceList,
    editingEvidenceIndex,
    setEditingEvidenceIndex,
    showEvidenceForm,
    setShowEvidenceForm,
    evidenceSourceMode,
    setEvidenceSourceMode,
    deadlinesList,
    setDeadlinesList,
    editingDeadlineIndex,
    setEditingDeadlineIndex,
    deadlineRuleKey,
    setDeadlineRuleKey,
    deadlineStartDate,
    setDeadlineStartDate,
    aiDetectText,
    setAiDetectText,
    aiDetecting,
    setAiDetecting,
    aiDetectedDeadlines,
    setAiDetectedDeadlines,
    aiEvidenceCards,
    setAiEvidenceCards,
    aiEvidenceLoading,
    strategyLoading,
    setStrategyLoading,
    contacts,
    setContactsList: setContacts,
    contactsLoading,
    contactDialogOpen,
    setContactDialogOpen,
    contactDialogRole,
    setContactDialogRole,
    contactDialogName,
    setContactDialogName,
    pendingSuggestedPartyIndex,
    setPendingSuggestedPartyIndex,
    contactConflict,
    uploadQueue,
    setUploadQueue,
    documentPassword,
    setDocumentPassword,
    uploadError,
    setUploadError,
    folderApi,
    scanningFolder,
    handleMultiUpload,
    pickFolderForCase,
    docTypeFilter,
    setDocTypeFilter,
    showLinkDialog,
    setShowLinkDialog,
    linkSearchQuery,
    setLinkSearchQuery,
    linkSearchResults,
    setLinkSearchResults,
    linkSearching,
    setLinkSearching,
    query,
    setQuery,
    queryLoading,
    queryResult,
    handleQuery,
    copied,
    setCopied,
    copyToClipboard,
    saveError,
    setSaveError,
    conflictWarning,
    setConflictWarning,
    portalUrl,
    setPortalUrl,
    generatingPortal,
    setGeneratingPortal,
    probeFindings,
    setProbeFindings,
    probeLoading,
    probeLastRun,
    probeAvailable,
    showStatusDialog,
    setShowStatusDialog,
    showEmailDialog,
    setShowEmailDialog,
    showDocuSignDialog,
    setShowDocuSignDialog,
    pendingStatus,
    setPendingStatus,
    statusError,
    setStatusError,
    restoring,
    handleRestore,
    deadlineForm,
    evidenceForm,
    expenseForm,
    onDeadlineSubmit,
    onEvidenceSubmit,
    onExpenseSubmit,
    saveCaseUpdate,
    refreshCaseData,
    confirmSuggestedDeadline,
    confirmSuggestedParty,
    docProcessingStatus,
    formatUploadBytes,
    formatUploadEta,
    uploadStatusLabel,
    activeDeadlines,
    criticalDeadlineCount,
    openTaskCount,
    documentReviewCount,
    unbilledExpenses,
    conflictNeedsReview,
    uploadStats,
    uploadOverallProgress,
    evidenceSourceCount,
    evidenceDocuments,
    activeUsers,
    offlinePendingCount,
    offlineSyncing,
  };

  return <MatterDetailContext.Provider value={value}>{children}</MatterDetailContext.Provider>;
}
