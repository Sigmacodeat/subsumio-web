# Subsumio Dashboard Re-Audit (v2) — Verifikation & nächste Optimierungsstufe

> **Datum:** 2026-07-04
> **Vorgänger:** `DASHBOARD_UX_AUDIT_2026-07-03.md` (Blueprint mit 5 Phasen)
> **Methodik:** Diff-Verifikation jedes Blueprint-Punkts gegen den Working Tree (163 geänderte Dateien, uncommitted), Typecheck, Unit-Tests, Reachability-Analyse aller Routen
> **Verifikationsstand:** `tsc --noEmit` = 0 Fehler · Unit-Tests sidebar/guided-tour/chat-input = 31/31 grün · neue CI-Stufe `playwright-a11y` verdrahtet

---

## 1. Ergebnis: Blueprint zu ~90 % umgesetzt — Score 82 → 90

| Bereich          | v1     | v2     | Beleg                                                                                                                       |
| ---------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Sidebar / IA     | 68     | **90** | 5 Primary, 8 Sektionen ≤7 Items, Farb-Bug behoben, Keywords, Icons entdoppelt, Rollen-Trim, Directory-Seite                 |
| Topbar & Suche   | 78     | **88** | Suchfeld → föderierte ⌘K-Palette (Akten/Kontakte/Fristen/Dokumente/Wissen), Notifications mit Deep-Link zur Akte            |
| Copilot          | 84     | **92** | Default Chat + Persistenz, Esc nur Mobile, Realtime-Activity (5 Events), ~10 neue Route-Kontexte, Fullscreen-Knopf          |
| Main / Home      | 88     | **91** | router.push-Fix, i18n-Placeholder, dynamic imports                                                                          |
| Barrierefreiheit | 74     | **88** | WCAG-2.1.4-Toggle (Settings + Shortcut-Hilfe), 10–11px→12px-Pass, Kleinstziele entfernt, a11y-/Keyboard-/Visual-Specs in CI |
| Konsistenz       | 80     | **89** | Orphans assistant/query gelöscht, hartkodierte Strings → t(), Matter-Tab „Strategie"                                        |
| **Gesamt**       | **82** | **90** | —                                                                                                                           |

Alle 9 Phase-0-Fixes, der komplette Phase-1-IA-Umbau, Phase 2 bis auf einen Punkt, Phase 3 vollständig, Phase 4 strukturell (Specs + CI-Job vorhanden, Läufe gegen laufende App noch offen).

---

## 2. Was noch fehlt (das nächste Optimierungspaket)

> **Umsetzungsstand (2026-07-04, gleicher Tag):** R1–R8 sind umgesetzt und verifiziert
> (`tsc --noEmit` = 0 Fehler, ESLint 0 Warnings auf allen berührten Dateien,
> vitest dashboard+chat = 56/56 grün). Details pro Punkt unten als ✔-Vermerk.
> Offen bleibt nur **R9** (Playwright-Lauf gegen die laufende App — die Specs
> provisionieren eigene Testnutzer über /signup und brauchen den vollen Stack;
> der CI-Job `playwright-a11y` deckt das ab).

### P1 — vor dem Ship

**R1 ✔ behoben — „Altlasten" ist jetzt eine Orphan-Route.** `/dashboard/altlasten` existiert (und wurde sogar weiterentwickelt), hat aber **0 Referenzen** in Sidebar, Palette, Directory, Cases-Seite oder Copilot. Der Blueprint sah „Altlasten → Filter-Tab in `/dashboard/cases`" vor — umgesetzt wurde nur die Entfernung aus der Nav (das Keyword `altlasten` am Cases-Item führt Suchende auf die Akten-Liste, nicht zur Altlasten-Ansicht). Fix: Tab/Segment „Altlasten" in der Akten-Liste, das die Route verlinkt, + Palette-Eintrag.

**R2 ✔ behoben — Chat-Session-Handoff ist nur ein Link.** Der neue Maximize-Knopf im Copilot macht `router.push("/dashboard/chat")` — die laufende Konversation geht verloren. Blueprint-Kern war „gleiche Session-ID": Session-Parameter mitgeben (`/dashboard/chat?session=<id>`) und in der Vollseite laden ([copilot-sidebar.tsx:1625](src/components/chat/copilot-sidebar.tsx:1625), [chat-session-store.ts](src/components/chat/chat-session-store.ts)).

