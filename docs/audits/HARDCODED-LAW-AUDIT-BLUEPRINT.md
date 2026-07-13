# Hardcoded Legal Rules Audit — Blueprint & Inventory

**Datum:** 2026-07-13  
**Status:** Blueprint Phase (Phase 1)  
**Ziel:** Juristische Regeln nicht ungeprüft in TypeScript konservieren — alle Regeln inventarisieren, Fehler bereinigen, in versionierte Datensätze mit Source Receipt + Reviewer-ID migrieren.

---

## 1. Inventarisierung — Alle Hardcoded Legal Rules

### 1.A Fristen-Regeln (Deadlines)

#### 1.A.1 `DEADLINE_RULES` — `src/lib/legal-deadlines.ts:463-649`

**22 hardcoded Fristregeln** für DE/AT/CH, jeweils mit `key`, `label`, `law`, `days`/`months`/`years`, `noRoll`, `description`.

| # | Key | Law | Dauer | noRoll | Fehler? |
|---|-----|-----|-------|--------|---------|
| 1 | zpo-verteidigungsanzeige | § 276 Abs. 1 S. 1 ZPO | 14d | – | – |
| 2 | zpo-klageerwiderung | § 276 Abs. 1 S. 2 ZPO | 28d | – | – |
| 3 | zpo-einspruch-vu | § 339 Abs. 1 ZPO | 14d | – | – |
| 4 | zpo-berufung | § 517 ZPO | 1m | – | – |
| 5 | zpo-berufungsbegruendung | § 520 Abs. 2 ZPO | 2m | – | – |
| 6 | zpo-revision | § 548 ZPO | 1m | – | – |
| 7 | zpo-beschwerde | § 569 Abs. 1 ZPO | 14d | – | – |
| 8 | stpo-revision-einlegung | § 341 Abs. 1 StPO | 7d | – | – |
| 9 | zpo-vollziehung-ev | §§ 929 Abs. 2, 936 ZPO | 1m | – | – |
| 10 | zpo-wiedereinsetzung | § 233 ZPO | 14d | – | – |
| 11 | vwgo-klage | § 60 VwGO | 1m | – | – |
| 12 | vwgo-widerspruch | § 70 VwVfG | 1m | – | – |
| 13 | stpo-beschwerde | § 295 StPO | 7d | – | – |
| 14 | vwgvg-beschwerde | § 7 Abs. 4 VwGVG (AT) | 28d | – | – |
| 15 | abgb-verjaehrung | § 1489 ABGB (AT) | 3y | ✓ | – |
| 16 | at-jn-berufung | § 5 Abs. 1 JN (AT) | 28d | – | – |
| 17 | at-jn-revision | § 5 Abs. 1 JN iVm § 502 ZPO (AT) | 28d | – | – |
| 18 | at-avg-einwendung | § 43 Abs. 2 AVG (AT) | 14d | – | – |
| 19 | at-bao-beschwerde | § 245 BAO (AT) | 28d | – | – |
| 20 | at-eke-einspruch | § 39 EO (AT) | 14d | – | – |
| 21 | ch-zpo-berufung | Art. 311 ZPO (CH) | 30d | – | – |
| 22 | ch-zpo-appellation | Art. 378 ZPO (CH) | 30d | – | – |
| 23 | ch-or-verjaehrung | Art. 127 OR (CH) | 10y | ✓ | – |
| 24 | ch-zgb-erbklage | Art. 602 ZGB (CH) | 1y | ✓ | – |
| 25 | ch-zpo-beschwerde | Art. 319 ZPO (CH) | 30d | – | – |

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id` — keines der 25 Rules hat Source Receipt oder Reviewer-ID.

#### 1.A.2 `FRISTEN_REGISTRY` — `src/lib/legal/frist-engine.ts:411-620` (AT-spezifisch)

**20 AT-Fristarten** mit `key`, `bezeichnung`, `dauer`, `regime`, `rechtsgrundlage`, `notfrist`, `gehemmtInVhfz`, `verfahrenstyp`.

| # | Key | Rechtsgrundlage | Dauer | Regime |
|---|-----|-----------------|-------|--------|
| 1 | klagebeantwortung | § 230 Abs 1 ZPO | 4w | zpo |
| 2 | einspruch_zahlungsbefehl | § 248 Abs 2 ZPO | 4w | zpo |
| 3 | berufung | § 464 Abs 1 ZPO | 4w | zpo |
| 4 | berufungsbeantwortung | § 468 Abs 2 ZPO | 4w | zpo |
| 5 | revision | § 505 Abs 2 ZPO | 4w | zpo |
| 6 | rekurs | § 521 Abs 1 ZPO | 14d | zpo |
| 7 | revisionsrekurs | § 528 ZPO iVm § 521 ZPO | 14d | zpo |
| 8 | widerspruch_versaeumungsurteil | § 397a Abs 1 ZPO | 14d | zpo |
| 9 | wiedereinsetzung | § 148 Abs 2 ZPO | 14d | zpo |
| 10 | einspruch_rechtsverletzung_stpo | § 106 Abs 3 StPO | 6w | stpo |
| 11 | beschwerde_stpo | § 88 Abs 1 StPO | 14d | stpo |
| 12 | berufungsanmeldung_stpo | § 466 Abs 1 / § 284 Abs 1 StPO | 3d | stpo |
| 13 | berufungsausfuehrung_stpo | § 285 Abs 1 / § 467 Abs 1 StPO | 4w | stpo |
| 14 | beschwerde_vwgvg | § 7 Abs 4 VwGVG | 4w | avg |
| 15 | revision_vwgh | § 26 Abs 1 VwGG | 6w | avg |
| 16 | beschwerde_vfgh | § 82 Abs 1 VfGG | 6w | avg |
| 17 | vorstellung_avg | § 57 Abs 2 AVG | 2w | avg |
| 18 | verjaehrung_kurz | § 1489 ABGB | 3y | materiell |
| 19 | verjaehrung_lang | § 1489 Satz 2 ABGB | 30y | materiell |
| 20 | gewaehrleistung_beweglich | § 933 Abs 1 ABGB | 2y | materiell |

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id`

