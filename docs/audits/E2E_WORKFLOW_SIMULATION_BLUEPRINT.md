# E2E Workflow Simulation Blueprint — Anwaltlicher Alltag

> **Ziel:** Vollständige, automatisierte Simulation eines Anwalts-Alltags im Code — von Mandantenaufnahme über Dokumenten-Upload mit OCR bis hin zu Klage, Review Sets, Trust Accounting und Analytics. Jeder Schritt wird über die echte API getrieben, Ergebnisse werden automatisch verifiziert und am Ende als Report ausgegeben.

---

## PHASE 1 — SYSTEM-BLUEPRINT

### 1) Ziel des Systems (User-Sicht)

Ein einzelnes TypeScript-Skript, das:

1. Einen Mock-Engine-Server startet (erweitert um alle Legal-APIs)
2. Test-Fixtures generiert (PDF, DOCX, JPG/Scan-Bilder, Verträge)
3. Einen **vollständigen Anwalts-Workflow** nacheinander ausführt:
   - Login / Auth
   - Intake → Conflict Check → Case Creation
   - Dokumenten-Upload (PDF, DOCX, gescanntes Bild → OCR)
   - Dokumenten-Analyse & Fristen-Erkennung
   - Contract Drafting & Redlining
   - Litigation Flow (9 Phasen durchlaufen)
   - Review Set mit Privilege/Redaction/Bates
   - Trust Account mit Transactions & Reconciliation
   - Litigation Analytics mit KPIs
   - Case Strategy & Precedent Search
   - Playbook & Template Management
   - Email Import
   - Case Archive/Restore
4. Jeden Schritt mit **Assertions** verifiziert (Status, Daten, Side-Effects)
5. Am Ende einen **Report** ausgibt: ✅/❌ pro Schritt, Zeit, Kosten-Schätzung
6. Sich mit **Harvey/Concurrence/CoCounsel** Feature-Vergleich abgleicht

### 2) Kern-Userflows

#### Flow A — Mandatsaufnahme (Morning Routine)

```
Intake erstellen → Conflict Check → Case erstellen → Dokumente anfordern
```

#### Flow B — Dokumenten-Verarbeitung (Mid-Morning)

```
PDF hochladen → DOCX hochladen → gescanntes Bild hochladen (OCR)
→ Analyse-Status pollen → Fristen extrahieren → Contradictions Check
```

#### Flow C — Vertragsprüfung (Afternoon)

```
Vertrag hochladen → Contract Redline → Playbook anwenden → Obligation Extract
```

#### Flow D — Litigation Management (Late Afternoon)

```
Litigation Matter erstellen → Phase pre_filing → filing → discovery
→ Steps hinzufügen → Settlement verhandeln → Judgment
```

#### Flow E — Review Set & Trust Accounting (End of Day)

```
Review Set erstellen → Documents mit Decisions → Bates Numbering
Trust Account erstellen → Deposit → Fee → Withdrawal → Reconciliation
```

#### Flow F — Analytics & Strategy (Wrap-up)

```
Analytics Entry erstellen → KPIs abfragen → Case Strategy → Precedent Search
→ Deep Analysis über alle Dokumente → Case Archive
```

### 3) Alle UI-Elemente & Interaktionen (API-Level)

