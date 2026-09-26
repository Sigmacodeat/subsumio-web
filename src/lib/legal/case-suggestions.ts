/**
 * Suggestions from a document analysis for a matter: parties (with their
 * side in THIS matter) and Aktendaten (court, Geschäftszahl, Streitwert).
 *
 * Pure. The analysis knows procedural roles (klagende/beklagte Partei); which
 * of them is our client is decided here against the matter's client. Nothing
 * is written to the matter's real fields — the lawyer accepts a suggestion
 * through src/lib/legal/case-suggestion-decision.ts.
 */
import { caseNumberKey } from "@/lib/legal/geschaeftszahl";

export type PartySuggestionRole =
  | "mandant"
  | "gegner"
  | "gegnervertreter"
  | "vertreter"
  | "gericht"
  | "behoerde"
  | "sonstige"
  | "klagende_partei"
  | "beklagte_partei"
  | "antragsteller"
  | "antragsgegner"
  | "beschwerdefuehrer";

/** Roles that can be taken over without further choice. */
export const RESOLVED_PARTY_ROLES: ReadonlySet<string> = new Set([
  "mandant",
  "gegner",
  "gegnervertreter",
  "vertreter",
  "gericht",
  "behoerde",
  "sonstige",
]);

export const PARTY_ROLE_LABEL: Record<string, string> = {
  mandant: "Mandant",
  gegner: "Gegner",
  gegnervertreter: "Gegnervertreter",
  vertreter: "Vertreter",
  gericht: "Gericht",
  behoerde: "Behörde",
  sonstige: "Beteiligte/r",
  klagende_partei: "Klagende Partei",
  beklagte_partei: "Beklagte Partei",
  antragsteller: "Antragsteller",
  antragsgegner: "Antragsgegner",
  beschwerdefuehrer: "Beschwerdeführer",
};

export interface NormalizedParty {
  name: string;
  role: PartySuggestionRole;
  vertreter?: string;
}

const KNOWN_ROLES = new Set(Object.keys(PARTY_ROLE_LABEL));

function legacyRole(raw: unknown): PartySuggestionRole {
  if (typeof raw !== "string") return "sonstige";
  const r = raw.trim().toLowerCase();
  if (KNOWN_ROLES.has(r)) return r as PartySuggestionRole;
  if (["klient", "client", "mandantin"].includes(r)) return "mandant";
  if (["opponent", "gegnerin", "gegenseite"].includes(r)) return "gegner";
  if (["court"].includes(r)) return "gericht";
  if (["behörde", "authority"].includes(r)) return "behoerde";
  if (["kläger", "klägerin", "klagende partei"].includes(r)) return "klagende_partei";
  if (["beklagter", "beklagte", "beklagte partei"].includes(r)) return "beklagte_partei";
  if (["rechtsanwalt", "anwalt", "lawyer"].includes(r)) return "vertreter";
  return "sonstige";
}

export function normalizeName(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,;:()"'„“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameName(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "Widget-Co GmbH" vs "Widget-Co" — containment only for longer names.
  return Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x));
}

/**
 * Parties of an analysis result, whatever shape the producer used:
 * `party_roles` [{name, role, vertreter}] (engine), `parties` as strings
 * (older engine) or objects (inline analysis). Empty names are dropped —
 * a suggestion without a name is useless.
 */
export function normalizeAnalysisParties(parsed: Record<string, unknown>): NormalizedParty[] {
  const source =
    Array.isArray(parsed.party_roles) && parsed.party_roles.length > 0
      ? parsed.party_roles
      : Array.isArray(parsed.parties)
        ? parsed.parties
        : [];
  const out: NormalizedParty[] = [];
  const seen = new Set<string>();
  for (const item of source as unknown[]) {
    let name = "";
    let role: PartySuggestionRole = "sonstige";
    let vertreter: string | undefined;
    if (typeof item === "string") {
      name = item;
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      name = typeof o.name === "string" ? o.name : "";
      role = legacyRole(o.role);
      if (typeof o.vertreter === "string" && o.vertreter.trim()) vertreter = o.vertreter.trim();
    }
    name = name.replace(/\s+/g, " ").trim();
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, role, ...(vertreter ? { vertreter } : {}) });
  }
  return out;
}

const SIDE: Record<string, "A" | "B"> = {
  klagende_partei: "A",
  antragsteller: "A",
  beschwerdefuehrer: "A",
  beklagte_partei: "B",
  antragsgegner: "B",
};

function caseOpponents(fm: Record<string, unknown>): string[] {
  const names: string[] = [];
  if (typeof fm.opponent_name === "string" && fm.opponent_name.trim()) names.push(fm.opponent_name);
  if (Array.isArray(fm.additional_opponents)) {
    for (const o of fm.additional_opponents) {
      if (typeof o === "string") names.push(o);
      else if (o && typeof (o as { name?: unknown }).name === "string")
        names.push((o as { name: string }).name);
    }
  }
  return names;
}

