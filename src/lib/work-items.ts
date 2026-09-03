import type { BrainPage } from "@/lib/types";

export type WorkItemKind =
  | "communication"
  | "document_review"
  | "case_analysis"
  | "approval"
  | "deadline"
  | "appointment";

/**
 * Document lifecycle stages — mapped 1:1 to the real frontmatter fields
 * stamped by the upload route (`server/src/commands/web-api.ts`) and the
 * `extract-document` minion handler.
 *
 *   received   → upload request received, raw bytes not yet confirmed persisted
 *   stored     → `original_persisted: true`, extraction not yet started
 *   ocr        → `extraction_status: "processing"` (async extract job running)
 *   embedded   → `extraction_status: "ready"` AND `embedding_status: "ready"` (terminal)
 *   embedding  → `extraction_status: "ready"` AND `embedding_status: "pending"` (backfill)
 *   failed     → `extraction_status: "failed"` (terminal, needs retry/fix)
 */
export type DocumentPipelineStage =
  | "received"
  | "stored"
  | "ocr"
  | "embedding"
  | "embedded"
  | "failed";

/**
 * Case-level legal pipeline stages — mapped to the `status` field on
 * `pipeline_state` pages (`server/src/core/minions/handlers/legal-pipeline.ts`).
 *
 *   running              → pipeline actively processing layers 1–7
 *   awaiting_review      → paused after Layer 2, attorney must confirm entities
 *   needs_human_review   → ensemble critic flagged, attorney must review
 *   completed            → terminal (published)
 *   completed_with_warnings → terminal (published, but with caveats)
 *   revised              → terminal (revised after critic feedback)
 *   failed               → pipeline broke, needs retry
 */
export type CaseAnalysisStage =
  | "running"
  | "awaiting_review"
  | "needs_human_review"
  | "completed"
  | "completed_with_warnings"
  | "revised"
  | "failed";

export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  title: string;
  summary: string;
  caseSlug?: string;
  sourceSlug: string;
  priority: "critical" | "high" | "medium" | "low";
  status: string;
  pipelineStage?: DocumentPipelineStage | CaseAnalysisStage;
  /** Layer number (1–7) for case_analysis items from pipeline_state pages. */
  currentLayer?: number;
  error?: string;
  dueAt?: string;
  createdAt: string;
}

function front(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function priority(value: unknown): WorkItem["priority"] {
  if (value === "critical" || value === "high" || value === "medium") return value;
  return "low";
}

/**
 * Map a document page's real frontmatter to a lifecycle stage.
 * Uses only fields actually stamped by the upload route + extract-document handler:
 *   - `original_persisted` (boolean)
 *   - `extraction_status` ("processing" | "ready" | "failed")
 *   - `embedding_status` ("pending" | "ready")
 */
function documentStage(fm: Record<string, unknown>): DocumentPipelineStage {
  const extraction = stringValue(fm.extraction_status);
  if (extraction === "failed") return "failed";
  if (extraction === "processing") return "ocr";
  if (extraction === "ready") {
    const embedding = stringValue(fm.embedding_status);
    if (embedding === "pending") return "embedding";
    return "embedded";
  }
  if (fm.original_persisted === true) return "stored";
  return "received";
}

/**
 * A document is actionable (worth surfacing as a work item) when it has NOT
 * reached the terminal "embedded" stage. Failed documents are actionable
 * (need retry/fix). Documents still in OCR/embedding/backfill are in-flight.
 */
function isDocumentActionable(stage: DocumentPipelineStage): boolean {
  return stage !== "embedded";
}

function itemFromPage(page: BrainPage, kind: WorkItemKind): WorkItem {
  const fm = front(page);
  const createdAt = stringValue(fm.created_at) ?? page.created_at ?? "";
  const dueAt = stringValue(fm.due_date) ?? stringValue(fm.dueDate) ?? stringValue(fm.date);
  const isDocument = kind === "document_review";
  const stage = isDocument ? documentStage(fm) : undefined;
  return {
    id: page.slug,
    kind,
    title: page.title || "Vorgang",
    summary: page.content?.slice(0, 240) || stringValue(fm.summary) || page.title || "",
    caseSlug: stringValue(fm.case_slug),
    sourceSlug: page.slug,
    priority: priority(fm.priority ?? fm.urgency),
    status: stringValue(fm.status) ?? "open",
    pipelineStage: stage,
    error: stringValue(fm.extraction_error) ?? stringValue(fm.extraction_error_code),
    dueAt,
    createdAt,
  };
}

/**
 * Map a `pipeline_state` page to a case-analysis stage + priority.
 * The `status` field on pipeline_state pages is the single source of truth
 * for case-level analysis progress.
 */
function caseAnalysisStage(fm: Record<string, unknown>): CaseAnalysisStage | undefined {
  const status = stringValue(fm.status);
  if (!status) return undefined;
  const valid: CaseAnalysisStage[] = [
    "running",
    "awaiting_review",
    "needs_human_review",
    "completed",
    "completed_with_warnings",
    "revised",
    "failed",
  ];
  return valid.includes(status as CaseAnalysisStage) ? (status as CaseAnalysisStage) : undefined;
}

function caseAnalysisPriority(stage: CaseAnalysisStage): WorkItem["priority"] {
  switch (stage) {
    case "failed":
      return "critical";
    case "awaiting_review":
    case "needs_human_review":
      return "high";
    case "running":
      return "low";
    default:
      return "low";
  }
}

function itemFromPipelineState(page: BrainPage): WorkItem | undefined {
  const fm = front(page);
  const stage = caseAnalysisStage(fm);
  if (!stage) return undefined;
  // Terminal stages are not actionable.
  if (stage === "completed" || stage === "completed_with_warnings" || stage === "revised") {
    return undefined;
  }
  const caseSlug = stringValue(fm.case_ref) ?? stringValue(fm.case_slug);
  const createdAt = stringValue(fm.created_at) ?? page.created_at ?? "";
  const layerNum = typeof fm.current_layer === "number" ? fm.current_layer : undefined;
  return {
    id: page.slug,
    kind: "case_analysis",
    title: page.title || `Pipeline — ${caseSlug ?? "Akte"}`,
    summary: page.content?.slice(0, 240) || "",
    caseSlug,
    sourceSlug: page.slug,
    priority: caseAnalysisPriority(stage),
    status: stage,
    pipelineStage: stage,
    currentLayer: layerNum,
    createdAt,
  };
}

export function buildWorkItems(pagesByType: Record<string, BrainPage[]>): WorkItem[] {
  const items: WorkItem[] = [];
  for (const page of pagesByType.chat_inbox ?? []) items.push(itemFromPage(page, "communication"));
  for (const page of [
    ...(pagesByType.client_submission ?? []),
    ...(pagesByType.legal_document ?? []),
  ]) {
    const fm = front(page);
    const stage = documentStage(fm);
    if (isDocumentActionable(stage)) {
      items.push({ ...itemFromPage(page, "document_review"), status: stage, pipelineStage: stage });
    }
  }
  for (const page of pagesByType.pipeline_state ?? []) {
    const item = itemFromPipelineState(page);
    if (item) items.push(item);
  }
  for (const page of pagesByType.agent_action ?? []) {
    if (front(page).status === "pending") items.push(itemFromPage(page, "approval"));
  }
  for (const page of pagesByType.legal_deadline ?? []) {
    if (!["done", "completed", "cancelled"].includes(String(front(page).status ?? ""))) {
      items.push(itemFromPage(page, "deadline"));
    }
  }
  for (const page of pagesByType.appointment ?? []) {
    if (!["completed", "cancelled"].includes(String(front(page).status ?? ""))) {
      items.push(itemFromPage(page, "appointment"));
    }
  }
  return items.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = rank[a.priority] - rank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt);
  });
}

