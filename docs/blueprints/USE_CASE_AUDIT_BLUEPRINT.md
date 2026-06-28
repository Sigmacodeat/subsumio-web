# Subsumio Use-Case-Audit — Kanzlei-Alltag OS Gewachsen?

**Stand:** 2026-06-28  
**Ziel:** Systematische Prüfung, ob die gebaute Plattform den echten Kanzlei-Alltag (Solo bis 5-Personen-Kanzlei, DACH-Fokus) vollständig abdeckt — und wo Lücken bleiben.

---

## 1. Ziel des Audits

### 1.1 Fragestellung

- **Abdeckung:** Deckt Subsumio alle täglichen Workflows einer DACH-Kanzlei ab?
- **Tiefe:** Sind die implementierten Features productionsreif oder nur Mocks/Platzhalter?
- **Fehlende Use-Cases:** Welche Kanzlei-Alltagsszenarien sind NICHT abgedeckt?
- **Reife:** Wo sind Features nur UI-Shell ohne funktionierende Backend-Logik?
- **DACH-Spezifika:** Sind DE/AT/CH Besonderheiten (RVG, ABGB, OR, beA, GoBD) wirklich integriert?

### 1.2 Audit-Methodik

- **Code-Verification:** Jedes Feature wird gegen den tatsächlichen Quellcode geprüft (nicht gegen Doku-Behauptungen)
- **Userflow-Walkthrough:** Jeder Use-Case wird als End-to-End Userflow durchgespielt (Login → Aktion → Ergebnis)
- **Edge-Case-Test:** Leere Daten, falsche Eingaben, extreme Inhalte, ungewöhnliche Reihenfolgen
- **DACH-Compliance-Check:** Rechtsspezifische Anforderungen (Fristen, GoBD, RVG, beA) auf echte Implementierung geprüft
- **Cross-Feature-Integration:** Features, die zusammengehören, auf tatsächliche Verknüpfung geprüft

### 1.3 Bewertungsskala

| Score               | Bedeutung            | Kriterium                                                          |
| ------------------- | -------------------- | ------------------------------------------------------------------ |
| ✅ PRODUKTIONSREIF  | Voll funktionsfähig  | CRUD komplett, Error-States, Edge-Cases, Backend-Logik             |
| ⚠️ TEILWEISE        | UI vorhanden, Lücken | Funktioniert für Happy Path, aber fehlende Edge-Cases oder Backend |
| 🔧 MOCK/PLATZHALTER | Nur UI-Shell         | Keine echte Backend-Logik, hartcodierte Daten, TODO-Kommentare     |
| ❌ FEHLEND          | Nicht implementiert  | Keine Route, kein Code, keine UI                                   |

---

## 2. Kanzlei-Alltag Use-Cases — Vollständige Matrix

### 2.1 Morgens (08:00–10:00) — Ankommen & Überblick

| #   | Use-Case            | Beschreibung                                       | Route/Code                                                         | Score | Audit-Kriterien                                                            |
| --- | ------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------- |
| M1  | Dashboard-Übersicht | Akten, Fristen, Tasks, Nachrichten auf einen Blick | `/dashboard`                                                       | ✅    | Ladezeit <2s, alle Widgets zeigen echte Daten, Empty-State vorhanden       |
| M2  | Fristen-Check       | Alle Fristen der nächsten 3/7/14 Tage sehen        | `/dashboard/deadlines`                                             | ✅    | Ampel-System, Sortierung nach Dringlichkeit, Filter nach Akte              |
| M3  | Fristen-Erinnerung  | Automatische Email vor Fristablauf                 | Cron-Job API                                                       | ⚠️    | Cron konfiguriert? Email-Versand getestet? `reminder_sent_at` gespeichert? |
| M4  | Nachrichten lesen   | beA + Email + WhatsApp an einem Ort                | `/dashboard/bea`, `/dashboard/email-import`, `/dashboard/whatsapp` | ⚠️    | Sind beA-Nachrichten echt abrufbar oder nur Import? WhatsApp-Webhook live? |
| M5  | Kalender-Export     | Fristen/Termine in Outlook/Google                  | `/dashboard/calendar-export`                                       | ⚠️    | ICS-Generierung funktioniert? Einweg oder bidirektional?                   |

### 2.2 Vormittags (10:00–12:00) — Aktenarbeit & Korrespondenz

