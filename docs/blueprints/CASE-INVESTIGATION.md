# Blueprint: Sachverhaltsprüfung / Case Investigation

**Status:** recherchefundiert (ACL 2026 LegalGraphRAG, magelegal 6-Layer, parthac.me
Production-Architektur, PleadProof Harvey-Challenge 2026, ConflictRAG, W3C PROV,
NIST AI RMF, College of Policing PEACE, NCSC Hallucination Guide, RIS § 226/272/274 ZPO)

**Gültigkeitsbereich:** Österreich (jurisdiction: "at"). DACH-Erweiterung später.

---

## 1) Ziel (aus Anwaltssicht)

Ein Anwalt mit einem umfangreichen Zivilakt soll nicht nur eine Zusammenfassung
erhalten, sondern eine **belastbare Ermittlungslandkarte**:

- Was ist tatsächlich dokumentiert (und von wem behauptet)?
- Welche Aussagen widersprechen sich — materiell relevant, nicht nur formal?
- Welche Beweislücken bestehen?
- Welche alternativen Erklärungen gibt es (auch entlastende)?
- Welche neutralen Fragen müssen als Nächstes gestellt werden (PEACE)?
- Welche rechtlichen Tatbestandsmerkmale sind erfüllt, offen oder widerlegt?

Die KI **entscheidet nicht** über Wahrheit. Sie legt offen, was durch welche
Quellen gestützt, bestritten oder ungeklärt ist — genau das, was § 226 ZPO vom
Gericht verlangt, vorher für den Anwalt.

## 2) Architektur — Zwei-Phasen-Trennung (Goldstandard)

Sieben unabhängige Quellen (ACL-Paper, 3 Harvey-Challenge-Gewinner, 2
Practitioner-Blogs, 1 Production-Architektur) konvergieren auf dieser Trennung:

### Phase 1 — EXTRACTION (offline, event-driven, pro Dokument isoliert)

Läuft beim Upload/Import. Pro Dokument, **isoliert** (kein Sicht auf andere
Dokumente — verhindert suggestive Extraktion und Bestätigungsfehler).

- Bestehende Pipeline: OCR, Klassifikation, ON-Erkennung (unverändert)
- **NEU: Sequential Amendment Processing** — bei versionierten Dokumenten
  (Nachträge, geänderte Schriftsätze) → resolved view erzeugen
- **NEU: Fact-Extraction** — pro Dokument:
  - `MatterParty[]` (wer wird erwähnt, welche Rolle)
  - `MatterFactEntry[]` (Behauptung, Sprecher, Fundstelle, Originalzitat,
    confidence, perception_type)
- **Idempotenz:** content-hash → drop oder update, keine Duplikate
- **Provenance:** W3C PROV (agent, activity, entity) — append-only
- Schreibt in Engine (`MatterFactEntry[]`)

### Phase 2 — ANALYSIS (online, request-driven, on-demand)

Läuft nur, wenn der Anwalt anfordert (Copilot-Empfehlung oder manuell).

- Lädt alle `MatterFactEntry` des `caseSlug` (oder Delta seit letzter Analysis)
- **Stage A — Embedding-Vorfilter** (cheap): Cosine-Similarity aller Paare,
  nur Kandidaten-Paare (Score 0,6–0,9) behalten — ConflictRAG-Pattern, 62 %
  Kostenersparnis
- **Stage B — LLM-Klassifikation** (nur Kandidaten): Widerspruch? Kategorie?
  Alternative Erklärung? Belastend/entlastend?
- **Stage C — AUDITOR** (eigenständige Validation-Schicht, nicht optional):
  - Citation-Entailment: trägt das zitierte Original wirklich die Behauptung?
  - Confidence Floor: < 0,7 → verwerfen (fail-closed)
  - Cross-extraction consistency: Uneinigkeit anzeigen, nicht eine wählen
- Schreibt `ContradictionReport` + füllt `MatterFactEntry.contradicts[]` aus
  - setzt `review_status = "pending"`

### Phase 3 — OUTPUT (deterministisch, nicht generativ)

