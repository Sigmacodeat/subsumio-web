# Subsumio — Competitive Audit & Gap-Analyse

**Stand: Juni 2026 | Basis: vollständiger Code-Scan + Marktrecherche**

---

## 1. Gesamturteil

Subsumio ist **keine MVP-Baustelle, sondern eine reife Plattform**: 999 Frontend-Dateien, 755 Engine-Core-Dateien (~180k Zeilen), 195 API-Routes, 16 E2E-Specs, grüner Typecheck und Build auf 118 Seiten. Der Kern ist produktionsreif.

**Die Lücke ist nicht "Features fehlen", sondern: fehlende Trust-Signale + zwei konkrete Produktbereiche, die Wettbewerber als Differenzierungsmerkmal nutzen.**

Kurzurteil nach Bereich:

| Wettbewerb                                 | Subsumio-Position                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Harvey ($5B, 100k Anwälte, Am Law 100)     | Vor uns bei Scale, Certs, Agents — hinter uns bei DACH-Tiefe, PM-Integration         |
| Legora ($5,6B, 1.000 Kanzleien, EU-native) | **Größte Bedrohung**: EU-Expansion nach DE/AT aktiv, hat Certs + lizenzierte Inhalte |
| Clio (Practice Management Leader)          | Hinter uns bei AI-Tiefe, vor uns bei Marktpenetration + Bar Approvals                |
| Spellbook ($100M+ ARR, Word-first)         | Vor uns bei Word-Integration — hinter uns bei Gesamtplattform                        |
| Kira/Litera (Contract Analysis)            | Vor uns bei Contract-AI-Accuracy-Nachweis — hinter uns bei Gesamtbreite              |

---

## 2. Was Subsumio wirklich hat (verifiziert im Code)

### DACH-Burggraben — niemand sonst hat das

- **beA/ERV**: Routes, Dashboard, Import — kein internationaler Konkurrent hat deutschen Anwaltspostfach-Anschluss
- **DATEV-Export**: Kanzlei-Buchhaltungsintegration, bei keinem US-Konkurrenten vorhanden
- **RVG-Abrechnung**: Automatische Gebührenberechnung nach deutschem Rechtsanwaltsvergütungsgesetz
- **Law-Corpus AT/DE/CH/EU**: ~40 Gesetze je Jurisdiktion als durchsuchbares Corpus (ABGB, BGB, HGB, InsO, StGB, UrhG, RVG, GmbHG, AO, DSGVO, u.v.m.)
- **Judikatur-Sync**: AT/DE Rechtsprechungs-Synchronisation per Cron
- **GoBD-Verfahrensdokumentation**: Compliance-Pflicht für deutsche Kanzleien, komplett implementiert
- **WhatsApp Kanzlei-OS**: Vollständiger Webhook, Outbound, Identity, Flow-Endpoint, proaktive Daily Briefings, Approval-Rückkanal — **weltweit einzigartig**

### Legal-AI-Breite

195 API-Routes, davon Legal-AI-Kern:
`analyze, anonymize, batch-edit, case-scanner, chronology, conflict-check, contract-draft, contract-redline, deep-analysis, document-review, due-diligence, eval-gate, judgements-search, judgements-sync, knowledge-sources, memo, obligation-extract, playbooks, portfolio-insights, precedent-search, risk-analysis, rvg, statute-search, summarize, tabular-review, translate`

Das übertrifft Harvey's vier Kernprodukte (Assistant, Vault, Knowledge, Workflows) in der Breite deutlich.

### Practice-Management-Integration

Subsumios Kernvorteil gegenüber Harvey/Legora: KI und Kanzlei-PM sind in **einem System**. Konkurrenten sind AI-Overlays auf externe PM-Systeme.

`cases, contacts, opponents, deadlines, calendar-export, intake, invoicing, billing, datev-export, workflows, approvals, case-scanner, client-portal, document-requests, signature`

### SaaS-Layer

