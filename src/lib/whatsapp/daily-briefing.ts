/**
 * Daily briefing composer (Paket 33, P1-SECR-004).
 *
 * Pure, deterministic builder for the proactive "Guten Morgen" digest the AI
 * secretary pushes over WhatsApp. Takes the lawyer's cases + a clock, returns the
 * briefing text — or `null` when there is nothing worth a push (no spam on empty
 * days). Kept I/O-free so it is fully unit-testable; the cron does the fetching
 * and the gated send.
 *
 * v2: Extended with pending approvals, new documents, and conflict alerts
 * (P1-SECR-004 completion).
 */

export interface BriefingDeadline {
  title?: string;
  due_date?: string;
  date?: string;
  reminder_sent_at?: string;
  done?: boolean;
}

export interface BriefingApproval {
  id: string;
  action_type: string;
  summary: string;
  case_slug?: string;
  proposed_at: string;
}

export interface BriefingDocument {
  id: string;
  title: string;
  case_slug?: string;
  created_at: string;
}

export interface BriefingConflict {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  case_slug?: string;
  detected_at: string;
}

export interface BriefingCaseActivity {
  caseNumber: string;
  title: string;
  /** What changed (e.g. "Neues Dokument", "Agenten-Lauf", "Frist aktualisiert"). */
  activity: string;
  /** ISO timestamp of the activity. */
  timestamp: string;
}

export interface BriefingContradiction {
  case_slug: string;
  severity: "high" | "medium" | "low" | "info";
  chunk_a: string;
  chunk_b: string;
  explanation?: string;
  detected_at: string;
}

export interface BriefingCase {
  caseNumber: string;
  title?: string;
  deadlines: BriefingDeadline[];
}

export interface BuildBriefingInput {
  anwaltName?: string;
  cases: BriefingCase[];
  now: Date;
  /** How many days ahead to include. Default 3. */
  horizonDays?: number;
  /** Pending approvals awaiting the lawyer's decision. */
  pendingApprovals?: BriefingApproval[];
  /** New documents uploaded since last briefing. */
  newDocuments?: BriefingDocument[];
  /** Active conflict alerts. */
  conflicts?: BriefingConflict[];
  /** Cases with activity in the last 24h. */
  caseActivity?: BriefingCaseActivity[];
  /** Semantic contradictions from the nightly probe. */
  contradictions?: BriefingContradiction[];
}

