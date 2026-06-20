/**
 * document-review — Q&A-style review of a single document with grounded,
 * verbatim-anchored answers (the "Vault → AI Review" workflow).
 *
 * Given a document (text or brain slug) and optional reviewer questions, it
 * returns per-question findings. Every finding carries `citations` that MUST
 * appear verbatim in the document; ungrounded findings are dropped so the
 * brain can't fabricate an answer the document doesn't support.
 */
import type { BrainEngine } from '../engine.ts';
import {
  type LegalLLM,
  type RiskLevel,
  asRiskLevel,
  asStringArray,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  normalizeForMatch,
  resolveDocumentText,
  tryParseJSON,
} from './llm-util.ts';

export interface ReviewFinding {
  question: string;
  answer: string;
  /** Verbatim spans from the document that support the answer. */
  citations: string[];
  risk_level: RiskLevel;
}

export interface DocumentReview {
  summary: string;
  findings: ReviewFinding[];
  overall_risk: RiskLevel;
  attorney_review_required: true;
  warnings: string[];
}

export interface DocumentReviewOpts {
  slug?: string;
  text?: string;
  questions?: string[];
  focus?: 'clauses' | 'risks' | 'compliance' | 'general';
  jurisdiction?: string;
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

function buildSystem(focus: string, jurisdiction: string): string {
  const focusHint =
    focus === 'clauses'
      ? 'Konzentriere dich auf einzelne Klauseln und ihre Wirkung.'
      : focus === 'risks'
        ? 'Konzentriere dich auf rechtliche Risiken und Nachteile.'
        : focus === 'compliance'
          ? 'Konzentriere dich auf Compliance- und Regelkonformität.'
          : 'Allgemeine juristische Prüfung.';
  return `Du bist ein juristischer Prüf-Assistent für Kanzleien (Recht: ${jurisdictionLabel(jurisdiction)}).
${focusHint}
Beantworte die gestellten Prüffragen AUSSCHLIESSLICH auf Basis des Dokuments.
Gib NUR ein JSON-Objekt zurück (keine Prosa drumherum):
{
  "summary": "2-3 Sätze Gesamteinschätzung",
  "overall_risk": "low|medium|high|critical",
  "findings": [
    {
      "question": "die Prüffrage (wörtlich übernommen)",
      "answer": "präzise Antwort, nur aus dem Dokument abgeleitet",
      "citations": ["WÖRTLICHES Zitat aus dem Dokument, das die Antwort belegt"],
      "risk_level": "low|medium|high|critical"
    }
  ]
}
HARTE REGEL: Jedes "citations"-Element MUSS WÖRTLICH (Zeichen für Zeichen) im Dokument vorkommen.
Wenn eine Frage nicht aus dem Dokument beantwortbar ist, sage das offen in "answer" und lass "citations" leer.
Du triffst keine endgültige rechtliche Bewertung — anwaltliche Prüfung bleibt erforderlich.`;
}

function parseFindings(v: unknown): ReviewFinding[] {
  if (!Array.isArray(v)) return [];
  const out: ReviewFinding[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.question !== 'string' || typeof o.answer !== 'string') continue;
    out.push({
      question: o.question,
      answer: o.answer,
      citations: asStringArray(o.citations),
      risk_level: asRiskLevel(o.risk_level, 'low'),
    });
  }
  return out;
}

const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export async function reviewDocument(
  engine: BrainEngine,
  opts: DocumentReviewOpts,
): Promise<DocumentReview> {
  const warnings: string[] = [];
  const jurisdiction = opts.jurisdiction ?? 'all';
  const focus = opts.focus ?? 'general';
  const questions = (opts.questions ?? []).slice(0, 20);

  const resolved = await resolveDocumentText(engine, {
    ...(opts.slug !== undefined ? { slug: opts.slug } : {}),
    ...(opts.text !== undefined ? { text: opts.text } : {}),
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (resolved.notFound) throw new Error(`document-review: page not found: ${resolved.sourceSlug}`);

  const empty: DocumentReview = {
    summary: '',
    findings: [],
    overall_risk: 'low',
    attorney_review_required: true,
    warnings,
  };
  if (!resolved.text.trim()) {
    warnings.push('NO_DOCUMENT_TEXT');
    return empty;
  }

  const { clipped, warning } = clipText(resolved.text, opts.maxChars ?? 24000);
  if (warning) warnings.push(warning);

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const defaultQuestions = [
    'Welche wesentlichen Pflichten und Rechte ergeben sich aus dem Dokument?',
    'Welche Fristen oder Termine sind enthalten?',
    'Welche rechtlichen Risiken bestehen?',
  ];
  const effectiveQuestions = questions.length > 0 ? questions : defaultQuestions;

  const user = `Prüffragen:\n${effectiveQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n<dokument>\n${clipped}\n</dokument>`;

  let raw: string;
  try {
    raw = await llm({ system: buildSystem(focus, jurisdiction), user, maxTokens: 4000 });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : 'unknown'}`);
    return empty;
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push('LLM_OUTPUT_NOT_JSON');
    return empty;
  }

  const findings = parseFindings(parsed.findings);

  // Ground each finding's citations against the document; drop fabricated quotes.
  const haystack = normalizeForMatch(resolved.text);
  let droppedCitations = 0;
  for (const f of findings) {
    const kept = f.citations.filter((c) => {
      const n = normalizeForMatch(c);
      const ok = n.length >= 8 && haystack.includes(n);
      if (!ok) droppedCitations++;
      return ok;
    });
    f.citations = kept;
  }
  if (droppedCitations > 0) warnings.push(`DROPPED_${droppedCitations}_UNGROUNDED_CITATIONS`);

  const overallFromModel = asRiskLevel(parsed.overall_risk, 'low');
  const overallFromFindings = findings.reduce<RiskLevel>(
    (max, f) => (RISK_ORDER.indexOf(f.risk_level) > RISK_ORDER.indexOf(max) ? f.risk_level : max),
    'low',
  );
  const overall_risk =
    RISK_ORDER.indexOf(overallFromModel) >= RISK_ORDER.indexOf(overallFromFindings)
      ? overallFromModel
      : overallFromFindings;

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    findings,
    overall_risk,
    attorney_review_required: true,
    warnings,
  };
}
