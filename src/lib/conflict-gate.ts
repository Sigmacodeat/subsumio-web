/**
 * Server-side Kollisionsprüfung für Aktenanlage und Mandatsannahme
 * (§ 10 Abs 1 RAO, § 12a RL-BA 2015).
 *
 * Jede Partei wird mit ihrer Seite im NEUEN Mandat geprüft: Der künftige
 * Mandant darf in keiner bestehenden Akte Gegner sein, der künftige Gegner
 * in keiner bestehenden Akte Mandant. Solche Treffer blockieren (critical),
 * bis ein berechtigter Anwalt sie begründet freigibt. Beteiligten-/Kontakt-
 * Treffer sind Warnungen; Treffer auf derselben Seite (Folgemandat, eigener
 * Mandantenkontakt) bleiben Information und erzeugen keine Warnflut.
 *
 * Die Engine liefert je Treffer eine `assessment` ("critical" | "review" |
 * "info"); diese Datei bündelt die Parteien, schreibt den Prüfnachweis und
 * ist der gemeinsame Einstieg für /api/pages, /api/intake/* und die
 * Aktenanlage aus der Mandatsannahme.
 */
import { ENGINE_URL } from "@/lib/engine";
import { matterConflictParties } from "@/lib/contact-conflict";
import type { IntakeConflictCheck } from "@/lib/intake-acceptance";

export type ConflictSide = "client" | "opponent";
export type ConflictSeverity = "critical" | "low" | "none";
export type ConflictAssessment = "critical" | "review" | "info";

export interface EngineConflictMatch {
  slug: string;
  title: string;
  role: "client" | "opponent" | "contact";
  quelle?: "case" | "contact" | "entity";
  entity_role?: string;
  contact_role?: string;
  case_ref?: string;
  status?: string;
  matched_name: string;
  exact?: boolean;
  similarity?: number;
  match_type?: "exact" | "fuzzy" | "substring";
  assessment: ConflictAssessment;
}

export interface EngineConflictResult {
  name: string;
  side?: ConflictSide;
  severity: ConflictSeverity;
  explanation: string;
  matches: EngineConflictMatch[];
  checked_rows?: number;
  disclaimer?: string;
}

const SEVERITIES: ReadonlySet<string> = new Set(["critical", "low", "none"]);
const ASSESSMENTS: ReadonlySet<string> = new Set(["critical", "review", "info"]);

/**
 * One engine conflict check. Fail-closed: an unreachable engine or an answer
 * without a recognisable severity/assessment throws — a check that did not
 * run must never read as "kein Konflikt".
 */
export async function requestConflictCheck(
  headers: Record<string, string>,
  input: {
    name: string;
    side?: ConflictSide;
    selfCaseSlug?: string;
    ownContactSlugs?: string[];
  },
  timeoutMs = 15_000
): Promise<EngineConflictResult> {
  const res = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      name: input.name,
      ...(input.side ? { side: input.side } : {}),
      ...(input.selfCaseSlug ? { self_case_slug: input.selfCaseSlug } : {}),
      ...(input.ownContactSlugs?.length ? { own_contact_slugs: input.ownContactSlugs } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Conflict check failed: HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as Partial<EngineConflictResult> | null;
  if (
    !data ||
    typeof data.severity !== "string" ||
    !SEVERITIES.has(data.severity) ||
    !Array.isArray(data.matches)
  ) {
    throw new Error("Conflict check failed: malformed engine answer");
  }
  const matches = data.matches.map((m) => {
    const match = m as EngineConflictMatch;
    // An engine without per-hit assessment is treated as "needs review".
    return ASSESSMENTS.has(match.assessment) ? match : { ...match, assessment: "review" as const };
  });
  return {
    name: typeof data.name === "string" ? data.name : input.name,
    ...(data.side ? { side: data.side } : {}),
    severity: data.severity,
    explanation: typeof data.explanation === "string" ? data.explanation : "",
    matches,
    checked_rows: data.checked_rows,
    disclaimer: data.disclaimer,
  };
}

// ── Parties of a matter / an intake ────────────────────────────────────

export interface ConflictParty {
  name: string;
  side: ConflictSide;
  /** Contact pages that ARE this party (never hide case/entity hits). */
  ownContactSlugs: string[];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s) : [];
}

/** Client, main opponent and every additional opponent of a matter. */
export function matterParties(fm: Record<string, unknown> | undefined | null): ConflictParty[] {
  const opponentSlugs = strings(fm?.opponent_slugs);
  const mainOpponent = typeof fm?.opponent_name === "string" ? fm.opponent_name.trim() : "";
  return matterConflictParties(fm).map((p) => {
    const own = p.slug ? [p.slug] : [];
    if (p.role === "opponent" && p.name === mainOpponent) own.push(...opponentSlugs);
    return {
      name: p.name,
      side: p.role === "client" ? "client" : "opponent",
      ownContactSlugs: [...new Set(own)],
    };
  });
}

/** The prospective client and (if given) the opponent of an intake request. */
export function intakeParties(fm: Record<string, unknown> | undefined | null): ConflictParty[] {
  const parties: ConflictParty[] = [];
  const client = typeof fm?.client_name === "string" ? fm.client_name.trim() : "";
  if (client) parties.push({ name: client, side: "client", ownContactSlugs: [] });
  const opponentRaw = fm?.opponent_name ?? fm?.opponent;
  const opponent = typeof opponentRaw === "string" ? opponentRaw.trim() : "";
  if (opponent) parties.push({ name: opponent, side: "opponent", ownContactSlugs: [] });
  return parties;
}