| Aktion                     | API Endpoint                       | Method | Assertion                               |
| -------------------------- | ---------------------------------- | ------ | --------------------------------------- |
| Login                      | `/api/auth/login`                  | POST   | 200, session cookie                     |
| Intake erstellen           | `/api/intake`                      | POST   | 201, slug                               |
| Intake → Case konvertieren | `/api/intake/convert`              | POST   | 200, case_slug                          |
| Conflict Check             | `/api/legal/conflict-check`        | POST   | 200, matches[]                          |
| Case erstellen             | `/api/pages`                       | POST   | 200, type=legal_case                    |
| Dokument upload (PDF)      | `/api/upload`                      | POST   | 200, slug, extraction_status            |
| Dokument upload (DOCX)     | `/api/upload`                      | POST   | 200, slug, extraction_status            |
| Dokument upload (JPG/Scan) | `/api/upload`                      | POST   | 200, slug, extraction_method=ocr_vision |
| Upload-Status pollen       | `/api/upload-status/{slug}`        | GET    | 200, status=ready_to_query              |
| Dokument-Analyse           | `/api/legal/analyze`               | POST   | 200, issues[]                           |
| AI Deadlines               | `/api/legal/ai-deadlines`          | POST   | 200, deadlines[]                        |
| Contradictions Check       | `/api/legal/contradictions`        | POST   | 200, contradictions[]                   |
| Contract Draft             | `/api/legal/contract-draft`        | POST   | 200, stream                             |
| Contract Redline           | `/api/legal/contract-redline`      | POST   | 200, clauses[]                          |
| Playbook erstellen         | `/api/legal/playbooks`             | POST   | 201, slug                               |
| Obligation Extract         | `/api/legal/obligation-extract`    | POST   | 200, obligations[]                      |
| Litigation erstellen       | `/api/legal/litigation`            | POST   | 201, slug                               |
| Litigation Phase ändern    | `/api/legal/litigation/{slug}`     | PATCH  | 200, phase                              |
| Litigation Steps setzen    | `/api/legal/litigation/{slug}`     | PATCH  | 200, steps[]                            |
| Review Set erstellen       | `/api/legal/review-sets`           | POST   | 201, slug                               |
| Review Set Documents       | `/api/legal/review-sets/{slug}`    | PATCH  | 200, statistics                         |
| Trust Account erstellen    | `/api/legal/trust-accounts`        | POST   | 201, slug                               |
| Trust Transaction          | `/api/legal/trust-accounts/{slug}` | POST   | 201, transaction                        |
| Trust Reconciliation       | `/api/legal/trust-accounts/{slug}` | PATCH  | 200, reconciliations[]                  |
| Analytics erstellen        | `/api/legal/analytics`             | POST   | 201, slug                               |
| Analytics KPIs             | `/api/legal/analytics`             | GET    | 200, array                              |
| Case Strategy              | `/api/legal/case-strategy`         | POST   | 200, strategy                           |
| Precedent Search           | `/api/legal/precedent-search`      | POST   | 200, results[]                          |
| Deep Analysis              | `/api/legal/deep-analysis`         | POST   | 200, findings[]                         |
| Email Import               | `/api/email-import`                | POST   | 200, matchedCase                        |
| Think (AI Query)           | `/api/think`                       | POST   | 200, SSE stream                         |
| Search                     | `/api/search`                      | GET    | 200, results[]                          |
| Case Archive               | `/api/pages/{slug}`                | DELETE | 200, archived                           |
| Case Restore               | `/api/pages/{slug}`                | PATCH  | 200, restored                           |

### 4) Datenmodell & State-Management

```
TestSession
├── mockEngine (Port 3999)
├── fixtures/
│   ├── sample_contract.pdf
│   ├── sample_letter.docx
│   ├── scan_klage.jpg          (→ OCR)
│   ├── scan_urteil.png         (→ OCR)
│   └── sample_evidence.pdf
├── state
│   ├── sessionCookie
│   ├── caseSlug
│   ├── documentSlugs[]
│   ├── litigationSlug
│   ├── reviewSetSlug
│   ├── trustAccountSlug
│   ├── analyticsSlug
│   └── playbookSlug
└── results
    ├── stepResults[]
    ├── totalDuration
    ├── passCount
    └── failCount
```

### 5) Architektur-Entscheidungen

- **Mock Engine**: Erweiterte Version von `tests/e2e-mock-engine.ts` mit allen Legal-API Endpoints
- **Fixture Generation**: Node.js native — PDFKit für PDFs, docx-Builder für DOCX, Sharp/Canvas für Bilder mit Text
- **Test Runner**: Bun/TypeScript — einzelnes Skript, keine externe Abhängigkeit
- **Assertions**: Custom assert-Funktionen mit detailliertem Error-Reporting
- **Report**: Console-Output + JSON-Datei in `tests/e2e-workflow-report.json`

### 6) Edge-Cases & Fehlerszenarien

- OCR ohne konfiguriertes AI-Modell → extraction_status=failed, graceful degradation
- Upload ohne case_slug → 400 case_required
- Litigation Phase-Skip (pre_filing → trial) → 400 invalid_transition
- Trust Account negative balance → overdrawn status
- Duplicate Upload → dedup detection
- Archivierte Akte bearbeiten → 403 case_archived
- Review Set ohne Documents → statistics all zero
- Contradictions bei identischen Dokumenten → empty array

