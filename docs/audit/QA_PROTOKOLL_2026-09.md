# QA-Protokoll Anwaltstag — lokaler Vollstack

Stand: 2026-09-16. Umgebung: `next dev` (webpack) auf :3000, Engine 0.42.38.0 auf :31429
(Postgres, Ollama-Embeddings 768d, Chat `qwen2.5:1.5b`), Docker-Postgres `subsumio-pg16`.
Testkonto: `techlead-qa@subsumio.local` (lokale Dev-DB, keine echten Daten).
Skript: `docs/ANWALTSTAG-TESTSCRIPT.md`. Bewertung: ✅ bestanden · 🔧 Fehler gefunden und
behoben (Commit) · ⚠️ offen · ℹ️ Hinweis.

## Station 1 — Signup → Onboarding → Cockpit

| Prüfpunkt                               | Ergebnis | Detail                                                                                                    |
| --------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `/at` Landing, Cookie-Banner            | ✅       | Rendert; „Ablehnen" vorhanden.                                                                            |
| `/at/signup` Konto anlegen              | ✅       | Landet direkt im Onboarding.                                                                              |
| Hydration-Fehler auf jeder Seite        | 🔧       | CSP-Nonce-Mismatch (`98ac6fc9d8`). Konsole jetzt leer auf `/at` und `/dashboard`.                         |
| Onboarding Schritt 1–7                  | ✅       | Alle Schritte durchlaufbar, Überspringen/Später funktioniert.                                             |
| Schritt 2 Copy „befuellen"              | 🔧       | → „befüllen" (`a1071d1b15`).                                                                              |
| Schritt 3 WhatsApp-Platzhalter „+49 …"  | 🔧       | → „+43 1 2345678" (`a1071d1b15`).                                                                         |
| Schritt 6 „Erste Frage"                 | 🔧       | **402 insufficient_credits** — neue Konten hatten 0 Credits. Trial-Guthaben (`c5310c10e2`).               |
| Schritt 6 Grounding-Invariante          | ✅       | `useGroundedAnswer` + `CitationPanel` im Code verdrahtet (Antwort mit lokalem Modell unbrauchbar, s. u.). |
| Cockpit Begrüßung „Guten Tag, Dr."      | 🔧       | Titel wurde als Vorname genommen → `firstNameOf()` (`a1071d1b15`).                                        |
| KI-Morgenbriefing zeigt rohes Markdown  | 🔧       | `markdownToPlainText` (`a1071d1b15`).                                                                     |
| Demo-Akte „Berger ./. Muster Werk GmbH" | ✅       | Vorhanden, mit Demo-Frist „Anfechtungsfrist" und Posteingang-Badge.                                       |

## Station 2 — Akten

| Prüfpunkt                                                | Ergebnis | Detail                                                                                                                  |
| -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Aktenliste                                               | ✅       | Filter-Tabs, Tabelle, Demo-Akte sichtbar.                                                                               |
| Neue Akte, Schritt 1–3                                   | 🔧       | „Weiter" auf Schritt 2 legte die Akte bereits an (gleicher Button-Knoten wurde zu `submit`), danach 409 (`14bec9e80f`). |
| Redirect nach Anlage                                     | 🔧       | Slug groß/klein-Abweichung zur Engine → 404 (`14bec9e80f`).                                                             |
| Enter in Feld auf Schritt 1/2                            | 🔧       | Hätte die Akte mit halben Daten angelegt (`14bec9e80f`).                                                                |
| Breadcrumb „Neue Akte > Neue Akte"                       | 🔧       | → „Akten > Neue Akte" (`14bec9e80f`).                                                                                   |
| `/api/pages/new` 404 auf der Anlage-Seite                | 🔧       | Copilot hielt `new` für einen Akten-Slug (`14bec9e80f`).                                                                |
| Detailseite, 11 Tabs                                     | ✅       | Nach Server-Neustart; ein `MatterTabBar`-Absturz war ein veraltetes HMR-Modul, nicht reproduzierbar.                    |
| Kollisionsprüfung beim Anlegen                           | ✅       | Server-Check läuft (409 `conflict_detected` bei Treffer), Waiver nur admin/lawyer.                                      |
| Tippfehler „AKTSDETAILS"                                 | ⚠️       | Überschrift auf Schritt 1 → „Aktendetails".                                                                             |
| Doppelte Listen-Requests                                 | ⚠️       | `/api/pages?type=legal_case` 4–6× pro Seitenaufruf; ~100 API-Calls pro Cockpit-Load. Query-Deduplizierung (Phase 2).    |
| 404-Rauschen `limitation-scan`, `institution-checklists` | ⚠️       | Leere Ressourcen sollten 200 + leer liefern statt Konsolenfehler.                                                       |

