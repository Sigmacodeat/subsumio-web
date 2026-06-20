/**
 * obligation-extract — extract contractual obligations, deadlines, renewal
 * triggers, and payment terms from a contract or legal document. Returns
 * structured obligations with dates, parties, and urgency classification.
 */
import type { BrainEngine } from '../engine.ts';
import {
  type LegalLLM,
  clipText,
  defaultLegalLLM,
  resolveDocumentText,
  tryParseJSON,
  asStringArray,
} from './llm-util.ts';

export interface ObligationEntry {
  description: string;
  obligated_party: string;
  counterparty: string;
  type: 'payment' | 'notice' | 'delivery' | 'performance' | 'compliance' | 'renewal' | 'termination' | 'other';
  trigger_date?: string;
  recurring?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  clause_reference?: string;
  notes?: string;
}

export interface ObligationExtractionResult {
  obligations: ObligationEntry[];
  renewal_dates: Array<{ date: string; description: string; auto_renew: boolean }>;
  payment_terms: Array<{ due_date: string; amount?: string; description: string }>;
  notice_periods: Array<{ event: string; notice_period: string; days: number }>;
  summary: string;
  warnings: string[];
  attorney_review_required: true;
}

export interface ObligationExtractOpts {
  slug?: string;
  text?: string;
  jurisdiction?: 'at' | 'de' | 'ch' | 'all';
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

function buildSystem(jurisdiction: string): string {
  return `You are a contract analysis expert specializing in obligation extraction for ${jurisdiction === 'all' ? 'DACH (AT/DE/CH)' : jurisdiction.toUpperCase()} jurisdiction.

Analyze the provided contract or legal document and extract ALL contractual obligations, deadlines, renewal triggers, payment terms, and notice periods.

For each obligation, identify:
- What must be done (description)
- Who must do it (obligated_party)
- Who benefits (counterparty)
- The type of obligation (payment, notice, delivery, performance, compliance, renewal, termination, other)
- When it must be done (trigger_date in ISO format YYYY-MM-DD if determinable)
- Whether it's recurring and how often
- Urgency level (critical = within 30 days, high = within 90 days, medium = within 1 year, low = no specific deadline or > 1 year)
- The clause or section reference if identifiable
- Any relevant notes

Also extract:
- renewal_dates: All auto-renewal or expiration dates
- payment_terms: All payment obligations with due dates and amounts
- notice_periods: All notice requirements with the event, period text, and calculated days

Return a JSON object:
{
  "obligations": [...],
  "renewal_dates": [...],
  "payment_terms": [...],
  "notice_periods": [...],
  "summary": "brief overview of the contract's key obligations"
}

Be thorough. Missing an obligation can have legal consequences. When in doubt, include it.`;
}

export async function extractObligations(
  engine: BrainEngine,
  opts: ObligationExtractOpts,
): Promise<ObligationExtractionResult> {
  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    return {
      obligations: [],
      renewal_dates: [],
      payment_terms: [],
      notice_periods: [],
      summary: '',
      warnings: ['LLM_NOT_CONFIGURED: No chat model available for obligation extraction.'],
      attorney_review_required: true,
    };
  }

  const { text, sourceSlug, notFound } = await resolveDocumentText(engine, {
    slug: opts.slug,
    text: opts.text,
    sourceId: opts.sourceId,
    sourceIds: opts.sourceIds,
  });

  if (notFound) {
    return {
      obligations: [],
      renewal_dates: [],
      payment_terms: [],
      notice_periods: [],
      summary: '',
      warnings: [`DOCUMENT_NOT_FOUND: slug "${sourceSlug}" does not exist.`],
      attorney_review_required: true,
    };
  }

  if (!text.trim()) {
    return {
      obligations: [],
      renewal_dates: [],
      payment_terms: [],
      notice_periods: [],
      summary: '',
      warnings: ['NO_TEXT: No text provided for obligation extraction.'],
      attorney_review_required: true,
    };
  }

  const maxChars = opts.maxChars ?? 50_000;
  const { clipped, warning } = clipText(text, maxChars);
  const warnings: string[] = [];
  if (warning) warnings.push(warning);

  const jurisdiction = opts.jurisdiction ?? 'all';
  const system = buildSystem(jurisdiction);
  const userPrompt = `Extract all obligations from the following document:\n\n${clipped}`;

  const raw = await llm({ system, user: userPrompt, maxTokens: 8000 });
  const parsed = tryParseJSON(raw);

  if (!parsed) {
    return {
      obligations: [],
      renewal_dates: [],
      payment_terms: [],
      notice_periods: [],
      summary: raw.trim().slice(0, 500),
      warnings: ['UNSTRUCTURED_OUTPUT: Model returned plain text instead of JSON.'],
      attorney_review_required: true,
    };
  }

  const obligations: ObligationEntry[] = Array.isArray(parsed.obligations)
    ? parsed.obligations
        .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
        .map((o) => ({
          description: String(o.description ?? ''),
          obligated_party: String(o.obligated_party ?? ''),
          counterparty: String(o.counterparty ?? ''),
          type: (['payment', 'notice', 'delivery', 'performance', 'compliance', 'renewal', 'termination', 'other'].includes(String(o.type)) ? o.type : 'other') as ObligationEntry['type'],
          ...(typeof o.trigger_date === 'string' ? { trigger_date: o.trigger_date } : {}),
          ...(typeof o.recurring === 'string' ? { recurring: o.recurring as ObligationEntry['recurring'] } : {}),
          urgency: (['low', 'medium', 'high', 'critical'].includes(String(o.urgency)) ? o.urgency : 'medium') as ObligationEntry['urgency'],
          ...(typeof o.clause_reference === 'string' ? { clause_reference: o.clause_reference } : {}),
          ...(typeof o.notes === 'string' ? { notes: o.notes } : {}),
        }))
        .filter((o) => o.description)
    : [];

  const renewalDates = Array.isArray(parsed.renewal_dates)
    ? parsed.renewal_dates
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          date: String(r.date ?? ''),
          description: String(r.description ?? ''),
          auto_renew: Boolean(r.auto_renew ?? false),
        }))
        .filter((r) => r.date)
    : [];

  const paymentTerms = Array.isArray(parsed.payment_terms)
    ? parsed.payment_terms
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({
          due_date: String(p.due_date ?? ''),
          ...(typeof p.amount === 'string' ? { amount: p.amount } : {}),
          description: String(p.description ?? ''),
        }))
        .filter((p) => p.due_date || p.description)
    : [];

  const noticePeriods = Array.isArray(parsed.notice_periods)
    ? parsed.notice_periods
        .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
        .map((n) => ({
          event: String(n.event ?? ''),
          notice_period: String(n.notice_period ?? ''),
          days: typeof n.days === 'number' ? n.days : 0,
        }))
        .filter((n) => n.event)
    : [];

  return {
    obligations,
    renewal_dates: renewalDates,
    payment_terms: paymentTerms,
    notice_periods: noticePeriods,
    summary: String(parsed.summary ?? ''),
    warnings,
    attorney_review_required: true,
  };
}