| #   | Use-Case              | Beschreibung                          | Route/Code                                            | Score | Audit-Kriterien                                                               |
| --- | --------------------- | ------------------------------------- | ----------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| V1  | Neue Akte anlegen     | Mandant + Akte + Gegenpartei erfassen | `/dashboard/cases`                                    | ✅    | Pflichtfelder, Validierung, Kontakt-Verknüpfung, Aktenzeichen-Generierung     |
| V2  | Kollisionsprüfung     | Vor Mandatsannahme prüfen             | `/dashboard/kollisionspruefung`                       | ✅    | Gegenstellen-Abgleich, historische Mandate, automatischer Check bei Neuanlage |
| V3  | Dokumente hochladen   | PDF/DOC/Scan in Akte ablegen          | `/dashboard/upload`, `/dashboard/vault`               | ✅    | Drag&Drop, OCR, Versionierung, Größenlimit, Download                          |
| V4  | Dokument analysieren  | KI-Analyse: Risiken, Zusammenfassung  | `/dashboard/analyze`                                  | ✅    | Fundstellen-Zitate, Risiko-Score, Export                                      |
| V5  | Schriftsatz entwerfen | KI-Drafting mit Brain-Kontext         | `/dashboard/drafting`                                 | ✅    | Model-Auswahl, Brain-Kontext, Word-Export, Streaming                          |
| V6  | Vertrag reviewen      | Klauselmatrix, Redlining              | `/dashboard/contracts`, `contract-redline-viewer.tsx` | ✅    | Playbook-basiert, Counterparty-Vergleich, SSE-Streaming                       |
| V7  | Email senden          | Aus Akte heraus, mit Anhang           | `/dashboard/email-import`                             | ⚠️    | Senden möglich oder nur Import? RAG auf Email-Inhalt?                         |
| V8  | beA-Nachricht senden  | Anwaltspostfach Nachricht versenden   | `/dashboard/bea`                                      | ⚠️    | Echter Versand oder nur Anzeige? Authentifizierung?                           |

### 2.3 Mittags (12:00–13:00) — Zeiterfassung & Auslagen

| #   | Use-Case             | Beschreibung                        | Route/Code            | Score | Audit-Kriterien                                                      |
| --- | -------------------- | ----------------------------------- | --------------------- | ----- | -------------------------------------------------------------------- |
| Z1  | Zeiten erfassen      | Manuell oder per Timer              | Cases → Zeiten-Tab    | ⚠️    | Timer implementiert? Stundensatz pro Akte? Beschreibung Pflichtfeld? |
| Z2  | Zeiten per WhatsApp  | "10min Akte Müller" buchen          | `/dashboard/whatsapp` | ✅    | Parsing, Akten-Zuordnung, Bestätigungspflicht                        |
| Z3  | Auslagen erfassen    | Reisekosten, Kopien, Gerichtskosten | Cases → Auslagen-Tab  | ⚠️    | Auslagen-Tab vorhanden? Beleg-Upload?                                |
| Z4  | Zeiterfassung-Report | Zeiten pro Akte/Tag/Woche           | `/dashboard/reports`  | ⚠️    | Filter nach Zeitraum, Export PDF/CSV?                                |

### 2.4 Nachmittags (13:00–16:00) — Recherche & Workflows

| #   | Use-Case                | Beschreibung                         | Route/Code                                                             | Score | Audit-Kriterien                                                                |
| --- | ----------------------- | ------------------------------------ | ---------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| N1  | Rechtsrecherche         | Gesetze, Urteile, Kommentare         | `/dashboard/research`, `/dashboard/rechtsprechung`, `/dashboard/norms` | ✅    | RIS-Connector, Perplexity, Fundstellen, law-corpus/                            |
| N2  | Präzedenzfälle suchen   | Ähnliche Fälle finden                | `/dashboard/precedent-search`                                          | ✅    | Jurisdiction-Filter, Internal+External, Brain-Suche                            |
| N3  | Workflow starten        | Due Diligence, Vertrags-Review, etc. | `/dashboard/workflows`                                                 | ⚠️    | Templates vorhanden, aber: werden Steps wirklich ausgeführt oder nur angelegt? |
| N4  | Agent ausführen         | Custom Agent mit Steps               | `/dashboard/agents`                                                    | ✅    | Supervisor/Specialist/Critic, Run Dialog, Streaming                            |
| N5  | Deep Analysis           | Cross-Dokument-Analyse               | `/dashboard/deep-analysis`                                             | ✅    | Narrative Reports, Pattern-Erkennung                                           |
| N6  | Playbook anwenden       | Regeln & Abweichungen                | `/dashboard/playbooks`                                                 | ✅    | CRUD, Rules, Deviations, Auto-Playbook API                                     |
| N7  | Clause Library          | Klauseln suchen/einfügen             | `/dashboard/clause-library`                                            | ✅    | CRUD, Search, Categories, Quick-Create                                         |
| N8  | Tabellarische Übersicht | Review-Tables                        | `/dashboard/tabular-review`                                            | ✅    | Zellen-Level-Zitate, Multi-Color-Flagging                                      |

