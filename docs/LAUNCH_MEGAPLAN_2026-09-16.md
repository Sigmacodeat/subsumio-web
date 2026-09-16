# Subsumio Launch-Megaplan

Stand: 2026-09-16. Rolle: Techlead. Ziel: Österreich-Pilot mit echten Kanzleien auf
einem 100 % funktionierenden Dashboard. Jede Zahl unten ist heute direkt verifiziert
(Kommandos in Klammern), nicht aus Agent-Recherche übernommen.

## 1. Wo stehen wir (verifiziert)

### Code-Qualität (statische Gates)

| Gate                          | Ergebnis                                      | Kommando                 |
| ----------------------------- | --------------------------------------------- | ------------------------ |
| TypeScript                    | 0 Fehler                                      | `npx tsc --noEmit`       |
| Unit-Tests                    | 376 Dateien, 6.687 Tests, 0 Fehler, 35 s      | `npx vitest run`         |
| ESLint                        | 0 Fehler, 4 Warnungen                         | `npx eslint .`           |
| Verify-Skripte                | 4/4 grün (Route-Actions, Tokens, Links, a11y) | `bun run verify`         |
| Produktions-Build (Turbopack) | grün, 381 statische Seiten, 23 s Compile      | `next build --turbopack` |

Bewertung: Die Codebasis ist technisch in ungewöhnlich gutem Zustand für ihre Größe.
Alle Gates sind grün. Das ist die Grundlage, auf der wir arbeiten.

### Umfang

- 120 Dashboard-Seiten (`src/app/dashboard`), 401 API-Routen (`src/app/api`),
  alle 401 über `createHandler` mit Auth, RBAC, CSRF, Rate-Limit, Zod, Audit.
- Engine (`server/`, gbrain-Fork 0.42.38.0) als eigener Bun-Prozess, Postgres + pgvector.
- 45 Playwright-E2E-Specs (Mock-Engine-Modus und Real-Engine-Modus).
- 6 Arbeitsräume in der Sidebar (Mandate, Termine, Dokumente, Prozess, Honorar,
  Kanzlei) plus 6 Kerneinstiege (Cockpit, Akten, Fristen, Intake, Recherche, Assistent).

### Git-Zustand (der eigentliche Risikoherd)

- `main` ist 15 Commits vor `origin/main`, nicht gepusht.
- Arbeitsbaum auf `main`: 487 uncommittete Dateien (274 geändert, 171 gelöscht,
  42 neu) = der Österreich-Schnitt vom 13.09. (DE/CH/EN-Locales raus, beA/DATEV/RVG
  archiviert, Marketing unter `/at`). Alle Gates oben laufen MIT diesen Änderungen grün.
- Branch `ops-console` (Worktree `.claude/worktrees/ops-console`): 14 Commits mit
  Sicherheitsfixes (Operator-Rolle getrennt von Kanzlei-Admin, Mailbox pro Kanzlei,
  Export-Leck, Portal-E-Signatur, Fristenbuch-Vier-Augen). 252 Dateien, 23 davon
  überlappen mit dem uncommitteten Arbeitsbaum → Merge braucht Handarbeit.
- Es gibt keine Devin-/Fremd-Commits in den letzten 200 Commits; das Risiko einer
  parallelen Session besteht nur, wenn sie noch läuft.
- `gh` ist nicht eingeloggt → CI-Status auf GitHub aktuell nicht abrufbar.

### Lokale Testumgebung (läuft jetzt)

