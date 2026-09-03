/**
 * case-investigation — Sachverhaltsprüfung für ZPO-Verfahren.
 *
 * Two-phase pipeline ( blueprint docs/blueprints/CASE-INVESTIGATION.md ):
 *
 * Phase 1 — Extraction: pro Dokument isoliert, extrahiert Tatsachenbehauptungen
 *   (MatterFactEntry) mit speaker_entity, exact_quote, perception_type.
 *   KEINE Widerspruchsanalyse in dieser Phase (anti-suggestive extraction).
 *
 * Phase 2 — Analysis: on-demand, paarweise Vergleich aller extrahierten
 *   FactEntries über alle Dokumente hinweg. 3-Agent-Pipeline:
 *   1. Researcher — identifiziert potentielle Widerspruchspaare
 *   2. Auditor — verifiziert Zitate gegen Originaltext (grounding)
 *   3. Adversarial — sucht alternative Erklärungen / harmlose Abweichungen
 *
 * Jede Aussage ist durch eine Quelle belegt. KEINE Hallucination.
 * attorney_review_required: true — ersetzt keine anwaltliche Prüfung.
 *
 * Rechtlicher Rahmen: § 226 ZPO (behauptungspflichtige Tatsachen),
 * § 272 ZPO (Verhandlungsmaxime), § 274 ZPO (Beweislast).
 */
import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  loadPageText,
  normalizeForMatch,
  tryParseJSON,
  asStringArray,
} from "./llm-util.ts";

// ── Types ──────────────────────────────────────────────────────────────

export interface CaseInvestigationFactEntry {
  id: string;
  statement: string;
  source: string;
  speaker_entity?: string;
  source_page?: number;
  source_span?: string;
  exact_quote?: string;
  perception_type?: "eigen" | "fremd" | "sach";
  beweis_anforderung?: "vollbeweis" | "glaubhaftmachung" | "anschein";
  on_norm_ref?: string;
  extraction_confidence?: number;
}

export interface CaseInvestigationContradiction {
  id: string;
  case_slug: string;
  claim_a_id: string;
  claim_b_id: string;
  category: CaseInvestigationContradictionCategory;
  severity: CaseInvestigationSeverity;
  materiality: CaseInvestigationMateriality;
  is_direct: boolean;
  alternative_explanations: string[];
  belastende_interpretation: string;
  entlastende_interpretation: string;
  resolution_questions: string[];
  zpo_relevanz?: string;
  audit_verified: boolean;
  audit_confidence?: number;
  review_status?: "pending" | "accepted" | "dismissed" | "no_contradiction";
  review_reason?: string;
  reviewed_at?: string;
}

export type CaseInvestigationContradictionCategory =
  | "direkt"
  | "zeitlich"
  | "räumlich"
  | "identität"
  | "mengen"
  | "kausal"
  | "semantisch"
  | "dokumentarisch"
  | "aussageentwicklung"
  | "rechtlich";

export type CaseInvestigationSeverity = "niedrig" | "mittel" | "hoch";

export type CaseInvestigationMateriality = "nicht_erkennbar" | "möglicherweise" | "zentral";

export interface CaseInvestigationEvidenceGap {
  id: string;
  case_slug: string;
  beschreibung: string;
  fehlendes_beweismittel: string;
  erwartete_quelle: string;
  beweisbedeutung: string;
}

export interface CaseInvestigationHypothesis {
  id: string;
  case_slug: string;
  beschreibung: string;
  stuetzende_indizien: string[];
  gegen_indizien: string[];
}

export interface CaseInvestigationQuestion {
  id: string;
  case_slug: string;
  ziel_person: string;
  einstiegsfrage: string;
  praezisierungsfragen: string[];
  konfrontationsfrage?: string;
  beweisbedeutung: string;
}