### 2.5 Spätnachmittags (16:00–18:00) — Abrechnung & Compliance

| #   | Use-Case            | Beschreibung                 | Route/Code                   | Score | Audit-Kriterien                                                   |
| --- | ------------------- | ---------------------------- | ---------------------------- | ----- | ----------------------------------------------------------------- |
| A1  | Rechnung erstellen  | Aus Zeiterfassung + Auslagen | `/dashboard/invoicing`       | ⚠️    | Auto-Generierung aus Zeiten? PDF-Vorlage? MwSt 19%?               |
| A2  | RVG-Berechnung      | Streitwert → Gebühren        | `src/lib/rvg.ts`             | ⚠️    | Tabelle vollständig? VV/Gebühren korrekt? AT-RVG?                 |
| A3  | DATEV-Export        | Buchungsdaten exportieren    | `/dashboard/datev-export`    | ⚠️    | Format DATEV-konform? CSV/Excel? Buchungsjahr?                    |
| A4  | Kostenrechner       | Prozesskosten für Mandant    | `/dashboard/cost-calculator` | ⚠️    | Interaktiv? Streitwert-Eingabe? Ausgabe?                          |
| A5  | Mahnwesen           | Überfällige Rechnungen       | Invoicing → Mahnungen        | 🔧    | Implementiert oder nur dokumentiert? Eskalationsstufen?           |
| A6  | Controlling         | Kanzlei-Kennzahlen           | `/dashboard/controlling`     | ⚠️    | Umsatz, Deckungsbeitrag, Auslastung — echte Berechnung oder Mock? |
| A7  | GoBD-Verfahrensdoku | Audit-Trail prüfen           | `/dashboard/verfahrensdoku`  | ✅    | Jede Aktion protokolliert, unveränderbar, Export                  |
| A8  | Compliance-Check    | DSGVO, GwG, GoBD             | `/dashboard/compliance`      | ✅    | Checkliste, Priorisierung, Bericht                                |

### 2.6 Abends (18:00+) — Abschluss & Mobil

| #   | Use-Case         | Beschreibung                    | Route/Code                             | Score | Audit-Kriterien                                     |
| --- | ---------------- | ------------------------------- | -------------------------------------- | ----- | --------------------------------------------------- |
| E1  | Mobile App       | Zeiten, Fristen, Chat unterwegs | `/dashboard/mobile`, Capacitor         | ⚠️    | Build lauffähig? Push-Notifications? Offline-Modus? |
| E2  | Word-Add-In      | Schriftsätze in Word mit Brain  | `/dashboard/word-addin`, `word-addin/` | ✅    | Taskpane, Brain-Anbindung, Fundstellen-Einfügung    |
| E3  | Outlook-Add-In   | Emails importieren              | `outlook-addin/`                       | ✅    | Taskpane, Email-Import, Akten-Zuordnung             |
| E4  | Daten-Export     | Backup / DSGVO-Auskunft         | `/dashboard/data-export`               | ✅    | JSON, CSV, PDF — vollständig?                       |
| E5  | Audit-Log prüfen | Wer hat wann was gemacht        | `/dashboard/audit`                     | ✅    | Lückenlose Protokollierung, Filter, Export          |

---

## 3. Cross-Feature Integration Audit

### 3.1 Datenfluss-Verknüpfungen

