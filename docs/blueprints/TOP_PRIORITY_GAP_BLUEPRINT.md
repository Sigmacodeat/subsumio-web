# Blueprint: Top-Priority Gap Implementations (P0-Code + P1-Code)

**Stand:** 2026-06-28
**Bezug:** `docs/blueprints/HARVEY_GAP_ANALYSIS.md` — GAP-04, GAP-05, GAP-06, GAP-07, GAP-08, GAP-09, GAP-10, GAP-11, GAP-12

---

## Ziel des Systems

Schließt die 9 code-implementierbaren P0+P1 Gaps aus der Harvey Gap-Analyse. Nach Implementierung erreicht Subsumio **~90% Harvey-Parität** (verblebend: nur externe Zertifizierungen + P2/P3).

---

## Arbeitspakete

### Paket 1: GAP-04 — Iterative Agentic Search (P0, 2–3 Tage)

**Ziel:** Specialists suchen iterativ — nicht nur ein Pass, sondern Search → Evaluate → Refine → Re-Search bis ausreichend Kontext.

**Betroffene Dateien:**

- `server/src/core/minions/specialist-defs.ts` — Specialist system prompts erweitern
- `server/src/core/minions/handlers/subagent.ts` — Search-Loop-Logic im Tool-Handler
- `server/src/core/minions/tools/brain-tools.ts` — `search` Tool um `refine_query` Parameter erweitern

**Implementierung:**

1. **System Prompt Erweiterung** (`specialist-defs.ts`):
   - Allen 5 Specialists wird folgender Block hinzugefügt:

   ```
   ITERATIVE SEARCH PROTOCOL:
   - Wenn deine erste Suche nicht genug Ergebnisse liefert, VERFEINERE die Query.
   - Nutze synonyme Begriffe, andere Rechtsgebiete, oder englische Keywords.
   - Führe maximal 3 Such-Iterationen durch, bevor du mit dem besten verfügbaren Kontext antwortest.
   - Nach jeder Suche: Bewerte — sind die Treffer relevant? Wenn <3 relevante Treffer, verfeinere.
   - Dokumentiere deine Such-Strategie am Ende der Antwort.
   ```

2. **Search-Loop im Subagent Handler** (`subagent.ts`):
   - Nach jedem `search` Tool-Call wird das Ergebnis evaluiert
   - Wenn `results.length < 3` UND `turns_remaining > 5`, wird automatisch eine Follow-up-Search mit verfeinerter Query getriggert
   - Implementation als Post-Tool-Hook im Anthropic-Loop

3. **`refine_query` Parameter** (`brain-tools.ts`):
   - `search` Tool bekommt optionalen `refine_query: boolean` Parameter
   - Wenn `true`, gibt das Tool zusätzlich zur normalen Suche auch "related concepts" zurück
   - Diese werden dem LLM als Vorschlag für die nächste Iteration präsentiert

**Akzeptanzkriterien:**

- [ ] Specialists führen 2–3 Such-Iterationen durch bei unzureichenden Ergebnissen
- [ ] Such-Strategie wird in der Antwort dokumentiert
- [ ] maxTurns wird nicht überschritten
- [ ] Bestehende Tests bleiben grün

---

### Paket 2: GAP-05 — Legal Data Sources Connector Framework (P0, 5–10 Tage)

**Ziel:** Strukturiertes Connector-Framework für externe Rechtsdatenbanken (Beck-Online, LexisNexis, Juris, RIS Direkt-API). Ersetzt ad-hoc Perplexity-Calls durch kuratierte, zitierfähige Quellen.

**Betroffene Dateien:**

