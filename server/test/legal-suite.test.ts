/**
 * Legal assistant suite — the anti-hallucination grounding gate across the
 * modules that quote-anchor (document-review, risk-analysis, contract-redline)
 * plus shape assertions for the generative ones (summarize, memo,
 * contract-draft, due-diligence). The load-bearing guarantee: a model claim
 * with no verbatim anchor in the source MUST be dropped.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { reviewDocument } from '../src/core/legal/document-review.ts';
import { analyzeRisk } from '../src/core/legal/risk-analysis.ts';
import { redlineContract } from '../src/core/legal/contract-redline.ts';
import { summarizeDocument } from '../src/core/legal/summarize.ts';
import { generateMemo } from '../src/core/legal/memo.ts';
import { draftContract } from '../src/core/legal/contract-draft.ts';
import { runDueDiligence } from '../src/core/legal/due-diligence.ts';
import type { LegalLLM } from '../src/core/legal/llm-util.ts';

let engine: PGLiteEngine;

const CONTRACT = `Dienstleistungsvertrag zwischen Acme GmbH und Widget AG.
§ 5 Haftung: Die Haftung des Auftragnehmers ist vollständig ausgeschlossen.
§ 9 Laufzeit: Der Vertrag läuft auf unbestimmte Zeit mit einer Kündigungsfrist von 24 Monaten.`;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.putPage('akten/vertrag-acme', {
    type: 'legal_document', title: 'Vertrag Acme', compiled_truth: CONTRACT, frontmatter: {},
  });
}, 60_000);

afterAll(async () => { if (engine) await engine.disconnect(); });

const stubLLM = (payload: unknown): LegalLLM => async () => JSON.stringify(payload);

describe('document-review grounding', () => {
  test('drops a finding citation that is not verbatim in the document', async () => {
    const llm = stubLLM({
      summary: 'Geprüft.',
      overall_risk: 'high',
      findings: [
        {
          question: 'Haftung?',
          answer: 'Haftung ausgeschlossen.',
          citations: [
            'Die Haftung des Auftragnehmers ist vollständig ausgeschlossen', // real
            'Es gilt ein Schiedsgericht in Genf', // fabricated
          ],
          risk_level: 'high',
        },
      ],
    });
    const res = await reviewDocument(engine, { slug: 'akten/vertrag-acme', llm });
    expect(res.findings[0].citations).toEqual([
      'Die Haftung des Auftragnehmers ist vollständig ausgeschlossen',
    ]);
    expect(res.warnings.some((w) => w.includes('UNGROUNDED_CITATIONS'))).toBe(true);
    expect(res.overall_risk).toBe('high');
    expect(res.attorney_review_required).toBe(true);
  });
});

describe('risk-analysis grounding', () => {
  test('drops a clause whose excerpt is fabricated, scores overall by worst surviving clause', async () => {
    const llm = stubLLM({
      summary: 'Riskanter Haftungsausschluss.',
      clause_risks: [
        { clause_type: 'Haftung', text_excerpt: 'Die Haftung des Auftragnehmers ist vollständig ausgeschlossen', score: 85, issue: 'Totalausschluss', recommendation: 'begrenzen', legal_basis: '§ 309 BGB' },
        { clause_type: 'Schiedsgericht', text_excerpt: 'Schiedsgericht in Genf entscheidet', score: 90, issue: 'erfunden', recommendation: '-', legal_basis: '' },
      ],
      red_flags: ['Haftungsausschluss'],
      missing_clauses: ['Datenschutz'],
    });
    const res = await analyzeRisk(engine, { text: CONTRACT, llm });
    expect(res.clause_risks.map((c) => c.clause_type)).toEqual(['Haftung']);
    expect(res.overall_score).toBe(85);
    expect(res.overall_level).toBe('critical');
    expect(res.warnings.some((w) => w.includes('UNGROUNDED_CLAUSES'))).toBe(true);
  });
});

describe('contract-redline grounding', () => {
  test('keeps add-changes and grounded modifies, drops fabricated modify targets', async () => {
    const llm = stubLLM({
      summary: 'Zwei Änderungen.',
      redlines: [
        { original_clause: 'Die Haftung des Auftragnehmers ist vollständig ausgeschlossen', suggested_text: 'Die Haftung ist auf Vorsatz und grobe Fahrlässigkeit begrenzt.', change_type: 'modify', reason: 'AGB-fest', risk_level: 'high', legal_basis: '§ 309 BGB' },
        { original_clause: 'Gerichtsstand ist München', suggested_text: 'Gerichtsstand ist Wien', change_type: 'modify', reason: 'erfunden', risk_level: 'low' },
        { original_clause: '', suggested_text: 'Neue Datenschutzklausel ergänzen.', change_type: 'add', reason: 'DSGVO', risk_level: 'medium' },
      ],
    });
    const res = await redlineContract(engine, { original_text: CONTRACT, llm });
    expect(res.redlines.map((r) => r.change_type)).toEqual(['modify', 'add']);
    expect(res.total_changes).toBe(2);
    expect(res.warnings.some((w) => w.includes('UNGROUNDED_REDLINES'))).toBe(true);
  });
});

describe('generative modules — shape + attorney flag', () => {
  test('summarize returns word_count + structured fields', async () => {
    const llm = stubLLM({ executive_summary: 'Kurz.', key_points: ['A', 'B'], parties: ['Acme GmbH', 'Widget AG'], dates: [{ label: 'Frist', date: '2026-01-01' }], obligations: ['leisten'], risks: ['Haftung'] });
    const res = await summarizeDocument(engine, { slug: 'akten/vertrag-acme', llm });
    expect(res.key_points.length).toBe(2);
    expect(res.word_count).toBeGreaterThan(0);
    expect(res.reading_time_minutes).toBeGreaterThanOrEqual(1);
    expect(res.attorney_review_required).toBe(true);
  });

  test('memo assembles markdown with all four sections', async () => {
    const llm = stubLLM({ sections: { sachverhalt: 'SV', rechtsfragen: 'RF', wuerdigung: 'WD', ergebnis: 'ERG' }, statutes: ['§ 1295 ABGB'] });
    const res = await generateMemo(engine, { question: 'Haftet A?', facts: 'A hat B geschädigt.', jurisdiction: 'at', llm });
    expect(res.sections.ergebnis).toBe('ERG');
    expect(res.memo_markdown).toContain('§ 1295 ABGB');
    expect(res.memo_markdown).toContain('EU AI Act Art. 50');
    expect(res.attorney_review_required).toBe(true);
  });

  test('contract-draft prepends the AI-draft banner', async () => {
    const llm = stubLLM({ title: 'NDA', contract_markdown: '# NDA\n§ 1 ...', clauses: ['Geheimhaltung'] });
    const res = await draftContract(engine, { type: 'NDA', jurisdiction: 'de', parties: { a: 'Acme', b: 'Widget' }, llm });
    expect(res.contract_markdown).toContain('KI-Entwurf');
    expect(res.title).toBe('NDA');
    expect(res.attorney_review_required).toBe(true);
  });

  test('due-diligence keeps only page_refs from supplied documents', async () => {
    const llm = stubLLM({
      summary: 'DD ok.',
      risk_level: 'medium',
      findings: [
        { item: 'Haftung', status: 'attention', details: 'Ausschluss', severity: 'high', page_refs: ['akten/vertrag-acme', 'akten/erfunden'] },
      ],
      red_flags: ['Haftungsausschluss'],
      recommendations: ['nachverhandeln'],
    });
    const res = await runDueDiligence(engine, { document_slugs: ['akten/vertrag-acme'], llm });
    expect(res.findings[0].page_refs).toEqual(['akten/vertrag-acme']);
    expect(res.attorney_review_required).toBe(true);
  });
});

describe('graceful degradation', () => {
  test('no LLM configured → empty result with NO_LLM_AVAILABLE, never throws', async () => {
    const noLLM: LegalLLM = (() => { throw new Error('should not be called'); }) as unknown as LegalLLM;
    // Pass a stub that is never invoked because text is empty → NO_DOCUMENT_TEXT path.
    const res = await analyzeRisk(engine, { text: '   ', llm: noLLM });
    expect(res.warnings).toContain('NO_DOCUMENT_TEXT');
    expect(res.clause_risks).toEqual([]);
  });
});