| #   | Integration              | Erwartung                            | Status | Audit-Kriterium                                |
| --- | ------------------------ | ------------------------------------ | ------ | ---------------------------------------------- |
| I1  | Akte → Fristen           | Fristen werden in Akte angezeigt     | ✅     | Cases-Detail → Fristen-Tab zeigt Akten-Fristen |
| I2  | Akte → Zeiten            | Zeiten werden in Akte gebucht        | ✅     | Cases-Detail → Zeiten-Tab, Timer               |
| I3  | Akte → Dokumente         | Dokumente in Akte abgelegt           | ✅     | Cases-Detail → Dokumente-Tab, Upload           |
| I4  | Zeiten → Rechnung        | Zeiten werden zu Rechnungspositionen | ⚠️     | Auto-Generierung? Manuell? Filter nach Akte?   |
| I5  | Fristen → Kalender       | Fristen als ICS-Export               | ⚠️     | ICS-Generierung? Einweg?                       |
| I6  | Kollisionsprüfung → Akte | Check bei Neuanlage                  | ⚠️     | Automatischer Check oder nur manuell?          |
| I7  | Brain → Chat             | Brain-Kontext im Chat                | ✅     | RAG, Fundstellen, Semantic Search              |
| I8  | Brain → Drafting         | Brain-Kontext beim Entwerfen         | ✅     | Model-Auswahl, Kontext-Injection               |
| I9  | WhatsApp → Zeiten        | WhatsApp-Nachricht → Zeiteintrag     | ✅     | Parsing, Bestätigungspflicht                   |
| I10 | beA → Akte               | beA-Nachricht Akte zuordnen          | ⚠️     | Manuell? Auto-Matching?                        |
| I11 | Workflow → Approvals     | Workflow-Steps brauchen Approval     | ✅     | Approval-Queue, Action-Types                   |
| I12 | Rechnung → DATEV         | Rechnung → DATEV-Export              | ⚠️     | Direkt-Export oder Zwischenschritt?            |
| I13 | Compliance → Audit       | Compliance-Check im Audit-Log        | ✅     | Jede Aktion protokolliert                      |
| I14 | Contacts → Cases         | Kontakt → Aktenverknüpfung           | ✅     | Kontakt-Detail → verknüpfte Akten              |
| I15 | Opponents → Kollision    | Gegenstellen in Kollisionsprüfung    | ✅     | Automatischer Abgleich                         |

### 3.2 Fehlende Integrationen

| #   | Fehlende Integration | Impact                                 | Priorität |
| --- | -------------------- | -------------------------------------- | --------- |
| F1  | Zeiten → Controlling | Controlling zeigt keine echten Stunden | HOCH      |
| F2  | Rechnung → Mahnwesen | Kein automatischer Mahnlauf            | HOCH      |
| F3  | Fristen → WhatsApp   | Keine Frist-Erinnerung per WhatsApp    | MITTEL    |
| F4  | Akte → Client Portal | Mandant sieht Akten-Status             | MITTEL    |
| F5  | Email → Akte (Auto)  | Keine automatische Akten-Zuordnung     | MITTEL    |

---

## 4. DACH-Spezifika Audit

### 4.1 Deutschland (DE)

| #   | Feature                | Erwartung                        | Code-Location               | Score | Kriterien                                         |
| --- | ---------------------- | -------------------------------- | --------------------------- | ----- | ------------------------------------------------- |
| D1  | RVG-Gebührenberechnung | §13 RVG, VV, Verfahrensgebühr    | `src/lib/rvg.ts`            | ⚠️    | Tabelle vollständig? Alle Streitwertstufen?       |
| D2  | beA-Integration        | Anwaltspostfach senden/empfangen | `src/lib/bea.ts`            | ⚠️    | Echter Versand? Auth? Zertifikat?                 |
| D3  | GoBD-Verfahrensdoku    | Revisionssichere Protokollierung | `/dashboard/verfahrensdoku` | ✅    | Unveränderbar, vollständig, exportierbar          |
| D4  | DATEV-Export           | Buchungsdaten kompatibel         | `/dashboard/datev-export`   | ⚠️    | Format prüfungsfest? Buchungsjahr?                |
| D5  | GwG-Compliance         | Geldwäsche-Prävention            | `/dashboard/compliance`     | ⚠️    | Identifikationspflicht? Verdachtsmeldung?         |
| D6  | DSGVO-AVV              | Art. 28 Vertrag                  | Security docs               | ✅    | Vorlage vorhanden, Download                       |
| D7  | Deutsches Recht        | BGB, StGB, HGB, etc.             | `law-corpus/de/`            | ✅    | 19+ Statute, KI-Suche                             |
| D8  | Fristen nach ZPO       | Notfristen, Einspruchsfristen    | `src/lib/fristen.ts`        | ⚠️    | Fristen-Tabelle korrekt? Automatische Berechnung? |