**R3 ✔ behoben — Palette & Directory sind nicht rollenbasiert.** Die Sidebar trimmt Admin-Items für Nicht-Admins (sauber umgesetzt), aber Command-Palette und Directory-Seite bauen auf `navForIndustry(industry)` **ohne** `role` — Nicht-Admins sehen dort weiterhin alle 20+ Admin-Routen. Inkonsistente Sichtbarkeit; `role` in beide durchreichen und denselben Trim anwenden.

### P2 — Feinschliff

**R4 ✔ behoben — Totcode in der Topbar.** `searchQuery`, `debouncedQuery`, `useSearch`, `searchItems`, `searchActiveIdx`, `searchOpen` sind nach dem Palette-Umbau funktionslos (Input ist readOnly, value=""), der `useSearch`-Hook bleibt aber gemountet. Entfernen — [topbar.tsx:82–110](src/components/dashboard/topbar.tsx:82).

**R5 ✔ behoben — Palette-Trigger als readOnly-Input.** `onFocus` öffnet die Palette und blurred sofort. Wer per Tab durch die Topbar navigiert, öffnet die Palette unabsichtlich; Focus-Steal + Blur desorientiert Screenreader. Besser: `<button>` im Input-Look (onClick statt onFocus) — [topbar.tsx:452](src/components/dashboard/topbar.tsx:452).

**R6 ✔ behoben — Interaktives Element im Button.** Die Notification-Zeile ist jetzt ein `<button>`, der Mark-Read-Knopf darin ein `<span role="button">` — interaktiver Nachfahre in einem Button ist invalides HTML/ARIA, axe wird es flaggen (und der neue CI-a11y-Job damit potenziell rot). Zeile als `<div>` mit zwei Geschwister-Controls (Link-Fläche + Mark-Read-Button) strukturieren.

**R7 ✔ behoben — Keine Redirects für gelöschte Routen.** `/dashboard/assistant` und `/dashboard/query` wurden entfernt (korrekt), aber ohne Redirect — alte Bookmarks/Deep-Links laufen in 404. `next.config`-Redirects auf `/dashboard/chat` bzw. `/dashboard/brain`.

**R8 ✔ behoben — beA-„Tab" im Posteingang ist ein Link-Ausbruch.** Die Kanal-Tabs (WhatsApp/E-Mail filtern die Liste) enthalten einen beA-Tab, der auf `/dashboard/bea` wegnavigiert — ein Tab, der das Pattern bricht. Entweder beA-Eingänge in die Inbox-Liste einbetten oder den Tab visuell als externen Sprung kennzeichnen (Icon ↗).

**R9 — Neue Playwright-Specs sind ungelaufen.** `keyboard-walkthrough.spec.ts`, `visual-regression.spec.ts`, erweiterte `accessibility.spec.ts` + CI-Job existieren, aber ein lokaler Lauf gegen die laufende App steht aus (insb. wegen R6, das axe vermutlich findet). Vor dem Ship: `bun run test:e2e -- --grep "a11y|keyboard|visual"` gegen den Dev-Server.

### Verifikation vor Ship (Pflicht)

- [x] Unit-Lauf dashboard+chat (`vitest run`) — 56/56 grün (voller Lauf im Ship-Zug)
- [x] Production-Build (`next build`) — Exit 0
- [ ] Playwright-Suite inkl. neuer Specs (R9)
- [ ] 163 Dateien sind uncommitted — als Ship-Zug committen (Umbau ist zu groß für „nebenbei")

---

## 3. Über Harvey hinaus (nächste Stufe, nach dem Ship)

Mit R1–R9 ist die Harvey-Parität auf UX-Ebene erreicht: Assistant-first (Copilot default Chat), ≤7 Top-Level, föderierte Suche, Matter-Kontext, Rollen-Nav. **Übertreffen** heißt jetzt:

1. **Recherche-Hub v2:** Der Hub verlinkt heute auf Unterseiten (Rechtsprechung, Normen, Präzedenz, Kommentare). Nächste Stufe: eine Suchanfrage, föderierte Treffer aller Quellen in EINER Ergebnisliste mit Quellen-Facetten — das hat auch Harvey nicht für DACH-Recht.
2. **Fristen-Intelligenz sichtbar machen:** Proactive Alerts existieren im Copilot; ausbauen zu einem „Fristen-Radar" (Topbar-Badge mit schwerster Frist, Ein-Klick „Fristverlängerung entwerfen" als Copilot-Action). Anwaltshaftung ist das Kaufargument Nr. 1 im DACH-Markt.
3. **Rollen-Defaults fürs Widget-Board:** Die Personalisierung ist einmalig im Markt — sie wirkt aber erst, wenn ReFa/Anwalt/Partner unterschiedliche sinnvolle Startkonfigurationen bekommen (analog zum Admin-Trim der Nav).
4. **Guided Tour & Onboarding an neue IA anpassen:** Tour-Steps und Dashboard-Guide gegen die neuen Sektionsnamen/Positionen prüfen — nach einem IA-Umbau ist veraltetes Onboarding schlimmer als keines.
5. **Messen statt glauben:** 5-Sekunden-Findability-Test (Top-10-Aufgaben) vor/nach dem Umbau; Adoption-Analytics um „Suchpfad vs. Nav-Pfad"-Metrik erweitern — belegt den Harvey-Vergleich mit Daten.

