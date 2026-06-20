/**
 * risk-analysis — clause-level risk scoring for contracts and legal documents.
 * Each flagged clause carries a verbatim `text_excerpt` that is grounded
 * against the source (fabricated clauses are dropped). Produces an overall
 * 0–100 score + coarse level, red flags and missing-clause hints.
 */
import type { BrainEngine } from '../engine.ts';
import {
  type LegalLLM,
  type RiskLevel,
  asRiskLevel,
  asScore,
  asStringArray,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  normalizeForMatch,
  resolveDocumentText,
  scoreToLevel,
  tryParseJSON,
} from './llm-util.ts';

export interface ClauseRisk {
  clause_type: string;
  text_excerpt: string;
  score: number;
  level: RiskLevel;
  issue: string;
  recommendation: string;
  legal_basis: string;
}

export interface RiskAnalysis {
  overall_score: number;
  overall_level: RiskLevel;
  clause_risks: ClauseRisk[];
  summary: string;
  red_flags: string[];
  missing_clauses: string[];
  attorney_review_required: true;
  warnings: string[];
}

export interface RiskAnalysisOpts {
  slug?: string;
  text?: string;
  contract_type?: string;
  jurisdiction?: string;
  perspective?: 'party_a' | 'party_b' | 'neutral';
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

function buildSystem(contractType: string, jurisdiction: string, perspective: string): string {
  const persp =
    perspective === 'party_a'
      ? 'Bewerte aus Sicht von Partei A (Auftraggeber/erste Partei).'
      : perspective === 'party_b'
        ? 'Bewerte aus Sicht von Partei B (Auftragnehmer/zweite Partei).'
        : 'Bewerte neutral aus Sicht beider Parteien.';
  const typeHint = contractType ? `Vertragstyp: ${contractType}.` : '';
  return `Du bist ein juristischer Risiko-Analyst für Verträge (Recht: ${jurisdictionLabel(jurisdiction)}).
${typeHint} ${persp}
Identifiziere riskante Klauseln, bewerte jede mit 0–100 (0=unkritisch, 100=kritisch),
und nenne fehlende, aber übliche Schutzklauseln.
Gib NUR ein JSON-Objekt zurück:
{
  "summary": "Gesamteinschätzung in 2-3 Sätzen",
  "clause_risks": [
    {
      "clause_type": "z.B. Haftungsbeschränkung / Vertragsstrafe / Kündigung",
      "text_excerpt": "WÖRTLICHES Zitat der Klausel aus dem Dokument",
      "score": 0,
      "issue": "worin das Risiko besteht",
      "recommendation": "konkrete Verbesserung",
      "legal_basis": "§ falls einschlägig, sonst leer"
    }
  ],
  "red_flags": ["besonders kritische Punkte in Kurzform"],
  "missing_clauses": ["übliche Klausel die fehlt"]
}
HARTE REGEL: "text_excerpt" MUSS WÖRTLICH im Dokument vorkommen. Erfinde keine Klauseln.
Dies ersetzt keine anwaltliche Prüfung.`;
}

function parseClauseRisks(v: unknown): ClauseRisk[] {
  if (!Array.isArray(v)) return [];
  const out: ClauseRisk[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.text_excerpt !== 'string') continue;
    const score = asScore(o.score, 0);
    out.push({
      clause_type: typeof o.clause_type === 'string' ? o.clause_type : 'Sonstige',
      text_excerpt: o.text_excerpt,
      score,
      level: asRiskLevel(o.level, scoreToLevel(score)),
      issue: typeof o.issue === 'string' ? o.issue : '',
      recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
      legal_basis: typeof o.legal_basis === 'string' ? o.legal_basis : '',
    });
  }
  return out;
}

export async function analyzeRisk(
  engine: BrainEngine,
  opts: RiskAnalysisOpts,
): Promise<RiskAnalysis> {
  const warnings: string[] = [];
  const jurisdiction = opts.jurisdiction ?? 'all';
  const perspective = opts.perspective ?? 'neutral';
  const contractType = opts.contract_type ?? '';

  const resolved = await resolveDocumentText(engine, {
    ...(opts.slug !== undefined ? { slug: opts.slug } : {}),
    ...(opts.text !== undefined ? { text: opts.text } : {}),
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (resolved.notFound) throw new Error(`risk-analysis: page not found: ${resolved.sourceSlug}`);

  const empty: RiskAnalysis = {
    overall_score: 0,
    overall_level: 'low',
    clause_risks: [],
    summary: '',
    red_flags: [],
    missing_clauses: [],
    attorney_review_required: true,
    warnings,
  };
  if (!resolved.text.trim()) {
    warnings.push('NO_DOCUMENT_TEXT');
    return empty;
  }

  const { clipped, warning } = clipText(resolved.text, opts.maxChars ?? 30000);
  if (warning) warnings.push(warning);

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const user = `<vertrag>\n${clipped}\n</vertrag>`;
  let raw: string;
  try {
    raw = await llm({
      system: buildSystem(contractType, jurisdiction, perspective),
      user,
      maxTokens: 4000,
    });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : 'unknown'}`);
    return empty;
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push('LLM_OUTPUT_NOT_JSON');
    return empty;
  }

  const rawClauses = parseClauseRisks(parsed.clause_risks);
  // Ground every clause excerpt against the document; drop fabrications.
  const haystack = normalizeForMatch(resolved.text);
  const clause_risks = rawClauses.filter((c) => {
    const n = normalizeForMatch(c.text_excerpt);
    return n.length >= 8 && haystack.includes(n);
  });
  if (clause_risks.length < rawClauses.length) {
    warnings.push(`DROPPED_${rawClauses.length - clause_risks.length}_UNGROUNDED_CLAUSES`);
  }

  // Overall score = max clause score (a contract is as risky as its worst clause),
  // falling back to the model's own number when no clauses survived grounding.
  const maxClause = clause_risks.reduce((m, c) => Math.max(m, c.score), 0);
  const overall_score = clause_risks.length > 0 ? maxClause : asScore(parsed.overall_score, 0);

  return {
    overall_score,
    overall_level: scoreToLevel(overall_score),
    clause_risks,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    red_flags: asStringArray(parsed.red_flags),
    missing_clauses: asStringArray(parsed.missing_clauses),
    attorney_review_required: true,
    warnings,
  };
}