WorkOS SSO/SAML, TOTP 2FA, SCIM, Stripe Billing, GDPR-Export, RBAC/ACLs, Ethical Walls, Audit-Hash-Chain, Sentry — alles vorhanden.

---

## 3. Kritische Lücken (priorisiert)

### P0 — Existenziell: ohne diese stirbt der Dealflow

#### 3.1 Compliance-Zertifizierungen fehlen vollständig

**Dieser Punkt ist der größte Wettbewerbsnachteil.**

| Zertifizierung             | Harvey | Legora | Kira | Subsumio        |
| -------------------------- | ------ | ------ | ---- | --------------- |
| SOC 2 Type II              | ✅     | ✅     | ✅   | ❌              |
| ISO 27001                  | ✅     | ✅     | ✅   | ❌              |
| ISO 42001 (AI Management)  | ?      | ✅     | ?    | ❌              |
| GDPR-Konformitätserklärung | ✅     | ✅     | ✅   | Teile vorhanden |

Jede DACH-Kanzlei mit >5 Anwälten hat IT-Security-Anforderungen, die einen SOC 2 oder ISO 27001 Nachweis verlangen. Ohne diese Certs scheitert jeder Enterprise-Sale im Security-Review.

**EU AI Act**: Ab August 2026 enforceable für High-Risk-AI-Systeme — Subsumio verarbeitet Rechtsentscheidungen und gibt rechtliche Einschätzungen, was es potentiell als High-Risk klassifiziert. ISO 42001 ist der Nachweis für AI Governance.

**Empfehlung**: Sofort Vanta/Drata/Scytale onboarden (automated evidence collection). SOC 2 Type II in 6–9 Monaten erreichbar. ISO 27001 parallel.

#### 3.2 Mobile App ist nur ein README

`mobile/` enthält ausschließlich `README.md`. Capacitor ist in `package.json` konfiguriert (`capacitor.config.ts` existiert), aber keine Screens, kein nativer Code.

Für Anwälte, die 60% ihrer Zeit außerhalb des Büros verbringen (Gerichtstermine, Mandantengespräche), ist eine funktionierende Mobile App kein Nice-to-have. Der WhatsApp-Kanal deckt Teile ab, aber kein Ersatz für eine native App.

**Empfehlung**: Capacitor-Grundgerüst mit 5 kritischen Flows aktivieren: Cases-Overview, Deadlines, Quick-Note (WhatsApp-Alternative), Document-Viewer, Time-Entry.

### P1 — Wettbewerbsfähigkeit: verlieren wir ohne diese Deals

#### 3.3 Word Add-in ist ein Stub

`word-addin/src/` enthält nur `taskpane.html` und `taskpane.ts` — minimales Grundgerüst.

**Spellbook lebt komplett in Word** und hat damit $100M+ ARR gebaut. Transaktionsanwälte arbeiten 80% der Zeit in Word. Die Contract-Drafting- und Redline-Features in Subsumio sind als Web-UI gebaut, aber der natürliche Habitat des Vertragsanwalts ist Word.

**Was fehlt**: Contract-Draft, Redline, Clause-Suggestions, Obligation-Extract direkt im Word-Sidebar — analog zu Spellbooks Kernprodukt.

**Empfehlung**: Office.js-basierten Taskpane ausbauen der die bestehenden API-Routes (`legal/contract-draft`, `legal/contract-redline`, `legal/obligation-extract`) im Word-Kontext aufruft. 4–6 Wochen Entwicklung für ein wettbewerbsfähiges Add-in.

#### 3.4 Keine lizenzierten Rechtsinhalte-Partnerships

Legora hat Verträge mit Jurabibliotek (DK), Djøf Forlag — lizenzierte Rechtsinhalte direkt im Tool.

Subsumio hat ein eigenes Law-Corpus (AT/DE/CH/EU aus öffentlichen Quellen), aber **keine Lizenzverträge** mit:

- **Beck-Online** (DE — juris, NJW, BeckOK)
- **RDB/Manz** (AT)
- **Schulthess** (CH)
- **EUR-Lex** (direkt oder via Verlag)