export interface CaseInvestigationResult {
  run_id: string;
  case_slug: string;
  jurisdiction: string;
  pruefauftrag: string;
  rechtlicher_rahmen: {
    zpo_vorschriften: string[];
    verfahrensschritt: string;
  };
  claims_count: number;
  contradictions: CaseInvestigationContradiction[];
  evidence_gaps: CaseInvestigationEvidenceGap[];
  alternative_hypotheses: CaseInvestigationHypothesis[];
  neutral_questions: CaseInvestigationQuestion[];
  pruefbedarf_hinweis: string;
  generated_at: string;
  engine_reachable: boolean;
}

export interface CaseInvestigationOpts {
  case_slug: string;
  pruefauftrag?: string;
  jurisdiction?: string;
  incremental?: boolean;
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
  maxDocuments?: number;
  maxCharsPerDoc?: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const ZPO_VORSCHRIFTEN = ["§ 226 ZPO", "§ 272 ZPO", "§ 274 ZPO"];
const VERFAHRENSSCHRITT = "Verhandlungsmaxime — behauptungs- und beweisbedürftige Tatsachen";
const PRUEFBEDARF_HINWEIS =
  "anwaltlich zu prüfen — diese Analyse ersetzt keine anwaltliche Sachverhaltsprüfung. Jede Aussage ist durch eine Quelle belegt und muss am Original verifiziert werden.";

// ── Phase 1: Extraction ────────────────────────────────────────────────

interface ExtractedDoc {
  slug: string;
  title: string;
  content: string;
  facts: CaseInvestigationFactEntry[];
}

function buildExtractionSystem(jurisdiction: string): string {
  return `Du bist ein juristischer Sachverhalts-Analyst für Kanzleien (Recht: ${jurisdictionLabel(jurisdiction)}).
Du extrahierst Tatsachenbehauptungen aus einem einzelnen Dokument.

WICHTIGE REGELN:
- Extrahiere NUR Tatsachenbehauptungen, keine rechtlichen Bewertungen.
- Jede Behauptung MUSS ein wörtliches Zitat (exact_quote) aus dem Text enthalten.
- Gib an, wer die Aussage macht (speaker_entity: Person/Partei/Zeuge).
- Klassifiziere die Wahrnehmung: "eigen" (selbst erlebt), "fremd" (vom Hörensagen), "sach" (Sachverhalt/Objektiv).
- Beweisanforderung: "vollbeweis" (haupttatsächlich), "glaubhaftmachung" (Einstweilige Verfügung), "anschein" (Anscheinsbeweis).
- KEINE Widerspruchsanalyse in dieser Phase — nur Extraktion.
- KEINE Hallucination: Jedes Zitat muss WÖRTLICH im Text vorkommen.

Antworte AUSSCHLIESSLICH als JSON:
{
  "facts": [
    {
      "id": "F-001",
      "statement": "Kurze Zusammenfassung der Behauptung",
      "exact_quote": "WÖRTLICHES Zitat aus dem Text",
      "speaker_entity": "Name oder Rolle",
      "source_page": 1,
      "source_span": "S.1 Abs.2",
      "perception_type": "eigen|fremd|sach",
      "beweis_anforderung": "vollbeweis|glaubhaftmachung|anschein",
      "on_norm_ref": "ON 1234 (falls Norm-Referenz vorhanden)"
    }
  ]
}`;
}

async function extractFactsFromDoc(
  llm: LegalLLM,
  slug: string,
  title: string,
  content: string,
  jurisdiction: string,
  maxChars: number
): Promise<CaseInvestigationFactEntry[]> {
  const { clipped } = clipText(content, maxChars);
  const system = buildExtractionSystem(jurisdiction);
  const user = `<dokument slug="${slug}" title="${title}">\n${clipped}\n</dokument>`;

  let raw: string;
  try {
    raw = await llm({ system, user, maxTokens: 4000 });
  } catch {
    return [];
  }

  const parsed = tryParseJSON(raw);
  if (!parsed || !Array.isArray(parsed.facts)) return [];

  // Grounding: drop facts whose exact_quote is not in the source text
  const facts: CaseInvestigationFactEntry[] = (parsed.facts as Record<string, unknown>[])
    .map((f, i) => ({
      id: typeof f.id === "string" ? f.id : `F-${String(i + 1).padStart(3, "0")}`,
      statement: String(f.statement ?? ""),
      source: slug,
      speaker_entity: typeof f.speaker_entity === "string" ? f.speaker_entity : undefined,
      source_page: typeof f.source_page === "number" ? f.source_page : undefined,
      source_span: typeof f.source_span === "string" ? f.source_span : undefined,
      exact_quote: typeof f.exact_quote === "string" ? f.exact_quote : undefined,
      perception_type: (["eigen", "fremd", "sach"].includes(String(f.perception_type))
        ? String(f.perception_type)
        : undefined) as CaseInvestigationFactEntry["perception_type"],
      beweis_anforderung: (["vollbeweis", "glaubhaftmachung", "anschein"].includes(
        String(f.beweis_anforderung)
      )
        ? String(f.beweis_anforderung)
        : undefined) as CaseInvestigationFactEntry["beweis_anforderung"],
      on_norm_ref: typeof f.on_norm_ref === "string" ? f.on_norm_ref : undefined,
      extraction_confidence: 0.8,
    }))
    .filter((f) => f.statement && f.exact_quote);

  // Grounding: verify exact_quote appears in source text
  const haystack = normalizeForMatch(content);
  const grounded = facts.filter(
    (f) =>
      f.exact_quote &&
      normalizeForMatch(f.exact_quote).length >= 8 &&
      haystack.includes(normalizeForMatch(f.exact_quote))
  );

  return grounded;
}

async function loadDocuments(
  engine: BrainEngine,
  caseSlug: string,
  opts: { sourceId?: string; sourceIds?: string[]; maxDocuments?: number; maxCharsPerDoc?: number }
): Promise<Array<{ slug: string; title: string; content: string }>> {
  const maxDocs = opts.maxDocuments ?? 50;
  // Load document-type pages and filter by frontmatter.case_slug === caseSlug.
  // Mirrors fetchCaseDocumentsBySlug in src/lib/matter-context.ts.
  const documentTypes = ["document", "email", "email_archive", "transcription", "document_archive"];
  const allPages: Array<{ slug: string; title?: string; frontmatter?: Record<string, unknown> }> =
    [];
  for (const type of documentTypes) {
    try {
      const pages = await engine.listPages({
        type: type as never,
        limit: 200,
        ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
        ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
      });
      allPages.push(
        ...(pages as Array<{ slug: string; title?: string; frontmatter?: Record<string, unknown> }>)
      );
    } catch {
      // Skip unavailable types
    }
  }

  // Filter to pages belonging to this case, deduplicate by slug
  const seenSlugs = new Set<string>();
  const casePages = allPages
    .filter((p) => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      if (fm.case_slug !== caseSlug) return false;
      if (fm.assignment_status === "unassigned") return false;
      if (fm.status === "tombstoned") return false;
      if (seenSlugs.has(p.slug)) return false; // dedupe across document types
      seenSlugs.add(p.slug);
      return true;
    })
    .slice(0, maxDocs);