- `server/src/core/legal/knowledge-sources.ts` — Bestehenden RIS-Connector refactoren zum Connector-Framework
- `server/src/core/legal/data-source-connectors/` — NEU: Connector-Verzeichnis
- `server/src/core/legal/data-source-connectors/base.ts` — NEU: Abstract Connector Interface
- `server/src/core/legal/data-source-connectors/ris-direct.ts` — NEU: RIS Direkt-API (Österreich)
- `server/src/core/legal/data-source-connectors/beck-online.ts` — NEU: Beck-Online API (Deutschland)
- `server/src/core/legal/data-source-connectors/juris.ts` — NEU: Juris API (Deutschland)
- `server/src/core/legal/data-source-connectors/swiss-judgements.ts` — NEU: BGE/Swiss Law API
- `server/src/core/legal/data-source-registry.ts` — NEU: Registry für alle Connectors
- `src/app/api/legal/knowledge-sources/route.ts` — Erweitern um Multi-Source-Query

**Implementierung:**

1. **Base Connector Interface** (`base.ts`):

   ```typescript
   export interface LegalDataSourceConnector {
     name: string; // "ris-at", "beck-online", "juris-de"
     jurisdiction: "at" | "de" | "ch" | "eu";
     contentTypes: ("statute" | "case_law" | "commentary" | "journal")[];
     requiresApiKey: boolean;
     search(query: SourceSearchQuery): Promise<SourceSearchResult[]>;
     getDocument(id: string): Promise<SourceDocument | null>;
     healthCheck(): Promise<boolean>;
   }
   ```

