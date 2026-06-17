# Subsumio-Analyse & Legal-AI-Goldstandard-Blueprint

> **Stand:** 12. Juni 2026 — Vollständige Analyse von subsum.io/de-AT/, SigmaBrain-Backend,
> Wettbewerbslandschaft (Harvey, Legora, Noxtua, CoCounsel) und Blueprint für die
> goldene SigmaBrain-Legal-Loesung.

---

## Teil 1: Subsum.io — Was ist das wirklich?

### 1.1 Frontend-Analyse (subsum.io/de-AT/)

**Produktpositionierung:** "Dein Legal Copilot, der jeden Fall im Griff hat"
- Zielgruppe: Rechtsanwaelte in Oesterreich (und Deutschland)
- Claim: Kanzleisoftware + Legal AI — DSGVO-konform, EU-gehostet

**Kernfeatures (laut Website):**

| Feature | Beschreibung | Bewertung |
|---|---|---|
| Copilot-gesteuerte Dokumenten-Pipeline | OCR + KI-Pipeline fuer PDFs/Scans/Vertraege | Standard-Legal-AI |
| Widerspruchserkennung | Querverweisanalyse zwischen Zeugenaussagen, Vertraegen, Beweismitteln | Interessant, aber behauptet viel |
| Fristenmanagement | "Intelligente Fristenberechnung fuer ueber 50 Rechtsrahmen (ZPO, AVG, ABGB, StPO)" | **KRITISCH — behauptet gesetzliche Fristenberechnung!** |
| Judikatur-Recherche | OGH-, BGH-, EGMR-Rechtsprechung mit semantischer Suche | Rechtsdatenbank-Integration |
| Dokumentenerstellung | Schriftsaetze aus 13 Vorlagen, Autopilot-Modus | Drafting-Feature |
| Beweismittelverwaltung | Staerke-Bewertungen, Kategorisierung, Lueckenanalyse | Case-Management |
| Multi-Jurisdiktion | AT, DE, EU-Recht — 50+ Gesetze | Corpus-Feature |
| Kanzleiverwaltung | Mandanten, Akten, Team-Zuweisung, Abrechnung, Audit-Protokoll | Practice Management |
| Lernendes Brain | "Jeder Fall macht den Copilot intelligenter" — anonymisiert, aggregiert | **Behauptet Cross-Kanzlei-Lernen** |

**Sicherheitsversprechen:**
- DSGVO-konform, E2E-Verschluesselung (AES-256, TLS 1.3)
- Zero-Knowledge-Architektur
- EU-Datenstandort
- SOC 2 Typ II
- Rollenbasierte Zugriffskontrolle
- Unveraenderliches Audit-Protokoll (Hash-Kette)

**Preismodell (laut Website):** Solo / Kanzlei / Team / Enterprise (keine konkreten Preise sichtbar)

### 1.2 Was wir NICHT sehen koennen (Backend-Blackbox)

Subsum.io ist eine **geschlossene SaaS-Blackbox** — kein Open Source, kein MCP, keine API-Doku oeffentlich. Wir koennen nur aus der Website und dem oesterreichischen Firmenregister schliessen:

- Wahrscheinlich **Next.js/Vercel** Frontend (aenliche Landing-Page-Aesthetik wie SigmaBrain)
- Vermutlich **Python-Backend** (FastAPI/Django) — die meisten Legal-AI-Startups nutzen Python wegen LangChain/LlamaIndex
- Vermutlich **PostgreSQL + pgvector** oder **Pinecone/Weaviate** fuer Vectors
- Rechtsdatenbank: Entweder eigene Lizenz mit beck-online/RIS oder Scraping
- LLM: Vermutlich GPT-4/Claude ueber API oder Fine-Tuned Model

---

## Teil 2: SigmaBrain-Backend — Was haben wir WIRKLICH?

### 2.1 Architektur-Ueberblick