interface CollectedDeadline {
  dueDate: string;
  title: string;
  caseNumber: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Collect not-yet-done deadlines due within [today, today+horizon], sorted by date.
 * Exported for testing the selection logic independently of the rendered text.
 */
export function collectUpcomingDeadlines(input: BuildBriefingInput): CollectedDeadline[] {
  const horizon = input.horizonDays ?? 3;
  const today = ymd(input.now);
  const limit = ymd(new Date(input.now.getTime() + horizon * 24 * 60 * 60 * 1000));

  const out: CollectedDeadline[] = [];
  for (const c of input.cases) {
    for (const d of c.deadlines) {
      if (d.done) continue;
      const due = String(d.due_date ?? d.date ?? "");
      if (!due || due < today || due > limit) continue;
      out.push({ dueDate: due, title: String(d.title ?? "Frist"), caseNumber: c.caseNumber });
    }
  }
  out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  return out;
}

/**
 * Render the briefing text, or `null` if there is nothing to report.
 */
function buildRecommendations(
  deadlines: CollectedDeadline[],
  approvals: BriefingApproval[],
  today: string
): string[] {
  const recs: string[] = [];

  // 1. Overdue / today's deadlines — highest priority
  const dueToday = deadlines.filter((d) => d.dueDate <= today);
  if (dueToday.length > 0) {
    if (dueToday.length === 1) {
      recs.push(
        `Frist heute fällig: ${dueToday[0]!.title} (Akte ${dueToday[0]!.caseNumber}) — sofort prüfen`
      );
    } else {
      recs.push(
        `${dueToday.length} Fristen heute fällig — zuerst Akten ${[...new Set(dueToday.map((d) => d.caseNumber))].slice(0, 3).join(", ")} prüfen`
      );
    }
  }

  // 2. Pending approvals
  if (approvals.length > 0) {
    if (approvals.length === 1) {
      recs.push(`Freigabe ausstehend: ${approvals[0]!.summary} — heute entscheiden`);
    } else {
      recs.push(`${approvals.length} Freigaben warten auf Entscheidung — Blocker für Fortschritt`);
    }
  }

  // 3. Upcoming deadlines (next 2-3 days)
  const upcoming = deadlines.filter((d) => d.dueDate > today);
  if (upcoming.length > 0) {
    const next = upcoming[0]!;
    recs.push(`Nächste Frist: ${next.title} am ${next.dueDate} (Akte ${next.caseNumber})`);
  }

  // 4. If nothing urgent, a calm note
  if (recs.length === 0) {
    recs.push("Keine dringenden Fristen heute — Zeit für Aktenfortschritt");
  }

  return recs.slice(0, 5);
}

export function buildDailyBriefing(input: BuildBriefingInput): string | null {
  const deadlines = collectUpcomingDeadlines(input);
  const approvals = input.pendingApprovals ?? [];
  const documents = input.newDocuments ?? [];
  const conflicts = input.conflicts ?? [];
  const activity = input.caseActivity ?? [];
  const contradictions = input.contradictions ?? [];

  if (
    deadlines.length === 0 &&
    approvals.length === 0 &&
    documents.length === 0 &&
    conflicts.length === 0 &&
    activity.length === 0 &&
    contradictions.length === 0
  ) {
    return null;
  }

  const today = ymd(input.now);
  const greeting = `Guten Morgen${input.anwaltName ? `, ${input.anwaltName}` : ""}! ☀️`;
  const dueToday = deadlines.filter((d) => d.dueDate === today);
  const lines: string[] = [greeting, ""];

  // Deadlines section
  if (deadlines.length > 0) {
    lines.push(
      `📋 ${deadlines.length} Frist${deadlines.length === 1 ? "" : "en"} in den nächsten Tagen${
        dueToday.length > 0 ? ` (${dueToday.length} heute fällig)` : ""
      }:`
    );
    for (const d of deadlines) {
      const flag = d.dueDate === today ? "🔴" : "•";
      lines.push(`${flag} ${d.dueDate} — ${d.title} (Akte ${d.caseNumber})`);
    }
    lines.push("");
  }

  // Pending approvals section
  if (approvals.length > 0) {
    lines.push(`⚖️ ${approvals.length} Freigabe${approvals.length === 1 ? "" : "n"} wartet:`);
    for (const a of approvals) {
      lines.push(`• ${a.summary}${a.case_slug ? ` (Akte ${a.case_slug})` : ""}`);
    }
    lines.push("");
  }

  // New documents section
  if (documents.length > 0) {
    lines.push(
      `📄 ${documents.length} neue${documents.length === 1 ? "s Dokument" : " Dokumente"}:`
    );
    for (const doc of documents) {
      lines.push(`• ${doc.title}${doc.case_slug ? ` (Akte ${doc.case_slug})` : ""}`);
    }
    lines.push("");
  }

  // Case activity section (last 24h)
  if (activity.length > 0) {
    lines.push(`📁 ${activity.length} Akte${activity.length === 1 ? "" : "n"} kürzlich aktiv:`);
    for (const a of activity.slice(0, 10)) {
      lines.push(`• ${a.caseNumber} — ${a.activity}${a.title ? ` (${a.title})` : ""}`);
    }
    lines.push("");
  }

  // Conflict alerts section
  if (conflicts.length > 0) {
    lines.push(`⚠️ ${conflicts.length} Konflikt-Alarm${conflicts.length === 1 ? "" : "e"}:`);
    for (const c of conflicts) {
      const icon = c.severity === "high" ? "🔴" : c.severity === "medium" ? "🟡" : "🟢";
      lines.push(`${icon} ${c.description}${c.case_slug ? ` (Akte ${c.case_slug})` : ""}`);
    }
    lines.push("");
  }

  // Contradiction findings section (from nightly semantic probe)
  if (contradictions.length > 0) {
    const highCount = contradictions.filter((c) => c.severity === "high").length;
    const label =
      highCount > 0
        ? `${contradictions.length} Widerspruch${contradictions.length === 1 ? "" : "e"} erkannt (${highCount} kritisch)`
        : `${contradictions.length} Widerspruch${contradictions.length === 1 ? "" : "e"} erkannt`;
    lines.push(`🔍 ${label}:`);
    for (const c of contradictions.slice(0, 5)) {
      const icon = c.severity === "high" ? "🔴" : c.severity === "medium" ? "🟡" : "🟢";
      const summary = c.explanation
        ? c.explanation.slice(0, 80)
        : `${c.chunk_a.slice(0, 40)}... vs ${c.chunk_b.slice(0, 40)}...`;
      lines.push(`${icon} ${summary} (Akte ${c.case_slug})`);
    }
    if (contradictions.length > 5) {
      lines.push(`• ...und ${contradictions.length - 5} weitere`);
    }
    lines.push("");
  }

  // Recommendations section (deterministic, no LLM)
  const recs = buildRecommendations(deadlines, approvals, today);
  if (recs.length > 0) {
    lines.push("🎯 Empfehlungen für heute:");
    for (let i = 0; i < recs.length; i++) {
      lines.push(`${i + 1}. ${recs[i]}`);
    }
    lines.push("");
  }

  lines.push('Antworten Sie mit "heute" für die volle Tagesübersicht.');
  return lines.join("\n");
}

/** Table name shared with the cron route's createDailyDedup() — single source. */
export const BRIEFING_DEDUP_TABLE = "subsumio_daily_briefing_sent";

/**
 * Did this recipient get a daily briefing today? Used by the webhook to
 * disambiguate an inbound "👍"/"hilfreich"-shaped reply as briefing
 * feedback (vs. an unrelated chat message) — feedback is only captured
 * when a briefing was actually sent today, not on every "ja" anyone types.
 *
 * Reads the same dedup table createDailyDedup() writes (cron/daily-briefing
 * keys it by `${brainId}:${phoneHash}`, see that route). Returns false
 * (fail toward "not feedback", i.e. normal chat handling) when no DB pool
 * is configured — same dev-mode posture as createDailyDedup itself.
 */
export async function wasBriefingSentToday(dedupKey: string): Promise<boolean> {
  const { getSharedPgPool } = await import("@/lib/auth/store");
  const pool = getSharedPgPool();
  if (!pool) return false;
  const day = new Date().toISOString().slice(0, 10);
  const { rowCount } = await pool.query(
    `SELECT 1 FROM ${BRIEFING_DEDUP_TABLE} WHERE brain_id = $1 AND day = $2`,
    [dedupKey, day]
  );
  return (rowCount ?? 0) > 0;
}