// ── Matter-level outcome ───────────────────────────────────────────────

export interface MatterConflictHit {
  /** Name as stored in the hit (for display). */
  name: string;
  /** Where the hit came from: case | contact | entity. */
  type: string;
  slug: string;
  title: string;
  role: EngineConflictMatch["role"];
  assessment: ConflictAssessment;
  /** The party of the NEW matter this hit belongs to. */
  party: string;
  party_side: ConflictSide;
  case_ref?: string;
  exact?: boolean;
}

export interface MatterConflictOutcome {
  /** True when at least one party was checked. */
  checked: boolean;
  severity: ConflictSeverity;
  parties: Array<{
    name: string;
    side: ConflictSide;
    severity: ConflictSeverity;
    explanation: string;
  }>;
  /** Hits that need attention (critical + review); same-side info hits are left out. */
  matches?: MatterConflictHit[];
  /** Hits that block the matter until a justified waiver. */
  blocking: MatterConflictHit[];
}

const RANK: Record<ConflictSeverity, number> = { none: 0, low: 1, critical: 2 };

export async function checkPartiesConflicts(
  headers: Record<string, string>,
  parties: ConflictParty[],
  opts: { selfCaseSlug?: string } = {}
): Promise<MatterConflictOutcome> {
  // One check per (name, side); the same name on both sides is checked twice.
  const unique = new Map<string, ConflictParty>();
  for (const p of parties) {
    const key = `${p.side}:${p.name.toLowerCase()}`;
    const prev = unique.get(key);
    if (prev) prev.ownContactSlugs = [...new Set([...prev.ownContactSlugs, ...p.ownContactSlugs])];
    else unique.set(key, { ...p, ownContactSlugs: [...p.ownContactSlugs] });
  }

  let severity: ConflictSeverity = "none";
  const outcomeParties: MatterConflictOutcome["parties"] = [];
  const hits: MatterConflictHit[] = [];
  for (const party of unique.values()) {
    const result = await requestConflictCheck(headers, {
      name: party.name,
      side: party.side,
      selfCaseSlug: opts.selfCaseSlug,
      ownContactSlugs: party.ownContactSlugs,
    });
    if (RANK[result.severity] > RANK[severity]) severity = result.severity;
    outcomeParties.push({
      name: party.name,
      side: party.side,
      severity: result.severity,
      explanation: result.explanation,
    });
    for (const m of result.matches) {
      if (m.assessment === "info") continue;
      hits.push({
        name: m.matched_name || m.title,
        type: m.quelle ?? "case",
        slug: m.slug,
        title: m.title,
        role: m.role,
        assessment: m.assessment,
        party: party.name,
        party_side: party.side,
        ...(m.case_ref ? { case_ref: m.case_ref } : {}),
        ...(typeof m.exact === "boolean" ? { exact: m.exact } : {}),
      });
    }
  }

  return {
    checked: unique.size > 0,
    severity,
    parties: outcomeParties,
    matches: hits.length > 0 ? hits : undefined,
    blocking: hits.filter((h) => h.assessment === "critical"),
  };
}

export function checkMatterConflicts(
  headers: Record<string, string>,
  fm: Record<string, unknown> | undefined | null,
  opts: { selfCaseSlug?: string } = {}
): Promise<MatterConflictOutcome> {
  return checkPartiesConflicts(headers, matterParties(fm), opts);
}

// ── Waiver + evidence record ───────────────────────────────────────────

/** Roles that may release a blocking conflict with a justification. */
export const CONFLICT_WAIVER_ROLES: readonly string[] = ["admin", "lawyer"];

export function canWaiveConflict(role: string | undefined | null): boolean {
  return typeof role === "string" && CONFLICT_WAIVER_ROLES.includes(role);
}

export interface ConflictActor {
  id: string;
  email: string;
  role?: string;
}

/**
 * The Mandatsannahme evidence for a server-run check: who ran it (real user
 * id + e-mail), when, which parties, what came out — and, for a blocking
 * result, the justified waiver if one was given.
 */
export function conflictCheckRecord(
  outcome: MatterConflictOutcome,
  actor: ConflictActor,
  waiver?: { reason: string; actor: ConflictActor },
  now: Date = new Date()
): IntakeConflictCheck {
  const at = now.toISOString();
  if (!outcome.checked) {
    return { status: "pending", severity: "unknown", matches: [] };
  }
  const blocking = outcome.blocking.length > 0;
  const record: IntakeConflictCheck = {
    status: blocking ? "conflict" : "clear",
    performed_at: at,
    performed_by: actor.email,
    performed_by_id: actor.id,
    severity: outcome.severity,
    matches: [...new Set((outcome.matches ?? []).map((m) => m.slug))],
    parties: outcome.parties.map((p) => ({ name: p.name, side: p.side, severity: p.severity })),
    waived: false,
  };
  if (blocking && waiver) {
    record.waived = true;
    record.waived_by = waiver.actor.email;
    record.waived_by_id = waiver.actor.id;
    record.waived_by_role = waiver.actor.role;
    record.waived_reason = waiver.reason.trim();
    record.waived_at = at;
  }
  return record;
}

/** Frontmatter keys only the server may set on a matter. */
export const SERVER_OWNED_CONFLICT_KEYS = [
  "conflict_status",
  "conflict_waived_by",
  "conflict_waived_by_id",
  "conflict_waived_by_role",
  "conflict_waived_at",
] as const;
