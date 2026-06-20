/**
 * contract-redline — suggests tracked-changes-style edits to a contract,
 * optionally against a counterparty version or the firm's own clause playbook.
 * Each redline's `original_clause` is grounded against the source text so the
 * model can't rewrite a clause that isn't actually there.
 */
import type { BrainEngine } from '../engine.ts';
import {
  type LegalLLM,
  type RiskLevel,
  asRiskLevel,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  normalizeForMatch,
  tryParseJSON,
} from './llm-util.ts';

export type RedlineChange = 'add' | 'remove' | 'modify';

export interface Redline {
  original_clause: string;
  suggested_text: string;
  change_type: RedlineChange;
  reason: string;
  risk_level: RiskLevel;
  legal_basis?: string;
  playbook_deviation?: PlaybookDeviation;
}

export interface PlaybookDeviation {
  rule_id: string;
  clause_type: string;
  required_position: string;
  deviation_flag: string;
  severity: RiskLevel;
  matched: boolean;
}

export interface ContractRedlineResult {
  redlines: Redline[];
  summary: string;
  accepted_count: number;
  total_changes: number;
  attorney_review_required: true;
  warnings: string[];
  playbook_deviations?: PlaybookDeviation[];
}

export interface ContractRedlineOpts {
  original_text: string;
  counterparty_text?: string;
  playbook_slug?: string;
  contract_type?: string;
  jurisdiction?: string;
  perspective?: 'client' | 'counterparty' | 'neutral';
  language?: 'de' | 'en';
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxChars?: number;
}

interface ParsedPlaybookRule {
  id: string;
  clause_type: string;
  required_position: string;
  deviation_flag: string;
  severity: RiskLevel;
  notes?: string;
}

function parsePlaybookRules(frontmatter: Record<string, unknown> | undefined): ParsedPlaybookRule[] {
  if (!frontmatter || !Array.isArray(frontmatter.rules)) return [];
  return (frontmatter.rules as unknown[])
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      clause_type: typeof r.clause_type === 'string' ? r.clause_type : '',
      required_position: typeof r.required_position === 'string' ? r.required_position : 'neutral',
      deviation_flag: typeof r.deviation_flag === 'string' ? r.deviation_flag : '',
      severity: asRiskLevel(r.severity, 'medium'),
      ...(typeof r.notes === 'string' && r.notes.trim() ? { notes: r.notes } : {}),
    }))
    .filter((r) => r.clause_type && r.deviation_flag);
}

function buildPlaybookSection(rules: ParsedPlaybookRule[], language: 'de' | 'en'): string {
  if (rules.length === 0) return '';
  const header = language === 'en'
    ? 'PLAYBOOK RULES — flag any clause that deviates from these standards:'
    : 'PLAYBOOK-REGELN — markiere jede Klausel, die von diesen Standards abweicht:';
  const lines = rules.map((r, i) =>
    `  ${i + 1}. Klauseltyp: ${r.clause_type} | Soll-Position: ${r.required_position} | Severity: ${r.severity} | Deviation-Flag: ${r.deviation_flag}${r.notes ? ` | Hinweis: ${r.notes}` : ''}`,
  );
  return `${header}\n${lines.join('\n')}\n\nFür jede Redline, die gegen eine Playbook-Regel verstößt, setze das Feld "playbook_deviation" mit { rule_id, clause_type, required_position, deviation_flag, severity, matched: true }.\nFür jede Regel, die im Vertrag korrekt umgesetzt ist, füge einen Eintrag in "playbook_deviations" mit matched: false hinzu.`;
}

function buildSystem(
  contractType: string,
  jurisdiction: string,
  perspective: string,
  language: 'de' | 'en',
  hasCounterparty: boolean,
  hasPlaybook: boolean,
  playbookRules: ParsedPlaybookRule[],
): string {
  const persp =
    perspective === 'client'
      ? 'Optimiere zugunsten des MANDANTEN, ohne unfair zu werden.'
      : perspective === 'counterparty'
        ? 'Bewerte aus Sicht der Gegenpartei.'
        : 'Schlage ausgewogene, marktübliche Änderungen vor.';
  const compareHint = hasCounterparty
    ? 'Vergleiche den Originaltext mit der Gegenpartei-Version und adressiere Abweichungen.'
    : '';
  const playbookHint = hasPlaybook
    ? 'Richte dich nach dem mitgelieferten Klauselhandbuch (Playbook) der Kanzlei.'
    : '';
  const playbookRulesSection = hasPlaybook && playbookRules.length > 0
    ? buildPlaybookSection(playbookRules, language)
    : '';
  const langHint = language === 'en' ? 'Antworte auf Englisch.' : 'Antworte auf Deutsch.';
  return `Du bist ein juristischer Redlining-Assistent (Recht: ${jurisdictionLabel(jurisdiction)}).
${contractType ? `Vertragstyp: ${contractType}.` : ''} ${persp} ${compareHint} ${playbookHint} ${langHint}
Gib NUR ein JSON-Objekt zurück:
{
  "summary": "Was die wichtigsten Änderungen bewirken (2-3 Sätze)",
  "redlines": [
    {
      "original_clause": "WÖRTLICHES Zitat der zu ändernden Stelle aus dem Originaltext (bei change_type 'add' leer lassen)",
      "suggested_text": "der vorgeschlagene neue Wortlaut",
      "change_type": "add|remove|modify",
      "reason": "Begründung der Änderung",
      "risk_level": "low|medium|high",
      "legal_basis": "§ falls einschlägig"
    }
  ]
}
HARTE REGEL: Bei change_type 'modify' oder 'remove' MUSS "original_clause" WÖRTLICH im Originaltext vorkommen.
Erfinde keine Klauseln. Dies ersetzt keine anwaltliche Prüfung.

${playbookRulesSection}

Gib zusätzlich ein Feld "playbook_deviations" zurück: ein Array von Objekten { rule_id, clause_type, required_position, deviation_flag, severity, matched } für Jede Playbook-Regel. matched: true = Deviation gefunden, matched: false = Klausel entspricht der Regel.`;
}

