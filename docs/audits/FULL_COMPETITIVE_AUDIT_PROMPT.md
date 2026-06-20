# Full Competitive & Production Audit — Subsumio vs. Harvey / Konkurrenz

> **Ziel:** 100% Klarheit ob Subsumio in JEDEM Bereich mindestens gleich gut oder besser ist als Harvey AI und vergleichbare Legal-Tech-Plattformen (Casetext, Lexis+ AI, Definely, Legartis, BRYTER).
> **Modus:** Vollständiger System-Check, kein Bereich wird übersprungen. Jeder Check muss mit Code-Beleg oder Test-Ergebnis beantwortet werden.
> **Output:** Pro Bereich: Status (✅/⚠️/❌), Score (%), konkrete Lücken, Fix-Vorschlag mit Aufwandsschätzung.

---

## PHASE 1 — CORE LEGAL FUNCTIONALITY (vs. Harvey)

### 1.1 Document Analysis & Review
- [ ] **Upload & Ingestion** — PDF, DOCX, TIFF, Bilder (OCR)? Batch-Upload? Drag-and-Drop?
- [ ] **Document Q&A** — Kann der Nutzer Fragen zu einem konkreten Dokument stellen? Mit Zitat-Belegen?
- [ ] **Contract Analysis** — Klausel-Erkennung, Risk-Flagging, Abweichung von Standard?
- [ ] **Due Diligence** — Bulk-Review von Vertragsportfolios? Issue-Liste pro Dokument?
- [ ] **Comparison** — Side-by-side Vertragsvergleich? Redline?
- [ ] **Summarization** — Automatische Zusammenfassung mit Key-Terms Extraktion?
- [ ] **Translation** — Mehrsprachige Dokumentanalyse (DE/EN/FR/IT)?

### 1.2 Legal Research & RAG
- [ ] **Statute Search** — Gesetzesuche mit Quellenangabe? Aktuellste Fassung?
- [ ] **Case Law Search** — Rechtsprechungssuche mit RIS-OGD / openlegaldata Integration?
- [ ] **Citation Verification** — Werden Zitate automatisch auf Gültigkeit geprüft?
- [ ] **Jurisdiction Filter** — Filter nach OLG/BGHLG/VwGH etc.?
- [ ] **Legal Chat** — Conversational Q&A mit Brain-Kontext? Follow-up Questions?
- [ ] **Playbooks** — Wiederverwendbare Legal-Playbooks für Standard-Verträge?

### 1.3 Deadline & Calendar Management
- [ ] **Deadline Calculation** — Automatische Fristberechnung aus Dokumenten? (§ 222 ZPO, § 74 VwGO etc.)
- [ ] **AI Deadline Detection** — KI extrahiert Fristen aus Texten/E-Mails?
- [ ] **Calendar Sync** — .ics Export? Google Calendar / Outlook Integration?
- [ ] **Reminder System** — Push-Notifications vor Fristablauf? Eskalation?
- [ ] **Deadline Dashboard** — Übersicht aller Fristen nach Priorität/Status?

### 1.4 Contract Drafting & Automation
- [ ] **Template Library** — Vorlagen-Bibliothek mit Variablen?
- [ ] **AI-Assisted Drafting** — KI generiert Klauseln/Verträge aus Prompt?
- [ ] **Clause Bank** — Wiederverwendbare Klausel-Sammlung?
- [ ] **Variable Insertion** — Automatische Befüllung aus Case-Daten (Partei, Gericht, Aktenzeichen)?
- [ ] **Word Export** — DOCX-Export mit Formatierung? Word-Add-In?

### 1.5 Conflict Check & Compliance
- [ ] **Conflict of Interest** — Automatische Kollisionsprüfung bei Mandatsannahme?
- [ ] **Party Matching** — Namen-Abgleich über alle Cases hinweg?
- [ ] **GDPR Compliance** — DSGVO-Export, Löschung, Verschlüsselung?
- [ ] **GoBD Compliance** — Verfahrensdokumentation, Unveränderbarkeit, Audit-Trail?
- [ ] **Retention Policy** — Aufbewahrungsfristen pro Dokumenttyp?

---

## PHASE 2 — PLATFORM & UX (vs. Harvey / Modern SaaS)

