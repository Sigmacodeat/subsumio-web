# Subsumio Frontend Redesign Blueprint — 2026

## 1. Ziel aus User-Sicht

Subsumio soll sich nicht wie ein weiterer generischer AI-Chatbot anfühlen, sondern wie eine **state-of-the-art Kanzlei-Workstation** für den deutschen DACH-Markt. Der Nutzer öffnet das Tool und sieht sofort seinen Arbeitskontext (Akten, Fristen, Eingang, Wissen) – nicht erst ein leeres Chatfenster.

## 2. Kern-Userflows

### Beginner (Erstnutzer)

1. Landet auf Dashboard, nicht auf Chat.
2. Sieht sofort Aktionskarten: „Neue Akte anlegen“, „Dokument hochladen“, „Termin/Frist prüfen“.
3. Chat ist **einer von mehreren Einstiegspunkten**, nicht der Hauptmodus.
4. Leerzustände zeigen CTA statt Promo-Text.

### Normaler Nutzer (Anwalt/Assistent)

1. Öffnet App → sieht Aktivitätsfeed, anstehende Fristen, ungelesene Inbox.
2. Klickt auf Akte → arbeitet in einem dedizierten Arbeitsraum (Dokumente, Fristen, Chat pro Akte, Timeline).
3. Chat ist kontextualisiert (Akten-Chat, nicht allgemeiner Chat).
4. Command Palette (Cmd+K) ist die schnelle Navigation, nicht das Sidebar-Scrollen.

### Power-User

1. Pinned Akten, eigene Widgets, kuratierte Ansichten.
2. Tastatur-Shortcuts für alles.
3. Split-View: Akte + Chat + Dokument gleichzeitig.
4. Benutzerdefinierte Dashboard-Widgets (Modular UI).

## 3. UI-Elemente & Interaktionen

### Sidebar (Navigation)

- **Strategische Minimalismus**: Nur 5–7 Primär-Items sichtbar, Rest per Section-Collapse oder Command Palette.
- **Aktueller Arbeitsbereich**: Oben eine „Quick Context“-Bar mit aktiver Akte, nächster Frist, offener Inbox.
- **Akzentuierung der aktiven Route**: Deutlicher Selected-State, nicht nur Subtle-Tönung.
- **Iconografie**: Weniger „Sparkles“, mehr semantische, legale Icons (Scale, Gavel, Briefcase, FileCheck).
- **Sidebar-Modus**: Collapsible (Icon-only) mit Hover-Expand-Tooltip, nicht abruptes Zuklappen.

### Topbar

- **Globale Suche** wird zentrales Nav-Element (Cmd+K), ersetzt den Such-Input in der Sidebar.
- **Status-Area**: Statt großer Offline/Online-Badge: dezenter Dot + Tooltip.
- **Benutzer-Menu**: Avatar mit Rollenlabel, Einstellungen, Logout.
- **Aktions-Button**: Primary CTA für die häufigste Aktion (z.B. „Neue Akte“).

### Dashboard / Startseite

- **Widget-Grid**: Modular, 2/3-Spalten, nicht einfache Listen.
- **Aktivitätsfeed**: Was ist heute/neu passiert (Kronologisch, nicht AI-generiert).
- **Fristen-Widget**: Hochgradig sichtbar, mit Ampel-Status.
- **Inbox-Widget**: Ungelesene E-Mails, beA, WhatsApp, Dokumentenanfragen.
- **Akten-Schnellzugriff**: Zuletzt bearbeitete Akten mit Fortschritt/Status.
- **KPI-Karten**: Diskret, nicht Werbe-Style, keine großen Gradienten.

### Chat / Brain-Chat

