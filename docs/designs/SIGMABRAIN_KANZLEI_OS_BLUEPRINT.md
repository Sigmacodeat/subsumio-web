# SigmaBrain als Kanzlei-OS-Backend — Architektur-Blueprint

> **Stand:** 12. Juni 2026
> **Fragestellung:** Kann SigmaBrain als Backend fuer ein "Kanzlei OS" dienen, das die Features von Subsumio (und darueber hinaus) bietet?
> **Kurzantwort: JA — aber NICHT durch Integration mit Subsumio, sondern indem SigmaBrain selbst zum Kanzlei-OS wird.**

---

## 1. Die ehrliche Antwort auf deine Frage

### 1.1 Koennen wir Subsumio als Frontend nutzen? **NEIN.**

Subsum.io ist eine **komplette Blackbox**:
- Keine oeffentliche API
- Kein Open Source
- Kein MCP-Server
- Keine Dokumentation
- Kein Partnerprogramm fuer Backend-Integration

Es gibt keinen technischen Weg, SigmaBrain-Data in Subsumio oder Subsumio-Features in SigmaBrain zu integrieren. Subsumio bietet weder Webhooks, noch REST-API, noch OAuth, noch irgendeinen Integrationspunkt.

### 1.2 Koennen wir SigmaBrain selbst zum Kanzlei-OS machen? **JA — und das ist der bessere Weg.**

Statt ein fremdes, geschlossenes System anzubindhen, bauen wir **auf SigmaBrain's offener Architektur** ein Kanzlei-OS, das:
- Das ENGINE-Superior-Backend von SigmaBrain nutzt (Graph, Hybrid-RAG, Gap-Analyse)
- Die fehlenden Legal-Features ergaenzt (Fristen, Aktenverwaltung, Kanzleiwissen)
- Offen fuer Integrationen bleibt (beA, DATEV, DMS, Kanzleisoftware)
- Als SaaS UND Self-Hosted verfuegbar ist

---

## 2. Vision: "Sigmabrain Legal OS"

> **„Die Kanzleisoftware von morgen ist kein monolithisches Programm — sie ist ein Gehirn, das alle Tools verbindet."**

### 2.1 Was ist ein Kanzlei-OS?

Nicht EINE Software, die alles macht. Sondern eine **intelligente Schicht**, die:
1. **Eigene Akten** durchsucht und vernetzt (SigmaBrain Core)
2. **Oeffentliches Rechtswissen** einbindet (Gesetze, Urteile)
3. **Fristen und Termine** verwaltet (ohne sie zu berechnen — nur zu extrahieren und warnen)
4. **Mit bestehender Kanzleisoftware** kommuniziert (RA-Micro, Kanzlei-Programme)
5. **Das Wissen der Kanzlei** ueber Jahre aufbaut (Compounding Brain)

### 2.2 Warum SigmaBrain als Engine?

| Anforderung | SigmaBrain | Subsumio (Schaetzung) | Harvey | Noxtua |
|---|---|---|---|---|
| Eigene Akten durchsuchbar | ✅ Seitengenau | 🟡 Vermutlich ja | ✅ Ja | ❌ Nur Recherche |
| Graph-Verbindungen | ✅ Typed Edges | ❌ Wahrscheinlich nein | ❌ Nein | 🟡 Angekuendigt |
| Widerspruchs-Erkennung | ✅ Gap-Analyse | 🟡 Behauptet es | ❌ Nein | ❌ Nein |
| Open Source / Self-Host | ✅ Beides | ❌ Nein | ❌ Nein | ❌ Nein |
| Gesetzes-Corpus einbindbar | ✅ 21 Gesetze DE/AT | 🟡 Wahrscheinlich ja | ❌ US-zentriert | ✅ beck-online |
| API fuer Integrationen | ✅ MCP + REST | ❌ Keine | 🟡 Enterprise-API | 🟡 Wahrscheinlich |
| Kosten pro Anwalt/Monat | 79 € | Unbekannt | ~1.200 $ | Unbekannt |

**SigmaBrain ist die einzige Engine, die gleichzeitig: eigene Akten + Graph + Open Source + DACH-Fokus + erschwinglichen Preis bietet.**

---

## 3. Architektur: SigmaBrain Kanzlei-OS