#### 1.A.3 `VERJAEHRUNG_PRESETS` — `src/lib/legal-verjaehrung.ts:185-234`

**6 Verjährungs-Presets** für DE/AT/CH:

| # | Key | Law | Period | Max | Fehler? |
|---|-----|-----|--------|-----|---------|
| 1 | bgb-195 | § 195 BGB (DE) | 3y | 10y | – |
| 2 | bgb-438 | § 438 BGB (DE) | 2y | 5y | – |
| 3 | bgb-634a | § 634a BGB (DE) | 2y | 5y | – |
| 4 | abgb-1489 | § 1489 ABGB (AT) | 3y | 30y | – |
| 5 | or-60 | Art. 60 OR (CH) | 3y | 10y | – |
| 6 | or-127 | Art. 127 OR (CH) | 10y | – | – |

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id`

#### 1.A.4 Feiertagsregeln — `src/lib/legal-deadlines.ts:125-406`

Hardcoded Feiertagslisten für:
- **DE:** 16 Bundesländer, 12+ bundesland-spezifische Feiertage (Stand 2025)
- **AT:** 8 bundesweite Feiertage + Fronleichnam
- **CH:** 26 Kantone, 9 bundesweite + 7+ kantonale Feiertage (Stand 2025)

**Fehlende Felder:** Keine `source_url`, kein `valid_from`/`valid_to`, kein `reviewer_id`. Keine Verknüpfung mit Feiertagsgesetzen.

#### 1.A.5 Server-side Frist-Engine — `server/src/core/legal/frist-engine.ts`

AT-spezifische Feiertagsberechnung, verhandlungsfreie Zeit (§ 222 ZPO), Zustellfiktionen (§ 89a GOG, § 17 ZustG, § 26 ZustG). Hardcoded Feiertagsliste und vhfZ-Zeiträume (15.7.–17.8., 24.12.–6.1.).

**Fehlende Felder:** Keine Source Receipt, keine Reviewer-ID.

---

### 1.B Kostenregeln (Cost Rules)

#### 1.B.1 RVG — `src/lib/rvg.ts:1-69`

**RVG Stufenformel (KostBRÄG 2025)** — 7 Stufen, gültig ab 01.06.2025:
- Grundgebühr: 51,50 € bis 500 €
- Schritte: 41,50 € / 59,50 € / 55 € / 86 € / 99,50 € / 140 € / 175 €
- Verfahrensgebühr: 1,3× (VV 3100)
- Terminsgebühr: 1,2× (VV 3104)
- Einigungsgebühr: 1,0× (VV 1003)
- Auslagenpauschale: 20 € (VV 7002)
- MwSt: 19%

**Fehlende Felder:** `source_url`, `valid_from` (01.06.2025), `valid_to`, `reviewer_id`

#### 1.I.2 StBVV — `src/lib/stbvv.ts:1-138`

**StBVV Anlage 1** — 14 Gegenstandswertstufen, 10 Tätigkeit-Typen mit Faktoren:
- Stufen: 15 € bis 3.500 € Grundgebühr
- Quelle: § 34 StBVV i.V.m. Anlage 1, BGBl. I S. 1020 (2009), zuletzt geändert Art. 3 G v. 22.11.2023 (BGBl. 2023 I Nr. 330)
- MwSt: 19%
- Auslagenpauschale: 20 €

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id`