### 4.2 Österreich (AT)

| #   | Feature                | Erwartung                       | Code-Location                  | Score | Kriterien                           |
| --- | ---------------------- | ------------------------------- | ------------------------------ | ----- | ----------------------------------- |
| A1  | ABGB                   | Österreichisches BGB            | `law-corpus/at/abgb.md`        | ✅    | Vollständig? KI-Suche?              |
| A2  | AT-Rechtsprechung      | RIS-Connector                   | `src/lib/knowledge-sources.ts` | ✅    | Caching, Rate-Limiting              |
| A3  | RATG (Anwaltsgebühren) | Österreichische Gebühren        | `src/lib/rvg.ts`               | 🔧    | RATG implementiert oder nur DE-RVG? |
| A4  | beA-Äquivalent         | Elektronischer Rechtsverkehr AT | —                              | ❌    | BVU/ERV-Integration?                |
| A5  | AT-Compliance          | DSG, GmbHG, AktG                | `law-corpus/at/`               | ✅    | 21+ Statute                         |

### 4.3 Schweiz (CH)

| #   | Feature             | Erwartung                       | Code-Location          | Score | Kriterien           |
| --- | ------------------- | ------------------------------- | ---------------------- | ----- | ------------------- |
| C1  | OR                  | Obligationenrecht               | `law-corpus/ch/or.md`  | ✅    | Vollständig?        |
| C2  | DSG                 | Schweizer Datenschutz           | `law-corpus/ch/dsg.md` | ✅    | Vorhanden           |
| C3  | Anwaltsgebühren CH  | Schweizer Gebühren              | —                      | ❌    | Nicht implementiert |
| C4  | BVG/BRG-Integration | Elektronischer Rechtsverkehr CH | —                      | ❌    | Nicht implementiert |

---

## 5. Kanzlei-Persona Walkthroughs

### 5.1 Persona: Solo-Anwalt (Einzelkanzlei)

**Profil:** 1 Anwalt, ~80 Akten, keine Sekretärin, macht alles selbst

| #   | Szenario                             | Erwarteter Flow                                      | Status | Lücken                                                             |
| --- | ------------------------------------ | ---------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| S1  | Neuer Mandant anrufen → Akte anlegen | Telefon → Kollisionsprüfung → Akte → Kontakt         | ⚠️     | Kollisionsprüfung ist manuell, nicht im Telefon-Flow               |
| S2  | Frist im Gerichtsschreiben erkennen  | Dokument-Upload → KI scannt → Frist wird angelegt    | ⚠️     | AI-Fristenerkennung dokumentiert, aber: automatische Frist-Anlage? |
| S3  | Schriftsatz entwerfen                | Brain-Kontext → Drafting → Word-Export → beA-Versand | ⚠️     | Drafting + Word-Export ✅, aber beA-Versand aus Drafting?          |
| S4  | Rechnung am Monatsende               | Zeiten sammeln → RVG → Rechnung → DATEV              | ⚠️     | Zeiten → Rechnung Auto-Generierung? RVG korrekt?                   |
| S5  | WhatsApp vom Mandanten               | Nachricht → Akte zuordnen → Antwort → Zeit buchen    | ✅     | Vollständiger Flow mit Bestätigungspflicht                         |
| S6  | Mobile: Fristen checken unterwegs    | Mobile-App → Fristen → Detail                        | ⚠️     | Mobile-App vorhanden, aber Push-Notifications?                     |

### 5.2 Persona: 3-Personen-Kanzlei (2 Anwälte + 1 Sekretärin)

**Profil:** 2 Anwälte mit verschiedenen Schwerpunkten, 1 Sekretärin für Aktenführung

| #   | Szenario                                | Erwarteter Flow                 | Status | Lücken                                              |
| --- | --------------------------------------- | ------------------------------- | ------ | --------------------------------------------------- |
| P1  | Sekretärin legt Akte an, Anwalt prüft   | Anlegen → Zuweisung → Freigabe  | ⚠️     | Rollen-System vorhanden, aber: Zuweisungs-Workflow? |
| P2  | Anwalt A bearbeitet, Anwalt B sieht mit | Geteilte Akte → Parallel-Access | ⚠️     | Kein Co-Editing, keine Presence-Indicators          |
| P3  | Sekretärin bucht Zeiten für Anwälte     | Zeiten-Tab → Anwalt bestätigt   | ⚠️     | Bestätigungspflicht für Zeiten?                     |
| P4  | Gemeinsame Recherche                    | Brain → Beide sehen Ergebnisse  | ✅     | Shared Brain, Shared Spaces                         |
| P5  | Vertretung bei Urlaub                   | Akten-Übergabe → Zugriff        | ⚠️     | Rollen-Wechsel? Akten-Freigabe?                     |

