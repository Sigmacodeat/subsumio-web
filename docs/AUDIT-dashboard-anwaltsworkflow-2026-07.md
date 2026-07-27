# Dashboard-Audit: Anwaltsworkflow vs. Gold-Standard (2025/2026)

**Datum:** 18.07.2026 · **Scope:** `src/` (284 Seiten, 149 Dashboard-Routen, 426 API-Routen), `server/`, Design-System, Barrierefreiheit, Wettbewerbsvergleich
**Begleitdokument:** [`research/legal-dashboard-gold-standard-2026.md`](../research/legal-dashboard-gold-standard-2026.md) (Quellen & Wettbewerber-Details)

---

## 1. Gesamturteil

> **Kurzantwort: Ja — der Workflow ist auf Gold-Standard-Niveau aufgebaut, in Teilen darüber hinaus. Es ist nicht „perfekt": 1 toter Link, 3 kaputte API-Aufrufe, ~15 englische Text-Überbleibsel, 22 Seiten ohne Lade-/Fehlerzustände und eine konkrete Liste an Barrierefreiheits-Lücken (v. a. Modals, Formular-Labels, Tastaturbedienung) verhindern Expertenniveau.**

| Dimension                                              | Bewertung  | Einordnung                                                            |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| Workflow-Abdeckung (Fristen, Akten, beA, RVG, DATEV …) | ⭐⭐⭐⭐⭐ | Übererfüllt — alle deutschen Must-haves vorhanden                     |
| Informationsarchitektur / Dashboard-Konzept            | ⭐⭐⭐⭐⭐ | Entspricht exakt dem Branchen-Zwei-Ebenen-Modell                      |
| Design-System (Farben, Typo, Kontrast)                 | ⭐⭐⭐⭐⭐ | Professionell, Kanzlei-tauglich, AA/AAA dokumentiert                  |
| Deutsche Texte / Terminologie                          | ⭐⭐⭐⭐   | Sehr gut, ~15 englische Überbleibsel                                  |
| API-Anbindungen                                        | ⭐⭐⭐⭐   | 100 % der referenzierten Routen existieren; 3 kaputte Aufrufe         |
| Barrierefreiheit (WCAG 2.2)                            | ⭐⭐⭐½    | Basis überdurchschnittlich, Anwendung inkonsistent                    |
| Wettbewerbsposition                                    | Top-Niveau | Breite übertrifft Clio/Kleos/RA-MICRO; Tiefe/Discovery ist das Risiko |

---

## 2. Gold-Standard-Checkliste: Erfüllungsgrad

Die Recherche (Clio, Smokeball, Rocket Matter, Attorney-at-Work-KPI-Modell, deutscher Markt: RA-MICRO, DATEV, Kleos, Advoware, Actaport) definiert zwei Dashboard-Typen. **Subsumio erfüllt beide:**

### Typ 1: „Daily Command Center" (Anwalts-Sicht)

| Gold-Standard-Element                  | Status             | Umsetzung bei subsumio                                                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Heute-Agenda / Termine                 | ✅                 | „Heute"-View mit 4 Spalten (Fristen, Wiedervorlagen, Posteingang, Termine), Deep-Links zur Akte               |
| Fristen mit Ampel/Überfällig-Surfacing | ✅                 | `ProactiveActionBanner` (kritische Fristen), Fristenliste, Deadline-Check-Widget, Altlasten/Verjährungs-Radar |
| Aufgaben (überfällig zuerst)           | ✅                 | Aufgaben + Weekly-Review-Checkliste (freitags ab 16 Uhr)                                                      |
| Zuletzt bearbeitete Akten              | ✅                 | Pinned Matters, Aktive Akten, Aktivitätsfeed, Cross-Case-Timeline                                             |
| Zeiterfassungs-Widget mit Timer        | ✅                 | Zeiterfassung + **passive Zeitvorschläge** (entspricht Smokeballs Auto-Tracking — Alleinstellung)             |
| Activity-Feed                          | ✅                 | Vorhanden                                                                                                     |
| Globale Suche (as-you-type)            | ✅                 | ⌘K Command Palette (vorbildliches A11y-Muster)                                                                |
| Global-Create-Button                   | ✅                 | Quick-Create mit 8 Dialogen + Ein-Tasten-Shortcuts (n/d/i/s/c)                                                |
| Rollen-personalisierbare Widgets       | ✅                 | 19 Widgets, Drag&Drop, Presets für Partner/Admin/Associate/Tax                                                |
| KI-Briefing                            | ✅ (über Standard) | `MorningBriefing` mit KI-Narrativ — das geht über Clio/MyCase hinaus                                          |

