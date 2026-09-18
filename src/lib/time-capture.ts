/**
 * Passive time capture from the audit log.
 *
 * Every successful action a lawyer takes through the API is already written to
 * subsumio_audit_log with firm (brain_id), user, action, object and time. This
 * module turns those rows into ActivityEvents for the time-suggestion job —
 * no separate tracking, no browser observers.
 *
 * Each billable action gets a nominal working time that ends at the audit
 * timestamp (the work happened before the save). Actions that are not
 * client work (settings, billing, reads, logins) are ignored. Suggestions
 * are only proposals; the lawyer accepts, edits or rejects each one.
 */

import type { AuditEntry } from "@/lib/audit-labels";
import type { ActivityEvent, ActivityType } from "@/lib/passive-time";

interface CaptureRule {
  pattern: RegExp;
  type: ActivityType;
  /** Nominal minutes of work that end at the audit timestamp. */
  minutes: number;
  label: string;
}

// First match wins. Order from specific to general.
const RULES: CaptureRule[] = [
  {
    pattern:
      /^legal\.(schriftsatz|contract_draft|berufungsgruende|reorder_gruende|memo|writing_style_save)$|^litigation\.(create|update|step_update|phase_advance)$|^copilot\.draft_review$/,
    type: "drafting",
    minutes: 15,
    label: "Entwurf",
  },
  {
    pattern:
      /^legal\.(document_review|redline|risk_analysis|tabular|contradictions|case_investigation|case_investigation_review|obligation_extract|deep_analysis|due_diligence|subsumption|strategy|opponent_simulation|clause_annotation|clause_annotation_review|chronology_build|playbook|translate)$|^evidence\.(create|update)$/,
    type: "review",
    minutes: 10,
    label: "Prüfung",
  },
  {
    pattern:
      /^legal\.(research|precedent_search|statute|commentary_synthesize|ground|frist_compute|ai_deadlines|wiedervorlage_create)$|^query\.submit$|^copilot\.explain$/,
    type: "research",
    minutes: 6,
    label: "Recherche",
  },
  {
    pattern: /^email\.(send|reply|message_send|draft_reply)$/,
    type: "email_sent",
    minutes: 6,
    label: "E-Mail",
  },
  {
    pattern: /^whatsapp\.(outbound_sent|document_to_space)$/,
    type: "portal_message",
    minutes: 4,
    label: "Mandantennachricht",
  },
  {
    pattern: /^signature\.(capture|qes_signed)$/,
    type: "review",
    minutes: 3,
    label: "Unterschrift",
  },
  {
    pattern: /^document\.(upload|import_from_submission)$/,
    type: "document_edit",
    minutes: 4,
    label: "Dokument abgelegt",
  },
  {
    pattern: /^case\.(create|update)$/,
    type: "document_edit",
    minutes: 3,
    label: "Akte bearbeitet",
  },
];

export function captureRuleFor(action: string): CaptureRule | null {
  return RULES.find((r) => r.pattern.test(action)) ?? null;
}

const CASE_PREFIX = "legal/cases/";

/**
 * Page writes that are bookkeeping, not client work. Accepting a time
 * suggestion writes a time_suggestion page — counting it would feed the
 * suggestion back into itself.
 */
const IGNORED_PAGE_TYPES = new Set([
  "time_suggestion",
  "time_entry",
  "passive_time_preference",
  "notification",
  "kanzlei_settings",
  "audit_log",
]);

/** The matter an audit entry belongs to, if it names one. */
export function caseSlugOf(entry: AuditEntry): string | undefined {
  const d = entry.details ?? {};
  for (const key of ["case_slug", "caseSlug", "matter_slug"]) {
    const v = d[key];
    if (typeof v === "string" && v.startsWith(CASE_PREFIX)) return caseRoot(v);
  }
  if (entry.entityId?.startsWith(CASE_PREFIX)) return caseRoot(entry.entityId);
  return undefined;
}

/** "legal/cases/2026-001/documents/x" → "legal/cases/2026-001". */
function caseRoot(slug: string): string {
  const rest = slug.slice(CASE_PREFIX.length).split("/")[0];
  return `${CASE_PREFIX}${rest}`;
}

function describe(entry: AuditEntry, rule: CaptureRule): string {
  const d = entry.details ?? {};
  const title = [d.title, d.subject, d.document_title, d.filename].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  return title ? `${rule.label}: ${title.trim().slice(0, 80)}` : rule.label;
}

export function activitiesFromAudit(entries: AuditEntry[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const entry of entries) {
    if (!entry.userEmail) continue;
    const rule = captureRuleFor(entry.action);
    if (!rule) continue;
    const caseSlug = caseSlugOf(entry);
    if (entry.action.startsWith("case.")) {
      // Generic page writes only count on a matter and never for bookkeeping.
      const pageType = entry.details?.type;
      if (!caseSlug || (typeof pageType === "string" && IGNORED_PAGE_TYPES.has(pageType))) {
        continue;
      }
    }
    const end = new Date(entry.timestamp);
    if (Number.isNaN(end.getTime())) continue;
    const start = new Date(end.getTime() - rule.minutes * 60_000);
    out.push({
      id: `audit-${entry.id}`,
      type: rule.type,
      user_email: entry.userEmail,
      case_slug: caseSlug,
      description: describe(entry, rule),
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      duration_seconds: rule.minutes * 60,
      metadata: { action: entry.action },
    });
  }
  return out;
}