| Komponente         | Zustand                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres           | Docker `subsumio-pg16` auf 127.0.0.1:15432, DBs `subsumio` (Auth, 34 Testuser), `subsumio_law_v2` (Engine, 6.042 Seiten), `subsumio_e2e` |
| Engine             | `bun run src/cli.ts serve --http --port 31429`, seit 2 Tagen up, `/health` ok                                                            |
| Web                | `next dev` auf :3000, `/api/readiness`: engine ok, auth ok                                                                               |
| KI lokal           | Ollama: Embeddings `nomic-embed-text` (768d), Chat `qwen2.5:1.5b`                                                                        |
| Korpus             | 26 GB unter `~/subsumio-data/law-corpus` (außerhalb des Repos)                                                                           |
| Nicht konfiguriert | Stripe, Sentry-DSN, Resend/E-Mail, SMTP (readiness „degraded", erwartet)                                                                 |

Wichtig: 15432 ist heute die lokale Docker-DB, nicht der Produktions-Tunnel. Für
lokale QA ist das sicher. Vor jedem Test trotzdem `lsof -i :15432` prüfen.

### Produktion (Hetzner, Falkenstein)

- Single-Box Compose (`server/deploy/hetzner/docker-compose.yml`): db, engine,
  web, caddy, cron, backup (restic), clamav, corpus-pipeline. `preflight.sh` als Gate.
- Prod-Embeddings: OpenRouter `text-embedding-3-small` 1536d. Lokal: Ollama 768d.
  Diese Abweichung ist gewollt (Kosten), muss aber beim Real-Engine-Test bewusst sein.
- Die Caddy-Konfiguration bedient auf derselben Box auch `sanicura.com` (Fremdprojekt).
- Laut Gedächtnis liegen dort echte Nutzerkonten → kein Test auf Prod.

### Heute gefundene konkrete Defekte

1. **CSP-Nonce-Hydration-Mismatch auf jeder Seite** (Browser-Konsole: Server rendert
   `nonce="…"`, Client `nonce=""` für `csp-nonce-bootstrap` und `/theme-init.js`).
   React patcht das nicht; Risiko: Inline-Skripte ohne Nonce werden von der CSP
   blockiert, Theme-Init flackert. Ursache in `src/app/layout.tsx:167` und
   `src/app/dashboard/layout.tsx:643`.
2. `playwright.config.ts` enthält hart codiertes DB-Passwort + Engine-Key der lokalen
   Test-DB. Funktional harmlos, hygienisch falsch (liegt im Repo).
3. 112 API-Routen loggen direkt mit `console.*` statt über `src/lib/logger.ts`
   (keine strukturierten Logs in Prod).
4. `next.config.ts` ignoriert ESLint und TS-Fehler im Build (Gates laufen getrennt;
   in Ordnung, solange CI beide erzwingt – CI ist aktuell nicht einsehbar).
5. `vercel.json` (31 Crons) und `server/deploy/hetzner/crontab` beschreiben beide den
   Cron-Plan; nur einer ist die Wahrheit (Hetzner). Abgleich nötig.

### Was früheres Gedächtnis sagte und heute nicht mehr stimmt

- „Rate-Limiting deckt nur 25 von 437 Routen": überholt, `createHandler` limitiert
  zentral, alle 401 Routen laufen darüber.
- „.env.local zeigt auf Prod": heute zeigt 15432 auf die lokale Docker-DB.

## 2. Architektur-Schichten (Prüfreihenfolge)

```
Browser ──> Next.js (src/app, middleware CSP/CSRF/IP) ──> createHandler (Auth/RBAC/Quota)
        └── React-Query-Hooks (src/lib/use-*.ts) ──> /api/* ──> Engine-Client (src/lib/engine.ts,
            Header x-subsumio-source = brainId) ──> Engine HTTP (server/src/commands/web-api.ts)
            ──> Operations (server/src/core/operations.ts) ──> Postgres/pgvector
Auth-Store: src/lib/auth/store.ts (Postgres, Tabellen subsumio_users/saas_orgs)
Mandantenfähigkeit: Kanzlei = Org = brainId = Engine-Source (Source-Isolation)
```

Jede Schicht wird in Phase 1–3 einzeln abgenommen, von unten (DB/Engine) nach oben (UI).

## 3. Phasenplan

### Phase 0 — Code-Stand einfrieren (heute, braucht Entscheidung)

1. Österreich-Schnitt als Commit einfrieren (Gates sind grün).
2. `ops-console` nach `main` mergen, 23 Überlappungen von Hand auflösen, Gates erneut.
3. `gh auth login`, pushen, CI beobachten bis grün. Parallele Sessions vorher stoppen.

Gate: `typecheck + vitest + verify + build` grün auf dem gemergten Stand, CI grün.

### Phase 1 — Systematische Dashboard-QA am lokalen Vollstack

Testskript: `docs/ANWALTSTAG-TESTSCRIPT.md` (8 Stationen) plus jede Sidebar-Fläche.
Pro Fläche: laden, leere Zustände, anlegen, bearbeiten, löschen, Fehlerpfad,
Konsole/Netzwerk auf Fehler. Protokoll in `docs/audit/QA_PROTOKOLL_2026-09.md`.

Reihenfolge (entlang des Mandatszyklus):

1. Signup → Onboarding (7 Schritte) → Cockpit. Heute bis Onboarding-Schritt 1 verifiziert.
2. Akten: Liste, Neuanlage mit Kollisionsprüfung, Detail (11 Tabs), Demo-Akte.
3. Upload → Extraktion → Dokument in Akte → Posteingang.
4. Assistent/Chat: Antwort mit CitationPanel + „anwaltlich zu prüfen" (Invariante).
5. Fristen, Fristenbuch, Wiedervorlagen, Kalender, Aufgaben.
6. Zeiten → Rechnung → PDF → Status.
7. Mandantenportal: Token, Freigabe, E-Signatur.
8. Einstellungen, Team/Rollen, Sicherheit/2FA, Demo-Daten-Cleanup.
9. Danach die 6 Arbeitsräume vollständig durchklicken (jede Seite mindestens laden).

Gate: 0 Konsolenfehler, 0 5xx, jede Kernstation grün, Protokoll vollständig.

### Phase 2 — Härtung des Frontends und der API

- Hydration-Bug (Nonce) beheben; jede Seite ohne React-Warnung.
- Fehler- und Ladezustände: `error.tsx`/`loading.tsx` pro Modul prüfen, Retry-Pfade.
- Logger statt `console.*` in den 112 Routen; strukturierte Fehler (`src/lib/errors.ts`).
- E2E-Suite: Mock-Modus vollständig grün; Real-Engine-Modus für die 8 Kernstationen.
- Secrets aus `playwright.config.ts` in Env; CSRF/2FA/Lockout-Specs im Real-Modus.
- Responsiv (Mobile-Tab-Bar) und Dark-Mode für die Kernflächen.

Gate: Playwright Mock-Suite grün, Real-Engine-Smoke grün, 0 Hydration-Warnungen.

### Phase 3 — Daten und KI-Schicht

- Embedding-Parität Prod (1536d OpenRouter) vs. lokal (768d Ollama): Real-Engine-Test
  einmal mit Prod-Konfiguration (OpenRouter-Key lokal) fahren, damit Suche/Grounding
  realistisch geprüft ist.
- Grounding-Invariante auf allen KI-Flächen automatisiert prüfen (Test existiert:
  `chat-grounding.test.tsx`); Stichprobe mit echten AT-Normen (ABGB, ZPO, RAO).
- Demo-Akte „Berger ./. Muster Werk GmbH" als Seed für jede neue Kanzlei verifizieren.
- Korpus: AT-Abdeckung ist 91,5 % (Gedächtnis); für den Piloten ausreichend, Lücken
  (AT-Judikatur-Ingest) als Post-Pilot.

Gate: Kernfrage aus dem Testskript liefert belegte Antwort mit verifizierten Zitaten.

### Phase 4 — Betrieb und Staging

- Staging-Box auf Hetzner (Empfehlung: CPX41, 8 vCPU / 16 GB / 240 GB, ~€30/Monat),
  gleiche Compose wie Prod, Kopie des Korpus, KEINE Prod-Daten. Dort läuft der volle
  Anwaltstag-Test mit Prod-Konfiguration (OpenRouter, Resend, Stripe-Test).
- `preflight.sh` muss PASSED melden; Sentry-DSN, Uptime-Check, Backup-Restore-Drill.
- Secrets aus `SERVER_INVENTORY.md` rotieren (offen seit Juli).
- Runbook: Deploy, Rollback, DB-Migration, Korpus außerhalb des Checkouts.
- Cron-Wahrheit: Hetzner `crontab` gegen `vercel.json` abgleichen, `vercel.json` entfernen.

Gate: Staging besteht das komplette Testskript mit einem externen Tester.

### Phase 5 — Pilot-Go-Live

Nach `docs/deploy/PILOT_GO_LIVE.md` (auf `ops-console`): Operator-Konto mit 2FA,
Pilotkanzlei anlegen, Spend-Cap, Smoke-Test mit echter Akte, Vier-Augen-Frist,
Portal-Signatur, E-Mail-Roundtrip.

### Phase 6 — Nach dem Piloten

Orphan-/Doppel-APIs entfernen (Auth register/signup, reset), Labor-Flächen in einen
Admin-Qualitätsbereich, RCIID/Krypto per Feature-Flag, DSGVO-Anfragen zu
Mandanten, Support-Impersonation mit Protokoll.

## 4. Entscheidungen, die nur der Inhaber treffen kann

1. Österreich-Schnitt committen und `ops-console` mergen + pushen? (Phase 0)
2. Läuft noch eine parallele Devin-/Claude-Session auf `main`?
3. Staging-Server bestellen (empfohlen) oder Prod-Box für den Pilot-Test nutzen
   (nicht empfohlen, dort liegen echte Konten)?
4. Ist Prod aktuell live mit zahlenden/aktiven Nutzern, oder nur Testkonten?

## 5. Hardware für den Test

- Lokal (jetzt): Mac reicht für funktionale QA (Docker-PG, Engine, Ollama).
  Engpass: kleines Chat-Modell (qwen2.5:1.5b) liefert keine belastbaren Antworten;
  für KI-Qualität OpenRouter-Key lokal setzen.
- Staging: CPX41 oder größer. Korpus-DB in Prod hat 78 GB, lokal 76 MB.
- Prod: bestehende Hetzner-Box; nicht antasten bis Phase 5.

## 6. Stand am Abend des 16.09.2026

Phase 0 ist abgeschlossen (AT-Schnitt committet, `ops-console` gemergt, alle Gates grün,
gepusht). Phase 1 läuft: acht Stationen des Anwaltstag-Skripts sind am lokalen Vollstack
durchgespielt, Protokoll in `docs/audit/QA_PROTOKOLL_2026-09.md`. Behoben und gepusht:

- Trial-Guthaben (erste KI-Frage 402), CSP-Nonce-Hydration, Akten-Wizard (Doppelanlage,
  Slug-404, Enter), Fristen-Dialog (Akte fehlte, kein Refresh, Vorfrist = Fristdatum),
  Metadaten-Updates (400 „title Required" auf 34 Aufrufstellen), Vier-Augen-Modal,
  Seiten-Typ-Gate (14 Parser, Posteingang/Workflows leer), UI-Sprache „at" (12 KI-Routen 400),
  Kalender-403, Recherche-Standard DE→AT, USt 19 %→20 %, RVG-Rechner im AT-Dialog,
  Portal-Link-Redirect auf Login, Audit-Log (leer, falsche Zuordnung, Polling-Rauschen),
  Workflows-Absturz, Begrüßung mit Titel, Briefing-Markdown, Onboarding-Copy.

Offen mit Priorität (siehe Protokoll):

1. **P1 Portal-Dokumentsichtbarkeit** — Freigabe-Flag pro Dokument vor dem Pilot.
2. Kontakte aus Akten-Parteien (Produktentscheidung), Dokumentansicht statt Brain-Seite.
3. Copy-Reste beA/DE (Kommunikation, Fristen-Statkarte), englische Labels (Freigaben,
   Sicherheit), Sidebar-Links ohne Namen (axe-Lauf), Stundensatz-Plausibilität.
4. Phase 3: Engine lokal auf echtes Modell (OpenRouter/Anthropic) für die KI-Stationen 4/Strategie.
5. Phase 2: Playwright-Suite (Mock + Real-Engine) auf dem Prod-Build fahren.
