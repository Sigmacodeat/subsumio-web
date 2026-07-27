# Subsumio Agenten-Schichten & Audit-Prompts

## Architektur-Übersicht

```
Schicht 1: Chat Copilot (Frontend)           → src/components/chat/system-prompt.ts
Schicht 2: Think Pipeline (Synthesis Engine) → server/src/core/think/
Schicht 3: Legal Agent Pipeline (27+ Layer)  → server/src/core/minions/
Schicht 4: Interactive Specialists           → specialist-defs.ts (Copilot-Modus)
```

---

## Schicht 1: Chat Copilot

**Datei:** `src/components/chat/system-prompt.ts`

**Rolle:** Brain Copilot für Kanzlei-Nutzer. Conversational Interface mit Tool-Markern.

**Kern-Features:** Jurisdiction-aware (DE/AT/CH/EU), Tageszeit-Begrüßung, Spracherkennung, Mandantenisolation, Legal Precision (keine Halluzinationen, keine abgeleiteten Definitionen), Tool-Marker (navigate, search_cases, search_deadlines, rvg_calculate, precedent_search, etc.), proaktive Fristen-Warnungen, Smart Follow-Ups.

**Audit-Prompt:**

```
Du bist ein Auditor für den Chat Copilot Layer. Prüfe:
1. PERSONA: Konsistent? Warm + professionell?
2. JURISDICTION: Alle 4 (DE/AT/CH/EU)? Collision Warnings?
3. SPRACHERKENNUNG: Erkennt Sprache, antwortet in derselben?
4. MANDANTENISOLATION: Nur aktive Akte?
5. LEGAL PRECISION: §-Zitate korrekt? Halluzinationsschutz? Keine abgeleiteten Definitionen?
6. TOOLS: Alle Tool-Marker funktional? (navigate, search_cases, search_deadlines, client_lookup, email_draft, rvg_calculate, precedent_search, etc.)
7. FRISTEN-WARNUNGEN: Proaktiv bei <7 Tagen?
8. FOLLOW-UPS: 1-3 sinnvolle Fragen?
9. CONVERSATION HISTORY: Korrekt eingebunden?
10. MEMORY: mem0 korrekt integriert?
11. EDGE CASES: Leere Akten? Unbekannte Jurisdiktionen? Off-Topic?
12. ACCESSIBILITY: Keine Wall-of-Text?
Bewerte mit: ✅ PERFEKT | ⚠️ VERBESSERUNGSWÜRDIG | ❌ FEHLT
Gib Code-Referenzen (Datei:Zeile).
```

---

## Schicht 2: Think Pipeline (Synthesis Engine)

**Dateien:** `server/src/core/think/index.ts`, `gather.ts`, `prompt.ts`, `cross-verify.ts`, `citation-guardrail.ts`

**Pipeline:** `User Question → Injection Scan → Gather (4 parallel) → Synthese (LLM) → Tier 0 Guardrail → Tier 1 Cross-Verify → Confidence → Provenance → Ensemble → Output`

**Gather-Streams (parallel):** Hybrid Search (keyword+vector+RRF), Takes Keyword, Takes Vector, Graph Traversal + Legal Fan-out

