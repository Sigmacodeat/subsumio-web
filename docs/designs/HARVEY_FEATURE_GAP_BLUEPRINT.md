# Harvey Feature-Gap Blueprint — SigmaBrain Kanzlei OS

## Harvey's Kern-Features (recherchiert)

| Feature | Beschreibung | Preis-Impact |
|---------|-------------|--------------|
| **Assistant** | Globaler KI-Chat mit Dokumenten-Analyse, Drafting, Source Citations | Core |
| **Vault** | Zentraler Dokumentenspeicher, Bulk-Analyse, Review Tables, DMS-Integration | Core |
| **Workflow Agents** | Automatisierte Multi-Step-Workflows (Due Diligence, Litigation Prep) | Premium |
| **Contract Intelligence** | Spezialisierter Contract Review, Klausel-Extraktion, Redline/Diff | Premium |
| **Knowledge** | Legal Research über Multi-Domain mit Zitation | Core |
| **Ecosystem** | Word, Outlook, iManage, NetDocuments, SharePoint, Google Drive | Enterprise |
| **Shared Spaces** | Kollaboration zwischen Firmen und Clients | Premium |
| **Mobile App** | iOS/Android App | Nice-to-have |

## SigmaBrain Status

| Feature | Status | Gap |
|---------|--------|-----|
| **Assistant** | Pro-Case Chat existiert (`/dashboard/cases/[slug]`) | Kein globaler Assistent, kein Dokumenten-Upload im Chat |
| **Vault** | Dokumente pro Case | Kein zentraler Vault, keine Bulk-Analyse |
| **Workflow Agents** | Agents-Seite existiert (`/dashboard/agents`) | Keine pre-built Legal-Workflows (Due Diligence, Contract Review) |
| **Contract Intelligence** | Backend-Skill existiert, `tabularReview` API existiert | Keine dedizierte UI |
| **Knowledge** | Legal Researcher Minion existiert, `judgements-sync` existiert | Kein dediziertes Research-Interface |
| **Ecosystem** | Word Add-in existiert | Keine Outlook/iManage/SharePoint Integration |
| **Shared Spaces** | Mandantenportal existiert | Keine Kollaboration zwischen Firmen |
| **Mobile App** | Capacitor-Config existiert | Status unklar |

## Implementierungsplan

### Phase 1: Contract Intelligence UI (Schnellster Win — Backend vorhanden)
- **Ziel:** `/dashboard/contracts` — dedizierte Contract Review Seite
- **Komponenten:**
  - Vertrags-Upload (PDF/DOCX → Text-Extraktion)
  - Vertrags-Liste mit Risk-Score-Badge
  - Contract Analysis View: Klausel-Matrix, Red Flags, Empfehlungen
  - Review Table: `api.legal.tabularReview` für Bulk-Vergleich
- **Backend:** Nutzt existierenden `contract-analysis` Skill via `api.query.think`
- **ETA:** 2–3h

### Phase 2: Document Vault
- **Ziel:** `/dashboard/vault` — zentraler Dokumentenspeicher
- **Komponenten:**
  - Alle Dokumente aus allen Cases aggregieren
  - Bulk-Upload
  - Bulk-Analyse (alle Dokumente auf einmal analysieren)
  - Review Tables für Dokumenten-Vergleich
  - DMS-ähnliche Ordner/Tags
- **ETA:** 3–4h

### Phase 3: Global Assistant
- **Ziel:** `/dashboard/assistant` — globaler KI-Chat
- **Komponenten:**
  - Chat-Interface wie in Case Detail, aber global
  - Dokumenten-Upload im Chat
  - Context-Aware: Kann auf Vault, Cases, Contacts zugreifen
  - History
- **ETA:** 2–3h

### Phase 4: Workflow Agents (Legal Workflows)
- **Ziel:** `/dashboard/agents` erweitern mit pre-built Legal Workflows
- **Komponenten:**
  - Due Diligence Agent
  - Contract Review Agent
  - Litigation Prep Agent
  - Firm Style Guide Agent
- **ETA:** 4–5h

### Phase 5: Knowledge Research UI
- **Ziel:** `/dashboard/research` — dediziertes Legal Research Interface
- **Komponenten:**
  - Rechtsfrage eingeben → KI recherchiert mit Zitation
  - Rechtsprechungs-Suche
  - Gesetzes-Suche (AT/DE/CH)
  - Ergebnisse als Brain-Page speichern
- **ETA:** 2–3h

### Phase 6: Integrationen (Post-MVP)
- Outlook/beA Email-Import
- iManage/NetDocuments Konnektoren
- SharePoint/Google Drive Sync
- Mobile App Polish
- **ETA:** 1–2 Wochen

## Priorisierung nach Business-Impact

1. **Contract Intelligence** → Sofortiger Wow-Effekt für Anwälte
2. **Document Vault** → Zentrale Dokumentenverwaltung
3. **Global Assistant** → Produktivitäts-Steigerung
4. **Workflow Agents** → Automatisierung
5. **Knowledge Research** → Recherche-Effizienz
6. **Integrationen** → Enterprise-Readiness