/** Minimal shape needed for attention scoring — accepts both WorkItem and looser local types. */
export interface AttentionInput {
  kind: string;
  priority: string;
  dueAt?: string;
  pipelineStage?: string;
  status: string;
}

/**
 * "Needs Attention" scoring — ranks work items by a weighted combination of
 * time urgency (4×) and consequence level (4×), inspired by TimeNet Law's
 * Launchpad prioritization engine.
 *
 *   timeUrgency:   overdue=100, today=80, this week=40, later=10, no date=5
 *   consequence:   failed=100, approval=80, deadline=60, case_analysis=50,
 *                  document_review=40, communication=30, appointment=20
 *
 * Higher score = more urgent. Pure function, testable.
 */
export function attentionScore(item: AttentionInput, now: Date = new Date()): number {
  // --- Time urgency (weight 4×) ---
  let timeUrgency = 5;
  if (item.dueAt) {
    const todayStr = now.toLocaleDateString("en-CA");
    const weekFromNow = new Date(now);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = weekFromNow.toLocaleDateString("en-CA");

    if (item.dueAt < todayStr)
      timeUrgency = 100; // overdue
    else if (item.dueAt === todayStr)
      timeUrgency = 80; // today
    else if (item.dueAt <= weekStr)
      timeUrgency = 40; // this week
    else timeUrgency = 10; // later
  }

  // --- Consequence level (weight 4×) ---
  const consequenceByKind: Record<string, number> = {
    approval: 80,
    deadline: 60,
    case_analysis: 50,
    document_review: 40,
    communication: 30,
    appointment: 20,
  };
  let consequence = consequenceByKind[item.kind] ?? 30;
  // Failed pipelines always surface above routine items
  if (item.pipelineStage === "failed" || item.status === "failed") consequence = 100;

  // --- Priority boost (weight 2×) ---
  const priorityBoost: Record<string, number> = {
    critical: 100,
    high: 60,
    medium: 30,
    low: 10,
  };

  return timeUrgency * 4 + consequence * 4 + (priorityBoost[item.priority] ?? 10) * 2;
}

/**
 * Check if a work item is due today or overdue.
 * Uses date-only comparison (no time component).
 */
export function isDueTodayOrOverdue(item: AttentionInput, now: Date = new Date()): boolean {
  if (!item.dueAt) return false;
  const todayStr = now.toLocaleDateString("en-CA");
  return item.dueAt <= todayStr;
}

/**
 * Check if a work item is strictly overdue (past today).
 */
export function isOverdue(item: AttentionInput, now: Date = new Date()): boolean {
  if (!item.dueAt) return false;
  const todayStr = now.toLocaleDateString("en-CA");
  return item.dueAt < todayStr;
}