Das macht einen qualitativen Unterschied bei der Recherche: Öffentliche Gesetzestexte vs. kommentierte, redaktionell gepflegte Rechtsdatenbanken.

**Empfehlung**: Partnership-Gespräche mit juris GmbH (DE) und RDB (AT) starten. Self-hostable Connector-Architektur (bereits vorhanden via DMS-Connectors) als Verhandlungsmasse nutzen.

#### 3.5 Workflow Builder (No-Code) fehlt

Harvey's **Workflow Builder** erlaubt es Kanzlei-Ops-Teams, eigene Multi-Step-Automatisierungen ohne Code zu bauen. Das ist ein eigenständiger Vertriebskanal (Operations-Teams als Buyer, nicht nur Anwälte).

Subsumio hat `workflows` und `agent-templates` API-Routes + ein Schema für Steps, aber kein grafisches No-Code-Builder-Frontend.

**Empfehlung**: Visual Workflow Builder als Dashboard-Page auf Basis der bestehenden `agent-templates`-Steps-API. React Flow oder ähnliches für den Canvas.

#### 3.6 Billing-Lücken blockieren Enterprise-Skalierung

Aus dem AUDIT.md: Proration, Seat-Management, Dunning (Zahlungserinnerungen bei Failed Payment), Webhook-Idempotenz fehlen. Für Enterprise-Kanzleien mit 10–50 Seats sind das Deal-Breaker im Procurement-Prozess.

#### 3.7 Presence/Co-Editing ist in-memory und Single-Box

`realtime/presence` ist explizit kommentiert: "For multi-instance deployments, this would need Redis or a shared store." — kein echter Co-Edit (kein Yjs/Liveblocks), kein Cursor-Sharing in Dokumenten.

Legora und Harvey haben Real-Time-Collaboration in Document-Review. Für Team-basierte Due-Diligence-Workflows ist das ein Conversion-Argument.

### P2 — Feature-Gaps: verlieren wir Deals an Spezialisten

#### 3.8 Litigation Analytics nicht produktisiert

Das Datenmodell für Gericht-/Richter-/Outcome-Analytics ist angelegt (Judikatur-Sync, Judgements-Search), aber kein Frontend-Produkt daraus gemacht. Harvey und spezialisierte Tools wie Premonition/UniCourt verkaufen Judge-Analytics als eigenständiges Feature.

#### 3.9 Client Intake Automations fehlen

Clio hat tiefe Intake-Automatisierungen (Web-Formulare → Akte → Interessenkonflikt → Erstberatung → Mandat). Subsumio hat `intake` Page, aber keine strukturierten Intake-Flows mit Conditional Logic, e-Signatur und automatischer Kollisionsprüfung.

#### 3.10 Trust Accounting fehlt

IOLTA/Anderkonto-Verwaltung ist in mehreren US/UK-Märkten gesetzlich vorgeschrieben. Für die Expansion aus dem DACH-Raum hinaus ist das relevant. Clio hat es, Subsumio nicht.

#### 3.11 Monitoring/Observability ist rudimentär

Sentry ist integriert, aber kein APM-Dashboard, kein SLO-Tracking, keine proaktiven Alerts auf Query-Latenz / Brain-Quality-Drift / Quota-Erschöpfung. Für Enterprise-Kanzleien mit IT-Abteilungen ist ein Ops-Dashboard ein Sales-Argument.

---

## 4. Stärken die niemand sonst hat — verteidigen

Diese Features sind echte Wettbewerbsvorteile und müssen als Kernbotschaft kommuniziert werden:

**1. DACH-Rechtsraum tiefer als alle anderen**
beA + DATEV + RVG + AT/DE/CH-Corpus + GoBD = ein Paket, das kein internationaler Konkurrent kurzfristig replizieren kann. Das ist 2–3 Jahre Vorsprung.