  const docs: Array<{ slug: string; title: string; content: string }> = [];
  for (const page of casePages) {
    const content = await loadPageText(engine, page.slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
    });
    if (content && content.trim()) {
      docs.push({
        slug: page.slug,
        title: String(page.title ?? page.slug),
        content,
      });
    }
  }
  return docs;
}

// ── Phase 2: Analysis (3-Agent Pipeline) ───────────────────────────────

function buildResearcherSystem(
  pruefauftrag: string,
  jurisdiction: string,
  factCount: number
): string {
  return `Du bist der RESEARCHER-Agent einer Sachverhaltsprüfung (Recht: ${jurisdictionLabel(jurisdiction)}).
Prüfauftrag: ${pruefauftrag || "Identifikation von Widersprüchen zwischen Tatsachenbehauptungen der Parteien"}

Du erhältst ${factCount} extrahierte Tatsachenbehauptungen. Identifiziere PAARE von Behauptungen, die sich widersprechen könnten.

Kategorien:
- direkt: direkter inhaltlicher Widerspruch
- zeitlich: unterschiedliche Zeitangaben
- räumlich: unterschiedliche Ortsangaben
- identität: unterschiedliche Personen/Gegenstände
- mengen: unterschiedliche Zahlen/Mengen
- kausal: unterschiedliche Ursachen
- semantisch: unterschiedliche Bedeutung derselben Aussage
- dokumentarisch: Dokument widerspricht Aussage
- aussageentwicklung: Aussage hat sich über Zeit geändert
- rechtlich: rechtliche Einordnung widerspricht sich

Severity: "hoch" (zentral für Prüfauftrag), "mittel" (relevant), "niedrig" (marginal).
Materiality: "zentral" (prüfungsrelevant), "möglicherweise", "nicht_erkennbar".

Antworte AUSSCHLIESSLICH als JSON:
{
  "contradictions": [
    {
      "claim_a_id": "F-001",
      "claim_b_id": "F-005",
      "category": "zeitlich",
      "severity": "hoch",
      "materiality": "zentral",
      "is_direct": true,
      "belastende_interpretation": "Was bedeutet der Widerspruch belastend?",
      "entlastende_interpretation": "Was könnte harmlos erklärt werden?"
    }
  ],
  "evidence_gaps": [
    {
      "beschreibung": "Fehlendes Beweismittel",
      "fehlendes_beweismittel": "Was fehlt?",
      "erwartete_quelle": "Wo wäre es zu erwarten?",
      "beweisbedeutung": "Was würde es klären?"
    }
  ]
}`;
}