- **Nicht zentrale Landing-Page**: Chat wird pro Akte/Prozess kontextualisiert.
- **Empty State**: Keine AI-typischen „Beispiel-Prompt-Karten“. Stattdessen: Kontexteingabe oder Aktionen (Frage stellen, Dokument analysieren, Frist extrahieren).
- **Input-Bar**: Eleganter, großzügiger, mit kontextueller Toolbar (z.B. Akte, Jurisdiction, Modus).
- **Nachrichten-Design**: Klare Unterscheidung User/System, kompakte Dokumenten-Referenzen, Inline-Aktionen (übernehmen, speichern, in Akte einordnen).
- **Streaming-Indikator**: Dezent, nicht blinkend/aufdringlich.
- **Keine „Sparkles“-Ikonografie** als Haupt-Akzent.

### Komponenten / Design-System

- **Farb-Update**: Raus aus dem generischen Purple/Blue-Gradient. Premium Legal-Tech = tiefes Navy, warmes Grau, dezenter Gold/Smaragd-Akzent für Signale.
- **Typografie**: Weiterhin Space Grotesk für Headlines, aber straffere Hierarchie.
- **Cards**: Weniger harter Border, stärkerer Schatten/Elevation, sanftere Hover-Effekte.
- **Badges**: Abgerundeter, weniger „Tech-Startup“.
- **Buttons**: Klarere Primary/Secondary/tertiary Hierarchie.
- **Elevation**: Layer-System (base → surface → elevated → overlay).

## 4. Datenmodell & State-Management

- **UI-Präferenzen**: Sidebar-Offen, Widget-Layout, zuletzt besuchte Akten, Command-Palette-History (bereits teilweise via localStorage).
- **Dashboard-Widgets**: Widget-Definitionen, User-Pinning, sichtbar/unsichtbar, Reihenfolge.
- **Kontextueller Chat**: Aktive Akte pro Chat-Thread, Jurisdiction, Modus.
- **Navigation-Status**: Active route, collapsed state, search query.
- Keine Änderung am Backend notwendig für Phase 1.

## 5. Architektur-Entscheidungen

- **Design-First**: Blueprint vor Code. Keine neuen Komponenten ohne Einordnung in das System.
- **Token-basiert**: Alle Änderungen laufen über CSS-Design-Tokens (`--ds-*`, `--brand-*`), nicht hartkodierte Farben.
- **Komponentenbibliothek**: Shadcn-UI-Primitives bleiben, Styling wird über Tokens und Utility-Klassen geändert.
- **Tailwind v4**: Bereits im Einsatz; `@theme` und `color-mix()` weiter nutzen.
- **Kein Framework-Wechsel**: React + Next.js + Tailwind bleiben.
- **Inkrementelle Migration**: Nicht alles auf einmal, sondern nach Packages (Dashboard-Shell → Chat → Detailpages → Shared Components).
- **Accessibility**: WCAG-AA Kontrast beibehalten, Fokus-Ringe klar, Keyboard-Shortcuts dokumentiert.

## 6. Edge-Cases & Fehlerszenarien

- **Offline**: Status dezent, nicht störende Banner.
- **Leere Daten**: Keine leeren Charts, sondern CTA-Cards.
- **Zu viele Akten/Items**: Pagination, Filter, Command-Palette-Suche.
- **Mobile**: Sidebar → Bottom-Sheet, Chat-Input an Tastatur angepasst, Touch-Targets ≥ 44px.
- **Langsame Verbindung**: Skeleton-Loading, keine leeren Flächen.
- **Kollabierter Sidebar**: Tooltips sichtbar, Icons klar.
- **Command Palette**: Keine Ergebnisse → Hilfe-Text und Shortcuts.

## 7. Definition of Done

- [x] Dashboard-Startseite fühlt sich wie eine Arbeitsstation an, nicht wie Chat-Landing.
- [x] Sidebar ist reduziert, klar strukturiert und per Keyboard/Tastatur navigierbar.
- [x] Topbar integriert globale Suche + Primary-CTA.
- [x] Chat-Interface ist kontextualisiert und weniger „AI-generisch" (keine Sparkles-Karten, keine prompt-Tiles).
- [x] Farbpalette und Typography sind auf Legal-Tech-Premium angehoben, nicht Startup-Generic.
- [ ] Alle bestehenden Tests laufen (Test-Infrastruktur hat vorbestehendes Preload-Problem).
- [x] Mobile-Ansicht ist konsistent (Mobile-Tab-Bar aktualisiert).
- [ ] Command Palette ist ausgebaut zur Haupt-Navigation.