### 3.1 Schichtenmodell

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: PRAESENTATION (Next.js Dashboard)                      │
│  ├─ Kanzlei-Dashboard (Akten, Fristen, Team)                    │
│  ├─ Query-Interface (Fragen an Akten + Recht)                  │
│  ├─ Graph-Visualisierung (Faellenetzwerk)                       │
│  ├─ Fristen-Timeline (Extrahiert aus Dokumenten)               │
│  ├─ Dokumenten-Upload (Drag & Drop, OCR)                        │
│  └─ Admin / Billing / Team-Verwaltung                           │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: APPLIKATION (SigmaBrain Engine + Legal-Layer)          │
│  ├─ BrainEngine (Hybrid-RAG, Graph, Multi-Tenant)              │
│  ├─ Legal-Brain-Subsystem (Case, Deadline, Court, Evidence)      │
│  ├─ Schema-Pack gbrain-legal (standardisierte Aktenstruktur)   │
│  ├─ deadline-extract Skill (Fristen-Extraktion, KEINE Berechnung)│
│  ├─ document-ingest (PDF/DOCX/EML/Audio)                        │
│  ├─ 9+ Konnektoren (Gmail, Drive, Calendar, Notion...)         │
│  └─ Gesetzes-Corpus (law-de, law-at als "mounts")              │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: INTEGRATION (Bruecken zu externer Software)            │
│  ├─ beA-Schnittstelle (elektronischer Rechtsverkehr DE)        │
│  ├─ DATEV-Export/Import (CSV/XML ueber Pipeline)                │
│  ├─ RA-Micro / Kanzleisoftware (API oder Export-Import)       │
│  ├─ DMS-Integration (iManage, NetDocuments — Enterprise)         │
│  ├─ Rechtsprechungs-APIs (RIS-OGD, openlegaldata, EUR-Lex)    │
│  └─ Kalender-Sync (Google/Outlook Calendar via Konnektor)      │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1: INFRASTRUKTUR (Hosting-Optionen)                       │
│  ├─ SaaS: EU-Cloud (Vercel + Postgres/Supabase)                │
│  ├─ Self-Hosted: Lokaler Server (PGLite oder Postgres)         │
│  └─ Hybrid: Engine lokal, Frontend gehostet                    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Datenmodell fuer Kanzlei-OS