### Typ 2: Kanzlei-Cockpit (Partner-Sicht, KPIs)

| KPI-Kategorie (Attorney at Work) | Status | Umsetzung                                              |
| -------------------------------- | ------ | ------------------------------------------------------ |
| Financial Health / Cash          | ✅     | FiBu, Controlling, OPOS, Matter-Budget, Peer-Benchmark |
| Production (Billable Hours, WIP) | ✅     | Zeiterfassung, Abrechnungs-Stats, Kanzlei-Insights     |
| Capacity                         | ✅     | Aktenverteilung, Team-Auslastung (case-assignment)     |
| Pipeline / Intake                | ✅     | Intake-Triage, Online-Buchung, Adoption-Analytics      |

### Deutsche Pflicht-Liste (nicht verhandelbar)

| Must-have                                        | Status       | Bemerkung                                                                                                                                             |
| ------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fristenkalender + automatische Fristenberechnung | ✅           | `legal/fristen`, Fristenbuch, Verjährung                                                                                                              |
| Wiedervorlage                                    | ✅           | Inkl. **Vier-Augen-Modal für Notfristen** (über Standard)                                                                                             |
| beA/EGVP                                         | ⚠️ Teilweise | XJustiz-XML-Export + validierter manueller Export; **keine direkte beA-Anbindung** (Middleware `BEA_MIDDLEWARE_URL` vorbereitet, aber auskommentiert) |
| RVG-Abrechnung + E-Rechnung                      | ✅           | RVG-Rechner, e-invoice (XRechnung/ZUGFeRD)                                                                                                            |
| DATEV-Export/ReWe                                | ✅           | CSV + DATEV-Direkt (API-gated)                                                                                                                        |
| Kollisionsprüfung                                | ✅           | Eigene Route                                                                                                                                          |
| E-Akte mit Volltextsuche/Versionierung           | ✅           | Vault, Version-History                                                                                                                                |
| Mandantenportal                                  | ✅           | Token-gated Portal + Dokumentenanforderungen                                                                                                          |
| DSGVO/EU-Hosting                                 | ✅           | Self-hosted Fonts, Hetzner-Deployment                                                                                                                 |
| Mobile App                                       | ✅           | Capacitor + 6 standalone Mobile-Seiten + MobileTabBar                                                                                                 |

**Einzige echte Markt-Lücke: beA.** Jeder deutsche Wettbewerber (RA-MICRO, DATEV, Kleos, Advoware) hat ein integriertes beA-Postfach. Der Export-Fallback ist gut, aber für „Expertenniveau" im Vertrieb ist die Vollintegration über zertifizierte Middleware der fehlende Baustein.

---

## 3. Befunde — priorisiert

### 🔴 P0 — sofort beheben (funktional kaputt)

| #   | Befund                                                                                                                                                                                                           | Ort                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **Toter Link:** Dashboard-Chip „Signaturanfragen" verlinkt auf `/dashboard/docusign` — Route existiert nicht (404). Ziel muss `/dashboard/signature` sein.                                                       | `src/app/dashboard/page.tsx:233`                                         |
| 2   | **API-Key-Löschung kaputt:** Frontend ruft `DELETE /api/api-keys/{id}` (Pfad), Server erwartet ID im **Body** → 404.                                                                                             | `src/lib/queries/settings.ts:83` vs. `src/app/api/api-keys/route.ts:120` |
| 3   | **Team-Mitglied-Entfernung kaputt:** Frontend ruft `DELETE /api/team/{userId}`, Route exportiert nur GET → 404/405.                                                                                              | `src/lib/queries/settings.ts:126` vs. `src/app/api/team/route.ts`        |
| 4   | **Mobile Zeiterfassung kaputt:** ruft `/api/timetracking`, korrekt ist `/api/time-tracking` → fällt still immer auf Fallback zurück.                                                                             | `src/app/mobile/time/page.tsx:90`                                        |
| 5   | **Vier-Augen-Modal (Notfristen!) ohne Dialog-Semantik:** kein `role="dialog"`, kein Escape, kein Autofokus — ausgerechnet der haftungskritischste Dialog der App ist für Screenreader/Tastatur nicht zugänglich. | `src/app/dashboard/deadlines/page.tsx:1065-1122`                         |

### 🟠 P1 — Expertenniveau-Blocker