```
SigmaBrain / GBrain v0.42.38.0
|
|-- CLI (src/cli.ts)           -- Lokale Bedienung
|-- MCP Server (stdio)          -- Claude Code, Cursor, etc.
|-- HTTP MCP Server (serve-http.ts) -- OAuth 2.1, Bearer Auth, Admin-Panel
|   |-- /mcp                    -- MCP Tool Calls (OAuth-gated)
|   |-- /admin                  -- Admin SPA (Embedded React)
|   |-- /api/*                  -- Web Dashboard API (web-api.ts)
|
|-- BrainEngine (core/engine.ts)
|   |-- PGLite (zero-config)   -- Lokale Engine
|   |-- Postgres + pgvector    -- Produktions-Engine
|   |-- 91 Operationen          -- search, think, put_page, get_page, graph, ...
|   |-- Hybrid Retrieval        -- Vector + BM25 + Graph-Traversal + RRF
|   |-- Self-Wiring Graph       -- Typisierte Kanten bei jedem Write
|   |-- Dream Cycle             -- Dedupe, Zitate, Widersprueche, Morning-Brief
|   |-- Multi-Tenant            -- source_id-Isolation, fuzz-getestet
|
|-- Ingestion
|   |-- PDF (+ OCR-Fallback)    -- extract-document.ts
|   |-- DOCX, EML, CSV, XLSX    -- neue Pipeline
|   |-- Audio-Transkription     -- transcription.ts
|   |-- 9 Konnektoren           -- Gmail, Drive, Calendar, Notion, Slack, Jira, Asana, Dropbox, GitHub
|
|-- Skills (58 Verzeichnisse)
|   |-- deadline-extract        -- Fristen-Extraktion (ohne Berechnung!)
|   |-- document-ingest         -- Dokument-Pipeline
|   |-- legal-brain             -- Legal-Brain-Subsystem (in Entwicklung)
|   |-- gbrain-legal.yaml       -- Schema-Pack fuer Legal
|
|-- Web-App (Next.js, EN+DE)
    |-- Marketing (33 Routen)   -- Landing, 5 Vertikale, /compare, /security
    |-- Dashboard (7 Seiten)    -- Query, Brain, Graph, Upload, Settings, Billing, Team
    |-- Auth + Billing          -- HMAC-Sessions, Stripe-ready, 2-Tier-Referral
    |-- Multi-Tenant-Provisioning -- x-sigmabrain-source Header, lazy Source-INSERT
```

### 2.2 Kernstaerken von SigmaBrain (objektiv belegt)

1. **Retrieval-Qualitaet:** Hybrid-Suche (Vector + BM25 + Graph + RRF), tausende Tests, BrainBench, LongMemEval — das ist dokumentiert besser als die meisten Konkurrenten.
2. **Graph-Engine:** Selbstverdrahtender Wissensgraph mit typisierten Kanten — Harvey/Legora haben das nicht oeffentlich.
3. **Gap-Analyse:** Die Antworten zeigen bewusst Luecken an — kein Konkurrent macht das.
4. **Multi-Tenant:** Fuzz-getestete Source-Isolation, Trust-Boundary remote/local.
5. **Open Source + Self-Host:** Kein anderer Legal-AI-Anbieter bietet beides.
6. **Dokument-Pipeline:** PDF/OCR, DOCX, EML, XLSX, Audio — in dieser Woche massiv ausgebaut.
7. **Gesetzes-Corpus:** 21 Gesetze DE/AT mit Versions-Stempel (eigener Ingestor, RIS-OGD-API).

### 2.3 Was SigmaBrain NOCH NICHT hat (vs. Subsumio)

| Subsumio-Claim | SigmaBrain-Status | Gap-Groesse |
|---|---|---|
| Kanzleiverwaltung (Mandanten, Akten, Abrechnung) | ❌ Kein Practice-Management | GROSS |
| Fristenberechnung (50 Rechtsrahmen) | 🟡 deadline-extract extrahiert, berechnet NICHT | MITTEL |
| Dokumentenerstellung (13 Vorlagen, Autopilot) | ❌ Kein Drafting | GROSS |
| Beweismittelverwaltung mit Staerke-Bewertung | ❌ Kein Evidence-Management | GROSS |
| Judikatur-Recherche (OGH, BGH, EGMR) | 🟡 Gesetze ja, Rechtsprechung nein | MITTEL |
| Word-Add-in | ❌ Nicht vorhanden | GROSS |
| Audit-Trail mit Hash-Kette | 🟡 Engine loggt, kein Tenant-UI/Export | MITTEL |