Split-Pane-View. Liest aus `MatterFactEntry` + `ContradictionReport`.
Deterministischer Render-Schritt (magelegal: "Generation produces substance,
templating produces voice").

## 3) Rechtlicher Rahmen (Österreich)

### § 226 ZPO — Verhandlungsmaxime

> „Das Gericht darf die Tatsachen nicht völlig selbständig sammeln und daraus
> selbständige Schlüsse ziehen, sondern ist an das Tatsachenvorbringen der
> Parteien gebunden; nur soweit danach einander widersprechende
> Tatsachenbehauptungen vorliegen, hat das Gericht die Beweise aufzunehmen und
> eigene Tatsachenfeststellungen zu treffen."
> — OGH 9 Ob 11/22s

**Konsequenz:** Die KI erfindet keine Tatsachen. Sie identifiziert
Tatsachenbehauptungen der Parteien und gegenüberstellend widersprüchliche
Behauptungen — genau der § 226-Anker.

### § 272 ZPO — Freie Beweiswürdigung

> „Das Gericht hat ... nach freier Überzeugung zu beurtheilen, ob eine
> thatsächliche Angabe für wahr zu halten sei oder nicht."

**Konsequenz:** Die KI gibt keine eigene „freie Überzeugung" aus. Sie nennt
nur Faktoren, die das Gericht einstellen wird (eigene Wahrnehmung, zeitliche
Nähe, Detailgrad, Konsistenz, unabhängige Bestätigung, Eigeninteresse).

### § 274 ZPO — Glaubhaftmachung

Im einstweiligen Rechtsschutz reicht Glaubhaftmachung statt Vollbeweis. Die KI
muss erkennen, ob eine Aussage voll bewiesen oder nur glaubhaft gemacht werden
muss — das ändert die Anforderungen an die Widerspruchsanalyse.

## 4) Datenmodell

### Erweiterung `MatterFactEntry` (bestehend, wird gefüllt)

Bestehende Felder in `src/lib/matter-context-types.ts:101`:

- `id`, `statement`, `source`, `confidence`, `date?`, `superseded_by?`,
  `contradicts?`, `review_status?`, `original_statement?`

**Neue optionale Felder** (rückwärtskompatibel):

```typescript
export interface MatterFactEntry {
  // bestehend ...
  speaker_entity?: string; // wer behauptet es (Partei-Rolle)
  source_page?: number; // S.4
  source_span?: string; // "S.4 Abs.2"
  exact_quote?: string; // wörtlich, nicht paraphrasiert
  perception_type?: "eigen" | "mitgeteilt" | "schluss" | "unbekannt";
  beweis_anforderung?: "vollbeweis" | "glaubhaftmachung" | "offen";
  on_norm_ref?: string; // z.B. "ON 1923"
  extraction_confidence?: number; // 0..1 — Extraction-Quality
  provenance?: {
    extractor_version: string;
    extracted_at: string;
    content_hash: string;
  };
}
```

### Neu: `ContradictionReport`

```typescript
export interface CaseInvestigationContradiction {
  id: string;
  case_slug: string;
  claim_a_id: string;
  claim_b_id: string;
  category:
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
  severity: "niedrig" | "mittel" | "hoch";
  materiality: "nicht_erkennbar" | "möglicherweise" | "zentral";
  is_direct: boolean;
  alternative_explanations: string[];
  belastende_interpretation: string;
  entlastende_interpretation: string;
  resolution_questions: string[];
  zpo_relevanz: string;
  audit_verified: boolean;
  audit_confidence?: number;
}

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
  jurisdiction: "at";
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
```

### Neu: `CaseInvestigationSuggestion` (Copilot-Empfehlung)

```typescript
export interface CaseInvestigationSuggestion {
  suggest: boolean;
  reason: string;
  urgency: "low" | "medium" | "high";
  indicators: {
    has_opposing_parties: boolean;
    known_contradictions: number;
    ready_documents: number;
    has_gaps: boolean;
    has_communication: boolean;
  };
  estimated_credits: number;
  estimated_duration_seconds: number;
}
```

## 5) Copilot-Empfehlung (Haupteinstieg)

Der Copilot hat `MatterContextBundle` und empfiehlt proaktiv die Analyse, wenn
≥ 2 Indikatoren zutreffen:

1. `has_opposing_parties` — client + opponent vorhanden
2. `known_contradictions` — `facts.filter(f => f.contradicts?.length > 0).length > 0`
3. `ready_documents` — `documents.filter(d => d.analysis_status === "completed").length >= 5`
4. `has_gaps` — `gaps.length > 0`
5. `has_communication` — `communications.length > 0`

Implementiert in `src/lib/case-investigation-suggest.ts`.

## 6) UI — Split-Pane-View

`/dashboard/cases/{slug}/investigation/{runId}`

- **Links:** Widerspruchsliste sortiert nach Relevanz, mit Status
  (ungeprüft/akzeptiert/verworfen/kein Widerspruch)
- **Rechts:** Detail des gewählten Widerspruchs:
  - Side-by-side Originalzitate (A vs. B) mit Fundstelle
  - „→ Im Dokument anzeigen" — springt zur Stelle mit Highlight
  - Alternative Erklärungen
  - Neutrale Fragen (PEACE)
  - § 226/272/274 ZPO-Hinweis
  - Accept/Dismiss mit Begründung → schreibt `review_status`
  - CitationPanel + „anwaltlich zu prüfen"
- **Tabs:** Widersprüche / Chronologie / Beweislücken / Fragen / Hypothesen

## 7) API-Verträge

### `POST /api/legal/case-investigation`

Engine-Proxy (wie `deep-analysis`), `citationGate: true`, `credits: "subsumption"`.

Request:

```typescript
{
  case_slug: string;
  pruefauftrag?: string;
  jurisdiction: "at";
  incremental?: boolean;  // nur neue Claims seit letzter Analysis
}
```

Response: `CaseInvestigationResult`

### `GET /api/matter-context/[caseSlug]/investigation-suggest`

Liefert `CaseInvestigationSuggestion` — genutzt vom Copilot zur proaktiven
Empfehlung.

### `GET /api/legal/case-investigation/[runId]`

Liefert gespeicherten `CaseInvestigationResult` + zugehörige `MatterFactEntry`.

### `PATCH /api/legal/case-investigation/[runId]/contradictions/[id]`

Accept/Dismiss mit Begründung → schreibt `review_status` in `MatterFactEntry`.

## 8) Copilot-Tool-Registrierung

`src/lib/agent-conditionals.ts`:

```typescript
case_investigation: {
  roles: ["admin", "lawyer"],
  requiresCaseContext: true,
  featureFlag: "caseInvestigation",
  description: "Sachverhaltsprüfung: Widersprüche, Beweislücken, Fragen",
}
```

`src/app/api/copilot/tools/route.ts`:

- Schema + `executeCaseInvestigation` → POST an Engine
- Response enthält `run_id` + `href` zum Investigation-View

## 9) Kostenmodell (pro Analyse, typischer österreichischer Zivilakt 200–800 S.)

- Phase 1 Extraction: ~0,84 $ (Map, 100 Dokumente, Sonnet 4.6)
- Stage A Embedding-Vorfilter: praktisch kostenlos
- Stage B LLM-Klassifikation: ~0,90 $ (200 Paare, Sonnet 4.6)
- Stage C Auditor: ~0,20 $ (20 Widersprüche, Opus 4.7)
- **Gesamt: ~2 $ pro Fall**, großer Fall ~8 $, mit Prompt-Caching 30–50 % günstiger

Abgerechnet über `credits: "subsumption"` (bestehendes Credit-System).

## 10) Evaluationsharness

10–20 anonymisierte österreichische Zivilrechtsfälle, von 2–3 Anwälten
annotiert. Metriken:

| Metrik                  | Messmethode                       | Ziel   |
| ----------------------- | --------------------------------- | ------ |
| Claim Recall            | manuell annotiert                 | ≥ 80 % |
| Claim Precision         | NLI-Modell prüft Zitat-Entailment | ≥ 90 % |
| Contradiction Precision | LLM-as-Judge + Mensch             | ≥ 85 % |
| Contradiction Recall    | gegen Golden Set                  | ≥ 70 % |
| Hallucination Rate      | Auditor-Verifikation              | ≤ 5 %  |
| Neutralitäts-Score      | Mensch bewertet Suggestivität     | ≥ 4/5  |
| § 226-Konformität       | Jurist prüft Tatsachenerfindung   | 100 %  |

## 11) Edge-Cases

- Leerer Akt (0 Dokumente) → keine Empfehlung, Hinweis „Dokumente importieren"
- 1 Dokument → nur intra-document Widersprüche, kein Parteienvergleich
- 2000+ Seiten → Map-Reduce, Token-Budget-Warnung, ggf. nur Teile
- Neue Dokumentversion → Sequential Amendment Processing, resolved view
- Re-Upload gleicher Datei → Idempotenz (content-hash), kein Duplikat
- Engine nicht erreichbar → fail-closed, keine Teilergebnisse
- Auditor verwirft Widerspruch → erscheint nicht im Ergebnis
- Citation-Entailment < 0,7 → Claim nicht ausgeben (fail-closed)
- Cross-source-Leck → Source-Isolation via `sourceScopeOpts(ctx)` (Invariant)

## 12) Definition of Done

- [ ] `MatterFactEntry` um neue Felder erweitert (rückwärtskompatibel)
- [ ] `ContradictionReport` + `CaseInvestigationResult` in `matter-context-types.ts`
- [ ] `case-investigation-suggest.ts` mit `shouldSuggestInvestigation()`
- [ ] Copilot-Tool `case_investigation` in `agent-conditionals.ts` registriert
- [ ] Tool-Handler in `copilot/tools/route.ts` mit Schema + Execute
- [ ] API-Route `/api/legal/case-investigation` (Engine-Proxy, citationGate)
- [ ] API-Route `/api/matter-context/[caseSlug]/investigation-suggest`
- [ ] UI-View `/dashboard/cases/[slug]/investigation/[runId]` (Split-Pane)
- [ ] Accept/Dismiss schreibt `review_status` (PATCH-Route)
- [ ] CitationPanel + „anwaltlich zu prüfen" auf allen AI-Output-Flächen
- [ ] Source-Isolation via `sourceScopeOpts(ctx)`
- [ ] Tests für Suggest-Logik + Types
- [ ] Toast bei Erfolg UND Fehler jeder Mutation
- [ ] `queryClient.invalidateQueries` nach Mutation
- [ ] Buttons während `isPending` disabled
- [ ] DACH-Texte (de-AT), keine englischen UI-Labels
- [ ] WCAG 2.1 AA, `prefers-reduced-motion` respektiert

## 13) Quellen

1. LegalGraphRAG (ACL 2026): https://aclanthology.org/2026.acl-long.1738/
2. magelegal 6-Layer: https://magelegal.com/blog/how-to-architect-a-document-ai-pipeline-for-legal
3. parthac.me Production-Architektur: https://parthac.me/posts/2026/system-architecture-legal-retrieval/
4. PleadProof (Harvey Challenge 2026): https://github.com/hackthelaw-cambridge/2026-Behemoth
5. ConflictRAG: https://arxiv.org/html/2605.17301v2
6. W3C PROV-DM: https://www.w3.org/TR/prov-dm/
7. NIST AI RMF: https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/
8. College of Policing PEACE: https://www.college.police.uk/app/investigation/investigative-interviewing/investigative-interviewing
9. NCSC Hallucination Guide: https://www.ncsc.org/resources-courts/legal-practitioners-guide-ai-hallucinations
10. RIS § 226/272/274 ZPO: https://www.ris.bka.gv.at/
11. GroundTruth Citation UX: https://groundtruth.law/
12. Multigrid Citation UX: https://multigrid.ai/learn/citation-ux
13. Dale Review Findings: https://docs.dale.legal/reviewing/findings