### 2.1 Onboarding & First Run
- [ ] **Signup Flow** — Self-Service Registration? Email-Verification?
- [ ] **First-Run Experience** — Guided Tour? Empty-State mit Call-to-Action?
- [ ] **Demo Brain** — Vorgefüllter Demo-Brain zum Ausprobieren?
- [ ] **Trial System** — Free-Trial mit automatischem Plan-Upgrade?

### 2.2 Dashboard & Navigation
- [ ] **Custom Dashboard** — Personalisierbare Widgets? Drag-and-Drop?
- [ ] **Command Palette** — Cmd+K Quick-Action? fuzzy Search?
- [ ] **Search** — Global Search über Brain, Cases, Deadlines?
- [ ] **Dark Mode** — Light/Dark Theme Toggle?
- [ ] **Mobile Responsive** — Alle Seiten auf Mobile nutzbar?
- [ ] **Keyboard Navigation** — Tab-Reihenfolge, Shortcuts, Focus-Indicators?

### 2.3 Collaboration & Real-time
- [ ] **Multi-User** — Team-Mitglieder mit Rollen (Admin/Member/Viewer)?
- [ ] **Real-time Updates** — SSE/WebSocket für Live-Updates?
- [ ] **Comments & Threads** — Kommentare auf Cases/Dokumenten? Reply-Threads?
- [ ] **@Mentions** — User-Mentions mit Notification?
- [ ] **Activity Feed** — Wer hat was wann gemacht?
- [ ] **Assignment** — Cases/Deadlines an Team-Mitglieder zuweisen?

### 2.4 Notifications
- [ ] **In-App Notifications** — Bell-Icon mit Badge?
- [ ] **Email Notifications** — Transaktional Emails (Frist, Mention, Assignment)?
- [ ] **Push Notifications** — Web-Push für kritische Fristen?
- [ ] **Notification Preferences** — User kann Kanäle/Typen ein/ausschalten?

---

## PHASE 3 — TECHNICAL EXCELLENCE

### 3.1 API Architecture
- [ ] **Guard Chain** — Jede API-Route durchläuft Auth/RBAC/CSRF/RateLimit/Quota/Validation?
- [ ] **Error Handling** — Strukturierte Error-Responses mit Code + Message + Details?
- [ ] **Idempotency** — POST/PUT idempotent? Stripe-Webhook dedup?
- [ ] **Pagination** — Alle List-Endpoints paginiert?
- [ ] **Caching** — GET-Endpoints mit Cache-Control? ETag?
- [ ] **Versioning** — API-Versioning Strategy?
- [ ] **Rate Limiting** — Per-User tier-based? Per-IP für Public?

### 3.2 Security
- [ ] **CSP** — Content-Security-Policy konfiguriert? Strict?
- [ ] **CSRF** — Double-Submit-Token auf allen state-changing Routes?
- [ ] **XSS** — Input-Sanitization? Output-Encoding? sanitize-html?
- [ ] **SQL Injection** — Parameterized Queries überall? pg-driver?
- [ ] **Encryption at Rest** — AES-256-GCM für sensible Daten?
- [ ] **Encryption in Transit** — HTTPS only? HSTS?
- [ ] **2FA** — TOTP mit Backup-Codes? Challenge-Token?
- [ ] **Session Management** — Secure, HttpOnly, SameSite Cookies?
- [ ] **Account Lockout** — Brute-Force Protection?
- [ ] **Audit Log** — Jede Aktion geloggt? Tamper-proof?
- [ ] **Secrets Management** — Keine Hardcoded Secrets? .env.example complete?

### 3.3 Data & Storage
- [ ] **Postgres-Ready** — Alle File-based Stores haben Postgres-Path?
- [ ] **Migrations** — SQL-Migrations vorhanden? Idempotent?
- [ ] **Backup** — Backup-Export? Restore-Process?
- [ ] **Data Export** — GDPR-Export? Full-Backup?
- [ ] **File Storage** — DMS mit Versioning? Checksum?