---

## Teil 3: Der entscheidende Vergleich

### 3.1 Ist Subsum.io nur ein Rebrand von SigmaBrain/gbrain?

**Nein. Absolut nicht.** Subsum.io ist ein vollstaendig eigenstaendiges Produkt mit einer radikal anderen Architektur und Philosophie.

| Aspekt | Subsum.io | SigmaBrain |
|---|---|---|
| **Philosophie** | Geschlossene All-in-One-Kanzleisoftware | Offene Knowledge-Engine + SaaS-Layer |
| **Backend-Zugang** | Blackbox, keine API, kein CLI | CLI + MCP + HTTP API + Admin-Panel |
| **Datenmodell** | Vermutlich traditionelle Kanzlei-Datenbank (Mandant-Akte-Dokument) | Graph + Pages + Chunks + Vectors (generisch) |
| **Open Source** | Nein | Ja (Engine + Skills) |
| **Self-Hosting** | Nein (behauptet Zero-Knowledge, aber Cloud-only) | Ja (PGLite zero-config) |
| **Deployment** | SaaS-only | SaaS + Self-Hosted + Hybrid |
| **Graph** | Unbekannt (wahrscheinlich keiner) | Selbstverdrahtender Typed-Edge-Graph |
| **Skills-System** | Unbekannt (wahrscheinlich hartkodierte Workflows) | 58+ Skills, RESOLVER.md, manifest.json |
| **Preis** | Unbekannt | 79 EUR/Monat (Pro) — transparent |

**Fazit:** Subsum.io baut wahrscheinlich eine **traditionelle Legal-Tech-SaaS** (Practice Management + LLM-Chat), waehrend SigmaBrain eine **Knowledge-Graph-Engine** mit Legal-Verticalisierung baut. Die Architekturen haben wenig gemein.

### 3.2 Hat Subsum.io ein BESSERES Backend?

**Wahrscheinlich nein — aber es hat ein ANDERES Backend, das fuer bestimmte Zwecke besser geeignet sein koennte:**

- **Fuer Kanzleiverwaltung:** Subsum.io hat vermutlich ein dediziertes Matter-Management-Backend (Aktenzeichen, Fristenkalender, Abrechnung). SigmaBrain hat das nicht.
- **Fuer Rechtsrecherche:** Subsum.io hat vermutlich direkte beck-online/RIS-Integration. SigmaBrain hat Gesetzestexte, aber keine Rechtsprechungsdatenbank.
- **Fuer Document Drafting:** Subsum.io hat Templates + Autopilot. SigmaBrain hat kein Drafting.
- **Fuer Knowledge-Synthese:** SigmaBrain ist vermutlich ueberlegen (Hybrid-RAG + Graph + Gap-Analyse). Subsum.io macht vermutlich Standard-RAG.
- **Fuer Sicherheit/Compliance:** SigmaBrain ist ueberlegen (Open Source, auditierbar, Self-Host moeglich). Subsum.io ist eine Blackbox.

---

## Teil 4: Wettbewerbslandschaft Legal AI (Juni 2026)

### 4.1 Harvey ($3B, OpenAI/Sequoia-backed)

**Positionierung:** Enterprise Legal AI fuer BigLaw
**Preis:** ~$1.000–1.200/Seat/Monat, 20–50 Seats Minimum = ~$240k–720k/Jahr
**Backend-Architektur (bekannt):**
- Eigenes Legal-LLM (auf Basis von OpenAI, aber fine-tuned)
- Forward Deployed Engineers (FDEs) — 6–9 Monate Deployment pro Kanzlei
- iManage/NetDocuments-Integration (DMS)
- Firm-spezifische Knowledge Bases (Precedent Libraries)
- LexisNexis-Partnerschaft

**Staerken:**
- Beste Rechtsrecherche (Vals-Benchmark Top-Werte)
- Document Drafting/Redlining auf Top-Niveau
- Deep BigLaw-Integration (DMS, Workflows)
- FDE-Modell schafft lock-in

