import type { CaseFrontmatter } from "@/lib/legal-types";
import type { KnowledgeReview } from "@/lib/matter-detail-types";

export type MatterKnowledgeMutationAction =
  | "add"
  | "approve"
  | "mark_party_assertion"
  | "correct"
  | "reject"
  | "supersede";

export type MatterKnowledgeActorType = "lawyer" | "staff" | "copilot" | "importer" | "system";

export interface MatterKnowledgeActor {
  id?: string;
  name?: string;
  type?: MatterKnowledgeActorType;
}

export interface MatterKnowledgeSource {
  type: "manual" | "document" | "email" | "whatsapp" | "copilot" | "upload_analysis" | "system";
  label: string;
  slug?: string;
  quote?: string;
  received_at?: string;
}

export interface MatterKnowledgeMutation {
  action: MatterKnowledgeMutationAction;
  factId?: string;
  statement?: string;
  correctedStatement?: string;
  source: MatterKnowledgeSource;
  actor?: MatterKnowledgeActor;
  now?: string;
  reason?: string;
}

export interface MatterKnowledgeAuditEntry {
  id: string;
  at: string;
  action: `knowledge_${MatterKnowledgeMutationAction}`;
  actor?: string;
  actorId?: string;
  actorType?: MatterKnowledgeActorType;
  field: "knowledge_reviews";
  oldValue?: string;
  newValue?: string;
  note?: string;
  source?: MatterKnowledgeSource;
}

export interface MatterKnowledgeMutationResult {
  frontmatter: CaseFrontmatter;
  review: KnowledgeReview;
  audit: MatterKnowledgeAuditEntry;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function assertStatement(action: MatterKnowledgeMutationAction, statement?: string): string {
  const trimmed = statement?.trim();
  if (!trimmed) {
    throw new Error(`knowledge_${action}_requires_statement`);
  }
  return trimmed;
}

function resolveFactId(mutation: MatterKnowledgeMutation): string {
  if (mutation.action === "add") return mutation.factId?.trim() || makeId("manual-fact");
  const factId = mutation.factId?.trim();
  if (!factId) throw new Error(`knowledge_${mutation.action}_requires_fact_id`);
  return factId;
}

function reviewForMutation(
  existing: KnowledgeReview | undefined,
  mutation: MatterKnowledgeMutation,
  now: string
): KnowledgeReview {
  const factId = resolveFactId(mutation);
  const source = mutation.source.label;

  if (mutation.action === "add") {
    const statement = assertStatement(mutation.action, mutation.statement);
    return {
      fact_id: factId,
      status: "approved",
      original_statement: statement,
      source,
      reviewed_at: now,
    };
  }

  if (mutation.action === "approve") {
    return {
      fact_id: factId,
      status: "approved",
      original_statement:
        existing?.original_statement ?? assertStatement(mutation.action, mutation.statement),
      corrected_statement: existing?.corrected_statement,
      source: existing?.source ?? source,
      reviewed_at: now,
    };
  }

  if (mutation.action === "mark_party_assertion") {
    return {
      fact_id: factId,
      status: "party_assertion",
      original_statement:
        existing?.original_statement ?? assertStatement(mutation.action, mutation.statement),
      corrected_statement: existing?.corrected_statement,
      source: existing?.source ?? source,
      reviewed_at: now,
    };
  }

  if (mutation.action === "correct") {
    const corrected = assertStatement(mutation.action, mutation.correctedStatement);
    return {
      fact_id: factId,
      status: "corrected",
      original_statement:
        existing?.original_statement ?? assertStatement(mutation.action, mutation.statement),
      corrected_statement: corrected,
      source: existing?.source ?? source,
      reviewed_at: now,
    };
  }

  if (mutation.action === "supersede") {
    const corrected = assertStatement(mutation.action, mutation.correctedStatement);
    return {
      fact_id: factId,
      status: "corrected",
      original_statement:
        existing?.corrected_statement ??
        existing?.original_statement ??
        assertStatement(mutation.action, mutation.statement),
      corrected_statement: corrected,
      source,
      reviewed_at: now,
    };
  }

  return {
    fact_id: factId,
    status: "rejected",
    original_statement:
      existing?.original_statement ?? assertStatement(mutation.action, mutation.statement),
    corrected_statement: existing?.corrected_statement,
    source: existing?.source ?? source,
    reviewed_at: now,
  };
}

function describeMutation(mutation: MatterKnowledgeMutation): string {
  if (mutation.reason?.trim()) return mutation.reason.trim();
  switch (mutation.action) {
    case "add":
      return "Wissen zur Akte hinzugefügt";
    case "approve":
      return "Erkenntnis anwaltlich bestätigt";
    case "mark_party_assertion":
      return "Erkenntnis als Parteibehauptung eingeordnet";
    case "correct":
      return "Erkenntnis korrigiert";
    case "reject":
      return "Erkenntnis verworfen";
    case "supersede":
      return "Erkenntnis durch neueren Stand ersetzt";
  }
}

export function applyMatterKnowledgeMutation(
  frontmatter: CaseFrontmatter,
  mutation: MatterKnowledgeMutation
): MatterKnowledgeMutationResult {
  const now = mutation.now ?? new Date().toISOString();
  const knowledgeReviews = Array.isArray(frontmatter.knowledge_reviews)
    ? frontmatter.knowledge_reviews
    : [];
  const factId = resolveFactId(mutation);
  const existing = knowledgeReviews.find((item) => item.fact_id === factId);
  const review = reviewForMutation(existing, mutation, now);
  const nextReviews = [...knowledgeReviews.filter((item) => item.fact_id !== factId), review];
  const audit: MatterKnowledgeAuditEntry = {
    id: makeId("audit"),
    at: now,
    action: `knowledge_${mutation.action}`,
    actor: mutation.actor?.name,
    actorId: mutation.actor?.id,
    actorType: mutation.actor?.type,
    field: "knowledge_reviews",
    oldValue: existing ? (existing.corrected_statement ?? existing.original_statement) : undefined,
    newValue: review.corrected_statement ?? review.original_statement,
    note: describeMutation(mutation),
    source: mutation.source,
  };

  return {
    frontmatter: {
      ...frontmatter,
      knowledge_reviews: nextReviews,
      audit_log: [...(frontmatter.audit_log ?? []), audit],
    },
    review,
    audit,
  };
}