### 3.4 Performance & Scalability
- [ ] **Bundle Size** — Client-Bundle < 500KB gzipped?
- [ ] **Code Splitting** — Dynamic Imports für schwere Komponenten?
- [ ] **Image Optimization** — next/image? WebP/AVIF?
- [ ] **Database Indexes** — Alle Queries haben Index?
- [ ] **Connection Pooling** — Pg-Pool konfiguriert?
- [ ] **Edge Runtime** — Middleware auf Edge? Cold-Start < 100ms?

### 3.5 Testing & CI/CD
- [ ] **Unit Tests** — Coverage > 80%? Critical-Path abgedeckt?
- [ ] **E2E Tests** — Playwright? Smoke-Test pro Dashboard-Page?
- [ ] **Accessibility Tests** — axe-core? WCAG 2.1 AA?
- [ ] **Security Scanning** — gitleaks? dependency-audit?
- [ ] **CI Pipeline** — Pre-commit hooks? Pre-push? GitHub Actions?
- [ ] **Deployment** — Vercel-native? Zero-downtime?

---

## PHASE 4 — INTEGRATIONS (vs. Harvey Ecosystem)

### 4.1 External Services
- [ ] **DocuSign** — Signature-Integration? Envelope-Status-Tracking?
- [ ] **WhatsApp** — Message-Send/Receive? Media-Download?
- [ ] **beA** — beA-Integration? Nachrichten senden/empfangen?
- [ ] **Email** — IMAP-Import? SMTP-Send? Mailbox-UI?
- [ ] **DATEV** — DATEV-Export? Buchungs-Stapel?
- [ ] **Google Calendar** — Sync? Two-way?
- [ ] **Outlook** — Calendar/Contact Sync?

### 4.2 Connectors Framework
- [ ] **Connector Registry** — Plug-and-Play Connector-System?
- [ ] **Sync Status** — UI zeigt Sync-Status pro Connector?
- [ ] **Error Recovery** — Retry-Logic? Exponential Backoff?
- [ ] **Webhook Inbound** — Generic Webhook-Receiver mit HMAC-Verify?

---

## PHASE 5 — LEGAL DOMAIN DEPTH (vs. Harvey USP)

### 5.1 Austrian/German Law
- [ ] **ABGB/BGB** — Vollständige Gesetzessammlung? Durchsuchbar?
- [ ] **ZPO/VwGO** — Verfahrensrecht integriert?
- [ ] **RVG** — Kostenberechnung? RVG-Tabelle aktuell?
- [ ] **Fristen-Engine** — Alle Fristen-Typen (einschließlich, ausschließlich, Notfristen)?
- [ ] **Feiertags-Kalender** — Bundesland-spezifische Feiertage?
- [ ] **Gerichtsstruktur** — Instanzenzug korrekt abgebildet?

### 5.2 Legal AI Quality
- [ ] **Hallucination Prevention** — RAG mit Quellenangabe? Confidence-Score?
- [ ] **Citation Accuracy** — Zitate verifizierbar? Link zum Original?
- [ ] **Legal Reasoning** — Mehrstufiges Reasoning (IRAC, Issue-Spotting)?
- [ ] **Jurisdiction Awareness** — Erkennt System AT vs. DE vs. CH?
- [ ] **Language Quality** — Juristisches Deutsch korrekt?

### 5.3 Kanzlei-OS Features
- [ ] **Mandantenverwaltung** — CRUD für Mandanten? Historie?
- [ ] **Aktenverwaltung** — Aktenzeichen-System? Akten-Struktur?
- [ ] **Zeiterfassung** — Time-Tracking pro Akte? RVG-konform?
- [ ] **Rechnungsstellung** — Invoice-Generation? DATEV-Export?
- [ ] **Verfahrensdokumentation** — GoBD-konform? Unveränderbar?
- [ ] **Handakte** — Elektronische Handakte? Index?
- [ ] **Korrespondenz** — Brief/Draft-Generation?

---

## PHASE 6 — COMPETITIVE EDGE (Subsumio vs. Harvey)

### 6.1 Was Harvey NICHT hat (Subsumio USPs)
- [ ] **European Law Focus** — AT/DE/CH statt US-Common-Law?
- [ ] **Multi-Jurisdiction** — DACH-Region in einer Plattform?
- [ ] **GoBD Compliance** — GoBD-konforme Verfahrensdokumentation?
- [ ] **beA Integration** — beA als deutscher Anwalt-Messenger?
- [ ] **RVG Cost Calculation** — Automatische RVG-Kostenberechnung?
- [ ] **Self-Hosted Option** — On-Premise für Kanzleien mit Datenschutz-Anforderungen?
- [ ] **Brain-System** — Multiple Brains pro Kanzlei (Mandantentrennung)?

