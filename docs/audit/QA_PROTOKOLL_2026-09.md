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

## Phase 2 — Restpunkte (Konsole, Mobile/Dark, Fehlergrenzen) und Cron-Wahrheit

- **Konsolen-Sweep** über 20 Kernseiten (Cockpit, Akten, Aktendetail + Dokumente + Fristen,
  Fristen, Fristenbuch, Kontakte, Kalender, Aufgaben, Kommunikation, Rechnungen, Zeiterfassung,
  Recherche, Assistent, Einstellungen, Sicherheit, Team, Audit, Upload), je Desktop hell und
  Mobil (390 px) dunkel: **0 Hydration-Warnungen, 0 Seitenfehler, 0 horizontaler Überlauf,
  keine leere Seite.** Einzige Meldung: `[realtime] SSE error (will reconnect)` — fällt nur
  beim Verlassen der Seite (Stream wird beim Navigieren abgebrochen, `net::ERR_ABORTED`); der
  Stream selbst antwortet 200 mit `event: connected`. Kein Produktfehler. Ein 429 auf der
  Audit-Seite stammte vom Sweep-Tempo (Rate-Limit greift).
- **Fehler-/Ladezustände:** 89 von 99 Dashboard-Modulen hatten `error.tsx`/`loading.tsx`; die
  zehn ohne (u. a. Wiedervorlagen, Benachrichtigungen, Aktensuche, Aktenzuweisung) nutzen jetzt
  die gemeinsamen Route-Grenzen.
- **Cron-Wahrheit:** Hetzner fährt supercronic aus `server/deploy/hetzner/crontab` (35 Jobs);
  `vercel.json` (31 Jobs, 18 abweichende oder fehlende Einträge) las kein Deploy mehr →
  entfernt, Abgleich in `docs/deploy/CRON_SCHEDULE.md`. Der Schedule-Test prüft jetzt den
  Crontab und dass jede Cron-Route eingeplant ist. Offen: `/api/cron/autonomous-engine` steht
  in keinem Scheduler (Entscheidung vor dem Piloten), Live-Crontab auf dem Server per SSH
  gegen die Repo-Datei prüfen (Phase 4).

## Phase 3 — Demo-Akte als Seed (verifiziert)

Die Registrierung ruft `provisionBrainAsync`; für die QA-Kanzlei liegen alle vier Seed-Seiten
im Brain: Akte „Demo-Akte: Berger ./. Muster Werk GmbH", eine Frist
(`demo-anfechtungsfrist-berger`), ein Dokument (`demo-kuendigungsschreiben`) und ein
Posteingangs-Element (`demo-eingang-berger`). Neue Kanzleien starten damit nicht leer.

## Phase 2 — Real-Engine-Smoke (Playwright gegen die echte Engine)

Lauf: `SUBSUMIO_E2E_REAL_ENGINE=1` (Engine 127.0.0.1:31429, Wegwerf-Auth-DB `subsumio_e2e`,
Prod-Build auf Port 3100), 15 Spec-Dateien der Kernstationen ohne KI-Aufruf: Smoke, Auth,
Onboarding, Aktenverwaltung, Fristen-Sync (3 UIs + ICS), Rechnungen (2), Portal (2), Upload,
Einstellungen, Kanzlei-Flow, Security-Header, API-Guard-Chain, Suche.

| Ergebnis       | Zahl    |
| -------------- | ------- |
| bestanden      | 94      |
| fehlgeschlagen | 0       |
| Dauer          | 2,3 min |

Die KI-Specs (Assistent, Strategie, Briefing) folgen, sobald Provider-Guthaben da ist.
Engine-URL im Config jetzt `127.0.0.1` statt `localhost` (Engine lauscht nur IPv4;
`SUBSUMIO_E2E_ENGINE_URL` überschreibt).

**Fund aus dem Lauf — versteckte Kopplung an Engine-Migrationen:** Die Web-App fragt die
SaaS-Billing-Tabellen (`saas_orgs`, `saas_credit_balance`, …) über die Auth-DB ab, angelegt
wurden sie aber nur von den Engine-Migrationen (v134–v138) in der Engine-DB. Auf Hetzner ist
das dieselbe Datenbank, in jeder getrennten Installation (lokal, E2E, künftiges Staging mit
eigener Auth-DB) fehlten sie: erste KI-Anfrage → „relation saas_credit_balance does not
exist" (Kreditgate, Trial-Gutschrift, Stripe-Sync). Fix: `src/lib/billing/saas-schema.ts`
trägt die DDL in der Endform und läuft vor dem Kreditgate und der Org-Anlage. Verifiziert
auf einer leeren Postgres: Web-DDL zuerst, danach `gbrain init --url` mit 134
Engine-Migrationen — fehlerfrei, Spalten/Indizes identisch mit der Dev-DB, Engine ergänzt
`chk_sub_plan`. Pflegeregel im Dateikopf: Engine-Änderungen an diesen Tabellen spiegeln.