**Barrierefreiheit (WCAG 2.2 / BFSG-Kontext: Mandantenportal & Intake sind B2C → BFSG-relevant seit 28.06.2025):**

- Settings-Formulare: `Field` rendert Label als `<p>` statt `<label htmlFor>` — ~20 Inputs ohne zugänglichen Namen (`settings/page.tsx:164-184`, besonders kritisch: Grid-Felder E-Mail/Telefon/Kammer, Bank/IBAN/BIC nur mit Placeholder).
- `aria-invalid` kommt im gesamten `src/` **0×** vor; Feldfehler werden nicht programmatisch angesagt.
- 6+ Custom-Modals ohne Dialog-Semantik (Audit-Drawer, Mailbox, Kalender-Editor, Agent-Builder, Voice-to-Prompt).
- Klick-`<div>`s ohne Tastaturzugang: sortierbare Tabellenköpfe & Zeilen-Klicks (`data-table.tsx:367-376, 451, 562-564`), KI-Modell-Karten (`settings/ai-model/page.tsx:107-114, 162-170`), Kalender-Tageszellen, Klausel-Toggle, Agent-Templates.
- Dashboard-Suchinput ohne `aria-label` (`dashboard/page.tsx:151-157`); `sr-only` „Close"/„Send" hardcoded englisch.
- Tab-Umschalter Heute/Dashboard ohne APG-Pfeiltasten/`aria-controls`.
- Tooling vorhanden, aber zahnlos: jsx-a11y nur „warn", Lighthouse-A11y nur „warn" + nur Marketing-URLs, `contrast-audit.ts` nicht in CI verdrahtet. (Positiv: axe-Playwright-Specs mit ~90 Dashboard-Routen sind CI-blocking — aber assertieren nur critical/serious.)

**Texte / Lokalisierung:**

- Englische Überbleibsel in deutscher UI: `nav.obligation_tracking`, `nav.portfolio_insights`, `nav.adoption_analytics`, `sidebar.active: "Active"`, `sidebar.pages_entities: "pages"`, `cockpit.stat_reviews: "Reviews"`, `cockpit.triage: "Triage"`, `Dream Cycle`, hardcoded „Settings"-Breadcrumbs (`settings/ai-model/page.tsx:63,88`, `settings/rciid/page.tsx:82`), `placeholder="Name"` (`drafting/page.tsx:462,473`).
- Ton-Inkonsistenz: Greeting „was heute **deine** Aufmerksamkeit braucht" (informell) vs. sonst formelle „Ihre"-Anrede — für Kanzlei-Produkt einheitlich „Ihre" wählen.
- `/de` fehlen die Produktseiten `subsumio`/`superbrain`, die root/`/at`/`/ch` haben (SEO-Inkonsistenz).
- Route-Name `claim-account` = Mahnwesen — semantische Kollision mit „Account-Claiming"; Label sollte klar „Mahnwesen" sein.

**Funktional/Struktur:**