---

## 4. Blueprint-Verifikationstabelle (v1 → Status)

| Blueprint-Punkt                                | Status              | Beleg                                                |
| ---------------------------------------------- | ------------------- | ---------------------------------------------------- |
| P0 Farb-Bug PRIMARY_COLOR_VARS                 | ✅                  | 5 Items / 5 Farben, konsistent                       |
| P0 Suche Enter≠Klick                           | ✅ (obsolet)        | Feld öffnet jetzt Palette                            |
| P0 Home router.push                            | ✅                  | page.tsx                                             |
| P1 Notifications klickbar + Deep-Link          | ✅ / ⚠️ R6          | `?tab=deadlines`-Link da; Nested-Interactive-Problem |
| P1 Copilot Default Chat + Persistenz           | ✅                  | localStorage `copilot-panel-mode`, Fallback `"chat"` |
| P2 Esc nur Mobile                              | ✅                  | Desktop-Zweig entfernt                               |
| P2 Hartkodierte Strings → t()                  | ✅                  | Greps leer                                           |
| P2 Orphans assistant/query                     | ✅ / ⚠️ R7          | gelöscht, aber ohne Redirects                        |
| P2 Matter-Tab „Strategie"                      | ✅                  | DE+EN                                                |
| P1 Nav-Restrukturierung (5 Primary, Werkbänke) | ✅ / ⚠️ R1          | Altlasten-Reintegration fehlt                        |
| P1 Recherche-Hub                               | ✅ (v1-Ausbaustufe) | Hub-Seite verlinkt Quellen                           |
| P1 Admin rollenbasiert                         | ✅ / ⚠️ R3          | Sidebar ja, Palette+Directory nein                   |
| P2 Icon-Eindeutigkeit                          | ✅                  | ~30 neue eindeutige Icons                            |
| P2 Directory-Seite                             | ✅                  | `/dashboard/directory`, durchsuchbar                 |
| P2 Sidebar-Keywords                            | ✅                  | alle Items                                           |
| P2 Sidebar-Tests                               | ✅                  | +107 Zeilen, 9/9 grün                                |
| P1 Palette föderiert                           | ✅                  | brain+cases+contacts+deadlines+docs parallel         |
| P1 Topbar → Palette                            | ✅ / ⚠️ R5          | readOnly-Input-Pattern                               |
| P1 Posteingang-Kanäle                          | ✅ / ⚠️ R8          | beA als Link-Tab                                     |
| P1 Chat-Session-Vereinheitlichung              | ❌ R2               | nur Link, Session geht verloren                      |
| P2 Copilot-Route-Kontexte                      | ✅                  | ~10 neue Patterns                                    |
| P2 Activity-Feed Realtime                      | ✅                  | 5 useRealtime-Events                                 |
| P1 WCAG 2.1.4 Toggle                           | ✅                  | Settings + Shortcut-Hilfe                            |
| P2 Zielgrößen ≥24px                            | ✅                  | w-3.5-Tab entfernt                                   |
| P2 Typografie ≥12px                            | ✅                  | 10/11px → xs in Chat/Copilot/Topbar                  |
| P2 Kontrast-Audit                              | ❔                  | nicht verifizierbar aus Diff — offen halten          |
| P2 Quick-Create Mobile                         | ✅                  | Create-Aktionen in Tab-Bar                           |
| P1 Playwright/axe in CI                        | ✅ / ⚠️ R9          | Job da, Lauf ungetestet                              |
