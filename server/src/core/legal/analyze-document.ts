/**
 * analyze-document — proactive legal issue-spotting over a single document.
 *
 * The piece that lets the brain THINK about an uploaded document instead of
 * waiting to be asked: given a page slug, it produces a structured brief —
 * document type, parties, key dates/deadlines, legal issues with severity,
 * relevant statutes, and recommended next steps — all marked as AI-generated,
 * attorney-review-required.
 *
 * Anti-hallucination (the load-bearing guarantee, mirroring think's citation
 * grounding): every issue MUST carry a `quote` that appears VERBATIM in the
 * document. `groundIssues` drops any issue whose quote isn't found in the
 * source text, so the brain can't invent a problem the document doesn't
 * actually contain. A self-reported high-confidence issue with no anchor is
 * exactly the failure mode a law firm cannot tolerate — it never survives here.
 *
 * The LLM call is dependency-injected (AnalyzeLLM) so tests run without an API
 * key, the same seam `runThink` uses.
 */
import type { BrainEngine } from "../engine.ts";
import {
  extractCaseFactsDeterministic,
  groundLlmCaseFacts,
  groundLlmParties,
  mergeCaseFacts,
  type CaseFacts,
  type ExtractedParty,
} from "./case-facts.ts";

export type IssueSeverity = "low" | "medium" | "high" | "critical";

export interface DocumentIssue {
  issue: string;
  severity: IssueSeverity;
  /** Verbatim span from the document that anchors this issue. Required. */
  quote: string;
  rationale: string;
}

export interface DocumentAnalysis {
  slug: string;
  document_type: string;
  /** Party names (kept for existing callers). */
  parties: string[];
  /**
   * Parties with their procedural role (klagende_partei, beklagte_partei, …)
   * and representative — header regex first, model names only if verbatim.
   */
  party_roles: ExtractedParty[];
  /**
   * Aktendaten suggestions: Gericht, Geschäftszahl, Streitwert (+ quote and
   * method). A suggestion for the matter, never written to it here.
   */
  case_facts: Omit<CaseFacts, "parteien">;
  key_dates: Array<{ date: string; what: string }>;
  issues: DocumentIssue[];
  /** Statute references the analysis relies on, e.g. "§ 1295 ABGB". */
  relevant_statutes: string[];
  recommended_actions: string[];
  /** Always true — this is assistive output, never a legal conclusion. */
  attorney_review_required: true;
  /** Grounding/parse notes, e.g. dropped ungrounded issues. */
  warnings: string[];
}