- Workflow-Builder (`/dashboard/workflows/builder`) ist **verwaist** — keine UI-Verlinkung, unerreichbar.
- 22 Dashboard-Seiten ohne `loading.tsx`/`error.tsx`: u. a. `wiedervorlagen`, `case-search`, `notifications`, `legal-hold`, alle 8 `admin/*`, Research-Tab-Seiten.
- `compliance/ai-act` ist die einzige Seite mit hartkodiertem statischen Inhalt.
- TODO-Stubs: `autonomous/*` hardcoded `brainId="system"`, `rciid/webhook` (Report-Download fehlt), `insights` („TODO 8").
- `DATEV_API_KEY/CLIENT_ID/CLIENT_SECRET` im Code erforderlich, fehlen aber in `.env.example`.

### 🟡 P2 — Feinschliff

- Sidebar-Badge: Screenreader hört nur nackte Zahl (`aria-label={String(count)}`) → „3 ungelesene Benachrichtigungen".
- `<main role="main">` redundant; Pin-Button in Tabellen nur bei Hover sichtbar (kein `focus-within`-Reveal).
- `alertdialog` wird vom globalen Fokus-Trap nicht gematcht (`layout.tsx:354`).
- Architektur-Hinweis: Geschäftslogik konzentriert in 426 Next-Routen; Engine hat nur ~45 Endpunkte — Mobile-/Add-in-Clients müssen Next-Logik spiegeln.
- 4 Cron-Routen nicht in `vercel.json` (vermutlich Hetzner-only) — dokumentieren.

---

## 4. Wettbewerbsvergleich: Wo subsumio steht

| Capability                         | Clio            | Kleos  | RA-MICRO     | Advoware        | **subsumio**                                 |
| ---------------------------------- | --------------- | ------ | ------------ | --------------- | -------------------------------------------- |
| Personalisierbares Dashboard       | ✅              | ✅     | ⚪           | ✅              | ✅ (19 Widgets, Rollen-Presets)              |
| Automatische/passive Zeiterfassung | ⚪              | ⚪     | ⚪           | ⚪              | ✅ (Zeitvorschläge — Alleinstellung)         |
| KI-Briefing / Morning Digest       | ⚪ (Duo)        | ⚪     | ⚪           | ⚪ (Legal Twin) | ✅                                           |
| Zitationsgesicherte KI-Recherche   | ⚪              | ⚪     | ✅ (JURA KI) | ⚪              | ✅ (eigener Law-Corpus + RAG + Verifikation) |
| beA-Postfach integriert            | —               | ✅     | ✅           | ✅              | ⚠️ **Export only**                           |
| RVG/DATEV/E-Rechnung               | —               | ✅     | ✅           | ✅              | ✅                                           |
| Vertrags-Redline/Playbooks         | ⚪              | ⚪     | ⚪           | ⚪              | ✅                                           |
| Ethical Walls / Legal Hold         | ✅ (Enterprise) | ⚪     | ⚪           | ⚪              | ✅                                           |
| Breite (Module gesamt)             | hoch            | mittel | mittel       | mittel          | **sehr hoch (149 Seiten)**                   |

**Kernaussagen:**

1. **Funktionale Breite übertrifft alle deutschen Wettbewerber** und liegt auf Clio/Harvey-Niveau — mit deutschem Pflicht-Feature-Set (Fristen, RVG, DATEV, Kollision, Anderkonto).
2. **Größtes strategisches Risiko: Breite statt Tiefe.** Clio-Kritikpunkt „Feature-Overload" gilt hier noch mehr — Discovery hängt an Sidebar-Suche + „Alle Funktionen"-Directory. Gegenmittel: Onboarding-Flows, kontextuelle Einstiege, ggf. Feature-Sichtbarkeit nach Kanzleigröße.
3. **beA ist die einzige echte Feature-Lücke** zum deutschen Standard.
4. **Differenzierung halten/ausbauen:** passive Zeiterfassung (Smokeball-Pattern), Morning Briefing, Zeitvorschläge, Weekly Review — das sind die „Expert-Level"-Signale.
5. **Vertrauens-Features als Vertriebs-Argument:** BRAK-KI-Leitlinien-Konformität (AV-Vertrag, kein Training auf Mandantendaten), Verifikations-Layer, Audit-Trail — explizit auf der Marketing-Site herausstellen (RA-MICRO und Noxtua machen das erfolgreich).

---

## 5. Maßnahmenplan

**Sofort (1–2 h):** P0 #1–#4 (Link + 3 API-Fixes), englische Label-Überbleibsel ersetzen, „deine"→„Ihre".

**Sprint 1 (Barrierefreiheit):** Settings-Labels, Vier-Augen-Modal + 5 Modals auf Radix-Dialog migrieren, klickbare divs → Buttons (Vorbild: `WidgetCard` in `CaseOverviewWidgets.tsx:60-78`), `aria-invalid`/`aria-describedby` im Input-Basispattern, Dashboard-Suche aria-label.

**Sprint 1 (Robustheit):** 22 fehlende `loading/error.tsx` ergänzen, Workflow-Builder verlinken oder entfernen, `.env.example` um DATEV-Keys ergänzen, TODO-Stubs schließen.

**Sprint 2 (Regressionsschutz):** jsx-a11y auf „error", `contrast-audit.ts` in CI, axe-Specs einmal mit `impact ≥ moderate` durchmessen, Erklärung zur Barrierefreiheit veröffentlichen (BFSG/B2C-Scope: Mandantenportal, Intake, Buchung).

**Strategisch (Roadmap):** beA-Middleware-Anbindung aktivieren (höchster vertrieblicher Hebel), BRAK-Konformität + Verifikations-Layer als Marketing-Claim, Feature-Discovery verbessern (rollenbasierte Progressive Disclosure).

---

_Erstellt durch automatisiertes Audit: vollständige Routen-Inventur, API-Wiring-Prüfung (82/82 referenzierte Pfade existieren), WCAG-2.2-Code-Audit, Web-Recherche zu Gold-Standard & 15+ Wettbewerbern._