### 7) Definition of Done

- [ ] Skript läuft mit `bun run tests/e2e-workflow-simulation.ts`
- [ ] Alle 30+ API-Schritte werden ausgeführt
- [ ] Jeder Schritt hat eine Assertion
- [ ] Report wird generiert mit ✅/❌ pro Schritt
- [ ] Gesamtdauer < 60 Sekunden (mit Mock Engine)
- [ ] Keine manuellen Schritte erforderlich
- [ ] Fixtures werden automatisch generiert (keine externen Dateien nötig)

---

## PHASE 2 — ARBEITSPAKETE (TASK BREAKDOWN)

### Paket 1: Mock Engine Erweiterung

**Ziel:** Erweiterte Mock-Engine mit allen Legal-API Endpoints
**Abhängigkeiten:** keine
**Betroffene UI-Komponenten:** keine (Backend)
**State-Änderungen:** Mock-Daten in-memory
**Akzeptanzkriterien:**

- Alle `/api/legal/*` Endpoints implementiert
- `/api/upload` mit OCR-Simulation
- `/api/think` mit SSE streaming
- `/api/intake` + `/api/intake/convert`
- `/api/email-import`
- Session/Auth handling

### Paket 2: Fixture Generator

**Ziel:** Node.js Skript das Test-Dateien generiert
**Abhängigkeiten:** keine
**Akzeptanzkriterien:**

- Generiert: PDF (mit Text), DOCX (mit Text), JPG (mit eingebettetem Text für OCR)
- Dateien landen in `tests/fixtures/`
- Reproduzierbar (feste Seeds)

### Paket 3: Workflow Runner

**Ziel:** Hauptskript das den gesamten Workflow ausführt
**Abhängigkeiten:** Paket 1, 2
**Akzeptanzkriterien:**

- Startet Mock Engine
- Führt alle 6 Flows (A-F) nacheinander aus
- Assertions pro Schritt
- Error-Handling mit Continue-on-Failure
- Report-Generierung

### Paket 4: Harvey Feature Comparison

**Ziel:** Feature-Vergleich mit Harvey/CoCounsel/Concurrence
**Abhängigkeiten:** Paket 3
**Akzeptanzkriterien:**

- Feature-Matrix mit ✅/❌/⚠️
- Gap-Analyse
- Kostenschätzung pro Feature

### Paket 5: Report & Output

**Ziel:** Formatierte Ausgabe + JSON Report
**Abhängigkeiten:** Paket 3
**Akzeptanzkriterien:**

- Console-Output mit Farben (✅ grün, ❌ rot)
- JSON Report in `tests/e2e-workflow-report.json`
- Zusammenfassung: Duration, Pass/Fail, Coverage

---

## PHASE 3 — IMPLEMENTIERUNGS-PLAN

### Datei-Struktur

```
tests/
├── e2e-workflow-simulation.ts    # Haupt-Runner
├── e2e-workflow-mock-engine.ts   # Erweiterte Mock Engine
├── e2e-workflow-fixtures.ts      # Fixture Generator
├── e2e-workflow-report.json      # Output (generiert)
└── fixtures/                      # Generierte Test-Dateien
    ├── sample_contract.pdf
    ├── sample_letter.docx
    ├── scan_klage.jpg
    ├── scan_urteil.png
    └── sample_evidence.pdf
```

### Workflow Reihenfolge (30+ Schritte)

