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

## Station 6 — Zeiterfassung → Rechnung (headless)

| Prüfpunkt                             | Ergebnis | Detail                                                                                                                                                                                                 |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/time` Zeitbuchung auf Akte | ✅       | 201, Eintrag mit Anwalt, Satz, Tätigkeit.                                                                                                                                                              |
| Rechnung schnell erstellen (Dialog)   | ✅       | Akte wählen → offene Buchungen, Vorschau, Nummer `R-2026-0001`; Rechnung erscheint als Entwurf in der Liste.                                                                                           |
| USt 19 % (deutsch) auf AT-Rechnung    | 🔧       | Satz hing am Tarifmodell (RATG → 20 %, sonst 19 %); jetzt nach Land (`vatRateFor`): AT 20 %, DE 19 %, CH 8,1 %, Kleinunternehmer 0. Vorschau nutzte hart 19 %. Verifiziert: 500 € → 100 € USt → 600 €. |
| RVG-Rechner im AT-Dialog              | 🔧       | Deutsche Gebührenordnung (API im Pilot mit 410 abgeschaltet) war weiter sichtbar; nur noch bei Tarifmodell RVG.                                                                                        |
| Vorschau „Kunde —"                    | ⚠️       | Mandant wird in der Vorschau nicht aufgelöst, in der Liste schon.                                                                                                                                      |
| Stundensatz-Feld im Onboarding        | ⚠️       | Vorbelegt mit 220; Tippen hängt an (QA-Kanzlei stand auf 220.250 €/h), keine Plausibilitätsgrenze. Feld beim Fokus selektieren + Obergrenze.                                                           |

## Station 7 — Mandantenportal (headless)

| Prüfpunkt                                                 | Ergebnis | Detail                                                                                                                                                                                                       |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portal freigeben + Link erzeugen (`/api/portal/generate`) | ✅       | Token-URL `/portal/<token>` (case_slug, brain_id, exp).                                                                                                                                                      |
| Link ohne Login öffnen                                    | 🔧       | **Redirect auf `/at/login`**: `useLang()` → `useMe()` → 401 → globaler Redirect im API-Client. Jetzt: 401-Redirect nur in `/dashboard`, `/ops`, `/admin`; `useMe` auf `/portal`, `/at`, `/join` deaktiviert. |
| Mandantensicht                                            | ✅       | Akte, Beteiligte, Dokumente, Upload, Nachrichten, EN-Umschalter; keine Konsolenfehler.                                                                                                                       |
| Dokumentsichtbarkeit                                      | ⚠️       | Portal listet das hochgeladene Kündigungsschreiben ohne explizite Freigabe pro Dokument — Produktentscheidung (Freigabe-Flag je Dokument?).                                                                  |

## Station 4 — Assistent mit echtem Modell (Blocker: Provider-Guthaben)

| Prüfpunkt                                  | Ergebnis | Detail                                                                                                                                                                                                                                     |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine-Modelle auf Claude umgestellt       | ✅       | `models.tier.*`, `models.think`, `models.default` in der Engine-DB-Config auf `openrouter:anthropic/claude-sonnet-4.6` / `claude-haiku-4.5` (Prod-Provider). Engine läuft jetzt aus `server/` (Launch-Config), damit `server/.env` greift. |
| Anthropic direkt                           | ⛔       | Schlüssel gültig, Konto ohne Guthaben („credit balance too low", HTTP 400).                                                                                                                                                                |
| OpenRouter (Haupt- und Fallback-Schlüssel) | ⛔       | Beide gültig, beide ohne Guthaben (402 „Insufficient credits"; Verbrauch 475 $ bzw. 9 $). **Blocker für alle KI-Stationen — und für Prod, falls dieselben Schlüssel dort laufen.**                                                         |
| Fehlermeldung in der App                   | 🔧       | Die Engine lieferte bei Abrechnungsfehlern „(no LLM available — set anthropic_api_key …)" als Antwort mit HTTP 200; jetzt trägt sie die echte Ursache („Insufficient credits …").                                                          |

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

## Headless-Lauf über Arbeitsräume (Kalender, Aufgaben, Kontakte, Recherche, Assistent, Einstellungen, Portal)

| Prüfpunkt                                           | Ergebnis | Detail                                                                                                                                                 |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/dashboard/briefing` 400 auf jeder Seite  | 🔧       | Ursache: `language: "at"` (useLang liefert „at" für de-AT); 12 KI-Routen akzeptierten nur de/en → `uiLanguageSchema` (`683555a682`).                   |
| Kalender: `403 GET /api/outlook/calendar`           | 🔧       | Outlook-Abfrage nur für Admins erlaubt, lief aber für jede Rolle → jetzt rollenabhängig deaktiviert.                                                   |
| Recherche: Standard „🇩🇪 Deutschland", DE/CH wählbar | 🔧       | AT-Pilot: Standard „at", Auswahl AT/EU; Filter gespeicherter Recherchen ebenso.                                                                        |
| Kontakte leer trotz Parteien in drei Akten          | ⚠️       | Mandant/Gegner aus dem Akten-Wizard werden nicht als Kontakte angelegt (Detailseite: „Stammdaten — Auswählen — erstellen"). Produktentscheidung nötig. |
| Einstellungen: Badge „Benachrichtigung fehlt"       | ⚠️       | Warnlabel (`settings.notification_warning_label`) auf Kanzlei/E-Rechnung; für Anwälte unklar, Tooltip erklärt es. Wording prüfen.                      |
| Aufgaben, Portal-Vorschau, Assistent                | ✅       | Laden ohne Fehler; Assistent begrüßt mit vollem Namen.                                                                                                 |

## Station 8 — Einstellungen, Team, Audit, Workflows (headless)

| Prüfpunkt                                      | Ergebnis | Detail                                                                                                                                                                                     |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Einstellungen → Kanzlei, Account, Team         | ✅       | Laden ohne Fehler; Team-Anlage sichtbar; Plan/Nutzung korrekt.                                                                                                                             |
| Sicherheit: `403 /api/admin/ip-allowlist`      | 🔧       | Admin-API für jede Rolle abgefragt; Karte und Request jetzt nur für Admins. Karten-Copy ist Englisch („Inactive", „No IPs configured") — ⚠️ übersetzen.                                    |
| Audit-Log „0 Einträge" trotz 658 Aktionen      | 🔧       | Seite las Engine-Seiten vom Typ `audit_log` (schreibt niemand); Route liest jetzt die Postgres-Audit-Tabelle je Kanzlei (`8154bffcea`).                                                    |
| Audit-Einträge ohne Kanzlei/Nutzer             | 🔧       | `createHandler` übergab weder Brain noch Nutzer → alle Zeilen unter „system", außerhalb der Kanzlei-Hash-Kette. Jetzt brainId/userId/E-Mail/IP. Altbestand bleibt „system" (auch in Prod). |
| Audit-Rauschen durch Benachrichtigungs-Polling | 🔧       | `notifications.list` alle paar Sekunden protokolliert → entfernt.                                                                                                                          |
| Workflows-Seite stürzt ab                      | 🔧       | Seed-Status „draft" unbekannt → `.icon` von undefined. Status „Entwurf" ergänzt, Lookup mit Fallback (`2a3e53dc98`).                                                                       |
| Workflow-Vorlage „nach deutschem Recht"        | 🔧       | → österreichisches Recht (ABGB, UGB, KSchG).                                                                                                                                               |

## P1 behoben: Mandantenportal zeigt nur freigegebene Dokumente

Vorher lieferte der Portal-Endpunkt die komplette Akten-Seite (Zeiten, Notizen, Strategie,
Zweitprüfungs-Spur) und alle Dokumente. Jetzt:

- `DocumentEntry.portal_visible` (Standard **nicht sichtbar**; privilegierte Dokumente nie);
  Mandanten-Uploads sind automatisch sichtbar.
- `buildPortalCaseView()` liefert nur Whitelist-Felder (Aktenzahl, Status, Parteien,
  Rechtsgebiet, Gericht, Sachverhalt, Ansprüche, Fristen ohne Prüfspur, freigegebene Dokumente);
  der Portal-Chat gründet nur auf freigegebenen Dokumenten.
- Dokumente-Tab: Umschalter „Intern / Mandant" je Dokument.
- Headless verifiziert: ohne Freigabe „Noch keine Dokumente", nach Freigabe sichtbar.

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
- **Copy-Reste:** beA aus Kommunikation (Tab + Copy), Fristen-Statkarte, Sidebar-Tooltip und Eingangs-Beschreibung entfernt; Freigabe-Status und IP-Allowlist-Karte übersetzt.

## Phase 2 — Playwright-Mock-Suite auf dem Prod-Build

Lauf: `SUBSUMIO_E2E_PORT=3100 SUBSUMIO_E2E_DIST_DIR=.next-e2e npx playwright test --project=chromium`
(eigener Build in `.next-e2e`, eigener Port, damit Dev-Server und Engine weiterlaufen).

| Ergebnis       | Zahl        |
| -------------- | ----------- |
| bestanden      | 590         |
| übersprungen   | 3           |
| fehlgeschlagen | 1 → behoben |

- **Der eine Fehler war der Spec, nicht das Produkt:** `r1-features.spec.ts` erwartete die
  IP-Allowlist-Karte für einen frisch registrierten Anwalt. Die Karte ist seit heute
  admin-only (ihre API verlangt `connector.read`, Nicht-Admins bekamen ein Dauer-Toast) und
  heißt „IP-Allowlist". Spec prüft jetzt 2FA für alle und die Abwesenheit der Karte für
  Nicht-Admins.
- **Nebenfund beim Serial-Lauf:** jeder Benachrichtigungs-Insert (`src/lib/comments.ts`)
  scheiterte auf Postgres, weil `ON CONFLICT (id)` nicht zum zusammengesetzten Primärschlüssel
  `(id, user_id, brain_id)` passte — Kommentare erzeugten still keine Benachrichtigung.
  Behoben (Commit 207e785f8c), Regressionstest gegen die echte Auth-DB.
- Real-Engine-Modus (`SUBSUMIO_E2E_REAL_ENGINE=1`) steht noch aus, bis Provider-Guthaben da ist
  (KI-Specs würden sonst nur die Graceful-Degradation testen).

## Noch offen im Skript

Alle acht Stationen und die sechs Arbeitsräume sind durchgespielt. Offen bleiben nur die
KI-Stationen mit echtem Modell (4, Strategie, Briefing, Fristen-Erkennung) — Blocker
Provider-Guthaben.

## Nachtrag — ⚠️-Punkte aus den Stationen abgearbeitet (headless verifiziert)

- **Dokumentansicht statt Brain-Seite:** Ein Akten-Dokument zeigt jetzt oben „Original
  öffnen" (im Browser, `?inline=1`), „Herunterladen", „Zur Akte" und für PDFs eine
  eingebettete Vorschau des Originals; der extrahierte Text bleibt per Umschalter erreichbar.
  Brotkrume führt zurück in den Dokumente-Tab der Akte. Der Typ-Badge zeigte bisher die
  interne Brain-ID (`page.source`) — jetzt den Seitentyp. Zugriffe auf das Original bleiben
  als `document.download` im Audit.
- **Rechnungsvorschau „Kunde —":** Der Dialog las ein nie befülltes Alt-Feld `client`
  statt `clientName`. Vorschau zeigt jetzt den Mandanten (QA-2026-003 → „Petra Novak").
- **404-Rauschen:** Verjährungs- und Institutionen-Karte in der Aktenübersicht holen ihre
  Analyse-Seiten über den Batch-Read (200 mit leerem Ergebnis) statt per Einzel-GET (404 in
  Konsole und Server-Log bei jeder Akte ohne Scan). Aktenübersicht: 0 fehlgeschlagene Requests.
- **Audit-Log-Rauschen:** `pages.batch_read`/`pages.batch_list` wurden bei fast jedem
  Seitenaufruf protokolliert (283 Einträge in der Auth-DB, ohne Aktionsbezug; der Einzel-GET
  war nie auditiert). Beide Lese-Routen protokollieren nicht mehr.
- **Badge in den Einstellungen:** „Benachrichtigung fehlt" → „E-Mail nicht eingerichtet"
  (der Tooltip erklärt SMTP).
- **Doppelte Listenabrufe pro Seitenaufruf** (gemessen am Prod-Build, ohne StrictMode; vier
  Seiten: Cockpit, Akten, Fristen, Aktendetail):

  |         | API-Requests | davon redundant |
  | ------- | ------------ | --------------- |
  | vorher  | 73           | 12              |
  | nachher | 53           | 0               |

  Ursachen und Fixes: (1) Desktop- und Mobil-Copilot mounten je ein Chat-Panel, beide luden
  die Aktenliste; Akten-Daten- und Akten-Detail-Kontext luden dieselbe Aktenseite → der
  API-Client teilt jetzt identische, gleichzeitig gestartete Lese-Requests (GET sowie
  Batch-Reads; Mutationen nie, Aufrufer mit eigenem AbortSignal nie; nur der laufende
  Request wird geteilt, nichts wird danach gecacht). (2) Cockpit-Karte und Copilot
  erzeugten je ein eigenes Briefing — **zwei LLM-Aufrufe pro Cockpit-Aufruf** — jetzt ein
  gemeinsamer Lader mit Tages-Cache (4 h) und geteiltem laufenden Request. Der Copilot las
  außerdem die Kennzahlen aus der falschen Ebene der Antwort (immer 0). (3) Zwei
  Brain-Selector-Hooks holten `/api/brains` doppelt. (4) Sachverhaltsprüfungs-Hinweis:
  Cache-Bedingung war `&&` statt `||` (Aktenwechsel wurde ignoriert).