### 5.3 Persona: Power-User (Tech-affiner Anwalt)

**Profil:** Nutzt alle Features, automatisiert, API-Power-User

| #   | Szenario                    | Erwarteter Flow                           | Status | Lücken                                             |
| --- | --------------------------- | ----------------------------------------- | ------ | -------------------------------------------------- |
| U1  | Custom Agent erstellen      | Agent Builder → Steps → Specialists → Run | ✅     | Voll implementiert                                 |
| U2  | API für Eigen-Integration   | API-Key → REST-Calls → Audit              | ✅     | Rate-Limits, Scopes, Audit                         |
| U3  | Workflow mit Conditions     | If/Else-Branching in Workflows            | ✅     | StepCondition implementiert                        |
| U4  | Bulk-Dokumenten-Analyse     | Upload 50 PDFs → Batch-Analyse            | ⚠️     | Batch-Edit vorhanden, aber: Bulk-Upload mit Queue? |
| U5  | Auto-Playbook aus Verträgen | Cron → Scan → Playbook-Update             | ⚠️     | API vorhanden, aber kein Cron-Job                  |

---

## 6. Edge-Case & Stress-Test Matrix

### 6.1 Daten-Edge-Cases

| #   | Szenario                      | Erwartung          | Status | Kriterien                               |
| --- | ----------------------------- | ------------------ | ------ | --------------------------------------- |
| EC1 | Leere Kanzlei (0 Akten)       | Onboarding-Führung | ⚠️     | Empty-State vorhanden? Guided Tour?     |
| EC2 | 500+ Akten                    | Performance        | ⚠️     | Paginierung? Virtualisierung? Ladezeit? |
| EC3 | 1000+ Dokumente in einer Akte | Vault-Performance  | ⚠️     | Endless-Scroll? Lazy-Load?              |
| EC4 | Frist ohne Datum              | Validierung        | ✅     | Pflichtfeld, Fehlermeldung              |
| EC5 | Kontakt ohne Email            | Optional-Feld      | ✅     | Validierung flexibel                    |
| EC6 | Rechnung ohne Zeiten          | Warnung oder leer  | ⚠️     | Fehlermeldung? Leere Rechnung möglich?  |

### 6.2 Workflow-Edge-Cases

| #   | Szenario                         | Erwartung          | Status | Kriterien                             |
| --- | -------------------------------- | ------------------ | ------ | ------------------------------------- |
| WC1 | Workflow abbrechen               | Status → cancelled | ⚠️     | Abbrechen-Button? Status-Übergang?    |
| WC2 | Workflow-Step fehlschlägt        | Error → Retry/Skip | ⚠️     | Error-Handling pro Step? Retry-Logic? |
| WC3 | Parallele Workflows gleiche Akte | Keine Konflikte    | ⚠️     | Locking? Race-Conditions?             |
| WC4 | Workflow mit 20+ Steps           | Performance        | ⚠️     | UI-Rendering? Scroll?                 |
| WC5 | Workflow ohne Case-Slug          | Globaler Workflow  | ✅     | Optional-Feld                         |

### 6.3 Security-Edge-Cases

| #   | Szenario                       | Erwartung    | Status | Kriterien                        |
| --- | ------------------------------ | ------------ | ------ | -------------------------------- |
| SC1 | Mandant A sieht Akte Mandant B | Blockiert    | ✅     | Multi-Tenant-Isolation, getestet |
| SC2 | API-Key ohne Scope             | Kein Zugriff | ✅     | Scopes, Rate-Limits              |
| SC3 | 2FA-Bypass-Versuch             | Blockiert    | ✅     | Rate-Limiting, TOTP              |
| SC4 | Ethical Wall verletzt          | Blockiert    | ✅     | `ethical-wall.ts`                |
| SC5 | SQL-Injection in Suche         | Blockiert    | ✅     | Parameterized queries            |