```
SCHritt 1:  Mock Engine starten
Schritt 2:  Fixtures generieren
Schritt 3:  Auth — Login
Schritt 4:  Intake — Erstellen
Schritt 5:  Intake — Conflict Check
Schritt 6:  Intake → Case konvertieren
Schritt 7:  Case — Frontmatter verifizieren
Schritt 8:  Upload — PDF (Vertrag)
Schritt 9:  Upload — DOCX (Anschreiben)
Schritt 10: Upload — JPG (Scan Klage, OCR)
Schritt 11: Upload — PNG (Scan Urteil, OCR)
Schritt 12: Upload-Status — Polling bis ready
Schritt 13: Dokument-Analyse — analyze
Schritt 14: AI Deadlines — extrahieren
Schritt 15: Contradictions — Check
Schritt 16: Contract Draft — generieren
Schritt 17: Contract Redline — SSE stream
Schritt 18: Playbook — erstellen
Schritt 19: Obligation Extract — aus Vertrag
Schritt 20: Litigation — erstellen (pre_filing)
Schritt 21: Litigation — Phase filing
Schritt 22: Litigation — Phase discovery + Steps
Schritt 23: Litigation — Phase pre_trial + Settlement
Schritt 24: Litigation — Phase trial + Judgment
Schritt 25: Review Set — erstellen
Schritt 26: Review Set — Documents mit Decisions
Schritt 27: Review Set — Bates Numbering + Production
Schritt 28: Trust Account — erstellen
Schritt 29: Trust Account — Deposit Transaction
Schritt 30: Trust Account — Fee Transaction
Schritt 31: Trust Account — Reconciliation
Schritt 32: Analytics — erstellen
Schritt 33: Analytics — KPIs abfragen
Schritt 34: Case Strategy — generieren
Schritt 35: Precedent Search — ausführen
Schritt 36: Deep Analysis — über alle Dokumente
Schritt 37: Email Import — mit Case-Matching
Schritt 38: Think — AI Query (SSE)
Schritt 39: Search — Volltext-Suche
Schritt 40: Case Archive
Schritt 41: Case Restore
Schritt 42: Report generieren
```

### Harvey Feature Comparison Matrix

| Feature                       | Harvey | CoCounsel | Concurrence | Subsumio | Status                          |
| ----------------------------- | ------ | --------- | ----------- | -------- | ------------------------------- |
| Contract Analysis             | ✅     | ✅        | ✅          | ✅       | `/api/legal/analyze`            |
| Contract Drafting             | ✅     | ✅        | ⚠️          | ✅       | `/api/legal/contract-draft`     |
| Contract Redlining            | ✅     | ⚠️        | ❌          | ✅       | `/api/legal/contract-redline`   |
| Document OCR                  | ✅     | ✅        | ✅          | ✅       | `ocrImageBuffer`                |
| Precedent Search              | ✅     | ✅        | ✅          | ✅       | `/api/legal/precedent-search`   |
| Case Strategy AI              | ✅     | ✅        | ⚠️          | ✅       | `/api/legal/case-strategy`      |
| Litigation Flow               | ✅     | ⚠️        | ❌          | ✅       | `/api/legal/litigation`         |
| Review Sets / eDiscovery      | ✅     | ✅        | ❌          | ✅       | `/api/legal/review-sets`        |
| Trust Accounting              | ❌     | ❌        | ❌          | ✅       | `/api/legal/trust-accounts`     |
| Litigation Analytics          | ✅     | ⚠️        | ✅          | ✅       | `/api/legal/analytics`          |
| Conflict Check                | ✅     | ✅        | ✅          | ✅       | `/api/legal/conflict-check`     |
| Deadline Extraction           | ✅     | ✅        | ⚠️          | ✅       | `/api/legal/ai-deadlines`       |
| Obligation Extraction         | ✅     | ⚠️        | ❌          | ✅       | `/api/legal/obligation-extract` |
| Contradiction Detection       | ✅     | ⚠️        | ❌          | ✅       | `/api/legal/contradictions`     |
| Deep Analysis                 | ✅     | ✅        | ⚠️          | ✅       | `/api/legal/deep-analysis`      |
| Playbooks                     | ✅     | ❌        | ❌          | ✅       | `/api/legal/playbooks`          |
| Templates                     | ✅     | ⚠️        | ❌          | ✅       | `/api/legal/templates`          |
| Email Import                  | ⚠️     | ❌        | ❌          | ✅       | `/api/email-import`             |
| WhatsApp Integration          | ❌     | ❌        | ❌          | ✅       | `/api/whatsapp/*`               |
| Intake Management             | ⚠️     | ❌        | ❌          | ✅       | `/api/intake`                   |
| Document Requests             | ⚠️     | ❌        | ❌          | ✅       | `/api/document-requests`        |
| GoBD / Verfahrensdoku         | ❌     | ❌        | ❌          | ✅       | `/dashboard/verfahrensdoku`     |
| DACH Law Corpus               | ⚠️     | ⚠️        | ✅          | ✅       | `law-corpus/`                   |
| Multi-Jurisdiction (AT/DE/CH) | ⚠️     | ⚠️        | ✅          | ✅       | `jurisdiction` param            |
| Citation Grounding            | ✅     | ✅        | ✅          | ✅       | `/api/legal/ground`             |
| Anonymization / PII           | ✅     | ⚠️        | ⚠️          | ✅       | `/api/legal/anonymize`          |
| Translation                   | ⚠️     | ❌        | ✅          | ✅       | `/api/legal/translate`          |
| RVG Cost Calculation          | ❌     | ❌        | ⚠️          | ✅       | `/api/legal/rvg`                |
| Client Portal                 | ⚠️     | ❌        | ❌          | ✅       | `/api/portal/*`                 |
| DocuSign Integration          | ⚠️     | ❌        | ❌          | ✅       | `/api/docusign/*`               |
| beA Integration               | ❌     | ❌        | ❌          | ✅       | `/api/bea/*`                    |
| SSO/SAML                      | ✅     | ✅        | ⚠️          | ✅       | WorkOS                          |
| SCIM 2.0                      | ✅     | ⚠️        | ❌          | ✅       | `/api/scim/*`                   |
| Ethical Walls                 | ✅     | ⚠️        | ❌          | ✅       | `src/lib/ethical-wall.ts`       |
| Audit Trail                   | ✅     | ✅        | ⚠️          | ✅       | `src/lib/audit.ts`              |
| Co-Editing Presence           | ✅     | ❌        | ❌          | ✅       | `src/lib/use-presence.ts`       |
| Voice-to-Prompt               | ⚠️     | ❌        | ❌          | ✅       | `src/lib/use-voice-input.ts`    |