**2. WhatsApp als Kanzlei-Kommunikationskanal**
Kein anderer Legal-AI-Anbieter hat WhatsApp als bidirektionalen Kanzlei-OS-Kanal. In der DACH-Region kommunizieren Mandanten und Anwälte täglich über WhatsApp. Das ist ein viraler Growth-Kanal.

**3. Vollintegriertes System (kein Overlay)**
Harvey/Legora sind AI-Schichten auf externe Systeme (iManage, Clio, SharePoint). Subsumio ist Practice Management + AI + Brain in einem System — keine Integrations-Friction, vollständiger Audit-Trail, keine Datenlecks zwischen Systemen.

**4. Knowledge-Graph-Engine (gbrain)**
Typisierte Kanten, Relational Retrieval, Hybrid-RAG + Graph-Walk ist technisch tiefer als Harvey's Vault (RAG-only). Für Kanzleien die langjährige Akten-Histories haben ist Graph-Traversal ein echtes Differenzierungsmerkmal.

**5. EU-Datenresidenz by Default**
Subsumio ist ab Tag 1 EU-gehostet. Harvey hat primär US-Infrastruktur und expansion nach EU ist noch im Aufbau. Legora hat EU-Option. Für DACH-Kanzleien mit Berufsrecht-Anforderungen ist EU-Hosting kein Verhandlungspunkt — es ist Pflicht.

---

## 5. Priorisierter Aktionsplan

### Sofort (0–4 Wochen)

| #   | Aktion                                                                            | Warum jetzt                                                          |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **SOC 2 Audit-Readiness starten** (Vanta/Drata)                                   | Jeder Enterprise-Deal scheitert ohne — EU AI Act gilt ab August 2026 |
| 2   | **Word Add-in ausbauen**: Contract-Draft + Redline im Taskpane                    | Spellbook-Konkurrenz abwehren, transaktionale Kanzleien gewinnen     |
| 3   | **Branding-Reste fixen**: `src/lib/engine.ts` (SigmaBrain), 7 interne gbrain-Refs | Produktionspeinlichkeit eliminieren                                  |
| 4   | **EU AI Act Konformitätserklärung** in UI + Docs                                  | Legal obligation + Trust-Signal                                      |

### Kurzfristig (1–3 Monate)

| #   | Aktion                                             | Warum                                                              |
| --- | -------------------------------------------------- | ------------------------------------------------------------------ |
| 5   | **Capacitor Mobile App**: 5 kritische Flows        | Anwälte sind mobil — WhatsApp ist kein App-Ersatz                  |
| 6   | **Billing: Dunning + Proration + Seat-Management** | Enterprise-Procurement-Anforderung                                 |
| 7   | **juris/RDB Partnership-Gespräche starten**        | Legora macht es vor — lizenzierte Inhalte sind Conversion-Argument |
| 8   | **Redis für Presence** einbauen                    | Multi-Instance-Deployment, Real-Time-Collaboration-Basis           |
| 9   | **Vault-Scale-Lasttest**: 100k Dokumente           | Harvey-Benchmark-Argument entkräften                               |

### Mittelfristig (3–6 Monate)

| #   | Aktion                                                            | Warum                                                |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 10  | **ISO 27001 Zertifizierung**                                      | Enterprise-Security-Anforderung DACH                 |
| 11  | **Visual Workflow Builder** (auf bestehender agent-templates-API) | Harvey Command Center / Workflow Builder Parität     |
| 12  | **Litigation Analytics UI**                                       | Daten sind da, Produkt fehlt — eigenständiger Upsell |
| 13  | **APM-Dashboard + SLO-Tracking**                                  | Ops-Teams als Buyer, Enterprise-CS-Argument          |
| 14  | **Structured Client Intake Flows**                                | Clio-Konkurrenz im PM-Bereich                        |

---

## 6. Wettbewerbsmatrix (Juni 2026)