---

## 7. Audit-Durchführung — Arbeitspakete

### AP1: Code-Verification Sprint (1–2 Tage)

**Ziel:** Jedes Feature aus §2 gegen Code prüfen, Score verifizieren

- [ ] Alle 50+ Dashboard-Routen aufrufen und auf echte Backend-Logik prüfen
- [ ] API-Endpunkte auf echte Implementierung prüfen (nicht nur 200-Response)
- [ ] Cron-Jobs auf Konfiguration prüfen
- [ ] i18n-Vollständigkeit prüfen (DE+EN)
- [ ] Mobile-Build auf Lauffähigkeit prüfen

### AP2: Userflow-Walkthrough (1–2 Tage)

**Ziel:** Alle 6 Persona-Szenarien als End-to-End Userflow durchspielen

- [ ] Solo-Anwalt: 6 Szenarien durchspielen, Lücken dokumentieren
- [ ] 3-Personen-Kanzlei: 5 Szenarien durchspielen, Lücken dokumentieren
- [ ] Power-User: 5 Szenarien durchspielen, Lücken dokumentieren
- [ ] Edge-Cases: 12 Szenarien durchspielen, Lücken dokumentieren

### AP3: DACH-Compliance-Deep-Dive (1 Tag)

**Ziel:** Rechtsspezifische Features auf Korrektheit prüfen

- [ ] RVG-Tabelle gegen offizielle Tabelle abgleichen
- [ ] Fristen-Berechnung gegen ZPO prüfen
- [ ] DATEV-Export-Format prüfen
- [ ] beA-Versand testen (oder dokumentieren, was fehlt)
- [ ] AT/CH-Spezifika prüfen (RATG, OR, DSG)

### AP4: Cross-Feature-Integration-Test (1 Tag)

**Ziel:** 15 Integrationen aus §3 verifizieren

- [ ] Datenfluss Akte → Fristen → Kalender testen
- [ ] Datenfluss Zeiten → Rechnung → DATEV testen
- [ ] Datenfluss WhatsApp → Zeiten → Akte testen
- [ ] Datenfluss Brain → Chat → Drafting testen
- [ ] Datenfluss Kollision → Akte → Kontakt testen

### AP5: Gap-Report & Priorisierung (0,5 Tage)

**Ziel:** Alle gefundenen Lücken in priorisierte Arbeitspakete übersetzen

- [ ] Alle 🔧 Mock/Platzhalter auflisten
- [ ] Alle ⚠️ Teilweise auflisten mit konkretem Fix-Aufwand
- [ ] Alle ❌ Fehlend auflisten mit Implementierungsaufwand
- [ ] Alle fehlenden Integrationen auflisten
- [ ] Priorisierung: P0 (blockierend) → P1 (hoch) → P2 (mittel) → P3 (niedrig)
- [ ] Aufwandsschätzung pro Gap in Tagen

---

## 8. Erwartete Audit-Ergebnisse — Hypothesen

### 8.1 Vermutete Stärken (hohe Abdeckung)

- **KI/Brain:** Chat, Drafting, Research, Agenten — voll produktionstauglich
- **Dokumentenverarbeitung:** Vault, Upload, Analyse, Redlining — vollständig
- **Sicherheit:** Multi-Tenant, 2FA, Audit-Trail, Ethical Wall — vollständig
- **Ecosystem:** Word-Add-In, Outlook-Add-In, Mobile, Connectors — stark
- **Recherche:** RIS, Perplexity, law-corpus, Precedent Search — gut

### 8.2 Vermutete Schwächen (Lücken erwartet)

