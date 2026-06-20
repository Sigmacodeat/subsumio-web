/**
 * due-diligence — checklist-driven review across a set of documents (explicit
 * slugs and/or a case slug). Produces a prioritized findings report with a
 * coarse risk level, red flags and recommendations. Each finding references
 * the document(s) it came from via `page_refs`.
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
  loadPageText,
  tryParseJSON,
} from './llm-util.ts';

export type DDStatus = 'ok' | 'attention' | 'missing' | 'unknown';

export interface DDFinding {
  item: string;
  status: DDStatus;
  details: string;
  severity: RiskLevel;
  page_refs: string[];
}

export interface DueDiligenceResult {
  summary: string;
  risk_level: RiskLevel;
  findings: DDFinding[];
  red_flags: string[];
  recommendations: string[];
  attorney_review_required: true;
  warnings: string[];
}

export interface DueDiligenceOpts {
  case_slug?: string;
  document_slugs?: string[];
  category?: 'm_and_a' | 'real_estate' | 'financing' | 'general';
  jurisdiction?: 'at' | 'de' | 'ch';
  checklist?: string[];
  language?: 'de' | 'en';
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

/** Default checklists per DD category (DACH-typical). Overridable via opts.checklist. */
const DEFAULT_CHECKLISTS: Record<string, string[]> = {
  m_and_a: [
    'Gesellschaftsrechtliche Struktur und Anteilsverhältnisse',
    'Wesentliche Verträge und Change-of-Control-Klauseln',
    'Arbeitsrechtliche Verpflichtungen',
    'Anhängige oder drohende Rechtsstreitigkeiten',
    'Gewerbliche Schutzrechte (IP)',
    'Steuerliche Risiken',
    'Datenschutz / DSGVO-Konformität',
  ],
  real_estate: [
    'Eigentumsverhältnisse und Grundbuchstand',
    'Lasten und Beschränkungen (Hypotheken, Dienstbarkeiten)',
    'Baurechtliche Genehmigungen',
    'Mietverträge und Bestandsverhältnisse',
    'Altlasten / Umweltrisiken',
  ],
  financing: [
    'Bestehende Finanzierungen und Sicherheiten',
    'Covenants und Kündigungsrechte',
    'Bürgschaften und Garantien',
    'Rangverhältnisse der Sicherheiten',
  ],
  general: [
    'Vertragliche Hauptpflichten und Risiken',
    'Fristen und Kündigungsrechte',
    'Haftungs- und Gewährleistungsregelungen',
    'Compliance und regulatorische Anforderungen',
  ],
};

function buildSystem(
  category: string,
  jurisdiction: string,
  checklist: string[],
  language: 'de' | 'en',
): string {
  const langHint = language === 'en' ? 'Antworte auf Englisch.' : 'Antworte auf Deutsch.';
  return `Du bist ein Due-Diligence-Assistent für Kanzleien (Recht: ${jurisdictionLabel(jurisdiction)}, Kategorie: ${category}).
Prüfe die bereitgestellten Dokumente gegen die Checkliste. Stütze jede Aussage auf die Dokumente;
erfinde keine Befunde. Wenn etwas fehlt, markiere status "missing". ${langHint}
Checkliste:
${checklist.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Gib NUR ein JSON-Objekt zurück:
{
  "summary": "Gesamteinschätzung in 2-4 Sätzen",
  "risk_level": "low|medium|high|critical",
  "findings": [
    {
      "item": "Checklistenpunkt",
      "status": "ok|attention|missing|unknown",
      "details": "konkrete Feststellung mit Bezug auf das Dokument",
      "severity": "low|medium|high|critical",
      "page_refs": ["slug des betroffenen Dokuments"]
    }
  ],
  "red_flags": ["besonders kritische Punkte"],
  "recommendations": ["empfohlene nächste Schritte"]
}
Dies ersetzt keine anwaltliche Prüfung.`;
}

const VALID_STATUS = new Set<DDStatus>(['ok', 'attention', 'missing', 'unknown']);

function parseFindings(v: unknown, knownSlugs: Set<string>): DDFinding[] {
  if (!Array.isArray(v)) return [];
  const out: DDFinding[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.item !== 'string') continue;
    // Keep only page_refs that correspond to documents we actually supplied.
    const refs = asStringArray(o.page_refs).filter((s) => knownSlugs.size === 0 || knownSlugs.has(s));
    out.push({
      item: o.item,
      status: typeof o.status === 'string' && VALID_STATUS.has(o.status as DDStatus) ? (o.status as DDStatus) : 'unknown',
      details: typeof o.details === 'string' ? o.details : '',
      severity: asRiskLevel(o.severity, 'medium'),
      page_refs: refs,
    });
  }
  return out;
}

export async function runDueDiligence(
  engine: BrainEngine,
  opts: DueDiligenceOpts,
): Promise<DueDiligenceResult> {
  const warnings: string[] = [];
  const category = opts.category ?? 'general';
  const jurisdiction = opts.jurisdiction ?? 'de';
  const language = opts.language ?? 'de';
  const checklist =
    opts.checklist && opts.checklist.length > 0
      ? opts.checklist.slice(0, 100)
      : (DEFAULT_CHECKLISTS[category] ?? DEFAULT_CHECKLISTS.general);

  const empty: DueDiligenceResult = {
    summary: '',
    risk_level: 'low',
    findings: [],
    red_flags: [],
    recommendations: [],
    attorney_review_required: true,
    warnings,
  };

  // Gather document texts from explicit slugs + the case slug.
  const slugs = [...(opts.document_slugs ?? []).slice(0, 50)];
  if (opts.case_slug) slugs.unshift(opts.case_slug);
  const loadOpts = {
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  };

  const docs: Array<{ slug: string; text: string }> = [];
  const knownSlugs = new Set<string>();
  // Budget the total document text so the prompt stays within model limits.
  const perDocCap = Math.floor((opts.maxChars ?? 60000) / Math.max(1, slugs.length));
  for (const slug of slugs) {
    const text = await loadPageText(engine, slug, loadOpts);
    if (text === null) {
      warnings.push(`DOCUMENT_NOT_FOUND: ${slug}`);
      continue;
    }
    if (!text.trim()) continue;
    docs.push({ slug, text: clipText(text, Math.max(2000, perDocCap)).clipped });
    knownSlugs.add(slug);
  }

  if (docs.length === 0) {
    warnings.push('NO_DOCUMENTS_RESOLVED');
    return empty;
  }

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const user = docs.map((d) => `<dokument slug="${d.slug}">\n${d.text}\n</dokument>`).join('\n\n');

  let raw: string;
  try {
    raw = await llm({
      system: buildSystem(category, jurisdiction, checklist, language),
      user,
      maxTokens: 6000,
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

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    risk_level: asRiskLevel(parsed.risk_level, 'medium'),
    findings: parseFindings(parsed.findings, knownSlugs),
    red_flags: asStringArray(parsed.red_flags),
    recommendations: asStringArray(parsed.recommendations),
    attorney_review_required: true,
    warnings,
  };
}