**Schwaechen:**
- Kein Self-Host moeglich
- Closed Source
- Preislich unerreichlich fuer Mid-Market
- 6–9 Monate Deployment = keine schnelle Time-to-Value

### 4.2 Legora ($5.55B Bewertung, 100M$ ARR)

**Positionierung:** AI-powered Legal Workspace
**Preis:** Nicht oeffentlich (Enterprise-Sales)
**Features:**
- Tabular Review (strukturierte Grid-Analyse von Dokumenten-Sets)
- Workflows (visueller Builder, Klassifikation, Conditionals)
- Legal Research (zitierte Synthese)
- Portal (Kanzlei-Client-Kollaboration)
- Word/Outlook Add-Ins
- Monitors (Regulatorisches Tracking)
- Agent (Multi-step Execution)

**Staerken:**
- Tabular Review ist differenziert fuer Due Diligence
- Multilingual + EU-Compliance (ISO 42001, 27001, SOC 2, GDPR, BYOK)
- Word-Integration ist Killer-Feature fuer Transaktionsanwaelte

**Schwaechen:**
- Kein Self-Host
- Keine Preistransparenz
- Kein Open Source
- Vermutlich Standard-RAG ohne Graph

### 4.3 Beck-Noxtua (C.H.Beck + Noxtua)

**Positionierung:** Souveraener deutscher Legal-AI-Workspace
**Preis:** Nicht oeffentlich (Min. 3 Lizenzen)
**Architektur:**
- Eigenes deutsches Legal-LLM (auf beck-online-Content trainiert)
- IONOS/OTC-Hosting (EU-Souveraenitaet)
- beck-online-Content-Integration (exklusiv)
- Knowledge Graphs (angekuendigt)
- ISO 9001, 27001, 27017, 27018, BSI C5, ISO 42001, TISAX

**Staerken:**
- Exklusiver beck-online-Content (groesster Content-Moat in DACH)
- Echte EU-Souveraenitaet (IONOS, eigene Infrastruktur)
- Deutsche Qualitaetssicherung (C.H.Beck)
- Cross-Border-Lizenz (DACH, expanding)

**Schwaechen:**
- Kein Self-Host
- Kein Open Source
- Min. 3 Lizenzen = nicht fuer Solo-Anwaelte
- Keine eigenen Akten-Integration wie SigmaBrain

### 4.4 CoCounsel (Thomson Reuters)

**Positionierung:** Research + Workflows
**Preis:** ~$639/User/Monat (Solo, inkl. Westlaw)
**Staerken:**
- Beste Rechtsrecherche (Westlaw-Integration)
- Vals-Benchmark-Teilnahme
- Thomson-Reuters-Content

**Schwaechen:**
- Keine eigene Akten-Analyse
- US-zentriert
- Kein Self-Host

### 4.5 Luminance

**Positionierung:** M&A/Due Diligence
**Preis:** $50–100k+/Jahr
**Staerken:**
- **On-Premise moeglich!** (Das einzige Enterprise-Tool ausser SigmaBrain)
- Contract Analysis
- Closed Source, aber Self-Host moeglich

**Schwaechen:**
- Kein Open Source
- Fokus auf M&A/DD, nicht allgemeine Kanzlei
- Teuer

### 4.6 Spellbook

**Positionierung:** Vertrags-Review in Word
**Preis:** $99–199/User/Monat (Enterprise ~$350)
**Staerken:**
- Word-Add-in
- SMB-freundlich
- Contract-focused

**Schwaechen:**
- Keine Knowledge-Engine
- Nur Vertraege

---

## Teil 5: Die Goldene Loesung fuer SigmaBrain Legal

### 5.1 Strategic Assessment

**Was wir NICHT tun sollten:**
1. **Nicht Harvey jagen.** Wir haben nicht das Kapital fuer FDEs, nicht den Content-Moat von beck-online, nicht die Rechtsrecherche-Qualitaet.
2. **Nicht alles bauen.** Practice Management (Mandanten, Akten, Abrechnung) ist ein eigenes Produkt. Wir sollten es nicht selbst bauen.
3. **Nicht Drafting als Kern.** Drafting ist ein P3-Feature; Zitatpruefung gegen eigene Akten ist wichtiger.