### 6.2 Wo Harvey besser ist (Lücken-Analyse)
- [ ] **Contract Review AI** — Harvey's COCounsel hat tiefere Klausel-Analyse. Wo stehen wir?
- [ ] **Case Law Coverage** — Harvey hat Casetext-Integration (US Case Law). Was haben wir für DACH?
- [ ] **Model Quality** — Harvey nutzt GPT-4/Claude mit Legal-Fine-Tuning. Was nutzen wir?
- [ ] **Enterprise Features** — SSO/SAML? SCIM? Audit-Export für Regulatoren?
- [ ] **Marketplace** — Harvey hat Integration-Marketplace. Haben wir Connectors-Framework?

---

## PHASE 7 — EDGE CASES & STRESS TESTS

### 7.1 Data Scenarios
- [ ] **Empty Brain** — Was passiert bei 0 Pages? 0 Entities? 0 Queries?
- [ ] **Large Dataset** — 10.000+ Pages? Performance akzeptabel?
- [ ] **Special Characters** — Umlaute, chinesische Schrift, Emoji in Dokumenten?
- [ ] **Corrupt Upload** — Falsches Format? 0-Byte-Datei? Virus-Datei?

### 7.2 User Scenarios
- [ ] **Concurrent Edits** — Zwei User editieren gleichzeitig? Conflict-Resolution?
- [ ] **Permission Edge** — User ohne Plan versucht Premium-Feature?
- [ ] **Session Expiry** — Token läuft mid-action ab? Graceful Recovery?
- [ ] **Offline Mode** — Was funktioniert offline? Cache-Strategy?

### 7.3 Security Edge Cases
- [ ] **Path Traversal** — `../` in Slug? In Dateipfaden?
- [ ] **SSRF** — User-input als URL? Engine-Fetch geschützt?
- [ ] **ReDoS** — Regex in Input-Validation? Time-bounded?
- [ ] **Mass Assignment** — `passthrough()` in Zod-Schema sicher?

---

## OUTPUT FORMAT

Pro Check-Item:

```
[✅/⚠️/❌] 1.1 Document Q&A — Score: 90%
  Code-Beleg: src/app/dashboard/query/page.tsx:45-80
  Test: src/lib/legal-chat/actions.ts
  Lücke: Keine Zitat-Verifikation bei Follow-up Questions
  Fix: Zitat-Extraktion im RAG-Response hinzufügen — Aufwand: 4h
```

Pro Phase ein Summary:

```
PHASE 1 — CORE LEGAL: 85% (17/20 ✅, 2/20 ⚠️, 1/20 ❌)
```

Am Ende ein Gesamt-Urteil:

```
GESAMT-SCORE: 91%
PRODUCTION READY: ✅
COMPETITIVE vs. HARVEY: ✅ in DACH, ⚠️ in Contract Review Depth
TOP 3 LÜCKEN:
  1. Contract Review AI — Harvey's Klausel-Analyse ist tiefer
  2. Case Law Coverage — DACH-Rechtsprechung braucht mehr Quellen
  3. Enterprise SSO — SAML/SCIM fehlt für Großkanzleien
```

---

## AUSFÜHRUNGS-REGELN

1. **Kein Bereich wird übersprungen** — auch "klein" scheinende Items werden geprüft.
2. **Jeder Check braucht Code-Beleg** — Dateipfad + Zeilennummer oder Test-Name.
3. **Keine Behauptungen ohne Beweis** — "Sollte funktionieren" ist kein valides Ergebnis.
4. **Lücken werden konkret benannt** — nicht "könnte besser sein", sondern "Feature X fehlt in Datei Y".
5. **Fix-Vorschläge mit Aufwand** — S/M/L (Stunden) pro Lücke.
6. **Competitive Analysis ehrlich** — wo Harvey besser ist, wird klar gesagt.
7. **Edge Cases werden aktiv gesucht** — nicht nur Happy-Path prüfen.
