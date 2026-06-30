import type {
  EvidenceEntry,
  StrategyInfo,
  TaskEntry,
  TimeEntry,
  TimelineEntry,
  DocumentEntry,
  DeadlineEntry,
  ExpenseEntry,
  AuditLogEntry,
} from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";

export interface SuggestedDeadline {
  title: string;
  due_date: string;
  urgency: string;
  source: string;
  source_quote: string;
  confirmed: boolean;
}

export interface SuggestedParty {
  name: string;
  role: string;
  source: string;
  confirmed: boolean;
}

export interface ContradictionFinding {
  doc_a_slug: string;
  doc_b_slug: string;
  field: string;
  value_a: string;
  value_b: string;
  severity: "high" | "medium" | "low";
  description: string;
}

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

export interface UploadQueueItem {
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
}

export interface AiEvidenceCard {
  docName: string;
  docSlug: string;
  documentType: string;
  keyFacts: string[];
  parties: Array<{ name: string; role: string }>;
  evidenceRefs: string[];
  citedStatutes: string[];
}

export interface ProbeFinding {
  chunk_a: string;
  chunk_b: string;
  severity: "high" | "medium" | "low" | "info";
  axis: string | null;
  explanation: string;
  slug: string;
}

export interface CaseContact {
  slug: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
}

export function parseCaseDetail(page: BrainPage): CaseDetail {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    title: page.title,
    caseNumber: (fm.case_number as string) || page.slug,
    status: (fm.status as string) || "open",
    legalArea: (fm.legal_area as string) || "",
    subArea: (fm.sub_area as string) || undefined,
    priority: (fm.priority as string) || "medium",
    opponentId: (fm.opponent_id as string) || undefined,
    opponentName: (fm.opponent_name as string) || undefined,
    ownLawyerId: (fm.own_lawyer_id as string) || undefined,
    ownLawyerName: (fm.own_lawyer_name as string) || undefined,
    ownLawyerSlug: (fm.own_lawyer_slug as string) || undefined,
    courtId: (fm.court_id as string) || undefined,
    courtName: (fm.court_name as string) || undefined,
    clientId: (fm.client_id as string) || undefined,
    clientName: (fm.client_name as string) || undefined,
    clientSlug: (fm.client_slug as string) || undefined,
    opponentSlugs: (fm.opponent_slugs as string[]) || undefined,
    courtSlug: (fm.court_slug as string) || undefined,
    conflictStatus:
      typeof fm.conflict_status === "string" ? (fm.conflict_status as string) : undefined,
    facts: page.content || "",
    claims: (fm.claims as string[]) || [],
    defenses: (fm.defenses as string[]) || [],
    evidence: (fm.evidence as EvidenceEntry[]) || [],
    strategy: (fm.strategy as StrategyInfo) || undefined,
    outcome: (fm.outcome as Record<string, unknown>) || undefined,
    estimatedValue:
      (fm.estimated_value as { min: number; max: number; currency: string }) || undefined,
    tags: (fm.tags as string[]) || [],
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    tasks: (fm.tasks as TaskEntry[]) || [],
    timeEntries: (fm.time_entries as TimeEntry[]) || [],
    expenses: (fm.expenses as ExpenseEntry[]) || [],
    timelineEvents: [
      ...((fm.timeline as TimelineEntry[]) || []),
      ...((fm.timeline_events as TimelineEntry[]) || []),
    ],
    documents: (fm.documents as DocumentEntry[]) || [],
    deadlines: (fm.deadlines as DeadlineEntry[]) || [],
    suggestedDeadlines: (fm.suggested_deadlines as SuggestedDeadline[]) || [],
    suggestedParties: (fm.suggested_parties as SuggestedParty[]) || [],
    contradictions: Array.isArray(fm.contradictions)
      ? (fm.contradictions as ContradictionFinding[])
      : [],
    portalEnabled: (fm.portal_enabled as boolean) || false,
    portalNote: (fm.portal_note as string) || undefined,
    auditLog: (fm.audit_log as AuditLogEntry[]) || [],
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

export function mergeCaseDeadlines(detail: CaseDetail, deadlinePages: BrainPage[] = []) {
  const base =
    detail.deadlines.length > 0
      ? detail.deadlines
      : detail.timelineEvents.map((entry) => {
          const d = entry as Record<string, unknown>;
          return {
            id: String(d.id ?? d.title ?? ""),
            title: String(d.title ?? d.event ?? ""),
            date: String(d.date ?? d.due_date ?? ""),
            due_date: String(d.due_date ?? d.date ?? ""),
            status: String(d.status ?? "pending"),
            type: String(d.type ?? "deadline"),
            source: String(d.source ?? "timeline"),
          } as DeadlineEntry;
        });
  const linked = deadlinePages
    .map((page) => standaloneDeadlineForCase(page, detail))
    .filter((deadline): deadline is DeadlineEntry => Boolean(deadline));
  const merged = new Map<string, DeadlineEntry>();
  [...base, ...linked].forEach((deadline) => {
    merged.set(normalizeDeadlineKey(deadline), deadline);
  });
  return [...merged.values()];
}