**Was wir TUN sollten:**
1. **Das machen, was NIEMAND sonst macht:** Knowledge-Graph + Gap-Analyse + Self-Host + eigene Akten = unser alleiniges Terrain.
2. **Mid-Market Wedge:** Solo-Anwaelte und kleine Kanzleien (2–10 Anwaelte) — der Markt, den Harvey ignoriert und den Noxtua mit Mindestlizenz ausschliesst.
3. **Open Source als Vertrauensanker:** In DACH ist das der staerkste Differenzierer gegen US-Clouds.

### 5.2 Der Blueprint: SigmaBrain Legal Goldstandard

#### Ziel des Systems

Eine **"Company Brain fuer Kanzleien"** — nicht eine Kanzleisoftware, sondern die **intelligente Schicht UEBER den Akten**. Jede Kanzlei behaelt ihre bestehende Software (RA-Micro, Kanzleisoftware, DMS), aber SigmaBrain wird das Gehirn, das:
- Alle Akten durchsuchbar und vernetzt macht
- Widersprueche und Luecken findet
- Erfahrung aus vergangenen Faellen nutzt
- Mit oeffentlichem Rechtswissen (Gesetze, Urteile) verbindet

#### Kern-Userflows

**Flow A: Der Solo-Anwalt (Einstieg)**
1. Signup → Branche "Legal" vorausgewaehlt
2. Upload einer Akte (PDF/DOCX/EML)
3. Copilot-Analyse: Entitaeten, Fristen, Widersprueche extrahiert
4. Beispiel-Query: "Welche Fristen laufen in dieser Akte?"
5. Antwort mit Zitaten aus der eigenen Akte + Gesetzeszitaten

**Flow B: Die Kanzlei (Team)**
1. Team-Plan (5 Seats) kaufen
2. Org-Brain erstellen
3. Alle Anwaelte laden ein
4. Gemeinsame Akten-Source
5. Jeder Anwalt sieht nur seine Faelle, Partner sieht alles
6. Cross-Akten-Analyse: "Haben wir schonmal gegen diesen Gegner verhandelt?"

**Flow C: Der Power-User (Fortgeschritten)**
1. Gesetzes-Corpus als "mount" hinzufuegen (law-de, law-at)
2. Eigene Faellen + Gesetze gleichzeitig abfragen
3. Graph-View: Verbindungen zwischen Faellen, Parteien, Gerichten
4. Schema-Pack "gbrain-legal" fuer standardisierte Aktenstruktur

#### Alle UI-Elemente & Interaktionen

**Dashboard-Query-Seite:**
- Branchenspezifische Beispielfragen (legal: Widersprueche, Fristen, Gegner-Analyse)
- Zitat-Sprung-UI (1 Klick: Antwort → Fundstelle im Dokument) — **P1, noch nicht gebaut**
- Quellen-Panel (neben der Antwort, mit Seitenzahl/Paragraph)
- Gap-Warnung ("Hinweis: Diese Antwort deckt nicht ab: [Thema]")

**Upload-Seite:**
- Drag & Drop fuer PDF/DOCX/EML
- OCR-Indikator ("Scan erkannt — OCR wird angewendet")
- Quellenauswahl (Akte X, Akte Y, Allgemein)
- Tag-Vorschlag (auto-extrahiert)

**Brain-Seite:**
- Listenansicht aller Akten-Dokumente
- Filter nach Akte, Typ, Datum
- Search-in-Brain

**Graph-Seite:**
- Force-Directed-Graph von Entitaeten (Personen, Firmen, Gerichte, Gesetze)
- Zoom, Pan, Filter nach Edge-Type
- Klick auf Node → Detail-Panel
- **Neu fuer Legal:** Edge-Types: "represented_by", "opposing_party", "cited_in", "governed_by", "filed_at"

**Team-Seite:**
- Mitglieder-Liste mit Rollen (Member, Admin, Owner)
- Invite-Link (7-Tage-Token)
- Seat-Verwaltung (verbraucht/vorhanden)
- Org-Brain-Umschaltung

#### Datenmodell & State-Management

**Neue Entitaeten fuer Legal:**