## Station 3 — Upload → Extraktion → Akte

| Prüfpunkt                                   | Ergebnis | Detail                                                                                                   |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/upload` (PDF, `case_slug`, CSRF) | ✅       | 200, `extraction_status: ready` (Textlayer), `case_reconciliation.ok`, Analyse `queued`.                 |
| Dokumente-Tab der Akte                      | ✅       | Dokument gelistet (Hochgeladen, 1 KB), Header „Doku: 1".                                                 |
| Analyse-Warteschlange                       | ✅ / ℹ️  | Läuft nur per Cron (`/api/cron/post-upload-drain`, Prod: alle 2 min). Lokal manuell ausgelöst: 3 done.   |
| Dokumentansicht („Öffnen")                  | ⚠️       | Generische Brain-Seite mit Slug und `brain_…`-ID; kein Original-PDF-Viewer. Für Anwälte zu technisch.    |
| UI-Dropzone                                 | ℹ️       | Nicht per eingebettetem Browser testbar (keine Dateiauswahl); Playwright-Spec `upload-flow` deckt es ab. |

## Station 3b/6/7 — Posteingang, Kommunikation, Freigaben, Rechnungen (headless)

| Prüfpunkt                                                   | Ergebnis | Detail                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posteingang (`/dashboard/intake`) leer, Cockpit „Eingang 1" | 🔧       | **Systemisch:** Engine hält `type` als Spalte und entfernt es aus dem Frontmatter (0 von >5.000 Seiten haben `frontmatter.type`); 14 Parser prüften `fm.type` und lieferten immer `null` — Mandatsaufnahme, Workflows, Dokumentenanfragen, Klausel-Annotationen, Copilot-Memory, Eval-Reviews, Agent-Aktionen. Zentraler Helfer `pageTypeOf()` + alle Stellen umgestellt. |
| Kommunikation (`/dashboard/communications`)                 | ⚠️       | Lädt; Copy/Tabs nennen „beA" (AT-Pilot).                                                                                                                                                                                                                                                                                                                                  |
| Freigaben (`/dashboard/review-queue`)                       | ✅ / ⚠️  | 4 Akten „Ausstehend" (Kollisionsprüfung offen); Labels „Awaiting Review", „Needs Human Review" sind Englisch in der deutschen UI.                                                                                                                                                                                                                                         |
| Rechnungen (`/dashboard/invoicing`)                         | ✅       | Lädt leer mit Kennzahlen; Erstellung folgt in Station 6.                                                                                                                                                                                                                                                                                                                  |
| `POST /api/dashboard/briefing` 400                          | ⚠️       | Einmalig beim Seitenaufruf gesehen, direkt und im Wiederholungslauf 200 — auf dem Prod-Build nachprüfen.                                                                                                                                                                                                                                                                  |

## Station 5 — Fristen (aus der Akte)

| Prüfpunkt                                  | Ergebnis | Detail                                                                                                |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| „Frist zu dieser Akte hinzufügen" → Dialog | ✅       | Dialog mit Typ, Fristenkette/Regel, Rechtsgrundlage, ERV-Zustelldatum, Notfrist (Vier-Augen).         |
| Frist landet in der Akte                   | 🔧       | `case_slug` fehlte (Preset kam nach Mount) → Frist hing an keiner Akte (`052d7bf385`).                |
| Liste aktualisiert ohne Reload             | 🔧       | Event `subsumio:deadline-created` → Kontexte laden neu (`052d7bf385`).                                |
| Header „Fristen: x/y" vs. Tab-Liste        | 🔧       | Header zählte nur Frontmatter-Fristen → jetzt Fristen-Read-Model (`052d7bf385`).                      |
| Dialog ohne barrierefreien Namen           | ⚠️       | `dialog` ohne `aria-label`; Sidebar-Links ohne Namen (Kollisionsprüfung u. a.) — axe-Lauf in Phase 2. |
| Verwaiste Frist aus dem ersten Versuch     | ℹ️       | `legal/deadlines/2026-10-14-berufungsfrist-464-zpo-*` ohne Akte in der Dev-DB; irrelevant für Prod.   |

## Station 5b — Fristen-Seite und Fristenbuch

| Prüfpunkt                                        | Ergebnis | Detail                                                                                                           |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Fristenbuch: Liste, Kontrollliste, CSV/ICS       | ✅       | 4–6 Fristen aus allen Akten, Filter nach Zeitraum/Akte.                                                          |
| Fristenbuch „Akte"-Spalte zeigt Slug             | 🔧       | Titel statt Slug, Read-Model füllt `case_title` (`efebf4bb19`).                                                  |
| „Vorfrist" = Fristdatum                          | 🔧       | 0 Tage Vorlauf für Nicht-Notfristen → jetzt 7 Tage Standard (`efebf4bb19`).                                      |
| Fristen-Seite „Freigeben"                        | 🔧       | **400 „title Required"** — jedes Metadaten-Update über `updatePage` scheiterte still (`e5657d8a9b`).             |
| Fristen-Seite „Erledigt"                         | ✅       | Nach dem Fix: Zähler Erledigt (1), Ausstehend (3).                                                               |
| Notfrist anlegen → Badge, kein direktes Erledigt | ✅       | Notfrist-Badge, „Zweitprüfung ausstehend", nur Freigeben + Vier-Augen-Kontrolle.                                 |
| Vier-Augen: Selbstbestätigung                    | ✅ / 🔧  | Serverseitig/clientseitig blockiert; Modal blieb ohne Hinweis offen → Inline-Sperre + Button deaktiviert.        |
| Tippfehler „Zweiprüfung"                         | 🔧       | → „Zweitprüfung" (3 Stellen).                                                                                    |
| Stat-Karte „beA" auf der Fristen-Seite           | ⚠️       | Deutscher Kanal im AT-Pilot; Karte ausblenden oder durch „ERV/webERV" ersetzen.                                  |
| Dev-Server                                       | ℹ️       | Webpack-Dev ließ Tabs nach HMR ohne Hydration hängen; Preview läuft jetzt mit Turbopack (`.claude/launch.json`). |

## Querschnitt

- **KI-Qualität lokal:** `qwen2.5:1.5b` halluziniert (Berufungsfrist → „Verfahrenszeitraumgesetz",
  „§ 469 StGB") und läuft in Endlosschleifen (mehrere tausend Zeichen). Für die KI-Stationen
  (4, Strategie, Briefing) muss die Engine lokal auf ein echtes Modell (OpenRouter/Anthropic)
  umgestellt werden — Phase 3. Prüfen: Ausgabe-Token-Limit im `think`-Pfad.
- **„Lade Status…"-Hänger im eingebetteten Browser:** kein Produktfehler. React 19.2 enthüllt
  gestreamte Suspense-Grenzen und startet die Hydration per `requestAnimationFrame`; ist der
  Browser-Bereich der Claude-App nicht sichtbar, feuert rAF nie (`$RB` bleibt gefüllt, kein
  React-Fiber, keine API-Calls). Headless-Playwright (sichtbarer Viewport) lädt jede Seite
  sofort. Kein Service-Worker beteiligt (keine Registrierung, kein Cache).
- **Port 3000 doppelt belegt:** Während der QA startete ein fremdes Projekt (`Trustwallet`,
  Vinxi) einen Dev-Server auf `[::1]:3000`; Chrome löst `localhost` zuerst nach IPv6 auf und
  landete auf der falschen App. QA läuft daher gegen `127.0.0.1:3000`.
- **Copy-Reste:** Tooltip „Unified Inbox für beA, WhatsApp, …" nennt beA (AT-Pilot).

## Noch offen im Skript

Station 3 (Upload/Posteingang), 4 (Assistent mit echtem Modell), 5b (Fristenbuch, Wiedervorlagen,
Kalender), 6 (Rechnung), 7 (Mandantenportal), 8 (Einstellungen, Demo-Cleanup), danach die
sechs Arbeitsräume vollständig.