```typescript
// ============================================
// KANZLEI-ENTITY-MODEL (Erweiterung von SigmaBrain Pages)
// ============================================

interface LegalCase {
  slug: 'cases/{year}-{number}';
  type: 'legal_case';
  title: string;
  frontmatter: {
    case_number: string;           // z.B. "2026-001"
    client: string;                // Verweis auf Person/Company Page
    opposing_party: string;        // Verweis auf Person/Company Page
    court: string;                 // Verweis auf Court Page
    judge?: string;
    subject_matter: string;        // Kurzbeschreibung
    legal_area: string;            // Zivilrecht, Strafrecht, Verwaltungsrecht...
    value_in_dispute?: string;     // Streitwert
    status: 'active' | 'pending' | 'closed' | 'appeal';
    
    // Verantwortlichkeiten
    responsible_attorney: string;  // Verweis auf Person Page (Anwalt)
    assisting_attorneys?: string[];
    
    // Fristen (werden von deadline-extract Skill befuellt)
    deadlines: Array<{
      id: string;
      date: string;                // ISO 8601
      description: string;         // z.B. "Klageerwiderung"
      source_document: string;     // Verweis auf Dokument-Slug
      status: 'pending' | 'warning' | 'overdue' | 'done';
      extracted_by: 'ai' | 'manual';
      verified_by?: string;        // Anwalt, der Frist verifiziert hat
    }>;
    
    // Gesetze und Urteile
    statutes_cited: string[];      // Verweise auf Statute Pages
    precedents_cited: string[];    // Verweise auf eigene Case Pages
    
    // Meta
    opened_at: string;
    closed_at?: string;
    billing_status?: 'open' | 'invoiced' | 'paid';
  };
}

interface Court {
  slug: 'courts/{name-slug}';
  type: 'court';
  title: string;
  frontmatter: {
    jurisdiction: 'at' | 'de' | 'eu';
    court_type: 'local' | 'regional' | 'appellate' | 'supreme' | 'constitutional';
    location: string;
    contact?: {
      address: string;
      phone?: string;
      email?: string;
    };
  };
}

interface Statute {
  slug: 'statutes/{abbreviation}';
  type: 'statute';
  title: string;
  frontmatter: {
    abbreviation: string;          // z.B. "ABGB", "BGB", "ZPO"
    full_name: string;
    jurisdiction: 'at' | 'de' | 'eu';
    version_date: string;          // Stand des Gesetzes
    source_url: string;            // RIS-Link oder gesetze-im-internet.de
    license: string;               // z.B. "§ 5 UrhG (gemeinfrei)"
  };
  // content: Die eigentlichen Paragraphen als Markdown
}

interface Evidence {
  slug: 'evidence/{case-number}/{evidence-id}';
  type: 'evidence';
  title: string;
  frontmatter: {
    case: string;                  // Verweis auf LegalCase
    evidence_type: 'document' | 'witness_testimony' | 'expert_opinion' | 'physical' | 'digital';
    source: string;                // Herkunft
    strength_rating?: 1 | 2 | 3 | 4 | 5;  // Bewertung durch Anwalt
    strengths?: string[];
    weaknesses?: string[];
    relevance: 'critical' | 'high' | 'medium' | 'low';
    obtained_at?: string;
  };
}

// ============================================
// GRAPH-LINK-TYPES (Neue Edge-Typen fuer Legal)
// ============================================

enum LegalEdgeType {
  // Akte-Beziehungen
  REPRESENTED_BY = 'represented_by',      // Case → Person (Anwalt)
  CLIENT_IS = 'client_is',                // Case → Person/Company
  OPPOSING_PARTY_IS = 'opposing_party_is', // Case → Person/Company
  FILED_AT = 'filed_at',                  // Case → Court
  GOVERNED_BY = 'governed_by',            // Case → Statute
  HAS_EVIDENCE = 'has_evidence',          // Case → Evidence
  HAS_DEADLINE = 'has_deadline',          // Case → Deadline (Timeline Entry)
  
  // Praezedenz
  PRECEDENT_FOR = 'precedent_for',        // Case → Case (eigene Praezedenz)
  SIMILAR_TO = 'similar_to',              // Case → Case (aehnliche Konstellation)
  
  // Recht
  CITES_STATUTE = 'cites_statute',        // Case → Statute
  CITES_PRECEDENT = 'cites_precedent',    // Case → Case (Urteil)
  INTERPRETS = 'interprets',              // Case → Statute (Gericht interpretiert Norm)
  
  // Personen
  WORKS_WITH = 'works_with',              // Person → Person (Anwaelteteam)
  OPPOSED = 'opposed',                    // Person → Person (Gegner in mehreren Faellen)
  ADVISED = 'advised',                    // Person → Company (Beratung)
}
```

---

## 4. Das Dashboard: Neue Seiten und Features

### 4.1 Bestehende SigmaBrain-Dashboard-Seiten (bereits gebaut)

| Seite | Status | Legal-Relevanz |
|---|---|---|
| /dashboard | ✅ | Uebersicht |
| /dashboard/query | ✅ | Fragen an Akten + Recht |
| /dashboard/brain | ✅ | Alle Dokumente durchsuchen |
| /dashboard/graph | ✅ | Verbindungs-Netzwerk |
| /dashboard/upload | ✅ | Dokumente hochladen |
| /dashboard/settings | ✅ | Konto, Referral, Plan |
| /dashboard/billing | ✅ | Abrechnung, Verbrauch |
| /dashboard/team | ✅ | Team-Verwaltung |

### 4.2 Neue Seiten fuer Kanzlei-OS

```
/dashboard/cases              -- NEU: Aktenverwaltung
/dashboard/cases/{slug}       -- NEU: Einzelakte mit Timeline
/dashboard/deadlines          -- NEU: Fristen-Timeline (alle Faellen)
/dashboard/deadlines/{id}     -- NEU: Einzelfrist-Detail
/dashboard/courts             -- NEU: Gerichtsverzeichnis
/dashboard/statutes          -- NEU: Gesetzesbibliothek (mounts)
/dashboard/evidence          -- NEU: Beweismittel-Register
/dashboard/connections       -- NEU: Externe Integrationen (beA, DATEV, DMS)
```

### 4.3 Case-Detail-Seite (Mockup-Struktur)