## 8. Arbeitspakete (Reihenfolge)

### Paket 1: Design-System-Token-Refresh ✅

- Neue Brand-Color-Set (Navy/Gold), Elevation-Scale, typographische Feintuning.
- Keine Änderung an Komponentenlogik, nur CSS/Token-Updates.

### Paket 2: Dashboard-Shell (Sidebar + Topbar) ✅

- Sidebar: Reduzierte Primär-Navigation, verbesserte Search, dezenterer Brain-Status.
- Topbar: Copilot-Icon neutralisiert, globale Suche beibehalten.

### Paket 3: Chat-Interface-Redesign ✅

- Chat-Header: Titel geändert zu „Assistent", Status-Widgets vereinfacht, neues Icon.
- Chat-Empty-State: Keine Sparkles/Glow, ruhigere Suggestions.
- Chat-Input: Größere, weichere Input-Bar, neutralerer Placeholder.
- Streaming-Indicator: Icons und Text neutralisiert.
- Copilot-Sidebar: Header-Icons und Quick-Actions-Icon neutralisiert.

### Paket 4: Dashboard-Homepage Labels ✅

- Cockpit-Labels neutralisiert („KI-Kontrolle" → „Qualitätskontrolle", „KI fragen" → „Assistent", etc.).
- Recent-Queries-Widget mit Übersetzungsschlüssel.

### Paket 5: Shared Components & Detailpages ✅

- Button-Varianten verfeinert (weniger Glow).
- Detailpages durchneutralisiert:
  - Akten-Liste, Akten-Detail, Fristen, Upload, Vault, Onboarding, Verträge, Analyse, Recherche, Prozessstrategie, Agenten, Einstellungen → AI-/Brain-Icons und -Texte ersetzt.

### Paket 6: Marketing-Seiten ✅

- Alle `Sparkles`-Icons in Marketing-Komponenten entfernt (Pricing, About, Live-Demo, Superbrain-Advantage, Dashboard-Reel, Workflow-Showcase).
- Marketing-Copy an Assistenten-/Wissensbasis-Sprache angeglichen (Auth-Form, Billing-Plans, About).

### Paket 7: Command Palette & Keyboard UX ✅

- Command Palette erweitert:
  - Neue Sektionen: Aktionen, Erstellen, Verwaltung.
  - Neue Befehle: Assistent öffnen, neue Akte/Frist/Rechnung/Vertrag, Dokument hochladen.
  - Kurzbefehl-Modal direkt aus der Palette erreichbar.
- Globale Shortcuts:
  - `⌘K` / `Ctrl+K`: Command Palette.
  - `Shift+?`: Tastaturkürzel-Overlay.
  - `⌘Shift+L` / `Ctrl+Shift+L`: Design wechseln.
  - `⌘B` / `Ctrl+B`: Sidebar ein/aus.
  - `⌘Shift+A` / `Ctrl+Shift+A`: Assistent öffnen.

### Paket 8: Selbst-Audit & Stress-Test ✅

- `bun tsc` zeigt weiterhin nur die vorbestehenden Fehler in `src/app/api/cron/law-sync/route.ts` und `src/app/api/cron/judgements-sync/route.ts` (nicht durch Design-Änderungen verursacht). Keine neuen Type-Fehler in den geänderten UI-Dateien.
- Keine `Sparkles`-Referenzen mehr in `src/`.

## 9. Status

- **Phase**: Paket 1–7 implementiert, Paket 8 abgeschlossen.
- **Nächster Schritt**: Visuelles Review, Live-Test im Browser oder weitere Detail-Feinschliffe.