/** Injected LLM call. Returns the model's raw text (expected to be JSON). */
export interface AnalyzeLLM {
  (opts: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

const SYSTEM_PROMPT = `Du bist ein juristischer Analyse-Assistent für Kanzleien (DE/AT/CH-Recht).
Analysiere das übergebene Dokument und gib NUR ein JSON-Objekt zurück (keine Prosa drumherum) mit:
{
  "document_type": "z.B. Kaufvertrag / Mahnung / Klage / Bescheid / NDA / Mietvertrag / Sonstige",
  "parties": [{"name": "Name wie im Dokument", "role": "klagende_partei|beklagte_partei|antragsteller|antragsgegner|beschwerdefuehrer|behoerde|gericht|vertreter|sonstige", "vertreter": "Name des Vertreters wie im Dokument, falls genannt"}],
  "case_facts": {"gericht": "Gericht/Behörde WÖRTLICH", "geschaeftszahl": "Geschäftszahl/Aktenzeichen WÖRTLICH", "streitwert": "Streitwert WÖRTLICH inkl. Betrag"},
  "key_dates": [{"date": "YYYY-MM-DD oder wörtlich wie im Text", "what": "Frist/Termin/Ereignis"}],
  "issues": [{"issue": "kurz", "severity": "low|medium|high|critical", "quote": "WÖRTLICHES Zitat aus dem Dokument, das dieses Problem belegt", "rationale": "rechtliche Begründung mit § wenn möglich"}],
  "relevant_statutes": ["§ 1295 ABGB", "§ 307 BGB"],
  "recommended_actions": ["konkreter nächster Schritt"]
}
HARTE REGEL: Jedes "issue" MUSS ein "quote" enthalten, das WÖRTLICH (Zeichen für Zeichen) im Dokument vorkommt.
Erfinde nichts. Wenn ein Problem nicht durch eine wörtliche Textstelle belegbar ist, nenne es NICHT.
Namen, Gericht, Geschäftszahl und Streitwert nur so, wie sie WÖRTLICH im Dokument stehen; fehlt eine Angabe, lass das Feld weg.
Du triffst keine endgültige rechtliche Bewertung — die anwaltliche Prüfung bleibt erforderlich.`;

/** Normalize whitespace for verbatim quote matching (the model often reflows
 *  line breaks / collapses runs of spaces when it echoes a span). */
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Drop any issue whose `quote` does not appear verbatim (whitespace-normalized)
 * in the document text. Returns the grounded issues + one warning per drop.
 * This is the anti-hallucination gate for analysis.
 */
export function groundIssues(
  issues: DocumentIssue[],
  documentText: string
): { grounded: DocumentIssue[]; warnings: string[] } {
  const haystack = normalizeForMatch(documentText);
  const grounded: DocumentIssue[] = [];
  const warnings: string[] = [];
  for (const it of issues) {
    const q = normalizeForMatch(it.quote ?? "");
    if (q.length >= 8 && haystack.includes(q)) {
      grounded.push(it);
    } else {
      warnings.push(`UNGROUNDED_ISSUE_DROPPED: ${(it.issue ?? "").slice(0, 80)}`);
    }
  }
  return { grounded, warnings };
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const VALID_SEVERITY = new Set<IssueSeverity>(["low", "medium", "high", "critical"]);

/** Coerce the model's `issues` into typed DocumentIssue[] (shape only — grounding is separate). */
function parseIssues(v: unknown): DocumentIssue[] {
  if (!Array.isArray(v)) return [];
  const out: DocumentIssue[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const sev =
      typeof o.severity === "string" && VALID_SEVERITY.has(o.severity as IssueSeverity)
        ? (o.severity as IssueSeverity)
        : "medium";
    if (typeof o.issue !== "string" || typeof o.quote !== "string") continue;
    out.push({
      issue: o.issue,
      severity: sev,
      quote: o.quote,
      rationale: typeof o.rationale === "string" ? o.rationale : "",
    });
  }
  return out;
}

export interface AnalyzeDocumentOpts {
  slug: string;
  sourceId?: string;
  sourceIds?: string[];
  /** Injected LLM. Defaults to the gateway chat adapter. */
  llm?: AnalyzeLLM;
  /** Size of one analysis window (chars). Default 24000. */
  maxChars?: number;
  /** Max windows per document (long files are analysed in parts). Default 8. */
  maxChunks?: number;
}

/** Build the default gateway-backed LLM adapter. Returns null if no chat model
 *  is configured (caller surfaces a graceful "LLM unavailable" message). */
async function defaultLLM(): Promise<AnalyzeLLM | null> {
  const { isAvailable, chat } = await import("../ai/gateway.ts");
  if (!isAvailable("chat") && !isAvailable("expansion")) return null;
  return async ({ system, user, maxTokens }) => {
    const r = await chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: maxTokens ?? 4000,
    });
    return r.text;
  };
}

const MONTHS_DE = [
  ["jänner", "januar", "jan"],
  ["februar", "feber", "feb"],
  ["märz", "maerz", "mär"],
  ["april", "apr"],
  ["mai"],
  ["juni", "jun"],
  ["juli", "jul"],
  ["august", "aug"],
  ["september", "sept", "sep"],
  ["oktober", "okt"],
  ["november", "nov"],
  ["dezember", "dez"],
];

/**
 * A key date is kept only if the document actually carries it: the literal
 * string, or — for an ISO date — one of the usual DACH spellings
 * (12.03.2026, 12.3.2026, 12.03.26, 12. März 2026). A date the model
 * invented would otherwise become a Fristvorschlag.
 */
export function isDateGroundedInText(date: string, text: string): boolean {
  const hay = text.toLowerCase();
  const needle = date.trim().toLowerCase();
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(needle);
  if (!m) return false;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  const dn = String(Number(d));
  const mn = String(Number(mo));
  const yy = y.slice(2);
  const numeric = [
    `${d}.${mo}.${y}`,
    `${dn}.${mn}.${y}`,
    `${d}.${mo}.${yy}`,
    `${dn}.${mn}.${yy}`,
    `${dn}. ${mn}. ${y}`,
    `${d}/${mo}/${y}`,
  ];
  if (numeric.some((n) => hay.includes(n))) return true;
  const names = MONTHS_DE[Number(mo) - 1] ?? [];
  return names.some(
    (name) => hay.includes(`${dn}. ${name} ${y}`) || hay.includes(`${d}. ${name} ${y}`)
  );
}

/** Warnings that mean the model produced NO usable analysis. */
export const FATAL_ANALYSIS_WARNINGS = [
  "NO_LLM_AVAILABLE",
  "LLM_CALL_FAILED",
  "LLM_OUTPUT_NOT_JSON",
];

/** True when the analysis is empty because the model failed — callers must
 *  surface this as a failure, never as "analysed, nothing found". */
export function isAnalysisFailed(a: Pick<DocumentAnalysis, "warnings">): boolean {
  return a.warnings.some((w) => FATAL_ANALYSIS_WARNINGS.some((f) => w.startsWith(f)));
}

/** Split long documents into overlapping windows so late passages (e.g. the
 *  Rechtsmittelbelehrung at the end of a Bescheid) are analysed too. */
export function splitForAnalysis(
  text: string,
  maxChars: number,
  maxChunks: number,
  overlap = 1000
): { chunks: string[]; truncated: boolean } {
  if (text.length <= maxChars) return { chunks: [text], truncated: false };
  const step = Math.max(1, maxChars - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < text.length && chunks.length < maxChunks; start += step) {
    chunks.push(text.slice(start, start + maxChars));
    if (start + maxChars >= text.length) break;
  }
  const covered = (chunks.length - 1) * step + maxChars;
  return { chunks, truncated: covered < text.length };
}

/**
 * Analyze a single document page. Loads its text, runs structured issue-spotting,
 * then GROUNDS every issue against the document (dropping fabrications).
 */
export async function analyzeDocument(
  engine: BrainEngine,
  opts: AnalyzeDocumentOpts
): Promise<DocumentAnalysis> {
  const warnings: string[] = [];
  const page = await engine.getPage(opts.slug, {
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (!page) {
    throw new Error(`analyze-document: page not found: ${opts.slug}`);
  }
  const documentText = String((page as { compiled_truth?: string }).compiled_truth ?? "");
  const maxChars = opts.maxChars ?? 24000;
  const maxChunks = opts.maxChunks ?? 8;
  const { chunks, truncated } = splitForAnalysis(documentText, maxChars, maxChunks);
  if (truncated) {
    warnings.push(
      `DOCUMENT_TRUNCATED_FOR_ANALYSIS: ${documentText.length} chars, analysed ${chunks.length} parts`
    );
  }

  const llm = opts.llm ?? (await defaultLLM());
  const empty: DocumentAnalysis = {
    slug: opts.slug,
    document_type: "Unbekannt",
    parties: [],
    party_roles: [],
    case_facts: {},
    key_dates: [],
    issues: [],
    relevant_statutes: [],
    recommended_actions: [],
    attorney_review_required: true,
    warnings,
  };
  if (!llm) {
    warnings.push("NO_LLM_AVAILABLE");
    return empty;
  }

  // Every part must succeed: a partial analysis would silently miss the
  // deadlines of the failed part, which is worse than an explicit failure.
  const parts: Record<string, unknown>[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const label = chunks.length > 1 ? ` teil="${i + 1}/${chunks.length}"` : "";
    const user = `<dokument slug="${opts.slug}"${label}>\n${chunks[i]}\n</dokument>`;
    let raw: string;
    try {
      raw = await llm({ system: SYSTEM_PROMPT, user, maxTokens: 4000 });
    } catch (e) {
      warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
      return empty;
    }
    const parsedPart = tryParseJSON(raw);
    if (!parsedPart) {
      warnings.push("LLM_OUTPUT_NOT_JSON");
      return empty;
    }
    parts.push(parsedPart);
  }
  const parsed = parts[0]!;

  const rawIssues = parts.flatMap((p) => parseIssues(p.issues));
  const { grounded, warnings: groundWarnings } = groundIssues(rawIssues, documentText);
  for (const w of groundWarnings) warnings.push(w);
  if (grounded.length < rawIssues.length) {
    warnings.push(`DROPPED_${rawIssues.length - grounded.length}_UNGROUNDED_ISSUES`);
  }

  const seenDates = new Set<string>();
  let droppedDates = 0;
  const keyDates = parts.flatMap((p) =>
    Array.isArray(p.key_dates)
      ? (p.key_dates as unknown[]).flatMap((d) => {
          if (typeof d !== "object" || d === null) return [];
          const o = d as Record<string, unknown>;
          if (typeof o.date !== "string") return [];
          if (!isDateGroundedInText(o.date, documentText)) {
            droppedDates++;
            return [];
          }
          const what = typeof o.what === "string" ? o.what : "";
          const key = `${o.date}|${what}`;
          if (seenDates.has(key)) return [];
          seenDates.add(key);
          return [{ date: o.date, what }];
        })
      : []
  );
  if (droppedDates > 0) warnings.push(`DROPPED_${droppedDates}_UNGROUNDED_DATES`);

  const union = (field: string) => [...new Set(parts.flatMap((p) => asStringArray(p[field])))];

  // Aktendaten: header regex first; model values only where regex found
  // nothing and only if they stand verbatim in the document.
  const llmFacts = parts.reduce<CaseFacts>(
    (acc, p) =>
      mergeCaseFacts(acc, {
        ...groundLlmCaseFacts(p.case_facts, documentText),
        parteien: groundLlmParties(p.parties, documentText),
      }),
    { parteien: [] }
  );
  const { parteien: partyRoles, ...caseFacts } = mergeCaseFacts(
    extractCaseFactsDeterministic(documentText),
    llmFacts
  );
  // Names for existing callers: model strings and objects alike (an object
  // used to vanish here), plus the grounded role parties.
  const partyNames = [
    ...new Set([
      ...parts.flatMap((p) =>
        Array.isArray(p.parties)
          ? (p.parties as unknown[]).flatMap((x) =>
              typeof x === "string"
                ? [x]
                : x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string"
                  ? [(x as { name: string }).name]
                  : []
            )
          : []
      ),
      ...partyRoles.map((p) => p.name),
    ]),
  ].filter((n) => n.trim().length > 0);

  return {
    slug: opts.slug,
    document_type: typeof parsed.document_type === "string" ? parsed.document_type : "Unbekannt",
    parties: partyNames,
    party_roles: partyRoles,
    case_facts: caseFacts,
    key_dates: keyDates,
    issues: grounded,
    relevant_statutes: union("relevant_statutes"),
    recommended_actions: union("recommended_actions"),
    attorney_review_required: true,
    warnings,
  };
}