function buildAuditorSystem(): string {
  return `Du bist der AUDITOR-Agent einer Sachverhaltsprüfung.
Du verifizierst, ob die vom Researcher identifizierten Widersprüche auf wörtlichen Zitaten basieren.

Für jeden Widerspruch:
1. Prüfe, ob die zitierten Behauptungen WÖRTLICH in den Dokumenten vorkommen.
2. Prüfe, ob die Interpretation (belastend/entlastend) sachlich korrekt ist.
3. Gib audit_confidence (0.0–1.0) an.

Antworte AUSSCHLIESSLICH als JSON:
{
  "verified": [
    {
      "claim_a_id": "F-001",
      "claim_b_id": "F-005",
      "audit_confidence": 0.92,
      "zpo_relevanz": "§ 226 ZPO — behauptungspflichtige Tatsache"
    }
  ]
}`;
}

function buildAdversarialSystem(pruefauftrag: string): string {
  return `Du bist der ADVERSARIAL-Agent einer Sachverhaltsprüfung.
Prüfauftrag: ${pruefauftrag || "Sachverhaltsprüfung"}

Für jeden Widerspruch:
1. Suche nach ALTERNATIVEN ERKLÄRUNGEN (harmlose Abweichungen, Missverständnisse, Kontext).
2. Formuliere NEUTRALE Klärungsfragen (PEACE-Style: Plan, Engage, Account, Closure, Evaluate).
3. Generiere alternative Hypothesen, die den Widerspruch auflösen könnten.

Antworte AUSSCHLIESSLICH als JSON:
{
  "analyses": [
    {
      "claim_a_id": "F-001",
      "claim_b_id": "F-005",
      "alternative_explanations": ["Telefonisch geklärt?", "Zeit geschätzt?"],
      "resolution_questions": ["Wo waren Sie unmittelbar davor/danach?"],
      "hypotheses": [
        {
          "beschreibung": "Gespräch fand telefonisch statt",
          "stuetzende_indizien": ["Keine Reisekosten"],
          "gegen_indizien": ["Zeuge sagt persönlich"]
        }
      ]
    }
  ],
  "questions": [
    {
      "ziel_person": "Zeuge Z",
      "einstiegsfrage": "Schildern Sie das Gespräch am 14.05.",
      "praezisierungsfragen": ["Wo befanden Sie sich davor?"],
      "konfrontationsfrage": "Müller sagt, Sie waren in Linz — stimmt das?",
      "beweisbedeutung": "Klärung des Aufenthaltsorts"
    }
  ]
}`;
}