#### 1.B.3 RATG (AT) — `src/app/dashboard/cost-calculator/page.tsx:55-67`

**Hardcoded RATG-Näherungswerte** auf Basis TP3A — 11 Stufen, explizit als "NÄHERUNGSWERTE" markiert.
- MwSt: 20% (AT)
- Auslagenpauschale: 25 €

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id`. **Warnung:** Nur Näherungswerte, nicht rechtsverbindlich.

#### 1.B.4 RVG im Cost Calculator — `src/app/dashboard/cost-calculator/page.tsx:38-49`

**Duplizierte RVG-Stufen** im Page-Komponent (nicht aus `src/lib/rvg.ts` importiert):
- Gleiche 7 Stufen wie `rvg.ts` aber als lokale Konstante
- VV 3100, VV 3104, VV 1003, VV 7002

**Fehler-Risiko:** Duplikat — wenn `rvg.ts` aktualisiert wird, bleibt die Page-Komponente veraltet.

---

### 1.C Anspruchsgrundlagen & Konzept-Map

#### 1.C.1 `CONCEPT_PARAGRAPH_MAP` — `server/src/core/legal/concept-map.ts:14-374`

**~200 ConceptMappings** für DE + AT:
- **DE:** BGB (32), StGB (28), ZPO (22), HGB (14), AO (18), StPO (10), InsO (6), RVG (4), VwGO (6), BauGB (2), UWG (3), GG (5)
- **AT:** ABGB (32), StGB (24), ZPO (17), StPO (10), UGB (8), BAO (10), AVG (6), GewO (3), ASVG (5), EheG (4), KartG (1), AsylG (1), JN (1), DSG (1), VStG (1)

Jedes Mapping: `terms[]`, `law`, `jurisdiction`, `sections[]`

**Fehlende Felder:** `source_url`, `valid_from`, `valid_to`, `reviewer_id`. Keine Verknüpfung mit Corpus-Receipts.

#### 1.C.2 `CONCEPT_PARAGRAPH_MAP` (eval) — `server/src/eval/at-legal-retrieval/run-v2.ts:86-88`

Mini-Map mit nur 1 Eintrag (`willensübereinstimmung` → `legal/statutes/at/abgb/p-861`).

---

### 1.D Schwellenwerte & Hardcoded Limits in Specialist-Defs

#### 1.D.1 Verjährungsregeln in Specialist-Prompts — `server/src/core/minions/specialist-defs.ts`

**4 separate Verjährungs-Listen** in LLM-Prompts (Zeilen ~939, ~1433, ~2747, ~2758):

**❌ FEHLER 1 — AHG § 6 vs § 1:**
- Zeile 939: `"§ 1 AHG (3 Jahre)"` — FALSCH, sollte § 6 heißen
- Zeile 1433: `"§ 1 AHG (3 Jahre ab Kenntnis)"` — FALSCH, sollte § 6 heißen
- Zeile 2753: `"§ 1 AHG (3 Jahre Amtshaftung)"` — FALSCH, sollte § 6 heißen
- **Korrektur:** § 1 AHG definiert die Haftpflicht, § 6 AHG definiert die Verjährung (3 Jahre ab Kenntnis)

**❌ FEHLER 2 — OR Art. 127/128 vertauscht:**
- Zeile 2744: `"Art 127 OR (5 Jahre), Art 128 OR (10 Jahre)"` — FALSCH! Art. 127 = 10 Jahre, Art. 128 = 5 Jahre
- Zeile 941: `"Art 60 OR (10 Jahre), Art 127 OR (5 Jahre)"` — FALSCH! Art. 127 = 10 Jahre
- Zeile 1435: `"CH: Art 60 OR (10 Jahre), Art 127 OR (5 Jahre)"` — FALSCH! Art. 127 = 10 Jahre
- **Korrektur:** Art. 127 OR = 10 Jahre (allgemeine Verjährung), Art. 128 OR = 5 Jahre (periodische Leistungen)

**❌ FEHLER 3 — § 3 AHG falsch zugeordnet:**
- Zeile 2747: `"§ 3 AHG (3 Jahre)"` im Kontext Arbeitsrecht — § 3 AHG behandelt Beschränkung des Rückersatzanspruchs, nicht Verjährung
- **Korrektur:** Sollte § 6 AHG heißen

**⚠️ FEHLER 4 — § 1489 ABGB Witwerverschweigung:**
- Zeile 2759: `"§ 1489 ABGB: 30 Jahre (allgemeine Verjährung)"` — § 1489 ABGB regelt die 3-jährige Verjährung, nicht 30 Jahre
- Die 30-jährige Verjährung steht in § 1496 ABGB (absolute Verjährung)
- **Korrektur:** 30 Jahre → § 1496 ABGB, 3 Jahre → § 1489 ABGB

**Weitere hardcoded Regeln in specialist-defs.ts:**
- EKHG: 3 Jahre
- PHG: 3 Jahre
- KSchG: 3 Jahre
- § 373 HGB: 5 Jahre
- ProdHaftG: 3 Jahre / 10 Jahre max
- § 852 BGB: 3 Jahre / 10 Jahre max
- Art 814 OR: 5 Jahre (Bauwerk)
- Art 370 OR: Hemmung

---

### 1.E Bestehende Receipt-Infrastruktur

| Schema | Datei | Zweck | Für Rules nutzbar? |
|--------|-------|-------|---------------------|
| `WorkProductReceipt` | `src/lib/work-product-receipts.ts` | AI-Output Verifikation | ❌ Für Outputs, nicht Rules |
| `CorpusReceipt` | `server/src/core/legal/corpus-receipt.ts` | Legal Source Documents (BGB, ABGB) | ⚠️ Für ganze Gesetze, nicht einzelne Rules |
| `OFFICIAL_SOURCE_PATTERNS` | `server/src/core/legal/corpus-receipt.ts` | URL-Validierung für offizielle Quellen | ✅ Wiederverwendbar |
| `isOfficialSource()` | `server/src/core/legal/corpus-receipt.ts` | Prüft ob URL offizielle Quelle ist | ✅ Wiederverwendbar |
| `validateReceipt()` | `server/src/core/legal/corpus-receipt.ts` | Validiert CorpusReceipt-Felder | ⚠️ Erweiterbar |
| `SnapshotStore` | `server/src/core/legal/snapshot-store.ts` | DB-Persistenz für CorpusReceipts | ⚠️ Muster für Rule-Store |

---

## 2. Fehler-Register (Confirmed Bugs)

| # | Ort | Fehler | Korrektur | Severity |
|---|-----|--------|-----------|----------|
| 1 | `specialist-defs.ts:939` | `§ 1 AHG (3 Jahre)` | `§ 6 AHG (3 Jahre ab Kenntnis)` | HIGH — LLM-Prompt gibt falsche §-Referenz |
| 2 | `specialist-defs.ts:1433` | `§ 1 AHG (3 Jahre ab Kenntnis)` | `§ 6 AHG (3 Jahre ab Kenntnis)` | HIGH |
| 3 | `specialist-defs.ts:2753` | `§ 1 AHG (3 Jahre Amtshaftung)` | `§ 6 AHG (3 Jahre Amtshaftung)` | HIGH |
| 4 | `specialist-defs.ts:2747` | `§ 3 AHG (3 Jahre)` | `§ 6 AHG (3 Jahre)` | HIGH |
| 5 | `specialist-defs.ts:2744` | `Art 127 OR (5 Jahre), Art 128 OR (10 Jahre)` | `Art 127 OR (10 Jahre), Art 128 OR (5 Jahre)` | HIGH — Zahlen vertauscht |
| 6 | `specialist-defs.ts:941` | `Art 127 OR (5 Jahre)` | `Art 127 OR (10 Jahre)` | HIGH |
| 7 | `specialist-defs.ts:1435` | `Art 127 OR (5 Jahre)` | `Art 127 OR (10 Jahre)` | HIGH |
| 8 | `specialist-defs.ts:2759` | `§ 1489 ABGB: 30 Jahre` | `§ 1489 Satz 2 ABGB: 30 Jahre (max bei Unkenntnis)` | MEDIUM — falsche §-Referenz für absolute Verjährung |
| 9a | `specialist-defs.ts:2742` | `§ 1491 ABGB (10 Jahre absolut), § 1501 ABGB (30 Jahre)` | `§ 1489 Satz 2 ABGB (30 Jahre max bei Unkenntnis)` | MEDIUM — § 1491 = kürzere Fristen, § 1501 = Amts wegen Bedacht |
| 9b | `cost-calculator/page.tsx:38-49` | RVG-STUFEN dupliziert | Import aus `rvg.ts` verwenden | LOW — Wartbarkeits-Risiko |

---

## 3. Migrations-Plan: `LegalRuleReceipt` Schema

### 3.A Neues Schema (erweitert `CorpusReceipt`)

```typescript
interface LegalRuleReceipt {
  /** Unique key, e.g. "zpo-berufung-de" */
  rule_key: string;
  /** Rule category: deadline | cost | statute_of_limitations | concept_mapping | threshold | holiday */
  rule_type: LegalRuleType;
  /** Human-readable label */
  label: string;
  /** Statutory citation, e.g. "§ 517 ZPO" */
  law_citation: string;
  /** Jurisdiction: DE | AT | CH | EU */
  jurisdiction: Jurisdiction;
  /** Rule-specific payload (duration, fee table, §-numbers, etc.) */
  payload: RulePayload;
  /** ISO date when this rule became legally effective */
  valid_from: string;
  /** ISO date when this rule was superseded (null = currently valid) */
  valid_to: string | null;
  /** Official source URL (gesetze-im-internet.de, RIS, fedlex, EUR-Lex) */
  source_url: string;
  /** SHA-256 hash of the source text at time of review */
  source_hash: string;
  /** ID of the legal expert who reviewed this rule */
  reviewer_id: string;
  /** ISO timestamp of review */
  reviewed_at: string;
  /** Optional: transitional law conditions */
  transitional_conditions?: TransitionalCondition[];
  /** Optional: explicit exceptions */
  exceptions?: RuleException[];
}
```

### 3.B CI-Enforcement

1. **Pre-commit hook:** Lint-Check dass alle Rules in `DEADLINE_RULES`, `FRISTEN_REGISTRY`, `VERJAEHRUNG_PRESETS`, `RVG_STUFEN`, `STBVV_STUFEN` ein `LegalRuleReceipt` haben.
2. **CI Gate:** Test schlägt fehl wenn:
   - `source_url` leer oder nicht offiziell (`isOfficialSource()`)
   - `valid_from` fehlt oder kein valides ISO-Datum
   - `reviewer_id` fehlt
   - `source_hash` fehlt
3. **Test-Suite:** Für jede Rule wird der `law_citation` gegen den Law-Corpus geprüft (§ existiert im Corpus?).

### 3.C Migrations-Strategie

1. **Phase 2:** `LegalRuleReceipt` Schema + CI-Enforcement bauen
2. **Phase 3:** Alle 25 DEADLINE_RULES + 20 FRISTEN_REGISTRY + 6 VERJAEHRUNG_PRESETS mit Receipts anreichern
3. **Phase 3:** Alle 4 Fehler in specialist-defs.ts bereinigen
4. **Phase 4:** RVG_STUFEN + STBVV_STUFEN + RATG mit Receipts anreichern
5. **Phase 4:** CONCEPT_PARAGRAPH_MAP mit Receipts anreichern (200+ Mappings)
6. **Phase 5:** Übergangsrecht & Ausnahmen als `transitional_conditions[]` und `exceptions[]` modellieren
7. **Phase 6:** Tests für alle Regeln + CI Gate

---

## 4. Definition of Done

- [ ] Jede Rule hat `source_url`, `valid_from`, `reviewer_id`, `source_hash`
- [ ] CI verhindert Rules ohne Quelle/Gültigkeitsdatum/Reviewer
- [ ] Alle 9 bestätigten Fehler sind bereinigt
- [ ] Übergangsrecht ist als explizite Bedingungen modelliert
- [ ] Tests für alle Regeln vorhanden
- [ ] Keine hardcoded legal rules ohne Receipt im Codebase