```typescript
// Erweiterte Page-Types fuer Legal
interface LegalPage {
  slug: string;           // z.B. "cases/2026-001/memo-1"
  type: 'case' | 'document' | 'person' | 'company' | 'court' | 'statute' | 'deadline';
  title: string;
  content: string;         // Markdown mit Frontmatter
  frontmatter: {
    case_number?: string;
    client?: string;
    opposing_party?: string;
    court?: string;
    subject_matter?: string;
    deadlines?: Array<{ date: string; description: string; source: string }>;
    statutes_cited?: string[];
    case_value?: string;
    // ... je nach Schema-Pack
  };
  source_id: string;       // Tenant-Isolation
  tags: string[];
}

// Neue Link-Types fuer Legal
enum LegalLinkType {
  REPRESENTED_BY = 'represented_by',      // Fall -> Anwalt
  OPPOSING_PARTY = 'opposing_party',      // Fall -> Gegner
  CITED_IN = 'cited_in',                  // Gesetz/Urteil -> Fall
  GOVERNED_BY = 'governed_by',            // Fall -> Gesetz
  FILED_AT = 'filed_at',                  // Fall -> Gericht
  PRECEDENT_FOR = 'precedent_for',        // Fall -> Fall (eigene Praezedenz)
  DEADLINE_OF = 'deadline_of',            // Frist -> Fall
  EVIDENCE_FOR = 'evidence_for',          // Beweis -> Fall
}
```

**State-Management:**
- Engine-Layer: Source-Isolation per source_id (bereits implementiert)
- Org-Layer: org_id im User-Store (bereits implementiert)
- Dashboard-State: React + Server Components

#### Architektur-Entscheidungen

1. **KEIN Practice Management selbst bauen.** Stattdessen: API-Bruecken zu existierender Software (z.B. RA-Micro-Export, beA-Import).
2. **KEIN eigenes Legal-LLM.** Modell-agnostisch bleiben (OpenAI, Anthropic, Mistral, lokale Modelle) — das ist ein Feature, kein Mangel.
3. **Graph als Differenzierer ausbauen.** Legal-Link-Types implementieren und visualisieren.
4. **Gesetzes-Corpus als "mount" liefern.** Nicht selbst bauen, sondern als Service (law-de, law-at, law-eu).
5. **Zitat-Sprung als P1.** Vertrauens-Feature Nr. 1 fuer Anwaelte.

#### Edge-Cases & Fehlerszenarien

1. **Fristenberechnung:** NIE gesetzliche Fristen berechnen — nur verbatim extrahieren und zur Pruefung flaggen (bereits in deadline-extract implementiert).
2. **Gegner-Analyse:** NUR aus oeffentlichen Quellen + eigenen Faellen der Kanzlei — nie Cross-Tenant (bereits im Blueprint dokumentiert).
3. **Anonymizer:** HMAC = Pseudonymisierung (Art. 4 Nr. 5 DSGVO), nicht Anonymisierung — Doku korrigieren.
4. **Konnektoren-ACL:** Bis ACL-Vererbung geloest: Konnektoren nur in Single-User-Brains.
5. **Rechtsschluesse:** Output IMMER mit Disclaimer: "Dies ist ein Hilfsmittel, keine Rechtsberatung. Professionell verifizieren."

### 5.3 Feature-Prioritaeten fuer Legal