2. **RIS Direkt-API Connector** (`ris-direct.ts`):
   - Nutzt die öffentliche RIS JSON-API (https://www.ris.bka.gv.at/Bundesrecht/)
   - Endpunkte: `/Bundesrecht/Suche`, `/Bundesrecht/Dokument/{doknr}`
   - Kein API-Key erforderlich (öffentliche API)
   - Caching: 24h für Gesetze, 1h für Judikatur
   - Rate-Limit: 10 req/s

3. **Beck-Online Connector** (`beck-online.ts`):
   - Beck-Online API (falls verfügbar) oder Beck-Community Scraper mit Cache
   - ContentTypes: commentary, journal, case_law
   - API-Key via `BECK_ONLINE_API_KEY` env var
   - Fallback: Beck-Blog RSS für aktuelle Urteile ohne API-Key

4. **Juris Connector** (`juris.ts`):
   - Juris API (https://www.juris.de/api)
   - ContentTypes: case_law, statute
   - API-Key via `JURIS_API_KEY` env var

5. **Swiss Judgements Connector** (`swiss-judgements.ts`):
   - BGE (Bundesgerichtsentscheide) via https://www.bger.ch API
   - ContentTypes: case_law
   - Kein API-Key erforderlich

6. **Registry & Multi-Source-Query** (`data-source-registry.ts`):

   ```typescript
   export class DataSourceRegistry {
     private connectors: Map<string, LegalDataSourceConnector>;
     register(connector: LegalDataSourceConnector): void;
     async searchAll(
       query: string,
       opts?: {
         jurisdiction?: "at" | "de" | "ch" | "eu" | "all";
         contentTypes?: string[];
         limit?: number;
       }
     ): Promise<AggregatedSearchResult>;
   }
   ```

7. **API Route Erweiterung** (`knowledge-sources/route.ts`):
   - `POST /api/legal/knowledge-sources` akzeptiert `query`, `jurisdiction`, `contentTypes`
   - Aggregiert Ergebnisse aller registrierten Connectors
   - Dedupliziert nach Titel + Datum
   - Gibt `source`-Feld zurück (z.B. "ris-at", "beck-online")

**Akzeptanzkriterien:**

- [ ] RIS Direkt-API Connector funktioniert ohne API-Key
- [ ] Connector-Registry lädt alle verfügbaren Connectors beim Start
- [ ] Multi-Source-Query aggregiert und dedupliziert
- [ ] Graceful Degradation: Wenn ein Connector fehlschlägt, laufen die anderen weiter
- [ ] Health-Check-Endpoint: `GET /api/legal/knowledge-sources/health`
- [ ] Bestehende Tests bleiben grün

---

### Paket 3: GAP-06 — SharePoint Production-Ready (P1, 3–5 Tage)

**Ziel:** SharePoint-Connector von `beta` → `production`. Tenant-Consent-Flow, Webhook-Erneuerung, E2E-Tests.

**Betroffene Dateien:**

- `server/src/core/ingestion/connectors/microsoft-365.ts` — SharePoint Connector erweitern
- `src/lib/connector-coverage.ts` — Status von `beta` → `production` ändern
- `src/app/api/connectors/sharepoint/consent/route.ts` — NEU: Tenant-Consent-Flow
- `src/app/api/connectors/sharepoint/webhook/route.ts` — NEU: Webhook-Registration + Renewal

**Implementierung:**

1. **Tenant-Consent-Flow** (`consent/route.ts`):
   - `GET /api/connectors/sharepoint/consent` — Redirect zu Microsoft Admin-Consent-URL
   - `GET /api/connectors/sharepoint/consent/callback` — Verarbeitet Admin-Consent-Callback
   - Speichert `tenant_id` + `refresh_token` in Connector-Config
   - Fordert `Sites.Read.All` + `Files.Read.All` Scopes an

2. **Webhook-Registration** (`webhook/route.ts`):
   - `POST /api/connectors/sharepoint/webhook` — Registriert Subscription bei Microsoft Graph
   - `POST /api/connectors/sharepoint/webhook/renew` — Erneuert ablaufende Subscriptions (24h vor Ablauf)
   - `POST /api/connectors/sharepoint/webhook/notify` — Empfangs-Endpoint für Microsoft-Notifications
   - Subscription-Lifetime: 3 Tage (Microsoft-Max), Auto-Renewal alle 2,5 Tage

3. **Delta-Sync Verbesserung** (`microsoft-365.ts`):
   - SharePoint-Connector nutzt bereits Delta-Link — wird um Webhook-Trigger ergänzt
   - Bei Webhook-Notification: Delta-Sync mit gespeichertem Delta-Link
   - Bei fehlendem Delta-Link: Full-Scan + neuer Delta-Link

4. **E2E Tests** (`tests/e2e-playwright/sharepoint-connector.spec.ts`):
   - Mock-Microsoft-Graph-Responses
   - Test: Consent-Flow → Webhook-Registration → Delta-Sync → Notification → Incremental-Sync

5. **Connector-Coverage Update** (`connector-coverage.ts`):
   - SharePoint: `status: "beta"` → `status: "production"`
   - Hinweise zu Tenant-Consent und Webhook hinzufügen

**Akzeptanzkriterien:**

- [ ] Admin-Consent-Flow funktioniert end-to-end
- [ ] Webhook-Registration + Auto-Renewal implementiert
- [ ] Delta-Sync wird durch Webhook-Notifications getriggert
- [ ] E2E-Test mit Mock-Graph-Responses besteht
- [ ] Connector-Status auf `production` gesetzt

---

### Paket 4: GAP-07 — Auto-Playbook Cron (P1, 1–2 Tage)

**Ziel:** Automatisierter Cron-Job, der ausgeführte Verträge (`frontmatter.status = "executed"`) scannt und Playbook-Updates staged.

**Betroffene Dateien:**

- `server/src/core/legal/auto-playbook-cron.ts` — NEU: Cron-Job-Logic
- `server/src/commands/web-api.ts` — Cron-Endpoint registrieren
- `src/app/api/legal/auto-playbook/cron/route.ts` — NEU: HTTP-Trigger für Cron (Vercel Cron / External Scheduler)

**Implementierung:**

1. **Cron-Job-Logic** (`auto-playbook-cron.ts`):

   ```typescript
   export async function runAutoPlaybookCron(
     engine: BrainEngine,
     opts?: {
       sourceId?: string;
       limit?: number; // Default: 10 Verträge pro Run
     }
   ): Promise<CronResult> {
     // 1. Finde alle Pages mit frontmatter.status = "executed" und
     //    frontmatter.auto_playbook_processed != true
     // 2. Für jeden Vertrag: rufe autoPlaybookUpdate() auf (auto_apply = false)
     // 3. Markiere frontmatter.auto_playbook_processed = true + timestamp
     // 4. Return Summary: processed, staged, errors
   }
   ```

2. **HTTP-Trigger** (`auto-playbook/cron/route.ts`):
   - `POST /api/legal/auto-playbook/cron` — Geschützt via `CRON_SECRET` env var
   - Rate-Limited: max 1 Call pro Stunde
   - Return: `{ processed: number, staged: number, errors: string[] }`

3. **Vercel Cron Konfiguration** (`vercel.json` oder `next.config.ts`):
   - Schedule: `0 */6 * * *` (alle 6 Stunden)
   - Endpoint: `/api/legal/auto-playbook/cron`

4. **Dashboard Notification**:
   - Bei neuen staged Updates: Toast-Notification im Dashboard
   - Badge im Playbooks-Nav-Item: "N Updates ausstehend"

**Akzeptanzkriterien:**

- [ ] Cron-Job findet `executed`-Verträge und staged Playbook-Updates
- [ ] `auto_playbook_processed` Flag verhindert Doppelverarbeitung
- [ ] HTTP-Trigger via `CRON_SECRET` geschützt
- [ ] Dashboard zeigt ausstehende Updates an
- [ ] Bestehende Auto-Playbook-API bleibt funktionsfähig

---

### Paket 5: GAP-08 — Guided Onboarding Tour (P1, 2–3 Tage)

**Ziel:** Step-by-Step UI-Tour durch das Dashboard nach Onboarding-Wizard. Tooltips, Highlights, Progress-Tracking.

**Betroffene Dateien:**

- `src/components/onboarding/guided-tour.tsx` — NEU: Tour-Component
- `src/components/onboarding/tour-steps.ts` — NEU: Step-Definitionen
- `src/app/dashboard/layout.tsx` — Tour-Provider einbinden
- `src/lib/queries/settings.ts` — Tour-Progress-State (localStorage + API)

**Implementierung:**

1. **Tour-Component** (`guided-tour.tsx`):
   - React-Komponente mit Portal-basierten Tooltips
   - Highlight-Overlay (dimmed background + spotlight auf Target-Element)
   - Navigation: Next / Back / Skip / Replay
   - Progress-Bar am unteren Rand
   - Keyboard-Navigation: Arrow-Left/Right, Escape zum Skip
   - Mobile: Bottom-Sheet statt Tooltip

2. **Step-Definitionen** (`tour-steps.ts`):

   ```typescript
   export const TOUR_STEPS: TourStep[] = [
     {
       id: "dashboard-overview",
       target: "[data-tour='dashboard']",
       title: "Dein Dashboard",
       content: "Hier siehst du alle deine Akten, Fristen und Kontakte auf einen Blick.",
       placement: "center",
     },
     {
       id: "quick-actions",
       target: "[data-tour='quick-actions']",
       title: "Schnellaktionen",
       content: "Starte eine neue Akte, frage das Brain, oder lade Dokumente hoch.",
       placement: "bottom",
     },
     {
       id: "chat",
       target: "[data-tour='chat-input']",
       title: "Frage das Brain",
       content:
         "Stelle Fragen zu deinen Akten — Subsumio sucht in allen Dokumenten und gibt zitierfähige Antworten.",
       placement: "top",
     },
     {
       id: "pipeline",
       target: "[data-tour='pipeline-trigger']",
       title: "Legal Pipeline",
       content:
         "Lade Gerichtsakten hoch und starte die 6-Layer-Analyse: Entity-Extraction → Forensik → Schaden → Fristen → Entwurf → Review.",
       placement: "right",
     },
     {
       id: "connectors",
       target: "[data-tour='connectors']",
       title: "Integrationen",
       content:
         "Verbinde Google Drive, Gmail, beA oder WhatsApp — Subsumio synchronisiert automatisch.",
       placement: "left",
     },
     {
       id: "settings",
       target: "[data-tour='settings']",
       title: "Einstellungen",
       content: "Konfiguriere SSO, Data Residency, AI-Modell-Präferenzen und mehr.",
       placement: "left",
     },
   ];
   ```

3. **`data-tour` Attribute**:
   - Alle relevanten Dashboard-Elemente bekommen `data-tour="..."` Attribute
   - Sidebar, Quick-Actions, Chat-Input, Pipeline-Trigger, Connectors-Nav, Settings-Nav

4. **Tour-Progress-State** (`settings.ts`):
   - `localStorage.setItem("subsumio-tour-completed", "true")` nach Abschluss
   - API: `PATCH /api/me/preferences` mit `{ tourCompleted: true }`
   - Dashboard zeigt "Tour starten" Button in Settings, falls `tourCompleted !== true`

5. **Auto-Start**:
   - Nach Onboarding-Wizard (`onboardingCompletedAt` gesetzt) → Tour startet automatisch beim ersten Dashboard-Besuch
   - "Nicht mehr anzeigen" Option im ersten Step

**Akzeptanzkriterien:**

- [ ] Tour startet automatisch nach Onboarding-Wizard
- [ ] 6 Steps mit Highlights + Tooltips
- [ ] Keyboard-Navigation (Arrows + Escape)
- [ ] Mobile: Bottom-Sheet statt Tooltip
- [ ] Progress wird in localStorage + API gespeichert
- [ ] "Tour erneut starten" in Settings verfügbar
- [ ] `data-tour` Attribute an allen Target-Elementen

---

### Paket 6: GAP-09 — Template Library (P1, 3–5 Tage)

**Ziel:** Vollständige Document Template Library — komplette Verträge, Klageschriften, Schriftsätze als wiederverwendbare Templates. Abgrenzung zur Clause Library (einzelne Klauseln).

**Betroffene Dateien:**

- `src/app/dashboard/template-library/page.tsx` — NEU: Template Library UI
- `src/components/legal/TemplateQuickCreateDialog.tsx` — NEU: Template Editor Dialog
- `src/lib/api.ts` — `brain.createPage` mit `type: "document_template"` erweitern
- `src/content/dashboard.ts` — i18n Keys für Templates
- `src/app/dashboard/layout.tsx` — Nav-Item für Template Library

**Implementierung:**

1. **Template Library UI** (`template-library/page.tsx`):
   - Grid-Layout wie Clause Library, aber für komplette Dokumente
   - Kategorien: Klageschrift, Schriftsatz, Vertrag, Anschreiben, Gutachten, Sonstiges
   - Search + Category-Filter
   - Preview-Panel mit Markdown-Rendering
   - "Verwenden" Button → Kopiert Template in neuen Draft
   - "Bearbeiten" Button → Template Editor
   - Quick-Create Dialog für neue Templates

2. **Template Editor** (`TemplateQuickCreateDialog.tsx`):
   - Titel, Kategorie, Jurisdiction (AT/DE/CH)
   - Content-Editor (Markdown Textarea mit Preview)
   - Platzhalter-Syntax: `[KLÄGER_NAME]`, `[BEKLAGT_NAME]`, `[STREITWERT]`, etc.
   - Auto-Slug: `template/{category}/{timestamp}`

3. **Brain Page Type**:
   - `type: "document_template"` für Templates
   - Frontmatter: `{ category, jurisdiction, placeholders: string[], language: "de" | "en" }`

4. **Starter Templates** (beim ersten Öffnen, falls leer):
   - Klageschrift AT (Zivilklage)
   - Schriftsatz AT (Berufung)
   - NDA Vertrag DE
   - Dienstleistungsvertrag AT
   - Anschreiben Mandant
   - Mietvertrag Kündigung DE

5. **Nav-Integration** (`layout.tsx`):
   - Neues Nav-Item "Templates" zwischen "Clause Library" und "Playbooks"
   - Icon: `FileText`

6. **"Verwenden" Flow**:
   - Klick auf "Verwenden" → `api.brain.createPage({ type: "draft", slug: "draft/...", content: template.content, frontmatter: { ...template.frontmatter, template_slug } })`
   - Redirect zu `/dashboard/drafting?pageSlug=...`

**Akzeptanzkriterien:**

- [ ] Template Library UI mit Grid, Search, Category-Filter
- [ ] Quick-Create Dialog für neue Templates
- [ ] 6 Starter-Templates werden beim ersten Öffnen seeded
- [ ] "Verwenden" kopiert Template in neuen Draft
- [ ] Platzhalter-Syntax wird dokumentiert
- [ ] Nav-Item "Templates" vorhanden
- [ ] i18n DE+EN für alle UI-Texte

---

### Paket 7: GAP-10 — ROI Calculator (P1, 1–2 Tage)

**Ziel:** Interaktiver ROI-Calculator auf der Website. Kanzleien geben Parameter ein (Anwälte, Stunden/Woche, Stundensatz) und sehen die Einsparung.

**Betroffene Dateien:**

- `src/components/marketing/roi-calculator.tsx` — NEU: Interactive Calculator
- `src/app/[locale]/roi-calculator/page.tsx` — NEU: Page Route
- `src/content/site.ts` — i18n Content
- `src/components/marketing/pricing-page.tsx` — Link zum ROI-Calculator

**Implementierung:**

1. **Calculator Component** (`roi-calculator.tsx`):
   - Inputs:
     - Anzahl Anwälte (Slider: 1–50)
     - Stunden/Woche für Recherche/Drafting (Slider: 5–30)
     - Stundensatz (Slider: 100–500 €)
     - Aktuelle Tool-Kosten/Monat (Input: 0–5000 €)
   - Outputs (real-time):
     - Geschätzte Einsparung/Monat durch Subsumio
     - Geschätzte Einsparung/Jahr
     - ROI-Multiplikator (z.B. "3.2x Return")
     - Break-Even-Zeit (Monate bis Amortisation)
   - Formula: `einsparung = (stunden * 0.4 * stundensatz * 4.33 * anwälte) - subsumio_kosten`
     - 0.4 = 40% Zeitersparnis durch AI (konservative Schätzung)
     - subsumio_kosten = Pro-Plan × Anwälte (oder Team-Plan)
   - Visualisierung: Animated Counter + Bar Chart (Einsparung vs. Kosten)

2. **Page Route** (`[locale]/roi-calculator/page.tsx`):
   - SEO-optimiert: `title: "ROI Calculator — Subsumio Legal AI"`
   - OpenGraph + Twitter Cards
   - CTA am Ende: "Jetzt kostenlos testen" → `/signup`

3. **Pricing-Page Integration**:
   - Unter den Pricing-Tiers: "Nicht sicher? Berechne deinen ROI →" Link

**Akzeptanzkriterien:**

- [ ] Calculator reagiert real-time auf Input-Änderungen
- [ ] 4 Slider + 1 Input
- [ ] Animated Counter für Einsparung
- [ ] Mobile-responsive
- [ ] DE + EN i18n
- [ ] SEO-Metadata vorhanden
- [ ] Link von Pricing-Page

---

### Paket 8: GAP-11 — Blog / Content Marketing Pages (P1, 2–3 Tage)

**Ziel:** Blog-Route für SEO-Content. MDX-basiert, mit RSS-Feed, Sitemap, und 3 Starter-Artikeln.

**Betroffene Dateien:**

- `src/app/[locale]/blog/page.tsx` — NEU: Blog-Übersicht
- `src/app/[locale]/blog/[slug]/page.tsx` — NEU: Blog-Artikel-Detail
- `src/content/blog/` — NEU: MDX-Artikel-Verzeichnis
- `src/lib/blog.ts` — NEU: Blog-Post-Loader
- `src/app/rss.xml/route.ts` — NEU: RSS-Feed
- `src/components/marketing/blog-card.tsx` — NEU: Blog-Card-Component

**Implementierung:**

1. **Blog-Post-Loader** (`blog.ts`):
   - Liest MDX-Dateien aus `src/content/blog/`
   - Frontmatter: `{ title, description, date, author, tags, image, locale }`
   - Sortiert nach Datum (neueste zuerst)
   - `getAllPosts()`, `getPostBySlug(slug)`, `getPostsByTag(tag)`

2. **Blog-Übersicht** (`blog/page.tsx`):
   - Hero-Section mit "Subsumio Blog" + Description
   - Grid mit Blog-Cards (Image, Title, Date, Excerpt, Tags)
   - Tag-Filter (Pills)
   - Pagination (10 Posts pro Seite)

3. **Blog-Artikel-Detail** (`blog/[slug]/page.tsx`):
   - MDX-Rendering mit `next-mdx-remote`
   - Table of Contents (rechts, sticky)
   - Author-Bio am Ende
   - CTA: "Subsumio ausprobieren" → `/signup`
   - SEO: OpenGraph, Twitter Cards, JSON-LD Article

4. **Starter-Artikel** (`src/content/blog/`):
   - `ai-in-legal-practice-de.mdx` — "Wie KI den Anwaltsalltag verändert"
   - `dach-legal-tech-2026-de.mdx` — "Legal Tech im DACH-Raum: Status quo 2026"
   - `subsumio-vs-harvey-de.mdx` — "Subsumio vs. Harvey: DACH-Fokus vs. US-Centric"

5. **RSS-Feed** (`rss.xml/route.ts`):
   - Standard RSS 2.0
   - Alle Posts mit Title, Description, Date, Link

6. **Sitemap-Erweiterung**:
   - Blog-Posts in `sitemap.ts` aufnehmen

**Akzeptanzkriterien:**

- [ ] Blog-Übersicht mit Grid + Tag-Filter
- [ ] Blog-Artikel-Detail mit MDX-Rendering + TOC
- [ ] 3 Starter-Artikel in DE
- [ ] RSS-Feed unter `/rss.xml`
- [ ] SEO-Metadata (OpenGraph, JSON-LD Article)
- [ ] Sitemap enthält Blog-Posts
- [ ] CTA zu `/signup` in jedem Artikel

---

### Paket 9: GAP-12 — Training Platform / Subsumio Academy (P1, 5–7 Tage)

**Ziel:** Strukturierte Trainingsplattform mit Kursen, Video-Embeds, Progress-Tracking, und Zertifikaten. CLE-kompatibel.

**Betroffene Dateien:**

- `src/app/dashboard/academy/page.tsx` — NEU: Academy-Übersicht
- `src/app/dashboard/academy/[courseSlug]/page.tsx` — NEU: Kurs-Detail
- `src/app/dashboard/academy/[courseSlug]/[lessonSlug]/page.tsx` — NEU: Lektion-View
- `src/lib/academy.ts` — NEU: Course/Lesson-Loader
- `src/content/academy/` — NEU: Kurs-Content (MDX + Video-Embeds)
- `src/app/api/academy/progress/route.ts` — NEU: Progress-Tracking API
- `src/app/dashboard/layout.tsx` — Nav-Item "Akademie"

**Implementierung:**

1. **Course/Lesson-Loader** (`academy.ts`):
   - Liest Kurs-Struktur aus `src/content/academy/` (JSON-Manifest + MDX-Lektionen)
   - Kurs-Manifest: `{ slug, title, description, level, lessons: [{ slug, title, videoUrl, duration }] }`
   - `getAllCourses()`, `getCourse(slug)`, `getLesson(courseSlug, lessonSlug)`

2. **Academy-Übersicht** (`academy/page.tsx`):
   - Grid mit Kurs-Cards (Thumbnail, Title, Level, Duration, Progress)
   - Filter: Level (Beginner/Intermediate/Advanced), Status (Not Started/In Progress/Completed)
   - "Zertifikate" Section (abgeschlossene Kurse)

3. **Kurs-Detail** (`academy/[courseSlug]/page.tsx`):
   - Kurs-Beschreibung + Lektionen-Liste (Sidebar)
   - Progress-Bar (x% abgeschlossen)
   - "Start" / "Fortsetzen" Button

4. **Lektion-View** (`academy/[courseSlug]/[lessonSlug]/page.tsx`):
   - Video-Embed (YouTube/Vimeo via `next-mdx-remote` oder iframe)
   - MDX-Content unter dem Video (Transcript, Code-Beispiele, Quizzes)
   - "Als erledigt markieren" Button → Progress-Tracking
   - "Nächste Lektion" Navigation

5. **Progress-Tracking** (`api/academy/progress/route.ts`):
   - `POST /api/academy/progress` — `{ courseSlug, lessonSlug, completed: true }`
   - `GET /api/academy/progress` — Alle Fortschritte des Users
   - Speicherung in `user_preferences` JSON-Field: `{ academyProgress: { [courseSlug]: { [lessonSlug]: true } } }`
   - Bei Kurs-Abschluss: Zertifikat-Generierung (PDF-Download)

6. **Starter-Kurse** (`src/content/academy/`):
   - **Kurs 1: "Subsumio Grundlagen"** (Beginner, 5 Lektionen)
     - Einführung, Dashboard, Brain-Query, Upload, Pipeline-Start
   - **Kurs 2: "Legal Pipeline Deep Dive"** (Intermediate, 6 Lektionen)
     - 6-Layer-Architektur, Specialist-Prompts, Review-Tables, Export
   - **Kurs 3: "Contract Redlining & Playbooks"** (Advanced, 4 Lektionen)
     - Playbook-Erstellung, Redlining-Workflow, Auto-Playbook, Clause Library

7. **Nav-Integration** (`layout.tsx`):
   - Neues Nav-Item "Akademie" mit `GraduationCap` Icon
   - Badge: "Neu" für 30 Tage

**Akzeptanzkriterien:**

- [ ] 3 Starter-Kurse mit insgesamt 15 Lektionen
- [ ] Video-Embed + MDX-Content pro Lektion
- [ ] Progress-Tracking via API
- [ ] "Als erledigt markieren" funktioniert
- [ ] Zertifikat-Download bei Kurs-Abschluss
- [ ] Nav-Item "Akademie" mit Badge
- [ ] Filter nach Level + Status
- [ ] DE + EN i18n für UI-Texte

---

## Implementierungs-Reihenfolge

```
Woche 1: Paket 1 (Agentic Search) + Paket 4 (Auto-Playbook Cron) + Paket 7 (ROI Calculator)
Woche 2: Paket 2 (Data Sources) + Paket 5 (Guided Tour) + Paket 10 (Blog)
Woche 3: Paket 3 (SharePoint) + Paket 6 (Template Library) + Paket 9 (Academy)
```

**Begründung:** P0-Code (Agentic Search) zuerst, dann schnelle Wins (Cron, ROI Calculator), dann komplexere Pakete.

---

## Definition of Done (Gesamt)

- [ ] Alle 9 Pakete implementiert und getestet
- [ ] `tsc --noEmit` — 0 Errors
- [ ] `bun test` — alle Tests grün
- [ ] Playwright E2E für neue Features
- [ ] i18n DE+EN für alle neuen UI-Texte
- [ ] SEO-Metadata für neue öffentliche Pages (Blog, ROI Calculator)
- [ ] Nav-Integration für neue Dashboard-Pages (Templates, Academy)
- [ ] Gap-Analyse aktualisiert: Parität von 70% → 90%