```tsx
// /dashboard/cases/{slug} Seitenstruktur

<CaseLayout>
  <CaseHeader 
    title="Musterfall GmbH vs. Schuldner AG"
    caseNumber="2026-001"
    status="active"
    court="LG Wien"
    responsibleAttorney="Dr. Max Mustermann"
  />
  
  <TabView tabs={['Uebersicht', 'Dokumente', 'Fristen', 'Graph', 'Beweismittel']}>
    
    <Tab name="Uebersicht">
      <CaseMetaCard 
        client="Musterfall GmbH"
        opposingParty="Schuldner AG"
        valueInDispute="EUR 150.000"
        legalArea="Zivilrecht — Vertragsrecht"
      />
      <QuickActions 
        actions={['Neues Dokument', 'Frist hinzufuegen', 'Query an Akte']}
      />
    </Tab>
    
    <Tab name="Dokumente">
      <DocumentList 
        documents={caseDocuments}
        sortable
        filterableByType
      />
    </Tab>
    
    <Tab name="Fristen">
      <DeadlineTimeline 
        deadlines={caseDeadlines}
        showWarnings={true}  // Amber bei < 7 Tage, Rot bei < 3 Tage
        allowVerify={true}  // Anwalt klickt "Verifiziert"
      />
    </Tab>
    
    <Tab name="Graph">
      <CaseGraph 
        rootNode={caseSlug}
        depth={2}
        edgeTypes={['represented_by', 'client_is', 'opposing_party_is', 'filed_at', 'governed_by']}
      />
    </Tab>
    
    <Tab name="Beweismittel">
      <EvidenceBoard 
        evidence={caseEvidence}
        sortableByStrength
        filterableByType
      />
    </Tab>
    
  </TabView>
</CaseLayout>
```

### 4.4 Fristen-Timeline (Dashboard-Uebersicht)

```tsx
// /dashboard/deadlines

<DeadlinesDashboard>
  <FilterBar 
    options={['Alle', 'Heute', 'Diese Woche', 'Dieser Monat', 'Ueberfaellig']}
  />
  
  <DeadlineList>
    {deadlines.map(d => (
      <DeadlineCard 
        key={d.id}
        date={d.date}
        description={d.description}
        case={d.case}
        status={d.status}
        warningLevel={getWarningLevel(d.date)}  // green | amber | red
        extractedBy={d.extractedBy}
        verifiedBy={d.verifiedBy}
        onVerify={() => verifyDeadline(d.id)}
      />
    ))}
  </DeadlineList>
  
  <CalendarView 
    mode="month"
    events={deadlines}
  />
</DeadlinesDashboard>
```

---

## 5. Skills und Automatisierung

### 5.1 Neue Skills fuer Kanzlei-OS

```yaml
# skills/case-ingest/
# Automatische Aktenstruktur beim Upload

Beschreibung: Beim Upload eines Dokuments erkennt der Skill:
- Gehoert das Dokument zu einer bestehenden Akte?
- Ist es ein neuer Fall?
- Extrahiere Entitaeten (Parteien, Gericht, Betreff)
- Schlage Aktenstruktur vor

# skills/deadline-extract/ (Bereits gebaut, erweitern)
# Fristen-Extraktion aus Dokumenten

Regeln:
  - Extrahiere ALLE datumsbezogenen Aussagen
  - Klassifiziere: Frist, Termin, optionales Datum
  - Berechne KEINE gesetzlichen Fristen
  - Flagge: "Vom AI extrahiert — bitte verifizieren"
  - Anwalt muss explizit auf "Verifiziert" klicken

# skills/evidence-analysis/
# Beweismittel-Staerke-Analyse

Beschreibung: Analysiere Beweismittel und bewerte:
- Relevanz fuer den Fall
- Widersprueche zu anderen Beweismitteln
- Fehlende Beweise (Gap-Analyse)
- Hinweis: KEINE Rechtsbewertung, nur strukturierte Analyse

# skills/opposing-party-research/
# Gegner-Analyse (aus oeffentlichen Quellen)

Regeln:
  - NUR oeffentliche Quellen (Firmenbuch, Urteilsdatenbanken)
  - NUR eigene Faellen der Kanzlei (source_id-gescopte)
  - KEINE Cross-Tenant-Analyse
  - KEINE autoritativen Schluesse
  - Disclaimer auf jedem Output

# skills/statute-lookup/
# Gesetzeszitate mit Kontext

Beschreibung: Bei Erwaehnung eines Paragraphen:
- Zeige den aktuellen Gesetzestext (aus law-de/law-at mount)
- Zeige den Stand (Versionsdatum)
- Verlinke relevante eigene Faellen, die dieselbe Norm zitieren
```