| Bereich                  | Vermutete Lücke                                                     | Geschätzter Aufwand |
| ------------------------ | ------------------------------------------------------------------- | ------------------- |
| **Rechnung → DATEV**     | Auto-Generierung aus Zeiten fehlt, DATEV-Format evtl. unvollständig | 3–5 Tage            |
| **beA-Versand**          | Echter Versand nicht implementiert, nur Import                      | 2–3 Tage            |
| **Mahnwesen**            | Nur dokumentiert, keine Implementierung                             | 2–3 Tage            |
| **AT-RVG (RATG)**        | Nur DE-RVG, keine österreichische Gebühren                          | 2–3 Tage            |
| **CH-Gebühren**          | Gar nicht implementiert                                             | 3–5 Tage            |
| **Fristen-Auto-Anlage**  | AI erkennt Fristen, aber legt sie nicht automatisch an              | 1–2 Tage            |
| **Workflow-Execution**   | Templates werden angelegt, aber Steps nicht automatisch ausgeführt  | 3–5 Tage            |
| **Controlling**          | Echte Berechnung vs. Mock-Daten unklar                              | 2–3 Tage            |
| **Mobile Push**          | Push-Notifications nicht konfiguriert                               | 1–2 Tage            |
| **Guided Onboarding**    | Keine geführte Tour für Neue Nutzer                                 | 2–3 Tage            |
| **Email-Auto-Zuordnung** | Emails werden nicht automatisch Akten zugeordnet                    | 2–3 Tage            |
| **Co-Editing**           | Kein Real-time-Co-Editing                                           | 5–10 Tage           |

### 8.3 Vermutete Mocks/Platzhalter

| Feature                  | Verdacht                                         | Verifikation nötig  |
| ------------------------ | ------------------------------------------------ | ------------------- |
| Mahnwesen                | Nur in docs.ts beschrieben, keine UI             | Route prüfen        |
| Controlling-Kennzahlen   | Eventuell hartcodierte Demo-Daten                | API-Response prüfen |
| AT-Rechtsgebühren (RATG) | rvg.ts evtl. nur DE                              | Code prüfen         |
| Fristen-Erinnerung-Email | Cron konfiguriert, aber Email-Versand ungetestet | Cron-Log prüfen     |
| Kanzlei-Import           | UI vorhanden, aber Import-Logic unklar           | API-Endpunkt prüfen |

---

## 9. Definition of Done

Das Audit ist abgeschlossen, wenn:

- [ ] Alle 50+ Dashboard-Routen verifiziert (Score ✅/⚠️/🔧/❌)
- [ ] Alle 6 Persona-Szenarien durchgespielt
- [ ] Alle 15 Cross-Feature-Integrationen geprüft
- [ ] Alle DACH-Spezifika verifiziert (DE/AT/CH)
- [ ] Alle Edge-Cases getestet
- [ ] Gap-Report mit Priorisierung erstellt
- [ ] Aufwandsschätzungen pro Gap dokumentiert
- [ ] Ergebnis: X% der Use-Cases produktionstauglich, Y% teilweise, Z% fehlend

**Ziel-Benchmark:** ≥80% der Use-Cases sollten ✅ PRODUKTIONSREIF sein für ein glaubwürdiges "Kanzlei-Alltag OS".

---

## 10. Output-Format

### 10.1 Audit-Report Struktur

```
1. Executive Summary (1 Seite)
   - Gesamtscore: X% produktionstauglich
   - Top 5 Stärken
   - Top 5 Lücken
   - Empfohlene Priorisierung

2. Use-Case-Matrix (vollständig ausgefüllt)
   - Alle 40+ Use-Cases mit Score
   - Alle 15 Integrationen mit Status
   - Alle DACH-Spezifika mit Score

3. Gap-Report
   - P0 Lücken (blockierend)
   - P1 Lücken (hoch)
   - P2 Lücken (mittel)
   - P3 Lücken (niedrig)
   - Aufwandsschätzung pro Gap

4. Persona-Walkthrough-Report
   - Solo-Anwalt: X/6 Szenarien voll funktionsfähig
   - 3-Personen-Kanzlei: X/5 Szenarien voll funktionsfähig
   - Power-User: X/5 Szenarien voll funktionsfähig

5. Empfehlung
   - Was sofort fixen (Quick Wins)
   - Was in nächstem Sprint angehen
   - Was auf Roadmap setzen
```

---

## 11. Werkzeuge & Methoden

| Werkzeug        | Einsatz                             |
| --------------- | ----------------------------------- |
| `code_search`   | Code-Verification pro Feature       |
| `grep_search`   | API-Endpunkte, Backend-Logik finden |
| `read_file`     | Implementierung-Tiefe prüfen        |
| `run_command`   | `tsc --noEmit`, Tests, Build        |
| Browser-Preview | UI-Walkthrough, Edge-Case-Test      |
| Playwright E2E  | Automatisierte Userflow-Tests       |

---

_Dieses Audit ist der systematische Beweis, dass Subsumio nicht nur Features hat, sondern den Kanzlei-Alltag wirklich abdeckt — oder die ehrliche Dokumentation, wo es noch Lücken gibt._
