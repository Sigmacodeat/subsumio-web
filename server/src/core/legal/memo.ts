/**
 * memo — generates a structured legal memorandum (Sachverhalt → Rechtsfragen →
 * rechtliche Würdigung → Ergebnis) for a given question + facts. Generative by
 * nature (no source document to quote-ground), so the load-bearing guarantee
 * here is the explicit attorney-review flag + statute references the firm can
 * verify, never an autonomous legal conclusion.
 */
import type { BrainEngine } from '../engine.ts';
import {
  type LegalLLM,
  asStringArray,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  loadPageText,
  tryParseJSON,
} from './llm-util.ts';

export interface LegalMemo {
  memo_markdown: string;
  sections: {
    sachverhalt: string;
    rechtsfragen: string;
    wuerdigung: string;
    ergebnis: string;
  };
  statutes: string[];
  attorney_review_required: true;
  warnings: string[];
}

export interface MemoOpts {
  question: string;
  facts: string;
  jurisdiction: 'at' | 'de' | 'ch';
  legal_area?: string;
  case_slug?: string;
  language?: 'de' | 'en';
  depth?: 'brief' | 'standard' | 'comprehensive';
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
}

function buildSystem(
  jurisdiction: string,
  legalArea: string,
  depth: string,
  language: 'de' | 'en',
): string {
  const depthHint =
    depth === 'brief'
      ? 'Kurzgutachten: knappe Würdigung, Kernergebnis.'
      : depth === 'comprehensive'
        ? 'Ausführliches Gutachten: gründliche Subsumtion, Gegenansichten, Eventualitäten.'
        : 'Standardgutachten: solide Würdigung im Gutachtenstil.';
  const areaHint = legalArea ? `Rechtsgebiet: ${legalArea}.` : '';
  const langHint = language === 'en' ? 'Antworte auf Englisch.' : 'Antworte auf Deutsch.';
  return `Du bist ein juristischer Gutachten-Assistent (Recht: ${jurisdictionLabel(jurisdiction)}).
${areaHint} ${depthHint} ${langHint}
Erstelle ein Rechtsgutachten im Gutachtenstil. Nenne einschlägige §§, aber erfinde KEINE Normen
oder Fundstellen. Wenn du eine Norm nicht sicher kennst, beschreibe das Prinzip statt eine §-Zahl zu raten.
Gib NUR ein JSON-Objekt zurück:
{
  "sections": {
    "sachverhalt": "geordnete Sachverhaltsdarstellung",
    "rechtsfragen": "die zu klärenden Rechtsfragen",
    "wuerdigung": "rechtliche Würdigung / Subsumtion (Gutachtenstil)",
    "ergebnis": "klares Ergebnis mit Handlungsempfehlung"
  },
  "statutes": ["§ 1295 ABGB", "..."]
}
Dies ist ein KI-Entwurf und ersetzt keine anwaltliche Prüfung und Freigabe.`;
}

function buildMarkdown(s: LegalMemo['sections'], statutes: string[], language: 'de' | 'en'): string {
  const t =
    language === 'en'
      ? { h: 'Legal Memorandum', a: 'Facts', b: 'Legal Questions', c: 'Analysis', d: 'Conclusion', e: 'Statutes', note: 'AI draft — attorney review and approval required (EU AI Act Art. 50).' }
      : { h: 'Rechtsgutachten', a: 'Sachverhalt', b: 'Rechtsfragen', c: 'Rechtliche Würdigung', d: 'Ergebnis', e: 'Einschlägige Normen', note: 'KI-Entwurf — anwaltlich zu prüfen und freizugeben (EU AI Act Art. 50).' };
  const lines = [
    `# ${t.h}`,
    `> ${t.note}`,
    '',
    `## ${t.a}`,
    s.sachverhalt,
    '',
    `## ${t.b}`,
    s.rechtsfragen,
    '',
    `## ${t.c}`,
    s.wuerdigung,
    '',
    `## ${t.d}`,
    s.ergebnis,
  ];
  if (statutes.length > 0) {
    lines.push('', `## ${t.e}`, statutes.map((x) => `- ${x}`).join('\n'));
  }
  return lines.join('\n');
}

export async function generateMemo(engine: BrainEngine, opts: MemoOpts): Promise<LegalMemo> {
  const warnings: string[] = [];
  const language = opts.language ?? 'de';
  const depth = opts.depth ?? 'standard';
  const legalArea = opts.legal_area ?? '';

  const empty: LegalMemo = {
    memo_markdown: '',
    sections: { sachverhalt: '', rechtsfragen: '', wuerdigung: '', ergebnis: '' },
    statutes: [],
    attorney_review_required: true,
    warnings,
  };

  // Optional case context from the brain.
  let caseContext = '';
  if (opts.case_slug) {
    const ctx = await loadPageText(engine, opts.case_slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
    });
    if (ctx) caseContext = clipText(ctx, 12000).clipped;
    else warnings.push(`CASE_NOT_FOUND: ${opts.case_slug}`);
  }

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const userParts = [
    `<rechtsfrage>\n${opts.question}\n</rechtsfrage>`,
    `<sachverhalt>\n${clipText(opts.facts, 10000).clipped}\n</sachverhalt>`,
  ];
  if (caseContext) userParts.push(`<aktenkontext>\n${caseContext}\n</aktenkontext>`);

  let raw: string;
  try {
    raw = await llm({
      system: buildSystem(opts.jurisdiction, legalArea, depth, language),
      user: userParts.join('\n\n'),
      maxTokens: depth === 'comprehensive' ? 6000 : 4000,
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

  const so = (parsed.sections && typeof parsed.sections === 'object' ? parsed.sections : {}) as Record<string, unknown>;
  const sections = {
    sachverhalt: typeof so.sachverhalt === 'string' ? so.sachverhalt : '',
    rechtsfragen: typeof so.rechtsfragen === 'string' ? so.rechtsfragen : '',
    wuerdigung: typeof so.wuerdigung === 'string' ? so.wuerdigung : '',
    ergebnis: typeof so.ergebnis === 'string' ? so.ergebnis : '',
  };
  const statutes = asStringArray(parsed.statutes);

  return {
    memo_markdown: buildMarkdown(sections, statutes, language),
    sections,
    statutes,
    attorney_review_required: true,
    warnings,
  };
}