### 5.2 Automatisierungen (Dream Cycle Erweiterung)

```
Cron (taeglich, 06:00):
  1. deadline-check: Pruefe alle pending Deadlines
     - < 7 Tage → Warning-Benachrichtigung
     - < 3 Tage → Critical-Benachrichtigung
     - Ueberfaellig → Alert an responsible_attorney
  
  2. case-consolidation: Suche nach neuen Verbindungen
     - Neue Faellen mit gleichem Gegner?
     - Neue Faellen vor gleichem Gericht?
     - Neue Faellen mit gleicher Norm?
  
  3. statute-update: Pruefe Gesetzes-Corpus
     - Neue Fassungen seit letztem Import?
     - Alert bei relevanten Aenderungen fuer aktive Faellen
```

---

## 6. Integrationen (Layer 2)

### 6.1 beA (elektronischer Rechtsverkehr Deutschland)

```typescript
// Integration ueber beA-Webservice oder Export-Import

interface BeaIntegration {
  // V1: Export-Import (sicher, kein Live-API noetig)
  importBeaMessages: (xmlExport: string) => Promise<ImportedMessage[]>;
  // Konvertiert beA-Nachrichten zu SigmaBrain-EML-Dokumenten
  
  // V2 (spaeter): Live-Schnittstelle
  syncBeaInbox: () => Promise<void>;
  // Nutzt beA-Webservice (Zertifikat-basiert)
}
```

### 6.2 DATEV (Steuerberater-Vertikale)

```typescript
// Integration ueber DATEV-Export (CSV/XML)

interface DatevIntegration {
  importDatevExport: (csvFile: Buffer) => Promise<Client[]>;
  // Liest DATEV-Mandantenliste und erstellt SigmaBrain-Pages
  
  exportForDatev: (caseSlug: string) => Promise<Buffer>;
  // Exportiert Fall-Daten im DATEV-kompatiblen Format
}
```

### 6.3 RA-Micro / Kanzleisoftware

```typescript
// V1: Datei-basiert (sicherste Option)
interface KanzleiSoftwareIntegration {
  importAkten: (exportFile: Buffer) => Promise<LegalCase[]>;
  exportAkten: (caseSlugs: string[]) => Promise<Buffer>;
}
```

### 6.4 Rechtsprechungs-APIs

```typescript
interface RechtsprechungConnector {
  // Oesterreich: RIS-OGD-API
  searchRisJudgements: (query: string) => Promise<Judgement[]>;
  
  // Deutschland: openlegaldata.io
  searchOpenLegalData: (query: string) => Promise<Judgement[]>;
  
  // EU: EUR-Lex
  searchEurLex: (query: string) => Promise<EuDocument[]>;
}
```

---

## 7. Security & Compliance (Kanzlei-tauglich)

### 7.1 Datenschutz

| Anforderung | Umsetzung |
|---|---|
| DSGVO-Konformitaet | ✅ Hosting EU, keine Datenweitergabe |
| AVV (Auftragsverarbeitung) | ✅ Template vorhanden, anwaltlich pruefen |
| § 203 StGB (Verschwiegenheit) | ✅ Self-Host umgeht strukturell |
| Pseudonymisierung | ✅ HMAC-basiert (nicht Anonymisierung!) |
| Kein Training auf Kundendaten | ✅ Engine speichert lokal, keine Weitergabe |

### 7.2 Audit-Trail

```typescript
interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  orgId: string;
  action: 'view' | 'edit' | 'delete' | 'export' | 'query';
  resourceType: 'case' | 'document' | 'deadline' | 'evidence';
  resourceSlug: string;
  details: Record<string, unknown>;
  hash: string;  // Kryptographische Hash-Kette
}
```

### 7.3 Rollen und Berechtigungen

```typescript
enum LegalRole {
  OWNER = 'owner',           // Alles, inkl. Billing, Team-Verwaltung
  ADMIN = 'admin',           // Alles ausser Billing
  ATTORNEY = 'attorney',     // Eigene Faellen + zugewiesene
  PARALEGAL = 'paralegal',   // Lesen + Dokumente hochladen
  INTERN = 'intern',         // Lesen (eingeschraenkt)
  CLIENT = 'client',         // Nur eigene Faellen (read-only, Portal)
}
```

