# Subsumio Dashboard / Brain / Backend Integration Audit

Stand: 2026-06-21  
Scope: Dashboard-Kundenerlebnis, Brain-Chat, Matter Context, Backend-APIs und
Legal-AI-End-to-End-Verknuepfung.

## Kurzurteil

Subsumio hat bereits ein starkes Kanzlei-OS-Fundament: viele Dashboard-Module
haben echte API-Routen, Brain-Seiten laufen ueber Engine-Proxies, `/api/think`
streamt Antworten mit Citation-Gate, und Matter Context existiert als eigener
Datenvertrag fuer Aktenkontext, Gaps, Fakten, Fristen und Quellen.

Noch nicht Harvey-Level ist die Ergebnisstruktur: mehrere produktrelevante
Dashboard-Seiten bauen weiterhin lange Prompt-Strings und parsen Markdown/Text.
Der Brain-Pfad (`query_mode`, `case_slug`, Matter Context) ist jetzt in den
wichtigsten Think-Aufrufen verdrahtet, aber die Antwortvertraege muessen noch
typisiert und als Legal-Actions produktisiert werden.

## Heute direkt verbessert

- `src/lib/api.ts`: `api.query.think()` akzeptiert jetzt strukturierte Optionen:
  `mode`, `queryMode`, `caseSlug`, `model`, `onChunk`.
- `src/app/api/think/route.ts`: `model` wird validiert und an die Engine
  weitergereicht, statt in der Zod-Validierung verloren zu gehen.
- `src/app/dashboard/assistant/page.tsx`: Der Assistant nutzt jetzt den
  Superbrain-Modus `deep_matter` als Default und bietet einen Mode-Selector
  (`Praezise`, `Balanced`, `Deep Matter`, `Externe Quellen`, `Audit`).
- `src/app/dashboard/assistant/page.tsx`: Der Assistant kann jetzt eine Akte
  pinnen, zeigt dazu Matter-Understanding-Kennzahlen und sendet `caseSlug` an
  `/api/think`.
- `src/app/dashboard/cases/[slug]/page.tsx`: Die Akten-Query nutzt jetzt
  `queryMode: "deep_matter"` und `caseSlug`.
- `src/app/dashboard/drafting/page.tsx`: Drafting uebergibt bei gewaehlter Akte
  `caseSlug` und nutzt `deep_matter`.
- `src/app/dashboard/research/page.tsx` und
  `src/app/dashboard/rechtsprechung/page.tsx`: Rechtsrecherche nutzt
  `queryMode: "external_law"`.
- `src/app/dashboard/contracts/page.tsx`: Contract Analysis nutzt `tokenmax` und
  `deep_matter`.

Konsequenz: Der zentrale Chatbot und die wichtigsten AI-Seiten nutzen denselben
Brain-/Matter-Mode-Vertrag wie die Query-Seite.

## Was bereits stark ist

### Brain- und Query-Core

- `/api/think` ist ueber `createHandler` abgesichert: Auth, RBAC, CSRF,
  Rate-Limit, Quota, Audit.
- `/api/think` streamt via SSE und fuehrt Antworten durch
  `createCitationGateStream`.
- `query_mode` existiert bereits mit Legal-Superbrain-Modi:
  `conservative`, `balanced`, `deep_matter`, `external_law`, `admin_audit`.
- `case_slug` ist im API-Vertrag vorhanden und kann an die Engine uebergeben
  werden.
- `matter-context-client.ts` definiert einen SDK-artigen Zugriff auf:
  Bundle, Coverage, Gaps, Facts, Activity, Parties, Deadlines, Documents,
  Explainability, Quality und Understanding.

### Dashboard-Breite

Es existieren produktnahe Dashboard-Seiten fuer zentrale Kanzlei-Workflows:

- Brain Query, Assistant, Brain, Graph, Upload.
- Cases, Deadlines, Contacts, Opponents.
- Drafting, Contracts, Analyze, Research, Precedent Search, Norms,
  Rechtsprechung.
- Compliance, Audit, Approvals, Workflows, Agents.
- Invoicing, Cost Calculator, DATEV Export, Signature, Client Portal.
- Connectors, Email Import, WhatsApp, Intake, Document Requests, Data Export.

### Backend-Oberflaeche

Die API-Oberflaeche ist breit und deckt viele echte Module ab:

- Auth, Team, Billing, API Keys.
- Pages, Search, Stats, Graph, Upload.
- Think, RAG Eval, Release Gate, Brain Quality.
- Matter Context und Subressourcen.
- Legal Analyze, Memo, Risk, RVG, Sources, Statutes, Judgements, Due Diligence,
  Tabular Review, Translation.
- Portal, Document Requests, Intake, Time Tracking, Invoices.
- Connectors, DMS, Email, WhatsApp, DocuSign, SCIM.

## Kritische Harvey-Level-Luecken

### P0: Ein einziger Premium-Assistant statt zwei Chat-Erlebnisse

Aktuell gibt es `/dashboard/query` und `/dashboard/assistant` mit
ueberschneidender Funktion. Der Assistant ist jetzt deutlich naeher am
Superbrain-Vertrag, aber Modellwahl, Gaps, Feedback und Query-Power-Features
sind noch nicht vollstaendig in einem Premium-Erlebnis vereint.

Zielbild:

- Ein primaeres Kundenerlebnis: "Subsumio Assistant".
- Query-Modi, Modellwahl, Quellen, Gaps, Aktenkontext und Dokumentanhaenge in
  einem Chat.
- Query-Page entweder als Power-Console behalten oder in Assistant integrieren.

### P0: Case-aware AI ueberall

Die wichtigsten Think-Aufrufe senden jetzt passende `query_mode`-Optionen.
Noch offen ist die vollstaendige Umstellung aller aktenbezogenen AI-Aktionen auf
`case_slug` und Matter Context:

- Document Review / Analyze.
- Workflows / Agents.
- Weitere Detail-Actions in Case Detail.
- Contract Analysis.

Zielbild:

- Jede aktenbezogene AI-Aktion uebergibt `caseSlug`.
- Die Engine bekommt den richtigen `query_mode`.
- UI zeigt, welche Akte, welche Quellen, welche Gaps und welche Risiken in die
  Antwort eingeflossen sind.

### P0: Matter Context muss sichtbar werden

Matter Context existiert und ist in der Case-Detail-Seite bereits als
`Superbrain`-Tab sichtbar. Der Assistant zeigt jetzt zusaetzlich
Matter-Understanding-Kennzahlen fuer gepinnte Akten. Noch offen ist, diese
Information als immer sichtbares Premium-Signal in den normalen Arbeitsfluss zu
bringen.

Zielbild:

- Case-Seite zeigt "Akte verstanden?" nicht nur im Tab, sondern als festen Bereich:
  Fakten, Parteien, Fristen, Dokumente, Aktivitaet, Gaps, Coverage, Freshness.
- Assistant kann eine Akte aktiv pinnen. (teilweise umgesetzt)
- Jede Antwort zeigt Matter-Coverage: "Welche Quellen wurden genutzt?",
  "Was fehlt?", "Wie frisch ist der Stand?".

### P1: Prompt-String-Seiten auf strukturierte Legal-Actions migrieren

Mehrere Seiten bauen lange Prompt-Strings lokal und parsen danach Text. Das ist
fuer ein Premiumprodukt fragil.

Beispiele:

- Contract Analysis analysiert einen Vertrag ueber freien Prompt und extrahiert
  Risiko aus Emojis/Text.
- Rechtsprechung nutzt AI-Fallback und parst Zeilen.
- Research/Drafting/Cases sind auf Query-Modes migriert, parsen aber teils
  weiterhin freie Textantworten.

Zielbild:

- Strukturierte API-Routen mit Zod-Input und typisiertem JSON-Output.
- UI rendert strukturierte Ergebnisse statt Markdown zu parsen.
- Audit-Log speichert Input, Modus, Quellen, Citation-Status und Review-Status.

### P1: Quellen- und Zitierqualitaet als UI-Vertrag

Citation-Gate ist serverseitig vorhanden. Im UI muss es zum Premiumsignal
werden:

- Antwort ohne Quellen klar als unzureichend markieren.
- Quotes/Evidence direkt einblendbar machen.
- Fundstellen-Status pro Aussage sichtbar.
- "In Brain nicht belegt" als eigener Antwortzustand statt schwacher Antwort.

### P1: Backend-Feature-Matrix gegen UI-Matrix

Es gibt sehr viele APIs und sehr viele Dashboard-Seiten. Der naechste
Qualitaetssprung ist eine maschinell gepflegte Matrix:

- Route vorhanden?
- UI nutzt Route?
- Auth/RBAC/CSRF aktiv?
- E2E-Coverage vorhanden?
- Empty/Error/Offline-State vorhanden?
- Audit-Log vorhanden?

Ohne diese Matrix bleiben Luecken schwer sichtbar.

## Empfohlene naechste Arbeitspakete

1. Assistant weiter vereinheitlichen: Modellwahl, Quellen/Gaps, Feedback und
   Query-Power-Features in einem Premium-Chat.
2. Case Detail mit persistentem Matter Context Summary-Band ausbauen:
   Coverage, Gaps, Fakten, Fristen, Dokumente, Aktivitaet.
3. AI-Actions typisieren: Contract Analysis, Drafting, Research, Rechtsprechung
   weg von Freitext-Prompt-Parsing hin zu typisierten API-Ergebnissen.
4. Dashboard/API Coverage Matrix generieren und als Audit-Datei pflegen.
5. E2E-Flows erweitern: Assistant Deep Matter, Case-aware Query, Contract
   Analysis, Matter Context Panel, Upload -> Extraction -> Query mit Quellen.
6. Full Browser Matrix stabilisieren: Chromium, Firefox, WebKit.

## Pruefstand

Nach der heutigen Aenderung:

- `bun run typecheck`: gruen.
- `bunx vitest run src/lib/matter-context-client.test.ts src/lib/matter-context.test.ts`:
  gruen, 140 Tests bestanden.

Teilweise blockiert:

- `bunx playwright test tests/e2e-playwright/smoke.spec.ts --project=chromium -g "think API returns SSE stream"`:
  fehlgeschlagen, bevor `/api/think` erreicht wurde. Ursache im lokalen
  Test-Setup: Signup liefert 500 wegen `SELF_SIGNED_CERT_IN_CHAIN` in der
  Postgres-Verbindung (`src/lib/auth/store.ts`).

Noch offen:

- Fokussierter E2E fuer Assistant/Think nach Korrektur der lokalen
  Test-DB/SSL-Konfiguration.
- Full-E2E ueber alle Browser/Projekte.