**System Prompt (BASE):** Cite EVERY claim with [slug#row] or [slug]. Surface contradictions in "Conflicts". Missing data in "Gaps". Output MUST be valid JSON: { answer, citations[], gaps[] }.

**Guardrails:**

- **Tier 0 (deterministic):** Citation presence, law validation, non-§ reference, hedging, cross-law contamination
- **Tier 1 (LLM, Grok 4.3):** Ungrounded citations, wrong application, jurisdiction mismatch, derived definitions, fabricated references
- **Regeneration:** Max 1 per tier with stricter prompt
- **Confidence:** Per-claim scoring
- **Provenance:** Click-through links
- **Ensemble:** Paraphrase judge (every legal answer) + strict mode (conservative)

**Audit-Prompt:**

```
Du bist ein Auditor für die Think Pipeline. Prüfe:
1. GATHER: 4 Streams parallel? (hybrid, takes keyword, takes vector, graph)
2. LLM RERANK: Aktiviert für legal queries?
3. INJECTION SCAN: Adversarial input erkannt? Prompt-Injections blockiert?
4. MODEL ROUTING: legalMode/taxMode → besseres Modell?
5. DYNAMIC TOKENS: Basierend auf Komplexität?
6. TIER 0: Alle 5 deterministischen Checks? (presence, law validation, non-§, hedging, cross-law)
7. TIER 1: Grok 4.3? Alle 5 Flags? (ungrounded, wrong application, jurisdiction, derived, fabricated)
8. REGENERATION: Max 1 pro Tier? Stricter Prompt korrekt?
9. CONFIDENCE: Per-claim? Nachvollziehbar?
10. PROVENANCE: Click-through Links? Unsupported claims markiert?
11. ENSEMBLE: Stage 3 auf jede legal answer? Stage 4 bei conservative?
12. STREAMING: Funktional? Fallback bei Fehler?
13. DIAGNOSTICS: warnings, guardrail flags, cross-verify, provenance im Output?
14. LEGAL/TAX MODE: Korrekt erkannt? (Keyword-basiert)
15. JURISDICTION: AT/DE/CH/EU korrekt weitergegeben?
Bewerte mit: ✅ | ⚠️ | ❌ + Code-Referenzen.
```

---

## Schicht 3: Legal Agent Pipeline (27+ Layer)

**Dateien:** `legal-pipeline.ts`, `pipeline-registry.ts`, `workflow-defs.ts`, `specialist-defs.ts`

### Pipeline-Struktur

| Layer | Specialist                     | Mandatory | Tier      | Output                            |
| ----- | ------------------------------ | --------- | --------- | --------------------------------- |
| 0     | doc-classifier                 | no        | utility   | doc_types                         |
| 1     | on-scanner                     | **YES**   | utility   | on_table, verfahrenstyp           |
| 2     | entity-extractor               | **YES**   | utility   | entities                          |
| 3     | forensic-analyst               | **YES**   | reasoning | forensic_report                   |
| 3c    | fact-gap-detector              | no        | reasoning | fact_gaps, client_questions       |
| 4     | law-matcher                    | **YES**   | utility   | legal_grounding_map               |
| 4b    | precedent-matcher              | no        | reasoning | precedent_matches                 |
| 4c    | burden-of-proof-analyzer       | no        | reasoning | burden_of_proof                   |
| 4d    | admissibility-checker          | no        | reasoning | admissibility_check               |
| 4f    | evidence-quality-assessor      | no        | reasoning | evidence_quality                  |
| 4g    | witness-expert-analyzer        | no        | reasoning | witness_analysis                  |
| 5     | damage-extractor               | **YES**   | reasoning | damage_table, deadline_calendar   |
| 5b    | deadline-validator             | **YES**   | reasoning | deadline_validation               |
| 5c    | cost-benefit-analyzer          | no        | reasoning | cost_benefit                      |
| 5d    | settlement-analyzer            | no        | reasoning | settlement_analysis               |
| 5e    | enforcement-analyzer           | no        | reasoning | enforcement_analysis              |
| 5f    | appeal-risk-analyzer           | no        | reasoning | appeal_risk                       |
| 5g    | procedural-strategist          | no        | reasoning | procedural_strategy               |
| 5h    | insurance-coverage-analyzer    | no        | reasoning | insurance_coverage                |
| 5i    | tax-impact-analyzer            | no        | reasoning | tax_impact                        |
| 5j    | counterclaim-analyzer          | no        | reasoning | counterclaim_risk                 |
| 5k    | mediation-adr-analyzer         | no        | reasoning | mediation_adr                     |
| 5l    | limitation-scanner             | **YES**   | reasoning | limitation_scan                   |
| 5m    | cost-award-predictor           | no        | reasoning | cost_award                        |
| 6     | legal-drafter                  | **YES**   | reasoning | drafts                            |
| 6.5   | opponent-simulator             | **YES**   | deep      | counter_arguments, revised_drafts |
| 7     | subsumption-checker            | **YES**   | deep      | subsumption_check                 |
| 7     | ensemble-critic (legal-critic) | **YES**   | deep      | quality_audit, ensemble_verdict   |
| 8     | contradiction-probe            | no        | -         | contradiction_findings            |
| 8     | cross-case-matrix              | no        | -         | cross_case_matrix                 |
| 8     | institution-checklist          | no        | -         | institution_checklist             |

### Workflows

| Workflow         | Layer-Anzahl | Approval Gates                         |
| ---------------- | ------------ | -------------------------------------- |
| `memo`           | 9            | ensemble-critic                        |
| `fristen_report` | 12           | deadline-validator, limitation-scanner |
| `schriftsatz`    | 6            | legal-drafter, ensemble-critic         |
| `full_pipeline`  | 27+          | —                                      |

### Modell-Tier-Routing

| Tier      | Modell            | Specialists                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| utility   | DeepSeek V4 Flash | on-scanner, entity-extractor, law-matcher, legal-deadline-extractor                                                                                                                                                                                                                                                                 |
| reasoning | DeepSeek V4 Flash | forensic-analyst, legal-drafter, damage-extractor, deadline-validator, cost-benefit, settlement, enforcement, appeal-risk, procedural-strategist, insurance, tax-impact, counterclaim, evidence-quality, witness-expert, precedent-matcher, burden-of-proof, admissibility, fact-gap, limitation-scanner, cost-award, mediation-adr |
| deep      | Grok 4.3          | legal-critic, opponent-simulator, subsumption-checker                                                                                                                                                                                                                                                                               |

---

## Spezialisten-Prompts (Vollständige Liste)

### Interactive Specialists (Copilot-Modus)

#### 1. legal-researcher

**Tier:** reasoning | **maxTurns:** 25 | **Tools:** LEGAL_BRAIN_TOOLS + FILE_TOOLS

**Prompt-Kern:** Recherchiert präzise zu Rechtsfragen. Zitiert §§ mit Fassungsdatum. Agentic Search: min. 2 Iterationen bei <5 Treffern, max 3. traverse_graph nach erster Suche. Dokumentiert Such-Strategie.

**Audit-Prompt:**

```
Prüfe legal-researcher: Zitiergenauigkeit (§+Abkürzung+Fassung)? Iterative Suche (min 2)? traverse_graph? get_page? Quellenangabe? Neutralität? Unsicherheits-Behandlung? Such-Strategie-Doku? maxTurns=25 ausreichend? Alle Tools vorhanden?
```

#### 2. legal-analyst

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Strukturierte Rechtsanalyse (IRAC). Identifiziert Anspruchsgrundlagen, Tatbestandsmerkmale.

**Audit-Prompt:**

```
Prüfe legal-analyst: IRAC-Struktur? Alle §§ identifiziert? Tatbestandsmerkmale vollständig? Agentic Search? Quellen mit Fassungsdatum? Neutralität?
```

#### 3. legal-strategist

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Prozessstrategie, Erfolgsaussichten, Risiko, Kosten, prozessuale Schritte.

**Audit-Prompt:**

```
Prüfe legal-strategist: Konkrete Schritte? Erfolgsaussichten (0-100%)? Risiko bei Verlust? Kosten plausibel (RVG/AHGB)? Alternativen? §-Bezug?
```

#### 4. legal-drafter

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Juristische Entwürfe (Klage, Berufung, AHG-Antrag, etc.). Jurisdiction-aware. §-Zitate aus Legal Grounding Map.

**Audit-Prompt:**

```
Prüfe legal-drafter: Jurisdiction-aware (AT/DE/CH/EU)? §-Zitate aus Grounding Map? Formale Anforderungen? Sachverhalt korrekt? Anträge beziffert? Begründung logisch? Parteirolle erkannt? Draft-Packages verwendet?
```

#### 5. legal-critic

**Tier:** deep (Grok 4.3) | **maxTurns:** 20

**Prompt-Kern:** Prüft auf Halluzinationen, Citation-Accuracy, Rechtsschluss-Fehler, Unvollständigkeit. Verifiziert §§ gegen Brain. 3-Model Consensus. Feedback Loop max 2 retries.

**Audit-Prompt:**

```
Prüfe legal-critic: Halluzinations-Erkennung? Citation-Accuracy? Jurisdiktion-Check? Rechtsschluss-Fehler? Unvollständigkeit? Severity-Levels? Score (0-100)? Empfehlung (publish/revise/reject)? Ensemble (3-Model, majority, min())? Feedback Loop (max 2, score<70)? Agentic Search (jede Output-Page)? find_contradictions? Strenge ("besser falsch-positiv")?
```

#### 6. legal-deadline-extractor

**Tier:** utility | **maxTurns:** 15

**Prompt-Kern:** Extrahiert Fristen VERBATIM. Verfahrenstyp-spezifisch. Berechnet NIEMALS selbst.

**Audit-Prompt:**

```
Prüfe legal-deadline-extractor: VERBATIM? Keine Selbstberechnung? Verfahrenstyp-spezifisch? Frist-Typen? Quelle+Datum+§? put_page? Iterative Suche? Hinweis "anwaltliche Prüfung"?
```

---

### Pipeline Specialists (Layer 1-7)

#### 7. on-scanner (Layer 1, MANDATORY)

**Tier:** utility | **maxTurns:** 15 | **Tools:** get_page, search, query

**Prompt-Kern:** Extrahiert ON-Tabelle. Jurisdiction-aware (AT: GVgo, DE: Blatt, CH: Act., EU: Doc). AT-spezifisch: Mappen (§ 87 StPO), Beilagen (§ 379 GVgo), strukturierte GZ. HALLUCINATION-GATE: Jede ON wörtlich im Text.

**Audit-Prompt:**

```
Prüfe on-scanner: Jurisdiction-aware (AT/DE/CH/EU)? AT: Mappen+Beilagen+GZ? Verfahrenstyp aus Gattungszeichen? HALLUCINATION-GATE (ON wörtlich)? JSON-Output? Querverweise (references)? Numerische Sortierung? Direkte Verarbeitung (Text im Prompt)?
```

#### 8. entity-extractor (Layer 2, MANDATORY)

**Tier:** utility | **maxTurns:** 15

**Prompt-Kern:** Extrahiert Personen/Firmen/Behörden/Anwälte. Verfahrenstyp-spezifische Rollen. Aliases, ON-Refs, Zitate, accusations, context_description, represents, verfahren_refs. HALLUCINATION-GATE: Name MUSS wörtlich im Text. Deduplizierung.

**Audit-Prompt:**

```
Prüfe entity-extractor: Entity-Typen? Rollen verfahrenstyp-spezifisch? Aliases? ON-Referenzen? Zitate? Accusations (nur Beschuldigte)? context_description? represents (Anwälte)? verfahren_refs? HALLUCINATION-GATE? Deduplizierung?
```

#### 9. forensic-analyst (Layer 3, MANDATORY)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Forensischer Bericht nach Gold-Standard. Verfahrenstyp-spezifisch (Straf: unterlassene Ermittlungen, Amtshaftung; Zivil: Anspruchsanalyse). META-CHECK: Verfahrensverstöße Gegenseite. HALLUCINATION-GATE: Jede Behauptung mit Zitat. "Nicht im Akt dokumentiert" wenn kein Beleg.

**Audit-Prompt:**

```
Prüfe forensic-analyst: Verfahrenstyp-spezifisch? HALLUCINATION-GATE (Zitat für jede Behauptung)? Chronologie mit ON? Unterlassene Maßnahmen (beantragt→veranlasst→Ergebnis)? Nicht vernommene Personen? Geldfluss? Amtshaftungspunkte? META-CHECK (Verfahrensverstöße Gegenseite)? severity-Levels? Agentic Search (max 3)? §-Verifizierung gegen Brain?
```

#### 10. law-matcher (Layer 4, MANDATORY)

**Tier:** utility | **maxTurns:** 30

**Prompt-Kern:** Matcht forensische Befunde gegen Gesetzeskorpus. Verfahrenstyp-spezifisch. HALLUCINATION-GATE: Keine erfundenen §§, source_text wörtlich aus Brain. Backend prüft verified.

**Audit-Prompt:**

```
Prüfe law-matcher: Verfahrenstyp-spezifisch? HALLUCINATION-GATE (keine erfundenen §§)? source_text wörtlich aus Brain? verified vom Backend gesetzt (nicht vom Agent)? Iterative Suche (max 3 pro Befund)? JSON-Output (grounding_entries)?
```

#### 11. fact-gap-detector (Layer 3c)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Identifiziert Sachverhaltslücken. Vergleicht extrahierte Fakten mit Tatbestandsmerkmalen. Generiert Mandantenfragen.

**Audit-Prompt:**

```
Prüfe fact-gap-detector: Verfahrenstyp-spezifisch? Fehlende Fakten? Klärungsfragen spezifisch? Beweislücken? Zeitliche Lücken? Mandantenfragen auf Einzelfall zugeschnitten? §-Verifizierung aus Brain? overall_vollstaendigkeit_score?
```

#### 12. precedent-matcher (Layer 4b)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Sucht OGH/BGH/BVerfG/VwGH Judikate. 3+ Suchstrategien pro Anspruch (keyword, semantisch, konzeptionell). Stützende + gefährdende + abweichende Judikatur.

**Audit-Prompt:**

```
Prüfe precedent-matcher: Verfahrenstyp-spezifisch (Senat-Zuordnung)? 3+ Suchstrategien? Stützende + gefährdende Judikate? Sachverhaltsähnlichkeit? Aktualität? HALLUCINATION-GATE (keine erfundenen Judikate)? precedent_gaps bei keinen Treffern? verified=false bei unsicherer Quelle?
```

#### 13. burden-of-proof-analyzer (Layer 4c)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Beweislastverteilung. Verfahrenstyp-spezifisch (Straf: Inquisitionsgrundsatz, Zivil: Beibringungsgrundsatz). Beweislastumkehr bei Amtshaftung.

**Audit-Prompt:**

```
Prüfe burden-of-proof-analyzer: Verfahrenstyp-spezifisch? Beweislastverteilung korrekt? Umkehr erkannt? Beweise vorhanden/fehlend? Beweiskraft (stark/mittel/schwach)? missing_evidence mit Priorität? Beweisstrategie?
```

#### 14. admissibility-checker (Layer 4d)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Prüft Zulässigkeit: Zuständigkeit, Rechtswegerschöpfung, Verjährung, Klagefristen, Parteifähigkeit, Postulationsfähigkeit.

**Audit-Prompt:**

```
Prüfe admissibility-checker: Alle 6 Kriterien? (Zuständigkeit, Rechtsweg, Verjährung, Fristen, Parteifähigkeit, Postulation)? blockierende Fehler? Warnungen? overall_zulaessigkeit_score? §-Verifizierung aus Brain?
```

#### 15. evidence-quality-assessor (Layer 4f)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Beweiskraft-Classifizierung (sehr_hoch bis sehr_gering). Schwachstellen. Verifikationsempfehlung. Beweislücken.

**Audit-Prompt:**

```
Prüfe evidence-quality-assessor: Beweiskraft-Klassifizierung korrekt? (Urkunde > Zeuge > Hörensagen)? Schwwachstellen? Angriffsvektoren? Verifikationsempfehlung? Beweislücken für streitentscheidende Frage?
```

#### 16. witness-expert-analyzer (Layer 4g)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Zeugenbewertung (Glaubwürdigkeit, Belastbarkeit, Widersprüche, Parteilichkeit). Gutachten-Bedarf. Gutachter-Auswahl. Kosten.

**Audit-Prompt:**

```
Prüfe witness-expert-analyzer: Zeugenbewertung (Glaubwürdigkeit, Belastbarkeit, Widersprüche)? Zeugenlücken? Gutachten-Bedarf (medizinisch/technisch/wirtschaftlich/psychologisch)? Gutachter-Auswahl (gerichtlich/privat)? Kosten plausibel?
```

#### 17. damage-extractor (Layer 5, MANDATORY)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Extrahiert Schadenspositionen in Töpfe (AT: ahg/dsgvo/privatbeteiligung/zivilklage; DE: amtshaftung/dsgvo/schmerzensgeld/zivilklage; CH: staatshaftung/dsg/schadensersatz). Fristen VERBATIM. HALLUCINATION-GATE.

**Audit-Prompt:**

```
Prüfe damage-extractor: Verfahrenstyp-spezifisch? Topf-Typen jurisdiktionsspezifisch? Status (EISEN/STARK/MITTEL/SCHWACH)? Fristen VERBATIM? Ampel (rot/gelb/gruen)? HALLUCINATION-GATE (Betrag als Zitat)? §-Verifizierung?
```

#### 18. deadline-validator (Layer 5b, MANDATORY)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Validiert Fristen gegen gesetzliche Verjährungsregeln. Prüft: korrekt? abgelaufen? unterbrochen? fehlt? Verjährungsregeln nach Jurisdiktion.

**Audit-Prompt:**

```
Prüfe deadline-validator: Verjährungsregeln korrekt? (AT: §1489 ABGB, DE: §195 BGB, CH: Art127 OR)? Status (gueltig/abgelaufen/fehlt/unsicher)? missing_deadlines? berechnetes_enddatum? §-Verifizierung aus Brain?
```

#### 19. cost-benefit-analyzer (Layer 5c)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Expected Value, Win Probability, Kosten (RVG/StBVV/AHGB), Break-Even, Risiko. Szenarien (Best/Realistic/Worst).

**Audit-Prompt:**

```
Prüfe cost-benefit-analyzer: EV-Formel korrekt? (p×Schaden - Kosten)? Win probability plausibel? Kosten (RVG/AHGB/StBVV)? Break-Even? Szenarien? risk_reward_ratio? kosten_nutzen_urteil?
```

#### 20. settlement-analyzer (Layer 5d)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** BATNA, ZOPA, optimaler Vergleichsbetrag, Walk-away, Verhandlungsstrategie. Verfahrenstyp-spezifisch (Straf: Diversion, Verwaltungsrecht: kein Vergleich).

**Audit-Prompt:**

```
Prüfe settlement-analyzer: BATNA korrekt (aus EV)? ZOPA mathematisch korrekt? (untergrenze ≤ obergrenze)? Walk-away? Verhandlungsstrategie (Anker, Konzessionen)? Verfahrenstyp-spezifisch?
```

#### 21. enforcement-analyzer (Layer 5e)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Vermögenslage, Insolvenzrisiko, Pfändbarkeit, Arrestgründe, Vollstreckungskosten, -risiko.

**Audit-Prompt:**

```
Prüfe enforcement-analyzer: Vermögenslage aus forensischem Bericht? Insolvenzrisiko (§17 InsO DE, §66 IO AT)? Pfändbarkeit (EO/ZPO/SchKG)? Arrestgründe? Vollstreckungskosten? -risiko + Gegenmaßnahmen?
```

#### 22. appeal-risk-analyzer (Layer 5f)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Berufungsgründe (Rechtsfehler/Verfahrensfehler/Tatsachenfehler), Berufungsaussicht, Revisionsrisiko, EuGH, EGMR, Kostenrisiko.

**Audit-Prompt:**

```
Prüfe appeal-risk-analyzer: Berufungsgründe aus Pipeline-Outputs? Erfolgsaussicht (0-100)? Revisionsrisiko? EuGH-Vorabentscheidung? EGMR? Kostenrisiko für Gegner? overall_berufungsrisiko_score?
```

#### 23. procedural-strategist (Layer 5g)

**Tier:** reasoning | **maxTurns:** 25

**Prompt-Kern:** Prozessuale Schritte in Reihenfolge. Einstweilige Verfügung/Arrest. Beweissicherung. Teilklage vs. Gesamtklage. Mediation.

**Audit-Prompt:**

```
Prüfe procedural-strategist: Schritte logisch geordnet (Arrest vor Klage)? Dringlichkeit? Dauer? Kosten? Erfolgsaussicht? einstweilige Verfügung? Beweissicherung? Teilklage? Mediation? gesamt_strategie?
```

#### 24. insurance-coverage-analyzer (Layer 5h)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Versicherungen, Deckungsprüfung, Direktklage, Regressrisiko, Versicherungsstatus.

**Audit-Prompt:**

```
Prüfe insurance-coverage-analyzer: Versicherungsarten? Deckungssumme? Ausschlüsse (Vorsatz)? Direktklage (§67 KFG AT, §3 PflVG DE)? Regressrisiko? Versicherungsstatus (bekannt/unbekannt)?
```

#### 25. tax-impact-analyzer (Layer 5i)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Netto-EV nach Steuern. Schadensersatz-Besteuerung (Schmerzensgeld steuerfrei, Verdienstentgang steuerpflichtig). Vergleich vs. Urteil. Gestaltungsempfehlung.

**Audit-Prompt:**

```
Prüfe tax-impact-analyzer: Steuerklassen korrekt? (Schmerzensgeld steuerfrei, Verdienstentgang steuerpflichtig)? Netto-EV Berechnung? Vergleich vs. Urteil? Gestaltungsempfehlung? Steuersätze plausibel (AT 0-55%, DE 14-45%)?
```

#### 26. counterclaim-analyzer (Layer 5j)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Gegnerische Gegenansprüche, Widerklage, Aufrechnung, prozessuale Einwendungen, Netto-EV nach Widerklage.

**Audit-Prompt:**

```
Prüfe counterclaim-analyzer: Gegenansprüche aus Sachverhalt? Widerklage (§229 ZPO AT, §33 ZPO DE)? Aufrechnung (§1441 ABGB, §387 BGB)? Einwendungen (Verjährung, Zurückbehaltung)? Netto-EV Anpassung?
```

#### 27. mediation-adr-analyzer (Layer 5k)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Mediation, Schiedsverfahren, Schlichtung. Verfahrenstyp-spezifisch.

**Audit-Prompt:**

```
Prüfe mediation-adr-analyzer: Verfahrenstyp-spezifisch? (Straf: Diversion, Zivil: Schlichtung, Arbeitsrecht: Güteverfahren)? Eignung? Kosten/Vorteile vs. Prozess? Empfehlung?
```

#### 28. limitation-scanner (Layer 5l, MANDATORY)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Scant jeden Anspruch auf Verjährung. URGENT/WARNUNG/OK Status pro Anspruch.

**Audit-Prompt:**

```
Prüfe limitation-scanner: Jeder Anspruch geprüft? Verjährungsfristen korrekt? (AT: §1489 ABGB 3J, DE: §195 BGB 3J, CH: Art127 OR 10J)? Status (URGENT/WARNUNG/OK)? Hemmung/Unterbrechung? Kenntnisnahme-Datum?
```

#### 29. cost-award-predictor (Layer 5m)

**Tier:** reasoning | **maxTurns:** 20

**Prompt-Kern:** Vorhersage Kostenentscheidung pro Szenario. Netto-Kosten.

**Audit-Prompt:**

```
Prüfe cost-award-predictor: Kostenentscheidung pro Szenario (Gewinn/Verlust)? Netto-Kosten? §-Bezug (§91 ZPO DE, §394 ZPO AT)? Streitwert-abhängig?
```

#### 30. opponent-simulator (Layer 6.5, MANDATORY)

**Tier:** deep (Grok 4.3) | **maxTurns:** 25

**Prompt-Kern:** Übernimmt Rolle der Gegenseite. Liest Entwürfe, sucht Schwächen. 8 Prüfpunkte: Sachlichkeit, Beweislage, Verfahrensfehler, Fristen, Subsumtion, Schadenshöhe, Beweisverwertung, Zuständigkeit. Generiert Gegenargumente. Drafter überarbeitet. HALLUCINATION-GATE: Keine erfundenen §§, Gegenargumente MUSS aus Pipeline-Outputs ableitbar sein.

**Audit-Prompt:**

```
Prüfe opponent-simulator: Übernimmt Gegenseite-Perspektive? Liest alle Entwürfe mit get_page? 8 Prüfpunkte vollständig? Gegenargumente aus Pipeline-Outputs ableitbar? HALLUCINATION-GATE (keine erfundenen §§)? revised_drafts nach Überarbeitung? severity-Levels? overall_gegner_score?
```

#### 31. subsumption-checker (Layer 7, MANDATORY)

**Tier:** deep (Grok 4.3) | **maxTurns:** 25

**Prompt-Kern:** Prüft juristische Logik (Obersatz → Untersatz → Schluss). Für jeden forensic_report/draft: §-Regel, Fakt aus Akt, Schluss. Errors: fehlender Obersatz, falscher Obersatz, fehlender Untersatz, nicht schlüssig, unvollständig. Verdict: korrekt/fehlerhaft/unsicher. overall_subsumption_score (0-100).

**Audit-Prompt:**

```
Prüfe subsumption-checker: Obersatz→Untersatz→Schluss für jeden Claim? §-Regel korrekt? Fakt aus Akt (wörtliches Zitat)? Schluss logisch? Error-Types vollständig? (fehlender/falscher Obersatz, fehlender Untersatz, nicht schlüssig, unvollständig)? Verdict (korrekt/fehlerhaft/unsicher)? overall_subsumption_score? critical_errors? HALLUCINATION-GATE (§§ aus Brain)?
```

#### 32. ensemble-critic / legal-critic (Layer 7, MANDATORY)

**Tier:** deep (Grok 4.3) | **maxTurns:** 20

**Prompt-Kern:** 3-Model Consensus (GPT + DeepSeek + Grok). Majority vote auf Empfehlung, min() auf Scores. Prüft: Halluzinationen, Citation-Accuracy, Jurisdiktion, Rechtsschluss, Unvollständigkeit. Feedback Loop max 2 retries bei score < 70.

**Audit-Prompt:**

```
Prüfe ensemble-critic: 3-Model Consensus? Majority vote? min() auf scores? Lädt JEDE Output-Page mit get_page? Prüft jedes Zitat? Halluzinations-Erkennung? Jurisdiktion-Check? Severity-Levels? Score (0-100)? Empfehlung (publish/revise/reject)? Feedback Loop (max 2, score<70)? find_contradictions? Strenge ("besser falsch-positiv")?
```

---

### Post-Pipeline Specialists (Layer 8)

#### 33. contradiction-probe (Layer 8)

**Prompt-Kern:** Sucht Widersprüche zwischen Pipeline-Outputs und Original-Akten. Auto-triggered post-pipeline.

**Audit-Prompt:**

```
Prüfe contradiction-probe: Vergleicht alle Pipeline-Outputs mit Original-Akten? Widersprüche markiert? Severity-Levels? Querverweise (ON + Output-Page)?
```

#### 34. cross-case-matrix (Layer 8)

**Prompt-Kern:** Fall-übergreifende Haftungsmatrix + Master-Schadenstabelle für Multi-Case Mandate.

**Audit-Prompt:**

```
Prüfe cross-case-matrix: Verknüpft verwandte Fälle? Master-Schadenstabelle? Haftungsmatrix? Doppelverrechnung erkannt?
```

#### 35. institution-checklist (Layer 8)

**Prompt-Kern:** Identifiziert zu benachrichtigende Institutionen (Finanzamt, Sozialversicherung, Aufsichtsbehörde, etc.).

**Audit-Prompt:**

```
Prüfe institution-checklist: Verfahrenstyp-spezifisch? Alle relevanten Institutionen? Fristen für Meldungen? §-Bezug?
```

---

## Übergreifender System-Audit-Prompt

```
Du bist ein Principal Engineer und führst ein vollständiges Audit des Subsumio Legal AI Systems durch.

Prüfe folgende Querschnitt-Aspekte:

### 1. ARCHITEKTUR-KONSISTENZ
- Sind alle 27+ Pipeline-Layer in LAYER_REGISTRY, WORKFLOW_DEFS und EMBEDDED_SPECIALISTS konsistent?
- Stimmen die specialist-Namen zwischen pipeline-registry.ts und specialist-defs.ts überein?
- Sind alle mandatory-Layer mit failurePolicy="fail" markiert?
- Gibt es Layer die in keiner Workflow-Definition verwendet werden?

### 2. MODELL-TIER-ROUTING
- Sind alle 3 deep-tier specialists korrekt? (legal-critic, opponent-simulator, subsumption-checker)
- Sind alle 4 utility-tier specialists korrekt? (on-scanner, entity-extractor, law-matcher, legal-deadline-extractor)
- Sind alle remaining specialists auf reasoning?
- Ist kein specialist auf subagent-tier?

### 3. HALLUCINATION-GATES
- Hat JEDER specialist einen HALLUCINATION-GATE-Block im systemPrompt?
- Werden §§ immer gegen das Brain verifiziert (search/get_page)?
- Gibt es Fallback-Verhalten bei fehlenden Daten? (leere Arrays, score=0, "unsicher")
- Werden Zitate als wörtlich markiert?

### 4. JURISDICTION-AWARENESS
- Sind alle 4 Jurisdiktionen (AT/DE/CH/EU) in JEDEN specialist abgedeckt?
- Gibt es jurisdiction-spezifische §-Referenzen?
- Werden falsche Jurisdiktionen erkannt? (z.B. ABGB in DE-Fall)

### 5. VERFAHRENSTYP-AWARENESS
- Sind alle Verfahrenstypen (straf/zivil/arbeitsrecht/verwaltungsrecht) in JEDEN specialist abgedeckt?
- Gibt es verfahrenstyp-spezifische §-Referenzen?
- Werden Besonderheiten behandelt? (Straf: keine Widerklage, Verwaltungsrecht: keine Vergleich)

### 6. TOOL-ZUGRIFF
- Haben §-retrieval specialists search + get_page?
- Haben drafting specialists put_page?
- Haben analysis specialists traverse_graph?
- Ist maxTurns angemessen für Komplexität?

### 7. OUTPUT-FORMAT
- Ist JEDER specialist JSON-Output definiert?
- Sind Pflichtfelder markiert?
- Gibt es overall_*_score (0-100) für jeden specialist?
- Gibt es empfehlung-Text für jeden specialist?

### 8. WORKFLOW-DEFINITIONS
- Sind alle 4 Workflows (memo, fristen_report, schriftsatz, full_pipeline) korrekt?
- Sind approvalGates sinnvoll gesetzt?
- Sind dependsOn-Beziehungen korrekt?
- Sind alle Layer-Referenzen gültig (validateWorkflowDef)?

### 9. PIPELINE-HANDLER
- Werden mandatory-Layer mit on_child_fail="fail_parent" ausgeführt?
- Werden optional-Layer mit on_child_fail="continue" ausgeführt?
- Wird die Layer-Reihenfolge eingehalten?
- Werden approvalGates respektiert?

### 10. GUARDRAIL-INTEGRATION
- Läuft Tier 0 (deterministic) auf jede legal answer?
- Läuft Tier 1 (cross-verify mit Grok 4.3) bei legalMode?
- Max 1 regeneration pro Tier?
- Werden warnings im Output zurückgegeben?

Bewerte jeden Aspekt mit: ✅ PERFEKT | ⚠️ VERBESSERUNGSWÜRDIG | ❌ FEHLT
Gib konkrete Code-Referenzen (Datei:Zeile) und konkrete Verbesserungsvorschläge.
```