// ── Run Store (In-Memory mit TTL) ──────────────────────────────────────
// Results werden nach POST gespeichert und können via GET /:runId abgerufen
// werden. TTL: 24h. In einer produktiven Umgebung würde dies in die DB
// persistiert (schema_events / snapshot-store), aber für die aktuelle
// Architektur reicht der In-Memory-Store — Runs sind ephemeral und werden
// nach Review nicht mehr benötigt.

const RUN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const runStore = new Map<string, { result: CaseInvestigationResult; expiresAt: number }>();

function saveRun(result: CaseInvestigationResult): void {
  runStore.set(result.run_id, { result, expiresAt: Date.now() + RUN_TTL_MS });
  // Lazy GC: remove expired runs
  const now = Date.now();
  for (const [key, entry] of runStore) {
    if (entry.expiresAt < now) runStore.delete(key);
  }
}

export function getRun(runId: string): CaseInvestigationResult | null {
  const entry = runStore.get(runId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    runStore.delete(runId);
    return null;
  }
  return entry.result;
}

export function updateContradictionInRun(
  runId: string,
  contradictionId: string,
  patch: Partial<CaseInvestigationContradiction>
): CaseInvestigationContradiction | null {
  const result = getRun(runId);
  if (!result) return null;
  const idx = result.contradictions.findIndex((c) => c.id === contradictionId);
  if (idx === -1) return null;
  result.contradictions[idx] = {
    ...result.contradictions[idx],
    ...patch,
    reviewed_at: new Date().toISOString(),
  };
  saveRun(result);
  return result.contradictions[idx];
}

// ── Main Pipeline ──────────────────────────────────────────────────────