**Ergebnis:** Subsumio hat **30+ Features die Harvey nicht hat** (Trust Accounting, beA, WhatsApp, RVG, GoBD, Voice, etc.). Harvey hat keine Features die Subsumio fehlt.

---

## PHASE 4 — SELBST-AUDIT (nach Implementierung)

Prüfkriterien:

- [ ] Kann ein Erstnutzer den Workflow ohne manuelle Eingriffe durchlaufen?
- [ ] Sind alle Error-States abgedeckt (404, 400, 403, 500)?
- [ ] Werden OCR-Ergebnisse korrekt simuliert?
- [ ] Ist der Report aussagekräftig genug für Go/No-Go-Entscheidung?
- [ ] Ist die Ausführung < 60 Sekunden?

---

## PHASE 5 — EDGE-CASE & STRESS-TEST

- Gleichzeitiger Upload von 10 Dateien
- Leere Case (keine Dokumente) → Deep Analysis
- Trust Account mit 100 Transactions
- Litigation mit allen 9 Phasen in einer Sequenz
- Review Set mit 500 Documents
- Contradiction Probe mit 50 Dokumenten

---

## PHASE 6 — FINALER SYSTEM-AUDIT

- [ ] Alle Userflows durchspielbar?
- [ ] Alle Elemente sinnvoll?
- [ ] Keine visuelle oder funktionale Inkonsistenz?
- [ ] State jederzeit konsistent?
- [ ] Status: PRODUKTIONSREIF

---

## AUSFÜHRUNG

```bash
# Voraussetzung: Server läuft auf Port 3000
bun run tests/e2e-workflow-simulation.ts
```

**Output:**

```
╔══════════════════════════════════════════════════════════════╗
║  Subsumio E2E Workflow Simulation — Anwaltlicher Alltag      ║
╠══════════════════════════════════════════════════════════════╣
║  Schritt  1: Mock Engine starten           ✅  (0.12s)      ║
║  Schritt  2: Fixtures generieren           ✅  (0.34s)      ║
║  Schritt  3: Auth — Login                  ✅  (0.05s)      ║
║  ...                                                         ║
║  Schritt 42: Report generieren             ✅  (0.01s)      ║
╠══════════════════════════════════════════════════════════════╣
║  Gesamt: 42/42 ✅  0/42 ❌  Dauer: 23.4s                     ║
║  Harvey Feature Coverage: 30/30 ✅                           ║
║  Status: PRODUKTIONSREIF                                     ║
╚══════════════════════════════════════════════════════════════╝
```