---

## 8. Roadmap: Von Heute zum Kanzlei-OS

### Phase 1: Foundation (bereits gebaut ✅)
- ✅ Engine (Hybrid-RAG, Graph, Multi-Tenant)
- ✅ Auth + Billing + Team
- ✅ Dokument-Pipeline (PDF/DOCX/EML)
- ✅ Gesetzes-Corpus (21 Gesetze)
- ✅ Marketing + Dashboard-Grundgeruest

### Phase 2: Legal-Core (naechste 2–4 Wochen)
- [ ] Case-Entity + Case-Seite
- [ ] Legal-Link-Types im Graph
- [ ] Zitat-Sprung-UI (Query → Dokument)
- [ ] deadline-extract Erweiterung (Verifikations-Flow)
- [ ] Fristen-Timeline-Seite
- [ ] Schema-Pack gbrain-legal V2

### Phase 3: Integrationen (naechste 2–3 Monate)
- [ ] beA-Import (V1: Datei-basiert)
- [ ] Rechtsprechungs-Konnektor (RIS, openlegaldata)
- [ ] Kalender-Sync (Google/Outlook)
- [ ] DATEV-Export/Import (Steuer-Vertikale)

### Phase 4: Advanced (nach Traktion)
- [ ] DMS-Integration (iManage, NetDocuments)
- [ ] Word-Add-in (nach Markenrecherche)
- [ ] Client-Portal (aehnlich Legora Portal)
- [ ] Audit-Trail mit Hash-Kette

---

## 9. Warum das funktioniert (und Subsumio nicht integrierbar ist)

### 9.1 Das Problem mit "Subsumio als Frontend"

```
SigmaBrain Backend ----X----> Subsumio Frontend
                             (Keine API, keine Integration)
```

**Moegliche Workarounds (alle schlecht):**
1. **Screen-Scraping** → Illegal (ToS-Verstoss), instabil, unzuverlaessig
2. **Reverse-Engineering** → Illegal, zerstoert bei jedem Update
3. **Partnerschaft anfragen** → Subsumio hat kein Partnerprogramm fuer Backend-Integration

### 9.2 Die richtige Architektur

```
SigmaBrain Engine (Offen, API, MCP)
         ↕
SigmaBrain Dashboard (Next.js, anpassbar)
         ↕
Kanzlei-User (Anwalt, Paralegal, Client)
```

**Vorteile:**
- Ein Codebase, eine Datenquelle
- Jede Integration ist moeglich (beA, DATEV, DMS)
- Self-Hosted verfuegbar
- Keine Abhaengigkeit von Drittanbietern
- Kostenkontrolle (79 €/Monat vs. unbekannte Subsumio-Preise)

---

## 10. Zusammenfassung

| Frage | Antwort |
|---|---|
| Kann SigmaBrain Subsumio-Features nutzen? | **Nein** — Subsumio hat keine API |
| Kann SigmaBrain SELBST zum Kanzlei-OS werden? | **Ja** — und das ist der bessere Weg |
| Was fehlt dafuer? | Case-Management, Fristen-UI, Zitat-Sprung, Legal-Link-Types |
| Wie lange dauert das? | Legal-Core = 2–4 Wochen; Vollstaendiges Kanzlei-OS = 2–3 Monate |
| Was ist der Vorteil gegenueber Subsumio? | Open Source, Self-Host, Graph-Engine, erschwinglich |
| Was ist der Vorteil gegenueber Harvey? | Mid-Market, keine 6-Monate-Deployment, DACH-Fokus |

---

**Empfohlene naechste Schritte:**
1. Case-Entity und Case-Seite bauen (1 Session)
2. Legal-Link-Types im Graph implementieren (1 Session)
3. Zitat-Sprung-UI im Query-Interface (1 Session)
4. Fristen-Timeline-Seite (1 Session)

**Das Ergebnis:** Ein Kanzlei-OS, das technisch ueberlegen ist (Graph + Hybrid-RAG), aber einfach und erschwinglich bleibt (79 €). Nicht durch Integration mit geschlossenen Systemen, sondern durch **Offenheit und eigene Staerke.**