function parseRedlines(v: unknown): Redline[] {
  if (!Array.isArray(v)) return [];
  const valid = new Set<RedlineChange>(['add', 'remove', 'modify']);
  const out: Redline[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.suggested_text !== 'string') continue;
    const change_type = typeof o.change_type === 'string' && valid.has(o.change_type as RedlineChange)
      ? (o.change_type as RedlineChange)
      : 'modify';
    const r: Redline = {
      original_clause: typeof o.original_clause === 'string' ? o.original_clause : '',
      suggested_text: o.suggested_text,
      change_type,
      reason: typeof o.reason === 'string' ? o.reason : '',
      risk_level: asRiskLevel(o.risk_level, 'medium'),
    };
    if (typeof o.legal_basis === 'string' && o.legal_basis.trim()) r.legal_basis = o.legal_basis;
    out.push(r);
  }
  return out;
}

export async function redlineContract(
  engine: BrainEngine,
  opts: ContractRedlineOpts,
): Promise<ContractRedlineResult> {
  const warnings: string[] = [];
  const jurisdiction = opts.jurisdiction ?? 'all';
  const perspective = opts.perspective ?? 'client';
  const language = opts.language ?? 'de';
  const contractType = opts.contract_type ?? '';

  const empty: ContractRedlineResult = {
    redlines: [],
    summary: '',
    accepted_count: 0,
    total_changes: 0,
    attorney_review_required: true,
    warnings,
  };
  if (!opts.original_text.trim()) {
    warnings.push('NO_DOCUMENT_TEXT');
    return empty;
  }

  // Optional playbook context from the brain.
  let playbook = '';
  let playbookRules: ParsedPlaybookRule[] = [];
  if (opts.playbook_slug) {
    const page = await engine.getPage(opts.playbook_slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
    });
    if (page) {
      playbook = String((page as { compiled_truth?: string }).compiled_truth ?? '');
      playbookRules = parsePlaybookRules(page.frontmatter);
    } else {
      warnings.push(`PLAYBOOK_NOT_FOUND: ${opts.playbook_slug}`);
    }
  }

  const { clipped: original, warning } = clipText(opts.original_text, opts.maxChars ?? 30000);
  if (warning) warnings.push(warning);

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push('NO_LLM_AVAILABLE');
    return empty;
  }

  const parts = [`<originaltext>\n${original}\n</originaltext>`];
  if (opts.counterparty_text && opts.counterparty_text.trim()) {
    const { clipped: cp } = clipText(opts.counterparty_text, opts.maxChars ?? 30000);
    parts.push(`<gegenpartei_version>\n${cp}\n</gegenpartei_version>`);
  }
  if (playbook) parts.push(`<playbook>\n${clipText(playbook, 12000).clipped}\n</playbook>`);

  let raw: string;
  try {
    raw = await llm({
      system: buildSystem(
        contractType,
        jurisdiction,
        perspective,
        language,
        Boolean(opts.counterparty_text?.trim()),
        Boolean(playbook),
        playbookRules,
      ),
      user: parts.join('\n\n'),
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

  const rawRedlines = parseRedlines(parsed.redlines);
  // Ground modify/remove redlines against the original text; 'add' has no anchor.
  const haystack = normalizeForMatch(opts.original_text);
  const redlines = rawRedlines.filter((r) => {
    if (r.change_type === 'add') return true;
    const n = normalizeForMatch(r.original_clause);
    return n.length >= 8 && haystack.includes(n);
  });
  if (redlines.length < rawRedlines.length) {
    warnings.push(`DROPPED_${rawRedlines.length - redlines.length}_UNGROUNDED_REDLINES`);
  }

  // Parse playbook deviations from LLM output.
  const playbookDeviations: PlaybookDeviation[] = Array.isArray(parsed.playbook_deviations)
    ? (parsed.playbook_deviations as unknown[])
        .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
        .map((d) => ({
          rule_id: typeof d.rule_id === 'string' ? d.rule_id : '',
          clause_type: typeof d.clause_type === 'string' ? d.clause_type : '',
          required_position: typeof d.required_position === 'string' ? d.required_position : '',
          deviation_flag: typeof d.deviation_flag === 'string' ? d.deviation_flag : '',
          severity: asRiskLevel(d.severity, 'medium'),
          matched: Boolean(d.matched),
        }))
    : [];

  // Attach playbook deviations to matching redlines.
  for (const r of redlines) {
    const dev = playbookDeviations.find(
      (d) => d.matched && d.clause_type && r.reason.toLowerCase().includes(d.clause_type.toLowerCase()),
    );
    if (dev) r.playbook_deviation = dev;
  }

  return {
    redlines,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    accepted_count: 0,
    total_changes: redlines.length,
    attorney_review_required: true,
    warnings,
    ...(playbookDeviations.length > 0 ? { playbook_deviations: playbookDeviations } : {}),
  };
}