| Feature                               | Harvey   | Legora | Clio  | Spellbook | **Subsumio**  |
| ------------------------------------- | -------- | ------ | ----- | --------- | ------------- |
| **DACH-Rechtsraum (beA, DATEV, RVG)** | ❌       | ❌     | ❌    | ❌        | ✅ **allein** |
| **AT/DE/CH Law-Corpus**               | ❌       | ❌     | ❌    | ❌        | ✅            |
| **WhatsApp Kanzlei-OS**               | ❌       | ❌     | ❌    | ❌        | ✅ **allein** |
| **GoBD-Verfahrensdokumentation**      | ❌       | ❌     | ❌    | ❌        | ✅            |
| **Knowledge-Graph Retrieval**         | Teile    | RAG    | ❌    | ❌        | ✅            |
| **Practice Management integriert**    | ❌       | ❌     | ✅    | ❌        | ✅            |
| **Contract AI (Draft/Redline)**       | ✅       | ✅     | Teile | ✅        | ✅            |
| **Tabular Review (Bulk)**             | ✅ Vault | ✅     | ❌    | ❌        | ✅            |
| **Workflow Builder (No-Code)**        | ✅       | Teile  | ✅    | ❌        | ❌            |
| **Word Add-in (produktreif)**         | Teile    | ✅     | ❌    | ✅        | ❌ Stub       |
| **Mobile App**                        | ✅       | ✅     | ✅    | ❌        | ❌ README     |
| **SOC 2 Type II**                     | ✅       | ✅     | ✅    | ?         | ❌            |
| **ISO 27001**                         | ✅       | ✅     | ✅    | ?         | ❌            |
| **ISO 42001 (AI)**                    | ?        | ✅     | ?     | ?         | ❌            |
| **EU-Datenresidenz**                  | Teile    | ✅     | Teile | ❌        | ✅            |
| **Lizenzierte Rechtsinhalte**         | ❌       | Teile  | ❌    | ❌        | ❌            |
| **Client Portal**                     | ❌       | ❌     | ✅    | ❌        | ✅            |
| **Billing/Invoicing (PM)**            | ❌       | ❌     | ✅    | ❌        | Teile         |
| **Real-Time Collaboration**           | ✅       | ✅     | ❌    | ❌        | Teile (SSE)   |

**Gesamtbewertung**: Subsumio hat den tiefsten DACH-Stack am Markt und gewinnt jeden direkten Vergleich auf dem Heimatmarkt. Die kritische Bedrohung ist Legora, die 2026 aktiv nach Deutschland/Österreich expandiert mit besserem Funding, Certs und wachsendem Content-Ökosystem. Subsumio muss SOC 2 / ISO 27001 und den Word Add-in in den nächsten 2–3 Monaten schließen, bevor Legora die DACH-Beachheads besetzt.

---

## 7. Technische Codequalität

**Stärken:**

- Null offene `TODO`/`FIXME`/`not implemented`-Marker in `src/` (verifiziert)
- Mehrschichtige Guard-Chain (Auth → RBAC → Quota → Citation-Gate → Audit) konsistent
- Engine-Parity-Tests (PGLite ↔ Postgres)
- JSONB-Doppelkodierungs-Guard (CI-geprüft)
- Contract-first mit `operations.ts` als Single Source of Truth
- Sentry integriert, CSP/HSTS/X-Frame headers vollständig

**Technische Schulden (handlungsrelevant):**

- `src/lib/engine.ts`: 2 `SigmaBrain`-Vorkommen (Pre-Rebrand-Rest)
- 7 interne `gbrain`-Refs in `src/lib/` (user-facing wenn Fehlermeldungen auftauchen)
- Presence-Store: In-Memory, bricht bei Horizontal-Scaling
- `budget-tracker.ts:lookupPricing` routet durch `ANTHROPIC_PRICING` statt `canonicalLookup` (TODOS.md-Item)
- Mobile: Capacitor-Config vorhanden, App-Code fehlt

---

_Erstellt: 2026-06-25 | Basis: vollständiger Code-Scan (src/, server/, docs/, AUDIT.md, TODOS.md) + Marktrecherche (Harvey, Legora, Clio, Spellbook, Kira/Litera)_