| Feature | Prio | Aufwand | Status | Kommentar |
|---|---|---|---|---|
| Zitat-Sprung-UI (1-Klick-Fundstelle) | P1 | 1 Session | ❌ | Vertrauens-Feature Nr. 1 |
| Legal-Link-Types im Graph | P1 | 1 Session | ❌ | Unser Differenzierer |
| Public-Law-Brain (mounts) | P1 | Teilweise | 🟡 | 21 Gesetze sind drin, Rechtsprechung fehlt |
| Usage-Meter im Dashboard | P1 | Teilweise | ✅ | Bereits gebaut |
| Team/Org + Invites | P0 | 1 Session | ✅ | Bereits gebaut |
| Schema-Pack gbrain-legal.yaml | P1 | Teilweise | 🟡 | Existiert, muss erweitert werden |
| Rechtsprechungs-Konnektor (RIS, openlegaldata) | P2 | 2 Sessions | ❌ | Wichtig fuer DACH-Differenzierung |
| Audit-Trail-UI + Export | P2 | 1 Session | 🟡 | Engine loggt, UI fehlt |
| Word-Add-in | P3 | 4+ Sessions | ❌ | Nach Traktion; grosse Plattform-Abhaengigkeit |
| Drafting/Redlining | P3 | NIE | ❌ | Bewusst nicht (siehe /compare) |
| Practice Management (Mandanten, Akten) | P3 | NIE | ❌ | Nicht unser Produkt |
| DMS-Integration (iManage, NetDocuments) | P2 | 3 Sessions | ❌ | Enterprise-Tier, nach Traktion |
| beA/e-Akte-Schnittstelle | P2 | 2 Sessions | ❌ | DACH-Differenzierer |

### 5.4 Positionierung gegenueber Konkurrenz

| Anbieter | SigmaBrain-Konter |
|---|---|
| Harvey (1.200$/Seat) | "Fuer 79 EUR bekommen Sie das Brain Ihrer Kanzlei — nicht das von Harvey" |
| Legora (kein Preis) | "Transparente Preise, kein Enterprise-Sales-Zwang, Self-Host moeglich" |
| Noxtua (Min. 3 Lizenzen) | "Solo-Anwaelte willkommen — ab 1 Seat" |
| CoCounsel (639$/Monat) | "Ihre eigenen Akten, nicht nur Westlaw" |
| Luminance (On-Premise) | "On-Premise UND Open Source — auditierbar statt nur verschlossen" |
| Subsum.io (Blackbox) | "Open Source + Self-Host — Sie sehen EXAKT, was mit Ihren Daten passiert" |

---

## Teil 6: Definition of Done (Legal-Vertical V2)

- [ ] Legal-Link-Types in Graph implementiert und visualisiert
- [ ] Zitat-Sprung-UI im Dashboard (Query → Dokument, 1 Klick)
- [ ] Schema-Pack gbrain-legal erweitert (Case, Deadline, Court, Statute, Evidence)
- [ ] Rechtsprechungs-Konnektor (mindestens RIS-OGD fuer AT, openlegaldata fuer DE)
- [ ] Legal-Brain-Subsystem auf Leitplanken geprueft (DSGVO, BRAO, § 203 StGB)
- [ ] Audit-Trail-UI im Dashboard (Tenant-gescopte Logs, CSV-Export)
- [ ] /subsumio Produktseite live (bereits ✅)
- [ ] Compare-Seite aktualisiert mit Subsumio (nach Markenrecherche)
- [ ] 10 echte Legal-Beta-Tester (Kanzleien) onboarded

---

## Anhang: Technische Details

### SigmaBrain Web-API Endpoints (web-api.ts)

```
GET  /api/stats              -- Tenant-gescopte Statistiken
GET  /api/search?q=...      -- Hybrid-Suche (Vector + BM25 + Graph)
POST /api/think             -- Streaming-Antwort mit Zitaten + Gaps
GET  /api/pages             -- Listenansicht ( tenant-gescopte )
GET  /api/pages/{slug}       -- Einzeldokument
GET  /api/graph              -- Graph-Daten (Nodes + Edges, tenant-gescopte)
GET  /api/queries/recent    -- Letzte Queries (nur default source)
POST /api/upload             -- Multipart-Upload (PDF/DOCX/EML/...)
```

**Multi-Tenant-Scoping:** Jeder Request traegt `x-sigmabrain-source` Header (vom Next.js-Proxy gesetzt, basierend auf der Session des Users). Die Engine filtert ALLE Queries mit `WHERE source_id = $X`. Kein Cross-Tenant-Leak moeglich.

### Harvey-Deployment-Modell (FDE)

Harvey's Erfolg basiert auf Forward Deployed Engineers, die 6–9 Monate IN der Kanzlei sitzen. Das skaliert nicht fuer Mid-Market. SigmaBrain's Gegenmodell: **Self-Service + Schema-Packs + Community-Skills** — die Kanzlei konfiguriert sich selbst.
