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
import type { BrainEngine } from '../engine.ts';

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

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
  parties: string[];
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
  "parties": ["Partei A", "Partei B"],
  "key_dates": [{"date": "YYYY-MM-DD oder wörtlich wie im Text", "what": "Frist/Termin/Ereignis"}],
  "issues": [{"issue": "kurz", "severity": "low|medium|high|critical", "quote": "WÖRTLICHES Zitat aus dem Dokument, das dieses Problem belegt", "rationale": "rechtliche Begründung mit § wenn möglich"}],
  "relevant_statutes": ["§ 1295 ABGB", "§ 307 BGB"],
  "recommended_actions": ["konkreter nächster Schritt"]
}
HARTE REGEL: Jedes "issue" MUSS ein "quote" enthalten, das WÖRTLICH (Zeichen für Zeichen) im Dokument vorkommt.
Erfinde nichts. Wenn ein Problem nicht durch eine wörtliche Textstelle belegbar ist, nenne es NICHT.
Du triffst keine endgültige rechtliche Bewertung — die anwaltliche Prüfung bleibt erforderlich.`;

/** Normalize whitespace for verbatim quote matching (the model often reflows
 *  line breaks / collapses runs of spaces when it echoes a span). */
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Drop any issue whose `quote` does not appear verbatim (whitespace-normalized)
 * in the document text. Returns the grounded issues + one warning per drop.
 * This is the anti-hallucination gate for analysis.
 */
export function groundIssues(
  issues: DocumentIssue[],
  documentText: string,
): { grounded: DocumentIssue[]; warnings: string[] } {
  const haystack = normalizeForMatch(documentText);
  const grounded: DocumentIssue[] = [];
  const warnings: string[] = [];
  for (const it of issues) {
    const q = normalizeForMatch(it.quote ?? '');
    if (q.length >= 8 && haystack.includes(q)) {
      grounded.push(it);
    } else {
      warnings.push(`UNGROUNDED_ISSUE_DROPPED: ${(it.issue ?? '').slice(0, 80)}`);
    }
  }
  return { grounded, warnings };
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* ignore */ } }
    return null;
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const VALID_SEVERITY = new Set<IssueSeverity>(['low', 'medium', 'high', 'critical']);

/** Coerce the model's `issues` into typed DocumentIssue[] (shape only — grounding is separate). */
function parseIssues(v: unknown): DocumentIssue[] {
  if (!Array.isArray(v)) return [];
  const out: DocumentIssue[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const sev = typeof o.severity === 'string' && VALID_SEVERITY.has(o.severity as IssueSeverity)
      ? (o.severity as IssueSeverity) : 'medium';
    if (typeof o.issue !== 'string' || typeof o.quote !== 'string') continue;
    out.push({
      issue: o.issue,
      severity: sev,
      quote: o.quote,
      rationale: typeof o.rationale === 'string' ? o.rationale : '',
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
  /** Cap the document text sent to the model (chars). Default 24000. */
  maxChars?: number;
}

/** Build the default gateway-backed LLM adapter. Returns null if no chat model
 *  is configured (caller surfaces a graceful "LLM unavailable" message). */
async function defaultLLM(): Promise<AnalyzeLLM | null> {
  const { isAvailable, chat } = await import('../ai/gateway.ts');
  if (!isAvailable('chat') && !isAvailable('expansion')) return null;
  return async ({ system, user, maxTokens }) => {
    const r = await chat({ system, messages: [{ role: 'user', content: user }], maxTokens: maxTokens ?? 4000 });
    return r.text;
  };
}

/**
 * Analyze a single document page. Loads its text, runs structured issue-spotting,
 * then GROUNDS every issue against the document (dropping fabrications).
 */
export async function analyzeDocument(
  engine: BrainEngine,
  opts: AnalyzeDocumentOpts,
): Promise<DocumentAnalysis> {
  const warnings: string[] = [];
  const page = await engine.getPage(opts.slug, {
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (!page) {
    throw new Error(`analyze-document: page not found: ${opts.slug}`);
  }
  const documentText = String((page as { compiled_truth?: string }).compiled_truth ?? '');
  const maxChars = opts.maxChars ?? 24000;
  const clipped = documentText.slice(0, maxChars);
  if (documentText.length > maxChars) {
    warnings.push(`DOCUMENT_TRUNCATED_FOR_ANALYSIS: ${documentText.length} → ${maxChars} chars`);
  }

  const llm = opts.llm ?? (await defaultLLM());
  const empty: DocumentAnalysis = {
    slug: opts.slug, document_type: 'Unbekannt', parties: [], key_dates: [],
    issues: [], relevant_statutes: [], recommended_actions: [],
    attorney_review_required: true, warnings,
  };
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const user = `<dokument slug="${opts.slug}">\n${clipped}\n</dokument>`;
  let raw: string;
  try {
    raw = await llm({ system: SYSTEM_PROMPT, user, maxTokens: 4000 });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : 'unknown'}`);
    return empty;
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push('LLM_OUTPUT_NOT_JSON');
    return empty;
  }

  const rawIssues = parseIssues(parsed.issues);
  const { grounded, warnings: groundWarnings } = groundIssues(rawIssues, documentText);
  for (const w of groundWarnings) warnings.push(w);
  if (grounded.length < rawIssues.length) {
    warnings.push(`DROPPED_${rawIssues.length - grounded.length}_UNGROUNDED_ISSUES`);
  }

  const keyDates = Array.isArray(parsed.key_dates)
    ? (parsed.key_dates as unknown[]).flatMap((d) => {
        if (typeof d !== 'object' || d === null) return [];
        const o = d as Record<string, unknown>;
        if (typeof o.date !== 'string') return [];
        return [{ date: o.date, what: typeof o.what === 'string' ? o.what : '' }];
      })
    : [];

  return {
    slug: opts.slug,
    document_type: typeof parsed.document_type === 'string' ? parsed.document_type : 'Unbekannt',
    parties: asStringArray(parsed.parties),
    key_dates: keyDates,
    issues: grounded,
    relevant_statutes: asStringArray(parsed.relevant_statutes),
    recommended_actions: asStringArray(parsed.recommended_actions),
    attorney_review_required: true,
    warnings,
  };
}