/**
 * Party suggestions with their side in THIS matter. The client's own entry is
 * recognised by name; the other procedural side becomes "gegner", its
 * representative "gegnervertreter". Without a recognisable client the
 * procedural role stays and the lawyer decides. Parties the matter already
 * lists as client/opponent are not suggested again.
 */
export function resolvePartySides(
  parties: NormalizedParty[],
  caseFm: Record<string, unknown>
): NormalizedParty[] {
  const client = typeof caseFm.client_name === "string" ? caseFm.client_name : "";
  const opponents = caseOpponents(caseFm);
  let ownSide: "A" | "B" | undefined;
  for (const p of parties) {
    const side = SIDE[p.role];
    if (!side) continue;
    if (client && sameName(p.name, client)) ownSide = side;
    else if (!ownSide && opponents.some((o) => sameName(p.name, o)))
      ownSide = side === "A" ? "B" : "A";
  }

  const out: NormalizedParty[] = [];
  for (const p of parties) {
    const isClient = client && sameName(p.name, client);
    const isOpponent = opponents.some((o) => sameName(p.name, o));
    const side = SIDE[p.role];
    let role: PartySuggestionRole = p.role;
    if (isClient) role = "mandant";
    else if (p.role === "mandant" || p.role === "gegner") role = p.role;
    else if (side && ownSide) role = side === ownSide ? p.role : "gegner";

    if (!isClient && !isOpponent) out.push({ name: p.name, role });
    if (p.vertreter && !(side && ownSide && side === ownSide)) {
      out.push({
        name: p.vertreter,
        role: role === "gegner" || isOpponent ? "gegnervertreter" : "vertreter",
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${normalizeName(p.name)}|${p.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Aktendaten (court, Geschäftszahl, Streitwert) ─────────────────────

export type CaseFieldKey = "court_name" | "case_number" | "dispute_value";

export const CASE_FIELD_LABEL: Record<CaseFieldKey, string> = {
  court_name: "Gericht",
  case_number: "Geschäftszahl",
  dispute_value: "Streitwert",
};

export interface CaseFieldSuggestion {
  field: CaseFieldKey;
  value: string | number;
  /** Current value of the matter when the suggestion was made (for the UI). */
  current?: string | number;
  quote: string;
  method: string;
  source: string;
  confirmed: false;
  review_status: "pending";
  suggested_at: string;
}

function factValue(v: unknown): { value: unknown; quote: string; method: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    value: o.value,
    quote: typeof o.quote === "string" ? o.quote : "",
    method: typeof o.method === "string" ? o.method : "llm",
  };
}

function sameFieldValue(field: CaseFieldKey, a: unknown, b: unknown): boolean {
  if (field === "dispute_value") return Number(a) === Number(b);
  if (field === "case_number") return !!a && caseNumberKey(a) === caseNumberKey(b);
  return normalizeName(a) === normalizeName(b);
}

/**
 * Aktendaten suggestions from an analysis' `case_facts`. A value equal to the
 * matter's current one, or already suggested (in any state), is skipped — a
 * rejected suggestion does not come back with every new document.
 */
export function buildCaseFieldSuggestions(
  caseFacts: unknown,
  caseFm: Record<string, unknown>,
  source: string,
  now: Date = new Date()
): CaseFieldSuggestion[] {
  if (!caseFacts || typeof caseFacts !== "object") return [];
  const facts = caseFacts as Record<string, unknown>;
  const existing = Array.isArray(caseFm.suggested_case_fields)
    ? (caseFm.suggested_case_fields as Array<Record<string, unknown>>)
    : [];
  const candidates: Array<[CaseFieldKey, unknown]> = [
    ["court_name", facts.gericht],
    ["case_number", facts.geschaeftszahl],
    ["dispute_value", facts.streitwert],
  ];
  const out: CaseFieldSuggestion[] = [];
  for (const [field, raw] of candidates) {
    const f = factValue(raw);
    if (!f) continue;
    const value =
      field === "dispute_value"
        ? typeof f.value === "number" && f.value > 0
          ? f.value
          : null
        : typeof f.value === "string" && f.value.trim()
          ? f.value.trim()
          : null;
    if (value === null) continue;
    const current = caseFm[field];
    if (
      current !== undefined &&
      current !== null &&
      current !== "" &&
      sameFieldValue(field, value, current)
    )
      continue;
    if (existing.some((e) => e.field === field && sameFieldValue(field, e.value, value))) continue;
    out.push({
      field,
      value,
      ...(typeof current === "string" || typeof current === "number" ? { current } : {}),
      quote: f.quote,
      method: f.method,
      source,
      confirmed: false,
      review_status: "pending",
      suggested_at: now.toISOString(),
    });
  }
  return out;
}