**Realtime-Client:** Beim Verlassen der Seite (pagehide) wird der SSE-Stream geschlossen
statt „SSE error (will reconnect)" zu loggen und einen Reconnect zu planen.

## Station 4 & Phase 3 — KI-Stationen mit echtem Modell (nach Guthaben-Aufladung)

Engine-Tiers: OpenRouter `anthropic/claude-sonnet-4.6` (think/reasoning/deep) und `claude-haiku-4.5`
(utility/subagent). Direkter Probe-Aufruf: Berufungsfrist § 464 Abs 1 ZPO, vier Wochen — korrekt.
KI-Playwright-Specs im Real-Engine-Modus: **106/106 bestanden** (chat-flows, chat-research,
legal-workflow, review-analytics, misc-dashboard, case-closeout, verification-policy/-receipts).

**Gefunden und behoben (alle betreffen auch Prod):**

- **500-Zeichen-Kappung jeder KI-Anfrage.** Der Engine-Handler von `/api/think` schickte die
  Anfrage durch den Take-Sanitizer, der bei 500 Zeichen abschneidet. Der Copilot-Prompt (9 KB
  Persona + Frage) verlor die Nutzerfrage, das Briefing seine Fristenliste („abgeschnitten ab
  „Kl…"), Strategie- und Drafting-Prompts ihren Inhalt. Neuer `sanitizePromptInput`
  (Injektionsmuster bleiben, Obergrenze 20 000/60 000 Zeichen) an allen drei Stellen.
- **Persona in der Suchanfrage.** Der Chat schickte Persona + Tool-Doku + Frage als _eine_
  Query; die Engine nutzte den ganzen Block für Retrieval, Intent-Routing und Injection-Scan.
  Neues Feld `instructions` (Engine `RunThinkOpts`, HTTP, Web-Route, API-Client): Persona
  landet im System-Prompt, nur die abgegrenzte Nutzerfrage ist die Query. Begrüßungsregel
  umformuliert (Begrüßung nie als Ersatz für eine Antwort). Test: `think-instructions.test.ts`.
- **Akten unsichtbar für Suche und Assistent.** Über den Wizard angelegte Akten hatten keinen
  Seiteninhalt (alles im Frontmatter, das nicht indexiert wird) → Engine-Suche 0 Treffer,
  Assistent: „keine Informationen zur Akte". Jetzt pflegt die Pages-Route ein **Aktenblatt**
  (Parteien, Gericht, Status, Sachverhalt, Fristen inkl. verknüpfter Fristseiten, Dokumente,
  Aufgaben) als markierten Block im Seiteninhalt — bei Anlage, bei jedem Metadaten-Merge und
  bei Anlage/Änderung einer Frist der Akte. Danach: Suche Score 0,885, Assistent nennt Fristen
  und Dokumente mit Belegen, erkennt sogar die Diskrepanz zwischen Aktenblatt (21.10.) und
  hochgeladenem Beschluss (14.10.).
- **Fristen-Erkennung aus Uploads erzeugte nie Vorschläge.** Die Dokumentanalyse liefert
  `key_dates` [{date, what}], die Rückschreibung erwartete `deadlines` [{label, date,
  urgency}]. Brücke in der Analyze-Route (nur künftige Termine, Fristen/Tagsatzungen = hoch).
  Ergebnis am Beschluss: 2 Fristseiten `review_status: unreviewed` (14.10. Klagebeantwortung,
  05.11. Tagsatzung) + `suggested_deadlines` an der Akte.
- **Fristen erkennen (Text einfügen):** „binnen vier Wochen" ohne Registry-Vorlage hatte kein
  Datum → „Speichern" deaktiviert. Relative Fristen werden jetzt am erkannten Zustellungsdatum
  verankert (16.09. + 28 Tage = 14.10.2026).
- **`detectSpendAnomaly` schlug bei jedem KI-Aufruf fehl** (`column "amount" does not exist`:
  FILTER auf Spalten, die die gruppierte Unterabfrage nicht hat). SQL korrigiert.
- **Rohes JSON als Chat-Antwort** bei Kontingent-/Guthaben-/Rate-Limit-Fehlern
  (`{"error":"quota_exceeded",…}`). Jetzt deutsche Fehltexte mit Hinweis auf Abrechnung.
- **Englische Sektionen** („## Answer / Gaps / Conflicts") in Chat und Briefing: Chat
  lokalisiert („Antwort / Offene Punkte / Widersprüche"), Briefing zeigt nur Prosa.
- **Lokal:** Engine liest jetzt auch `SUBSUMIO_HTTP_CORS_ORIGIN` (Browser-Upload direkt zur
  Engine schlug an CORS fehl); lokale Engine-URL auf 127.0.0.1.

**Ergebnisse (headless, echtes Modell):** Cockpit-Briefing mit belegten Fristen; Assistent
Aktenfrage vollständig mit Zitaten; Prozessstrategie (SWOT, Risikobewertung) nutzt Beschluss
und Aktenblatt; Upload → Analyse → Fristvorschläge durchgängig.

**Offen / Entscheidungen:**

- Kontingent: Free-Plan 100 Anfragen/Monat — beim QA-Durchlauf in einem Tag erreicht. Für den
  Piloten Plan bzw. Limit festlegen (Pro: 1 000, Team: 4 000).
- `copilot-memory-llm` und `llm-deadline-extract` rufen OpenRouter direkt aus der Web-App
  (eigener Key, HTTP 429 im Log) statt über die Engine — doppelte Kostenpfade, Konsolidierung
  nach dem Piloten.
- Onboarding-Tour-Status liegt nur im Browser (localStorage): neues Gerät = Tour erneut.
- Lokal kein Rechtskorpus: Zitatqualität gegen AT-Normen nur auf Staging/Prod prüfbar.

## Code auf Stand bringen (vor den Offline-Tests)

- **Ein LLM-Gateway.** Fünf Web-Module riefen OpenRouter direkt auf (Copilot-Gedächtnis,
  LLM-Fristen-Fallback, WhatsApp-Intent, WhatsApp-Transkription, Empfehlungs-Politur im
  WhatsApp-Briefing). Grund: die Engine bot nur die schwere `think`-Pipeline, für Mini-Aufgaben
  zu teuer und zu langsam. Folge: zweiter Key, keine Modell-Tiers, kein Budget-Tracking, kein
  Sanitizer — und im Hetzner-Web-Container gar kein Key, die Funktionen liefen dort stumm ins
  Leere. Jetzt: Engine-Endpunkte `/api/llm/complete` (Tier `utility` = Haiku, pro Zweck per
  Config überschreibbar) und `/api/llm/transcribe`; Web-Client `src/lib/engine-llm.ts`;
  Invariantentest verbietet Provider-URLs/-Keys in `src/`. Live geprüft: Fristen-Fallback
  läuft durch die Engine. Doku: `docs/architecture/LLM_GATEWAY.md`.
- **Strukturiertes Logging.** 119 API-Routen und 26 serverseitige Lib-Module von `console.*`
  auf den JSON-Logger (Modul, Request-ID) umgestellt; der Logger akzeptiert console-artige
  Argumente (Fehlerobjekte → `error`, Zusatzwerte → `details`) und ist browsersicher.
  ESLint `no-console` für `src/app/api`, `src/lib/auth`, `src/lib/legal-graph`.
- **Tour-Status serverseitig** (`onboardingProgress.tourCompleted`): neues Gerät spielt die
  Tour nicht erneut ab.
- **`autonomous-engine`** minütlich im Hetzner-Crontab eingeplant (Freigabe-Gate bleibt).
- **Kontingent-Entscheidung:** Free-Plan bleibt bei 100 Anfragen/Monat als Testschwelle; die
  Pilotkanzlei erhält über die Ops-Konsole den Plan `team` (4 000/Monat). Kein Code nötig.

## Frontend-Modernisierung (Design-Programm, Start 16.09. abends)

Richtlinie: `docs/design/DESIGN_STANDARD.md`; Befunde und Wellen: `docs/design/DESIGN_AUDIT_2026-09.md`.

- **Welle 1 Sprache:** Sie-Form durchgängig (86 Strings, Assistent, Auth, Cockpit); Engine-Jargon
  aus Anwaltsflächen entfernt (Kanzleiwissen, Nächtliche Konsolidierung, Kennung, Gespräch,
  Subsumio-Dienst, Dokumentablage, Fristenrechner); ein Name pro Ding („Übersicht",
  „Assistent"); sichtbare Defekte (Tippfehler, doppelte Kachel, Slug-Segment in der
  Seitenleiste, technische Kacheln nur für Admins).
- **Welle 2 Struktur/Zustände:** Seiten-Skeleton statt Spinner auf allen Routen und in der
  Shell; `h1` auf jeder Seite; Assistenten-Panel nicht doppelt neben dem Assistenten; Datum
  `TT.MM.JJJJ`, Beträge `1.234,50 €`; Primärfarbe nur für Hauptaktionen.
- **Welle 3 Zustände/Details:** gemeinsamer Leerzustand mit genau einer Aktion (Aufgaben,
  Kalender, Verträge), Kennzahlen 2×2 auf dem Handy, keine Badge-Doppelung bei Fristen,
  Akten-Kopf lädt als Skeleton, Kennzahlen bei 0 ohne Signalfarbe, keine pulsierenden Icons.
- **Prüfung:** automatischer Audit über alle 115 Routen (h1, Ladetexte, Spinner, Anrede,
  Jargon) plus Screenshots Desktop hell / Mobil dunkel der Kernseiten; 0 horizontaler Überlauf.
- **Welle 4 Farbwelt/Tiefe/Responsive (17.09.):** Sapphire-Brand (Hue 222), Gold-Akzent,
  Teal-Sekundär, navy-getönter Dark Mode; Schatten, Glow und Bewegung ausschließlich über
  Tokens; Seitenwurzeln auf volle Breite (Handy-Überlauf auf 108 Seiten behoben, Sweep
  8 Seiten × 4 Breiten × 2 Modi = 0 Überlauf); dichte Register für Akten und Fristen;
  32 weitere Leerzustände; Website- und Rechtstexte jetzt ebenfalls in der Sie-Form;
  visuelle Snapshots geprüft (Marketing-Snapshots bleiben innerhalb der 1,5-%-Toleranz).
  Gates nach Welle 4: Vitest 6792/6792, tsc/eslint sauber, Mock-E2E 590 bestanden / 3
  übersprungen (eine Last-Flake im Adversarial-Spec, Wiederholung 40/40), Routen-Audit 115
  Seiten ohne Befund. Plan und Nachweise: `docs/design/DESIGN_MEGAPLAN_2026-09-17.md`.
- **Bewusst außen vor:** technische Admin-Flächen (Ops, Verbindung, SCIM, Word-Add-in)
  behalten Fachbegriffe.

## Postfach, Rollen und Fristerkennung — Praxistest über die echte Oberfläche (17.09.)

Geprüft mit einem lokalen Test-Mailserver, einem frisch registrierten Kanzlei-Konto und der
echten Engine. Testdaten und Testserver sind wieder entfernt.

- **Rollenmodell (Befund, behoben):** Nur das allererste Konto einer Installation wurde
  Administrator. Jede weitere Kanzlei konnte ihre eigenen Admin-Einstellungen nicht öffnen.
  Jetzt verwaltet jede Registrierung ihre eigene Kanzlei; wer per Einladung beitritt, wird
  Anwältin bzw. Anwalt, bis die Inhaberin die Rolle ändert. Einstellungen, die über eine
  Kanzlei hinausreichen, sind dem Betreiber vorbehalten. Tests: `operator-gate.test.ts`,
  `store.test.ts`, `org/join/route.test.ts`.
- **Passwortformulare (Befund, behoben):** Ein Absenden vor dem vollständigen Laden der Seite
  lief als GET und schrieb die Eingaben in die Adresszeile. Alle Passwortformulare deklarieren
  jetzt `method="post"`.
- **Postfach verbinden:** Formular als Admin, falsches Passwort mit verständlicher Meldung,
  richtiges Passwort speichert und ruft sofort ab, manueller Abruf, Trennen. Bestanden.
- **Antwort vorschlagen:** Entwurf in zwei bis vier Sekunden, Sie-Form. Eine Mail mit
  eingeschleusten Anweisungen wurde nicht befolgt. Nachgeschärft: Entwürfe bestätigen keine
  Fristen und kündigen keine Schriftsätze an.
- **KI-Fristerkennung (Befund, behoben):** Das Modell bekam kein Bezugsdatum und riet das
  Jahr („dritten Oktober dieses Jahres“ wurde 2024). Jetzt erhält es das Bezugsdatum, und ein
  Datum mit nicht belegbarem Jahr wird verworfen. Gilt auch für die Fristerkennung aus
  Dokumenten. Gegentest: 2026-10-03 als unbestätigter Vorschlag.
- **Sie-Form:** Registrierungs-, Passwort-, Einladungs- und Zahlungs-Mails, der
  Judikatur-Digest, Servermeldungen und die WhatsApp-Antworten.
- **Gates:** Vitest 6820 Tests grün (der frühere Wackeltest im Archiv-Dialog wartet jetzt auf
  den aktivierten Button), tsc und eslint sauber.
- **E2E Chromium (CI-Gate) auf Port 3210:** 589 bestanden, 3 übersprungen, alle
  Barrierefreiheits-Tests grün. Der als „Last-Flake“ geführte Adversarial-Spec ist erklärt:
  Direkt nach dem Laden verschiebt die App noch den Fokus, ein `fill` in diesem Fenster fügt
  nichts ein (kein Eingabe-Ereignis). Der Spec füllt jetzt, bis der Text im Feld steht;
  Gegentest 60/60. Der nachgeladene Chat-Verlauf überschreibt keine bereits gesendeten
  Nachrichten mehr. Der Landing-Snapshot weicht nach der Klickflächen-Korrektur um 10 px Höhe
  ab; die Snapshots sind lokal und nicht versioniert. Ohne `CI=1` startet Playwright fünf
  Browser-Projekte (rund 3.000 Tests); das Gate ist `--project=chromium`.

## Betreiber-Konsole und geparkte Bereiche — Praxistest (17.09., nachmittags)

Durchgespielt mit einem lokalen Betreiber-Konto (Allowlist plus echte 2FA-Einrichtung), einer
Kanzlei mit Team und einer Einzelkanzlei. Testkonten sind wieder entfernt.

- **Anmeldung an der Konsole (Befund, behoben):** Auf der Betreiber-Adresse lief die
  Anmeldeseite in eine Weiterleitungsschleife, weil `/login` seit der Österreich-Umstellung
  auf `/at/login` zeigt und dieser Pfad dort nicht durchgelassen wurde.
- **Einzelkanzleien (Befund, behoben):** Die Konsole kannte nur Organisationen. Eine
  Kanzlei ohne angelegtes Team war unsichtbar und nicht supportbar. Jetzt arbeitet die
  Konsole auf Mandanten (`src/lib/tenants.ts`): Kanzlei mit Team oder Einzelkanzlei, mit
  Inhaber, Plan, Rollen, 2FA-Stand, Guthaben, Ausgabenlimit und Support-Zugriff.
- **Teamgründung (Befund, behoben):** Eine neu angelegte Kanzlei bekam einen leeren
  Datenraum, die bisherigen Akten des Gründers wären verschwunden. Die Kanzlei übernimmt
  jetzt den Datenraum des Gründers. Gegentest: Akte vor und nach der Gründung lesbar.
- **Support-Zugriff:** Pflichtgrund, 60 Minuten, Banner im Kanzlei-Dashboard. Ohne Sitzung
  404 auf Akten, Dokumente und Originaldateien; in der Sitzung lesbar, fremde Kanzleien
  bleiben 404; nach dem Beenden sofort wieder 404. Start und Ende stehen im Audit-Protokoll
  der Kanzlei. Die Konsole ist auf der App-Adresse unsichtbar (404).
- **Geparkt:** 14 Bereiche außerhalb des Anwaltsalltags, Liste und Rückweg in
  `docs/archive/PARKED_AREAS_2026-09-17.md`. Gates: Vitest 6.832 grün, betroffene
  E2E-Specs inklusive Barrierefreiheit 125 bestanden.
- **Offen:** Guthaben beim Wechsel von Einzelkanzlei zu Team (Abrechnung läuft dann über die
  Organisation) ist nicht geprüft. Kanzlei sperren und Admin neu setzen gibt es in der
  Konsole noch nicht.

## Kanzlei-Aktionen, Anmeldesperre und Abrechnung — Praxistest (17.09., abends)

Durchgespielt über die Betreiber-Konsole mit einer Kanzlei aus Gründerin und
eingeladenem Mitglied; Testkonten danach gelöscht. 16 von 16 Prüfungen bestanden.

- **Deaktivierte Konten konnten sich anmelden (Befund, behoben).** Login, Zwei-Faktor,
  SSO und Sitzungs-Leser prüfen jetzt Konto- und Kanzleistatus.
- **Kanzlei sperren und entsperren:** alle Konten sofort abgemeldet (401), Login zeigt
  eine lesbare Meldung, Liste markiert „gesperrt“, Entsperren stellt den Zugang wieder her.
- **Rollen und Inhaber:** Rolle eines Mitglieds geändert, Inhaber gewechselt (neuer
  Inhaber wird Admin), Inhaber kann nicht herabgestuft werden, auch nicht über die
  Nutzerseite; eine Rollenänderung meldet das Konto ab.
- **Guthaben im Team (Befund, behoben):** Mitglieder verbrauchten aus einem eigenen
  Kanzlei-Topf, der nur Testguthaben bekam; ein gekauftes Abo lag beim Zahler. Eine
  Teamgründung hätte ein zweites Testguthaben erzeugt. Jetzt nutzt die ganze Kanzlei das
  Guthaben des zahlenden Kontos. Gegentest: Mitglied und Gründerin sehen denselben Topf.
- **Stripe-Webhook (Befund, behoben):** schrieb die Abrechnungs-ID in das Feld für die
  Team-Mitgliedschaft und leerte es bei Kündigung, womit ein Inhaber aus seiner Kanzlei
  gefallen wäre. Der Webhook fasst die Mitgliedschaft nicht mehr an (Test sichert das ab).
- **Fehlermeldungen auf der Website unlesbar (Befund, behoben):** Status-Farben waren nur im
  Dashboard definiert. Meldung „Konto gesperrt“ jetzt gut lesbar.
- **Banner-Aussage korrigiert:** „Jede Antwort wird fünffach geprüft“ vermischte die fünf
  Aufnahme-Schritte des Kanzleiwissens mit der Antwortprüfung. Neu: „Zitierte Normen in
  Antworten werden gegen die Rechtsquellen geprüft“.
- Architektur und Prüfabfragen für die Produktionsdatenbank:
  `docs/architecture/TENANTS_AND_BILLING.md`.

## Schriftsatz → Word → Zeit → Honorarnote nach RATG — Praxistest (17.09., abends)

Durchgespielt über die echte Oberfläche mit dem echten Assistenten und einer frisch
registrierten Einzelkanzlei. 20 von 20 Prüfungen bestanden (Testkonten danach gelöscht).

- **RATG-Berechnung fehlte (Befund, behoben).** Einstellungen, Hilfe-Seite und Website
  versprachen „automatische Berechnung nach RATG“; im Code gab es keine. Jetzt gebaut:
  TP 1 bis 3, Einheitssatz, ERV- und Streitgenossenzuschlag, aus dem RIS-Text erzeugt und
  gegen BGBl. II Nr. 131/2023 getestet (`docs/architecture/RATG.md`). Texte auf den
  tatsächlichen Umfang gebracht; „Kostenrechner“ und „Zinsberechnung“ aus der Hilfe entfernt
  (nicht vorhanden).
- **Word-Export lieferte HTML (Befund, behoben).** Ohne gespeicherten Entwurf lehnte die
  Route jeden Export ab und die Seite fiel still auf eine HTML-Datei mit Endung .doc zurück.
  Zusätzlich landeten interne Formularfelder als „Metadaten“ im Schriftsatz. Jetzt echte .docx
  mit nur dem Schriftsatz.
- **Entwurf zeigte Engine-Überschriften (Befund, behoben).** „## Answer“ und „## Gaps“
  standen im Schriftsatz; offene Punkte gehören ins Belege-Feld. Die Seite nutzt jetzt auch
  die vorgeschriebene Fundstellen-Prüfung (`useGroundedAnswer`).
- **E-Rechnung mit 0,2 % USt (Befund, behoben).** Der Steuersatz wurde als 0,2 übergeben und
  als Prozent gelesen. Außerdem fehlten PLZ und Ort des Käufers immer (Land fest „DE“), sodass
  jede automatische E-Rechnung aus dem Dialog an der Validierung scheiterte.
- **Vorschau ≠ Rechnung (Befund, behoben).** Die Vorschau rechnete mit gerundetem
  Kanzlei-Stundensatz, die Rechnung mit den Sätzen der Einträge; jetzt dieselbe Berechnung,
  Beträge im österreichischen Format, Vorschau verdeckt die Eingaben nicht mehr.
- **Nachweis:** Klage TP 3A (BG 10.000 €) 346,60 + Einheitssatz 207,96 + ERV 5,00; Tagsatzung
  1,5 h 519,90 + Einheitssatz 311,94; Zeit 1,5 h × 250 € = 375,00; Netto 1.766,40, USt 353,28,
  Summe 2.119,68 in Vorschau und gespeicherter Rechnung; Zeiteintrag als verrechnet markiert;
  XRechnung mit 20 %.
- **Lokal nicht prüfbar:** Der lokale Korpus enthält keine Gesetzestexte; der Assistent hat
  korrekt keine Normen erfunden. Inhaltliche Qualität von Schriftsätzen mit Korpus nur auf dem
  Server prüfbar.
- **Offen (Produktentscheidung):** E-Rechnung kennt nur deutsche Formate (XRechnung,
  Leitweg-ID) und ZUGFeRD; für Österreich wären ebInterface bzw. PEPPOL für e-Rechnung.gv.at
  üblich.
- **Doppelte Rechnungsnummern möglich (Befund, behoben).** Nummern wurden im Browser vergeben
  (höchste bekannte + 1). Jetzt reserviert der Server sie atomar pro Kanzlei und Jahr
  (`src/lib/invoice-numbering.ts`, `POST /api/invoices/number`) und setzt nach der höchsten
  bestehenden Nummer fort. Gegentest gegen die Datenbank: 15 gleichzeitige Reservierungen,
  15 verschiedene Nummern ab R-2026-0002. Offline bleibt eine vorläufige lokale Nummer.
- **Wortwahl des Assistenten:** Antworten sprechen von „Rechtsquellen im Brain“; der
  interne Begriff gehört durch „Kanzleiwissen“ ersetzt (Engine-Prompt, noch offen).

## Treuhandkonto und Identitätsprüfung — Praxistest (17.09., nachts)

Über die echte Oberfläche und Datenbank durchgespielt. 22 von 22 Prüfungen bestanden.
Details: `docs/architecture/TRUST_AND_AML.md`.

- **Treuhand-Buchungen über die Oberfläche unmöglich (Befund, behoben).** Konto-IDs enthalten
  einen Schrägstrich, die Routen nehmen nur ein Pfadsegment; Buchen, Abgleichen und Löschen
  endeten immer mit 404. Derselbe Fehler betraf Vorlagen, Playbooks, Review-Sets,
  Prozessführung und Agenten-Vorlagen (Öffnen, Ändern, Löschen einzelner Einträge). Behoben,
  Regressionstest `src/lib/api-slug-routes.test.ts`.
- **Treuhand-Buchungen überschreibbar, negativ, ohne Aktenbezug (Befund, behoben).** Jetzt
  unveränderlich, fortlaufend nummeriert, Storno statt Überschreiben, Pflicht-Akte, keine
  Auszahlung über das Aktenguthaben, Sperre gegen gleichzeitige Buchungen, Hinweis nach
  § 10a Abs. 2 RAO ab 40.000 €, Abgleich serverseitig mit Prüfer. Rechtsgrundlagen im Code
  waren deutsches Recht (BRAO) und sind auf die RAO umgestellt.
- **Identitätsprüfung ließ sich nicht abschließen (Befund, behoben).** Kein Weg zum Status
  „verifiziert“, die Anlage speicherte ohne CSRF-Schutz und meldete Erfolg auch ohne
  Speicherung; die Mandatsannahme vertraute einem Häkchen. Jetzt Datenmodell nach
  §§ 8b, 8d, 8f, 12 RAO, Abschluss nur bei Vollständigkeit, Verlauf, Aufbewahrungsfrist,
  und die Umwandlung in eine Akte verlangt eine verknüpfte abgeschlossene Prüfung.
- **Nachweise:** Auszahlung aus einer Akte ohne Guthaben abgelehnt, obwohl das Konto 50.000 €
  hält; 10 gleichzeitige Auszahlungen → genau 5 gebucht, Saldo 0; Storno über die Liste;
  Identitätsprüfung erst nach Ausweis, Zweck, PEP- und Sanktionsprüfung abgeschlossen;
  Mandatsannahme mit bloßem Häkchen abgelehnt, mit verknüpfter Prüfung angenommen.
- **Offen (Produktentscheidung):** automatische Abfrage von Sanktions- und PEP-Listen
  (z. B. EU-Finanzsanktionsdatei), Anbindung an die Treuhandeinrichtung der Kammer,
  Hochladen der Ausweiskopie direkt in die Prüfung.

## Unterschriften und Kanzlei-Import — Praxistest (17.09., nachts)

Über die echte Oberfläche und Datenbank durchgespielt, 12 von 12 Prüfungen bestanden; der
DocuSign-Webhook zusätzlich als ausgeführter Test gegen simulierte Connect-Ereignisse.
Details: `docs/architecture/SIGNATURE_AND_IMPORT.md`.

- **Import unmöglich (Befund, behoben).** Nach einem erfolgreichen Probelauf blieb der
  Import-Knopf immer gesperrt.
- **Import überschrieb bestehende Akten (Befund, behoben).** Die Seiten-API legt an oder
  aktualisiert; eine vorhandene Aktenzahl hätte eine Akte samt Fristen und Dokumentliste
  ersetzt. Jetzt übersprungen mit Grund, Ergebnis je Zeile, gesammelte Archivierung der
  importierten Akten. Gegentest: Demo-Akte nach dem Import unverändert.
- **DocuSign-Status kam nie an (Befund, behoben).** Der Versand schickte die Kanzlei-ID in einem
  Feld, das die DocuSign-API verwirft, und speicherte keine Anfrage; der Webhook fand deshalb
  nichts. Zusätzlich verwarf die Duplikatsperre „unterschrieben“ nach „versendet“, und die
  Anmeldung war fest auf die DocuSign-Testumgebung verdrahtet. Unterschriebene PDFs landeten als
  Text in Metadaten statt als Dokument der Akte. Alles behoben; ohne Einrichtung klare Meldung.
- **Unterschrift in der Kanzlei (Befund, behoben).** Der Browser konnte „qualifiziert“ behaupten,
  das Dokument blieb unsigniert, Fehler beim Speichern wurden verschluckt. Portal: abgelaufene
  Anfragen waren unterschreibbar.
- **Texte:** „rechtsverbindlich“ bei der einfachen Signatur ersetzt durch den tatsächlichen
  Stellenwert; Hilfe-Seite zum Import auf den tatsächlichen Umfang gebracht.
- **Nicht prüfbar ohne Konto:** echter Versand über DocuSign. Offen (Produktentscheidung):
  qualifizierte Signatur (A-Trust/ID Austria), Import von Fristen, Kontakten und Zeiten.

## Qualifizierte Signatur und Dokument-Upload — Praxistest (17.09., abends)

Über die echte Oberfläche und Datenbank durchgespielt, 16 von 16 Prüfungen bestanden. PDF-AS-WEB
wurde durch einen lokalen Dienst ersetzt, der die dokumentierte Schnittstelle nachbildet
(Sign-Aufruf, Abruf des Originals, PDFData mit `origdigest`, Prüfcodes, Abbruch). Details:
`docs/architecture/SIGNATURE_AND_IMPORT.md`.

- **Qualifizierte Signatur (neu).** Knopf je PDF in der Akte mit Auswahl ID Austria oder
  A-Trust-Signaturkarte; das signierte PDF wird neben dem Original abgelegt und als
  „qualifiziert“ mit Prüfcodes, Hashwerten und Signatureintrag vermerkt. Abbruch führt mit
  Hinweis zurück, das Original bleibt unverändert.
- **Dokument-Upload in der Akte ging nie (Befund, behoben).** Der Upload im Browser schickte bei
  Vorbereitung und Abschluss kein CSRF-Token und wurde immer mit 403 abgelehnt. Der E2E-Test rief
  die API direkt mit Token auf und sah das nicht. Ohne Objektspeicher läuft der Upload jetzt über
  den direkten Weg; ein Unit-Test prüft beides.
- **Parallele Uploads verloren Dokumente (Befund, behoben).** Zwei gleichzeitige Uploads in eine
  Akte schrieben die Dokumentliste gegeneinander, eines fehlte danach. Alle Schreiber der Liste
  (Upload, E-Mail-Ablage, Signaturen) laufen jetzt unter einer Sperre je Akte; ein Test bildet die
  verlorene Reihenfolge nach.
- **Akte zeigte nach Änderungen alte Daten (Befund, behoben).** Aktenseiten, Rechnungen,
  Prüfeingang, Portal und Rechte wurden 15–30 Sekunden im Browser zwischengespeichert; neu
  hochgeladene Dokumente erschienen erst nach dem Neuladen. Nachweis: Liste aktualisiert sich
  jetzt nach rund 3 Sekunden ohne Neuladen.
- **Nicht prüfbar ohne Instanz:** echte PDF-AS-WEB-Anbindung mit ID Austria und Signaturkarte.