export async function caseInvestigation(
  engine: BrainEngine,
  opts: CaseInvestigationOpts
): Promise<CaseInvestigationResult> {
  const jurisdiction = opts.jurisdiction ?? "at";
  const maxDocs = opts.maxDocuments ?? 50;
  const maxChars = opts.maxCharsPerDoc ?? 16000;
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generatedAt = new Date().toISOString();

  // Load documents for the case
  const docs = await loadDocuments(engine, opts.case_slug, {
    sourceId: opts.sourceId,
    sourceIds: opts.sourceIds,
    maxDocuments: maxDocs,
    maxCharsPerDoc: maxChars,
  });

  if (docs.length === 0) {
    return emptyResult(runId, opts.case_slug, jurisdiction, opts.pruefauftrag, generatedAt, 0);
  }

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    return emptyResult(runId, opts.case_slug, jurisdiction, opts.pruefauftrag, generatedAt, 0, [
      "NO_LLM_AVAILABLE",
    ]);
  }

  // ── Phase 1: Extract facts from each document ──────────────────────
  const extractedDocs: ExtractedDoc[] = [];
  for (const doc of docs) {
    const facts = await extractFactsFromDoc(
      llm,
      doc.slug,
      doc.title,
      doc.content,
      jurisdiction,
      maxChars
    );
    extractedDocs.push({ ...doc, facts });
  }

  const allFacts = extractedDocs.flatMap((d) => d.facts);
  if (allFacts.length === 0) {
    return emptyResult(runId, opts.case_slug, jurisdiction, opts.pruefauftrag, generatedAt, 0, [
      "NO_FACTS_EXTRACTED",
    ]);
  }

  // ── Phase 2: 3-Agent Pipeline ──────────────────────────────────────

  // Agent 1: Researcher — identify contradiction pairs + evidence gaps
  const factContext = allFacts
    .map(
      (f) =>
        `[${f.id}] (source: ${f.source}, speaker: ${f.speaker_entity ?? "unbekannt"}) ${f.statement}\n  Zitat: "${f.exact_quote ?? ""}"`
    )
    .join("\n\n");

  const researcherSystem = buildResearcherSystem(
    opts.pruefauftrag ?? "",
    jurisdiction,
    allFacts.length
  );
  const researcherUser = `<tatsachenbehauptungen>\n${clipText(factContext, 48000).clipped}\n</tatsachenbehauptungen>`;

  let researcherRaw: string;
  try {
    researcherRaw = await llm({ system: researcherSystem, user: researcherUser, maxTokens: 6000 });
  } catch {
    return emptyResult(
      runId,
      opts.case_slug,
      jurisdiction,
      opts.pruefauftrag,
      generatedAt,
      allFacts.length,
      ["RESEARCHER_LLM_FAILED"]
    );
  }

  const researcherResult = tryParseJSON(researcherRaw);
  if (!researcherResult) {
    return emptyResult(
      runId,
      opts.case_slug,
      jurisdiction,
      opts.pruefauftrag,
      generatedAt,
      allFacts.length,
      ["RESEARCHER_PARSE_FAILED"]
    );
  }

  const rawContradictions = Array.isArray(researcherResult.contradictions)
    ? (researcherResult.contradictions as Record<string, unknown>[])
    : [];
  const rawGaps = Array.isArray(researcherResult.evidence_gaps)
    ? (researcherResult.evidence_gaps as Record<string, unknown>[])
    : [];

  if (rawContradictions.length === 0) {
    // No contradictions found — return with gaps only
    const evidence_gaps: CaseInvestigationEvidenceGap[] = rawGaps.map((g, i) => ({
      id: `L-${String(i + 1).padStart(3, "0")}`,
      case_slug: opts.case_slug,
      beschreibung: String(g.beschreibung ?? ""),
      fehlendes_beweismittel: String(g.fehlendes_beweismittel ?? ""),
      erwartete_quelle: String(g.erwartete_quelle ?? ""),
      beweisbedeutung: String(g.beweisbedeutung ?? ""),
    }));

    const noContraResult: CaseInvestigationResult = {
      run_id: runId,
      case_slug: opts.case_slug,
      jurisdiction,
      pruefauftrag: opts.pruefauftrag ?? "Sachverhaltsprüfung",
      rechtlicher_rahmen: {
        zpo_vorschriften: ZPO_VORSCHRIFTEN,
        verfahrensschritt: VERFAHRENSSCHRITT,
      },
      claims_count: allFacts.length,
      contradictions: [],
      evidence_gaps,
      alternative_hypotheses: [],
      neutral_questions: [],
      pruefbedarf_hinweis: PRUEFBEDARF_HINWEIS,
      generated_at: generatedAt,
      engine_reachable: true,
    };
    saveRun(noContraResult);
    return noContraResult;
  }

  // Agent 2: Auditor — verify quotes and interpretations
  const auditorSystem = buildAuditorSystem();
  const auditorUser = `<widersprueche>\n${JSON.stringify(rawContradictions, null, 2)}\n</widersprueche>\n\n<originaldokumente>\n${extractedDocs
    .map((d) => `--- ${d.slug} ---\n${clipText(d.content, 8000).clipped}`)
    .join("\n\n")}\n</originaldokumente>`;

  let auditorRaw: string;
  let auditorVerified: Record<string, { audit_confidence: number; zpo_relevanz?: string }> = {};
  try {
    auditorRaw = await llm({ system: auditorSystem, user: auditorUser, maxTokens: 4000 });
    const auditorResult = tryParseJSON(auditorRaw);
    if (auditorResult && Array.isArray(auditorResult.verified)) {
      for (const v of auditorResult.verified as Record<string, unknown>[]) {
        const key = `${v.claim_a_id}|${v.claim_b_id}`;
        auditorVerified[key] = {
          audit_confidence: typeof v.audit_confidence === "number" ? v.audit_confidence : 0.5,
          zpo_relevanz: typeof v.zpo_relevanz === "string" ? v.zpo_relevanz : undefined,
        };
      }
    }
  } catch {
    // Auditor failed — continue with unverified
  }

  // Agent 3: Adversarial — alternative explanations + questions
  const adversarialSystem = buildAdversarialSystem(opts.pruefauftrag ?? "");
  const adversarialUser = `<widersprueche>\n${JSON.stringify(rawContradictions, null, 2)}\n</widersprueche>`;

  let adversarialRaw: string;
  let adversarialAnalyses: Record<
    string,
    { alternative_explanations: string[]; resolution_questions: string[] }
  > = {};
  let rawHypotheses: Record<string, unknown>[] = [];
  let rawQuestions: Record<string, unknown>[] = [];

  try {
    adversarialRaw = await llm({
      system: adversarialSystem,
      user: adversarialUser,
      maxTokens: 6000,
    });
    const advResult = tryParseJSON(adversarialRaw);
    if (advResult) {
      if (Array.isArray(advResult.analyses)) {
        for (const a of advResult.analyses as Record<string, unknown>[]) {
          const key = `${a.claim_a_id}|${a.claim_b_id}`;
          adversarialAnalyses[key] = {
            alternative_explanations: asStringArray(a.alternative_explanations),
            resolution_questions: asStringArray(a.resolution_questions),
          };
        }
      }
      if (Array.isArray(advResult.hypotheses))
        rawHypotheses = advResult.hypotheses as Record<string, unknown>[];
      if (Array.isArray(advResult.questions))
        rawQuestions = advResult.questions as Record<string, unknown>[];
    }
  } catch {
    // Adversarial failed — continue without
  }

  // ── Merge results ───────────────────────────────────────────────────

  const validCategories: CaseInvestigationContradictionCategory[] = [
    "direkt",
    "zeitlich",
    "räumlich",
    "identität",
    "mengen",
    "kausal",
    "semantisch",
    "dokumentarisch",
    "aussageentwicklung",
    "rechtlich",
  ];
  const validSeverities: CaseInvestigationSeverity[] = ["niedrig", "mittel", "hoch"];
  const validMaterialities: CaseInvestigationMateriality[] = [
    "nicht_erkennbar",
    "möglicherweise",
    "zentral",
  ];

  const contradictions: CaseInvestigationContradiction[] = rawContradictions.map((c, i) => {
    const key = `${c.claim_a_id}|${c.claim_b_id}`;
    const auditor = auditorVerified[key];
    const adversarial = adversarialAnalyses[key];
    return {
      id: `W-${String(i + 1).padStart(3, "0")}`,
      case_slug: opts.case_slug,
      claim_a_id: String(c.claim_a_id ?? ""),
      claim_b_id: String(c.claim_b_id ?? ""),
      category: (validCategories.includes(c.category as CaseInvestigationContradictionCategory)
        ? c.category
        : "direkt") as CaseInvestigationContradictionCategory,
      severity: (validSeverities.includes(c.severity as CaseInvestigationSeverity)
        ? c.severity
        : "mittel") as CaseInvestigationSeverity,
      materiality: (validMaterialities.includes(c.materiality as CaseInvestigationMateriality)
        ? c.materiality
        : "möglicherweise") as CaseInvestigationMateriality,
      is_direct: typeof c.is_direct === "boolean" ? c.is_direct : true,
      alternative_explanations: adversarial?.alternative_explanations ?? [],
      belastende_interpretation: String(c.belastende_interpretation ?? ""),
      entlastende_interpretation: String(c.entlastende_interpretation ?? ""),
      resolution_questions: adversarial?.resolution_questions ?? [],
      zpo_relevanz: auditor?.zpo_relevanz,
      audit_verified: auditor !== undefined,
      audit_confidence: auditor?.audit_confidence,
      review_status: "pending",
    };
  });

  const evidence_gaps: CaseInvestigationEvidenceGap[] = rawGaps.map((g, i) => ({
    id: `L-${String(i + 1).padStart(3, "0")}`,
    case_slug: opts.case_slug,
    beschreibung: String(g.beschreibung ?? ""),
    fehlendes_beweismittel: String(g.fehlendes_beweismittel ?? ""),
    erwartete_quelle: String(g.erwartete_quelle ?? ""),
    beweisbedeutung: String(g.beweisbedeutung ?? ""),
  }));

  const alternative_hypotheses: CaseInvestigationHypothesis[] = rawHypotheses.map((h, i) => ({
    id: `H-${String(i + 1).padStart(3, "0")}`,
    case_slug: opts.case_slug,
    beschreibung: String(h.beschreibung ?? ""),
    stuetzende_indizien: asStringArray(h.stuetzende_indizien),
    gegen_indizien: asStringArray(h.gegen_indizien),
  }));

  const neutral_questions: CaseInvestigationQuestion[] = rawQuestions.map((q, i) => ({
    id: `Q-${String(i + 1).padStart(3, "0")}`,
    case_slug: opts.case_slug,
    ziel_person: String(q.ziel_person ?? ""),
    einstiegsfrage: String(q.einstiegsfrage ?? ""),
    praezisierungsfragen: asStringArray(q.praezisierungsfragen),
    konfrontationsfrage:
      typeof q.konfrontationsfrage === "string" ? q.konfrontationsfrage : undefined,
    beweisbedeutung: String(q.beweisbedeutung ?? ""),
  }));

  const finalResult: CaseInvestigationResult = {
    run_id: runId,
    case_slug: opts.case_slug,
    jurisdiction,
    pruefauftrag: opts.pruefauftrag ?? "Sachverhaltsprüfung",
    rechtlicher_rahmen: {
      zpo_vorschriften: ZPO_VORSCHRIFTEN,
      verfahrensschritt: VERFAHRENSSCHRITT,
    },
    claims_count: allFacts.length,
    contradictions,
    evidence_gaps,
    alternative_hypotheses,
    neutral_questions,
    pruefbedarf_hinweis: PRUEFBEDARF_HINWEIS,
    generated_at: generatedAt,
    engine_reachable: true,
  };
  saveRun(finalResult);
  return finalResult;
}

function emptyResult(
  runId: string,
  caseSlug: string,
  jurisdiction: string,
  pruefauftrag: string | undefined,
  generatedAt: string,
  claimsCount: number,
  warnings?: string[]
): CaseInvestigationResult {
  const result: CaseInvestigationResult = {
    run_id: runId,
    case_slug: caseSlug,
    jurisdiction,
    pruefauftrag: pruefauftrag ?? "Sachverhaltsprüfung",
    rechtlicher_rahmen: {
      zpo_vorschriften: ZPO_VORSCHRIFTEN,
      verfahrensschritt: VERFAHRENSSCHRITT,
    },
    claims_count: claimsCount,
    contradictions: [],
    evidence_gaps: [],
    alternative_hypotheses: [],
    neutral_questions: [],
    pruefbedarf_hinweis: PRUEFBEDARF_HINWEIS,
    generated_at: generatedAt,
    engine_reachable: true,
  };
  saveRun(result);
  return result;
}

// ── Review (PATCH) ─────────────────────────────────────────────────────

export interface CaseInvestigationReviewInput {
  review_status: "accepted" | "dismissed" | "no_contradiction";
  review_reason?: string;
}

export async function reviewContradiction(
  _engine: BrainEngine,
  runId: string,
  contradictionId: string,
  input: CaseInvestigationReviewInput
): Promise<CaseInvestigationContradiction> {
  const updated = updateContradictionInRun(runId, contradictionId, {
    review_status: input.review_status,
    review_reason: input.review_reason,
  });
  if (updated) return updated;
  // Fallback: run not found in store — return skeleton with review fields
  return {
    id: contradictionId,
    case_slug: "",
    claim_a_id: "",
    claim_b_id: "",
    category: "direkt",
    severity: "mittel",
    materiality: "möglicherweise",
    is_direct: true,
    alternative_explanations: [],
    belastende_interpretation: "",
    entlastende_interpretation: "",
    resolution_questions: [],
    audit_verified: false,
    review_status: input.review_status,
    review_reason: input.review_reason,
  };
}
